/* Public Ed25519 keys that sign server-driven content (js/content-loader.js).
   kid -> raw 32-byte public key, base64. The private half stays on the server
   (/etc/temple.env). To rotate: add the new kid here (and in the iOS
   ContentKeys.swift), ship, then switch CONTENT_SIGNING_KID on the server. */
window.SOTH_CONTENT_KEYS = {
  k1: "SUxK+LDPnhcy4djeDaaJXxUi6pHIOTQp2Qsol70Veys="
};
