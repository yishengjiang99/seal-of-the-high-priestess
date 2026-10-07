import SwiftUI

struct SettingsView: View {
    @EnvironmentObject private var model: GameModel
    @EnvironmentObject private var storeKit: StoreManager
    @Environment(\.dismiss) private var dismiss
    @AppStorage("cloudSync") private var cloudSync = true
    @AppStorage("haptics") private var haptics = true
    @AppStorage("gameCenter") private var useGameCenter = true
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
                        NavigationLink("Save History") { SaveHistoryView().environmentObject(model) }
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
                    Text("Your saves back up to our server and follow your iCloud Keychain to a new iPhone. Saves on this iPhone are never deleted by sync. Save History keeps the last 10 replaced copies of each slot.")
                }

                Section {
                    if storeKit.entitlements.full {
                        LabeledContent("Full Game", value: "Unlocked")
                    } else {
                        Button("Unlock the Full Game…") { model.showPaywall("settings") }
                            .disabled(!model.paywallConfig.flag("paywall"))
                    }
                    if model.paywallConfig.flag("supporterPack") || storeKit.entitlements.supporter {
                        NavigationLink {
                            SupporterView().environmentObject(model).environmentObject(storeKit)
                        } label: {
                            LabeledContent(model.paywallConfig.supporterTitle, value: storeKit.entitlements.supporter ? "Thank you!" : "Optional")
                        }
                    }
                    Button("Restore Purchases") { Task { await storeKit.restore() } }
                        .disabled(storeKit.busy)
                } header: {
                    HStack {
                        Text("Purchases")
                        if storeKit.entitlements.supporter {
                            Label("Supporter", systemImage: "rosette").labelStyle(.titleAndIcon).foregroundStyle(.yellow)
                        }
                    }
                } footer: {
                    Text("The prologue and region 1 are free. The Full Game is a one-time purchase shared with Family Sharing. The Supporter Pack is cosmetic only.")
                }

                GameCenterSection(gameCenter: model.gameCenter, useGameCenter: $useGameCenter)

                Section("Sound & Feel") {
                    Toggle("Play sound in silent mode", isOn: $playInSilent)
                        .onChange(of: playInSilent) { _, v in AudioSessionManager.playInSilentMode = v }
                    Toggle("Haptics", isOn: $haptics)
                }

                Section {
                    LabeledContent("Using", value: model.inputMode == .gamepad ? (model.controllerName ?? "Controller")
                                   : model.inputMode == .keyboard ? "Keyboard" : "Touch")
                    LabeledContent("Controller", value: "Stick/D-pad move · A confirm · B cancel · X camp · Y/L/R skip · Menu")
                    LabeledContent("Keyboard", value: "Arrows/WASD · Z · X · C · F · Esc · ⌘, Settings")
                } header: {
                    Text("Controls")
                } footer: {
                    Text("Bluetooth controllers and keyboards work anywhere in the game. While a menu like this one is open, B closes it.")
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
            .alert(storeKit.message ?? "", isPresented: Binding(get: { storeKit.message != nil }, set: { if !$0 { storeKit.message = nil } })) {
                Button("OK", role: .cancel) {}
            }
            .navigationTitle("Settings")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } }
            }
            .confirmationDialog("Delete cloud data?", isPresented: $confirmDelete, titleVisibility: .visible) {
                Button("Delete from server", role: .destructive) { deleteCloud() }
            } message: {
                Text("This permanently removes your player ID, cloud saves, save history, settings and purchase records from our server and turns cloud save off. Saves on this iPhone stay, and purchases can be restored any time with Restore Purchases.")
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
                model.analytics.clear()
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

/// Settings > Game Center: optional sign-in, achievements, boss-time leaderboards.
private struct GameCenterSection: View {
    @ObservedObject var gameCenter: GameCenterManager
    @Binding var useGameCenter: Bool

    var body: some View {
        Section {
            Toggle("Use Game Center", isOn: $useGameCenter)
                .onChange(of: useGameCenter) { _, on in if on { Task { await gameCenter.flush() } } }
            if useGameCenter {
                if gameCenter.authenticated {
                    LabeledContent("Signed in", value: gameCenter.playerName ?? "Yes")
                    Button("Achievements") { gameCenter.showDashboard(.achievements) }
                    Button("Boss Times") { gameCenter.showDashboard(.leaderboards) }
                } else {
                    Button("Sign in to Game Center") { gameCenter.signIn() }
                }
            }
        } header: {
            Text("Game Center")
        } footer: {
            Text("Achievements and best boss times are kept on this iPhone and sent to Game Center once you're signed in. Optional.")
        }
    }
}
