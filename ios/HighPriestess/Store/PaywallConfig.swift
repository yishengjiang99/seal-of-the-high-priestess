import Foundation

/// Paywall copy/art/placement/offer from server-driven content (window.PAYWALL + window.FLAGS,
/// relayed by js/content-loader.js as the "content" event). Prices are never server-driven: they
/// come from StoreKit's Product.displayPrice. The server only chooses WHICH Full Game product id
/// (price test) is offered.
struct PaywallConfig {
    struct Variant { let product: String; let weight: Int }

    var offer = StoreManager.fullGameIDs[0]
    var variants: [Variant] = []
    var placements: [String: Bool] = ["region1_end": true, "menu": true]
    var regionCompleteFlags: [String: String] = ["hollow_oak_dead": "region1"]
    var title = "The Seal Holds. For Now."
    var subtitle = ""
    var body = ""
    var bullets: [String] = []
    var cta = "Unlock the Full Game"
    var art = "assets/backgrounds/title.jpg"
    var supporterTitle = "Supporter Pack"
    var supporterBody = ""
    var supporterBullets: [String] = []
    var flags: [String: Any] = [:]

    init() {}

    init(paywall: [String: Any]?, flags: [String: Any]?) {
        self.flags = flags ?? [:]
        guard let p = paywall else { return }
        if let o = p["offer"] as? String, StoreManager.fullGameIDs.contains(o) { offer = o }
        variants = (p["offerVariants"] as? [[String: Any]] ?? []).compactMap { v in
            guard let id = v["product"] as? String, StoreManager.fullGameIDs.contains(id) else { return nil }
            return Variant(product: id, weight: max(0, (v["weight"] as? NSNumber)?.intValue ?? 0))
        }
        if let pl = p["placements"] as? [String: Any] {
            for (k, v) in pl {
                if let b = v as? Bool { placements[k] = b }
                else if let d = v as? [String: Any] { placements[k] = d["enabled"] as? Bool ?? true }
            }
        }
        if let r = p["regionCompleteFlags"] as? [String: String] { regionCompleteFlags = r }
        if let c = p["copy"] as? [String: Any] {
            title = c["title"] as? String ?? title
            subtitle = c["subtitle"] as? String ?? subtitle
            body = c["body"] as? String ?? body
            bullets = c["bullets"] as? [String] ?? bullets
            cta = c["cta"] as? String ?? cta
            art = c["art"] as? String ?? art
        }
        if let s = p["supporter"] as? [String: Any] {
            supporterTitle = s["title"] as? String ?? supporterTitle
            supporterBody = s["body"] as? String ?? supporterBody
            supporterBullets = s["bullets"] as? [String] ?? supporterBullets
        }
    }

    func flag(_ name: String, default def: Bool = true) -> Bool { flags[name] as? Bool ?? def }

    /// Price-test arm. Sandbox (TestFlight / App Review / Xcode) always gets the default Full Game
    /// product ($4.99) so review is deterministic; FLAGS.priceTest=false turns the split off.
    func priceArm(bucketKey: String, environment: String) -> (product: String, variant: String) {
        if environment != "production" { return (StoreManager.fullGameIDs[0], "review") }
        if !flag("priceTest", default: false) { return (offer, "default") }
        return offeredProduct(bucketKey: bucketKey)
    }

    /// Identifies the split, so a changed split re-buckets but an unchanged one never does.
    var splitSignature: String { variants.map { "\($0.product)=\($0.weight)" }.joined(separator: ",") }

    /// Full Game product for a bucket key (the player ID): a stable weighted bucket over
    /// offerVariants (FNV-1a), else `offer`.
    func offeredProduct(bucketKey: String) -> (product: String, variant: String) {
        let total = variants.reduce(0) { $0 + $1.weight }
        guard total > 0 else { return (offer, "default") }
        var h: UInt32 = 2_166_136_261
        for b in bucketKey.utf8 { h = (h ^ UInt32(b)) &* 16_777_619 }
        var n = Int(h % UInt32(total))
        for (i, v) in variants.enumerated() {
            if n < v.weight { return (v.product, "v\(i)") }
            n -= v.weight
        }
        return (offer, "default")
    }
}
