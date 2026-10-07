import CryptoKit
import StoreKit
import StoreKitTest
import WebKit
import XCTest
@testable import HighPriestess

final class ContentSigningTests: XCTestCase {
    private func envelope(_ payload: String, key: Curve25519.Signing.PrivateKey, kid: String = "t1") throws -> Data {
        let sig = try key.signature(for: Data(payload.utf8))
        return try JSONSerialization.data(withJSONObject: [
            "schema": 2, "kid": kid, "alg": "Ed25519", "payload": payload, "sig": sig.base64EncodedString(),
        ])
    }

    func testVerifiesSignedEnvelopeAndRejectsTampering() throws {
        let key = Curve25519.Signing.PrivateKey()
        let keys = ["t1": key.publicKey.rawRepresentation.base64EncodedString()]
        let payload = #"{"schema":2,"version":3,"have":"abc","overrides":{}}"#
        let good = try envelope(payload, key: key)
        XCTAssertTrue(ContentService.verify(good, keys: keys))

        var obj = try XCTUnwrap(JSONSerialization.jsonObject(with: good) as? [String: Any])
        obj["payload"] = payload.replacingOccurrences(of: "\"version\":3", with: "\"version\":4")
        XCTAssertFalse(ContentService.verify(try JSONSerialization.data(withJSONObject: obj), keys: keys))

        let forged = try envelope(payload, key: Curve25519.Signing.PrivateKey())
        XCTAssertFalse(ContentService.verify(forged, keys: keys))
        XCTAssertFalse(ContentService.verify(try envelope(payload, key: key, kid: "nope"), keys: keys))
        XCTAssertFalse(ContentService.verify(Data("{}".utf8), keys: keys))
    }

    /// The native and web verifiers must trust the same keys.
    func testContentKeysMatchWebBundle() throws {
        let js = try String(contentsOf: WebBundle.root.appendingPathComponent("js/content-keys.js"), encoding: .utf8)
        XCTAssertFalse(ContentKeys.keys.isEmpty)
        for (kid, key) in ContentKeys.keys {
            XCTAssertTrue(js.contains("\(kid): \"\(key)\""), "js/content-keys.js lacks \(kid)")
            XCTAssertEqual(Data(base64Encoded: key)?.count, 32)
        }
    }

    /// Live server (skipped when offline): the published envelope verifies against the bundled key.
    func testLiveServerEnvelopeVerifies() async throws {
        let dir = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        let svc = ContentService(cacheDir: dir, timeout: 10)
        guard let r = await svc.load(have: "test") else { throw XCTSkip("content server unreachable") }
        XCTAssertEqual(r.source, "remote")
        XCTAssertTrue(ContentService.verify(r.body))
        // Second load is served from the verified cache when offline-ish (same have) or remote again.
        let again = await svc.load(have: "test")
        XCTAssertNotNil(again)
    }
}

@MainActor
final class PaywallConfigTests: XCTestCase {
    func testParsesServerConfigAndBucketsStably() {
        let cfg = PaywallConfig(paywall: [
            "offer": "com.ragnus.weather.fullgame",
            "offerVariants": [["product": "com.ragnus.weather.fullgame", "weight": 500],
                              ["product": "com.ragnus.weather.fullgame.b", "weight": 500],
                              ["product": "com.evil.other", "weight": 1000]],
            "placements": ["region1_end": ["enabled": true], "menu": ["enabled": false]],
            "copy": ["title": "T", "cta": "Buy"],
        ], flags: ["paywall": true, "voiceGallery": false])
        XCTAssertEqual(cfg.variants.count, 2) // unknown product ids are dropped
        XCTAssertEqual(cfg.placements["menu"], false)
        XCTAssertEqual(cfg.title, "T")
        XCTAssertFalse(cfg.flag("voiceGallery"))
        XCTAssertTrue(cfg.flag("supporterPack"))
        var seen = Set<String>()
        for i in 0..<200 {
            let a = cfg.offeredProduct(bucketKey: "install-\(i)")
            XCTAssertEqual(a.product, cfg.offeredProduct(bucketKey: "install-\(i)").product)
            seen.insert(a.product)
        }
        XCTAssertEqual(seen, Set(StoreManager.fullGameIDs))
        XCTAssertEqual(PaywallConfig(paywall: ["offer": "com.ragnus.weather.fullgame.b"], flags: nil).offeredProduct(bucketKey: "x").product,
                       "com.ragnus.weather.fullgame.b")
    }

    func testEntitlementsCombine() {
        XCTAssertFalse(StoreManager.combine(owned: [], server: .init()).full)
        XCTAssertTrue(StoreManager.combine(owned: ["com.ragnus.weather.fullgame.b"], server: .init()).full)
        XCTAssertTrue(StoreManager.combine(owned: [], server: .init(full: true, supporter: false)).full)
        let s = StoreManager.combine(owned: [StoreManager.supporterID], server: .init())
        XCTAssertTrue(s.supporter)
        XCTAssertFalse(s.full) // cosmetic only
    }

    func testVoiceGalleryReadsBundledManifests() {
        let scenes = VoiceGalleryView.load()
        XCTAssertGreaterThan(scenes.count, 10)
        let line = scenes.first?.lines.first
        XCTAssertNotNil(line)
        if let line { XCTAssertTrue(FileManager.default.fileExists(atPath: line.file.path), line.file.path) }
    }
}

/// StoreKit 2 against the local Products.storekit configuration.
@MainActor
final class StoreKitTests: XCTestCase {
    func testProductsAndFullGamePurchase() async throws {
        let session = try SKTestSession(configurationFileNamed: "Products")
        session.resetToDefaultState()
        session.disableDialogs = true
        session.clearTransactions()

        let products = try await Product.products(for: StoreManager.allIDs)
        XCTAssertEqual(Set(products.map(\.id)), Set(StoreManager.allIDs))
        for p in products {
            XCTAssertEqual(p.type, .nonConsumable)
            XCTAssertTrue(p.isFamilyShareable, p.id)
        }
        let full = try XCTUnwrap(products.first { $0.id == StoreManager.fullGameIDs[0] })
        let token = UUID()
        let result = try await full.purchase(options: [.appAccountToken(token)])
        guard case .success(.verified(let t)) = result else { return XCTFail("purchase failed: \(result)") }
        XCTAssertEqual(t.appAccountToken, token)
        await t.finish()

        var owned = Set<String>()
        for await r in Transaction.currentEntitlements {
            if case .verified(let tx) = r { owned.insert(tx.productID) }
        }
        XCTAssertTrue(StoreManager.combine(owned: owned, server: .init()).full)
        XCTAssertFalse(StoreManager.combine(owned: owned, server: .init()).supporter)

        // Refund -> StoreKit drops the entitlement.
        try session.refundTransaction(identifier: UInt(t.id))
        var stillFull = true
        for _ in 0..<10 where stillFull {
            var after = Set<String>()
            for await r in Transaction.currentEntitlements {
                if case .verified(let tx) = r, tx.revocationDate == nil { after.insert(tx.productID) }
            }
            stillFull = StoreManager.combine(owned: after, server: .init()).full
            if stillFull { try await Task.sleep(nanoseconds: 300_000_000) }
        }
        XCTAssertFalse(stillFull, "refund should revoke the Full Game")
    }
}

/// Boots the game through the native content proxy (app://game/__content -> server, CryptoKit-verified).
@MainActor
final class NativeContentBootTests: XCTestCase {
    func testGameBootsWithSignedServerContent() async throws {
        let online = await ContentService(cacheDir: FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString), timeout: 10)
            .load(have: "probe") != nil
        let config = WebBundle.makeConfiguration()
        let host: [String: Any] = [
            "platform": "ios-test", "assets": WebBundle.assetList(),
            "contentURL": "app://game/__content", "contentVerified": true, "contentCache": false, "contentTimeoutMs": 8000,
        ]
        config.userContentController.addUserScript(WKUserScript(
            source: "window.SOTH_HOST = \(GameModel.json(host));", injectionTime: .atDocumentStart, forMainFrameOnly: true))
        let web = WKWebView(frame: CGRect(x: 0, y: 0, width: 932, height: 430), configuration: config)
        web.load(URLRequest(url: WebBundle.startURL))
        var state = ""
        for _ in 0..<60 {
            try await Task.sleep(nanoseconds: 500_000_000)
            let r = try? await web.evaluateJavaScript("""
              JSON.stringify({
                content: window.SOTH_CONTENT ? SOTH_CONTENT.source : null,
                engine: !!document.querySelector('script[src*="game.js"]'),
                paywall: !!(window.PAYWALL && PAYWALL.gatedMaps && PAYWALL.gatedMaps.indexOf('wilderness') >= 0),
                flags: !!window.FLAGS
              })
            """)
            state = r as? String ?? ""
            if state.contains("\"engine\":true") { break }
        }
        print("native content state:", state, "online:", online)
        XCTAssertTrue(state.contains("\"engine\":true"), state)
        XCTAssertTrue(state.contains("\"paywall\":true"), state)
        XCTAssertTrue(state.contains("\"flags\":true"), state)
        if online { XCTAssertTrue(state.contains("\"content\":\"remote\""), state) }
    }
}
