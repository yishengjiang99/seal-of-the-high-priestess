import Foundation

/// Ed25519 public keys for signed content envelopes (schema 2), by kid.
/// Must match js/content-keys.js (a unit test checks this). Rotation: add the new kid here and in
/// content-keys.js, ship a build, then switch the server's CONTENT_SIGNING_KID.
enum ContentKeys {
    static let keys: [String: String] = [
        "k1": "SUxK+LDPnhcy4djeDaaJXxUi6pHIOTQp2Qsol70Veys=",
    ]
}
