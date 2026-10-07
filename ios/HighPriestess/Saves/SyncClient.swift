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
