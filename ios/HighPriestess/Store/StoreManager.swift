import Foundation
import StoreKit

/// StoreKit 2 purchases: the non-consumable Full Game unlock (two price-test product ids, either
/// unlocks) and the cosmetic Supporter Pack. Entitlement = verified StoreKit entitlements on this
/// device OR the server's per-player entitlements (uploaded signed transactions; App Store Server
/// Notifications v2 revoke them on refund). Restore = AppStore.sync().
@MainActor
final class StoreManager: ObservableObject {
    nonisolated static let fullGameIDs = ["com.ragnus.weather.fullgame", "com.ragnus.weather.fullgame.b"]
    nonisolated static let supporterID = "com.ragnus.weather.supporter"
    nonisolated static let allIDs = ["com.ragnus.weather.fullgame", "com.ragnus.weather.fullgame.b", "com.ragnus.weather.supporter"]

    struct Entitlements: Equatable {
        var full = false
        var supporter = false
        var dictionary: [String: Any] { ["full": full, "supporter": supporter] }
    }

    @Published private(set) var products: [String: Product] = [:]
    @Published private(set) var owned: Set<String> = []
    @Published private(set) var server = Entitlements()
    @Published private(set) var busy = false
    @Published var message: String?

    /// Fired whenever the combined entitlements change.
    var onChange: ((Entitlements) -> Void)?
    var analytics: Analytics?

    private let api: APIClient
    private var updates: Task<Void, Never>?
    private var lastSent: Entitlements?

    var entitlements: Entitlements { Self.combine(owned: owned, server: server) }

    nonisolated static func combine(owned: Set<String>, server: Entitlements) -> Entitlements {
        Entitlements(full: server.full || !owned.isDisjoint(with: fullGameIDs),
                     supporter: server.supporter || owned.contains(supporterID))
    }

    /// Last known entitlements, so the game can gate correctly before StoreKit answers.
    static var cached: Entitlements {
        get {
            let d = UserDefaults.standard
            return Entitlements(full: d.bool(forKey: "ent.full"), supporter: d.bool(forKey: "ent.supporter"))
        }
        set {
            UserDefaults.standard.set(newValue.full, forKey: "ent.full")
            UserDefaults.standard.set(newValue.supporter, forKey: "ent.supporter")
        }
    }

    init(api: APIClient) {
        self.api = api
        lastSent = Self.cached // the page already starts with these (SOTH_HOST.entitlements)
        updates = Task { [weak self] in
            for await result in Transaction.updates {
                await self?.handle(result, placement: nil)
            }
        }
    }

    func start() {
        Task {
            await loadProducts()
            await refresh()
            await fetchServerEntitlements()
        }
    }

    func loadProducts() async {
        guard products.isEmpty else { return }
        if let list = try? await Product.products(for: Self.allIDs) {
            products = Dictionary(uniqueKeysWithValues: list.map { ($0.id, $0) })
        }
    }

    /// Re-reads StoreKit's current entitlements and uploads any transaction the server hasn't seen.
    func refresh() async {
        var ids = Set<String>()
        for await result in Transaction.currentEntitlements {
            guard case .verified(let t) = result, t.revocationDate == nil else { continue }
            ids.insert(t.productID)
            await upload(result)
        }
        owned = ids
        publish()
    }

    @discardableResult
    func purchase(_ productID: String, placement: String) async -> Bool {
        await loadProducts()
        guard let product = products[productID] else {
            message = "The App Store is unavailable right now. Please try again later."
            return false
        }
        busy = true
        defer { busy = false }
        var options: Set<Product.PurchaseOption> = []
        if let uuid = api.playerUUID {
            options.insert(.appAccountToken(uuid))
        } else if (try? await api.ensureToken()) != nil, let uuid = api.playerUUID {
            options.insert(.appAccountToken(uuid))
        }
        do {
            switch try await product.purchase(options: options) {
            case .success(let result):
                let ok = await handle(result, placement: placement)
                if !ok { message = "The purchase couldn't be verified." }
                return ok
            case .pending:
                message = "Your purchase is pending approval. It will unlock automatically."
                return false
            case .userCancelled:
                return false
            @unknown default:
                return false
            }
        } catch {
            message = "Purchase failed: \(error.localizedDescription)"
            return false
        }
    }

    func restore() async {
        busy = true
        defer { busy = false }
        do { try await AppStore.sync() } catch {
            if let e = error as? StoreKitError, case .userCancelled = e { return }
            message = "Couldn't reach the App Store: \(error.localizedDescription)"
        }
        await refresh()
        await fetchServerEntitlements()
        let e = entitlements
        analytics?.track("restore", ["full": e.full, "supporter": e.supporter])
        message = e.full || e.supporter ? "Purchases restored." : "No previous purchases found for this Apple Account."
    }

    @discardableResult
    private func handle(_ result: VerificationResult<Transaction>, placement: String?) async -> Bool {
        guard case .verified(let t) = result else { return false }
        if t.revocationDate == nil { owned.insert(t.productID) } else { owned.remove(t.productID) }
        await upload(result)
        await t.finish()
        if let placement, t.revocationDate == nil {
            analytics?.track("purchase", ["product": t.productID, "placement": placement])
        }
        publish()
        return t.revocationDate == nil
    }

    // MARK: - Server

    private var uploadedKey: String { "iap.uploaded.\(api.playerId ?? "-")" }

    /// POST the signed transaction (JWS) once per player; the server verifies the chain to Apple's root.
    private func upload(_ result: VerificationResult<Transaction>) async {
        guard case .verified(let t) = result else { return }
        var done = Set(UserDefaults.standard.stringArray(forKey: uploadedKey) ?? [])
        let id = String(t.id)
        guard !done.contains(id) || t.revocationDate != nil else { return }
        guard case let (code, obj)? = try? await api.authed("POST", "v1/iap/transactions", json: ["signedTransaction": result.jwsRepresentation]) else { return }
        if code == 200 || code == 201 {
            done.insert(id)
            UserDefaults.standard.set(Array(done), forKey: uploadedKey)
            applyServer(obj["entitlements"] as? [String: Any] ?? obj)
        }
    }

    func fetchServerEntitlements() async {
        guard case let (code, obj)? = try? await api.authed("GET", "v1/entitlements"), code == 200 else { return }
        applyServer(obj)
    }

    private func applyServer(_ obj: [String: Any]) {
        guard obj["full"] != nil || obj["supporter"] != nil else { return }
        server = Entitlements(full: obj["full"] as? Bool ?? false, supporter: obj["supporter"] as? Bool ?? false)
        publish()
    }

    private func publish() {
        let e = entitlements
        Self.cached = e
        guard e != lastSent else { return }
        lastSent = e
        onChange?(e)
    }

    // MARK: - Display

    func displayPrice(_ id: String) -> String? { products[id]?.displayPrice }
}
