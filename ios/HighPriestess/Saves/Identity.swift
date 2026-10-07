import Foundation
import Security

/// Anonymous cloud-save identity. installId + secret live in the iCloud Keychain (synchronizable),
/// so a new iPhone on the same Apple ID reaches the same saves. The bearer token stays on this device.
enum Identity {
    private static let service = "com.ragnus.weather.cloudsave"

    struct Install: Codable { let installId: String; let secret: String }

    static func install() -> Install {
        if let data = read(account: "install", synchronizable: true),
           let v = try? JSONDecoder().decode(Install.self, from: data) { return v }
        let v = Install(installId: UUID().uuidString.lowercased(), secret: randomHex(32))
        write(account: "install", data: try! JSONEncoder().encode(v), synchronizable: true)
        return v
    }

    /// New identity (after "Delete cloud data").
    static func rotate() {
        delete(account: "install", synchronizable: true)
        delete(account: "token", synchronizable: false)
    }

    static var token: String? {
        get { read(account: "token", synchronizable: false).flatMap { String(data: $0, encoding: .utf8) } }
        set {
            if let newValue { write(account: "token", data: Data(newValue.utf8), synchronizable: false) }
            else { delete(account: "token", synchronizable: false) }
        }
    }

    static func randomHex(_ bytes: Int) -> String {
        var b = [UInt8](repeating: 0, count: bytes)
        _ = SecRandomCopyBytes(kSecRandomDefault, bytes, &b)
        return b.map { String(format: "%02x", $0) }.joined()
    }

    private static func baseQuery(_ account: String, _ sync: Bool) -> [String: Any] {
        [kSecClass as String: kSecClassGenericPassword,
         kSecAttrService as String: service,
         kSecAttrAccount as String: account,
         kSecAttrSynchronizable as String: sync ? kCFBooleanTrue! : kCFBooleanFalse!]
    }

    private static func read(account: String, synchronizable: Bool) -> Data? {
        var q = baseQuery(account, synchronizable)
        q[kSecReturnData as String] = true
        q[kSecMatchLimit as String] = kSecMatchLimitOne
        var out: CFTypeRef?
        return SecItemCopyMatching(q as CFDictionary, &out) == errSecSuccess ? out as? Data : nil
    }

    private static func write(account: String, data: Data, synchronizable: Bool) {
        let q = baseQuery(account, synchronizable)
        let attrs: [String: Any] = [kSecValueData as String: data]
        if SecItemUpdate(q as CFDictionary, attrs as CFDictionary) == errSecItemNotFound {
            var add = q
            add[kSecValueData as String] = data
            add[kSecAttrAccessible as String] = synchronizable ? kSecAttrAccessibleAfterFirstUnlock : kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
            SecItemAdd(add as CFDictionary, nil)
        }
    }

    private static func delete(account: String, synchronizable: Bool) {
        SecItemDelete(baseQuery(account, synchronizable) as CFDictionary)
    }
}
