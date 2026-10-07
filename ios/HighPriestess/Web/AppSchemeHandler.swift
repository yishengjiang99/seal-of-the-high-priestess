import Foundation
import UniformTypeIdentifiers
import WebKit

/// Serves the bundled game at app://game/... straight from HighPriestess.app/Web, fully offline.
/// Supports byte ranges (206) so <audio> voice clips stream from the custom scheme.
/// app://game/__content is proxied to ContentService (signed server-driven content).
final class AppSchemeHandler: NSObject, WKURLSchemeHandler {
    static let scheme = "app"
    static let contentPath = "/__content"
    let root: URL
    private let rootPath: String
    var content: ContentService = .shared
    /// Async tasks still allowed to receive data (WebKit forbids touching a stopped task).
    private var live = Set<ObjectIdentifier>()

    init(root: URL) {
        self.root = root.standardizedFileURL
        self.rootPath = self.root.path.hasSuffix("/") ? self.root.path : self.root.path + "/"
    }

    func webView(_ webView: WKWebView, start urlSchemeTask: WKURLSchemeTask) {
        guard let url = urlSchemeTask.request.url else {
            urlSchemeTask.didFailWithError(URLError(.badURL))
            return
        }
        if url.path == Self.contentPath {
            serveContent(urlSchemeTask, url: url)
            return
        }
        let (status, headers, body) = response(for: url, range: urlSchemeTask.request.value(forHTTPHeaderField: "Range"))
        let resp = HTTPURLResponse(url: url, statusCode: status, httpVersion: "HTTP/1.1", headerFields: headers)!
        urlSchemeTask.didReceive(resp)
        urlSchemeTask.didReceive(body)
        urlSchemeTask.didFinish()
    }

    func webView(_ webView: WKWebView, stop urlSchemeTask: WKURLSchemeTask) {
        // File responses are synchronous; only content proxy tasks can still be pending.
        live.remove(ObjectIdentifier(urlSchemeTask))
    }

    private func serveContent(_ task: WKURLSchemeTask, url: URL) {
        let id = ObjectIdentifier(task)
        live.insert(id)
        let have = URLComponents(url: url, resolvingAgainstBaseURL: false)?
            .queryItems?.first(where: { $0.name == "have" })?.value ?? ""
        let service = content
        Task.detached {
            let result = await service.load(have: have)
            await MainActor.run {
                guard self.live.remove(id) != nil else { return } // stopped (page aborted / reloaded)
                var headers = ["Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store"]
                let status: Int
                let body: Data
                if let result {
                    status = 200
                    body = result.body
                    headers["X-Soth-Source"] = result.source
                } else {
                    status = 504
                    body = Data("{\"error\":\"content unavailable\"}".utf8)
                }
                headers["Content-Length"] = String(body.count)
                task.didReceive(HTTPURLResponse(url: url, statusCode: status, httpVersion: "HTTP/1.1", headerFields: headers)!)
                task.didReceive(body)
                task.didFinish()
            }
        }
    }

    /// Resolves a request to (status, headers, body). Internal for tests.
    func response(for url: URL, range: String?) -> (Int, [String: String], Data) {
        var path = url.path
        if path.isEmpty || path == "/" { path = "/index.html" }
        let file = root.appendingPathComponent(String(path.dropFirst())).standardizedFileURL
        guard file.path.hasPrefix(rootPath),
              let data = try? Data(contentsOf: file, options: .mappedIfSafe) else {
            return (404, ["Content-Type": "text/plain; charset=utf-8", "Content-Length": "9"], Data("not found".utf8))
        }
        var headers = [
            "Content-Type": Self.mimeType(for: file.pathExtension),
            "Cache-Control": "no-cache",
            "Accept-Ranges": "bytes",
            "Access-Control-Allow-Origin": "*",
        ]
        if let range, let r = Self.parseRange(range, count: data.count) {
            headers["Content-Range"] = "bytes \(r.lowerBound)-\(r.upperBound - 1)/\(data.count)"
            headers["Content-Length"] = String(r.count)
            return (206, headers, data.subdata(in: r))
        }
        headers["Content-Length"] = String(data.count)
        return (200, headers, data)
    }

    /// "bytes=a-b" | "bytes=a-" | "bytes=-n" -> half-open range within 0..<count (nil if unsatisfiable/unsupported).
    static func parseRange(_ header: String, count: Int) -> Range<Int>? {
        let h = header.trimmingCharacters(in: .whitespaces).lowercased()
        guard h.hasPrefix("bytes="), count > 0 else { return nil }
        let spec = h.dropFirst(6).split(separator: ",").first.map(String.init) ?? ""
        let parts = spec.split(separator: "-", maxSplits: 1, omittingEmptySubsequences: false).map { $0.trimmingCharacters(in: .whitespaces) }
        guard parts.count == 2 else { return nil }
        if parts[0].isEmpty {
            guard let n = Int(parts[1]), n > 0 else { return nil }
            return max(0, count - n)..<count
        }
        guard let start = Int(parts[0]), start < count else { return nil }
        let end = parts[1].isEmpty ? count - 1 : min(Int(parts[1]) ?? (count - 1), count - 1)
        guard end >= start else { return nil }
        return start..<(end + 1)
    }

    static func mimeType(for ext: String) -> String {
        switch ext.lowercased() {
        case "html", "htm": return "text/html; charset=utf-8"
        case "js", "mjs": return "text/javascript; charset=utf-8"
        case "css": return "text/css; charset=utf-8"
        case "json": return "application/json; charset=utf-8"
        case "mp3": return "audio/mpeg"
        case "m4a", "mp4": return "audio/mp4"
        case "wav": return "audio/wav"
        case "jpg", "jpeg": return "image/jpeg"
        case "png": return "image/png"
        case "webp": return "image/webp"
        case "svg": return "image/svg+xml"
        case "woff2": return "font/woff2"
        case "ttf": return "font/ttf"
        default:
            return UTType(filenameExtension: ext)?.preferredMIMEType ?? "application/octet-stream"
        }
    }
}
