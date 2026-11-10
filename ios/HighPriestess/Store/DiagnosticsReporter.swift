import Foundation
import MetricKit

/// First-party crash/hang counts via MetricKit. One `diagnostic` event per diagnostic
/// (kind: crash / hang / cpu_exception / disk_write_exception, capped at 10 per delivery),
/// with the app version attached by the server. No stack traces, no file paths, no identifiers.
/// Diagnostics are delivered by the system about once a day for the previous day, so counts lag.
/// Gated on the same kill switch as the funnel events (FLAGS.funnelEvents = false).
/// Shipping this requires the App Privacy answers to declare Diagnostics / Crash Data
/// (docs/asc/app-privacy-1.0.md).
@MainActor
final class DiagnosticsReporter: NSObject, MXMetricManagerSubscriber {
    private let analytics: Analytics

    init(analytics: Analytics) {
        self.analytics = analytics
        super.init()
        MXMetricManager.shared.add(self)
    }

    deinit {
        MXMetricManager.shared.remove(self)
    }

    func didReceive(_ payloads: [MXDiagnosticPayload]) {
        guard analytics.enabled else { return }
        var sent = 0
        for payload in payloads {
            for _ in payload.crashDiagnostics ?? [] where sent < 10 {
                analytics.track("diagnostic", ["kind": "crash"]); sent += 1
            }
            for _ in payload.hangDiagnostics ?? [] where sent < 10 {
                analytics.track("diagnostic", ["kind": "hang"]); sent += 1
            }
            for _ in payload.cpuExceptionDiagnostics ?? [] where sent < 10 {
                analytics.track("diagnostic", ["kind": "cpu_exception"]); sent += 1
            }
            for _ in payload.diskWriteExceptionDiagnostics ?? [] where sent < 10 {
                analytics.track("diagnostic", ["kind": "disk_write_exception"]); sent += 1
            }
        }
    }

    /// Daily metric aggregates (launch time, CPU, memory) are not sent.
    func didReceive(_ payloads: [MXMetricPayload]) {}
}
