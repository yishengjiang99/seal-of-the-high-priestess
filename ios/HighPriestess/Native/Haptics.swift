import UIKit

/// Maps the game's sfx kinds (Platform.haptic) to Taptic Engine feedback.
@MainActor
final class Haptics {
    private let selection = UISelectionFeedbackGenerator()
    private let light = UIImpactFeedbackGenerator(style: .light)
    private let soft = UIImpactFeedbackGenerator(style: .soft)
    private let heavy = UIImpactFeedbackGenerator(style: .heavy)
    private let notify = UINotificationFeedbackGenerator()
    private var lastUI: CFTimeInterval = 0

    var enabled: Bool { UserDefaults.standard.object(forKey: "haptics") as? Bool ?? true }

    func play(_ kind: String) {
        guard enabled else { return }
        switch kind {
        case "ui":
            let now = CACurrentMediaTime()
            guard now - lastUI > 0.06 else { return }
            lastUI = now
            selection.selectionChanged()
        case "ok": light.impactOccurred()
        case "cancel": light.impactOccurred(intensity: 0.5)
        case "hit", "flame": heavy.impactOccurred(intensity: 0.8)
        case "unseal": heavy.impactOccurred(intensity: 1)
        case "hurt": notify.notificationOccurred(.warning)
        case "heal", "petal": soft.impactOccurred()
        case "save", "victory": notify.notificationOccurred(.success)
        default: break
        }
    }
}
