/* =============================================================================
   World renderer — isometric 2.5D view over the tile-grid maps.
   The map data, collision and events stay in world space (32 px tiles); this
   module only projects them: iso(x, y) = ((x - y) * 40, (x + y) * 20) / 32
   logical px at zoom 1. Ground is drawn tile by tile from a pre-rendered
   atlas, then blocks/props/characters in diagonal (depth) order, then light.
   No per-frame allocations: entity records and scratch arrays are pooled.
   Also: sprite-sheet character drawing (SothWorld.drawChar) and A* paths.
   ============================================================================= */
(() => {
  const ART = window.SOTH_ART;
  const images = {};
  const Art = {
    ready: false,
    load() {
      if (!ART) return Promise.resolve(false);
      const list = [["world", ART.world.src]];
      for (const k of Object.keys(ART.chars)) list.push([k, ART.chars[k].src]);
      if (ART.terrain) {
        for (const k of Object.keys(ART.terrain.materials)) list.push(["t:" + k, ART.terrain.materials[k]]);
        if (ART.terrain.caustics) list.push(["caustics", ART.terrain.caustics]);
      }
      return Promise.all(list.map(([k, src]) => new Promise((res) => {
        const im = new Image();
        im.onload = () => { images[k] = im; res(true); };
        im.onerror = () => res(false);
        im.src = src;
      }))).then((r) => { Art.ready = r.every(Boolean); return Art.ready; });
    },
    has(sheet) { return !!images[sheet]; }
  };
  const F = ART ? ART.world.frames : {};
  const fr = (n) => F[n] || null;

  // ---------------------------------------------------------------------------
  // Characters
  // ---------------------------------------------------------------------------
  const YAWS = [0, 45, 90, 135, 180];
  // Screen-space direction -> {yaw, flip}. vx,vy are screen deltas.
  function facing(vx, vy, out) {
    let a = Math.atan2(-vx, vy) * 180 / Math.PI;     // 0 = down, +90 = left
    out.flip = a < 0;
    a = Math.abs(a);
    out.yaw = YAWS[Math.min(4, Math.round(a / 45))];
    return out;
  }
  const rowCache = {};
  function rowOf(sheet, anim, yaw) {
    const key = sheet + "|" + anim + "|" + yaw;
    let r = rowCache[key];
    if (r === undefined) {
      const L = ART.chars[sheet];
      r = (L && L.rows && L.rows[anim + ":" + yaw]) || null;
      rowCache[key] = r;
    }
    return r;
  }
  // Draw one frame of a hero sheet. (x, y) = feet in logical px; k = logical px per source px.
  function drawChar(ctx, sheet, anim, yaw, frame, x, y, k, flip, alpha) {
    const im = images[sheet];
    const L = ART && ART.chars[sheet];
    if (!im || !L) return false;
    let row = rowOf(sheet, anim, yaw);
    if (!row) row = rowOf(sheet, "idle", yaw) || rowOf(sheet, "idle", 0);
    if (!row) return false;
    const f = ((frame % row[1]) + row[1]) % row[1];
    const sx = f * L.fw, sy = row[0] * L.fh;
    const w = L.fw * k, h = L.fh * k;
    if (alpha != null) ctx.globalAlpha = alpha;
    if (flip) {
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(-1, 1);
      ctx.drawImage(im, sx, sy, L.fw, L.fh, -L.ax * k, -L.ay * k, w, h);
      ctx.restore();
    } else {
      ctx.drawImage(im, sx, sy, L.fw, L.fh, x - L.ax * k, y - L.ay * k, w, h);
    }
    if (alpha != null) ctx.globalAlpha = 1;
    return true;
  }
  const NPC_MAP = {
    suyin: "abbess", ren: "acolyte", mira: "acolyte_f", monk: "monk", wen: "elder", pilgrim: "villager",
    jori: "child", jori2: "child", kid2: "child", fisherman: "villager", boatman: "villager",
    hana: "villager_f", hana_out: "villager_f", baker: "baker", baker2: "baker", florist: "villager_f",
    shen: "elder", hermit: "hermit", captain: "guard", guard: "guard", guard2: "guard", granny: "elder",
    herbalist: "villager_f", echo: "echo", bard: "bard", sera: "villager_f", korin: "smith", keeper: "elder"
  };
  function npcVariant(id) {
    if (!id) return "villager";
    if (id.indexOf("lyra") === 0) return "@lyra";
    if (id === "thorn") return "@thorn";
    return NPC_MAP[id] || "villager";
  }
  function drawNpc(ctx, id, yaw, frame, x, y, k, flip) {
    const v = npcVariant(id);
    if (v[0] === "@") return drawChar(ctx, v.slice(1), "idle", yaw, frame, x, y, k, flip);
    const im = images.npcs, L = ART && ART.chars.npcs;
    if (!im || !L) return false;
    const row = L.rows[v];
    if (row == null) return false;
    const col = YAWS.indexOf(yaw) * 2 + (frame & 1);
    const sx = col * L.fw, sy = row * L.fh;
    if (flip) {
      ctx.save(); ctx.translate(x, y); ctx.scale(-1, 1);
      ctx.drawImage(im, sx, sy, L.fw, L.fh, -L.ax * k, -L.ay * k, L.fw * k, L.fh * k);
      ctx.restore();
    } else ctx.drawImage(im, sx, sy, L.fw, L.fh, x - L.ax * k, y - L.ay * k, L.fw * k, L.fh * k);
    return true;
  }
  // k = logical px per sheet px at scale 2; frames from the world atlas scale by its own factor.
  function drawFrame(ctx, f, x, y, k) {
    if (!f) return;
    k = k * 2 / (ART && ART.world.scale || 2);
    ctx.drawImage(images.world, f[0], f[1], f[2], f[3], x - f[4] * k, y - f[5] * k, f[2] * k, f[3] * k);
  }

  // ---------------------------------------------------------------------------
  // A* on the tile grid (8-way, no corner cutting). Typed arrays reused per size.
  // ---------------------------------------------------------------------------
  let pf = null;
  function pfAlloc(n) {
    if (pf && pf.n >= n) return pf;
    pf = { n, g: new Float32Array(n), f: new Float32Array(n), par: new Int32Array(n), stamp: new Uint32Array(n), closed: new Uint32Array(n), heap: new Int32Array(n), gen: 1 };
    return pf;
  }
  // blocked(tx, ty) -> bool. Returns array of [tx, ty] from start (exclusive) to goal, or null.
  function findPath(w, h, blocked, sx, sy, gx, gy, maxNodes) {
    if (gx < 0 || gy < 0 || gx >= w || gy >= h) return null;
    const n = w * h, P = pfAlloc(n);
    const gen = ++P.gen;
    const { g, f, par, stamp, closed, heap } = P;
    let hn = 0;
    const H = (x, y) => { const dx = Math.abs(x - gx), dy = Math.abs(y - gy); return (dx + dy) + (1.4142 - 2) * Math.min(dx, dy); };
    const push = (i) => {
      let c = hn++; heap[c] = i;
      while (c > 0) { const p = (c - 1) >> 1; if (f[heap[p]] <= f[heap[c]]) break; const t = heap[p]; heap[p] = heap[c]; heap[c] = t; c = p; }
    };
    const pop = () => {
      const top = heap[0]; heap[0] = heap[--hn];
      let c = 0;
      for (;;) {
        const l = c * 2 + 1, r = l + 1; let m = c;
        if (l < hn && f[heap[l]] < f[heap[m]]) m = l;
        if (r < hn && f[heap[r]] < f[heap[m]]) m = r;
        if (m === c) break;
        const t = heap[m]; heap[m] = heap[c]; heap[c] = t; c = m;
      }
      return top;
    };
    const s = sy * w + sx, goal = gy * w + gx;
    g[s] = 0; f[s] = H(sx, sy); par[s] = -1; stamp[s] = gen; push(s);
    let expanded = 0;
    const limit = maxNodes || 24000;
    while (hn > 0) {
      const cur = pop();
      if (closed[cur] === gen) continue;
      closed[cur] = gen;
      if (cur === goal) break;
      if (++expanded > limit) return null;
      const cx = cur % w, cy = (cur / w) | 0;
      for (let d = 0; d < 8; d++) {
        const dx = d < 4 ? (d === 0 ? 1 : d === 1 ? -1 : 0) : (d & 1 ? 1 : -1);
        const dy = d < 4 ? (d === 2 ? 1 : d === 3 ? -1 : 0) : (d < 6 ? 1 : -1);
        const nx = cx + dx, ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const ni = ny * w + nx;
        if (closed[ni] === gen) continue;
        if (ni !== goal && blocked(nx, ny)) continue;
        if (ni === goal && blocked(nx, ny) && (dx && dy)) continue;
        if (dx && dy && (blocked(cx + dx, cy) || blocked(cx, cy + dy))) continue;
        const ng = g[cur] + (dx && dy ? 1.4142 : 1);
        if (stamp[ni] !== gen || ng < g[ni]) {
          stamp[ni] = gen; g[ni] = ng; f[ni] = ng + H(nx, ny); par[ni] = cur; push(ni);
        }
      }
    }
    if (closed[goal] !== gen) return null;
    const out = [];
    for (let i = goal; i !== s && i !== -1; i = par[i]) out.push([i % w, (i / w) | 0]);
    out.reverse();
    return out;
  }

  // ---------------------------------------------------------------------------
  // Themes and tile classification
  // ---------------------------------------------------------------------------
  // Ground is painted from seamless materials (assets/art/terrain/*.jpg).
  // pri: paint order (higher paints over lower at a shared edge); hard: crisp
  // crafted edge (stone, planks) instead of an organic noise-broken one.
  const MATS = {
    dirt: [1, 0], ash: [1, 0], corrupt: [1, 0], cobble: [2, 0], plaza: [2, 1], rim: [3, 1],
    slab: [3, 1], pale: [3, 1], marble: [3, 1], wood: [3, 1], bridge: [4, 1], border: [4, 1], inlay: [5, 1],
    grass: [6, 0], grass_dark: [6, 0], grass_dusk: [6, 0], flowerbed: [7, 0]
  };
  const MAT_NAMES = Object.keys(MATS);
  const MAT_ID = {};
  MAT_NAMES.forEach((n, i) => { MAT_ID[n] = i; });
  const NONE = 255;
  const THEMES = {
    temple: { wall: "stone", roof: "roof_slate", trees: ["tree_blossom0", "tree_blossom1", "tree_oak0", "tree_blossom0", "tree_pine0"], grass: "grass_dusk", path: "slab", floor: "slab", gold: "inlay", carpet: "border", hedge: "flowerbed", rim: "rim", oob: "grass_dusk", lamp: "lantern", column: "column_red", wwall: "wall_pavilion", bg: "#1b2418", dusk: 0.24, stonePond: true, courtyard: true },
    village: { wall: "plaster", roof: "roof_green", trees: ["tree_oak0", "tree_oak1", "tree_oak2", "tree_blossom0"], grass: "grass", path: "cobble", floor: "wood", rim: "dirt", oob: "grass", bg: "#1d3219", dusk: 0 },
    forest: { wall: "stone", roof: "roof_green", trees: ["tree_oak0", "tree_pine0", "tree_oak1", "tree_pine1", "tree_oak2"], grass: "grass_dark", path: "dirt", floor: "wood", rim: "dirt", oob: "grass_dark", bg: "#142414", dusk: 0.12 },
    wilderness: { wall: "stone", roof: "roof_green", trees: ["tree_oak0", "tree_pine0", "tree_oak1", "tree_pine1"], grass: "grass", path: "dirt", floor: "wood", rim: "dirt", oob: "grass", bg: "#172a16", dusk: 0 },
    meridia: { wall: "plaster", roof: "roof_red", trees: ["tree_oak1", "tree_oak2", "tree_blossom1"], grass: "grass", path: "cobble", floor: "plaza", rim: "rim", oob: "grass", bg: "#1d3219", dusk: 0.1, stonePond: true },
    ashen: { wall: "stone", roof: "roof_slate", trees: ["tree_dead0", "tree_pine1", "tree_dead1"], grass: "grass_dark", path: "dirt", floor: "pale", rim: "dirt", oob: "ash", bg: "#1c1a1c", dusk: 0.2 },
    ruins: { wall: "stone", roof: "roof_slate", trees: ["tree_dead0", "tree_dead1"], grass: "grass_dark", path: "dirt", floor: "pale", rim: "rim", oob: "ash", bg: "#181418", dusk: 0.25 },
    throne: { wall: "stone", roof: "roof_slate", trees: ["tree_dead0", "tree_dead1"], grass: "grass_dark", path: "pale", floor: "marble", rim: "rim", oob: null, bg: "#140e12", dusk: 0.3 },
    _indoor: { wall: "wood", roof: "roof_slate", trees: ["tree_oak0"], grass: "grass", path: "wood", floor: "wood", rim: "wood", oob: null, bg: "#0b090f", dusk: 0 }
  };
  const OCCLUDE = new Set([4, 6, 7, 9, 13, 20, 21, 22, 28, 31, 34, 36, 37, 17]);
  function hash(x, y) { let h = (x * 374761393 + y * 668265263) ^ 0x5bd1e995; h = Math.imul(h ^ (h >>> 13), 1274126177); return (h ^ (h >>> 16)) >>> 0; }
  function pick(list, x, y) { return list[hash(x, y) % list.length]; }

  // returns [groundMaterial, objectFrame, water(0 none / 1 / 2 deep)]
  function classify(m, id, x, y, th, indoor) {
    const t = m.tiles[y][x];
    const g = th.grass, p = th.path, f = th.floor;
    const W = th.wall;
    switch (t) {
      case 0: return [indoor ? null : th.oob, null, 0];
      case 1: return [g, null, 0];
      case 2: return [p, null, 0];
      case 3: return [th.rim, null, 1];
      case 4: return [f, "wall_" + W, 0];
      case 5: return [f, null, 0];
      case 6: return indoor ? ["wood", null, 0] : [f, th.roof, 0];
      case 7: return [g, pick(th.trees, x, y), 0];
      case 8: return ["bridge", null, 0];
      case 9: return [f, th.roof, 0];
      case 10: return [indoor ? f : g, "altar", 0];
      case 11: return [g, "fence", 0];
      case 12: return [p, th.lamp || "lamp", 0];
      case 13: return [f, "wall_" + W + "_door", 0];
      case 14: return [th.carpet || "border", null, 0];
      case 15: return ["dirt", "rubble" + (hash(x, y) & 1), 0];
      case 16: return ["ash", null, 0];
      case 17: return [id === "ashen" || id === "throne" ? "ash" : "dirt", "rock_big" + (hash(x, y) & 1), 0];
      case 18: return ["corrupt", null, 0];
      case 19: return [th.rim, "lily" + (hash(x, y) & 1), 1];
      case 20: return [th.hedge || g, hash(x, y) % 3 === 0 ? "bushf" : "bush" + (hash(x, y) & 1), 0];
      case 21: return [f, th.wwall || "wall_wood", 0];
      case 22: return [f, th.column || "column", 0];
      case 23: return ["pale", null, 0];
      case 24: return ["plaza", null, 0];
      case 25: return ["dirt", null, 0];
      case 26: return ["marble", null, 0];
      case 27: return ["flowerbed", null, 0];
      case 28: return [g, "statue", 0];
      case 29: return [indoor ? "wood" : p, "crate", 0];
      case 30: return [indoor ? "wood" : "plaza", "stairs", 0];
      case 31: return [f, "wall_" + W + "_win", 0];
      case 32: return [th.rim, null, 2];
      case 33: return [indoor ? "wood" : p, "bench", 0];
      case 34: return ["plaza", "fountain", 0];
      case 35: return [th.gold || "inlay", null, 0];
      case 36: return [g, "stall", 0];
      case 37: return ["corrupt", "tree_dead" + (hash(x, y) & 1), 0];
      default: return [g, null, 0];
    }
  }

  // Periodic value noise (world-space, so chunk seams match).
  const NZ = 64, nzTab = new Float32Array(NZ * NZ);
  for (let i = 0; i < nzTab.length; i++) nzTab[i] = (hash(i % NZ, (i / NZ) | 0) & 0xffff) / 0xffff;
  function vnoise(x, y) {
    const xi = Math.floor(x), yi = Math.floor(y), tx = x - xi, ty = y - yi;
    const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
    const x0 = ((xi % NZ) + NZ) % NZ, y0 = ((yi % NZ) + NZ) % NZ, x1 = (x0 + 1) % NZ, y1 = (y0 + 1) % NZ;
    const a = nzTab[y0 * NZ + x0], b = nzTab[y0 * NZ + x1], c = nzTab[y1 * NZ + x0], d = nzTab[y1 * NZ + x1];
    return (a + (b - a) * sx) + ((c + (d - c) * sx) - (a + (b - a) * sx)) * sy;
  }
  const smooth = (e0, e1, v) => { const t = Math.min(1, Math.max(0, (v - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };

  // ---------------------------------------------------------------------------
  // Renderer
  // ---------------------------------------------------------------------------
  const TER = ART && ART.terrain;
  const D = TER ? TER.d : 160;          // texels per tile in baked ground chunks
  const CN = 6;                          // tiles per chunk side
  const MT = 0.25;                       // chunk overlap margin (tiles) - hides seams
  const MR = 20;                         // mask texels per tile
  const CS = Math.round((CN + 2 * MT) * D);
  const MS = Math.round((CN + 2 * MT) * MR);
  const MAX_CHUNKS = 26;
  const GM = 112;                 // ground cache margin (logical px)
  const PSCALE = ART ? (ART.world.scale || 2) : 2;

  function create(env) {
    const { ctx, W, H, T } = env;
    const HW = 40, HH = 20;                 // half diamond (logical, zoom 1)
    const prepCache = new WeakMap();
    const view = { z: 1.3, camX: 0, camY: 0 };
    const tmpFace = { yaw: 0, flip: false };
    const ground = { cv: null, c: null, ok: false, full: false, map: null, s: 0, ox: 0, oy: 0, v: -1 };
    const visCh = [];
    let lastZ = -1, chunkGen = 0;
    const stats = { bakes: 0, bakeMs: 0, bakeMax: 0, chunks: 0 };
    let lightCanvas = null, lightCtx = null, vignette = null, skyGrad = null;
    const labels = new Map();
    // bake scratch
    const tmp = document.createElement("canvas"); tmp.width = CS; tmp.height = CS;
    const tctx = tmp.getContext("2d");
    const mask = document.createElement("canvas"); mask.width = MS; mask.height = MS;
    const mctx = mask.getContext("2d");
    const mdata = mctx.createImageData(MS, MS);
    const field = new Float32Array(MS * MS);
    const pats = {};
    function pat(c, name) {
      const key = name;
      let p = c === tctx ? pats[key] : (pats["m:" + key]);
      if (p) return p;
      const im = images["t:" + name];
      if (!im) return null;
      p = c.createPattern(im, "repeat");
      if (c === tctx) pats[key] = p; else pats["m:" + key] = p;
      return p;
    }
    const chunks = new Map();
    let chunkMap = null, syncBake = true;

    function prepare(m) {
      let p = prepCache.get(m);
      if (p && p.tiles === m.tiles) return p;
      const id = m.id || "";
      const th0 = THEMES[id];
      const theme = th0 && (th0.courtyard || !m.indoors) ? th0 : (m.indoors ? THEMES._indoor : THEMES.wilderness);
      const indoor = !!m.indoors && !theme.courtyard;
      const n = m.w * m.h;
      const mat = new Uint8Array(n).fill(NONE), obj = new Array(n), water = new Uint8Array(n), occ = new Uint8Array(n), nearW = new Uint8Array(n);
      const lights = [];
      for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) {
        const i = y * m.w + x;
        const [gname, oname, wt] = classify(m, id, x, y, theme, indoor);
        mat[i] = gname && MAT_ID[gname] != null ? MAT_ID[gname] : NONE;
        water[i] = wt;
        let of = null;
        if (oname === "fence") {
          const t = m.tiles;
          const horiz = (x > 0 && t[y][x - 1] === 11) || (x < m.w - 1 && t[y][x + 1] === 11);
          of = fr(horiz ? "fence_x" : "fence_y");
        } else if (oname) of = fr(oname);
        obj[i] = of;
        const tt = m.tiles[y][x];
        if (OCCLUDE.has(tt) && !(tt === 6 && indoor)) occ[i] = tt === 7 || tt === 37 ? 2 : 1;
        if (tt === 12) lights.push(x, y, 0);
        else if (tt === 10) lights.push(x, y, 1);
        else if (tt === 31 && !indoor) lights.push(x, y, 2);
      }
      for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) {
        if (!obj[y * m.w + x]) continue;
        for (let dy = 0; dy <= 2 && !nearW[y * m.w + x]; dy++) for (let dx = -1; dx <= 2; dx++) {
          const xx = x + dx, yy = y + dy;
          if (xx >= 0 && yy >= 0 && xx < m.w && yy < m.h && water[yy * m.w + xx]) { nearW[y * m.w + x] = 1; break; }
        }
      }
      // Courtyard centrepieces: one big engraved lotus mandala per solid gold-court region.
      const mandalas = [];
      const seen = new Uint8Array(n);
      for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) {
        const i0 = y * m.w + x;
        if (seen[i0] || m.tiles[y][x] !== 35) continue;
        let minx = x, maxx = x, miny = y, maxy = y, area = 0;
        const st = [i0]; seen[i0] = 1;
        while (st.length) {
          const i = st.pop(), xx = i % m.w, yy = (i / m.w) | 0;
          area++; minx = Math.min(minx, xx); maxx = Math.max(maxx, xx); miny = Math.min(miny, yy); maxy = Math.max(maxy, yy);
          const nb = [i - 1, i + 1, i - m.w, i + m.w];
          for (let q = 0; q < 4; q++) {
            const j = nb[q];
            if (j < 0 || j >= n || seen[j] || (q < 2 && ((j / m.w) | 0) !== yy)) continue;
            if (m.tiles[(j / m.w) | 0][j % m.w] !== 35) continue;
            seen[j] = 1; st.push(j);
          }
        }
        const bw = maxx - minx + 1, bh = maxy - miny + 1;
        if (area >= 16 && area / (bw * bh) > 0.7) mandalas.push((minx + maxx + 1) / 2, (miny + maxy + 1) / 2, Math.min(bw, bh) / 2 - 0.35);
      }
      const oobTree = indoor ? null : theme.trees.map(fr).filter(Boolean);
      const oobMat = theme.oob && MAT_ID[theme.oob] != null ? MAT_ID[theme.oob] : NONE;
      p = { id, tiles: m.tiles, theme, indoor, mandalas, mat, obj, water, occ, nearW, lights, oobTree, oobMat, w: m.w, h: m.h };
      prepCache.set(m, p);
      return p;
    }
    function matAt(p, x, y) { return x < 0 || y < 0 || x >= p.w || y >= p.h ? p.oobMat : p.mat[y * p.w + x]; }
    function waterAt(p, x, y) { return x < 0 || y < 0 || x >= p.w || y >= p.h ? 0 : p.water[y * p.w + x] ? 1 : 0; }
    function occAt(p, x, y) { return x < 0 || y < 0 || x >= p.w || y >= p.h ? (p.oobMat !== NONE && (hash(x, y) % 5) <= 2 ? 2 : 0) : p.occ[y * p.w + x]; }

    // Fill `field` with a smooth 0..1 coverage of tiles where test(x,y) holds.
    // hard: square crisp edges; amp: organic noise break-up amount.
    function computeField(tx0, ty0, test, hard, amp) {
      const g = new Uint8Array((CN + 3) * (CN + 3));
      const gw = CN + 3;
      for (let j = 0; j < gw; j++) for (let i = 0; i < gw; i++) g[j * gw + i] = test(tx0 - 1 + i, ty0 - 1 + j) ? 1 : 0;
      let any = 0, all = 1;
      for (let k = 0; k < g.length; k++) { any |= g[k]; all &= g[k]; }
      if (!any) return 0;
      if (all) return 2;
      for (let j = 0; j < MS; j++) {
        const v = ty0 - MT + (j + 0.5) / MR;
        const fv = v - 0.5, jv = Math.floor(fv); let tv = fv - jv;
        if (hard) tv = smooth(0.44, 0.56, tv);
        const gy = jv - (ty0 - 1);
        for (let i = 0; i < MS; i++) {
          const u = tx0 - MT + (i + 0.5) / MR;
          const fu = u - 0.5, iu = Math.floor(fu); let tu = fu - iu;
          if (hard) tu = smooth(0.44, 0.56, tu);
          const gx = iu - (tx0 - 1);
          const a = g[gy * gw + gx], b = g[gy * gw + gx + 1], c = g[(gy + 1) * gw + gx], d = g[(gy + 1) * gw + gx + 1];
          let val = (a + (b - a) * tu) * (1 - tv) + (c + (d - c) * tu) * tv;
          if (amp && val > 0.02 && val < 0.98) val += (vnoise(u * 1.6, v * 1.6) - 0.5) * amp + (vnoise(u * 5.1 + 17, v * 5.1) - 0.5) * amp * 0.5;
          field[j * MS + i] = val;
        }
      }
      return 1;
    }
    function maskFrom(fn) {
      const d = mdata.data;
      for (let k = 0, q = 0; k < field.length; k++, q += 4) {
        d[q] = d[q + 1] = d[q + 2] = 255;
        d[q + 3] = Math.round(255 * fn(field[k], k));
      }
      mctx.putImageData(mdata, 0, 0);
      return mask;
    }
    function colorMask(r, g, b, fn) {
      const d = mdata.data;
      for (let k = 0, q = 0; k < field.length; k++, q += 4) {
        d[q] = r; d[q + 1] = g; d[q + 2] = b;
        d[q + 3] = Math.round(255 * fn(field[k], k));
      }
      mctx.putImageData(mdata, 0, 0);
      return mask;
    }
    function layer(c, name, ox, oy, maskCanvas, op) {
      const pt = pat(tctx, name);
      if (!pt) return;
      tctx.globalCompositeOperation = "source-over";
      tctx.clearRect(0, 0, CS, CS);
      tctx.save(); tctx.translate(-ox, -oy); tctx.fillStyle = pt; tctx.fillRect(ox, oy, CS, CS); tctx.restore();
      if (maskCanvas) {
        tctx.globalCompositeOperation = "destination-in";
        tctx.imageSmoothingEnabled = true;
        tctx.drawImage(maskCanvas, 0, 0, MS, MS, 0, 0, CS, CS);
        tctx.globalCompositeOperation = "source-over";
      }
      c.globalCompositeOperation = op || "source-over";
      c.drawImage(tmp, 0, 0);
      c.globalCompositeOperation = "source-over";
    }

    function drawMandala(c, x, y, R) {
      c.save(); c.translate(x, y);
      const g = c.createRadialGradient(0, 0, 0, 0, 0, R);
      g.addColorStop(0, "rgba(255,238,196,0.42)"); g.addColorStop(0.7, "rgba(255,226,170,0.16)"); g.addColorStop(1, "rgba(255,226,170,0)");
      c.fillStyle = g; c.beginPath(); c.arc(0, 0, R, 0, 6.2832); c.fill();
      const groove = "rgba(104,74,36,0.85)", hi = "rgba(255,244,214,0.6)";
      const ring = (r, w) => {
        c.lineWidth = w; c.strokeStyle = hi; c.beginPath(); c.arc(2, 2, r, 0, 6.2832); c.stroke();
        c.strokeStyle = groove; c.beginPath(); c.arc(0, 0, r, 0, 6.2832); c.stroke();
      };
      ring(R * 0.97, 7); ring(R * 0.91, 3); ring(R * 0.64, 6); ring(R * 0.58, 2.5); ring(R * 0.26, 5);
      const petal = (n, r0, r1, wd, fill) => {
        for (let i = 0; i < n; i++) {
          const a = (i + 0.5) * 6.2832 / n;
          c.save(); c.rotate(a);
          c.beginPath();
          c.moveTo(r0, 0);
          c.quadraticCurveTo((r0 + r1) / 2, -wd, r1, 0);
          c.quadraticCurveTo((r0 + r1) / 2, wd, r0, 0);
          c.fillStyle = fill; c.fill();
          c.lineWidth = 2.5; c.strokeStyle = groove; c.stroke();
          c.restore();
        }
      };
      petal(24, R * 0.66, R * 0.89, R * 0.07, "rgba(214,170,96,0.45)");
      petal(12, R * 0.28, R * 0.56, R * 0.11, "rgba(236,196,120,0.55)");
      petal(12, R * 0.34, R * 0.52, R * 0.05, "rgba(255,236,190,0.5)");
      const cg = c.createRadialGradient(-R * 0.05, -R * 0.06, 0, 0, 0, R * 0.2);
      cg.addColorStop(0, "#fff2c0"); cg.addColorStop(0.5, "#e8b860"); cg.addColorStop(1, "#9a6a2a");
      c.fillStyle = cg; c.beginPath(); c.arc(0, 0, R * 0.2, 0, 6.2832); c.fill();
      c.lineWidth = 3; c.strokeStyle = groove; c.stroke();
      c.restore();
    }
    const td = document.createElement("canvas"); td.width = CS; td.height = CS;
    const tdc = td.getContext("2d");
    function bake(p, cx, cy, s, k) {
      const tx0 = cx * CN, ty0 = cy * CN;
      const cv = td, c = tdc;
      c.globalCompositeOperation = "source-over";
      c.clearRect(0, 0, CS, CS);
      const ox = Math.round((tx0 - MT) * D), oy = Math.round((ty0 - MT) * D);
      // which materials touch this chunk (with a one-tile apron)
      const present = new Set();
      let hasVoid = false, hasWater = false;
      for (let y = ty0 - 1; y <= ty0 + CN; y++) for (let x = tx0 - 1; x <= tx0 + CN; x++) {
        const mi = matAt(p, x, y);
        if (mi === NONE) hasVoid = true; else present.add(mi);
        if (waterAt(p, x, y)) hasWater = true;
      }
      const list = [...present].sort((a, b) => MATS[MAT_NAMES[a]][0] - MATS[MAT_NAMES[b]][0]);
      list.forEach((mi, li) => {
        const name = MAT_NAMES[mi], hard = MATS[name][1] === 1;
        if (li === 0) { layer(c, name, ox, oy, null); return; }
        const r = computeField(tx0, ty0, (x, y) => matAt(p, x, y) === mi, hard, hard ? 0 : 0.55);
        if (!r) return;
        layer(c, name, ox, oy, r === 2 ? null : maskFrom((v) => hard ? smooth(0.47, 0.53, v) : smooth(0.44, 0.56, v)));
      });
      if (hasVoid) {
        const r = computeField(tx0, ty0, (x, y) => matAt(p, x, y) === NONE, true, 0);
        if (r === 2) c.clearRect(0, 0, CS, CS);
        else if (r) { c.globalCompositeOperation = "destination-out"; c.drawImage(maskFrom((v) => smooth(0.47, 0.53, v)), 0, 0, MS, MS, 0, 0, CS, CS); c.globalCompositeOperation = "source-over"; }
      }
      for (let i = 0; i < p.mandalas.length; i += 3) {
        const mx = p.mandalas[i] * D - ox, my = p.mandalas[i + 1] * D - oy, R = p.mandalas[i + 2] * D;
        if (mx + R < 0 || my + R < 0 || mx - R > CS || my - R > CS) continue;
        drawMandala(c, mx, my, R);
      }
      // contact shadows / ambient occlusion around solid things, soft canopy shadows under trees, macro tone
      const ro = computeField(tx0, ty0, (x, y) => occAt(p, x, y) === 1, false, 0);
      if (ro !== 1) field.fill(ro === 2 ? 1 : 0);
      const ao = new Float32Array(field);
      const trees = [];
      for (let y = ty0 - 2; y <= ty0 + CN + 1; y++) for (let x = tx0 - 2; x <= tx0 + CN + 1; x++) if (occAt(p, x, y) === 2) trees.push(x + 0.85, y + 0.8);
      for (let j = 0; j < MS; j++) for (let i = 0; i < MS; i++) {
        const u = tx0 - MT + (i + 0.5) / MR, v = ty0 - MT + (j + 0.5) / MR;
        let a = Math.pow(Math.max(0, ao[j * MS + i]), 1.4) * 0.5;
        for (let t = 0; t < trees.length; t += 2) {
          const dx = u - trees[t], dy = v - trees[t + 1];
          const d2 = dx * dx + dy * dy;
          if (d2 < 1.3) a += (1 - d2 / 1.3) * (1 - d2 / 1.3) * 0.42;
        }
        a += Math.max(0, vnoise(u * 0.35 + 40, v * 0.35) - 0.45) * 0.22;
        field[j * MS + i] = Math.min(0.7, a);
      }
      c.globalCompositeOperation = "source-atop";
      c.drawImage(colorMask(16, 12, 30, (v) => v), 0, 0, MS, MS, 0, 0, CS, CS);
      c.globalCompositeOperation = "source-over";
      // water: cut the hole, then lay a stone rim (crafted ponds) or a wet bank
      let wall = null;
      if (hasWater) {
        const organic = !p.theme.stonePond;
        const r = computeField(tx0, ty0, (x, y) => waterAt(p, x, y) === 1, false, organic ? 0.35 : 0);
        if (r === 2) field.fill(1);
        if (r) {
          const wf = new Float32Array(field);
          // rim / bank band on the land side
          const rw = organic ? 0.2 : 0.17;
          layer(c, p.theme.rim || "rim", ox, oy, maskFrom((v) => smooth(0.5 - rw - 0.03, 0.5 - rw + 0.03, v)), "source-atop");
          c.globalCompositeOperation = "source-atop";
          c.drawImage(colorMask(20, 26, 30, (v) => smooth(0.5 - rw - 0.02, 0.5, v) * (organic ? 0.45 : 0.25)), 0, 0, MS, MS, 0, 0, CS, CS);
          c.globalCompositeOperation = "destination-out";
          c.drawImage(maskFrom((v) => smooth(0.48, 0.52, v)), 0, 0, MS, MS, 0, 0, CS, CS);
          c.globalCompositeOperation = "source-over";
          // silhouette used for the sunken bank faces
          field.set(wf);
          wall = document.createElement("canvas"); wall.width = MS; wall.height = MS;
          const wc = wall.getContext("2d");
          const dk = organic ? [70, 52, 36] : [96, 88, 78];
          wc.drawImage(colorMask(dk[0], dk[1], dk[2], (v) => 1 - smooth(0.48, 0.52, v)), 0, 0);
        }
      }
      // warm light pools under lanterns and altars
      c.globalCompositeOperation = "lighter";
      const L = p.lights;
      for (let i = 0; i < L.length; i += 3) {
        if (L[i + 2] === 2) continue;
        const lx = (L[i] + 0.5) * D - ox, ly = (L[i + 1] + 0.5) * D - oy;
        const rr = (L[i + 2] === 1 ? 1.8 : 2.6) * D;
        if (lx < -rr || ly < -rr || lx > CS + rr || ly > CS + rr) continue;
        const gr = c.createRadialGradient(lx, ly, 0, lx, ly, rr);
        const col = L[i + 2] === 1 ? "150,200,255" : "255,190,110";
        gr.addColorStop(0, `rgba(${col},0.34)`); gr.addColorStop(0.45, `rgba(${col},0.12)`); gr.addColorStop(1, `rgba(${col},0)`);
        c.fillStyle = gr; c.fillRect(lx - rr, ly - rr, rr * 2, rr * 2);
      }
      c.globalCompositeOperation = "source-over";
      // ---- project once into screen orientation (so frames are plain blits) ----
      const span = CN + 2 * MT;
      const iw = Math.ceil(span * 2 * HW * s), ih = Math.ceil(span * 2 * HH * s);
      const iso = document.createElement("canvas"); iso.width = iw; iso.height = ih;
      const ic = iso.getContext("2d");
      ic.imageSmoothingEnabled = true;
      if ("imageSmoothingQuality" in ic) ic.imageSmoothingQuality = "high";
      const A = HW * s / D, B = HH * s / D, E = span * HW * s;
      if (hasWater && wall) {
        const wp = ic.createPattern(images["t:" + (p.theme.stonePond ? "water" : "water")], "repeat");
        ic.save(); ic.setTransform(A, B, -A, B, E, 0);
        ic.translate(-ox, -oy); ic.fillStyle = wp; ic.fillRect(ox, oy, CS, CS);
        if (images.caustics) {
          ic.globalCompositeOperation = "lighter"; ic.globalAlpha = 0.3;
          ic.fillStyle = ic.createPattern(images.caustics, "repeat"); ic.fillRect(ox, oy, CS, CS);
          ic.globalAlpha = 1; ic.globalCompositeOperation = "source-over";
        }
        ic.restore();
        // reflections of static props standing near the water
        const im = images.world, O = { x: (tx0 - MT) * T, y: (ty0 - MT) * T }, ks = s / PSCALE;
        ic.globalAlpha = 0.3;
        for (let y = ty0 - 2; y <= ty0 + CN + 3; y++) for (let x = tx0 - 3; x <= tx0 + CN + 2; x++) {
          if (x < 0 || y < 0 || x >= p.w || y >= p.h) continue;
          const i = y * p.w + x;
          if (!p.nearW[i] || !p.obj[i] || !im) continue;
          const f = p.obj[i];
          const wx = (x + 0.5) * T - O.x, wy = (y + 0.5) * T - O.y;
          const sx = (wx - wy) / T * HW * s + E, sy = (wx + wy) / T * HH * s;
          ic.save(); ic.translate(sx, sy + 8 * s); ic.scale(1, -0.7);
          ic.drawImage(im, f[0], f[1], f[2], f[3], -f[4] * ks, -f[5] * ks, f[2] * ks, f[3] * ks);
          ic.restore();
        }
        ic.globalAlpha = 1;
        // sunken bank faces: the land silhouette dropped into the water
        const q = CS / MS;
        for (let L = 0; L < 3; L++) {
          ic.save(); ic.setTransform(A * q, B * q, -A * q, B * q, E, (16 - L * 5) * s);
          ic.globalAlpha = L === 0 ? 0.95 : L === 1 ? 0.75 : 0.6;
          ic.drawImage(wall, 0, 0);
          ic.restore();
        }
        ic.globalAlpha = 1;
      }
      ic.setTransform(A, B, -A, B, E, 0);
      ic.drawImage(cv, 0, 0);
      ic.setTransform(1, 0, 0, 1, 0, 0);
      // remember where the water is for animated glints
      const wt = [];
      if (hasWater) for (let y = ty0; y < ty0 + CN; y++) for (let x = tx0; x < tx0 + CN; x++) if (waterAt(p, x, y)) wt.push(x, y);
      return { iso, s, iw, ih, wt };
    }
    function chunkFor(p, cx, cy, allowBake, s, k) {
      const key = cx * 4096 + cy;
      let ch = chunks.get(key);
      if (ch && (!allowBake || Math.abs(s - ch.s) < 1e-4)) { chunks.delete(key); chunks.set(key, ch); return ch; }
      if (!allowBake) return ch || null;
      if (ch) { ch.iso.width = ch.iso.height = 0; chunks.delete(key); }
      const t0 = performance.now();
      ch = bake(p, cx, cy, s, k);
      const dt = performance.now() - t0;
      stats.bakes++; stats.bakeMs += dt; stats.bakeMax = Math.max(stats.bakeMax, dt);
      chunks.set(key, ch);
      while (chunks.size > MAX_CHUNKS) {
        const k0 = chunks.keys().next().value;
        const old = chunks.get(k0);
        old.iso.width = old.iso.height = 0;
        chunks.delete(k0);
      }
      return ch;
    }

    function iso(wx, wy, out) {
      out.x = (wx - wy) / T * HW;
      out.y = (wx + wy) / T * HH;
      return out;
    }
    const tp = { x: 0, y: 0 }, tp2 = { x: 0, y: 0 };
    function toScreen(wx, wy, out) {
      iso(wx, wy, out);
      out.x = (out.x - view.camX) * view.z + W / 2;
      out.y = (out.y - view.camY) * view.z + H / 2;
      return out;
    }
    function toWorld(sx, sy, out) {
      const ix = (sx - W / 2) / view.z + view.camX;
      const iy = (sy - H / 2) / view.z + view.camY;
      out.x = (ix / HW + iy / HH) * 0.5 * T;
      out.y = (iy / HH - ix / HW) * 0.5 * T;
      return out;
    }
    // Camera follows the leader in iso space with critically damped easing.
    function updateCamera(dt, m, px, py, snap) {
      iso(px, py, tp);
      let tx = tp.x, ty = tp.y - 24;
      const p = prepare(m);
      if (p.indoor) {
        const minX = -m.h * HW, maxX = m.w * HW, maxY = (m.w + m.h) * HH;
        const vw = W / view.z, vh = H / view.z;
        tx = maxX - minX < vw ? (minX + maxX) / 2 : Math.max(minX + vw / 2, Math.min(maxX - vw / 2, tx));
        ty = maxY < vh ? maxY / 2 : Math.max(vh / 2 - 40, Math.min(maxY - vh / 2 + 60, ty));
      }
      if (snap) { view.camX = tx; view.camY = ty; syncBake = true; return; }
      const k = 1 - Math.exp(-dt / 140);
      view.camX += (tx - view.camX) * k;
      view.camY += (ty - view.camY) * k;
    }

    // Dynamic entity pool (party, NPCs, events) sorted by depth each frame.
    const POOL = [];
    for (let i = 0; i < 96; i++) POOL.push({ key: 0, kind: 0, x: 0, y: 0, ref: null, a: 0, b: 0 });
    let nDyn = 0;
    const order = new Array(96);
    function dyn(kind, wx, wy, ref, a, b) {
      if (nDyn >= POOL.length) return;
      const e = POOL[nDyn++];
      e.kind = kind; e.x = wx; e.y = wy; e.ref = ref; e.a = a || 0; e.b = b || 0;
      e.key = (wx + wy) / T;
    }

    function label(text, color) {
      const key = text + "|" + (color || "");
      let c = labels.get(key);
      if (c) return c;
      const s = 3;
      c = document.createElement("canvas");
      const g = c.getContext("2d");
      g.font = "800 14px Avenir Next, Segoe UI, sans-serif";
      const tw = Math.ceil(g.measureText(text).width);
      const w = tw + 22, h = 24;
      c.width = w * s; c.height = h * s; c.w = w; c.h = h;
      g.scale(s, s);
      const grd = g.createLinearGradient(0, 0, 0, h);
      grd.addColorStop(0, "rgba(40,30,58,0.92)"); grd.addColorStop(1, "rgba(14,10,24,0.92)");
      g.fillStyle = grd;
      g.beginPath(); g.roundRect(1.5, 1.5, w - 3, h - 3, 11); g.fill();
      g.strokeStyle = color || "rgba(232,200,120,0.95)"; g.lineWidth = 2; g.stroke();
      g.font = "800 14px Avenir Next, Segoe UI, sans-serif";
      g.textAlign = "center"; g.textBaseline = "middle";
      g.lineWidth = 3.5; g.strokeStyle = "rgba(0,0,0,0.75)"; g.lineJoin = "round"; g.strokeText(text, w / 2, h / 2 + 0.5);
      g.fillStyle = "#fff6e2"; g.fillText(text, w / 2, h / 2 + 0.5);
      labels.set(key, c);
      return c;
    }

    function ensureLight() {
      if (lightCanvas) return;
      lightCanvas = document.createElement("canvas");
      lightCanvas.width = 320; lightCanvas.height = 180;
      lightCtx = lightCanvas.getContext("2d");
      vignette = document.createElement("canvas");
      vignette.width = 320; vignette.height = 180;
      const v = vignette.getContext("2d");
      const g = v.createRadialGradient(160, 100, 50, 160, 90, 210);
      g.addColorStop(0, "rgba(0,0,0,0)"); g.addColorStop(0.55, "rgba(10,6,20,0.12)"); g.addColorStop(1, "rgba(10,6,20,0.62)");
      v.fillStyle = g; v.fillRect(0, 0, 320, 180);
      skyGrad = lightCtx.createLinearGradient(0, 0, 0, 180);
      skyGrad.addColorStop(0, "rgba(255,150,110,0.16)"); skyGrad.addColorStop(0.35, "rgba(200,120,160,0.05)"); skyGrad.addColorStop(1, "rgba(40,30,80,0.10)");
    }

    // Ambient particles: drifting petals and fireflies (screen space, pooled).
    const PN = 46, parts = [];
    for (let i = 0; i < PN; i++) parts.push({ x: Math.random() * W, y: Math.random() * H, vx: 0, vy: 0, ph: Math.random() * 6.28, s: 0.6 + Math.random() * 0.8, kind: i % 3 === 0 ? 1 : 0 });
    let lastCamX = 0, lastCamY = 0, lastAnim = 0;
    function drawParticles(c, anim, dusk, z, petals) {
      const dt = Math.min(50, Math.max(0, anim - lastAnim)); lastAnim = anim;
      const dcx = (view.camX - lastCamX) * z, dcy = (view.camY - lastCamY) * z;
      lastCamX = view.camX; lastCamY = view.camY;
      for (let i = 0; i < PN; i++) {
        const q = parts[i];
        if (q.kind === 0 && !petals) continue;
        q.ph += dt * 0.002;
        if (q.kind === 0) { q.x += (0.028 + Math.sin(q.ph) * 0.02) * dt * q.s - dcx; q.y += (0.022 + Math.cos(q.ph * 0.7) * 0.01) * dt * q.s - dcy; }
        else { q.x += Math.sin(q.ph * 0.9) * 0.012 * dt - dcx; q.y += Math.cos(q.ph * 0.6) * 0.01 * dt - dcy; }
        if (q.x > W + 20) q.x -= W + 40; if (q.x < -20) q.x += W + 40;
        if (q.y > H + 20) q.y -= H + 40; if (q.y < -20) q.y += H + 40;
        if (q.kind === 0) {
          c.save(); c.translate(q.x, q.y); c.rotate(q.ph * 1.7);
          c.globalAlpha = 0.85;
          c.fillStyle = i & 1 ? "#ffc4dc" : "#f8a8c8";
          c.beginPath(); c.ellipse(0, 0, 4.2 * q.s * z * 0.8, 2.2 * q.s * z * 0.8, 0, 0, 6.283); c.fill();
          c.restore();
        } else if (dusk > 0.05) {
          const a = (0.4 + 0.6 * Math.max(0, Math.sin(q.ph * 2.3))) * Math.min(1, dusk * 2.2);
          const gl = F.glow_warm;
          if (gl) {
            c.globalCompositeOperation = "lighter"; c.globalAlpha = a;
            const r = 9 * q.s * z;
            c.drawImage(images.world, gl[0], gl[1], gl[2], gl[3], q.x - r, q.y - r, r * 2, r * 2);
            c.fillStyle = "#fff6c8"; c.fillRect(q.x - 1, q.y - 1, 2, 2);
            c.globalCompositeOperation = "source-over";
          }
        }
      }
      c.globalAlpha = 1;
    }

    // Main draw. st: {S, map, anim, night, collect, drawDyn, groundFx?, afterObjects?, extraLights?}
    function draw(st) {
      const S = st.S, m = st.map;
      const p = prepare(m);
      if (chunkMap !== m) {
        chunks.forEach((ch) => { ch.iso.width = ch.iso.height = 0; });
        chunks.clear(); chunkMap = m; syncBake = true;
      }
      const z = view.z, k = z / PSCALE;                  // logical px per atlas px
      const anim = st.anim;
      ctx.fillStyle = p.theme.bg;
      ctx.fillRect(0, 0, W, H);
      // visible tile window (screen corners -> world), with margins for tall art
      const c = tp;
      let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
      for (let i = 0; i < 4; i++) {
        toWorld(i & 1 ? W : 0, i & 2 ? H + 260 * z : -40, c);
        x0 = Math.min(x0, c.x); x1 = Math.max(x1, c.x); y0 = Math.min(y0, c.y); y1 = Math.max(y1, c.y);
      }
      x0 = Math.floor(x0 / T) - 2; y0 = Math.floor(y0 / T) - 2; x1 = Math.ceil(x1 / T) + 2; y1 = Math.ceil(y1 / T) + 2;
      const mw = m.w, mh = m.h;
      const ox = W / 2 - view.camX * z, oy = H / 2 - view.camY * z;
      const im = images.world;
      // ---- ground: baked painted chunks, already in screen orientation ----
      // Chunks are composed into one opaque screen-sized cache (plus a margin) that is
      // re-composed only when the camera drifts past the margin or a chunk arrives, so a
      // normal frame costs a single opaque blit for the whole ground.
      const tr = ctx.getTransform ? ctx.getTransform() : null;
      const dev = tr ? Math.abs(tr.a) : 2;                 // device px per logical px
      const s = z * dev;
      let budget = syncBake ? 999 : 1;
      syncBake = false;
      const span = CN + 2 * MT;
      const gw = span * 2 * HW * z, gh = span * 2 * HH * z;
      const G = ground;
      const steady = Math.abs(z - lastZ) < 1e-4;
      lastZ = z;
      const gwPx = Math.ceil((W + 2 * GM) * dev), ghPx = Math.ceil((H + 2 * GM) * dev);
      const stale = !G.ok || G.map !== m || Math.abs(G.s - s) > 1e-4 || Math.abs(ox - G.ox) > GM * 0.9 || Math.abs(oy - G.oy) > GM * 0.9 || G.v !== chunkGen;
      visCh.length = 0;
      const eachChunk = (L, Tp, R, B, fn) => {
        const cxs = Math.floor((x0 + 2) / CN) - 2, cxe = Math.floor((x1 - 2) / CN) + 2;
        const cys = Math.floor((y0 + 2) / CN) - 2, cye = Math.floor((y1 - 2) / CN) + 2;
        for (let cy = cys; cy <= cye; cy++) for (let cx = cxs; cx <= cxe; cx++) {
          const wx = (cx * CN - MT) * T, wy = (cy * CN - MT) * T;
          const topX = ox + ((wx - wy) / T) * HW * z, topY = oy + ((wx + wy) / T) * HH * z;
          const left = topX - gw / 2;
          if (left + gw < L || left > R || topY + gh < Tp || topY > B) continue;
          if (p.oobMat === NONE && ((cx + 1) * CN < 0 || (cy + 1) * CN < 0 || cx * CN >= mw || cy * CN >= mh)) continue;
          fn(cx, cy, left, topY);
        }
      };
      if (steady && (stale || !G.full)) {
        // (re)compose the cache around the current camera
        if (!G.cv || G.cv.width !== gwPx || G.cv.height !== ghPx) {
          if (!G.cv) { G.cv = document.createElement("canvas"); }
          G.cv.width = gwPx; G.cv.height = ghPx;
          G.c = G.cv.getContext("2d", { alpha: false });
        }
        const gc = G.c;
        gc.setTransform(1, 0, 0, 1, 0, 0);
        gc.fillStyle = p.theme.bg; gc.fillRect(0, 0, gwPx, ghPx);
        G.full = true;
        let nVis = 0;
        eachChunk(-GM, -GM, W + GM, H + GM, (cx, cy, left, topY) => {
          let ch = chunkFor(p, cx, cy, false, s, k);
          if (!ch || Math.abs(s - ch.s) > 1e-4) {
            if (budget > 0) { ch = chunkFor(p, cx, cy, true, s, k); budget--; }
            else G.full = false;
            if (!ch) return;
          }
          nVis++;
          const r = s / ch.s;
          gc.drawImage(ch.iso, Math.round((left + GM) * dev), Math.round((topY + GM) * dev), Math.round(ch.iw * r), Math.round(ch.ih * r));
        });
        stats.chunks = nVis;
        G.ok = true; G.map = m; G.s = s; G.ox = ox; G.oy = oy; G.v = chunkGen;
      }
      if (G.ok && steady && G.map === m) {
        const dx = Math.round((ox - G.ox - GM) * dev) / dev, dy = Math.round((oy - G.oy - GM) * dev) / dev;
        ctx.drawImage(G.cv, dx, dy, G.cv.width / dev, G.cv.height / dev);
      } else {
        // zooming (vista) or first frame: draw chunks directly, scaled
        eachChunk(0, 0, W, H, (cx, cy, left, topY) => {
          let ch = chunkFor(p, cx, cy, false, s, k);
          if (!ch && budget > 0) { ch = chunkFor(p, cx, cy, true, s, k); budget--; }
          if (ch) ctx.drawImage(ch.iso, left, topY, ch.iw * z / ch.s, ch.ih * z / ch.s);
        });
      }
      // shimmer: a few twinkling glints on visible water
      eachChunk(0, 0, W, H, (cx, cy) => {
        const ch = chunks.get(cx * 4096 + cy);
        if (ch && ch.wt.length) visCh.push(ch);
      });
      if (visCh.length) {
        const gl = F.glow_cool;
        let nGl = 0;
        ctx.globalCompositeOperation = "lighter";
        for (let v = 0; v < visCh.length && nGl < 48; v++) {
          const wt = visCh[v].wt;
          for (let g = 0; g < wt.length && nGl < 48; g += 2) {
            const hsh = hash(wt[g], wt[g + 1]);
            if (hsh % 3) continue;
            const ph = (anim / 1400 + (hsh & 255) / 255) % 1;
            const gx = (wt[g] + ((hsh >> 8) & 255) / 255) * T, gy = (wt[g + 1] + ((hsh >> 16) & 255) / 255) * T;
            const q = toScreen(gx, gy, tp2);
            if (q.x < -20 || q.x > W + 20 || q.y < -20 || q.y > H + 20) continue;
            ctx.globalAlpha = Math.sin(ph * Math.PI) * 0.7;
            const r = (5 + (hsh & 7)) * z;
            ctx.drawImage(im, gl[0], gl[1], gl[2], gl[3], q.x - r * 1.6, q.y - r * 0.5, r * 3.2, r);
            nGl++;
          }
        }
        ctx.globalAlpha = 1; ctx.globalCompositeOperation = "source-over";
      }
      // ground-level overlays: warp glows and the tap marker
      if (st.groundFx) st.groundFx(ctx, toScreen, z);
      // ---- objects + dynamic entities in depth order ----
      nDyn = 0;
      st.collect(dyn);
      for (let i = 0; i < nDyn; i++) order[i] = POOL[i];
      for (let i = 1; i < nDyn; i++) {           // insertion sort (small n, no alloc)
        const e = order[i]; let j = i - 1;
        while (j >= 0 && order[j].key > e.key) { order[j + 1] = order[j]; j--; }
        order[j + 1] = e;
      }
      let di = 0;
      const smin = x0 + y0, smax = x1 + y1;
      for (let s = smin; s <= smax; s++) {
        while (di < nDyn && order[di].key <= s + 1) st.drawDyn(ctx, order[di++], toScreen, z / 2);
        const xa = Math.max(x0, s - y1), xb = Math.min(x1, s - y0);
        for (let x = xa; x <= xb; x++) {
          const y = s - x;
          let f;
          if (x < 0 || y < 0 || x >= mw || y >= mh) {
            if (!p.oobTree || !p.oobTree.length || (hash(x, y) % 5) > 2) continue;
            f = p.oobTree[hash(x, y) % p.oobTree.length];
          } else f = p.obj[y * mw + x];
          if (!f) continue;
          const cxp = ox + (x - y) * HW * z, cyp = oy + (x + y + 1) * HH * z;
          if (cxp + f[2] * k < 0 || cxp - f[2] * k > W || cyp - f[5] * k > H || cyp + (f[3] - f[5]) * k < 0) continue;
          ctx.drawImage(im, f[0], f[1], f[2], f[3], cxp - f[4] * k, cyp - f[5] * k, f[2] * k, f[3] * k);
        }
      }
      while (di < nDyn) st.drawDyn(ctx, order[di++], toScreen, z / 2);
      if (st.afterObjects) st.afterObjects(ctx, toScreen, z / 2);
      // ---- lighting: dusk / night veil with light pools punched out ----
      ensureLight();
      const dusk = p.theme.dusk || 0;
      const night = Math.max(st.night, 0);
      const veil = Math.max(night * 1.45, dusk);
      drawParticles(ctx, anim, Math.max(dusk, night), z, !!p.theme.courtyard || p.id === "village" || p.id === "meridia");
      if (veil > 0.01) {
        const lc = lightCtx;
        lc.globalCompositeOperation = "source-over";
        lc.clearRect(0, 0, 320, 180);
        const nt = Math.min(1, night * 2);
        const rr0 = Math.round(44 * (1 - nt) + 12 * nt), gg0 = Math.round(30 * (1 - nt) + 14 * nt), bb0 = Math.round(80 * (1 - nt) + 44 * nt);
        lc.fillStyle = "rgba(" + rr0 + "," + gg0 + "," + bb0 + "," + Math.min(0.85, veil).toFixed(3) + ")";
        lc.fillRect(0, 0, 320, 180);
        lc.globalCompositeOperation = "destination-out";
        const gl = F.glow_warm;
        const L = p.lights;
        const q = 0.25;
        for (let i = 0; i < L.length; i += 3) {
          const lx = L[i], ly = L[i + 1];
          toScreen((lx + 0.5) * T, (ly + 0.5) * T, c);
          if (c.x < -260 || c.x > W + 260 || c.y < -260 || c.y > H + 300) continue;
          const r = (L[i + 2] === 2 ? 70 : 150) * z * q;
          lc.drawImage(im, gl[0], gl[1], gl[2], gl[3], c.x * q - r, (c.y - 30 * z) * q - r * 0.8, r * 2, r * 1.6);
        }
        toScreen(S.px, S.py, c);
        const r = 190 * z * q;
        lc.globalAlpha = 0.9;
        lc.drawImage(im, gl[0], gl[1], gl[2], gl[3], c.x * q - r, (c.y - 30 * z) * q - r * 0.75, r * 2, r * 1.5);
        lc.globalAlpha = 1;
        if (st.extraLights) st.extraLights(lc, toScreen, q, gl, im);
        // fold the sky tint and vignette into the same low-res layer: one full-screen pass
        lc.globalCompositeOperation = "source-over";
        if (dusk > 0.05 && night < 0.2) { lc.fillStyle = skyGrad; lc.fillRect(0, 0, 320, 180); }
        lc.drawImage(vignette, 0, 0);
        ctx.drawImage(lightCanvas, 0, 0, W, H);
        // warm bloom on lamp heads
        ctx.globalCompositeOperation = "lighter";
        for (let i = 0; i < L.length; i += 3) {
          if (L[i + 2] === 2) continue;
          toScreen((L[i] + 0.5) * T, (L[i + 1] + 0.5) * T, c);
          if (c.x < -100 || c.x > W + 100 || c.y < -100 || c.y > H + 200) continue;
          const pulse = 0.85 + Math.sin(anim / 400 + L[i] * 1.7) * 0.15;
          ctx.globalAlpha = Math.min(1, veil * 1.8) * pulse;
          const rr = 50 * z;
          const yy = L[i + 2] === 1 ? c.y - 22 * z : c.y - 52 * z;
          ctx.drawImage(im, gl[0], gl[1], gl[2], gl[3], c.x - rr, yy - rr, rr * 2, rr * 2);
        }
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = "source-over";
      }
      else ctx.drawImage(vignette, 0, 0, W, H);
    }

    return { stats, view, draw, toScreen, toWorld, iso, updateCamera, prepare, facing: (vx, vy) => facing(vx, vy, tmpFace), label };
  }

  window.SothWorld = { Art, create, drawChar, drawNpc, drawFrame, findPath, facing, frame: fr, npcVariant, _img: (k) => images[k] };
})();
