// Travel pacing: walking time between consecutive main objectives, on-foot reachability of every objective, tunables.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import path from "node:path";
import { chain, dist, setFlags, MAPS, DATA, Q, SPEED_MULT, RUN_PATH } from "../scripts/travel-lib.mjs";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");

test("every main-chain hop is walkable and short (seconds at the shipped speed)", () => {
  const rows = chain();
  let total = 0;
  for (const r of rows) {
    assert.ok(Number.isFinite(r.tiles), r.id + ": unreachable on foot (" + r.from + " -> " + r.to + ")");
    assert.ok(r.secs <= 15, `${r.id}: ${r.secs.toFixed(1)} s is too long a walk`);
    total += r.secs;
  }
  assert.ok(total <= 100, "whole main chain on foot should stay under 100 s, got " + total.toFixed(0));
  assert.equal(rows.length, 12);
});

test("walking without auto-run stays reasonable too (keyboard / stick)", () => {
  const rows = chain({ norun: true });
  assert.ok(rows.reduce((s, r) => s + r.secs, 0) <= 140);
  assert.ok(rows.every((r) => r.secs <= 22), "no single hop over 22 s on a held key");
});

test("the guide points at the door that makes the whole trip shortest", () => {
  const flags = { intro_done: 1, left_temple: 1, camp1_done: 1, tut_wisp: 1, hollow_oak_dead: 1, lyra_joined: 1, region_meridia: 1 };
  const o = DATA.GUIDE.objectives.find((x) => x.id === "ash_road");
  const s = Q.nextStep(MAPS, flags, o, "meridia", { x: 54, y: 30 });
  assert.equal(s.kind, "exit");
  assert.ok(s.y > 70, "Meridia's southern (west) gate, not the north gate: y=" + s.y);
});

test("every objective target can be walked to from some entrance of its map", () => {
  const all = {};
  for (const o of DATA.GUIDE.objectives) { Q.condFlags(o.done).forEach((f) => { all[f] = 1; }); Q.condFlags(o.after).forEach((f) => { all[f] = 1; }); }
  for (const m of Object.values(MAPS)) for (const e of m.events || []) { if (e.needFlag) all[e.needFlag] = 1; }
  setFlags(all);
  for (const o of DATA.GUIDE.objectives) {
    const m = MAPS[o.map];
    const entries = [m.spawn];
    for (const mm of Object.values(MAPS)) for (const e of mm.events || []) if (e.type === "warp" && e.map === o.map) entries.push({ x: e.tx, y: e.ty });
    const best = Math.min.apply(null, entries.map((p) => dist(o.map, p, { x: o.x, y: o.y })));
    assert.ok(Number.isFinite(best), o.id + ": " + o.map + " target is walled off from every entrance");
  }
});

test("every warp is walkable from where the player arrives on its map (no sealed rooms)", () => {
  const all = {};
  for (const m of Object.values(MAPS)) for (const e of m.events || []) { if (e.needFlag) all[e.needFlag] = 1; if (e.once) all[e.once] = 1; if (e.appearIfOff) all[e.appearIfOff] = 1; }
  setFlags(all);
  for (const [id, m] of Object.entries(MAPS)) {
    for (const e of m.events || []) {
      if (e.type !== "warp") continue;
      // arriving from the map this warp leads to: the player lands at one of that map's warps back here, or spawn
      const arrivals = [];
      for (const [id2, m2] of Object.entries(MAPS)) for (const e2 of m2.events || []) if (e2.type === "warp" && e2.map === id) arrivals.push({ x: e2.tx, y: e2.ty });
      if (id === "temple" || !arrivals.length) arrivals.push(m.spawn);
      const d = Math.min.apply(null, arrivals.map((p) => dist(id, p, { x: e.x, y: e.y })));
      assert.ok(Number.isFinite(d), `${id}: warp to ${e.map} at ${e.x},${e.y} cannot be reached on foot`);
    }
  }
});

test("travel tunables are server-driven with sane bundled defaults", () => {
  assert.ok(SPEED_MULT >= 1.1 && SPEED_MULT <= 1.5, "modest bundled walk-speed bump");
  assert.ok(RUN_PATH <= 12);
  const cfg = read("js/config.js");
  assert.match(cfg, /fastTravel: true/);
  const game = read("js/game.js");
  assert.match(game, /walkSpeedMult/);
  assert.match(game, /Math\.max\(0\.75, Math\.min\(1\.75/, "client clamps the multiplier");
  // out-of-range values from the server are dropped by validation (bundled default applies)
  const ctx = { window: {} }; ctx.window = ctx; vm.createContext(ctx);
  for (const f of ["js/content.js", "js/maps.js", "js/dialogue.js", "js/config.js", "js/content-core.js"]) vm.runInContext(read(f), ctx, { filename: f });
  const C = ctx.SothContent, content = { DATA: ctx.DATA, MAPS: ctx.MAPS, SCENES: ctx.SCENES, PAYWALL: ctx.PAYWALL, FLAGS: ctx.FLAGS };
  const ok = C.validate(content, { ref: content });
  assert.equal(ok.ok, true, ok.errors.join("; "));
  assert.equal(ok.warnings.length, 0, ok.warnings.join("; "));
  const bad = C.validate(C.mergePatch(content, { FLAGS: { walkSpeedMult: 9 } }), { ref: content });
  assert.equal(bad.ok, true);
  assert.equal(bad.content.FLAGS.walkSpeedMult, undefined);
  assert.ok(bad.warnings.some((w) => /walkSpeedMult/.test(w)));
  const fine = C.validate(C.mergePatch(content, { FLAGS: { walkSpeedMult: 1.4, fastTravel: false } }), { ref: content });
  assert.equal(fine.content.FLAGS.walkSpeedMult, 1.4); assert.equal(fine.content.FLAGS.fastTravel, false);
});
