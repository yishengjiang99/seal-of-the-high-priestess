import GameController

/// MFi / Xbox / PlayStation controllers -> the game's keyboard controls
/// (d-pad/left stick = arrows, A = Z confirm, B = X cancel, X = C camp, Y/shoulders = F skip, Menu = Esc).
@MainActor
final class ControllerInput {
    typealias Send = (_ code: String, _ key: String, _ down: Bool) -> Void
    private let send: Send
    private var stickState: [String: Bool] = [:]
    private var observers: [NSObjectProtocol] = []
    private(set) var connectedName: String?

    init(send: @escaping Send) {
        self.send = send
        let nc = NotificationCenter.default
        observers.append(nc.addObserver(forName: .GCControllerDidConnect, object: nil, queue: .main) { [weak self] n in
            guard let c = n.object as? GCController else { return }
            MainActor.assumeIsolated { self?.configure(c) }
        })
        observers.append(nc.addObserver(forName: .GCControllerDidDisconnect, object: nil, queue: .main) { [weak self] _ in
            MainActor.assumeIsolated { self?.connectedName = GCController.controllers().first?.vendorName }
        })
        GCController.controllers().forEach(configure)
        GCController.startWirelessControllerDiscovery(completionHandler: nil)
    }

    private func bind(_ button: GCControllerButtonInput?, _ code: String, _ key: String) {
        button?.pressedChangedHandler = { [weak self] _, _, pressed in
            MainActor.assumeIsolated { self?.send(code, key, pressed) }
        }
    }

    private func configure(_ c: GCController) {
        connectedName = c.vendorName
        c.handlerQueue = .main
        guard let g = c.extendedGamepad else { return }
        bind(g.dpad.up, "ArrowUp", "ArrowUp")
        bind(g.dpad.down, "ArrowDown", "ArrowDown")
        bind(g.dpad.left, "ArrowLeft", "ArrowLeft")
        bind(g.dpad.right, "ArrowRight", "ArrowRight")
        bind(g.buttonA, "KeyZ", "z")
        bind(g.buttonB, "KeyX", "x")
        bind(g.buttonX, "KeyC", "c")
        bind(g.buttonY, "KeyF", "f")
        bind(g.leftShoulder, "KeyF", "f")
        bind(g.rightShoulder, "KeyF", "f")
        bind(g.buttonMenu, "Escape", "Escape")
        g.leftThumbstick.valueChangedHandler = { [weak self] _, x, y in
            MainActor.assumeIsolated { self?.stick(x: x, y: y) }
        }
    }

    private func stick(x: Float, y: Float) {
        let t: Float = 0.5
        let want = ["ArrowUp": y > t, "ArrowDown": y < -t, "ArrowLeft": x < -t, "ArrowRight": x > t]
        for (code, on) in want where (stickState[code] ?? false) != on {
            stickState[code] = on
            send(code, code, on)
        }
    }
}
