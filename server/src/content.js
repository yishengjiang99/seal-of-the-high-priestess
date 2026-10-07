// Server-driven content: published bases (repo snapshots) + owner-edited overrides (JSON Merge Patch).
// Data only; validated with the same js/content-core.js the game uses (vendored to lib/).
import zlib from 'node:zlib'
import { createRequire } from 'node:module'
import { safeEqual, sha256 } from './util.js'

const require = createRequire(import.meta.url)
export const core = require('../lib/content-core.cjs')

export function createContentStore(db) {
  let cache = null, cacheAt = 0
  async function load() {
    if (cache && Date.now() - cacheAt < 10_000) return cache
    const [b] = await db.query('SELECT id, hash, body, assets, published_at FROM content_bases ORDER BY published_at DESC, id DESC LIMIT 1')
    const [o] = await db.query('SELECT version, body, note, created_at FROM content_overrides ORDER BY version DESC LIMIT 1')
    cache = {
      base: b[0] ? { hash: b[0].hash, content: JSON.parse(b[0].body), assets: JSON.parse(b[0].assets), publishedAt: b[0].published_at } : null,
      overrides: o[0] ? { version: o[0].version, body: JSON.parse(o[0].body), note: o[0].note, createdAt: o[0].created_at } : { version: 0, body: {}, note: null, createdAt: null },
    }
    cacheAt = Date.now()
    return cache
  }
  const invalidate = () => { cache = null }
  async function knownBase(hash) {
    const [r] = await db.query('SELECT id FROM content_bases WHERE hash=?', [hash])
    return r.length > 0
  }
  return { load, invalidate, knownBase }
}

export function mountContent(app, { db, store, adminToken }) {
  const cors = (res) => {
    res.set('Access-Control-Allow-Origin', '*')
    res.set('Access-Control-Allow-Headers', 'If-None-Match')
    res.set('Access-Control-Expose-Headers', 'ETag')
    res.set('Access-Control-Max-Age', '86400')
  }
  app.options('/v1/content', (req, res) => { cors(res); res.status(204).end() })

  // GET /v1/content?have=<hash of the client's bundled content>&schema=1
  app.get('/v1/content', async (req, res) => {
    cors(res)
    res.set('Cache-Control', 'no-cache')
    const schema = Number(req.query.schema || core.SCHEMA)
    if (schema !== core.SCHEMA) return void res.status(400).json({ error: `unsupported schema ${schema}` })
    const have = typeof req.query.have === 'string' ? req.query.have.slice(0, 16) : ''
    const { base, overrides } = await store.load()
    // Ship the base only to clients whose bundle is an older published snapshot. A bundle we've
    // never seen is newer than the server (an app build ahead of publishing) and keeps its own.
    let sendBase = false
    if (base && have && have !== base.hash) sendBase = await store.knownBase(have)
    const etag = `W/"c${core.SCHEMA}-${sendBase ? base.hash : 'nobase'}-${overrides.version}"`
    res.set('ETag', etag)
    if (req.headers['if-none-match'] === etag) return void res.status(304).end()
    const body = {
      schema: core.SCHEMA,
      version: overrides.version,
      baseHash: base ? base.hash : null,
      ...(sendBase ? { base: base.content } : {}),
      overrides: overrides.body,
      updatedAt: overrides.createdAt,
    }
    const json = JSON.stringify(body)
    res.type('application/json')
    if (json.length > 4096 && /\bgzip\b/.test(String(req.headers['accept-encoding'] || ''))) {
      res.set('Content-Encoding', 'gzip').set('Vary', 'Accept-Encoding')
      return void res.send(zlib.gzipSync(json))
    }
    res.send(json)
  })

  // ---- admin (Authorization: Bearer $CONTENT_ADMIN_TOKEN) ----
  const admin = (req, res, next) => {
    const h = String(req.headers.authorization || '')
    const tok = h.startsWith('Bearer ') ? h.slice(7).trim() : ''
    if (!adminToken || !tok || !safeEqual(tok, adminToken)) return void res.status(401).json({ error: 'admin token required' })
    next()
  }

  // Publish a base snapshot (scripts/build-content.mjs output). Re-publishing a known hash re-activates it.
  app.put('/v1/admin/content/base', admin, async (req, res) => {
    const b = req.body || {}
    if (b.schema !== core.SCHEMA || !b.content || !Array.isArray(b.assets)) return void res.status(400).json({ error: 'expected {schema, hash, assets[], content}' })
    const content = { DATA: b.content.DATA, MAPS: b.content.MAPS, SCENES: b.content.SCENES }
    const assets = b.assets.filter((a) => typeof a === 'string' && /^assets\/[\w./-]+$/.test(a) && !a.includes('..'))
    const v = core.validate(content, { ref: content, assets })
    if (!v.ok || v.warnings.length) return void res.status(422).json({ error: 'invalid content', errors: v.errors, warnings: v.warnings })
    const hash = core.contentHash(content)
    if (b.hash && b.hash !== hash) return void res.status(422).json({ error: `hash mismatch: body says ${b.hash}, server computed ${hash}` })
    await db.query(
      `INSERT INTO content_bases (hash, body, assets, source) VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE published_at=CURRENT_TIMESTAMP(3), source=VALUES(source), assets=VALUES(assets)`,
      [hash, JSON.stringify(content), JSON.stringify(assets), JSON.stringify(b.source || null).slice(0, 2000)])
    store.invalidate()
    const { overrides } = await store.load()
    const check = core.validate(core.mergePatch(content, overrides.body), { ref: content, assets })
    res.json({ ok: true, hash, overridesVersion: overrides.version, overridesStillValid: check.ok, warnings: check.warnings })
  })

  app.get('/v1/admin/content/overrides', admin, async (req, res) => {
    const { overrides, base } = await store.load()
    res.json({ version: overrides.version, note: overrides.note, createdAt: overrides.createdAt, baseHash: base?.hash ?? null, overrides: overrides.body })
  })

  // The merged content clients get on the active base (handy for editing / review).
  app.get('/v1/admin/content/effective', admin, async (req, res) => {
    const { overrides, base } = await store.load()
    if (!base) return void res.status(404).json({ error: 'no base published yet' })
    const v = core.validate(core.mergePatch(base.content, overrides.body), { ref: base.content, assets: base.assets })
    res.json({ baseHash: base.hash, overridesVersion: overrides.version, ok: v.ok, errors: v.errors, warnings: v.warnings, content: v.content })
  })

  // Replace the overrides (a JSON Merge Patch against the content). Body: {overrides, note?, expectedVersion?}
  app.put('/v1/admin/content/overrides', admin, async (req, res) => {
    const b = req.body || {}
    if (!b.overrides || typeof b.overrides !== 'object' || Array.isArray(b.overrides)) return void res.status(400).json({ error: 'expected {overrides: {...}, note?, expectedVersion?}' })
    const { overrides, base } = await store.load()
    if (!base) return void res.status(409).json({ error: 'publish a base first (content-publish workflow)' })
    if (b.expectedVersion != null && Number(b.expectedVersion) !== overrides.version)
      return void res.status(409).json({ error: 'overrides changed since you read them', version: overrides.version })
    const v = core.validate(core.mergePatch(base.content, b.overrides), { ref: base.content, assets: base.assets })
    if (!v.ok) return void res.status(422).json({ error: 'invalid overrides', errors: v.errors })
    const [r] = await db.query('INSERT INTO content_overrides (body, note) VALUES (?, ?)', [JSON.stringify(b.overrides), String(b.note || '').slice(0, 255) || null])
    store.invalidate()
    res.json({ ok: true, version: r.insertId, warnings: v.warnings })
  })

  app.get('/v1/admin/content/history', admin, async (req, res) => {
    const [o] = await db.query('SELECT version, note, created_at, LENGTH(body) AS bytes FROM content_overrides ORDER BY version DESC LIMIT 50')
    const [b] = await db.query('SELECT hash, source, published_at, LENGTH(body) AS bytes FROM content_bases ORDER BY published_at DESC LIMIT 20')
    res.json({ overrides: o, bases: b.map((x) => ({ ...x, source: x.source ? JSON.parse(x.source) : null })) })
  })

  // Re-activate an older overrides version (recorded as a new version).
  app.post('/v1/admin/content/rollback', admin, async (req, res) => {
    const version = Number(req.body?.version)
    const [rows] = await db.query('SELECT body FROM content_overrides WHERE version=?', [version])
    if (!rows.length && version !== 0) return void res.status(404).json({ error: 'unknown version' })
    const body = rows.length ? rows[0].body : '{}'
    const [r] = await db.query('INSERT INTO content_overrides (body, note) VALUES (?, ?)', [body, `rollback to v${version}`])
    store.invalidate()
    res.json({ ok: true, version: r.insertId, restored: version })
  })
}
export { sha256 }
