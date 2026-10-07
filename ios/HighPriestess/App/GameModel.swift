import SwiftUI
import WebKit

struct PaywallRequest: Identifiable, Equatable {
    let placement: String
    var id: String { placement }
}

/// Owns the game web view and wires it to the native side: save store + cloud sync,
/// purchases (StoreKit 2) + paywall, first-party funnel events, haptics, game controllers,
/// audio session and app lifecycle (suspend save).
@MainActor
final class GameModel: NSObject, ObservableObject {
    @Published var webReady = false
    @Published var showSettings = false {
        didSet { if showSettings { controllers?.releaseAll() } }
    }
    @Published var activeConflict: SaveConflict?
    @Published private(set) var syncStatus = ""
    @Published private(set) var contentStatus = ""
    @Published var paywall: PaywallRequest? {
        didSet { if paywall != nil { controllers?.releaseAll() } }
    }
    /// Shown in Settings > Controls.
    @Published private(set) var inputMode = ControllerInput.Mode.touch
    @Published private(set) var controllerName: String?
    @Published private(set) var paywallConfig = PaywallConfig()

    let webView: WKWebView
    let api: APIClient
    let store: SaveStore
    let sync: SyncClient
    let storeKit: StoreManager
    let analytics: Analytics
    /// -paywallDemo: show the paywall on launch (App Review screenshot of the IAP).
    let paywallDemo = ProcessInfo.processInfo.arguments.contains("-paywallDemo")
    let haptics = Haptics()
    let gameCenter = GameCenterManager()
    private(set) var controllers: ControllerInput?
    private var pendingConflicts: [SaveConflict] = []

    override init() {
        store = SaveStore()
        api = APIClient()
        sync = SyncClient(store: store, api: api)
        storeKit = StoreManager(api: api)
        analytics = Analytics(api: api)
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
        setUpControllers()
        gameCenter.authenticate()

        sync.onPulled = { [weak self] changes in self?.applyToWeb(changes) }
        sync.onConflicts = { [weak self] list in self?.enqueue(list) }
        sync.onStatus = { [weak self] in self?.refreshSyncStatus() }
        store.onChange = { [weak self] _ in self?.sync.scheduleSync() }
        storeKit.analytics = analytics
        storeKit.onChange = { [weak self] e in self?.pushEntitlements(e) }
        refreshSyncStatus()

        webView.load(URLRequest(url: WebBundle.startURL))
        Task { await sync.sync() }
        storeKit.start()
        analytics.scheduleFlush(after: 8)
    }

    /// Runs before any page script: host info for js/platform.js + the native saves seeded into localStorage.
    private func bootstrapScript() -> String {
        let host: [String: Any] = [
            "platform": "ios",
            "appVersion": Bundle.main.appVersion,
            "assets": WebBundle.assetList(),
            // Content goes through the native proxy (CryptoKit-verified, cached in Application Support).
            "contentURL": "\(AppSchemeHandler.scheme)://game\(AppSchemeHandler.contentPath)",
            "contentVerified": true,
            "contentCache": false,
            "contentTimeoutMs": 2500,
            "entitlements": StoreManager.cached.dictionary,
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
            let kind = msg["kind"] as? String ?? ""
            haptics.play(kind)
            controllers?.rumble(kind)
        case "event":
            let data = msg["data"] as? [String: Any]
            switch msg["name"] as? String {
            case "battle_won":
                sync.scheduleSync(after: 1)
                if let r = GameCenterManager.BattleResult(data) { gameCenter.battle(r) }
            case "progress":
                if let flags = data?["flags"] as? [String: Any] {
                    gameCenter.progress(flags.compactMap { k, v in Self.truthy(v) ? k : nil })
                }
            case "content":
                paywallConfig = PaywallConfig(paywall: data?["PAYWALL"] as? [String: Any], flags: data?["FLAGS"] as? [String: Any])
                analytics.enabled = paywallConfig.flag("funnelEvents")
                if let names = data?["mapNames"] as? [String: String] { SaveSummary.mapNames = names }
                if paywallDemo { showPaywall("region1_end") }
            case "flag":
                if let k = data?["k"] as? String, let region = paywallConfig.regionCompleteFlags[k] {
                    analytics.regionComplete(region)
                }
                if let k = data?["k"] as? String, Self.truthy(data?["v"]) { gameCenter.flag(k) }
            default:
                break
            }
        case "paywall":
            showPaywall(msg["placement"] as? String ?? "menu")
        default:
            break
        }
    }

    nonisolated static func truthy(_ v: Any?) -> Bool {
        switch v {
        case let b as Bool: return b
        case let n as NSNumber: return n.doubleValue != 0
        case let s as String: return !s.isEmpty
        case nil, is NSNull: return false
        default: return true
        }
    }

    // MARK: - Controllers / keyboards

    private func setUpControllers() {
        let c = ControllerInput { [weak self] code, key, down in self?.sendKey(code: code, key: key, down: down) }
        c.hapticsEnabled = { [weak self] in self?.haptics.enabled ?? false }
        c.onModeChange = { [weak self] mode, name in
            guard let self else { return }
            inputMode = mode
            controllerName = name
            pushInputMode()
        }
        // While a native sheet is up the controller drives it (B closes), not the game underneath.
        c.overlayButton = { [weak self] button in
            guard let self else { return false }
            let sheetUp = showSettings || paywall != nil || activeConflict != nil
            guard sheetUp else { return false }
            if button == "b" || button == "menu" {
                if showSettings { showSettings = false }
                else if paywall != nil, !storeKit.busy { paywall = nil }  // never mid-purchase
            }
            return true
        }
        inputMode = c.mode
        controllerName = c.connectedName
        controllers = c
    }

    /// Tells the game which input is active so it can show matching prompts (class on <html> only).
    func pushInputMode() {
        let info: [String: Any] = ["mode": inputMode.rawValue, "controller": controllerName ?? NSNull()]
        webView.evaluateJavaScript("window.Platform ? Platform.call('inputMode', \(Self.json(info))) : null", completionHandler: nil)
    }

    /// The web view should own hardware-keyboard focus whenever no native sheet is up.
    func focusGame() {
        guard !showSettings, paywall == nil, activeConflict == nil else { return }
        if !webView.isFirstResponder { webView.becomeFirstResponder() }
    }

    // MARK: - Purchases

    /// Full Game product id offered to this player (server price test; price itself from StoreKit).
    var offeredFullGame: String { priceArm.product }

    /// Stable price-test arm: hash of the player ID (install ID until the first server contact),
    /// remembered per split so a player never switches arms mid-test.
    var priceArm: (product: String, variant: String) {
        let env = StoreManager.environment
        guard env == "production", paywallConfig.flag("priceTest", default: false), !paywallConfig.variants.isEmpty else {
            return paywallConfig.priceArm(bucketKey: "", environment: env)
        }
        let d = UserDefaults.standard
        let sig = paywallConfig.splitSignature
        if d.string(forKey: "priceArm.split") == sig, let p = d.string(forKey: "priceArm.product"),
           let v = d.string(forKey: "priceArm.variant"), StoreManager.fullGameIDs.contains(p) {
            return (p, v)
        }
        let arm = paywallConfig.priceArm(bucketKey: api.playerId ?? Identity.install().installId, environment: env)
        d.set(sig, forKey: "priceArm.split")
        d.set(arm.product, forKey: "priceArm.product")
        d.set(arm.variant, forKey: "priceArm.variant")
        return arm
    }

    func showPaywall(_ placement: String) {
        guard paywallDemo || (paywallConfig.flag("paywall") && !storeKit.entitlements.full) else { return }
        guard paywall == nil else { return }
        let offer = priceArm
        if !paywallDemo {
            analytics.track("paywall_shown", ["placement": placement, "product": offer.product, "variant": offer.variant,
                                              "env": StoreManager.environment])
        }
        let req = PaywallRequest(placement: placement)
        if showSettings {
            // Let the settings sheet finish dismissing before covering the screen.
            showSettings = false
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.6) { [weak self] in self?.paywall = req }
        } else {
            paywall = req
        }
    }

    func purchaseFullGame(placement: String) async {
        let arm = priceArm
        await storeKit.purchase(arm.product, placement: placement, context: ["variant": arm.variant])
    }

    private func pushEntitlements(_ e: StoreManager.Entitlements) {
        webView.evaluateJavaScript("window.Platform ? Platform.call('entitlements', \(Self.json(e.dictionary))) : null", completionHandler: nil)
        objectWillChange.send()
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
            controllers?.releaseAll()
            // Suspend save while exploring, so iOS killing the app never loses progress.
            webView.evaluateJavaScript("window.Platform ? Platform.call('suspend') : null") { [weak self] result, _ in
                guard let self else { return }
                if let json = result as? String { self.store.set(SaveStore.slotKey("auto"), value: json) }
                if phase == .background { self.syncInBackground(); Task { await self.analytics.flush() } }
            }
        case .active:
            AudioSessionManager.apply()
            Task { await gameCenter.flush() }
            focusGame()
            Task { await sync.sync() }
            Task { await storeKit.fetchServerEntitlements() }
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

    /// Conflicts still waiting behind the one on screen.
    var queuedConflicts: Int { pendingConflicts.count }

    func resolve(_ c: SaveConflict, _ how: SyncClient.Resolution) {
        activeConflict = nil
        Task {
            await sync.resolve(c, how)
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
        pushInputMode()
        focusGame()
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
