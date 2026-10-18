// Walking distance / time between consecutive main-chain objectives (quest guide + map graph).
// Shared by scripts/measure-travel.mjs and tests/travel.test.mjs.
// Model: Dijkstra on the tile grid (8-way, no corner cutting), walking from the finished objective to the next one
// through the shortest open route of warps; running (RUN speed) once a single-map path is longer than RUN_AFTER tiles
// (the tap-to-move auto-run rule); WARP_COST seconds per map change (fade + loading).
import fs from "node:fs";
import vm from "node:vm";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");
const GAME = read("js/game.js");
const T = 32;
export const SPEED_MULT = Number(/walkSpeedMult: ([\d.]+)/.exec(read("js/config.js"))[1]), RUN_PATH = Number(/RUN_PATH_TILES = (\d+)/.exec(GAME)[1]);
export const WALK_BASE = Number(/WALK_SPEED = ([\d.]+)/.exec(GAME)[1]), RUN_BASE = Number(/RUN_SPEED = ([\d.]+)/.exec(GAME)[1]);

const ctx = { window: {} };
ctx.window = ctx;
vm.createContext(ctx);
for (const f of ["js/content.js", "js/maps.js", "js/dialogue.js", "js/quest.js"]) vm.runInContext(read(f), ctx, { filename: f });
export const { DATA, MAPS, Quest: Q } = ctx;
export { T };
const SOLID = new Set(JSON.parse(/const SOLID = new Set\((\[[\d,\s]+\])\)/.exec(GAME)[1]));

let curFlags = {};
export const setFlags = (f) => { curFlags = f; };
export const isBlocked = blocked;
function blocked(m, x, y) {
  if (x < 0 || y < 0 || x >= m.w || y >= m.h) return true;
  const t = m.tiles[y][x];
  if (SOLID.has(t)) return true;
  if (t === 6 && !m.indoors) return true;
  return (m.events || []).some((e) => (e.type === "npc" || e.type === "encounter") && e.x === x && e.y === y &&
    !(e.appearIfOff && curFlags[e.appearIfOff]) && !(e.once && curFlags[e.once]) && !(e.appearIf && !curFlags[e.appearIf]));
}
// shortest tile distance on one map from a to b (b may itself be blocked: stop adjacent)
export function dist(mapId, a, b) {
  const m = MAPS[mapId], W = m.w;
  const D = new Float64Array(W * m.h).fill(Infinity);
  const open = [[0, a.x, a.y]]; D[a.y * W + a.x] = 0;
  const goalBlocked = blocked(m, b.x, b.y);
  let best = Infinity;
  while (open.length) {
    let bi = 0; for (let i = 1; i < open.length; i++) if (open[i][0] < open[bi][0]) bi = i;
    const [d, x, y] = open.splice(bi, 1)[0];
    if (d > D[y * W + x]) continue;
    if (x === b.x && y === b.y) return d;
    if (goalBlocked && Math.abs(x - b.x) <= 1 && Math.abs(y - b.y) <= 1) best = Math.min(best, d + 1);
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
      if (!dx && !dy) continue;
      const nx = x + dx, ny = y + dy;
      if (blocked(m, nx, ny)) continue;
      if (dx && dy && (blocked(m, x + dx, y) || blocked(m, x, y + dy))) continue;
      const nd = d + (dx && dy ? Math.SQRT2 : 1);
      if (nd < D[ny * W + nx]) { D[ny * W + nx] = nd; open.push([nd, nx, ny]); }
    }
  }
  return best;
}
// Walk from `from` ({map,x,y}) to objective `o` following the route; returns {tiles, secs, hops} or null.
export function walk(flags, from, o, opt) {
  const { walk: WALK, run: RUN, runAfter, warpCost, norun } = opt;
  curFlags = flags;
  const secs = (tiles) => tiles * T / 1000 / (!norun && tiles > runAfter ? RUN : WALK);
  const path = Q.route(MAPS, flags, from.map, o.map, false);
  if (!path) return null;
  let cur = { x: from.x, y: from.y }, tiles = 0, time = 0;
  const plan = Q.planHops(MAPS, flags, path, cur, o, (mapId, a, b) => dist(mapId, a, b));
  for (let i = 0; i + 1 < path.length; i++) {
    const w = plan[i], d = dist(path[i], cur, { x: w.x, y: w.y });
    tiles += d; time += secs(d) + warpCost;
    cur = { x: w.tx, y: w.ty };
  }
  const d = dist(o.map, cur, { x: o.x, y: o.y });
  tiles += d; time += secs(d);
  return { tiles, secs: time, hops: path.length - 1 };
}
export function defaults(over) {
  const mult = over && over.mult !== undefined ? over.mult : SPEED_MULT;
  return Object.assign({ walk: WALK_BASE * mult, run: RUN_BASE * mult, runAfter: (over && over.runAfter) || RUN_PATH, warpCost: 0.8, norun: false }, over || {}, { });
}
// Every consecutive main-chain hop, starting from a new game at the temple spawn.
export function chain(over) {
  const opt = defaults(over);
  const main = DATA.GUIDE.objectives.filter((o) => o.track === "main");
  const rows = [];
  let pos = { map: "temple", x: MAPS.temple.spawn.x, y: MAPS.temple.spawn.y }, flags = { intro_done: 1 };
  main.forEach((o, k) => {
    const r = walk(flags, pos, o, opt);
    rows.push(Object.assign({ n: k + 1, id: o.id, from: pos.map, to: o.map }, r || { tiles: Infinity, secs: Infinity, hops: 0 }));
    Q.condFlags(o.done).forEach((f) => { flags[f] = 1; });
    if (o.id === "heartwood") flags.hollow_oak_dead = 1;
    flags["region_" + o.map] = 1;
    pos = { map: o.map, x: o.x, y: o.y };
  });
  return rows;
}
