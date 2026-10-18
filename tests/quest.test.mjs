// Quest guidance: guide data is valid, the objective chain is completable and ordered, routing/pointers work.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");
const ctx = { window: {} };
ctx.window = ctx;
vm.createContext(ctx);
for (const f of ["js/content.js", "js/maps.js", "js/dialogue.js", "js/content-core.js", "js/quest.js"]) vm.runInContext(read(f), ctx, { filename: f });
const { DATA, MAPS, SCENES, SothContent: C, Quest: Q } = ctx;
const G = DATA.GUIDE;
const GAME = read("js/game.js");
const SOLID = new Set(JSON.parse(/const SOLID = new Set\((\[[\d,\s]+\])\)/.exec(GAME)[1]));

const main = G.objectives.filter((o) => o.track === "main");
const flagsOf = (o) => Q.condFlags(o.done);

// ---- what a play-through can set -------------------------------------------------------------
function sceneSets(id, seen = new Set()) {
  const out = new Set();
  if (!id || seen.has(id) || !SCENES[id]) return out;
  seen.add(id);
  (function walk(v) {
    if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") {
      if (v.set && typeof v.set === "object") Object.keys(v.set).forEach((k) => out.add(k));
      if (v.onEnd && v.onEnd.scene) sceneSets(v.onEnd.scene, seen).forEach((k) => out.add(k));
      Object.values(v).forEach(walk);
    }
  })(SCENES[id]);
  return out;
}
// Each event the player can trigger -> the flags it sets.
function eventGrants(ev) {
  const g = new Set();
  if (ev.type === "npc" || ev.type === "trigger") sceneSets(ev.scene).forEach((k) => g.add(k));
  if (ev.type === "encounter") {
    const b = DATA.BATTLES[ev.battle] || {};
    if (b.victoryFlag) g.add(b.victoryFlag);
    if (ev.once) g.add(ev.once);
    sceneSets(b.post).forEach((k) => g.add(k));
  }
  if (ev.type === "sign" && ev.set) g.add(ev.set);
  return g;
}
const gateOn = (ev, F) => (!ev.appearIf || F.has(ev.appearIf)) && (!ev.flagNeed || F.has(ev.flagNeed)) && (!ev.needFlag || F.has(ev.needFlag));
// Fixpoint of the world from a fresh game. Events that would set a flag in `blocked` are disabled.
function closure(blocked = new Set()) {
  const F = new Set(sceneSets("intro")), maps = new Set();   // a new game opens with the intro scene
  let changed = true;
  while (changed) {
    changed = false;
    // walk the map graph
    const q = ["temple"], seen = new Set(["temple"]);
    while (q.length) {
      const id = q.shift();
      const region = id;
      if (DATA.REGIONS && DATA.REGIONS[region] && !blocked.has("region_" + region) && !F.has("region_" + region)) { F.add("region_" + region); changed = true; }
      for (const ev of MAPS[id].events || []) {
        if (ev.type === "warp" && gateOn(ev, F) && !seen.has(ev.map)) { seen.add(ev.map); q.push(ev.map); }
        if (!["npc", "trigger", "encounter", "sign"].includes(ev.type) || !gateOn(ev, F)) continue;
        const g = eventGrants(ev);
        if ([...g].some((k) => blocked.has(k))) continue;
        for (const k of g) if (!F.has(k)) { F.add(k); changed = true; }
      }
    }
    seen.forEach((m) => maps.add(m));
  }
  return { flags: F, maps };
}

test("the guide validates and an invalid guide reverts to the bundled one", () => {
  const content = { DATA, MAPS, SCENES };
  const ok = C.validate(content, { ref: content });
  assert.equal(ok.ok, true, ok.errors.join("; "));
  assert.equal(ok.warnings.length, 0, ok.warnings.join("; "));
  const bad = JSON.parse(JSON.stringify(content));
  bad.DATA.GUIDE.objectives[0].map = "nowhere";
  const r = C.validate(bad, { ref: content });
  assert.equal(r.ok, true);
  assert.ok(r.warnings.some((w) => /GUIDE invalid/.test(w)));
  assert.equal(r.content.DATA.GUIDE.objectives[0].map, "temple");
  // bundles from before the guide existed still load (guide restored from the bundle)
  const old = JSON.parse(JSON.stringify(content)); delete old.DATA.GUIDE;
  const o = C.validate(old, { ref: content });
  assert.equal(o.ok, true, (o.errors || []).join("; "));
  assert.ok(o.content.DATA.GUIDE.objectives.length > 5);
});

test("every objective target is a real place: map, tile and NPC / encounter exist", () => {
  for (const o of G.objectives) {
    const m = MAPS[o.map];
    assert.ok(m, o.id + ": map " + o.map);
    assert.ok(o.x >= 0 && o.y >= 0 && o.x < m.w && o.y < m.h, o.id + ": outside map");
    const here = (m.events || []).filter((e) => e.x === o.x && e.y === o.y);
    if (o.npc) assert.ok(here.some((e) => e.id === o.npc), o.id + ": npc " + o.npc + " not at " + o.x + "," + o.y);
    // not buried in rock: the target tile is walkable or holds an NPC / encounter / trigger the player walks up to
    const solid = SOLID.has(m.tiles[o.y][o.x]);
    if (solid) assert.ok(here.some((e) => e.type === "npc" || e.type === "encounter"), o.id + ": target on solid tile with nothing on it");
    assert.ok(G.nodes[o.map], o.id + ": map has no world-map node");
  }
});

test("every completion flag is set somewhere in the game", () => {
  const all = closure().flags;
  for (const o of G.objectives) for (const f of flagsOf(o)) assert.ok(all.has(f), o.id + ": nothing sets " + f);
  for (const o of G.objectives) for (const f of Q.condFlags(o.after)) assert.ok(all.has(f), o.id + ": 'after' flag " + f + " is never set");
  assert.ok(all.has("slice_ending_seen"), "the story ending is reachable");
});

test("the main chain is completable in order, with each target reachable before it is done", () => {
  const solved = [];
  main.forEach((o, k) => {
    const later = new Set(); main.slice(k + 1).forEach((x) => flagsOf(x).forEach((f) => later.add(f)));
    const before = new Set(later); flagsOf(o).forEach((f) => before.add(f));
    const pre = closure(before);
    assert.ok(pre.maps.has(o.map), o.id + ": " + o.map + " unreachable before it is done");
    for (const p of solved) assert.ok(pre.flags.has(p), o.id + ": earlier flag " + p + " not obtainable first");
    const at = closure(later);
    for (const f of flagsOf(o)) assert.ok(at.flags.has(f), o.id + ": " + f + " cannot be set without skipping ahead");
    flagsOf(o).forEach((f) => solved.push(f));
  });
});

test("every place on the world map can be reached (the forest is not orphaned)", () => {
  const all = closure();
  for (const id of Object.keys(G.nodes)) assert.ok(all.maps.has(id), id + " has no way in");
  assert.ok(all.maps.has("forest") && all.maps.has("wilderness") && all.maps.has("meridia") && all.maps.has("throne"));
  assert.ok(Q.route(MAPS, { hollow_oak_dead: 1 }, "village", "wilderness"), "village to wilderness through the forest once the Heartwood is down");
  assert.equal(Q.route(MAPS, {}, "village", "wilderness"), null, "wilderness is locked until the Heartwood falls");
});

test("objective progression follows flags, and skipping ahead never leaves a stale pointer", () => {
  let st = Q.status(G, {});
  assert.equal(st.current.id, "leave_temple");
  assert.equal(st.mainDone, 0);
  st = Q.status(G, { left_temple: 1 });
  assert.equal(st.current.id, "village_road");
  st = Q.status(G, { left_temple: 1, camp1_done: 1, tut_wisp: 1, hollow_oak_dead: 1 });
  assert.equal(st.current.id, "to_meridia");
  // jumped ahead without the earlier flags (e.g. a save from another build)
  st = Q.status(G, { lyra_joined: 1 });
  assert.equal(st.current.id, "ash_road");
  assert.ok(st.doneIds.leave_temple && st.doneIds.heartwood);
  st = Q.status(G, { slice_ending_seen: 1 });
  assert.equal(st.finished, true);
  assert.equal(st.current, null);
  assert.equal(st.tracked, null);
  // side objectives appear when their 'after' holds and vanish when done
  st = Q.status(G, { left_temple: 1 });
  assert.equal(JSON.stringify(st.sideActive.map((o) => o.id)), JSON.stringify(["side_mira"]));
  st = Q.status(G, { left_temple: 1, quest_acolyte_found: 1, region_meridia: 1, tut_wisp: 1 });
  assert.ok(!st.sideActive.some((o) => o.id === "side_mira"));
  assert.ok(st.sideActive.some((o) => o.id === "side_sera"));
  assert.ok(!st.sideActive.some((o) => o.id === "side_korin"), "korin waits for sera");
  // tracking a side quest swaps the tracked objective, and an invalid choice is ignored
  st = Q.status(G, { left_temple: 1, guide_track: "side_mira" });
  assert.equal(st.tracked.id, "side_mira"); assert.equal(st.current.id, "village_road");
  st = Q.status(G, { left_temple: 1, guide_track: "side_korin" });
  assert.equal(st.tracked.id, "village_road");
});

test("conditions: flag / all / any", () => {
  assert.equal(Q.evalCond({ flag: "a" }, { a: 1 }), true);
  assert.equal(Q.evalCond({ all: [{ flag: "a" }, { flag: "b" }] }, { a: 1 }), false);
  assert.equal(Q.evalCond({ any: [{ flag: "a" }, { flag: "b" }] }, { b: 1 }), true);
  assert.equal(Q.evalCond(undefined, {}), true);
});

test("pointer: same-map target, doorway on another map, locked route reports why", () => {
  const obj = (id) => G.objectives.find((o) => o.id === id);
  let s = Q.nextStep(MAPS, {}, obj("leave_temple"), "temple", { x: 30, y: 20 });
  assert.equal(s.kind, "here"); assert.equal(s.x, 36);
  // village -> forest objective: exit through the south road warps into the forest
  s = Q.nextStep(MAPS, { left_temple: 1 }, obj("forest_trail"), "village", { x: 40, y: 60 });
  assert.equal(s.kind, "exit"); assert.equal(s.toMap, "forest");
  assert.ok(s.y >= 75 && s.x >= 44 && s.x <= 47, "doorway at the village's south road");
  // from the temple the route goes through the village
  s = Q.nextStep(MAPS, { left_temple: 1 }, obj("forest_trail"), "temple", { x: 36, y: 40 });
  assert.equal(s.kind, "exit"); assert.equal(s.toMap, "village");
  // an interior leads back out through its door
  s = Q.nextStep(MAPS, { left_temple: 1, camp1_done: 1 }, obj("village_road"), "house_mira", { x: 6, y: 6 });
  assert.equal(s.kind, "exit"); assert.equal(s.toMap, "village");
  // Meridia's west gate is locked until Lyra: the route still points the way and carries the reason
  s = Q.nextStep(MAPS, { hollow_oak_dead: 1, region_meridia: 1 }, obj("ash_road"), "meridia", { x: 54, y: 40 });
  assert.equal(s.kind, "exit"); assert.equal(s.toMap, "wilderness");
  assert.ok(s.lock && /Lyra/.test(s.lock.text), "lock reason names Lyra");
});

test("world map model: states, locks, route and info panel", () => {
  const flags = { left_temple: 1, camp1_done: 1, tut_wisp: 1, seen_temple: 1, seen_village: 1, seen_forest: 1 };
  const wm = Q.worldModel(MAPS, G, flags, "forest");
  const n = (id) => wm.nodes.find((x) => x.id === id);
  assert.equal(n("forest").state, "current");
  assert.equal(n("village").state, "visited");
  assert.equal(n("meridia").state, "locked");
  assert.ok(wm.nodes.some((x) => x.target), "a next destination is marked");
  assert.equal(n("forest").target, true, "heartwood is in the forest");
  assert.ok(wm.edges.length > 5);
  assert.ok(wm.edges.some((e) => !e.open), "locked connections are drawn as such");
  const wm2 = Q.worldModel(MAPS, G, { left_temple: 1 }, "temple");
  assert.equal(JSON.stringify(wm2.route), JSON.stringify(["temple", "village"]));
  const info = Q.placeInfo(MAPS, G, { left_temple: 1 }, "village");
  assert.ok(info.npcs.length > 3 && info.exits.some((e) => e.id === "forest"));
  assert.ok(info.exits.find((e) => e.id === "forest").open);
});

test("quest.js is the only module the game needs: game.js hooks are minimal", () => {
  const hooks = GAME.split("\n").filter((l) => /\bQuest\./.test(l));
  assert.ok(hooks.length <= 3, "game.js should only attach and call frame: " + hooks.join(" | "));
  const html = read("index.html");
  assert.ok(html.includes("js/quest.js") && html.includes("css/quest.css"));
  assert.ok(html.indexOf("js/quest.js") < html.indexOf("js/content-loader.js"), "quest.js loads before the game boots");
});
