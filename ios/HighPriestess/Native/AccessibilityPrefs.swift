import UIKit

/// Accessibility preferences the game honours (see Platform.a11y in js/platform.js).
/// Stored in UserDefaults (Settings > Accessibility); Reduce Motion also follows the system switch.
enum AccessibilityPrefs {
    /// Dialogue text size steps -> multiplier on the game's subtitle font.
    struct Step: Identifiable, Equatable { let label: String; let scale: Double; var id: Double { scale } }
    static let subtitleSteps = [Step(label: "Default", scale: 1.0), Step(label: "Large", scale: 1.2),
                                Step(label: "Larger", scale: 1.4), Step(label: "Largest", scale: 1.7)]
    static let subtitleKey = "subtitleScale"
    static let reduceMotionKey = "reduceMotionGame"   // in-game override on top of the system setting
    static let colorCuesKey = "colorCues"

    /// Payload for `SOTH_HOST.a11y` / `Platform.call("a11y", …)`.
    nonisolated static func payload(defaults: UserDefaults = .standard, systemReduceMotion: Bool) -> [String: Any] {
        let scale = defaults.object(forKey: subtitleKey) as? Double ?? 1.0
        return [
            "subtitleScale": min(2.0, max(0.8, scale)),
            "reduceMotion": systemReduceMotion || defaults.bool(forKey: reduceMotionKey),
            "colorCues": defaults.bool(forKey: colorCuesKey),
        ]
    }

    @MainActor static var payload: [String: Any] {
        payload(systemReduceMotion: UIAccessibility.isReduceMotionEnabled)
    }
}
