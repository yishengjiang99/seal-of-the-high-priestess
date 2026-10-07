import SwiftUI
import WebKit

/// Owns the game web view and wires it to the native side: save store + cloud sync,
/// haptics, game controllers, audio session and app lifecycle (suspend save).
@MainActor
final class GameModel: NSObject, ObservableObject {
    @Published var webReady = false
    @Published var showSettings = false
    @Published var activeConflict: SaveConflict?
    @Published private(set) var syncStatus = ""
    @Published private(set) var contentStatus = ""

    let webView: WKWebView
    let store: SaveStore
    let sync: SyncClient
    let haptics = Haptics()
    private var controllers: ControllerInput?
    private var pendingConflicts: [SaveConflict] = []

    override init() {
        store = SaveStore()
        sync = SyncClient(store: store)
        let config = WebBundle.makeConfiguration()
        webView = WKWebView(frame: .zero, configuration: config)
        super.init()

        let ucc = config.userContentController
        ucc.add(ScriptHandler(self), name: "soth")
        ucc.addUserScript(WKUserScript(source: bootstrapScript(), injectionTime: .atDocumentStart, forMainFrameOnly: true))

        webView.isOpaque = false
        webView.backgroundColor = .black
        webView.scrollView.backgroundColor = .black
        webView.scrollView.isScrollEnabled = false
        webView.scrollView.bounces = false
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        webView.allowsLinkPreview = false
        webView.navigationDelegate = self
        #if DEBUG
        if #available(iOS 16.4, *) { webView.isInspectable = true }
        #endif

        AudioSessionManager.apply()
        controllers = ControllerInput { [weak self] code, key, down in self?.sendKey(code: code, key: key, down: down) }

        sync.onPulled = { [weak self] changes in self?.applyToWeb(changes) }
        sync.onConflicts = { [weak self] list in self?.enqueue(list) }
        sync.onStatus = { [weak self] in self?.refreshSyncStatus() }
        store.onChange = { [weak self] _ in self?.sync.scheduleSync() }
        refreshSyncStatus()

        webView.load(URLRequest(url: WebBundle.startURL))
        Task { await sync.sync() }
    }

    /// Runs before any page script: host info for js/platform.js + the native saves seeded into localStorage.
    private func bootstrapScript() -> String {
        let host: [String: Any] = [
            "platform": "ios",
            "appVersion": Bundle.main.appVersion,
            "assets": WebBundle.assetList(),
            "contentTimeoutMs": 1500,
        ]
        return """
        window.SOTH_HOST = \(Self.json(host));
        (function (seed) {
          try {
            for (var k in seed) {
              if (seed[k] === null) localStorage.removeItem(k); else localStorage.setItem(k, seed[k]);
            }
          } catch (e) {}
        })(\(Self.json(store.seed)));
        """
    }

    static func json(_ obj: Any) -> String {
        guard let d = try? JSONSerialization.data(withJSONObject: obj, options: [.fragmentsAllowed]),
              let s = String(data: d, encoding: .utf8) else { return "null" }
        return s.replacingOccurrences(of: "\u{2028}", with: "\\u2028").replacingOccurrences(of: "\u{2029}", with: "\\u2029")
    }

    // MARK: - Bridge (JS -> native)

    fileprivate func handle(_ body: Any) {
        guard let msg = body as? [String: Any], let type = msg["type"] as? String else { return }
        switch type {
        case "store":
            guard let key = msg["key"] as? String else { return }
            store.set(key, value: msg["value"] as? String)
        case "haptic":
            haptics.play(msg["kind"] as? String ?? "")
        case "event":
            if (msg["name"] as? String) == "battle_won" { sync.scheduleSync(after: 1) }
        default:
            break
        }
    }

    // MARK: - Native -> JS

    /// Pushes cloud values into localStorage and lets the title screen refresh "Continue".
    func applyToWeb(_ changes: [String: String]) {
        let js = """
        (function (c) {
          try { for (var k in c) localStorage.setItem(k, c[k]); } catch (e) {}
          if (window.Platform) Platform.call("savesChanged");
        })(\(Self.json(changes)));
        """
        webView.evaluateJavaScript(js, completionHandler: nil)
    }

    func sendKey(code: String, key: String, down: Bool) {
        let js = "window.dispatchEvent(new KeyboardEvent('\(down ? "keydown" : "keyup")', {code: '\(code)', key: '\(key)', bubbles: true}));"
        webView.evaluateJavaScript(js, completionHandler: nil)
    }

    func scenePhaseChanged(_ phase: ScenePhase) {
        switch phase {
        case .inactive, .background:
            // Suspend save while exploring, so iOS killing the app never loses progress.
            webView.evaluateJavaScript("window.Platform ? Platform.call('suspend') : null") { [weak self] result, _ in
                guard let self else { return }
                if let json = result as? String { self.store.set(SaveStore.slotKey("auto"), value: json) }
                if phase == .background { self.syncInBackground() }
            }
        case .active:
            AudioSessionManager.apply()
            Task { await sync.sync() }
        @unknown default:
            break
        }
    }

    private func syncInBackground() {
        guard sync.enabled, store.hasDirty else { return }
        var task = UIBackgroundTaskIdentifier.invalid
        task = UIApplication.shared.beginBackgroundTask(withName: "cloud-save") {
            UIApplication.shared.endBackgroundTask(task)
        }
        Task {
            await sync.sync()
            UIApplication.shared.endBackgroundTask(task)
        }
    }

    // MARK: - Conflicts / status

    private func enqueue(_ list: [SaveConflict]) {
        for c in list where !pendingConflicts.contains(where: { $0.slot == c.slot }) && activeConflict?.slot != c.slot {
            pendingConflicts.append(c)
        }
        if activeConflict == nil, !pendingConflicts.isEmpty { activeConflict = pendingConflicts.removeFirst() }
    }

    func resolve(_ c: SaveConflict, keepLocal: Bool) {
        activeConflict = nil
        Task {
            await sync.resolve(c, keepLocal: keepLocal)
            if !pendingConflicts.isEmpty { activeConflict = pendingConflicts.removeFirst() }
        }
    }

    func refreshSyncStatus() {
        if !sync.enabled { syncStatus = "Off. Saves stay on this iPhone." }
        else if let e = sync.lastError { syncStatus = e }
        else if let t = sync.lastSync { syncStatus = "Synced \(t.formatted(date: .omitted, time: .shortened))" }
        else { syncStatus = "Waiting to sync…" }
        objectWillChange.send()
    }

    func refreshContentStatus() {
        webView.evaluateJavaScript("window.SOTH_CONTENT ? JSON.stringify({s: SOTH_CONTENT.source, v: SOTH_CONTENT.version}) : ''") { [weak self] r, _ in
            guard let s = r as? String, let d = s.data(using: .utf8),
                  let o = try? JSONSerialization.jsonObject(with: d) as? [String: Any] else { return }
            let src = o["s"] as? String ?? "?"
            let v = (o["v"] as? Int).map { " v\($0)" } ?? ""
            self?.contentStatus = src + v
        }
    }
}

extension GameModel: WKNavigationDelegate {
    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        webReady = true
        DispatchQueue.main.asyncAfter(deadline: .now() + 2) { [weak self] in self?.refreshContentStatus() }
    }

    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction) async -> WKNavigationActionPolicy {
        guard let url = action.request.url else { return .cancel }
        if url.scheme == AppSchemeHandler.scheme || url.scheme == "about" { return .allow }
        if action.navigationType == .linkActivated, ["http", "https", "mailto"].contains(url.scheme ?? "") {
            await UIApplication.shared.open(url)
        }
        return .cancel
    }

    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        // Memory pressure killed the page: reload with fresh seeds from the native store.
        webView.configuration.userContentController.removeAllUserScripts()
        webView.configuration.userContentController.addUserScript(
            WKUserScript(source: bootstrapScript(), injectionTime: .atDocumentStart, forMainFrameOnly: true))
        webView.load(URLRequest(url: WebBundle.startURL))
    }
}

/// Weak trampoline so the user content controller doesn't retain the model.
private final class ScriptHandler: NSObject, WKScriptMessageHandler {
    weak var model: GameModel?
    init(_ model: GameModel) { self.model = model }
    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        let body = message.body
        MainActor.assumeIsolated { model?.handle(body) }
    }
}
