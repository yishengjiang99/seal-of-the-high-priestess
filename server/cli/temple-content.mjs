#!/usr/bin/env node
// temple-content: publish / inspect / roll back server-driven content for Temple of the High Priestess.
//
//   node server/cli/temple-content.mjs <command> [args]
//
//   status                         live base, overrides version, signing key, recent history
//   history                        override versions + published bases
//   pull [-o file] [--effective]   current overrides (or the full merged content) as JSON
//   push <file> [--note "..."]     replace overrides with <file> (a JSON Merge Patch); guarded by version
//   set <path> <json> [--note ..]  set one value in the overrides, e.g.  set DATA.ENEMIES.wisp.maxHp 30
//   unset <path> [--note ..]       remove a key from the overrides (falls back to the base value)
//   flag <name> <json>             shortcut: set FLAGS.<name> <json>
//   offer <productId>              shortcut: PAYWALL.offer (single Full Game product, clears the split)
//   offer-split <id>=<w>,<id>=<w>  shortcut: PAYWALL.offerVariants (price test buckets)
//   rollback <version>             re-activate an older overrides version (0 = no overrides)
//   verify                         fetch the signed envelope and check its signature with js/content-keys.js
//
// Auth: CONTENT_ADMIN_TOKEN env, else the output of TEMPLE_TOKEN_CMD (default reads it from the
// droplet over ssh). The token is never printed. API base: TEMPLE_API (default https://grepawk.com/high-priestess/api).
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import { execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const API = (process.env.TEMPLE_API || 'https://grepawk.com/high-priestess/api').replace(/\/$/, '')
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const args = process.argv.slice(2)
const cmd = args.shift()
const opt = (name) => { const i = args.indexOf(name); if (i < 0) return undefined; const v = args[i + 1]; args.splice(i, 2); return v }
const flag = (name) => { const i = args.indexOf(name); if (i < 0) return false; args.splice(i, 1); return true }

let token = null
function adminToken() {
  if (token) return token
  token = process.env.CONTENT_ADMIN_TOKEN || execSync(process.env.TEMPLE_TOKEN_CMD || `ssh -o BatchMode=yes root@grepawk.com "sed -n 's/^CONTENT_ADMIN_TOKEN=//p' /etc/temple.env"`, { stdio: ['ignore', 'pipe', 'inherit'] }).toString().trim()
  if (!token) die('no admin token')
  return token
}
function die(msg) { console.error('error:', msg); process.exit(1) }
async function call(method, p, body) {
  const r = await fetch(API + p, { method, headers: { Authorization: `Bearer ${adminToken()}`, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined })
  const text = await r.text()
  let json = null; try { json = JSON.parse(text) } catch {}
  if (!r.ok) die(`${method} ${p} -> ${r.status} ${json ? JSON.stringify(json, null, 2) : text.slice(0, 500)}`)
  return json
}
const show = (v) => console.log(JSON.stringify(v, null, 2))
function setPath(obj, dotted, value) {
  const keys = dotted.split('.'); let o = obj
  for (const k of keys.slice(0, -1)) { if (typeof o[k] !== 'object' || o[k] === null || Array.isArray(o[k])) o[k] = {}; o = o[k] }
  if (value === undefined) delete o[keys.at(-1)]; else o[keys.at(-1)] = value
  return obj
}
function parseValue(s) { try { return JSON.parse(s) } catch { return s } }
async function replaceOverrides(mutate, note) {
  const cur = await call('GET', '/v1/admin/content/overrides')
  const next = mutate(JSON.parse(JSON.stringify(cur.overrides || {})))
  const r = await call('PUT', '/v1/admin/content/overrides', { overrides: next, note: note || `cli ${cmd}`, expectedVersion: cur.version })
  console.log(`published overrides v${r.version} (was v${cur.version})`)
  if (r.warnings?.length) console.log('warnings (auto-repaired):\n  ' + r.warnings.join('\n  '))
}

switch (cmd) {
  case 'status': {
    const h = await (await fetch(API + '/health')).json()
    const keys = await (await fetch(API + '/v1/content/keys')).json()
    const o = await call('GET', '/v1/admin/content/overrides')
    const hist = await call('GET', '/v1/admin/content/history')
    show({ api: API, health: h, signingKeys: Object.keys(keys.keys || {}), overrides: { version: o.version, note: o.note, createdAt: o.createdAt, keys: Object.keys(o.overrides || {}) }, recent: hist.overrides.slice(0, 5), bases: hist.bases.slice(0, 3).map((b) => ({ hash: b.hash, commit: b.source?.commit?.slice(0, 7), published_at: b.published_at })) })
    break
  }
  case 'history': show(await call('GET', '/v1/admin/content/history')); break
  case 'pull': {
    const out = opt('-o'); const eff = flag('--effective')
    const v = eff ? await call('GET', '/v1/admin/content/effective') : await call('GET', '/v1/admin/content/overrides')
    const data = eff ? v.content : v.overrides
    if (out) { fs.writeFileSync(out, JSON.stringify(data, null, 2) + '\n'); console.log(`wrote ${out} (${eff ? 'effective content' : 'overrides v' + v.version})`) } else show(data)
    break
  }
  case 'push': {
    const note = opt('--note'); const file = args[0] || die('push <file>')
    const patch = JSON.parse(fs.readFileSync(file, 'utf8'))
    await replaceOverrides(() => patch, note || `cli push ${path.basename(file)}`)
    break
  }
  case 'set': { const note = opt('--note'); const [p, v] = args; if (!p || v === undefined) die('set <path> <json>'); await replaceOverrides((o) => setPath(o, p, parseValue(v)), note); break }
  case 'unset': { const note = opt('--note'); const [p] = args; if (!p) die('unset <path>'); await replaceOverrides((o) => setPath(o, p, undefined), note); break }
  case 'flag': { const [n, v] = args; if (!n || v === undefined) die('flag <name> <json>'); await replaceOverrides((o) => setPath(o, 'FLAGS.' + n, parseValue(v)), `flag ${n}=${v}`); break }
  case 'offer': { const [id] = args; if (!id) die('offer <productId>'); await replaceOverrides((o) => setPath(setPath(o, 'PAYWALL.offer', id), 'PAYWALL.offerVariants', []), `offer ${id}`); break }
  case 'offer-split': {
    const spec = args[0] || die('offer-split <id>=<weight>,...')
    const variants = spec.split(',').map((x) => { const [product, w] = x.split('='); return { product, weight: Number(w) } })
    await replaceOverrides((o) => setPath(o, 'PAYWALL.offerVariants', variants), `offer split ${spec}`)
    break
  }
  case 'rollback': { const v = Number(args[0]); if (!Number.isInteger(v)) die('rollback <version>'); const r = await call('POST', '/v1/admin/content/rollback', { version: v }); console.log(`rolled back to v${v} -> now v${r.version}`); break }
  case 'verify': {
    const ctx = {}; ctx.window = ctx; vm.createContext(ctx)
    vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/content-keys.js'), 'utf8'), ctx)
    const env = await (await fetch(API + '/v1/content?schema=2')).json()
    const k = ctx.SOTH_CONTENT_KEYS[env.kid] || die(`kid ${env.kid} not bundled in js/content-keys.js`)
    const pub = crypto.createPublicKey({ key: Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), Buffer.from(k, 'base64')]), format: 'der', type: 'spki' })
    const ok = crypto.verify(null, Buffer.from(env.payload), pub, Buffer.from(env.sig, 'base64'))
    const p = JSON.parse(env.payload)
    console.log(ok ? `signature OK (kid ${env.kid}); overrides v${p.version}, base ${p.baseHash}` : 'SIGNATURE INVALID')
    process.exit(ok ? 0 : 1)
  }
  default:
    console.log(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').slice(1, 22).map((l) => l.replace(/^\/\/ ?/, '')).join('\n'))
    process.exit(cmd ? 1 : 0)
}
