import SwiftUI
import WebKit

/// Hosts the long-lived WKWebView owned by GameModel.
struct GameWebView: UIViewRepresentable {
    let webView: WKWebView
    func makeUIView(context: Context) -> WKWebView { webView }
    func updateUIView(_ uiView: WKWebView, context: Context) {}
}

enum WebBundle {
    /// HighPriestess.app/Web (index.html, js/, css/, assets/, audio/).
    static var root: URL {
        Bundle.main.url(forResource: "Web", withExtension: nil) ?? Bundle.main.bundleURL.appendingPathComponent("Web")
    }

    static let startURL = URL(string: "app://game/index.html")!

    /// Bundled image files ("assets/..."), the only asset references server-driven content may use.
    static func assetList(root: URL = WebBundle.root) -> [String] {
        let base = root.appendingPathComponent("assets")
        guard let e = FileManager.default.enumerator(at: base, includingPropertiesForKeys: [.isRegularFileKey]) else { return [] }
        var out: [String] = []
        let prefix = root.standardizedFileURL.path + "/"
        for case let url as URL in e {
            guard (try? url.resourceValues(forKeys: [.isRegularFileKey]))?.isRegularFile == true else { continue }
            let p = url.standardizedFileURL.path
            if p.hasPrefix(prefix) { out.append(String(p.dropFirst(prefix.count))) }
        }
        return out.sorted()
    }

    /// Configuration shared by the app and the tests: app:// scheme handler, inline/autoplay media.
    static func makeConfiguration(root: URL = WebBundle.root) -> WKWebViewConfiguration {
        let config = WKWebViewConfiguration()
        config.setURLSchemeHandler(AppSchemeHandler(root: root), forURLScheme: AppSchemeHandler.scheme)
        config.allowsInlineMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []
        config.suppressesIncrementalRendering = false
        return config
    }
}
