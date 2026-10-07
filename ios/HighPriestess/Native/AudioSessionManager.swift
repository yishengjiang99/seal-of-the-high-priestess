import AVFoundation

/// Ambient by default (respects the silent switch, mixes with the user's music);
/// "Play sound in silent mode" switches to playback.
enum AudioSessionManager {
    static var playInSilentMode: Bool {
        get { UserDefaults.standard.bool(forKey: "playInSilentMode") }
        set { UserDefaults.standard.set(newValue, forKey: "playInSilentMode"); apply() }
    }

    static func apply() {
        let s = AVAudioSession.sharedInstance()
        do {
            if playInSilentMode {
                try s.setCategory(.playback, mode: .default, options: [.mixWithOthers])
            } else {
                try s.setCategory(.ambient, mode: .default, options: [])
            }
            try s.setActive(true)
        } catch {
            NSLog("audio session: \(error.localizedDescription)")
        }
    }
}
