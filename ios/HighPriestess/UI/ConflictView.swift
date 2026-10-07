import SwiftUI

/// Shown when a save slot changed on this iPhone and on another device since the last sync.
/// Side-by-side comparison (where, story progress, party, when), hints for the newer / further
/// copy, and a "Keep both" option. Whatever isn't kept stays in Save History (Settings).
struct ConflictView: View {
    @EnvironmentObject private var model: GameModel
    let conflict: SaveConflict

    private var local: SaveSummary { SaveSummary(json: conflict.localValue) }
    private var cloud: SaveSummary { SaveSummary(json: conflict.serverValue) }
    private var freeSlot: String? { model.sync.freeSlot(excluding: conflict.slot) }

    var body: some View {
        ScrollView {
            VStack(spacing: 16) {
                VStack(spacing: 6) {
                    if model.queuedConflicts > 0 {
                        Text("1 of \(model.queuedConflicts + 1)").font(.caption.weight(.semibold)).foregroundStyle(.secondary)
                    }
                    Text("\(conflict.slotName) changed on two devices")
                        .font(.system(.title3, design: .serif).weight(.semibold))
                        .multilineTextAlignment(.center)
                    Text("Pick the copy to continue with. The other one stays in Save History in Settings.")
                        .font(.subheadline).foregroundStyle(.secondary).multilineTextAlignment(.center)
                }
                .accessibilityElement(children: .combine)

                ViewThatFits(in: .horizontal) {
                    HStack(alignment: .top, spacing: 14) { cards }
                    VStack(spacing: 14) { cards }
                }

                if let slot = freeSlot {
                    Button {
                        model.resolve(conflict, .keepBoth(slot))
                    } label: {
                        Label("Keep both (other device's copy goes to Slot \((Int(slot) ?? 0) + 1))", systemImage: "square.on.square")
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.bordered)
                    .accessibilityHint("Keeps this iPhone's save here and copies the other device's save to an empty slot.")
                }
            }
            .padding(24)
        }
        .presentationDetents([.large])
    }

    @ViewBuilder private var cards: some View {
        card(title: "This iPhone", icon: "iphone", summary: local, other: cloud) { model.resolve(conflict, .keepLocal) }
        card(title: "Other device", icon: "icloud", summary: cloud, other: local) { model.resolve(conflict, .keepCloud) }
    }

    private func card(title: String, icon: String, summary s: SaveSummary, other: SaveSummary, action: @escaping () -> Void) -> some View {
        let newer = (s.when ?? .distantPast) > (other.when ?? .distantPast)
        let further = s.progressScore > other.progressScore
        return Button(action: action) {
            VStack(alignment: .leading, spacing: 8) {
                Label(title, systemImage: icon).font(.headline)
                HStack(spacing: 6) {
                    if newer { badge("Newer", "clock.fill") }
                    if further { badge("Further in story", "flag.fill") }
                }
                if let name = s.mapName { Text(name).font(.body.weight(.semibold)) }
                Text(s.progressText).font(.subheadline)
                if !s.party.isEmpty { Text(s.partyText).font(.subheadline).foregroundStyle(.secondary) }
                if let when = s.when {
                    Text("Saved \(when.formatted(.relative(presentation: .named)))")
                        .font(.footnote).foregroundStyle(.secondary)
                }
                Text("Keep \(title == "This iPhone" ? "this iPhone's" : "the other device's") save")
                    .font(.callout.weight(.semibold))
                    .frame(maxWidth: .infinity, minHeight: 44)
                    .background(Color.accentColor.opacity(0.18), in: RoundedRectangle(cornerRadius: 10))
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(14)
            .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 14))
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(title): \(s.mapName ?? "unknown place"), \(s.progressText)\(newer ? ", newer" : "")\(further ? ", further in the story" : "")")
        .accessibilityHint("Keeps this copy")
    }

    private func badge(_ text: String, _ icon: String) -> some View {
        Label(text, systemImage: icon)
            .font(.caption2.weight(.semibold))
            .padding(.horizontal, 8).padding(.vertical, 3)
            .background(Color.accentColor.opacity(0.25), in: Capsule())
    }
}

/// Settings > Save History: earlier copies of each slot kept on the server (last 10), restorable.
struct SaveHistoryView: View {
    @EnvironmentObject private var model: GameModel
    @State private var items: [String: [SyncClient.HistoryItem]] = [:]
    @State private var loading = true
    @State private var error: String?
    @State private var confirm: SyncClient.HistoryItem?
    @State private var message: String?

    var body: some View {
        List {
            if let error { Text(error).foregroundStyle(.secondary) }
            ForEach(SaveStore.slotIDs, id: \.self) { slot in
                Section(slot == "auto" ? "Suspend save" : "Slot \((Int(slot) ?? 0) + 1)") {
                    let list = items[slot] ?? []
                    if list.isEmpty {
                        Text(loading ? "Loading…" : "No earlier copies").foregroundStyle(.secondary)
                    }
                    ForEach(list) { item in
                        Button { confirm = item } label: { row(item) }
                            .foregroundStyle(.primary)
                    }
                }
            }
        }
        .navigationTitle("Save History")
        .task { await load() }
        .refreshable { await load() }
        .confirmationDialog("Restore this save?", isPresented: Binding(get: { confirm != nil }, set: { if !$0 { confirm = nil } }), titleVisibility: .visible, presenting: confirm) { item in
            Button("Restore") { Task { await restore(item) } }
        } message: { _ in
            Text("It becomes the current save for that slot on all your devices. The current copy moves into history.")
        }
        .alert(message ?? "", isPresented: Binding(get: { message != nil }, set: { if !$0 { message = nil } })) {
            Button("OK", role: .cancel) {}
        }
    }

    private func row(_ item: SyncClient.HistoryItem) -> some View {
        let s = item.summary
        let map = (s["mapName"] as? String) ?? (s["mapId"] as? String).map { SaveSummary.mapNames[$0] ?? $0 } ?? "Unknown place"
        let chapter = (s["chapter"] as? Int).map { "Chapter \($0 + 1)" }
        return VStack(alignment: .leading, spacing: 2) {
            Text(map).font(.body)
            Text([chapter, "replaced \(item.replacedAt.formatted(.relative(presentation: .named)))", item.thisDevice ? "from this iPhone" : "from another device"]
                    .compactMap { $0 }.joined(separator: " · "))
                .font(.footnote).foregroundStyle(.secondary)
        }
        .accessibilityElement(children: .combine)
    }

    private func load() async {
        loading = true
        defer { loading = false }
        var out: [String: [SyncClient.HistoryItem]] = [:]
        do {
            for slot in SaveStore.slotIDs { out[slot] = try await model.sync.history(slot: slot) }
            items = out
            error = nil
        } catch {
            self.error = "Couldn't reach the save server. Save History needs a connection."
        }
    }

    private func restore(_ item: SyncClient.HistoryItem) async {
        do {
            try await model.sync.restore(item)
            message = "Restored."
            await load()
        } catch {
            message = "Couldn't restore: \(error.localizedDescription)"
        }
    }
}
