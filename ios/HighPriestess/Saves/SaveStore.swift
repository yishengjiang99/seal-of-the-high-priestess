import Foundation

/// Native copy of the game's persistent keys (soth_slot_0/1/2/auto, soth_settings).
/// Source of truth on iOS: it seeds the web view's localStorage at document start, receives every
/// write the game makes (Platform.setItem -> "store" message) and tracks cloud sync state per key.
struct SaveEntry: Codable, Equatable {
    var value: String?
    /// Server revision this local value is based on (0 = never synced).
    var revision: Int
    /// Changed locally since the last successful sync.
    var dirty: Bool
    var updatedAt: Date
}

@MainActor
final class SaveStore {
    static let slotIDs = ["0", "1", "2", "auto"]
    static let settingsKey = "soth_settings"
    static func slotKey(_ slot: String) -> String { "soth_slot_" + slot }
    static var syncedKeys: [String] { slotIDs.map(slotKey) + [settingsKey] }

    private(set) var entries: [String: SaveEntry] = [:]
    let fileURL: URL
    var onChange: ((String) -> Void)?

    init(fileURL: URL? = nil) {
        if let fileURL {
            self.fileURL = fileURL
        } else {
            let dir = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
                .appendingPathComponent("HighPriestess", isDirectory: true)
            try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
            self.fileURL = dir.appendingPathComponent("saves.json")
        }
        if let data = try? Data(contentsOf: self.fileURL),
           let decoded = try? JSONDecoder().decode([String: SaveEntry].self, from: data) {
            entries = decoded
        }
    }

    func value(_ key: String) -> String? { entries[key]?.value }

    /// A write from the game.
    func set(_ key: String, value: String?) {
        guard key.hasPrefix("soth_"), key.count <= 64 else { return }
        if let e = entries[key], e.value == value { return }
        entries[key] = SaveEntry(value: value, revision: entries[key]?.revision ?? 0, dirty: true, updatedAt: Date())
        persist()
        onChange?(key)
    }

    /// The value now matches server revision `revision`.
    func markSynced(_ key: String, revision: Int, value: String?) {
        entries[key] = SaveEntry(value: value, revision: revision, dirty: false, updatedAt: entries[key]?.value == value ? (entries[key]?.updatedAt ?? Date()) : Date())
        persist()
    }

    /// After deleting cloud data / switching identity: everything local becomes unsynced.
    func resetSyncState() {
        for (k, e) in entries {
            entries[k] = SaveEntry(value: e.value, revision: 0, dirty: e.value != nil, updatedAt: e.updatedAt)
        }
        persist()
    }

    var hasDirty: Bool { entries.values.contains { $0.dirty } }

    /// key -> value or NSNull (delete), for seeding localStorage.
    var seed: [String: Any] {
        var out: [String: Any] = [:]
        for (k, e) in entries { out[k] = e.value ?? NSNull() }
        return out
    }

    private func persist() {
        do {
            let data = try JSONEncoder().encode(entries)
            try data.write(to: fileURL, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
        } catch {
            NSLog("SaveStore persist failed: \(error.localizedDescription)")
        }
    }
}

/// Human summary of a save JSON ({when, mapId, ...}) for conflict prompts and the server list.
struct SaveSummary: Equatable {
    var when: Date?
    var mapId: String?
    var playTime: Double?

    init(json: String?) {
        guard let json, let data = json.data(using: .utf8),
              let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return }
        if let w = obj["when"] as? Double { when = Date(timeIntervalSince1970: w / 1000) }
        mapId = obj["mapId"] as? String
        playTime = obj["playTime"] as? Double
    }

    var dictionary: [String: Any] {
        var d: [String: Any] = [:]
        if let when { d["when"] = Int(when.timeIntervalSince1970 * 1000) }
        if let mapId { d["mapId"] = mapId }
        return d
    }

    var text: String {
        var parts: [String] = []
        if let when { parts.append(when.formatted(date: .abbreviated, time: .shortened)) }
        if let mapId { parts.append(mapId.replacingOccurrences(of: "_", with: " ").capitalized) }
        return parts.isEmpty ? "Unknown save" : parts.joined(separator: " · ")
    }
}
