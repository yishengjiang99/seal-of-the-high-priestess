import AVFoundation
import SwiftUI

/// Optional cosmetic Supporter Pack: Voice Gallery + alternate app icon + badge. No gameplay effect.
struct SupporterView: View {
    @EnvironmentObject private var model: GameModel
    @EnvironmentObject private var store: StoreManager
    @State private var iconName = UIApplication.shared.alternateIconName

    var body: some View {
        Form {
            Section {
                Text(model.paywallConfig.supporterBody).font(.callout)
                ForEach(model.paywallConfig.supporterBullets, id: \.self) { b in
                    Label(b, systemImage: "heart.fill").font(.callout).symbolRenderingMode(.hierarchical)
                }
                if store.entitlements.supporter {
                    Label("Thank you, Supporter!", systemImage: "rosette").foregroundStyle(.yellow)
                } else {
                    Button {
                        Task { await store.purchase(StoreManager.supporterID, placement: "supporter") }
                    } label: {
                        Text(store.displayPrice(StoreManager.supporterID).map { "Become a Supporter · \($0)" } ?? "Connecting to the App Store…")
                    }
                    .disabled(store.busy || store.displayPrice(StoreManager.supporterID) == nil)
                }
            }
            if store.entitlements.supporter {
                if model.paywallConfig.flag("voiceGallery") {
                    Section {
                        NavigationLink("Voice Gallery") { VoiceGalleryView() }
                    } footer: {
                        Text("Contains lines from the whole story, including later regions.")
                    }
                }
                Section("App Icon") {
                    Picker("App Icon", selection: Binding(get: { iconName ?? "" }, set: { setIcon($0.isEmpty ? nil : $0) })) {
                        Text("Elara (default)").tag("")
                        Text("Kael, unchained").tag("AppIconKael")
                    }
                    .pickerStyle(.inline)
                    .labelsHidden()
                }
            }
        }
        .navigationTitle(model.paywallConfig.supporterTitle)
    }

    private func setIcon(_ name: String?) {
        guard UIApplication.shared.supportsAlternateIcons else { return }
        UIApplication.shared.setAlternateIconName(name) { err in
            if err == nil { iconName = name }
        }
    }
}

/// Replays the bundled voice clips (audio/voice/index.json -> per-scene manifest.json).
struct VoiceGalleryView: View {
    struct Line: Identifiable { let id: String; let speaker: String; let text: String; let file: URL }
    struct VoiceScene: Identifiable { let id: String; let title: String; let lines: [Line] }

    @State private var scenes: [VoiceScene] = []
    @State private var player: AVAudioPlayer?
    @State private var playing: String?

    var body: some View {
        List(scenes) { scene in
            Section(scene.title) {
                ForEach(scene.lines) { line in
                    Button { play(line) } label: {
                        HStack(alignment: .top) {
                            Image(systemName: playing == line.id ? "speaker.wave.2.fill" : "play.circle")
                            VStack(alignment: .leading) {
                                Text(line.speaker.capitalized).font(.caption).foregroundStyle(.secondary)
                                Text(line.text).font(.callout)
                            }
                        }
                    }
                    .foregroundStyle(.primary)
                }
            }
        }
        .navigationTitle("Voice Gallery")
        .onAppear { if scenes.isEmpty { scenes = Self.load() } }
        .onDisappear { player?.stop() }
    }

    private func play(_ line: Line) {
        player?.stop()
        player = try? AVAudioPlayer(contentsOf: line.file)
        player?.play()
        playing = line.id
    }

    nonisolated static func load(root: URL = WebBundle.root) -> [VoiceScene] {
        let voice = root.appendingPathComponent("audio/voice")
        guard let idx = (try? Data(contentsOf: voice.appendingPathComponent("index.json")))
                .flatMap({ try? JSONSerialization.jsonObject(with: $0) as? [String: Any] }),
              let bundles = idx["bundles"] as? [String: [String: Any]] else { return [] }
        return bundles.keys.sorted().compactMap { name in
            guard let rel = bundles[name]?["manifest"] as? String else { return nil }
            let manifestURL = voice.appendingPathComponent(rel)
            guard let m = (try? Data(contentsOf: manifestURL)).flatMap({ try? JSONSerialization.jsonObject(with: $0) as? [String: Any] }),
                  let lines = m["lines"] as? [String: [String: Any]] else { return nil }
            let dir = manifestURL.deletingLastPathComponent()
            let list: [Line] = lines.keys.sorted().compactMap { key in
                guard let l = lines[key], let file = l["file"] as? String else { return nil }
                return Line(id: name + "/" + key, speaker: l["speaker"] as? String ?? "", text: l["text"] as? String ?? "",
                            file: dir.appendingPathComponent(file))
            }
            let title = name.replacingOccurrences(of: "scene-", with: "").replacingOccurrences(of: "_", with: " ").capitalized
            return list.isEmpty ? nil : VoiceScene(id: name, title: title, lines: list)
        }
    }
}
