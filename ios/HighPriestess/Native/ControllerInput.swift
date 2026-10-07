import CoreHaptics
import GameController

/// Physical game controllers (MFi / Xbox / PlayStation / Switch) and hardware keyboards.
/// Controllers map to the game's keyboard controls: d-pad/left stick = arrows, A = Z confirm,
/// B = X cancel, X = C camp, Y / shoulders / triggers = F skip, Menu = Esc, Options = Esc.
/// Polish: stick dead zone with hysteresis, held keys released when the app or a native sheet
/// takes over (no stuck movement), native sheets get B = close, the last-used input method is
/// reported to the game (Platform.input) and controller rumble mirrors haptics.
@MainActor
final class ControllerInput {
    enum Mode: String { case touch, gamepad, keyboard }

    typealias Send = (_ code: String, _ key: String, _ down: Bool) -> Void
    private let send: Send
    /// Returns true when a native sheet consumed the button (e.g. B closes Settings).
    var overlayButton: ((_ button: String) -> Bool)?
    var onModeChange: ((Mode, _ controllerName: String?) -> Void)?
    var hapticsEnabled: () -> Bool = { true }

    private var held: [String: String] = [:]   // code -> key currently down
    private var stickState: [String: Bool] = [:]
    private var observers: [NSObjectProtocol] = []
    private var engines: [ObjectIdentifier: CHHapticEngine] = [:]
    private(set) var connectedName: String?
    private(set) var mode: Mode = .touch

    init(send: @escaping Send) {
        self.send = send
        let nc = NotificationCenter.default
        observers.append(nc.addObserver(forName: .GCControllerDidConnect, object: nil, queue: .main) { [weak self] n in
            guard let c = n.object as? GCController else { return }
            MainActor.assumeIsolated { self?.configure(c); self?.setMode(.gamepad) }
        })
        observers.append(nc.addObserver(forName: .GCControllerDidDisconnect, object: nil, queue: .main) { [weak self] n in
            MainActor.assumeIsolated {
                guard let self else { return }
                if let c = n.object as? GCController { self.engines[ObjectIdentifier(c)] = nil }
                self.releaseAll()
                self.connectedName = GCController.controllers().first?.vendorName
                if GCController.controllers().isEmpty { self.setMode(GCKeyboard.coalesced != nil ? .keyboard : .touch) }
            }
        })
        observers.append(nc.addObserver(forName: .GCKeyboardDidConnect, object: nil, queue: .main) { [weak self] _ in
            MainActor.assumeIsolated { if self?.mode == .touch { self?.setMode(.keyboard) } }
        })
        observers.append(nc.addObserver(forName: .GCKeyboardDidDisconnect, object: nil, queue: .main) { [weak self] _ in
            MainActor.assumeIsolated { if self?.mode == .keyboard { self?.setMode(.touch) } }
        })
        GCController.shouldMonitorBackgroundEvents = false
        GCController.controllers().forEach(configure)
        if !GCController.controllers().isEmpty { mode = .gamepad } else if GCKeyboard.coalesced != nil { mode = .keyboard }
        GCController.startWirelessControllerDiscovery(completionHandler: nil)
    }

    /// The player touched the screen: on-screen controls are the active input again.
    func touched() { if mode != .touch { setMode(.touch) } }

    private func setMode(_ m: Mode) {
        mode = m
        onModeChange?(m, connectedName)
    }

    /// Key-ups for everything held (app inactive, sheet presented, controller lost).
    func releaseAll() {
        for (code, key) in held { send(code, key, false) }
        held.removeAll()
        stickState.removeAll()
    }

    private func emit(_ code: String, _ key: String, _ down: Bool) {
        if down {
            if mode != .gamepad { setMode(.gamepad) }
            held[code] = key
        } else {
            guard held.removeValue(forKey: code) != nil else { return }
        }
        send(code, key, down)
    }

    private func bind(_ button: GCControllerButtonInput?, _ code: String, _ key: String, overlay: String? = nil) {
        button?.pressedChangedHandler = { [weak self] _, _, pressed in
            MainActor.assumeIsolated {
                guard let self else { return }
                if pressed, let overlay, self.overlayButton?(overlay) == true { return }
                if pressed, self.overlayButton?("any") == true { return } // a native sheet is up: don't drive the game
                self.emit(code, key, pressed)
            }
        }
    }

    private func configure(_ c: GCController) {
        connectedName = c.vendorName
        c.handlerQueue = .main
        guard let g = c.extendedGamepad else {
            if let m = c.microGamepad { // Siri Remote-style
                bind(m.buttonA, "KeyZ", "z", overlay: "a")
                bind(m.buttonX, "KeyX", "x", overlay: "b")
                m.dpad.valueChangedHandler = { [weak self] _, x, y in MainActor.assumeIsolated { self?.stick(x: x, y: y) } }
            }
            return
        }
        bind(g.dpad.up, "ArrowUp", "ArrowUp")
        bind(g.dpad.down, "ArrowDown", "ArrowDown")
        bind(g.dpad.left, "ArrowLeft", "ArrowLeft")
        bind(g.dpad.right, "ArrowRight", "ArrowRight")
        bind(g.buttonA, "KeyZ", "z", overlay: "a")
        bind(g.buttonB, "KeyX", "x", overlay: "b")
        bind(g.buttonX, "KeyC", "c")
        bind(g.buttonY, "KeyF", "f")
        bind(g.leftShoulder, "KeyF", "f")
        bind(g.rightShoulder, "KeyF", "f")
        bind(g.leftTrigger, "KeyF", "f")
        bind(g.rightTrigger, "KeyF", "f")
        bind(g.buttonMenu, "Escape", "Escape", overlay: "menu")
        bind(g.buttonOptions, "Escape", "Escape", overlay: "menu")
        g.leftThumbstick.valueChangedHandler = { [weak self] _, x, y in
            MainActor.assumeIsolated { self?.stick(x: x, y: y) }
        }
    }

    /// Dead zone + hysteresis: an axis turns on past 0.55 and off below 0.35, so resting thumbs
    /// and worn sticks don't jitter. Directions are emitted as arrow keys.
    private func stick(x: Float, y: Float) {
        if overlayButton?("any") == true { return }
        func axis(_ code: String, _ v: Float) -> Bool {
            let on = stickState[code] ?? false
            return on ? v > 0.35 : v > 0.55
        }
        let want = ["ArrowUp": axis("ArrowUp", y), "ArrowDown": axis("ArrowDown", -y),
                    "ArrowLeft": axis("ArrowLeft", -x), "ArrowRight": axis("ArrowRight", x)]
        for (code, on) in want where (stickState[code] ?? false) != on {
            stickState[code] = on
            emit(code, code, on)
        }
    }

    /// Rumble on the current controller for strong haptic events (hit, unseal, hurt, victory).
    func rumble(_ kind: String) {
        guard hapticsEnabled(), mode == .gamepad, let c = GCController.current, let haptics = c.haptics else { return }
        let p: (intensity: Float, sharpness: Float, duration: Double)
        switch kind {
        case "hit", "flame": p = (0.7, 0.6, 0.12)
        case "unseal": p = (1.0, 0.3, 0.45)
        case "hurt": p = (0.6, 0.8, 0.18)
        case "victory": p = (0.5, 0.4, 0.3)
        default: return
        }
        let id = ObjectIdentifier(c)
        if engines[id] == nil, let e = haptics.createEngine(withLocality: .default) {
            e.isAutoShutdownEnabled = true
            engines[id] = e
        }
        guard let engine = engines[id] else { return }
        do {
            try engine.start()
            let event = CHHapticEvent(eventType: .hapticContinuous, parameters: [
                CHHapticEventParameter(parameterID: .hapticIntensity, value: p.intensity),
                CHHapticEventParameter(parameterID: .hapticSharpness, value: p.sharpness),
            ], relativeTime: 0, duration: p.duration)
            try engine.makePlayer(with: CHHapticPattern(events: [event], parameters: [])).start(atTime: CHHapticTimeImmediate)
        } catch {
            engines[id] = nil
        }
    }
}
