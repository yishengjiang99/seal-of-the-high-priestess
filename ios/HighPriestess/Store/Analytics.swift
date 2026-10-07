import Foundation

/// First-party funnel events only (paywall_shown, purchase, restore, region_complete), batched to
/// POST /v1/events on our own server. No third-party SDKs, no device identifiers, no tracking.
/// Server config can switch it off with FLAGS.funnelEvents = false.
@MainActor
final class Analytics {
    static let names: Set<String> = ["paywall_shown", "purchase", "restore", "region_complete"]

    var enabled = true
    private let api: APIClient
    private var queue: [[String: Any]] = []
    private var flushTask: Task<Void, Never>?
    private static let pendingKey = "analytics.pending"

    init(api: APIClient) {
        self.api = api
        if let data = UserDefaults.standard.data(forKey: Self.pendingKey),
           let saved = (try? JSONSerialization.jsonObject(with: data)) as? [[String: Any]] {
            queue = saved
        }
    }

    func track(_ name: String, _ props: [String: Any] = [:]) {
        guard enabled, Self.names.contains(name) else { return }
        queue.append(["name": name, "props": props, "at": Int(Date().timeIntervalSince1970 * 1000)])
        if queue.count > 200 { queue.removeFirst(queue.count - 200) }
        persist()
        scheduleFlush()
    }

    /// region_complete fires once per region per install (driven by PAYWALL.regionCompleteFlags).
    func regionComplete(_ region: String) {
        let key = "analytics.region.\(region)"
        guard !UserDefaults.standard.bool(forKey: key) else { return }
        UserDefaults.standard.set(true, forKey: key)
        track("region_complete", ["region": region])
    }

    func scheduleFlush(after seconds: Double = 5) {
        flushTask?.cancel()
        flushTask = Task { [weak self] in
            try? await Task.sleep(nanoseconds: UInt64(seconds * 1_000_000_000))
            guard !Task.isCancelled else { return }
            await self?.flush()
        }
    }

    func flush() async {
        guard enabled, !queue.isEmpty else { return }
        let batch = Array(queue.prefix(50))
        guard case let (code, _)? = try? await api.authed("POST", "v1/events", json: ["events": batch, "appVersion": Bundle.main.appVersion]),
              code == 200 else { return }
        queue.removeFirst(min(batch.count, queue.count))
        persist()
        if !queue.isEmpty { scheduleFlush(after: 1) }
    }

    func clear() {
        queue.removeAll()
        persist()
    }

    private func persist() {
        if let data = try? JSONSerialization.data(withJSONObject: queue) {
            UserDefaults.standard.set(data, forKey: Self.pendingKey)
        }
    }
}
