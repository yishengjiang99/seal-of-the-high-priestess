// Temple of the High Priestess API. Mounted under BASE_PATH (/high-priestess) behind nginx.
import crypto from 'node:crypto'
import express from 'express'
import { adminGuard, createContentStore, createSigner, mountContent } from './content.js'
import { mountIap } from './iap.js'
import { RateLimiter, clientIp, isUuid, newToken, safeEqual, sha256, str } from './util.js'

export const SLOT_RE = /^(0|1|2|auto)$/
const MAX_SAVE = 256 * 1024

export function createApp({ db, env = process.env, iap = {} }) {
  const basePath = (env.BASE_PATH || '').replace(/\/+$/, '')
  const api = express.Router()
  const app = express()
  app.disable('x-powered-by')
  app.set('trust proxy', 'loopback')
  const authLimit = new RateLimiter(Number(env.AUTH_RATE_PER_MINUTE || 20))
  const apiLimit = new RateLimiter(Number(env.API_RATE_PER_MINUTE || 120))
  const store = createContentStore(db)

  api.use('/v1/admin', express.json({ limit: '4mb' }))
  api.use(express.json({ limit: '512kb' }))
  api.use((req, res, next) => {
    if (!apiLimit.allow(clientIp(req))) return void res.status(429).json({ error: 'slow down' })
    next()
  })

  api.get('/health', async (req, res) => {
    let dbOk = false
    try { await db.query('SELECT 1'); dbOk = true } catch {}
    let content = null
    try { const c = await store.load(); content = { baseHash: c.base?.hash ?? null, overridesVersion: c.overrides.version } } catch {}
    res.status(dbOk ? 200 : 503).json({ ok: dbOk, service: 'temple-api', version: '1.1.0', db: dbOk, content })
  })

  // ---- auth: anonymous install (iCloud Keychain-synced installId + secret) -> bearer token ----
  api.post('/v1/auth/device', async (req, res) => {
    if (!authLimit.allow(clientIp(req))) return void res.status(429).json({ error: 'slow down' })
    const { installId, secret } = req.body || {}
    if (!isUuid(installId) || typeof secret !== 'string' || secret.length < 32 || secret.length > 256)
      return void res.status(400).json({ error: 'installId (UUID) and secret (32-256 chars) are required' })
    const iid = installId.toLowerCase()
    const appVersion = str(req.body.appVersion, 32)
    const [rows] = await db.query('SELECT d.id, d.player_id, d.secret_hash, p.public_id FROM devices d JOIN players p ON p.id=d.player_id WHERE d.install_id=?', [iid])
    let device = rows[0], created = false
    if (device) {
      if (!safeEqual(sha256(secret), device.secret_hash)) return void res.status(403).json({ error: 'install secret mismatch' })
      await db.query('UPDATE devices SET last_seen_at=CURRENT_TIMESTAMP(3), app_version=COALESCE(?, app_version) WHERE id=?', [appVersion, device.id])
    } else {
      const publicId = crypto.randomUUID()
      const [p] = await db.query('INSERT INTO players (public_id) VALUES (?)', [publicId])
      try {
        const [d] = await db.query('INSERT INTO devices (install_id, player_id, secret_hash, app_version) VALUES (?, ?, ?, ?)', [iid, p.insertId, sha256(secret), appVersion])
        device = { id: d.insertId, player_id: p.insertId, public_id: publicId }
        created = true
      } catch (e) {
        await db.query('DELETE FROM players WHERE id=?', [p.insertId])
        if (e.code === 'ER_DUP_ENTRY') return void res.status(409).json({ error: 'retry' })
        throw e
      }
    }
    const token = newToken()
    await db.query('INSERT INTO tokens (token_hash, device_id, player_id) VALUES (?, ?, ?)', [sha256(token), device.id, device.player_id])
    res.status(created ? 201 : 200).json({ token, playerId: device.public_id, created })
  })

  const auth = async (req, res, next) => {
    const h = String(req.headers.authorization || '')
    if (!h.startsWith('Bearer ')) return void res.status(401).json({ error: 'bearer token required' })
    const th = sha256(h.slice(7).trim())
    const [rows] = await db.query('SELECT device_id, player_id, last_used_at FROM tokens WHERE token_hash=?', [th])
    if (!rows.length) return void res.status(401).json({ error: 'invalid token' })
    req.player = { id: rows[0].player_id, deviceId: rows[0].device_id }
    if (Date.now() - new Date(rows[0].last_used_at).getTime() > 3600_000) {
      db.query('UPDATE tokens SET last_used_at=CURRENT_TIMESTAMP(3) WHERE token_hash=?', [th]).catch(() => {})
      db.query('UPDATE players SET last_seen_at=CURRENT_TIMESTAMP(3) WHERE id=?', [req.player.id]).catch(() => {})
    }
    next()
  }

  const rowOut = (r, withData) => ({
    slot: r.slot,
    revision: r.revision,
    summary: r.summary ? JSON.parse(r.summary) : null,
    gameVersion: r.game_version,
    clientUpdatedAt: r.client_updated_at ? new Date(r.client_updated_at).getTime() : null,
    serverUpdatedAt: new Date(r.server_updated_at).getTime(),
    ...(withData ? { data: r.data } : { bytes: Number(r.bytes ?? r.data?.length ?? 0) }),
  })

  // ---- saves (optimistic concurrency per slot) ----
  api.get('/v1/saves', auth, async (req, res) => {
    const [rows] = await db.query('SELECT slot, revision, summary, game_version, client_updated_at, server_updated_at, LENGTH(data) AS bytes FROM saves WHERE player_id=? ORDER BY slot', [req.player.id])
    res.json({ saves: rows.map((r) => rowOut(r, false)), serverTime: Date.now() })
  })

  api.get('/v1/saves/:slot', auth, async (req, res) => {
    if (!SLOT_RE.test(req.params.slot)) return void res.status(400).json({ error: 'slot must be 0, 1, 2 or auto' })
    const [rows] = await db.query('SELECT * FROM saves WHERE player_id=? AND slot=?', [req.player.id, req.params.slot])
    if (!rows.length) return void res.status(404).json({ error: 'empty slot', revision: 0 })
    res.set('ETag', `"${rows[0].revision}"`)
    res.json({ ...rowOut(rows[0], true), serverTime: Date.now() })
  })

  // PUT /v1/saves/:slot  If-Match: <revision you based this on, 0 for a new slot>
  // body {data: "<save JSON string>", summary?, gameVersion?, clientUpdatedAt?}
  // -> 200 {revision} | 409 {error, server: <current copy>} | 428 without If-Match
  api.put('/v1/saves/:slot', auth, async (req, res) => {
    const slot = req.params.slot
    if (!SLOT_RE.test(slot)) return void res.status(400).json({ error: 'slot must be 0, 1, 2 or auto' })
    const m = /^"?(\d+)"?$/.exec(String(req.headers['if-match'] || ''))
    if (!m) return void res.status(428).json({ error: 'If-Match: <revision> required (0 for a new slot)' })
    const base = Number(m[1])
    const b = req.body || {}
    if (typeof b.data !== 'string' || !b.data || b.data.length > MAX_SAVE) return void res.status(400).json({ error: `data must be a non-empty string up to ${MAX_SAVE} bytes` })
    try { JSON.parse(b.data) } catch { return void res.status(400).json({ error: 'data must be JSON' }) }
    const summary = b.summary && typeof b.summary === 'object' ? JSON.stringify(b.summary).slice(0, 4000) : null
    const clientAt = Number.isFinite(b.clientUpdatedAt) ? new Date(b.clientUpdatedAt) : null
    const conn = await db.getConnection()
    try {
      await conn.beginTransaction()
      const [rows] = await conn.query('SELECT * FROM saves WHERE player_id=? AND slot=? FOR UPDATE', [req.player.id, slot])
      const cur = rows[0]
      const curRev = cur ? cur.revision : 0
      if (base !== curRev) {
        await conn.rollback()
        return void res.status(409).json({ error: 'revision conflict', yourBase: base, server: cur ? rowOut(cur, true) : { slot, revision: 0 } })
      }
      if (cur) {
        await conn.query('INSERT INTO save_history (player_id, slot, revision, data, summary, device_id) VALUES (?, ?, ?, ?, ?, ?)', [req.player.id, slot, cur.revision, cur.data, cur.summary, cur.device_id])
        await conn.query('UPDATE saves SET revision=?, data=?, summary=?, game_version=?, device_id=?, client_updated_at=?, server_updated_at=CURRENT_TIMESTAMP(3) WHERE player_id=? AND slot=?',
          [curRev + 1, b.data, summary, str(b.gameVersion, 32), req.player.deviceId, clientAt, req.player.id, slot])
        await conn.query(`DELETE FROM save_history WHERE player_id=? AND slot=? AND id NOT IN (
          SELECT id FROM (SELECT id FROM save_history WHERE player_id=? AND slot=? ORDER BY id DESC LIMIT 10) keep)`, [req.player.id, slot, req.player.id, slot])
      } else {
        await conn.query('INSERT INTO saves (player_id, slot, revision, data, summary, game_version, device_id, client_updated_at) VALUES (?, ?, 1, ?, ?, ?, ?, ?)',
          [req.player.id, slot, b.data, summary, str(b.gameVersion, 32), req.player.deviceId, clientAt])
      }
      await conn.commit()
      res.set('ETag', `"${curRev + 1}"`)
      res.json({ slot, revision: curRev + 1, serverTime: Date.now() })
    } catch (e) {
      await conn.rollback().catch(() => {})
      throw e
    } finally {
      conn.release()
    }
  })

  api.get('/v1/saves/:slot/history', auth, async (req, res) => {
    if (!SLOT_RE.test(req.params.slot)) return void res.status(400).json({ error: 'bad slot' })
    const [rows] = await db.query('SELECT revision, summary, replaced_at, LENGTH(data) AS bytes FROM save_history WHERE player_id=? AND slot=? ORDER BY id DESC', [req.player.id, req.params.slot])
    res.json({ history: rows.map((r) => ({ revision: r.revision, summary: r.summary ? JSON.parse(r.summary) : null, replacedAt: new Date(r.replaced_at).getTime(), bytes: Number(r.bytes) })) })
  })

  // ---- settings (last write wins) ----
  api.get('/v1/settings', auth, async (req, res) => {
    const [rows] = await db.query('SELECT data, updated_at FROM settings WHERE player_id=?', [req.player.id])
    if (!rows.length) return void res.status(404).json({ error: 'no settings' })
    res.json({ data: rows[0].data, updatedAt: new Date(rows[0].updated_at).getTime() })
  })
  api.put('/v1/settings', auth, async (req, res) => {
    const d = req.body?.data
    if (typeof d !== 'string' || d.length > 16384) return void res.status(400).json({ error: 'data must be a JSON string up to 16 KB' })
    try { JSON.parse(d) } catch { return void res.status(400).json({ error: 'data must be JSON' }) }
    await db.query('INSERT INTO settings (player_id, data) VALUES (?, ?) ON DUPLICATE KEY UPDATE data=VALUES(data)', [req.player.id, d])
    res.json({ ok: true })
  })

  // ---- delete everything for this player (Settings > Delete cloud data) ----
  api.delete('/v1/me', auth, async (req, res) => {
    const id = req.player.id
    for (const t of ['saves', 'save_history', 'settings', 'events', 'entitlements', 'tokens', 'devices']) await db.query(`DELETE FROM ${t} WHERE player_id=?`, [id])
    await db.query('DELETE FROM players WHERE id=?', [id])
    res.json({ ok: true, deleted: true })
  })

  mountContent(api, { db, store, adminToken: env.CONTENT_ADMIN_TOKEN || '', signer: createSigner(env) })
  mountIap(api, { db, auth, admin: adminGuard(env.CONTENT_ADMIN_TOKEN || ''), env, ...iap })

  api.use((req, res) => res.status(404).json({ error: 'not found' }))
  api.use((err, req, res, next) => {
    if (err?.type === 'entity.too.large') return void res.status(413).json({ error: 'payload too large' })
    if (err?.type === 'entity.parse.failed') return void res.status(400).json({ error: 'invalid JSON' })
    console.error('[temple-api]', req.method, req.path, err?.message || err)
    res.status(500).json({ error: 'server error' })
  })
  app.use(basePath + '/api', api)
  return app
}
