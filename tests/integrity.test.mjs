// World integrity: every warp / scene destination is standable, and every
// scene and battle in the data tables is reachable from somewhere.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");

const ctx = { window: {} };
vm.createContext(ctx);
for (const f of ["js/content.js", "js/maps.js", "js/dialogue.js"]) vm.runInContext(read(f), ctx, { filename: f });
const { DATA, MAPS, SCENES } = ctx.window;
const GAME = read("js/game.js");
const SOLID = new Set(JSON.parse(/const SOLID = new Set\((\[[\d,\s]+\])\)/.exec(GAME)[1]));
const WOOD = 6;

// Content that exists but is intentionally not placed yet. Keep this empty
// unless a follow-up commit is about to wire the entry in.
const UNPLACED_SCENES = new Set([
  // Camp chats + side scenes, wired to lotus altars in the next commit.
  "leaving_temple", "midnight_watch", "sparring_scene", "lyra_backstory", "thorn_confession",
  "kael_letter_alone", "elara_doubt", "dawn_banter", "post_meridia_skirmish", "quest_herbalist"
]);
const UNPLACED_BATTLES = new Set(["meridia_knights", "court_echoes", "court_knights", "forest_revenants"]);

function blockedByEvent(m, x, y) {
  return (m.events || []).some((ev) => (ev.type === "npc" || ev.type === "encounter") && ev.x === x && ev.y === y);
}
function walkable(mapId, x, y) {
  const m = MAPS[mapId];
  if (!m || y < 0 || x < 0 || y >= m.h || x >= m.w) return false;
  const tt = m.tiles[y][x];
  if (SOLID.has(tt)) return false;
  if (tt === WOOD && !m.indoors) return false;
  return !blockedByEvent(m, x, y);
}
// Standable and not boxed in: at least one neighbour is also walkable.
function standable(mapId, x, y) {
  if (!walkable(mapId, x, y)) return false;
  return [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => walkable(mapId, x + dx, y + dy));
}

// Every scene/battle id the engine or data can start.
function referenced() {
  const scenes = new Set(), battles = new Set();
  for (const m of Object.values(MAPS)) {
    for (const ev of m.events || []) {
      if (ev.scene) scenes.add(ev.scene);
      if (ev.battle) battles.add(ev.battle);
    }
  }
  for (const sc of Object.values(SCENES)) {
    if (sc.onEnd?.scene) scenes.add(sc.onEnd.scene);
    if (sc.onEnd?.battle) battles.add(sc.onEnd.battle);
  }
  for (const c of DATA.CAMP_CHATS || []) scenes.add(c.scene);
  for (const [, id] of GAME.matchAll(/startScene\("([a-z0-9_]+)"\)/g)) scenes.add(id);
  for (const [, id] of GAME.matchAll(/startBattle\("([a-z0-9_]+)"\)/g)) battles.add(id);
  // A battle's aftermath scene is only reachable if the battle is.
  for (const id of battles) { const post = DATA.BATTLES[id]?.post; if (post) scenes.add(post); }
  return { scenes, battles };
}

test("map spawns are standable", () => {
  for (const [id, m] of Object.entries(MAPS)) {
    if (!m.spawn) continue;
    assert.ok(standable(id, m.spawn.x, m.spawn.y), `${id} spawn ${m.spawn.x},${m.spawn.y}`);
  }
});

test("every warp lands on a standable tile of an existing map", () => {
  for (const [id, m] of Object.entries(MAPS)) {
    for (const ev of m.events || []) {
      if (ev.type !== "warp") continue;
      assert.ok(MAPS[ev.map], `${id} warp at ${ev.x},${ev.y} -> missing map ${ev.map}`);
      assert.ok(standable(ev.map, ev.tx, ev.ty), `${id} warp at ${ev.x},${ev.y} -> ${ev.map} ${ev.tx},${ev.ty} is not standable`);
    }
  }
});

test("every scene that moves the party lands on a standable tile", () => {
  for (const [id, sc] of Object.entries(SCENES)) {
    const end = sc.onEnd;
    if (!end || end.type !== "map" || !end.map) continue;
    const m = MAPS[end.map];
    assert.ok(m, `${id} -> missing map ${end.map}`);
    const x = end.x ?? m.spawn.x, y = end.y ?? m.spawn.y;
    assert.ok(standable(end.map, x, y), `${id} ends on ${end.map} ${x},${y}, which is not standable`);
  }
});

test("every referenced scene, battle, talk and enemy exists", () => {
  const { scenes, battles } = referenced();
  for (const s of scenes) assert.ok(SCENES[s], `missing scene ${s}`);
  for (const b of battles) assert.ok(DATA.BATTLES[b], `missing battle ${b}`);
  for (const [id, m] of Object.entries(MAPS)) {
    for (const ev of m.events || []) if (ev.talk) assert.ok(DATA.NPC_TALK[ev.talk], `${id}: missing talk ${ev.talk}`);
  }
  for (const [id, b] of Object.entries(DATA.BATTLES)) {
    for (const e of b.enemies) assert.ok(DATA.ENEMIES[e], `${id}: missing enemy ${e}`);
  }
});

test("every scene and battle is reachable", () => {
  const { scenes, battles } = referenced();
  const orphanScenes = Object.keys(SCENES).filter((s) => !scenes.has(s) && !UNPLACED_SCENES.has(s));
  const orphanBattles = Object.keys(DATA.BATTLES).filter((b) => !battles.has(b) && !UNPLACED_BATTLES.has(b));
  assert.deepEqual(orphanScenes, [], "scenes nothing starts");
  assert.deepEqual(orphanBattles, [], "battles nothing starts");
});

test("story gates: Meridia needs the Heartwood, the pass needs Lyra, the court needs the Warden", () => {
  const wild = MAPS.wilderness.events;
  const toMeridia = wild.filter((e) => e.type === "warp" && e.map === "meridia");
  assert.ok(toMeridia.length && toMeridia.every((e) => e.needFlag === "hollow_oak_dead"));
  const toAshen = wild.filter((e) => e.type === "warp" && e.map === "ashen");
  assert.ok(toAshen.length && toAshen.every((e) => e.needFlag === "lyra_joined"));
  assert.ok(!wild.some((e) => e.battle === "gate_warden" || e.battle === "hollow_oak"), "no duplicate story bosses in the wilderness");
  assert.ok(MAPS.ashen.events.some((e) => e.battle === "gate_warden"));
  const toRuins = MAPS.ashen.events.filter((e) => e.type === "warp" && e.map === "ruins");
  assert.ok(toRuins.every((e) => e.needFlag === "warden_dead"));
});
