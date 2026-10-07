import SwiftUI

/// Shown when a save slot changed on this iPhone and on another device since the last sync.
struct ConflictView: View {
    @EnvironmentObject private var model: GameModel
    let conflict: SaveConflict

    var body: some View {
        VStack(spacing: 18) {
            Text("\(conflict.slotName) changed on another device")
                .font(.system(.title3, design: .serif).weight(.semibold))
                .multilineTextAlignment(.center)
            Text("Choose which save to keep. The other copy stays in the cloud history.")
                .font(.subheadline).foregroundStyle(.secondary).multilineTextAlignment(.center)
            HStack(spacing: 16) {
                choice(title: "This iPhone", icon: "iphone", summary: SaveSummary(json: conflict.localValue)) {
                    model.resolve(conflict, keepLocal: true)
                }
                choice(title: "Cloud", icon: "icloud", summary: SaveSummary(json: conflict.serverValue)) {
                    model.resolve(conflict, keepLocal: false)
                }
            }
        }
        .padding(24)
        .presentationDetents([.medium, .large])
    }

    private func choice(title: String, icon: String, summary: SaveSummary, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            VStack(spacing: 8) {
                Image(systemName: icon).font(.title2)
                Text("Keep \(title)").font(.headline)
                Text(summary.text).font(.caption).foregroundStyle(.secondary).multilineTextAlignment(.center)
            }
            .frame(maxWidth: .infinity, minHeight: 110)
            .padding(12)
            .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 14))
        }
        .buttonStyle(.plain)
    }
}
