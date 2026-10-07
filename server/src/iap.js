// In-app purchases + funnel events.
//   POST /v1/iap/transactions   {signedTransaction}  (StoreKit 2 Transaction.jwsRepresentation)
//   GET  /v1/entitlements
//   POST /v1/iap/notifications  {signedPayload}      (App Store Server Notifications v2; public)
//   POST /v1/events             {events:[{name, props?, at?}]}   first-party funnel only
//   GET  /v1/admin/metrics?days=N  (admin token)
import { VerificationError, createServerApi, createVerifier, loadAppleRootFingerprints } from './appstore.js'
import { str } from './util.js'

export const PRODUCTS = {
  'com.ragnus.weather.fullgame': 'full',
  'com.ragnus.weather.fullgame.b': 'full',
  'com.ragnus.weather.supporter': 'supporter',
}
export const EVENT_NAMES = new Set(['paywall_shown', 'purchase', 'restore', 'region_complete'])

const ms = (v) => (Number.isFinite(Number(v)) && Number(v) > 0 ? new Date(Number(v)) : null)

export function mountIap(api, { db, auth, admin, env = process.env, verifier, serverApi }) {
  const bundleId = env.IAP_BUNDLE_ID || 'com.ragnus.weather'
  verifier = verifier || createVerifier({ rootFingerprints: loadAppleRootFingerprints(env), bundleId })
  serverApi = serverApi === undefined ? createServerApi(env) : serverApi

  async function upsert(playerId, tx, jws, verifiedWith) {
    await db.query(
      `INSERT INTO entitlements (player_id, product_id, original_transaction_id, transaction_id, environment, ownership,
         app_account_token, purchase_date, revoked_at, revocation_reason, signed_transaction, verified_with)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE transaction_id=VALUES(transaction_id), environment=VALUES(environment), ownership=VALUES(ownership),
         revoked_at=VALUES(revoked_at), revocation_reason=VALUES(revocation_reason), signed_transaction=VALUES(signed_transaction),
         verified_with=VALUES(verified_with)`,
      [playerId, tx.productId, String(tx.originalTransactionId), String(tx.transactionId), str(tx.environment, 16) || 'Unknown',
        str(tx.inAppOwnershipType, 24), str(tx.appAccountToken, 36), ms(tx.purchaseDate), ms(tx.revocationDate),
        Number.isInteger(tx.revocationReason) ? tx.revocationReason : null, jws, verifiedWith])
  }

  async function entitlementsOf(playerId) {
    const [rows] = await db.query(
      'SELECT product_id, original_transaction_id, environment, ownership, purchase_date, revoked_at FROM entitlements WHERE player_id=? ORDER BY id', [playerId])
    const active = rows.filter((r) => !r.revoked_at)
    const out = { full: false, supporter: false, products: [] }
    for (const r of active) {
      const k = PRODUCTS[r.product_id]
      if (k) out[k] = true
      out.products.push({ productId: r.product_id, originalTransactionId: r.original_transaction_id, environment: r.environment, ownership: r.ownership, purchaseDate: r.purchase_date ? new Date(r.purchase_date).getTime() : null })
    }
    out.revoked = rows.filter((r) => r.revoked_at).map((r) => r.product_id)
    return out
  }

  api.post('/v1/iap/transactions', auth, async (req, res) => {
    const jws = req.body?.signedTransaction
    let tx
    try { tx = verifier.transaction(jws) } catch (e) {
      if (e instanceof VerificationError) return void res.status(422).json({ error: 'transaction not verified: ' + e.message })
      throw e
    }
    if (!PRODUCTS[tx.productId]) return void res.status(422).json({ error: 'unknown product ' + tx.productId })
    let verifiedWith = 'jws', stored = jws
    if (serverApi) {
      // Authoritative copy straight from Apple (revocations included).
      try {
        const fresh = await serverApi.getTransaction(tx.transactionId, tx.environment)
        tx = verifier.transaction(fresh); stored = fresh; verifiedWith = 'server-api'
      } catch (e) { console.warn('[iap] server api lookup failed:', e.message) }
    }
    await upsert(req.player.id, tx, stored, verifiedWith)
    res.json({ ok: true, verifiedWith, entitlements: await entitlementsOf(req.player.id) })
  })

  api.get('/v1/entitlements', auth, async (req, res) => {
    res.json(await entitlementsOf(req.player.id))
  })

  // App Store Server Notifications v2 (production + sandbox URLs both point here).
  api.post('/v1/iap/notifications', async (req, res) => {
    const sp = req.body?.signedPayload
    let n
    try { n = verifier.notification(sp) } catch (e) {
      if (e instanceof VerificationError) { console.warn('[asn] rejected:', e.message); return void res.status(400).json({ error: 'not verified' }) }
      throw e
    }
    const tx = n.transaction
    const [ins] = await db.query(
      `INSERT IGNORE INTO asn_notifications (notification_uuid, notification_type, subtype, environment, original_transaction_id, signed_payload)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [n.notificationUUID, n.notificationType, n.subtype || null, n.data?.environment || null, tx ? String(tx.originalTransactionId) : null, sp])
    if (ins.affectedRows && tx) {
      if (n.notificationType === 'REFUND' || n.notificationType === 'REVOKE') {
        const at = ms(tx.revocationDate) || new Date()
        await db.query('UPDATE entitlements SET revoked_at=?, revocation_reason=?, signed_transaction=? WHERE original_transaction_id=?',
          [at, Number.isInteger(tx.revocationReason) ? tx.revocationReason : null, n.data.signedTransactionInfo, String(tx.originalTransactionId)])
      } else if (n.notificationType === 'REFUND_REVERSED') {
        await db.query('UPDATE entitlements SET revoked_at=NULL, revocation_reason=NULL WHERE original_transaction_id=?', [String(tx.originalTransactionId)])
      }
    }
    console.log('[asn]', n.notificationType, n.subtype || '', n.data?.environment || '', ins.affectedRows ? 'new' : 'duplicate')
    res.status(200).json({ ok: true })
  })

  api.post('/v1/events', auth, async (req, res) => {
    const list = Array.isArray(req.body?.events) ? req.body.events.slice(0, 50) : []
    const appVersion = str(req.body?.appVersion, 32)
    let n = 0
    for (const e of list) {
      if (!e || !EVENT_NAMES.has(e.name)) continue
      let props = null
      if (e.props && typeof e.props === 'object') { props = JSON.stringify(e.props); if (props.length > 2048) props = null }
      await db.query('INSERT INTO events (player_id, name, props, app_version, client_at) VALUES (?, ?, ?, ?, ?)',
        [req.player.id, e.name, props, appVersion, ms(e.at)])
      n++
    }
    res.json({ ok: true, accepted: n })
  })

  api.get('/v1/admin/metrics', admin, async (req, res) => {
    const days = Math.min(365, Math.max(1, Number(req.query.days) || 30))
    const [ev] = await db.query(
      `SELECT DATE(created_at) AS day, name, COUNT(*) AS n, COUNT(DISTINCT player_id) AS players
       FROM events WHERE created_at >= NOW() - INTERVAL ? DAY GROUP BY day, name ORDER BY day, name`, [days])
    const [ent] = await db.query(
      `SELECT product_id, environment, COUNT(*) AS total, SUM(revoked_at IS NOT NULL) AS revoked FROM entitlements GROUP BY product_id, environment`)
    const [asn] = await db.query(`SELECT notification_type, COUNT(*) AS n FROM asn_notifications GROUP BY notification_type`)
    res.json({ days, events: ev.map((r) => ({ ...r, day: new Date(r.day).toISOString().slice(0, 10), n: Number(r.n), players: Number(r.players) })),
      entitlements: ent.map((r) => ({ ...r, total: Number(r.total), revoked: Number(r.revoked) })), notifications: asn.map((r) => ({ ...r, n: Number(r.n) })) })
  })

  return { entitlementsOf }
}
