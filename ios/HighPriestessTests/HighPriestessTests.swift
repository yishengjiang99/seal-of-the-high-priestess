import WebKit
import XCTest
@testable import HighPriestess

final class SchemeHandlerTests: XCTestCase {
    func testParseRange() {
        XCTAssertEqual(AppSchemeHandler.parseRange("bytes=0-99", count: 1000), 0..<100)
        XCTAssertEqual(AppSchemeHandler.parseRange("bytes=900-", count: 1000), 900..<1000)
        XCTAssertEqual(AppSchemeHandler.parseRange("bytes=-100", count: 1000), 900..<1000)
        XCTAssertEqual(AppSchemeHandler.parseRange("bytes=0-5000", count: 1000), 0..<1000)
        XCTAssertNil(AppSchemeHandler.parseRange("bytes=2000-", count: 1000))
        XCTAssertNil(AppSchemeHandler.parseRange("items=0-1", count: 1000))
    }

    func testServesBundledGameAndRejectsTraversal() throws {
        let h = AppSchemeHandler(root: WebBundle.root)
        let (status, headers, body) = h.response(for: URL(string: "app://game/index.html")!, range: nil)
        XCTAssertEqual(status, 200)
        XCTAssertEqual(headers["Content-Type"], "text/html; charset=utf-8")
        XCTAssertTrue(String(decoding: body, as: UTF8.self).contains("Temple of the High Priestess"))
        XCTAssertEqual(h.response(for: URL(string: "app://game/../Info.plist")!, range: nil).0, 404)
        XCTAssertEqual(h.response(for: URL(string: "app://game/js/nope.js")!, range: nil).0, 404)
        let partial = h.response(for: URL(string: "app://game/index.html")!, range: "bytes=0-9")
        XCTAssertEqual(partial.0, 206)
        XCTAssertEqual(partial.2.count, 10)
    }

    func testBundleHasGameButNotReferenceArt() {
        let fm = FileManager.default
        for f in ["index.html", "js/game.js", "js/platform.js", "js/content-loader.js", "css/game.css", "audio/voice/index.json"] {
            XCTAssertTrue(fm.fileExists(atPath: WebBundle.root.appendingPathComponent(f).path), f)
        }
        XCTAssertFalse(fm.fileExists(atPath: WebBundle.root.appendingPathComponent("assets/lina-ref.jpg").path))
        XCTAssertFalse(WebBundle.assetList().isEmpty)
        XCTAssertTrue(WebBundle.assetList().allSatisfy { $0.hasPrefix("assets/") })
    }
}

@MainActor
final class SaveStoreTests: XCTestCase {
    func testDirtyTrackingSeedAndPersistence() throws {
        let url = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString + ".json")
        let s = SaveStore(fileURL: url)
        var changed: [String] = []
        s.onChange = { changed.append($0) }
        s.set("soth_slot_0", value: #"{"when":1700000000000,"mapId":"temple"}"#)
        s.set("soth_slot_0", value: #"{"when":1700000000000,"mapId":"temple"}"#) // no-op
        s.set("not_ours", value: "x")
        XCTAssertEqual(changed, ["soth_slot_0"])
        XCTAssertTrue(s.entries["soth_slot_0"]!.dirty)
        s.markSynced("soth_slot_0", revision: 3, value: s.value("soth_slot_0"))
        XCTAssertFalse(s.hasDirty)
        let reloaded = SaveStore(fileURL: url)
        XCTAssertEqual(reloaded.entries["soth_slot_0"]?.revision, 3)
        reloaded.resetSyncState()
        XCTAssertEqual(reloaded.entries["soth_slot_0"]?.revision, 0)
        XCTAssertTrue(reloaded.hasDirty)
        XCTAssertEqual(SaveSummary(json: s.value("soth_slot_0")).mapId, "temple")
    }
}

/// Boots the real game in a WKWebView from the bundle via app:// and checks the engine started.
@MainActor
final class WebGameBootTests: XCTestCase {
    func testGameBootsOffline() async throws {
        let config = WebBundle.makeConfiguration()
        config.userContentController.addUserScript(WKUserScript(
            source: "window.SOTH_HOST = {platform: 'ios-test', assets: \(GameModel.json(WebBundle.assetList())), contentURL: 'app://game/__no_content__'};",
            injectionTime: .atDocumentStart, forMainFrameOnly: true))
        let web = WKWebView(frame: CGRect(x: 0, y: 0, width: 932, height: 430), configuration: config)
        web.load(URLRequest(url: WebBundle.startURL))
        var state = ""
        for _ in 0..<60 {
            try await Task.sleep(nanoseconds: 500_000_000)
            let r = try? await web.evaluateJavaScript("""
              JSON.stringify({
                content: window.SOTH_CONTENT ? SOTH_CONTENT.source : null,
                native: window.Platform ? Platform.name : null,
                engine: !!document.querySelector('script[src*="game.js"]'),
                title: document.title
              })
            """)
            state = r as? String ?? ""
            if state.contains("\"engine\":true") && state.contains("\"content\":\"bundled\"") { break }
        }
        print("web state:", state)
        XCTAssertTrue(state.contains("\"engine\":true"), state)
        XCTAssertTrue(state.contains("\"content\":\"bundled\""), state) // no server reachable -> bundled snapshot
        XCTAssertTrue(state.contains("Temple of the High Priestess"), state)
    }
}
