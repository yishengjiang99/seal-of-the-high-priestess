import SwiftUI

struct SettingsView: View {
    @EnvironmentObject private var model: GameModel
    @Environment(\.dismiss) private var dismiss
    @AppStorage("cloudSync") private var cloudSync = true
    @AppStorage("haptics") private var haptics = true
    @State private var playInSilent = AudioSessionManager.playInSilentMode
    @State private var confirmDelete = false
    @State private var working = false
    @State private var message: String?

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Toggle("Cloud save", isOn: $cloudSync)
                        .onChange(of: cloudSync) { _, on in
                            model.refreshSyncStatus()
                            if on { Task { await model.sync.sync() } }
                        }
                    LabeledContent("Status", value: model.syncStatus)
                    if cloudSync {
                        Button("Sync now") { Task { await model.sync.sync() } }
                    }
                    if let id = model.sync.playerId {
                        LabeledContent("Player ID") {
                            Text(id).font(.caption.monospaced()).textSelection(.enabled)
                        }
                    }
                    Button("Delete cloud data", role: .destructive) { confirmDelete = true }
                        .disabled(working)
                } header: {
                    Text("Cloud Save")
                } footer: {
                    Text("Your saves back up to our server and follow your iCloud Keychain to a new iPhone. Saves on this iPhone are never deleted by sync.")
                }

                Section("Sound & Feel") {
                    Toggle("Play sound in silent mode", isOn: $playInSilent)
                        .onChange(of: playInSilent) { _, v in AudioSessionManager.playInSilentMode = v }
                    Toggle("Haptics", isOn: $haptics)
                }

                Section {
                    LabeledContent("Touch", value: "D-pad, Z confirm, X cancel, ☰ menu, ⛺ camp")
                    LabeledContent("Controller", value: "A confirm · B cancel · X camp · Menu")
                    LabeledContent("Keyboard", value: "Arrows/WASD · Z · X · Esc · C")
                } header: {
                    Text("Controls")
                }

                Section("About") {
                    LabeledContent("Version", value: Bundle.main.appVersion)
                    if !model.contentStatus.isEmpty {
                        LabeledContent("Game content", value: model.contentStatus)
                    }
                    Link("Support", destination: URL(string: "https://grepawk.com/high-priestess/support")!)
                    Link("Privacy Policy", destination: URL(string: "https://grepawk.com/high-priestess/privacy")!)
                    Link("Terms of Use", destination: URL(string: "https://grepawk.com/high-priestess/terms")!)
                    Text("Design inspiration: LinaHua (@Linahuaa). Voices generated with ElevenLabs.")
                        .font(.footnote).foregroundStyle(.secondary)
                }
            }
            .navigationTitle("Settings")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } }
            }
            .confirmationDialog("Delete cloud data?", isPresented: $confirmDelete, titleVisibility: .visible) {
                Button("Delete from server", role: .destructive) { deleteCloud() }
            } message: {
                Text("This permanently removes your player ID, cloud saves, save history and settings from our server and turns cloud save off. Saves on this iPhone stay.")
            }
            .alert(message ?? "", isPresented: Binding(get: { message != nil }, set: { if !$0 { message = nil } })) {
                Button("OK", role: .cancel) {}
            }
            .onAppear { model.refreshSyncStatus(); model.refreshContentStatus() }
        }
    }

    private func deleteCloud() {
        working = true
        Task {
            do {
                try await model.sync.deleteCloudData()
                cloudSync = false
                message = "Cloud data deleted."
            } catch {
                message = "Couldn't reach the server. Try again when you're online."
            }
            working = false
            model.refreshSyncStatus()
        }
    }
}
