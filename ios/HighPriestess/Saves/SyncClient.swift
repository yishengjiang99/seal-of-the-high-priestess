import Foundation

/// A slot that changed both here and on another device since the last sync.
struct SaveConflict: Identifiable, Equatable {
    let slot: String
    let localValue: String
    let serverValue: String
    let serverRevision: Int
    var id: String { slot }
    var slotName: String { slot == "auto" ? "Suspend save" : "Slot \((Int(slot) ?? 0) + 1)" }
}

/// Cloud save sync against the temple API (see server/README.md); HTTP via APIClient.
/// Per-slot optimistic concurrency: PUT with If-Match <revision>; 409 returns the server copy.
@MainActor
final class SyncClient {
    enum SyncError: Error { case unauthorized, http(Int), badResponse }

    let api: APIClient
    let store: SaveStore
    private var running = false
    private var again = false
    private var debounce: Task<Void, Never>?

    var enabled: Bool {
        get { UserDefaults.standard.object(forKey: "cloudSync") as? Bool ?? true }
        set { UserDefaults.standard.set(newValue, forKey: "cloudSync") }
    }
    var playerId: String? { api.playerId }
    private(set) var lastSync: Date?
    private(set) var lastError: String?

    /// Values pulled from the cloud that the web view must pick up (key -> value).
    var onPulled: (([String: String]) -> Void)?
    var onConflicts: (([SaveConflict]) -> Void)?
    var onStatus: (() -> Void)?

    init(store: SaveStore, api: APIClient) {
        self.store = store
        self.api = api
    }

    func scheduleSync(after seconds: Double = 3) {
        guard enabled else { return }
        debounce?.cancel()
        debounce = Task { [weak self] in
            try? await Task.sleep(nanoseconds: UInt64(seconds * 1_000_000_000))
            guard !Task.isCancelled else { return }
            await self?.sync()
        }
    }

    func sync() async {
        guard enabled else { return }
        if running { again = true; return }
        running = true
        defer {
            running = false
            if again { again = false; Task { await self.sync() } }
        }
        do {
            do { try await syncOnce() } catch SyncError.unauthorized {
                Identity.token = nil
                try await syncOnce()
            }
            lastSync = Date()
            lastError = nil
        } catch {
            lastError = (error as? URLError)?.localizedDescription ?? "Sync failed (\(error))"
        }
        onStatus?()
    }

    private func syncOnce() async throws {
        let token = try await ensureToken()
        let remote = try await listSaves(token)
        var pulled: [String: String] = [:]
        var conflicts: [SaveConflict] = []
        for slot in SaveStore.slotIDs {
            let key = SaveStore.slotKey(slot)
            let local = store.entries[key]
            let r = remote[slot]
            if let local, local.dirty, let value = local.value {
                switch try await putSave(token, slot: slot, data: value, ifMatch: local.revision) {
                case .ok(let rev):
                    store.markSynced(key, revision: rev, value: value)
                case .conflict(let serverRev, let serverData):
                    if serverData == value {
                        store.markSynced(key, revision: serverRev, value: value)
                    } else if slot == "auto" {
                        // Suspend saves resolve themselves: the newer one wins, no prompt.
                        let mine = SaveSummary(json: value).when ?? .distantPast
                        let theirs = SaveSummary(json: serverData).when ?? .distantPast
                        if mine >= theirs {
                            if case .ok(let rev) = try await putSave(token, slot: slot, data: value, ifMatch: serverRev) {
                                store.markSynced(key, revision: rev, value: value)
                            }
                        } else {
                            store.markSynced(key, revision: serverRev, value: serverData)
                            pulled[key] = serverData
                        }
                    } else {
                        conflicts.append(SaveConflict(slot: slot, localValue: value, serverValue: serverData, serverRevision: serverRev))
                    }
                }
            } else if let r, r > (local?.revision ?? 0) {
                if case let (rev, data)? = try await getSave(token, slot: slot) {
                    store.markSynced(key, revision: rev, value: data)
                    pulled[key] = data
                }
            }
        }
        // Settings: last write wins; a fresh install adopts the cloud copy.
        let sk = SaveStore.settingsKey
        if let s = store.entries[sk], s.dirty, let v = s.value {
            try await send("PUT", "v1/settings", token: token, json: ["data": v])
            store.markSynced(sk, revision: 1, value: v)
        } else if store.entries[sk]?.value == nil {
            if case let (code, obj)? = try? await send("GET", "v1/settings", token: token), code == 200, let v = obj["data"] as? String {
                store.markSynced(sk, revision: 1, value: v)
                pulled[sk] = v
            }
        }
        if !pulled.isEmpty { onPulled?(pulled) }
        if !conflicts.isEmpty { onConflicts?(conflicts) }
    }

    enum Resolution { case keepLocal, keepCloud, keepBoth(String) }

    /// First empty manual slot (0-2) on this device, for "Keep both".
    func freeSlot(excluding slot: String) -> String? {
        ["0", "1", "2"].first { $0 != slot && store.value(SaveStore.slotKey($0)) == nil }
    }

    /// Conflict resolution. Whatever isn't kept stays recoverable in the server's save history.
    func resolve(_ c: SaveConflict, _ how: Resolution) async {
        switch how {
        case .keepLocal:
            await resolve(c, keepLocal: true)
        case .keepCloud:
            // Park this iPhone's copy in server history first (PUT it, then put the cloud copy back on top).
            let key = SaveStore.slotKey(c.slot)
            if let token = try? await ensureToken(),
               case .ok(let r1)? = try? await putSave(token, slot: c.slot, data: c.localValue, ifMatch: c.serverRevision),
               case .ok(let r2)? = try? await putSave(token, slot: c.slot, data: c.serverValue, ifMatch: r1) {
                store.markSynced(key, revision: r2, value: c.serverValue)
                onPulled?([key: c.serverValue])
                onStatus?()
            } else {
                await resolve(c, keepLocal: false)
            }
        case .keepBoth(let other):
            // The cloud copy moves to an empty slot on this iPhone; this iPhone's copy stays in place.
            store.set(SaveStore.slotKey(other), value: c.serverValue)
            onPulled?([SaveStore.slotKey(other): c.serverValue])
            await resolve(c, keepLocal: true)
        }
    }

    // MARK: - Save history (server keeps the 10 most recent replaced copies per slot)

    struct HistoryItem: Identifiable, Equatable {
        let slot: String
        let revision: Int
        let summary: [String: Any]
        let replacedAt: Date
        let thisDevice: Bool
        var id: String { "\(slot)-\(revision)-\(replacedAt.timeIntervalSince1970)" }
        static func == (a: HistoryItem, b: HistoryItem) -> Bool { a.id == b.id }
    }

    func history(slot: String) async throws -> [HistoryItem] {
        let token = try await ensureToken()
        let (code, obj) = try await send("GET", "v1/saves/\(slot)/history", token: token)
        guard code == 200, let list = obj["history"] as? [[String: Any]] else { throw SyncError.http(code) }
        return list.compactMap { h in
            guard let rev = h["revision"] as? Int else { return nil }
            let at = (h["replacedAt"] as? Double).map { Date(timeIntervalSince1970: $0 / 1000) } ?? .distantPast
            return HistoryItem(slot: slot, revision: rev, summary: h["summary"] as? [String: Any] ?? [:], replacedAt: at,
                               thisDevice: h["thisDevice"] as? Bool ?? false)
        }
    }

    /// Puts an earlier copy back as the current save (the current one moves into history).
    func restore(_ item: HistoryItem) async throws {
        let token = try await ensureToken()
        let (code, obj) = try await send("GET", "v1/saves/\(item.slot)/history/\(item.revision)", token: token)
        guard code == 200, let data = obj["data"] as? String else { throw SyncError.http(code) }
        let current = try await listSaves(token)[item.slot] ?? 0
        guard case .ok(let rev) = try await putSave(token, slot: item.slot, data: data, ifMatch: current) else { throw SyncError.badResponse }
        let key = SaveStore.slotKey(item.slot)
        store.markSynced(key, revision: rev, value: data)
        onPulled?([key: data])
        onStatus?()
    }

    /// User picked a side in a conflict.
    func resolve(_ c: SaveConflict, keepLocal: Bool) async {
        let key = SaveStore.slotKey(c.slot)
        if keepLocal {
            do {
                let token = try await ensureToken()
                if case .ok(let rev) = try await putSave(token, slot: c.slot, data: c.localValue, ifMatch: c.serverRevision) {
                    store.markSynced(key, revision: rev, value: c.localValue)
                }
            } catch {
                lastError = "Couldn't upload: \(error.localizedDescription)"
            }
            await sync()
        } else {
            store.markSynced(key, revision: c.serverRevision, value: c.serverValue)
            onPulled?([key: c.serverValue])
        }
        onStatus?()
    }

    /// Deletes everything on the server, then starts a fresh identity with sync off.
    func deleteCloudData() async throws {
        if Identity.token != nil || playerId != nil {
            let token = try await ensureToken()
            let (code, _) = try await send("DELETE", "v1/me", token: token)
            guard code == 200 || code == 204 else { throw SyncError.http(code) }
        }
        api.reset()
        enabled = false
        store.resetSyncState()
        lastSync = nil
        onStatus?()
    }

    // MARK: - HTTP

    private func ensureToken() async throws -> String { try await api.ensureToken() }

    @discardableResult
    private func send(_ method: String, _ path: String, token: String?, json: [String: Any]? = nil,
                      headers: [String: String] = [:]) async throws -> (Int, [String: Any]) {
        do {
            return try await api.send(method, path, token: token, json: json, headers: headers)
        } catch APIClient.APIError.unauthorized {
            throw SyncError.unauthorized
        }
    }

    private func listSaves(_ token: String) async throws -> [String: Int] {
        let (code, obj) = try await send("GET", "v1/saves", token: token)
        guard code == 200, let saves = obj["saves"] as? [[String: Any]] else { throw SyncError.http(code) }
        var out: [String: Int] = [:]
        for s in saves { if let slot = s["slot"] as? String, let rev = s["revision"] as? Int { out[slot] = rev } }
        return out
    }

    private func getSave(_ token: String, slot: String) async throws -> (Int, String)? {
        let (code, obj) = try await send("GET", "v1/saves/\(slot)", token: token)
        if code == 404 { return nil }
        guard code == 200, let rev = obj["revision"] as? Int, let data = obj["data"] as? String else { throw SyncError.http(code) }
        return (rev, data)
    }

    enum PutResult { case ok(Int), conflict(Int, String) }

    private func putSave(_ token: String, slot: String, data: String, ifMatch: Int) async throws -> PutResult {
        let body: [String: Any] = [
            "data": data,
            "summary": SaveSummary(json: data).dictionary,
            "gameVersion": Bundle.main.appVersion,
            "clientUpdatedAt": Int((store.entries[SaveStore.slotKey(slot)]?.updatedAt ?? Date()).timeIntervalSince1970 * 1000),
        ]
        let (code, obj) = try await send("PUT", "v1/saves/\(slot)", token: token, json: body, headers: ["If-Match": String(ifMatch)])
        switch code {
        case 200:
            guard let rev = obj["revision"] as? Int else { throw SyncError.badResponse }
            return .ok(rev)
        case 409:
            let server = obj["server"] as? [String: Any] ?? [:]
            let rev = server["revision"] as? Int ?? 0
            guard let d = server["data"] as? String else {
                // Slot was emptied on the server: retry against revision 0.
                if rev == 0 && ifMatch != 0 { return try await putSave(token, slot: slot, data: data, ifMatch: 0) }
                throw SyncError.badResponse
            }
            return .conflict(rev, d)
        default:
            throw SyncError.http(code)
        }
    }
}
