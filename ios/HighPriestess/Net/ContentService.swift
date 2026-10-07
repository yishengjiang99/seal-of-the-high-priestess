import CryptoKit
import Foundation

/// Native side of server-driven content. The page asks app://game/__content?have=<hash>&schema=2;
/// this fetches the signed envelope from the server, verifies the Ed25519 signature with CryptoKit,
/// keeps the last good envelope in Application Support and falls back to it when offline.
/// The page then trusts it (SOTH_HOST.contentVerified) and skips its own WebCrypto check + cache.
final class ContentService: @unchecked Sendable {
    static let shared = ContentService()
    static let remote = URL(string: "https://grepawk.com/high-priestess/api/v1/content")!

    struct Result { let body: Data; let source: String }

    private let session: URLSession
    private let cacheDir: URL
    private let lock = NSLock()

    init(cacheDir: URL? = nil, timeout: TimeInterval = 1.5) {
        let cfg = URLSessionConfiguration.ephemeral
        cfg.timeoutIntervalForRequest = timeout
        cfg.timeoutIntervalForResource = timeout + 0.5
        cfg.waitsForConnectivity = false
        cfg.requestCachePolicy = .reloadIgnoringLocalCacheData
        cfg.httpAdditionalHeaders = ["User-Agent": "HighPriestess-iOS/\(Bundle.main.appVersion)"]
        session = URLSession(configuration: cfg)
        let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        self.cacheDir = cacheDir ?? base.appendingPathComponent("content", isDirectory: true)
    }

    private var envelopeFile: URL { cacheDir.appendingPathComponent("envelope.json") }
    private var metaFile: URL { cacheDir.appendingPathComponent("meta.json") }

    /// Envelope for this bundle hash: verified remote copy, else verified cached copy, else nil.
    func load(have: String) async -> Result? {
        let cached = readCache(have: have)
        var comps = URLComponents(url: Self.remote, resolvingAgainstBaseURL: false)!
        comps.queryItems = [URLQueryItem(name: "have", value: have), URLQueryItem(name: "schema", value: "2")]
        var req = URLRequest(url: comps.url!)
        if let etag = cached?.etag { req.setValue(etag, forHTTPHeaderField: "If-None-Match") }
        if case let (data, resp)? = try? await session.data(for: req), let http = resp as? HTTPURLResponse {
            if http.statusCode == 304, let cached { return Result(body: cached.body, source: "remote") }
            if http.statusCode == 200, Self.verify(data) {
                writeCache(data, have: have, etag: http.value(forHTTPHeaderField: "ETag"))
                return Result(body: data, source: "remote")
            }
        }
        if let cached { return Result(body: cached.body, source: "cache") }
        return nil
    }

    /// Checks an envelope {schema:2, kid, alg:"Ed25519", payload, sig} against ContentKeys.
    static func verify(_ data: Data, keys: [String: String] = ContentKeys.keys) -> Bool {
        guard let env = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any],
              env["schema"] as? Int == 2, env["alg"] as? String == "Ed25519",
              let kid = env["kid"] as? String, let keyB64 = keys[kid],
              let keyData = Data(base64Encoded: keyB64),
              let key = try? Curve25519.Signing.PublicKey(rawRepresentation: keyData),
              let payload = env["payload"] as? String,
              let sigB64 = env["sig"] as? String, let sig = Data(base64Encoded: sigB64) else { return false }
        return key.isValidSignature(sig, for: Data(payload.utf8))
    }

    private func readCache(have: String) -> (body: Data, etag: String?)? {
        lock.lock(); defer { lock.unlock() }
        guard let meta = (try? Data(contentsOf: metaFile)).flatMap({ try? JSONSerialization.jsonObject(with: $0) as? [String: String] }),
              meta["have"] == have, let body = try? Data(contentsOf: envelopeFile), Self.verify(body) else { return nil }
        return (body, meta["etag"])
    }

    private func writeCache(_ body: Data, have: String, etag: String?) {
        lock.lock(); defer { lock.unlock() }
        try? FileManager.default.createDirectory(at: cacheDir, withIntermediateDirectories: true)
        var meta = ["have": have]
        if let etag { meta["etag"] = etag }
        try? body.write(to: envelopeFile, options: .atomic)
        try? JSONSerialization.data(withJSONObject: meta).write(to: metaFile, options: .atomic)
    }
}
