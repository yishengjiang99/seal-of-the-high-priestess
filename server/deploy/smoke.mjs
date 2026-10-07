#!/usr/bin/env node
// End-to-end smoke test of the live API. Creates a throwaway install, exercises saves + content, then deletes it.
// Usage: node server/deploy/smoke.mjs [https://grepawk.com/high-priestess/api]   (never prints tokens/secrets)
import { randomUUID, randomBytes, createPublicKey, verify as edVerify } from 'node:crypto'
import { readFileSync } from 'node:fs'
const API = (process.argv[2] || 'https://grepawk.com/high-priestess/api').replace(/\/$/, '')
let fails = 0
const ok = (cond, label, extra = '') => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${extra ? '  ' + extra : ''}`); if (!cond) fails++ }
const call = async (method, path, { token, body, headers = {} } = {}) => {
  const r = await fetch(API + path, { method, headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers }, body: body ? JSON.stringify(body) : undefined })
  const text = await r.text(); let json = null; try { json = JSON.parse(text) } catch {}
  return { status: r.status, json, headers: r.headers, bytes: text.length }
}
const h = await call('GET', '/health')
ok(h.status === 200 && h.json?.db === true, 'GET /health', JSON.stringify(h.json?.content))
const installId = randomUUID(), secret = randomBytes(32).toString('hex')
const a = await call('POST', '/v1/auth/device', { body: { installId, secret, appVersion: 'smoke' } })
ok(a.status === 201 && a.json?.token, 'POST /v1/auth/device (new install) -> 201', `player ${a.json?.playerId}`)
const token = a.json?.token
const a2 = await call('POST', '/v1/auth/device', { body: { installId, secret } })
ok(a2.status === 200 && a2.json?.playerId === a.json?.playerId, 'POST /v1/auth/device (same install, 2nd token) -> 200 same player')
const a3 = await call('POST', '/v1/auth/device', { body: { installId, secret: randomBytes(32).toString('hex') } })
ok(a3.status === 403, 'POST /v1/auth/device (wrong secret) -> 403')
ok((await call('GET', '/v1/saves')).status === 401, 'GET /v1/saves without token -> 401')
const save1 = JSON.stringify({ v: 1, map: 'smoke', gold: 1 })
ok((await call('PUT', '/v1/saves/0', { token, body: { data: save1 } })).status === 428, 'PUT /v1/saves/0 without If-Match -> 428')
const p1 = await call('PUT', '/v1/saves/0', { token, body: { data: save1, summary: { loc: 'Smoke' }, gameVersion: 'smoke' }, headers: { 'if-match': '0' } })
ok(p1.status === 200 && p1.json?.revision === 1, 'PUT /v1/saves/0 If-Match 0 -> 200 rev 1')
const g1 = await call('GET', '/v1/saves/0', { token })
ok(g1.status === 200 && g1.json?.data === save1 && g1.json?.revision === 1, 'GET /v1/saves/0 -> same data, rev 1')
const save2 = JSON.stringify({ v: 1, map: 'smoke', gold: 2 })
const p2 = await call('PUT', '/v1/saves/0', { token, body: { data: save2 }, headers: { 'if-match': '1' } })
ok(p2.status === 200 && p2.json?.revision === 2, 'PUT /v1/saves/0 If-Match 1 -> 200 rev 2')
const stale = await call('PUT', '/v1/saves/0', { token: a2.json?.token, body: { data: JSON.stringify({ v: 1, gold: 99 }) }, headers: { 'if-match': '1' } })
ok(stale.status === 409 && stale.json?.server?.revision === 2 && stale.json?.server?.data === save2, 'PUT /v1/saves/0 stale If-Match 1 (other device) -> 409 with server copy rev 2')
const list = await call('GET', '/v1/saves', { token })
ok(list.status === 200 && list.json?.saves?.length === 1, 'GET /v1/saves -> 1 slot')
const hist = await call('GET', '/v1/saves/0/history', { token })
ok(hist.status === 200 && (hist.json?.history || hist.json?.revisions || []).length === 1, 'GET /v1/saves/0/history -> rev 1 kept')
// content
const c = await call('GET', '/v1/content?schema=1', { headers: { 'accept-encoding': 'gzip' } })
const etag = c.headers.get('etag')
ok(c.status === 200 && c.json?.schema === 1 && typeof c.json?.version === 'number', 'GET /v1/content', `etag ${etag} baseHash ${c.json?.baseHash} version ${c.json?.version}`)
ok(c.headers.get('access-control-allow-origin') === '*', 'content CORS *')
const c304 = await call('GET', '/v1/content?schema=1', { headers: { 'if-none-match': etag } })
ok(c304.status === 304, 'GET /v1/content If-None-Match -> 304')
const cHave = await call('GET', `/v1/content?schema=1&have=${c.json?.baseHash}`)
ok(cHave.status === 200 && !('base' in (cHave.json || {})), 'GET /v1/content?have=<current base> -> overrides only (no base)')
ok((await call('GET', '/v1/admin/content/overrides')).status === 401, 'admin without token -> 401')
// signed content (schema 2) against the key bundled in the app
const bundledKeys = Object.fromEntries([...readFileSync(new URL('../../js/content-keys.js', import.meta.url), 'utf8').matchAll(/(\w+):\s*"([A-Za-z0-9+/=]+)"/g)].map((m) => [m[1], m[2]]))
const s2 = await call('GET', '/v1/content?schema=2&have=smoke')
const env = s2.json || {}
const pub = bundledKeys[env.kid] && createPublicKey({ key: Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), Buffer.from(bundledKeys[env.kid], 'base64')]), format: 'der', type: 'spki' })
const sigOk = !!pub && typeof env.payload === 'string' && edVerify(null, Buffer.from(env.payload), pub, Buffer.from(env.sig || '', 'base64'))
ok(s2.status === 200 && env.schema === 2 && sigOk, 'GET /v1/content?schema=2 signature verifies with bundled key', `kid ${env.kid}`)
const keys = await call('GET', '/v1/content/keys')
ok(keys.status === 200 && keys.json?.keys?.[env.kid] === bundledKeys[env.kid], 'GET /v1/content/keys matches bundle')
// purchases + funnel events (no real transaction: verification must reject a forged one)
const ent = await call('GET', '/v1/entitlements', { token })
ok(ent.status === 200 && ent.json?.full === false, 'GET /v1/entitlements (new player -> not entitled)')
const forged = await call('POST', '/v1/iap/transactions', { token, body: { signedTransaction: 'eyJhbGciOiJFUzI1NiJ9.e30.c2ln' } })
ok(forged.status === 422, 'POST /v1/iap/transactions forged JWS -> 422')
const asn = await call('POST', '/v1/iap/notifications', { body: { signedPayload: 'x.y.z' } })
ok(asn.status === 400, 'POST /v1/iap/notifications unsigned -> 400')
const ev = await call('POST', '/v1/events', { token, body: { events: [{ name: 'paywall_shown', props: { placement: 'smoke' } }, { name: 'not_allowed' }] } })
ok(ev.status === 200 && ev.json?.accepted === 1, 'POST /v1/events whitelist', `accepted ${ev.json?.accepted}`)
// cleanup
const d = await call('DELETE', '/v1/me', { token })
ok(d.status === 200 || d.status === 204, 'DELETE /v1/me (cleanup)')
ok((await call('GET', '/v1/saves', { token })).status === 401, 'token revoked after delete -> 401')
console.log(fails ? `${fails} FAILED` : 'ALL PASS')
process.exit(fails ? 1 : 0)
