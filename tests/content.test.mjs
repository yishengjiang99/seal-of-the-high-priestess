// Server-driven content: core helpers + loader fallbacks (no network).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import crypto from "node:crypto";

function realm() {
  const ctx = { console, URLSearchParams, setTimeout, clearTimeout, atob, TextEncoder, crypto: globalThis.crypto };
  ctx.window = ctx; ctx.self = ctx;
  vm.createContext(ctx);
  for (const f of ["content", "maps", "dialogue", "config", "content-keys", "content-core"]) vm.runInContext(fs.readFileSync(`js/${f}.js`, "utf8"), ctx);
  return ctx;
}

test("bundled content is valid, data-only and hashes stably", () => {
  const a = realm(), b = realm();
  const C = a.SothContent;
  const content = { DATA: a.DATA, MAPS: a.MAPS, SCENES: a.SCENES, PAYWALL: a.PAYWALL, FLAGS: a.FLAGS };
  const r = C.validate(content, { ref: content });
  assert.equal(r.ok, true, r.errors.join("; "));
  assert.equal(r.warnings.length, 0);
  assert.equal(C.contentHash(content), b.SothContent.contentHash({ DATA: b.DATA, MAPS: b.MAPS, SCENES: b.SCENES, PAYWALL: b.PAYWALL, FLAGS: b.FLAGS }));
  // Content without the optional collections hashes as before (published bases stay valid).
  const core = { DATA: a.DATA, MAPS: a.MAPS, SCENES: a.SCENES };
  assert.equal(C.contentHash(core), C.hash53(JSON.stringify(core)));
  assert.equal(C.contentHash(content), C.hash53(JSON.stringify(JSON.parse(JSON.stringify(content)))));
});

test("merge patch tunes values, null deletes, prototype keys ignored", () => {
  const C = realm().SothContent;
  const out = C.mergePatch({ a: 1, b: { c: 2, d: 3 } }, JSON.parse('{"b":{"c":5,"d":null},"e":[1],"__proto__":{"x":1}}'));
  assert.deepEqual(JSON.parse(JSON.stringify(out)), { a: 1, b: { c: 5 }, e: [1] });
  assert.equal(({}).x, undefined);
});

test("validation rejects markup and repairs unknown assets / missing pieces", () => {
  const a = realm();
  const C = a.SothContent;
  const ref = { DATA: a.DATA, MAPS: a.MAPS, SCENES: a.SCENES };
  assert.equal(C.validate(C.mergePatch(ref, { DATA: { TITLE: "<script>x</script>" } }), { ref }).ok, false);
  const firstScene = Object.keys(ref.SCENES)[0];
  const firstMap = Object.keys(ref.MAPS)[0];
  const r = C.validate(C.mergePatch(ref, {
    DATA: { BGS: { title: "assets/backgrounds/nope.jpg" }, ENEMIES: { wisp: { hp: 999 } } },
    SCENES: { [firstScene]: null },
    MAPS: { [firstMap]: { w: 3 } }
  }), { ref });
  assert.equal(r.ok, true);
  assert.equal(r.content.DATA.BGS.title, ref.DATA.BGS.title);
  assert.equal(r.content.DATA.ENEMIES.wisp.hp, 999);
  assert.ok(r.content.SCENES[firstScene]);
  assert.equal(r.content.MAPS[firstMap].w, ref.MAPS[firstMap].w);
});

test("paywall config: known products only, never prices, prologue never gated", () => {
  const a = realm();
  const C = a.SothContent;
  const ref = { DATA: a.DATA, MAPS: a.MAPS, SCENES: a.SCENES, PAYWALL: a.PAYWALL, FLAGS: a.FLAGS };
  const ok = C.validate(C.mergePatch(ref, { PAYWALL: { offer: "com.ragnus.weather.fullgame.b", copy: { title: "New title" } }, FLAGS: { newThing: true } }), { ref });
  assert.equal(ok.content.PAYWALL.offer, "com.ragnus.weather.fullgame.b");
  assert.equal(ok.content.PAYWALL.copy.title, "New title");
  assert.equal(ok.content.FLAGS.newThing, true);
  for (const bad of [{ offer: "com.evil.free" }, { copy: { price: "$0.99" } }, { gatedMaps: ["temple"] }, { gatedMaps: ["nowhere"] }]) {
    const r = C.validate(C.mergePatch(ref, { PAYWALL: bad }), { ref });
    assert.equal(r.ok, true);
    assert.equal(JSON.stringify(r.content.PAYWALL), JSON.stringify(ref.PAYWALL), JSON.stringify(bad));
    assert.ok(r.warnings.some((w) => w.startsWith("PAYWALL invalid")));
  }
  const f = C.validate(C.mergePatch(ref, { FLAGS: { nested: { a: 1 } } }), { ref });
  assert.equal(f.content.FLAGS.nested, undefined);
  const art = C.validate(C.mergePatch(ref, { PAYWALL: { copy: { art: "assets/backgrounds/missing.jpg" } } }), { ref });
  assert.equal(art.content.PAYWALL.copy.art, ref.PAYWALL.copy.art);
});

test("loader: remote overrides apply; offline falls back to cache, then bundle", async () => {
  const run = async (fetchImpl, cache) => {
    const ctx = realm();
    const store = new Map(cache ? [["soth_content_cache_v2", cache]] : []);
    let started = 0;
    Object.assign(ctx, {
      location: { hostname: "yishengjiang99.github.io", search: "" },
      localStorage: { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) },
      fetch: fetchImpl,
      AbortController,
      document: { createElement: () => ({}), body: { appendChild: () => { started++; } } }
    });
    ctx.SOTH_CONTENT_KEYS = { t1: pubB64 };
    vm.runInContext(fs.readFileSync("js/content-loader.js", "utf8"), ctx);
    for (let i = 0; i < 50 && !started; i++) await new Promise((r) => setTimeout(r, 5));
    return { ctx, store, started };
  };
  const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
  const spki = publicKey.export({ format: "der", type: "spki" });
  const pubB64 = spki.subarray(spki.length - 32).toString("base64");
  const sign = (p, key = privateKey) => {
    const payload = JSON.stringify(p);
    return { schema: 2, kid: "t1", alg: "Ed25519", payload, sig: crypto.sign(null, Buffer.from(payload), key).toString("base64") };
  };
  const reply = (env) => async () => ({ ok: true, status: 200, headers: { get: (h) => (h === "ETag" ? 'W/"x"' : null) }, json: async () => env });
  const payload = { schema: 2, version: 7, baseHash: null, overrides: { DATA: { ENEMIES: { wisp: { hp: 1234 } } }, PAYWALL: { offer: "com.ragnus.weather.fullgame.b" } } };
  const ok = reply(sign(payload));
  const live = await run(ok);
  assert.equal(live.started, 1);
  assert.equal(live.ctx.DATA.ENEMIES.wisp.hp, 1234);
  assert.equal(live.ctx.SOTH_CONTENT.source, "remote");
  assert.equal(live.ctx.PAYWALL.offer, "com.ragnus.weather.fullgame.b");
  const cached = live.store.get("soth_content_cache_v2");

  const offline = await run(async () => { throw new Error("offline"); }, cached);
  assert.equal(offline.ctx.SOTH_CONTENT.source, "cache");
  assert.equal(offline.ctx.DATA.ENEMIES.wisp.hp, 1234);

  const cold = await run(async () => { throw new Error("offline"); });
  assert.equal(cold.ctx.SOTH_CONTENT.source, "bundled");
  assert.notEqual(cold.ctx.DATA.ENEMIES.wisp.hp, 1234);

  const evil = await run(reply(sign({ schema: 2, overrides: { DATA: { TITLE: "<img src=x onerror=alert(1)>" } } })));
  assert.equal(evil.ctx.SOTH_CONTENT.source, "bundled");
  assert.equal(evil.started, 1);

  // Forged: signed by another key, or payload altered after signing -> rejected.
  const other = crypto.generateKeyPairSync("ed25519").privateKey;
  const forged = await run(reply(sign(payload, other)));
  assert.equal(forged.ctx.SOTH_CONTENT.source, "bundled");
  const env = sign(payload);
  env.payload = env.payload.replace("1234", "9999");
  const tampered = await run(reply(env));
  assert.equal(tampered.ctx.SOTH_CONTENT.source, "bundled");
  // Tampered cache is ignored too.
  const badCache = JSON.parse(cached);
  badCache.env.payload = badCache.env.payload.replace("1234", "9999");
  const offline2 = await run(async () => { throw new Error("offline"); }, JSON.stringify(badCache));
  assert.equal(offline2.ctx.SOTH_CONTENT.source, "bundled");
});
