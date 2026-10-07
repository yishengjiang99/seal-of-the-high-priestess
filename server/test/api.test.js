// End-to-end API tests against a real MySQL/MariaDB (TEST_MYSQL_URL, e.g.
// mysql://temple:pw@127.0.0.1:3306/temple_test). Skipped when unset.
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import crypto from 'node:crypto'
import { createPool, migrate } from '../src/db.js'
import { createApp } from '../src/app.js'

const URL_ = process.env.TEST_MYSQL_URL
const ADMIN = 'test-admin-token-' + crypto.randomBytes(8).toString('hex')

function snapshot() {
  const ctx = {}; ctx.window = ctx; ctx.self = ctx; vm.createContext(ctx)
  for (const f of ['../js/content.js', '../js/maps.js', '../js/dialogue.js', '../js/config.js', 'lib/content-core.cjs']) vm.runInContext(fs.readFileSync(f, 'utf8'), ctx)
  const content = JSON.parse(JSON.stringify({ DATA: ctx.DATA, MAPS: ctx.MAPS, SCENES: ctx.SCENES, PAYWALL: ctx.PAYWALL, FLAGS: ctx.FLAGS }))
  return { schema: 1, hash: ctx.SothContent.contentHash(content), assets: ['assets/backgrounds/title.jpg', 'assets/portraits/elara_neutral.jpg', 'assets/portraits/kael_neutral.jpg'], content }
}

test('save + content API end to end', { skip: !URL_ && 'TEST_MYSQL_URL not set' }, async (t) => {
  const db = createPool({ MYSQL_URL: URL_ })
  for (const tb of ['schema_migrations', 'players', 'devices', 'tokens', 'saves', 'save_history', 'settings', 'content_bases', 'content_overrides', 'entitlements', 'asn_notifications', 'events']) await db.query(`DROP TABLE IF EXISTS ${tb}`)
  await migrate(db)
  const signKey = crypto.generateKeyPairSync('ed25519').privateKey
  const SIGNING = signKey.export({ type: 'pkcs8', format: 'der' }).toString('base64')
  const server = createApp({ db, env: { BASE_PATH: '/high-priestess', CONTENT_ADMIN_TOKEN: ADMIN, CONTENT_SIGNING_KEY: SIGNING, CONTENT_SIGNING_KID: 't1' } }).listen(0, '127.0.0.1')
  await new Promise((r) => server.once('listening', r))
  const base = `http://127.0.0.1:${server.address().port}/high-priestess/api`
  const call = async (method, path, { body, token, headers = {} } = {}) => {
    const r = await fetch(base + path, { method, headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers }, body: body ? JSON.stringify(body) : undefined })
    const text = await r.text()
    return { status: r.status, headers: r.headers, body: text ? JSON.parse(text) : null }
  }
  t.after(async () => { server.close(); await db.end() })

  assert.equal((await call('GET', '/health')).body.ok, true)

  // auth
  const installId = crypto.randomUUID(), secret = crypto.randomBytes(32).toString('hex')
  const a1 = await call('POST', '/v1/auth/device', { body: { installId, secret, appVersion: '1.0' } })
  assert.equal(a1.status, 201)
  const a2 = await call('POST', '/v1/auth/device', { body: { installId, secret } })
  assert.equal(a2.status, 200)
  assert.equal(a2.body.playerId, a1.body.playerId)
  assert.equal((await call('POST', '/v1/auth/device', { body: { installId, secret: 'x'.repeat(40) } })).status, 403)
  assert.equal((await call('GET', '/v1/saves')).status, 401)
  const tok = a1.body.token, tok2 = a2.body.token

  // saves: create, read, update, stale -> 409
  const save = JSON.stringify({ mapId: 'temple', party: ['elara', 'kael'], when: Date.now() })
  assert.equal((await call('PUT', '/v1/saves/0', { token: tok, body: { data: save } })).status, 428)
  const p1 = await call('PUT', '/v1/saves/0', { token: tok, headers: { 'If-Match': '0' }, body: { data: save, summary: { mapId: 'temple' }, gameVersion: '1.0', clientUpdatedAt: Date.now() } })
  assert.equal(p1.status, 200); assert.equal(p1.body.revision, 1)
  const g1 = await call('GET', '/v1/saves/0', { token: tok2 })
  assert.equal(g1.body.data, save); assert.equal(g1.body.revision, 1)
  const p2 = await call('PUT', '/v1/saves/0', { token: tok2, headers: { 'If-Match': '1' }, body: { data: save.replace('temple', 'village') } })
  assert.equal(p2.body.revision, 2)
  const stale = await call('PUT', '/v1/saves/0', { token: tok, headers: { 'If-Match': '1' }, body: { data: save } })
  assert.equal(stale.status, 409); assert.equal(stale.body.server.revision, 2); assert.match(stale.body.server.data, /village/)
  assert.equal((await call('PUT', '/v1/saves/9', { token: tok, headers: { 'If-Match': '0' }, body: { data: save } })).status, 400)
  assert.equal((await call('GET', '/v1/saves', { token: tok })).body.saves.length, 1)
  assert.equal((await call('GET', '/v1/saves/0/history', { token: tok })).body.history.length, 1)
  const h1 = (await call('GET', '/v1/saves/0/history/1', { token: tok })).body
  assert.equal(h1.revision, 1); assert.equal(h1.data, save)
  assert.equal((await call('GET', '/v1/saves/0/history/7', { token: tok })).status, 404)
  assert.equal((await call('PUT', '/v1/settings', { token: tok, body: { data: '{"vol":0.5}' } })).status, 200)
  assert.equal((await call('GET', '/v1/settings', { token: tok2 })).body.data, '{"vol":0.5}')

  // content: nothing published -> empty overrides, no base
  let c = await call('GET', '/v1/content?have=abc&schema=1')
  assert.equal(c.status, 200); assert.equal(c.body.version, 0); assert.equal(c.body.base, undefined)
  assert.equal(c.headers.get('access-control-allow-origin'), '*')
  const snap = snapshot()
  assert.equal((await call('PUT', '/v1/admin/content/base', { body: snap })).status, 401)
  assert.equal((await call('PUT', '/v1/admin/content/base', { token: 'nope', body: snap })).status, 401)
  const pub = await call('PUT', '/v1/admin/content/base', { token: ADMIN, body: snap })
  assert.equal(pub.status, 200, JSON.stringify(pub.body)); assert.equal(pub.body.hash, snap.hash)
  // overrides: bad ones rejected, good ones served
  assert.equal((await call('PUT', '/v1/admin/content/overrides', { token: ADMIN, body: { overrides: { DATA: { TITLE: '<b>x</b>' } } } })).status, 422)
  const ov = await call('PUT', '/v1/admin/content/overrides', { token: ADMIN, body: { overrides: { DATA: { ENEMIES: { wisp: { maxHp: 40 } } } }, note: 'test' } })
  assert.equal(ov.status, 200); assert.equal(ov.body.version, 1)
  c = await call('GET', `/v1/content?have=${snap.hash}&schema=1`)
  assert.equal(c.body.version, 1); assert.equal(c.body.base, undefined); assert.equal(c.body.overrides.DATA.ENEMIES.wisp.maxHp, 40)
  const nm = await call('GET', `/v1/content?have=${snap.hash}&schema=1`, { headers: { 'If-None-Match': c.headers.get('etag') } })
  assert.equal(nm.status, 304)
  // a client on an older *published* base gets the newer base
  const older = JSON.parse(JSON.stringify(snap)); older.content.DATA.ENEMIES.wisp.atk += 1; delete older.hash
  const po = await call('PUT', '/v1/admin/content/base', { token: ADMIN, body: older })
  assert.equal(po.status, 200)
  await call('PUT', '/v1/admin/content/base', { token: ADMIN, body: snap }) // re-activate snap
  c = await call('GET', `/v1/content?have=${po.body.hash}&schema=1`)
  assert.equal(c.body.baseHash, snap.hash); assert.ok(c.body.base && c.body.base.DATA)
  // unknown (newer) bundle keeps its own
  assert.equal((await call('GET', '/v1/content?have=ffffffffffffff&schema=1')).body.base, undefined)
  const rb = await call('POST', '/v1/admin/content/rollback', { token: ADMIN, body: { version: 0 } })
  assert.equal(rb.body.version, 2)
  assert.deepEqual((await call('GET', `/v1/content?have=${snap.hash}`)).body.overrides, {})
  assert.equal((await call('GET', '/v1/admin/content/effective', { token: ADMIN })).body.ok, true)

  // signed envelope (schema 2): signature over the exact payload string with the published key
  const keys = (await call('GET', '/v1/content/keys')).body.keys
  const env2 = (await call('GET', `/v1/content?have=${po.body.hash}&schema=2`)).body
  assert.equal(env2.schema, 2); assert.equal(env2.kid, 't1'); assert.equal(env2.alg, 'Ed25519')
  const raw = Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), Buffer.from(keys.t1, 'base64')])
  const pubKey = crypto.createPublicKey({ key: raw, format: 'der', type: 'spki' })
  assert.equal(crypto.verify(null, Buffer.from(env2.payload), pubKey, Buffer.from(env2.sig, 'base64')), true)
  const p2v = JSON.parse(env2.payload)
  assert.equal(p2v.have, po.body.hash); assert.equal(p2v.baseHash, snap.hash); assert.ok(p2v.base.PAYWALL)
  assert.equal((await call('GET', '/v1/content?schema=3')).status, 400)

  // delete my data
  assert.equal((await call('DELETE', '/v1/me', { token: tok })).status, 200)
  assert.equal((await call('GET', '/v1/saves', { token: tok2 })).status, 401)
})
