// Server-driven content: core helpers + loader fallbacks (no network).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

function realm() {
  const ctx = { console, URLSearchParams, setTimeout, clearTimeout };
  ctx.window = ctx; ctx.self = ctx;
  vm.createContext(ctx);
  for (const f of ["content", "maps", "dialogue", "content-core"]) vm.runInContext(fs.readFileSync(`js/${f}.js`, "utf8"), ctx);
  return ctx;
}

test("bundled content is valid, data-only and hashes stably", () => {
  const a = realm(), b = realm();
  const C = a.SothContent;
  const content = { DATA: a.DATA, MAPS: a.MAPS, SCENES: a.SCENES };
  const r = C.validate(content, { ref: content });
  assert.equal(r.ok, true, r.errors.join("; "));
  assert.equal(r.warnings.length, 0);
  assert.equal(C.contentHash(content), b.SothContent.contentHash({ DATA: b.DATA, MAPS: b.MAPS, SCENES: b.SCENES }));
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

test("loader: remote overrides apply; offline falls back to cache, then bundle", async () => {
  const run = async (fetchImpl, cache) => {
    const ctx = realm();
    const store = new Map(cache ? [["soth_content_cache_v1", cache]] : []);
    let started = 0;
    Object.assign(ctx, {
      location: { hostname: "yishengjiang99.github.io", search: "" },
      localStorage: { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) },
      fetch: fetchImpl,
      AbortController,
      document: { createElement: () => ({}), body: { appendChild: () => { started++; } } }
    });
    vm.runInContext(fs.readFileSync("js/content-loader.js", "utf8"), ctx);
    for (let i = 0; i < 50 && !started; i++) await new Promise((r) => setTimeout(r, 5));
    return { ctx, store, started };
  };
  const payload = { schema: 1, version: 7, baseHash: null, overrides: { DATA: { ENEMIES: { wisp: { hp: 1234 } } } } };
  const ok = async () => ({ ok: true, status: 200, headers: { get: () => 'W/"x"' }, json: async () => payload });
  const live = await run(ok);
  assert.equal(live.started, 1);
  assert.equal(live.ctx.DATA.ENEMIES.wisp.hp, 1234);
  assert.equal(live.ctx.SOTH_CONTENT.source, "remote");
  const cached = live.store.get("soth_content_cache_v1");

  const offline = await run(async () => { throw new Error("offline"); }, cached);
  assert.equal(offline.ctx.SOTH_CONTENT.source, "cache");
  assert.equal(offline.ctx.DATA.ENEMIES.wisp.hp, 1234);

  const cold = await run(async () => { throw new Error("offline"); });
  assert.equal(cold.ctx.SOTH_CONTENT.source, "bundled");
  assert.notEqual(cold.ctx.DATA.ENEMIES.wisp.hp, 1234);

  const evil = await run(async () => ({ ok: true, status: 200, headers: { get: () => null }, json: async () => ({ schema: 1, overrides: { DATA: { TITLE: "<img src=x onerror=alert(1)>" } } }) }));
  assert.equal(evil.ctx.SOTH_CONTENT.source, "bundled");
  assert.equal(evil.started, 1);
});
