// IAP verification + ASSN v2 + funnel events against a real MySQL (TEST_MYSQL_URL), using a locally
// generated certificate chain shaped like Apple's (root -> WWDR-style intermediate -> leaf with the
// App Store OIDs). Production pins Apple Root CA - G3; the test pins its own root.
import test from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { createPool, migrate } from '../src/db.js'
import { createApp } from '../src/app.js'
import { createVerifier, APPLE_ROOT_G3_SHA256 } from '../src/appstore.js'

const URL_ = process.env.TEST_MYSQL_URL

function makeChain() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chain-'))
  const ossl = (...a) => execFileSync('openssl', a, { cwd: dir, stdio: 'pipe' })
  const ext = (name, body) => fs.writeFileSync(path.join(dir, name), body)
  ext('root.ext', 'basicConstraints=critical,CA:TRUE\nkeyUsage=critical,keyCertSign,cRLSign\nsubjectKeyIdentifier=hash\n')
  ext('inter.ext', 'basicConstraints=critical,CA:TRUE,pathlen:0\nkeyUsage=critical,keyCertSign,cRLSign\n1.2.840.113635.100.6.2.1=ASN1:NULL\n')
  ext('leaf.ext', 'basicConstraints=critical,CA:FALSE\nkeyUsage=critical,digitalSignature\n1.2.840.113635.100.6.11.1=ASN1:NULL\n')
  for (const n of ['root', 'inter', 'leaf']) ossl('ecparam', '-name', 'prime256v1', '-genkey', '-noout', '-out', `${n}.key`)
  ossl('req', '-new', '-x509', '-key', 'root.key', '-subj', '/CN=Test Root', '-days', '30', '-out', 'root.pem', '-extensions', 'v3', '-config', writeCfg(dir, 'root.ext'))
  for (const [n, issuer] of [['inter', 'root'], ['leaf', 'inter']]) {
    ossl('req', '-new', '-key', `${n}.key`, '-subj', `/CN=Test ${n}`, '-out', `${n}.csr`)
    ossl('x509', '-req', '-in', `${n}.csr`, '-CA', `${issuer}.pem`, '-CAkey', `${issuer}.key`, '-CAcreateserial', '-days', '30', '-out', `${n}.pem`, '-extfile', `${n}.ext`)
  }
  const der = (n) => new crypto.X509Certificate(fs.readFileSync(path.join(dir, `${n}.pem`))).raw
  const x5c = ['leaf', 'inter', 'root'].map((n) => der(n).toString('base64'))
  const leafKey = crypto.createPrivateKey(fs.readFileSync(path.join(dir, 'leaf.key')))
  const rootFp = crypto.createHash('sha256').update(der('root')).digest('hex')
  const sign = (payload, key = leafKey, chain = x5c) => {
    const h = Buffer.from(JSON.stringify({ alg: 'ES256', x5c: chain })).toString('base64url')
    const p = Buffer.from(JSON.stringify(payload)).toString('base64url')
    const s = crypto.sign('sha256', Buffer.from(`${h}.${p}`), { key, dsaEncoding: 'ieee-p1363' }).toString('base64url')
    return `${h}.${p}.${s}`
  }
  return { sign, rootFp, x5c }
}
function writeCfg(dir, extFile) {
  const p = path.join(dir, 'req.cnf')
  fs.writeFileSync(p, `[req]\ndistinguished_name=dn\n[dn]\n[v3]\n${fs.readFileSync(path.join(dir, extFile), 'utf8')}`)
  return p
}

test('JWS verifier: pins the root, checks chain, OIDs, signature, bundle', () => {
  const ch = makeChain()
  const v = createVerifier({ rootFingerprints: [ch.rootFp], bundleId: 'com.ragnus.weather' })
  const tx = { transactionId: '2000000001', originalTransactionId: '2000000001', productId: 'com.ragnus.weather.fullgame', bundleId: 'com.ragnus.weather', signedDate: Date.now(), environment: 'Sandbox' }
  assert.equal(v.transaction(ch.sign(tx)).productId, 'com.ragnus.weather.fullgame')
  assert.throws(() => createVerifier({ bundleId: 'com.ragnus.weather' }).transaction(ch.sign(tx)), /untrusted root/) // Apple G3 pinned by default
  assert.throws(() => v.transaction(ch.sign({ ...tx, bundleId: 'com.other' })), /wrong bundle/)
  const forgedKey = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' }).privateKey
  assert.throws(() => v.transaction(ch.sign(tx, forgedKey)), /bad signature/)
  const jws = ch.sign(tx).split('.')
  const evil = Buffer.from(JSON.stringify({ ...tx, productId: 'com.ragnus.weather.supporter' })).toString('base64url')
  assert.throws(() => v.transaction(`${jws[0]}.${evil}.${jws[2]}`), /bad signature/)
  assert.throws(() => v.transaction(ch.sign(tx, undefined, [ch.x5c[0], ch.x5c[0], ch.x5c[2]])), /chain|OID|App Store/)
  assert.equal(APPLE_ROOT_G3_SHA256, crypto.createHash('sha256').update(fs.readFileSync(new URL('../certs/AppleRootCA-G3.cer', import.meta.url))).digest('hex'))
})

test('IAP transactions, entitlements, ASSN v2 refund, funnel events', { skip: !URL_ && 'TEST_MYSQL_URL not set' }, async (t) => {
  const ch = makeChain()
  const db = createPool({ MYSQL_URL: URL_ })
  await migrate(db)
  const ADMIN = 'adm-' + crypto.randomBytes(8).toString('hex')
  const server = createApp({ db, env: { BASE_PATH: '/high-priestess', CONTENT_ADMIN_TOKEN: ADMIN, APPLE_ROOT_FINGERPRINTS: ch.rootFp } }).listen(0, '127.0.0.1')
  await new Promise((r) => server.once('listening', r))
  t.after(async () => { server.close(); await db.end() })
  const base = `http://127.0.0.1:${server.address().port}/high-priestess/api`
  const call = async (method, p, { body, token } = {}) => {
    const r = await fetch(base + p, { method, headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined })
    const text = await r.text()
    return { status: r.status, body: text ? JSON.parse(text) : null }
  }
  const a = await call('POST', '/v1/auth/device', { body: { installId: crypto.randomUUID(), secret: crypto.randomBytes(32).toString('hex') } })
  const tok = a.body.token
  assert.deepEqual((await call('GET', '/v1/entitlements', { token: tok })).body.full, false)
  const otx = String(Date.now())
  const tx = { transactionId: otx, originalTransactionId: otx, productId: 'com.ragnus.weather.fullgame', bundleId: 'com.ragnus.weather', type: 'Non-Consumable', purchaseDate: Date.now(), signedDate: Date.now(), environment: 'Sandbox', inAppOwnershipType: 'PURCHASED', appAccountToken: a.body.playerId }
  assert.equal((await call('POST', '/v1/iap/transactions', { token: tok, body: { signedTransaction: 'garbage' } })).status, 422)
  assert.equal((await call('POST', '/v1/iap/transactions', { body: { signedTransaction: ch.sign(tx) } })).status, 401)
  assert.equal((await call('POST', '/v1/iap/transactions', { token: tok, body: { signedTransaction: ch.sign({ ...tx, productId: 'com.ragnus.weather.gems' }) } })).status, 422)
  const up = await call('POST', '/v1/iap/transactions', { token: tok, body: { signedTransaction: ch.sign(tx) } })
  assert.equal(up.status, 200); assert.equal(up.body.entitlements.full, true); assert.equal(up.body.entitlements.supporter, false)
  // idempotent re-upload
  assert.equal((await call('POST', '/v1/iap/transactions', { token: tok, body: { signedTransaction: ch.sign(tx) } })).body.entitlements.products.length, 1)

  // ASSN v2: refund revokes; duplicate delivery is harmless; forged payload rejected
  const note = (type, txi) => ch.sign({ notificationType: type, notificationUUID: crypto.randomUUID(), signedDate: Date.now(), data: { bundleId: 'com.ragnus.weather', environment: 'Sandbox', signedTransactionInfo: ch.sign(txi) } })
  assert.equal((await call('POST', '/v1/iap/notifications', { body: { signedPayload: 'x.y.z' } })).status, 400)
  const refund = note('REFUND', { ...tx, revocationDate: Date.now(), revocationReason: 0 })
  assert.equal((await call('POST', '/v1/iap/notifications', { body: { signedPayload: refund } })).status, 200)
  assert.equal((await call('POST', '/v1/iap/notifications', { body: { signedPayload: refund } })).status, 200)
  const after = (await call('GET', '/v1/entitlements', { token: tok })).body
  assert.equal(after.full, false); assert.deepEqual(after.revoked, ['com.ragnus.weather.fullgame'])
  assert.equal((await call('POST', '/v1/iap/notifications', { body: { signedPayload: note('REFUND_REVERSED', tx) } })).status, 200)
  assert.equal((await call('GET', '/v1/entitlements', { token: tok })).body.full, true)
  assert.equal((await call('POST', '/v1/iap/notifications', { body: { signedPayload: ch.sign({ notificationType: 'TEST', notificationUUID: crypto.randomUUID(), data: { bundleId: 'com.ragnus.weather' } }) } })).status, 200)

  // funnel events: whitelisted names only
  const ev = await call('POST', '/v1/events', { token: tok, body: { appVersion: '1.0 (2)', events: [{ name: 'paywall_shown', props: { placement: 'region1_end' } }, { name: 'purchase' }, { name: 'idfa_harvest' }] } })
  assert.equal(ev.body.accepted, 2)
  const m = await call('GET', '/v1/admin/metrics', { token: ADMIN })
  assert.ok(m.body.events.some((e) => e.name === 'paywall_shown'))
  // price test: sandbox data is excluded by default, included with env=all; revenue from the JWS price
  await call('POST', '/v1/iap/transactions', { token: tok, body: { signedTransaction: ch.sign({ ...tx, transactionId: otx + '9', originalTransactionId: otx + '9', productId: 'com.ragnus.weather.fullgame.b', price: 6990, currency: 'USD' }) } })
  await call('POST', '/v1/events', { token: tok, body: { events: [
    { name: 'paywall_shown', props: { placement: 'region1_end', product: 'com.ragnus.weather.fullgame.b', variant: 'v1', env: 'sandbox' } },
    { name: 'paywall_shown', props: { placement: 'menu', product: 'com.ragnus.weather.fullgame.b', variant: 'v1', env: 'sandbox' } }] } })
  assert.equal(m.body.priceTest.totalViews, 0)
  const pt = (await call('GET', '/v1/admin/metrics?env=all', { token: ADMIN })).body.priceTest
  const b = pt.arms.find((x) => x.product === 'com.ragnus.weather.fullgame.b')
  assert.equal(b.views, 2); assert.equal(b.verifiedPurchases, 1); assert.equal(b.revenue.USD, 6.99); assert.equal(b.usdRevenuePerView, 3.495)
  assert.equal(pt.ready, false); assert.match(pt.rule, /300/)
  assert.equal((await call('GET', '/v1/admin/metrics')).status, 401)

  // delete my data removes purchases + events too
  assert.equal((await call('DELETE', '/v1/me', { token: tok })).status, 200)
})
