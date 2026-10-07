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
  function drawFrame(ctx, f, x, y, k) {
    if (!f) return;
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
  const THEMES = {
    temple: { wall: "stone", roof: "roof_slate", trees: ["tree_blossom0", "tree_blossom1", "tree_oak0"], grass: "grass", bg: "#24361f", path: "cobble" },
    village: { wall: "plaster", roof: "roof_green", trees: ["tree_oak0", "tree_oak1", "tree_oak2", "tree_blossom0"], grass: "grass", bg: "#1d3219", path: "cobble" },
    forest: { wall: "stone", roof: "roof_green", trees: ["tree_oak0", "tree_pine0", "tree_oak1", "tree_pine1", "tree_oak2"], grass: "grassn", bg: "#142414", path: "dirt" },
    wilderness: { wall: "stone", roof: "roof_green", trees: ["tree_oak0", "tree_pine0", "tree_oak1", "tree_pine1"], grass: "grass", bg: "#172a16", path: "dirt" },
    meridia: { wall: "plaster", roof: "roof_red", trees: ["tree_oak1", "tree_oak2", "tree_blossom1"], grass: "grass", bg: "#1d3219", path: "cobble" },
    ashen: { wall: "stone", roof: "roof_slate", trees: ["tree_dead0", "tree_pine1", "tree_dead1"], grass: "grassn", bg: "#1c1a1c", path: "dirt" },
    ruins: { wall: "stone", roof: "roof_slate", trees: ["tree_dead0", "tree_dead1"], grass: "grassn", bg: "#181418", path: "dirt" },
    throne: { wall: "stone", roof: "roof_slate", trees: ["tree_dead0", "tree_dead1"], grass: "grassn", bg: "#140e12", path: "dirt" },
    _indoor: { wall: "wood", roof: "roof_slate", trees: ["tree_oak0"], grass: "grass", bg: "#0b090f", path: "cobble" }
  };
  const WATERISH = new Set([3, 19, 32, 8]);
  const GRASSISH = new Set([1, 7, 20, 27, 28, 36, 10, 11]);
  const PATHISH = new Set([2, 24, 25, 12, 29, 33, 34]);
  function hash(x, y) { let h = (x * 374761393 + y * 668265263) ^ 0x5bd1e995; h = Math.imul(h ^ (h >>> 13), 1274126177); return (h ^ (h >>> 16)) >>> 0; }
  function pick(list, x, y) { return list[hash(x, y) % list.length]; }

  function classify(m, id, x, y, theme) {
    // returns [groundFrame, objectFrame, water(0/1/2), objKind]
    const t = m.tiles[y][x];
    const g = theme.grass;
    const grass = () => (hash(x + 7, y) % 11 === 0 ? g === "grassn" ? "grassn1" : "grassf" + (hash(x, y + 3) & 1) : g === "grassn" ? "grassn" + (hash(x, y) & 1) : "grass" + (hash(x, y) & 3));
    const W = theme.wall;
    switch (t) {
      case 0: return [null, null, 0];
      case 1: return [grass(), null, 0];
      case 2: return [theme.path + (hash(x, y) % 3), null, 0];
      case 3: return ["water", null, 1];
      case 4: return [null, "wall_" + W, 0];
      case 5: return ["floor" + (hash(x, y) & 1), null, 0];
      case 6: return m.indoors ? ["wood", null, 0] : [null, theme.roof, 0];
      case 7: return [grass(), pick(theme.trees, x, y), 0];
      case 8: return ["bridge", null, 0];
      case 9: return [null, theme.roof, 0];
      case 10: return [m.indoors ? "floor0" : grass(), "altar", 0];
      case 11: return [grass(), "fence", 0];
      case 12: return [theme.path + (hash(x, y) % 3), "lamp", 0];
      case 13: return [null, "wall_" + W + "_door", 0];
      case 14: return ["carpet", null, 0];
      case 15: return ["dirt" + (hash(x, y) % 3), "rubble" + (hash(x, y) & 1), 0];
      case 16: return ["ash" + (hash(x, y) % 3), null, 0];
      case 17: return [(id === "ashen" || id === "throne" ? "ash" : "dirt") + (hash(x, y) % 3), "rock_big" + (hash(x, y) & 1), 0];
      case 18: return ["corrupt" + (hash(x, y) % 3), null, 0];
      case 19: return ["water", "lily" + (hash(x, y) & 1), 1];
      case 20: return [grass(), hash(x, y) % 4 === 0 ? "bushf" : "bush" + (hash(x, y) & 1), 0];
      case 21: return [null, "wall_wood", 0];
      case 22: return ["floor0", "column", 0];
      case 23: return ["pale", null, 0];
      case 24: return ["plaza", null, 0];
      case 25: return ["dirt" + (hash(x, y) % 3), null, 0];
      case 26: return ["marble", null, 0];
      case 27: return ["grassf" + (hash(x, y) & 1), null, 0];
      case 28: return [grass(), "statue", 0];
      case 29: return [m.indoors ? "wood" : theme.path + "0", "crate", 0];
      case 30: return [m.indoors ? "wood" : "plaza", "stairs", 0];
      case 31: return [null, "wall_" + W + "_win", 0];
      case 32: return ["deep", null, 2];
      case 33: return [m.indoors ? "wood" : theme.path + "1", "bench", 0];
      case 34: return ["plaza", "fountain", 0];
      case 35: return ["gold", null, 0];
      case 36: return [grass(), "stall", 0];
      case 37: return ["corrupt" + (hash(x, y) % 3), "tree_dead" + (hash(x, y) & 1), 0];
      default: return [grass(), null, 0];
    }
  }

  // ---------------------------------------------------------------------------
  // Renderer
  // ---------------------------------------------------------------------------
  function create(env) {
    const { ctx, W, H, T } = env;
    const HW = 40, HH = 20;                 // half diamond (logical, zoom 1)
    const prepCache = new WeakMap();
    const view = { z: 1, camX: 0, camY: 0, ox: 0, oy: 0 };
    const tmpFace = { yaw: 0, flip: false };
    let lightCanvas = null, lightCtx = null, vignette = null;
    const labels = new Map();

    function prepare(m) {
      let p = prepCache.get(m);
      if (p && p.tiles === m.tiles) return p;
      const id = m.id || "";
      const theme = m.indoors ? THEMES._indoor : (THEMES[id] || THEMES.wilderness);
      const n = m.w * m.h;
      const ground = new Array(n), obj = new Array(n);
      const water = new Uint8Array(n), edges = new Uint8Array(n), foam = new Uint8Array(n);
      const lights = [];
      for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) {
        const i = y * m.w + x;
        const [gname, oname, wt] = classify(m, id, x, y, theme);
        ground[i] = gname && !wt ? fr(gname) : null;
        water[i] = wt;
        let of = null;
        if (oname === "fence") {
          const t = m.tiles;
          const horiz = (x > 0 && t[y][x - 1] === 11) || (x < m.w - 1 && t[y][x + 1] === 11);
          of = fr(horiz ? "fence_x" : "fence_y");
        } else if (oname) of = fr(oname);
        obj[i] = of;
        const tt = m.tiles[y][x];
        if (tt === 12) lights.push(x, y, 0);
        else if (tt === 10) lights.push(x, y, 1);
        else if (tt === 31 && !m.indoors) lights.push(x, y, 2);
        // grass fringe onto paths, foam onto water
        if (PATHISH.has(tt) && !m.indoors) {
          const nb = (xx, yy) => xx >= 0 && yy >= 0 && xx < m.w && yy < m.h && GRASSISH.has(m.tiles[yy][xx]);
          edges[i] = (nb(x, y - 1) ? 1 : 0) | (nb(x - 1, y) ? 2 : 0) | (nb(x + 1, y) ? 4 : 0) | (nb(x, y + 1) ? 8 : 0);
        }
        if (wt) {
          const land = (xx, yy) => xx >= 0 && yy >= 0 && xx < m.w && yy < m.h && !WATERISH.has(m.tiles[yy][xx]) && m.tiles[yy][xx] !== 0;
          foam[i] = (land(x, y - 1) ? 1 : 0) | (land(x - 1, y) ? 2 : 0) | (land(x + 1, y) ? 4 : 0) | (land(x, y + 1) ? 8 : 0);
        }
        if (tt === 8) water[i] = 1, ground[i] = fr("bridge");
      }
      const oobTree = m.indoors ? null : theme.trees.map(fr);
      const oobGround = m.indoors ? null : [fr(theme.grass === "grassn" ? "grassn0" : "grass0"), fr(theme.grass === "grassn" ? "grassn1" : "grass1")];
      p = { tiles: m.tiles, theme, ground, obj, water, edges, foam, lights, oobTree, oobGround, bridge: fr("bridge") };
      prepCache.set(m, p);
      return p;
    }

    function iso(wx, wy, out) {
      out.x = (wx - wy) / T * HW;
      out.y = (wx + wy) / T * HH;
      return out;
    }
    const tp = { x: 0, y: 0 };
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
      let tx = tp.x, ty = tp.y - 18;
      if (m.indoors) {
        // small rooms: centre the room; large ones: follow but keep the room in view
        const minX = -m.h * HW, maxX = m.w * HW, maxY = (m.w + m.h) * HH;
        const vw = W / view.z, vh = H / view.z;
        tx = maxX - minX < vw ? (minX + maxX) / 2 : Math.max(minX + vw / 2, Math.min(maxX - vw / 2, tx));
        ty = maxY < vh ? maxY / 2 : Math.max(vh / 2 - 40, Math.min(maxY - vh / 2 + 60, ty));
      }
      if (snap) { view.camX = tx; view.camY = ty; return; }
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
      const s = 2;
      c = document.createElement("canvas");
      const g = c.getContext("2d");
      g.font = "700 13px Avenir Next, Segoe UI, sans-serif";
      const tw = Math.ceil(g.measureText(text).width);
      const w = tw + 20, h = 22;
      c.width = w * s; c.height = h * s; c.w = w; c.h = h;
      g.scale(s, s);
      g.fillStyle = "rgba(14,10,24,0.78)";
      g.beginPath(); g.roundRect(1, 1, w - 2, h - 2, 10); g.fill();
      g.strokeStyle = color || "rgba(232,200,120,0.9)"; g.lineWidth = 1.5; g.stroke();
      g.font = "700 13px Avenir Next, Segoe UI, sans-serif";
      g.textAlign = "center"; g.textBaseline = "middle";
      g.lineWidth = 3; g.strokeStyle = "rgba(0,0,0,0.6)"; g.strokeText(text, w / 2, h / 2 + 0.5);
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
      const g = v.createRadialGradient(160, 96, 40, 160, 90, 200);
      g.addColorStop(0, "rgba(0,0,0,0)"); g.addColorStop(0.6, "rgba(8,6,16,0.10)"); g.addColorStop(1, "rgba(8,6,16,0.55)");
      v.fillStyle = g; v.fillRect(0, 0, 320, 180);
    }

    // Main draw. st: {S, map, party, eventVisible, flagOn, night, anim, marker, hover}
    function draw(st) {
      const S = st.S, m = st.map;
      const p = prepare(m);
      const z = view.z, k = 0.5 * z;                     // logical px per atlas px
      const anim = st.anim;
      const wf = (anim / 260 | 0) & 3;
      const wfr = fr("water" + wf), dfr = fr("deep" + wf);
      ctx.fillStyle = p.theme.bg;
      ctx.fillRect(0, 0, W, H);
      // visible tile window (screen corners -> world), with margins for tall art
      const c = tp;
      let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
      for (let i = 0; i < 4; i++) {
        toWorld(i & 1 ? W : 0, i & 2 ? H + 220 * z : -40, c);
        x0 = Math.min(x0, c.x); x1 = Math.max(x1, c.x); y0 = Math.min(y0, c.y); y1 = Math.max(y1, c.y);
      }
      x0 = Math.floor(x0 / T) - 2; y0 = Math.floor(y0 / T) - 2; x1 = Math.ceil(x1 / T) + 2; y1 = Math.ceil(y1 / T) + 2;
      const mw = m.w, mh = m.h;
      const ox = W / 2 - view.camX * z, oy = H / 2 - view.camY * z;
      const im = images.world;
      const gw = 2 * HW * z, gh = 2 * HH * z;
      // ---- ground ----
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          const sx = ox + (x - y) * HW * z, sy = oy + (x + y) * HH * z;   // top corner
          if (sx + gw * 0.5 < 0 || sx - gw * 0.5 > W || sy > H || sy + gh < 0) continue;
          const cx = sx, cy = sy + HH * z;
          let f;
          if (x < 0 || y < 0 || x >= mw || y >= mh) {
            if (!p.oobGround) continue;
            f = p.oobGround[hash(x, y) & 1];
            ctx.drawImage(im, f[0], f[1], f[2], f[3], cx - f[4] * k, cy - f[5] * k, f[2] * k, f[3] * k);
            continue;
          }
          const i = y * mw + x;
          const w = p.water[i];
          if (w) {
            f = w === 2 ? dfr : wfr;
            ctx.drawImage(im, f[0], f[1], f[2], f[3], cx - f[4] * k, cy - f[5] * k, f[2] * k, f[3] * k);
            const fm = p.foam[i];
            if (fm) {
              if (fm & 1) drawFrame(ctx, F.foam_NE, cx, cy, k);
              if (fm & 2) drawFrame(ctx, F.foam_NW, cx, cy, k);
              if (fm & 4) drawFrame(ctx, F.foam_SE, cx, cy, k);
              if (fm & 8) drawFrame(ctx, F.foam_SW, cx, cy, k);
            }
            if (m.tiles[y][x] === 8) drawFrame(ctx, p.bridge, cx, cy, k);
            continue;
          }
          f = p.ground[i];
          if (!f) continue;
          ctx.drawImage(im, f[0], f[1], f[2], f[3], cx - f[4] * k, cy - f[5] * k, f[2] * k, f[3] * k);
          const e = p.edges[i];
          if (e) {
            if (e & 1) drawFrame(ctx, F.gedge_NE, cx, cy, k);
            if (e & 2) drawFrame(ctx, F.gedge_NW, cx, cy, k);
            if (e & 4) drawFrame(ctx, F.gedge_SE, cx, cy, k);
            if (e & 8) drawFrame(ctx, F.gedge_SW, cx, cy, k);
          }
        }
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
        while (di < nDyn && order[di].key <= s + 1) st.drawDyn(ctx, order[di++], toScreen, k);
        const xa = Math.max(x0, s - y1), xb = Math.min(x1, s - y0);
        for (let x = xa; x <= xb; x++) {
          const y = s - x;
          let f;
          if (x < 0 || y < 0 || x >= mw || y >= mh) {
            if (!p.oobTree || (hash(x, y) % 5) > 2) continue;
            f = p.oobTree[hash(x, y) % p.oobTree.length];
          } else f = p.obj[y * mw + x];
          if (!f) continue;
          const cx = ox + (x - y) * HW * z, cy = oy + (x + y + 1) * HH * z;
          if (cx + f[2] * k < 0 || cx - f[2] * k > W || cy - f[5] * k > H || cy + (f[3] - f[5]) * k < 0) continue;
          ctx.drawImage(im, f[0], f[1], f[2], f[3], cx - f[4] * k, cy - f[5] * k, f[2] * k, f[3] * k);
        }
      }
      while (di < nDyn) st.drawDyn(ctx, order[di++], toScreen, k);
      if (st.afterObjects) st.afterObjects(ctx, toScreen, k);
      // ---- lighting ----
      ensureLight();
      const night = st.night;
      if (night > 0.01) {
        const lc = lightCtx;
        lc.globalCompositeOperation = "source-over";
        lc.clearRect(0, 0, 320, 180);
        lc.fillStyle = "rgba(12,14,44," + Math.min(0.85, night * 1.45).toFixed(3) + ")";
        lc.fillRect(0, 0, 320, 180);
        lc.globalCompositeOperation = "destination-out";
        const gl = F.glow_warm;
        const L = p.lights;
        const q = 0.25;
        for (let i = 0; i < L.length; i += 3) {
          const lx = L[i], ly = L[i + 1];
          toScreen((lx + 0.5) * T, (ly + 0.5) * T, c);
          if (c.x < -200 || c.x > W + 200 || c.y < -200 || c.y > H + 260) continue;
          const r = (L[i + 2] === 2 ? 70 : 150) * z * q;
          lc.drawImage(im, gl[0], gl[1], gl[2], gl[3], c.x * q - r, (c.y - 30 * z) * q - r * 0.8, r * 2, r * 1.6);
        }
        // the party carries a little light
        toScreen(S.px, S.py, c);
        const r = 120 * z * q;
        lc.drawImage(im, gl[0], gl[1], gl[2], gl[3], c.x * q - r, (c.y - 30 * z) * q - r * 0.75, r * 2, r * 1.5);
        if (st.extraLights) st.extraLights(lc, toScreen, q, gl, im);
        ctx.drawImage(lightCanvas, 0, 0, W, H);
        // warm bloom on lamps
        ctx.globalCompositeOperation = "lighter";
        for (let i = 0; i < L.length; i += 3) {
          if (L[i + 2] === 2) continue;
          toScreen((L[i] + 0.5) * T, (L[i + 1] + 0.5) * T, c);
          if (c.x < -100 || c.x > W + 100 || c.y < -100 || c.y > H + 160) continue;
          const pulse = 0.85 + Math.sin(anim / 400 + L[i] * 1.7) * 0.15;
          ctx.globalAlpha = Math.min(1, night * 1.6) * pulse;
          const rr = 46 * z;
          const yy = L[i + 2] === 1 ? c.y - 18 * z : c.y - 66 * z;
          ctx.drawImage(im, gl[0], gl[1], gl[2], gl[3], c.x - rr, yy - rr, rr * 2, rr * 2);
        }
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = "source-over";
      }
      ctx.drawImage(vignette, 0, 0, W, H);
    }

    return { view, draw, toScreen, toWorld, iso, updateCamera, prepare, facing: (vx, vy) => facing(vx, vy, tmpFace), label };
  }

  window.SothWorld = { Art, create, drawChar, drawNpc, drawFrame, findPath, facing, frame: fr, npcVariant, _img: (k) => images[k] };
})();
