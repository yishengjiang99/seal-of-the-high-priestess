// App Store signed data (StoreKit 2 transactions, App Store Server Notifications v2): JWS
// verification against Apple Root CA - G3 (x5c chain, Apple OIDs, ES256), the same checks as
// Apple's App Store Server Library. Optional App Store Server API lookups when an In-App
// Purchase key is configured (ASSA_KEY_ID / ASSA_ISSUER_ID / ASSA_P8).
import crypto from 'node:crypto'
import fs from 'node:fs'

export const APPLE_ROOT_G3_SHA256 = '63343abfb89a6a03ebb57e9b3f5fa7be7c4f5c756f3017b3a8c488c3653e9179'
const LEAF_OID = '1.2.840.113635.100.6.11.1'   // Mac App Store / App Store receipt signing
const INTERMEDIATE_OID = '1.2.840.113635.100.6.2.1' // Apple Worldwide Developer Relations CA

function oidDer(oid) {
  const parts = oid.split('.').map(Number)
  const bytes = [40 * parts[0] + parts[1]]
  for (const n of parts.slice(2)) {
    const enc = [n & 0x7f]
    let v = n >>> 7
    while (v) { enc.unshift((v & 0x7f) | 0x80); v >>>= 7 }
    bytes.push(...enc)
  }
  return Buffer.from([0x06, bytes.length, ...bytes])
}
const b64url = (s) => Buffer.from(s, 'base64url')

export class VerificationError extends Error {}

export function createVerifier({ rootFingerprints = [APPLE_ROOT_G3_SHA256], bundleId, now = () => Date.now() } = {}) {
  const roots = new Set(rootFingerprints.map((f) => f.toLowerCase().replace(/:/g, '')))
  const leafOid = oidDer(LEAF_OID), interOid = oidDer(INTERMEDIATE_OID)

  /** Verifies a compact JWS signed by Apple; returns the decoded payload. */
  function verify(jws) {
    if (typeof jws !== 'string' || jws.length > 200_000) throw new VerificationError('not a JWS')
    const parts = jws.split('.')
    if (parts.length !== 3) throw new VerificationError('not a JWS')
    let header, payload
    try { header = JSON.parse(b64url(parts[0]).toString('utf8')); payload = JSON.parse(b64url(parts[1]).toString('utf8')) }
    catch { throw new VerificationError('malformed JWS') }
    if (header.alg !== 'ES256' || !Array.isArray(header.x5c) || header.x5c.length < 3) throw new VerificationError('unexpected JWS header')
    let leaf, inter, root
    try { [leaf, inter, root] = header.x5c.slice(0, 3).map((c) => new crypto.X509Certificate(Buffer.from(c, 'base64'))) }
    catch { throw new VerificationError('bad certificate') }
    const rootFp = crypto.createHash('sha256').update(root.raw).digest('hex')
    if (!roots.has(rootFp)) throw new VerificationError('untrusted root')
    if (!root.verify(root.publicKey) || !inter.verify(root.publicKey) || !leaf.verify(inter.publicKey)) throw new VerificationError('broken chain')
    if (!inter.ca || !inter.raw.includes(interOid) || !leaf.raw.includes(leafOid)) throw new VerificationError('not an App Store signing chain')
    const t = Number(payload.signedDate) || now()
    for (const c of [leaf, inter, root]) {
      if (t < Date.parse(c.validFrom) || t > Date.parse(c.validTo)) throw new VerificationError('certificate not valid at signing time')
    }
    const ok = crypto.verify('sha256', Buffer.from(parts[0] + '.' + parts[1]), { key: leaf.publicKey, dsaEncoding: 'ieee-p1363' }, b64url(parts[2]))
    if (!ok) throw new VerificationError('bad signature')
    return payload
  }

  /** A verified StoreKit 2 transaction for our app. */
  function transaction(jws) {
    const tx = verify(jws)
    if (bundleId && tx.bundleId !== bundleId) throw new VerificationError(`wrong bundle ${tx.bundleId}`)
    if (!tx.transactionId || !tx.originalTransactionId || !tx.productId) throw new VerificationError('incomplete transaction')
    return tx
  }

  /** A verified ASSN v2 notification; data.transaction is the verified signedTransactionInfo, if any. */
  function notification(signedPayload) {
    const n = verify(signedPayload)
    if (!n.notificationUUID || !n.notificationType) throw new VerificationError('incomplete notification')
    const data = n.data || {}
    if (bundleId && data.bundleId && data.bundleId !== bundleId) throw new VerificationError(`wrong bundle ${data.bundleId}`)
    const tx = data.signedTransactionInfo ? transaction(data.signedTransactionInfo) : null
    return { ...n, transaction: tx }
  }
  return { verify, transaction, notification }
}

export function loadAppleRootFingerprints(env = process.env) {
  // Tests inject their own root via APPLE_ROOT_FINGERPRINTS; production pins Apple Root CA - G3.
  if (env.APPLE_ROOT_FINGERPRINTS) return env.APPLE_ROOT_FINGERPRINTS.split(',').map((s) => s.trim()).filter(Boolean)
  return [APPLE_ROOT_G3_SHA256]
}

/** Optional: App Store Server API transaction lookup (needs an In-App Purchase key). */
export function createServerApi(env = process.env) {
  const keyId = env.ASSA_KEY_ID, issuer = env.ASSA_ISSUER_ID, p8 = env.ASSA_P8 || (env.ASSA_P8_FILE && fs.existsSync(env.ASSA_P8_FILE) ? fs.readFileSync(env.ASSA_P8_FILE, 'utf8') : '')
  const bundleId = env.IAP_BUNDLE_ID || 'com.ragnus.weather'
  if (!keyId || !issuer || !p8) return null
  const key = crypto.createPrivateKey(p8.replace(/\\n/g, '\n'))
  function jwt() {
    const now = Math.floor(Date.now() / 1000)
    const h = Buffer.from(JSON.stringify({ alg: 'ES256', kid: keyId, typ: 'JWT' })).toString('base64url')
    const p = Buffer.from(JSON.stringify({ iss: issuer, iat: now, exp: now + 1200, aud: 'appstoreconnect-v1', bid: bundleId })).toString('base64url')
    const s = crypto.sign('sha256', Buffer.from(`${h}.${p}`), { key, dsaEncoding: 'ieee-p1363' }).toString('base64url')
    return `${h}.${p}.${s}`
  }
  async function getTransaction(transactionId, environment) {
    const host = environment === 'Sandbox' ? 'https://api.storekit-sandbox.itunes.apple.com' : 'https://api.storekit.itunes.apple.com'
    const r = await fetch(`${host}/inApps/v1/transactions/${encodeURIComponent(transactionId)}`, { headers: { Authorization: `Bearer ${jwt()}` }, signal: AbortSignal.timeout(10_000) })
    if (!r.ok) throw new Error(`App Store Server API ${r.status}`)
    return (await r.json()).signedTransactionInfo
  }
  return { getTransaction }
}
