import Foundation

/// Shared HTTP client for https://grepawk.com/high-priestess/api: device identity (Keychain) ->
/// bearer token, JSON in/out. Used by cloud saves, purchases and first-party funnel events.
@MainActor
final class APIClient {
    static let defaultBase = URL(string: "https://grepawk.com/high-priestess/api")!

    enum APIError: Error { case unauthorized, http(Int), badResponse }

    let base: URL
    private let session: URLSession
    private var pendingToken: Task<String, Error>?

    var playerId: String? {
        get { UserDefaults.standard.string(forKey: "playerId") }
        set { UserDefaults.standard.set(newValue, forKey: "playerId") }
    }

    /// Player id as a UUID, used as the StoreKit appAccountToken so App Store notifications
    /// (refunds) map back to the player on the server.
    var playerUUID: UUID? { playerId.flatMap(UUID.init(uuidString:)) }

    init(base: URL = APIClient.defaultBase) {
        self.base = base
        let cfg = URLSessionConfiguration.default
        cfg.timeoutIntervalForRequest = 15
        cfg.waitsForConnectivity = false
        cfg.httpAdditionalHeaders = ["User-Agent": "HighPriestess-iOS/\(Bundle.main.appVersion)"]
        session = URLSession(configuration: cfg)
    }

    /// Registers this install (or reuses the stored token). Concurrent callers share one request.
    func ensureToken() async throws -> String {
        if let t = Identity.token { return t }
        if let p = pendingToken { return try await p.value }
        let task = Task { () throws -> String in
            let inst = Identity.install()
            let (code, obj) = try await self.send("POST", "v1/auth/device", token: nil,
                                                  json: ["installId": inst.installId, "secret": inst.secret, "appVersion": Bundle.main.appVersion])
            guard code == 200 || code == 201, let token = obj["token"] as? String else {
                if code == 403 { Identity.rotate() } // someone else's install id; start over next time
                throw APIError.http(code)
            }
            Identity.token = token
            self.playerId = obj["playerId"] as? String
            return token
        }
        pendingToken = task
        defer { pendingToken = nil }
        return try await task.value
    }

    /// Authenticated request; a stale token is dropped and the call retried once.
    @discardableResult
    func authed(_ method: String, _ path: String, json: Any? = nil, headers: [String: String] = [:]) async throws -> (Int, [String: Any]) {
        do {
            return try await send(method, path, token: try await ensureToken(), json: json, headers: headers)
        } catch APIError.unauthorized {
            Identity.token = nil
            return try await send(method, path, token: try await ensureToken(), json: json, headers: headers)
        }
    }

    @discardableResult
    func send(_ method: String, _ path: String, token: String?, json: Any? = nil,
              headers: [String: String] = [:]) async throws -> (Int, [String: Any]) {
        var req = URLRequest(url: base.appendingPathComponent(path))
        req.httpMethod = method
        if let token { req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization") }
        for (k, v) in headers { req.setValue(v, forHTTPHeaderField: k) }
        if let json {
            req.setValue("application/json", forHTTPHeaderField: "Content-Type")
            req.httpBody = try JSONSerialization.data(withJSONObject: json)
        }
        let (data, resp) = try await session.data(for: req)
        guard let http = resp as? HTTPURLResponse else { throw APIError.badResponse }
        if http.statusCode == 401 && token != nil { throw APIError.unauthorized }
        let obj = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] ?? [:]
        return (http.statusCode, obj)
    }

    /// Forget the identity (after the server-side delete).
    func reset() {
        Identity.rotate()
        playerId = nil
    }
}

extension Bundle {
    var appVersion: String {
        let v = infoDictionary?["CFBundleShortVersionString"] as? String ?? "?"
        let b = infoDictionary?["CFBundleVersion"] as? String ?? "?"
        return "\(v) (\(b))"
    }
}
