/* Large tile maps. Builder stamps towns/forests; parse() still used for interiors. */
window.MAPS = (() => {
  const C = {
    " ": 0, ".": 1, ",": 2, "~": 3, "#": 4, "=": 5, "_": 6, "T": 7,
    "B": 8, "R": 9, "A": 10, "F": 11, "L": 12, "D": 13, "C": 14, "%": 15,
    "a": 16, "^": 17, "x": 18, "l": 19, "H": 20, "W": 21, "+": 22, "s": 23,
    "P": 24, "G": 25, "M": 26, "*": 27, "!": 28, "o": 29, "/": 30, "n": 31,
    "d": 32, "b": 33, "f": 34, "g": 35, "z": 36, "Y": 37
  };
  const t = {
    VOID: 0, GRASS: 1, PATH: 2, WATER: 3, WALL: 4, FLOOR: 5, WOOD: 6, TREE: 7,
    BRIDGE: 8, ROOF: 9, ALTAR: 10, FENCE: 11, LAMP: 12, DOOR: 13, CARPET: 14,
    RUBBLE: 15, ASH: 16, MTN: 17, CORRUPT: 18, LILY: 19, HEDGE: 20, WWALL: 21,
    COL: 22, PALE: 23, PLAZA: 24, DIRT: 25, MARBLE: 26, FLOWER: 27, STATUE: 28,
    CRATE: 29, STAIR: 30, WINDOW: 31, DEEP: 32, BENCH: 33, FOUNT: 34, GOLD: 35,
    STALL: 36, DEAD: 37
  };

  function parse(id, name, music, raw, extras) {
    const lines = raw.trimEnd().split("\n").map(l => (l.startsWith("|") ? l.slice(1) : l));
    const h = lines.length, w = Math.max(...lines.map(l => l.length));
    const tiles = [];
    for (let y = 0; y < h; y++) {
      const row = [];
      const line = lines[y].padEnd(w, " ");
      for (let x = 0; x < w; x++) row.push(C[line[x]] ?? 0);
      tiles.push(row);
    }
    return { id, name, music, w, h, tiles, ...(extras || {}) };
  }

  function rng(seed) {
    let s = seed >>> 0;
    return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  }
  function make(w, h, fill) {
    return { w, h, tiles: Array.from({ length: h }, () => Array(w).fill(fill)) };
  }
  function set(m, x, y, v) {
    if (x >= 0 && y >= 0 && x < m.w && y < m.h) m.tiles[y][x] = v;
  }
  function get(m, x, y) {
    if (x < 0 || y < 0 || x >= m.w || y >= m.h) return 0;
    return m.tiles[y][x];
  }
  function rect(m, x, y, w, h, v) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) set(m, x + i, y + j, v);
  }
  function frame(m, x, y, w, h, v) {
    rect(m, x, y, w, 1, v); rect(m, x, y + h - 1, w, 1, v);
    rect(m, x, y, 1, h, v); rect(m, x + w - 1, y, 1, h, v);
  }
  function scatter(m, x, y, w, h, v, n, ok, rnd) {
    let k = 0, tries = n * 8;
    while (k < n && tries-- > 0) {
      const ix = x + (rnd() * w | 0), iy = y + (rnd() * h | 0);
      const cur = get(m, ix, iy);
      if (ok && !ok(cur)) continue;
      set(m, ix, iy, v); k++;
    }
  }
  function line(m, x0, y0, x1, y1, v, rad) {
    const r = rad || 0;
    let dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1;
    let dy = -Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1;
    let err = dx + dy, x = x0, y = y0;
    while (true) {
      for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) set(m, x + i, y + j, v);
      if (x === x1 && y === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x += sx; }
      if (e2 <= dx) { err += dx; y += sy; }
    }
  }
  function canalV(m, x, y0, y1, w) {
    for (let y = y0; y <= y1; y++) {
      for (let i = 0; i < w; i++) {
        const deep = i === 0 || i === w - 1 ? false : (y % 7 === 3);
        set(m, x + i, y, deep ? t.DEEP : ((y + i) % 6 === 2 ? t.LILY : t.WATER));
      }
    }
  }
  function canalH(m, y, x0, x1, h) {
    for (let x = x0; x <= x1; x++) {
      for (let i = 0; i < h; i++) set(m, x, y + i, (x % 6 === 2 ? t.LILY : t.WATER));
    }
  }
  function bridgeH(m, x, y, len) { rect(m, x, y, len, 1, t.BRIDGE); }
  function bridgeV(m, x, y, len) { rect(m, x, y, 1, len, t.BRIDGE); }
  function lamps(m, x, y0, y1, step) {
    for (let y = y0; y <= y1; y += step) set(m, x, y, t.LAMP);
  }
  function house(m, x, y, w, h, door) {
    door = door || "s";
    const rh = Math.max(2, Math.min(3, (h / 2) | 0));
    rect(m, x, y, w, rh, t.ROOF);
    rect(m, x, y + rh, w, h - rh, t.WALL);
    for (let i = 1; i < w - 1; i += 2) set(m, x + i, y + rh, t.WINDOW);
    let dx = x + (w >> 1), dy = y + h - 1;
    if (door === "e") { dx = x + w - 1; dy = y + rh + Math.max(0, ((h - rh) >> 1)); }
    if (door === "w") { dx = x; dy = y + rh + Math.max(0, ((h - rh) >> 1)); }
    set(m, dx, dy, t.DOOR);
    return { x, y, w, h, dx, dy };
  }
  function garden(m, x, y, w, h, rnd) {
    rect(m, x, y, w, h, t.GRASS);
    frame(m, x, y, w, h, t.HEDGE);
    scatter(m, x + 1, y + 1, w - 2, h - 2, t.FLOWER, (w * h) >> 2, (c) => c === t.GRASS, rnd);
  }
  function plaza(m, x, y, w, h) {
    rect(m, x, y, w, h, t.PATH);
    set(m, x + (w >> 1), y + (h >> 1), t.FOUNT);
  }
  function done(id, name, music, m, extras) {
    return { id, name, music, w: m.w, h: m.h, tiles: m.tiles, ...(extras || {}) };
  }

  // Bilinear value noise — returns a function(x, y) -> [0,1]
  function noise2d(seed, W, H, scale) {
    const r = rng(seed);
    const gw = Math.ceil(W / scale) + 2;
    const gh = Math.ceil(H / scale) + 2;
    const grid = Array.from({ length: gh }, () => Array.from({ length: gw }, () => r()));
    return (x, y) => {
      const gx = Math.floor(x / scale), gy = Math.floor(y / scale);
      const fx = (x / scale) - gx, fy = (y / scale) - gy;
      const cx = (v) => Math.min(v, gw - 1), cy = (v) => Math.min(v, gh - 1);
      const a = grid[cy(gy)][cx(gx)], b = grid[cy(gy)][cx(gx + 1)];
      const c = grid[cy(gy + 1)][cx(gx)], d = grid[cy(gy + 1)][cx(gx + 1)];
      return a * (1 - fx) * (1 - fy) + b * fx * (1 - fy) + c * (1 - fx) * fy + d * fx * fy;
    };
  }

  const M = {};
  const DOORS = {};

  // ----- TEMPLE compound 72x52 -----
  (function () {
    const rnd = rng(11);
    const m = make(72, 52, t.FLOOR);
    frame(m, 0, 0, 72, 52, t.WALL);
    // inner sanctum
    rect(m, 20, 4, 32, 16, t.GOLD);
    frame(m, 24, 6, 24, 12, t.CARPET);
    rect(m, 32, 10, 8, 6, t.GOLD);
    set(m, 35, 12, t.ALTAR); set(m, 36, 12, t.ALTAR);
    set(m, 28, 8, t.COL); set(m, 43, 8, t.COL);
    set(m, 28, 16, t.COL); set(m, 43, 16, t.COL);
    set(m, 26, 12, t.STATUE); set(m, 45, 12, t.STATUE);
    // side chapels
    rect(m, 4, 6, 12, 10, t.WOOD);
    frame(m, 4, 6, 12, 10, t.WWALL);
    set(m, 10, 15, t.DOOR);
    set(m, 8, 9, t.ALTAR);
    scatter(m, 5, 7, 10, 7, t.CRATE, 4, () => true, rnd);
    rect(m, 56, 6, 12, 10, t.WOOD);
    frame(m, 56, 6, 12, 10, t.WWALL);
    set(m, 62, 15, t.DOOR);
    set(m, 61, 9, t.ALTAR);
    // cloister
    rect(m, 8, 20, 56, 14, t.FLOOR);
    rect(m, 22, 22, 28, 8, t.WATER);
    for (let x = 24; x < 48; x += 3) set(m, x, 25, t.LILY);
    bridgeH(m, 34, 25, 4);
    set(m, 18, 22, t.COL); set(m, 53, 22, t.COL);
    set(m, 18, 30, t.COL); set(m, 53, 30, t.COL);
    // outer courtyard (grass)
    rect(m, 1, 35, 70, 16, t.GRASS);
    rect(m, 30, 35, 12, 14, t.PATH);
    garden(m, 4, 36, 12, 10, rnd);
    garden(m, 56, 36, 12, 10, rnd);
    set(m, 10, 40, t.STATUE); set(m, 62, 40, t.STATUE);
    set(m, 36, 38, t.ALTAR);
    lamps(m, 29, 36, 48, 4); lamps(m, 42, 36, 48, 4);
    scatter(m, 16, 36, 14, 12, t.FLOWER, 18, (c) => c === t.GRASS, rnd);
    scatter(m, 44, 36, 12, 12, t.FLOWER, 16, (c) => c === t.GRASS, rnd);
    scatter(m, 2, 36, 8, 14, t.HEDGE, 8, (c) => c === t.GRASS, rnd);
    set(m, 36, 50, t.DOOR); set(m, 35, 50, t.DOOR); set(m, 37, 50, t.DOOR);
    M.temple = done("temple", "Silver Lotus Temple", "temple", m, {
      spawn: { x: 36, y: 13 }, indoors: true,
      events: [
        { type: "npc", x: 34, y: 12, id: "suyin", name: "Abbess Suyin", hue: "#d4b46a", talk: "suyin" },
        { type: "npc", x: 10, y: 10, id: "ren", name: "Acolyte Ren", hue: "#a0c4e8", talk: "ren", quest: "missing_acolyte" },
        { type: "npc", x: 62, y: 40, id: "wen", name: "Old Wen", hue: "#8a7a5a", talk: "wen" },
        { type: "npc", x: 20, y: 28, id: "monk", name: "Night Monk", hue: "#c0c8d8", talk: "monk" },
        { type: "npc", x: 48, y: 28, id: "pilgrim", name: "Pilgrim", hue: "#d4c0a0", talk: "pilgrim" },
        { type: "save", x: 36, y: 38 },
        { type: "chest", x: 7, y: 8, id: "chest_temple_petal", item: "lotus_petal" },
        { type: "chest", x: 64, y: 8, id: "chest_temple_lore", item: "lore_west" },
        { type: "chest", x: 8, y: 42, id: "chest_temple_salve", item: "sealing_salve" },
        { type: "sign", x: 36, y: 20, text: "Here the lotus opens toward the west." },
        { type: "sign", x: 36, y: 34, text: "Cloister of Quiet Water — do not skip stones. The pond remembers names." },
        { type: "warp", x: 35, y: 50, map: "village", tx: 48, ty: 8, dir: "down" },
        { type: "warp", x: 36, y: 50, map: "village", tx: 48, ty: 8, dir: "down" },
        { type: "warp", x: 37, y: 50, map: "village", tx: 48, ty: 8, dir: "down" }
      ]
    });
  })();

  // ----- VILLAGE: Lina-ref canal street (houses | canal | lamps | cobble | lamps | canal | houses) -----
  (function () {
    const rnd = rng(77);
    const m = make(100, 80, t.GRASS);
    rect(m, 0, 0, 100, 5, t.TREE);
    rect(m, 0, 75, 100, 5, t.TREE);
    rect(m, 0, 0, 5, 80, t.TREE);
    rect(m, 95, 0, 5, 80, t.TREE);
    // north temple stairs onto the street
    rect(m, 40, 4, 12, 8, t.PATH);
    set(m, 44, 4, t.STAIR); set(m, 45, 4, t.STAIR); set(m, 46, 4, t.STAIR);
    set(m, 41, 6, t.LAMP); set(m, 50, 6, t.LAMP);
    // dual canals hugging the street
    canalV(m, 31, 10, 68, 3);
    canalV(m, 58, 10, 68, 3);
    // cobble street between canals
    rect(m, 34, 10, 24, 60, t.PATH);
    // lamp rows on the inner banks (on cobble)
    lamps(m, 35, 12, 66, 4);
    lamps(m, 56, 12, 66, 4);
    // round bushes along the canal inner edge (like the ref)
    for (let y = 13; y < 66; y += 5) {
      set(m, 36, y, t.HEDGE); set(m, 55, y, t.HEDGE);
    }
    // wooden bridges over canals
    bridgeH(m, 31, 18, 3); bridgeH(m, 58, 18, 3);
    bridgeH(m, 31, 34, 3); bridgeH(m, 58, 34, 3);
    bridgeH(m, 31, 50, 3); bridgeH(m, 58, 50, 3);
    // packed west houses facing the street (doors east)
    const inn = house(m, 8, 12, 9, 7, "e");
    const wen = house(m, 8, 28, 8, 7, "e");
    house(m, 8, 44, 8, 7, "e");
    house(m, 18, 20, 7, 6, "e");
    house(m, 18, 36, 7, 6, "e");
    house(m, 18, 52, 7, 6, "e");
    // packed east houses facing the street (doors west)
    const mira = house(m, 75, 12, 9, 7, "w");
    house(m, 84, 12, 8, 7, "w");
    house(m, 75, 28, 8, 7, "w");
    house(m, 84, 28, 8, 7, "w");
    house(m, 75, 44, 8, 7, "w");
    house(m, 84, 52, 8, 7, "w");
    // flower beds / fences against house fronts
    for (let y = 14; y < 62; y += 3) {
      if (get(m, 29, y) === t.GRASS) set(m, 29, y, t.FLOWER);
      if (get(m, 62, y) === t.GRASS) set(m, 62, y, t.FLOWER);
    }
    for (let y = 16; y < 60; y += 8) {
      set(m, 7, y, t.FENCE); set(m, 93, y, t.FENCE);
    }
    set(m, 46, 22, t.ALTAR);
    set(m, 42, 26, t.BENCH); set(m, 49, 26, t.BENCH);
    set(m, 38, 40, t.STALL); set(m, 52, 40, t.STALL);
    set(m, 45, 16, t.STATUE);
    scatter(m, 6, 64, 20, 8, t.FLOWER, 18, (c) => c === t.GRASS, rnd);
    scatter(m, 70, 64, 20, 8, t.FLOWER, 16, (c) => c === t.GRASS, rnd);
    scatter(m, 6, 68, 88, 6, t.TREE, 30, (c) => c === t.GRASS, rnd);
    // south road
    rect(m, 42, 68, 10, 8, t.PATH);
    set(m, 41, 70, t.LAMP); set(m, 52, 70, t.LAMP);

    DOORS.inn = inn; DOORS.mira = mira; DOORS.wen = wen;

    M.village = done("village", "Lotus-Step Village", "town", m, {
      spawn: { x: 46, y: 10 },
      events: [
        { type: "warp", x: 44, y: 5, map: "temple", tx: 36, ty: 48, dir: "up" },
        { type: "warp", x: 45, y: 5, map: "temple", tx: 36, ty: 48, dir: "up" },
        { type: "warp", x: 46, y: 5, map: "temple", tx: 36, ty: 48, dir: "up" },
        { type: "warp", x: inn.dx, y: inn.dy, map: "inn", tx: 8, ty: 10, dir: "up", door: true },
        { type: "warp", x: mira.dx, y: mira.dy, map: "house_mira", tx: 6, ty: 8, dir: "up", door: true },
        { type: "warp", x: wen.dx, y: wen.dy, map: "house_wen", tx: 5, ty: 8, dir: "up", door: true },
        { type: "npc", x: 40, y: 32, id: "jori", name: "Jori", hue: "#e8c070", talk: "jori", quest: "canal_fox" },
        { type: "npc", x: 32, y: 34, id: "fisherman", name: "Canal Fisher", hue: "#6a8aaa", talk: "fisherman" },
        { type: "npc", x: 48, y: 42, id: "hana_out", name: "Hana", hue: "#d4a0b0", talk: "hana" },
        { type: "npc", x: 38, y: 40, id: "baker", name: "Baker", hue: "#e0b080", talk: "baker" },
        { type: "npc", x: 52, y: 40, id: "florist", name: "Florist", hue: "#d0e0a0", talk: "florist" },
        { type: "npc", x: 59, y: 34, id: "boatman", name: "Boatman", hue: "#6a90a8", talk: "boatman" },
        { type: "npc", x: 43, y: 20, id: "kid2", name: "Lantern Kid", hue: "#f0d090", talk: "kid2" },
        { type: "save", x: 46, y: 22 },
        { type: "chest", x: 7, y: 60, id: "chest_village_chalice", item: "moonwell_chalice" },
        { type: "chest", x: 91, y: 62, id: "chest_village_petal", item: "lotus_petal" },
        { type: "sign", x: 46, y: 12, text: "Lotus-Step Village — last kind light before the trees begin to speak." },
        { type: "trigger", x: 42, y: 72, w: 10, h: 1, flagNeed: "intro_done", flagNeedOff: "camp1_done", scene: "first_camp" },
        { type: "warp", x: 44, y: 76, map: "forest", tx: 100, ty: 4, dir: "down" },
        { type: "warp", x: 45, y: 76, map: "forest", tx: 100, ty: 4, dir: "down" },
        { type: "warp", x: 46, y: 76, map: "forest", tx: 100, ty: 4, dir: "down" },
        { type: "warp", x: 47, y: 76, map: "forest", tx: 100, ty: 4, dir: "down" }
      ]
    });
  })();

  // ----- FOREST 200x160 (procedural) -----
  (function () {
    const rnd = rng(404);
    const W = 200, H = 160;
    const m = make(W, H, t.TREE);
    // Noise-based biome layers
    const n1 = noise2d(404, W, H, 22);   // open grass patches
    const n2 = noise2d(807, W, H, 18);   // corrupt zones
    const n3 = noise2d(1123, W, H, 28);  // wetland patches
    const n4 = noise2d(321, W, H, 12);   // tree density
    for (let y = 1; y < H - 1; y++) {
      for (let x = 1; x < W - 1; x++) {
        const v1 = n1(x, y), v2 = n2(x, y), v3 = n3(x, y), v4 = n4(x, y);
        if (v2 > 0.73 && y > 30) {
          set(m, x, y, t.CORRUPT);
        } else if (v3 > 0.77 && y > 40 && y < H - 20) {
          set(m, x, y, t.WATER);
        } else if (v1 > 0.52) {
          set(m, x, y, v4 > 0.58 ? t.GRASS : t.DEAD);
        } else {
          set(m, x, y, t.TREE);
        }
      }
    }
    // Main winding trail (north to south)
    line(m, 100, 2, 100, 22, t.DIRT, 1);
    line(m, 100, 22, 80, 40, t.DIRT, 1);
    line(m, 80, 40, 80, 60, t.DIRT, 1);
    line(m, 80, 60, 100, 74, t.DIRT, 1);
    line(m, 100, 74, 112, 92, t.DIRT, 1);
    line(m, 112, 92, 100, 112, t.DIRT, 1);
    line(m, 100, 112, 100, 132, t.DIRT, 1);
    line(m, 100, 132, 100, 156, t.DIRT, 1);
    // Branch trails
    line(m, 100, 22, 132, 36, t.DIRT, 1);
    line(m, 132, 36, 150, 52, t.DIRT, 1);
    line(m, 150, 52, 142, 72, t.DIRT, 1);
    line(m, 80, 40, 56, 44, t.DIRT, 1);
    line(m, 56, 44, 40, 62, t.DIRT, 1);
    line(m, 80, 60, 60, 74, t.DIRT, 1);
    line(m, 60, 74, 44, 80, t.DIRT, 1);
    line(m, 112, 92, 132, 98, t.DIRT, 1);
    line(m, 132, 98, 162, 102, t.DIRT, 1);
    line(m, 100, 112, 80, 116, t.DIRT, 1);
    line(m, 112, 92, 130, 106, t.DIRT, 1);
    line(m, 130, 106, 162, 110, t.DIRT, 1);
    // Rivers
    canalV(m, 70, 20, 62, 2);
    bridgeH(m, 70, 40, 2);
    canalH(m, 62, 72, 92, 2);
    bridgeV(m, 80, 60, 2);
    canalV(m, 120, 68, 90, 2);
    bridgeH(m, 120, 74, 2);
    canalH(m, 100, 102, 132, 2);
    bridgeV(m, 100, 112, 2);
    // West clearing — altar camp (Master Shen)
    rect(m, 72, 34, 20, 14, t.GRASS);
    scatter(m, 72, 34, 20, 14, t.FLOWER, 24, () => true, rnd);
    set(m, 80, 40, t.ALTAR);
    set(m, 74, 36, t.BENCH); set(m, 88, 36, t.BENCH);
    // East clearing — stone statue
    rect(m, 122, 30, 20, 16, t.GRASS);
    scatter(m, 122, 30, 20, 16, t.FLOWER, 18, () => true, rnd);
    set(m, 132, 36, t.STATUE);
    // Southwest clearing
    rect(m, 34, 56, 18, 12, t.GRASS);
    scatter(m, 34, 56, 18, 12, t.FLOWER, 14, () => true, rnd);
    set(m, 42, 62, t.ALTAR);
    // Southeast clearing
    rect(m, 114, 86, 24, 16, t.GRASS);
    scatter(m, 114, 86, 24, 16, t.FLOWER, 20, () => true, rnd);
    set(m, 124, 92, t.ALTAR);
    set(m, 118, 90, t.BENCH); set(m, 128, 90, t.BENCH);
    // Hidden NW grotto
    rect(m, 14, 48, 18, 12, t.GRASS);
    set(m, 22, 54, t.FOUNT);
    frame(m, 14, 48, 18, 12, t.HEDGE);
    // Ancient shrine SE corner
    rect(m, 158, 132, 14, 12, t.MARBLE);
    frame(m, 159, 133, 12, 10, t.WALL);
    set(m, 164, 136, t.ALTAR); set(m, 165, 136, t.ALTAR);
    set(m, 164, 141, t.DOOR);
    // Mid-map camp
    rect(m, 98, 70, 8, 6, t.DIRT);
    set(m, 101, 72, t.ALTAR); set(m, 99, 74, t.CRATE); set(m, 105, 72, t.BENCH);
    // Lower camp
    rect(m, 76, 108, 8, 6, t.DIRT);
    set(m, 80, 110, t.ALTAR);
    // Corrupt grove (mid)
    rect(m, 28, 72, 28, 22, t.CORRUPT);
    scatter(m, 28, 72, 28, 22, t.DEAD, 42, () => true, rnd);
    // Boss grove (south)
    rect(m, 88, 142, 28, 16, t.CORRUPT);
    scatter(m, 88, 142, 28, 16, t.DEAD, 24, () => true, rnd);
    rect(m, 96, 146, 12, 8, t.DIRT);
    set(m, 101, 149, t.ALTAR);
    // East ruins pocket
    rect(m, 158, 82, 16, 14, t.RUBBLE);
    rect(m, 160, 84, 10, 8, t.DIRT);
    set(m, 164, 88, t.STATUE);
    lamps(m, 99, 6, 22, 6);
    lamps(m, 79, 42, 60, 6);
    lamps(m, 99, 76, 132, 6);
    lamps(m, 111, 94, 110, 6);

    M.forest = done("forest", "Whispering Forest", "forest", m, {
      spawn: { x: 100, y: 4 },
      events: [
        { type: "warp", x: 99, y: 2, map: "village", tx: 45, ty: 68, dir: "up" },
        { type: "warp", x: 100, y: 2, map: "village", tx: 46, ty: 68, dir: "up" },
        { type: "warp", x: 101, y: 2, map: "village", tx: 47, ty: 68, dir: "up" },
        { type: "save", x: 80, y: 40 },
        { type: "save", x: 132, y: 36 },
        { type: "save", x: 101, y: 72 },
        { type: "save", x: 124, y: 92 },
        { type: "save", x: 80, y: 110 },
        { type: "npc", x: 81, y: 41, id: "shen", name: "Master Shen", hue: "#c0c4a0", scene: "quest_shen", appearIfOff: "quest_shen" },
        { type: "chest", x: 16, y: 54, id: "chest_forest_grotto", item: "moonwell_chalice" },
        { type: "chest", x: 40, y: 62, id: "chest_forest_bow", item: "whisperwood_bow" },
        { type: "chest", x: 154, y: 88, id: "chest_forest_petal", item: "lotus_petal" },
        { type: "chest", x: 160, y: 86, id: "chest_forest_salve", item: "sealing_salve" },
        { type: "chest", x: 163, y: 135, id: "chest_forest_shrine", item: "prayer_beads" },
        { type: "encounter", x: 86, y: 24, battle: "tutorial_wisp", once: "tut_wisp", appearIfOff: "tut_wisp" },
        { type: "encounter", x: 38, y: 80, battle: "forest_vines", once: "forest_skirmish", appearIfOff: "forest_skirmish" },
        { type: "encounter", x: 101, y: 149, battle: "hollow_oak", once: "hollow_oak_dead", appearIfOff: "hollow_oak_dead", name: "Heartwood Hollow" },
        { type: "sign", x: 100, y: 8, text: "The trees whisper. Do not answer unless you can afford the reply." },
        { type: "sign", x: 132, y: 38, text: "A stone with no name. Someone loved a scout here." },
        { type: "sign", x: 22, y: 50, text: "Grotto of Quiet Weeping — some names endure in water." },
        { type: "sign", x: 164, y: 134, text: "Ancient Shrine of the Second Light — old when the forest was young." },
        { type: "warp", x: 99, y: 157, map: "meridia", tx: 79, ty: 8, dir: "down", needFlag: "hollow_oak_dead" },
        { type: "warp", x: 100, y: 157, map: "meridia", tx: 79, ty: 8, dir: "down", needFlag: "hollow_oak_dead" },
        { type: "warp", x: 101, y: 157, map: "meridia", tx: 79, ty: 8, dir: "down", needFlag: "hollow_oak_dead" },
        { type: "block", x: 100, y: 157, needFlagOff: "hollow_oak_dead", text: "The heartwood still bars the west." }
      ]
    });
  })();

  // ----- MERIDIA 160x120 (expanded city) -----
  (function () {
    const rnd = rng(900);
    const W = 160, H = 120;
    const m = make(W, H, t.GRASS);
    // Mountain border
    rect(m, 0, 0, W, 4, t.MTN);
    rect(m, 0, 0, 6, H, t.MTN);
    rect(m, W - 6, 0, 6, H, t.MTN);
    rect(m, 0, H - 4, W, 4, t.MTN);
    rect(m, 6, 4, W - 12, 8, t.PALE);
    // Main streets
    rect(m, 50, 12, 60, 80, t.PATH);     // north-south boulevard
    rect(m, 10, 30, 40, 6, t.PATH);      // west cross street
    rect(m, 110, 30, 40, 6, t.PATH);     // east cross street
    rect(m, 10, 52, 40, 6, t.PATH);      // west mid street
    rect(m, 110, 52, 40, 6, t.PATH);     // east mid street
    rect(m, 10, 72, 140, 6, t.PATH);     // south market street
    rect(m, 50, 92, 60, 22, t.PATH);     // south road to gate
    // Plazas
    plaza(m, 68, 24, 24, 14);
    set(m, 79, 30, t.ALTAR);
    set(m, 72, 26, t.BENCH); set(m, 84, 26, t.BENCH);
    set(m, 72, 36, t.STATUE); set(m, 84, 36, t.STALL);
    set(m, 70, 30, t.LAMP); set(m, 88, 30, t.LAMP);
    plaza(m, 68, 64, 24, 10);
    set(m, 79, 68, t.STATUE);
    // Canals
    canalV(m, 42, 18, 78, 4);
    canalV(m, 110, 18, 78, 4);
    canalH(m, 78, 42, 113, 3);
    bridgeH(m, 42, 30, 4); bridgeH(m, 110, 30, 4);
    bridgeH(m, 42, 54, 4); bridgeH(m, 110, 54, 4);
    bridgeH(m, 42, 74, 4); bridgeH(m, 110, 74, 4);
    lamps(m, 51, 14, 90, 5); lamps(m, 108, 14, 90, 5);
    lamps(m, 72, 14, 24, 5); lamps(m, 84, 14, 24, 5);
    // Districts — west
    const tavern = house(m, 10, 18, 12, 10);
    const keep = house(m, 10, 38, 10, 8);
    house(m, 10, 58, 10, 8);
    house(m, 22, 18, 10, 8);
    house(m, 22, 38, 9, 7);
    house(m, 22, 58, 9, 7);
    house(m, 10, 76, 10, 8);
    house(m, 22, 76, 9, 7);
    house(m, 34, 76, 8, 7);
    // Districts — east
    const smith = house(m, 128, 18, 12, 10);
    const korin = house(m, 128, 38, 10, 8);
    house(m, 128, 58, 10, 8);
    house(m, 116, 18, 10, 8);
    house(m, 116, 38, 9, 7);
    house(m, 116, 58, 9, 7);
    house(m, 128, 76, 10, 8);
    house(m, 116, 76, 9, 7);
    house(m, 104, 76, 8, 7);
    // Central district houses (south market)
    house(m, 52, 86, 10, 9);
    house(m, 64, 86, 9, 9);
    house(m, 76, 86, 10, 9);
    house(m, 88, 86, 9, 9);
    house(m, 100, 86, 10, 9);
    garden(m, 56, 14, 10, 8, rnd);
    garden(m, 94, 14, 10, 8, rnd);
    for (let x = 56; x < 108; x += 6) set(m, x, 72, t.STALL);
    set(m, 60, 68, t.BENCH); set(m, 80, 68, t.BENCH); set(m, 100, 68, t.BENCH);
    set(m, 79, 42, t.STATUE);
    scatter(m, 8, 90, 144, 14, t.FLOWER, 60, (c) => c === t.GRASS, rnd);
    // South gate
    rect(m, 74, 108, 12, 8, t.PATH);
    set(m, 72, 110, t.LAMP); set(m, 86, 110, t.LAMP);
    set(m, 75, 112, t.WALL); set(m, 84, 112, t.WALL);

    DOORS.tavern = tavern; DOORS.smith = smith; DOORS.keep = keep; DOORS.korin = korin;

    M.meridia = done("meridia", "Kingdom of Meridia", "city", m, {
      spawn: { x: 79, y: 8 },
      events: [
        { type: "warp", x: 78, y: 5, map: "forest", tx: 100, ty: 155, dir: "up" },
        { type: "warp", x: 79, y: 5, map: "forest", tx: 100, ty: 155, dir: "up" },
        { type: "warp", x: 80, y: 5, map: "forest", tx: 100, ty: 155, dir: "up" },
        { type: "warp", x: tavern.dx, y: tavern.dy, map: "tavern", tx: 8, ty: 12, dir: "up", door: true },
        { type: "warp", x: smith.dx, y: smith.dy, map: "blacksmith", tx: 7, ty: 10, dir: "up", door: true },
        { type: "warp", x: keep.dx, y: keep.dy, map: "keeper_house", tx: 6, ty: 8, dir: "up", door: true },
        { type: "warp", x: korin.dx, y: korin.dy, map: "korin_home", tx: 6, ty: 8, dir: "up", door: true },
        { type: "npc", x: 79, y: 36, id: "lyra_npc", name: "Lyra", hue: "#c4a06a", scene: "meridia_arrival", appearIfOff: "lyra_joined" },
        { type: "npc", x: 90, y: 50, id: "captain", name: "Watch-Captain", hue: "#7080a0", talk: "captain" },
        { type: "npc", x: 68, y: 68, id: "granny", name: "Market Granny", hue: "#c0a080", talk: "granny" },
        { type: "npc", x: 52, y: 44, id: "jori2", name: "Jori", hue: "#e8c070", scene: "canal_quest_start", appearIf: "camp1_done", appearIfOff: "quest_canal" },
        { type: "npc", x: 76, y: 72, id: "baker2", name: "Spice Seller", hue: "#d09070", talk: "baker" },
        { type: "npc", x: 20, y: 36, id: "guard", name: "Gate Guard", hue: "#8090a8", talk: "guard" },
        { type: "npc", x: 120, y: 36, id: "guard2", name: "Canal Watch", hue: "#8090a8", talk: "guard" },
        { type: "npc", x: 60, y: 76, id: "merchant", name: "Traveling Merchant", hue: "#b0c070", talk: "florist" },
        { type: "npc", x: 96, y: 76, id: "herbalist", name: "Herbalist", hue: "#70c090", talk: "baker" },
        { type: "save", x: 79, y: 30 },
        { type: "save", x: 79, y: 68 },
        { type: "chest", x: 12, y: 102, id: "chest_meridia_petal", item: "lotus_petal" },
        { type: "chest", x: 146, y: 102, id: "chest_meridia_salve", item: "sealing_salve" },
        { type: "chest", x: 60, y: 90, id: "chest_meridia_charm", item: "climber_charm" },
        { type: "sign", x: 79, y: 18, text: "MERIDIA — By canal and lantern, we keep the west at a polite distance." },
        { type: "sign", x: 79, y: 70, text: "South Market — The best bread in the west, or possibly the last." },
        { type: "encounter", x: 79, y: 105, battle: "canal_specter", once: "quest_canal", appearIf: "canal_ready", appearIfOff: "quest_canal", name: "The Canal's Mouth" },
        { type: "warp", x: 78, y: 114, map: "ashen", tx: 30, ty: 4, dir: "down", needFlag: "lyra_joined" },
        { type: "warp", x: 79, y: 114, map: "ashen", tx: 30, ty: 4, dir: "down", needFlag: "lyra_joined" },
        { type: "warp", x: 80, y: 114, map: "ashen", tx: 30, ty: 4, dir: "down", needFlag: "lyra_joined" },
        { type: "block", x: 79, y: 114, needFlagOff: "lyra_joined", text: "The western gate stays shut without a scout's word. Find Lyra in the plaza." }
      ]
    });
  })();

  // ----- ASHEN PASS 60x160 (expanded switchbacks) -----
  (function () {
    const rnd = rng(3);
    const W = 60, H = 160;
    const m = make(W, H, t.MTN);
    rect(m, 2, 2, W - 4, H - 4, t.ASH);
    scatter(m, 2, 2, W - 4, H - 4, t.RUBBLE, 200, () => true, rnd);
    scatter(m, 2, 2, W - 4, H - 4, t.DEAD, 60, () => true, rnd);
    // Longer switchback trail
    line(m, 30, 2, 30, 20, t.PATH, 1);
    line(m, 30, 20, 14, 36, t.PATH, 1);
    line(m, 14, 36, 14, 56, t.PATH, 1);
    line(m, 14, 56, 44, 72, t.PATH, 1);
    line(m, 44, 72, 44, 92, t.PATH, 1);
    line(m, 44, 92, 20, 108, t.PATH, 1);
    line(m, 20, 108, 20, 124, t.PATH, 1);
    line(m, 20, 124, 38, 138, t.PATH, 1);
    line(m, 38, 138, 38, 150, t.PATH, 1);
    line(m, 38, 150, 30, 156, t.PATH, 1);
    // Overlook branches
    line(m, 44, 80, 54, 76, t.PATH, 1);
    line(m, 14, 46, 6, 42, t.PATH, 1);
    line(m, 20, 116, 8, 114, t.PATH, 1);
    // Camp clearings
    rect(m, 22, 22, 16, 8, t.DIRT);
    set(m, 30, 25, t.ALTAR); set(m, 24, 26, t.BENCH); set(m, 34, 26, t.CRATE);
    rect(m, 8, 58, 12, 8, t.DIRT);
    set(m, 12, 62, t.ALTAR); set(m, 10, 60, t.CRATE);
    rect(m, 36, 94, 14, 8, t.DIRT);
    set(m, 44, 97, t.ALTAR); set(m, 40, 98, t.BENCH); set(m, 48, 97, t.CRATE);
    rect(m, 14, 126, 14, 8, t.DIRT);
    set(m, 20, 130, t.STATUE);
    rect(m, 30, 150, 14, 8, t.DIRT);
    set(m, 36, 154, t.ALTAR);
    // Lamps
    lamps(m, 29, 4, 20, 5);
    lamps(m, 15, 38, 56, 5);
    lamps(m, 43, 74, 92, 5);
    lamps(m, 21, 110, 124, 5);
    lamps(m, 39, 140, 150, 5);
    // Cave pockets
    rect(m, 46, 42, 8, 6, t.RUBBLE); rect(m, 48, 44, 6, 4, t.DIRT);
    rect(m, 4, 78, 8, 6, t.RUBBLE);  rect(m, 6, 80, 6, 4, t.DIRT);
    rect(m, 48, 114, 8, 6, t.RUBBLE); rect(m, 50, 116, 6, 4, t.DIRT);
    rect(m, 4, 136, 8, 6, t.RUBBLE);  rect(m, 6, 138, 6, 4, t.DIRT);

    M.ashen = done("ashen", "Ashen Pass", "pass", m, {
      spawn: { x: 30, y: 4 },
      events: [
        { type: "warp", x: 29, y: 2, map: "meridia", tx: 79, ty: 112, dir: "up" },
        { type: "warp", x: 30, y: 2, map: "meridia", tx: 79, ty: 112, dir: "up" },
        { type: "warp", x: 31, y: 2, map: "meridia", tx: 79, ty: 112, dir: "up" },
        { type: "save", x: 30, y: 25 },
        { type: "save", x: 12, y: 62 },
        { type: "save", x: 44, y: 97 },
        { type: "save", x: 36, y: 154 },
        { type: "chest", x: 50, y: 44, id: "chest_pass_charm", item: "climber_charm" },
        { type: "chest", x: 7, y: 80, id: "chest_pass_petal", item: "lotus_petal" },
        { type: "chest", x: 50, y: 116, id: "chest_pass_salve", item: "sealing_salve" },
        { type: "chest", x: 7, y: 138, id: "chest_pass_beads", item: "prayer_beads" },
        { type: "trigger", x: 28, y: 56, w: 6, h: 1, scene: "ashen_camp", flagNeedOff: "ashen_camp_done" },
        { type: "encounter", x: 20, y: 130, battle: "bound_hound", once: "quest_hound", appearIfOff: "quest_hound", name: "The Bound Hound" },
        { type: "encounter", x: 36, y: 154, battle: "gate_warden", once: "warden_dead", appearIfOff: "warden_dead", name: "Ashen Gate Warden" },
        { type: "warp", x: 29, y: 157, map: "ruins", tx: 60, ty: 5, dir: "down", needFlag: "warden_dead" },
        { type: "warp", x: 30, y: 157, map: "ruins", tx: 60, ty: 5, dir: "down", needFlag: "warden_dead" },
        { type: "warp", x: 31, y: 157, map: "ruins", tx: 60, ty: 5, dir: "down", needFlag: "warden_dead" },
        { type: "sign", x: 30, y: 8, text: "ASHEN PASS — The mountain keeps what the war would not bury." },
        { type: "sign", x: 44, y: 94, text: "Look down. Meridia is a rumor of lamps." },
        { type: "sign", x: 38, y: 152, text: "Beyond here — the ruins remember what we refused to." }
      ]
    });
  })();

  // ----- RUINS 88x70 -----
  (function () {
    const rnd = rng(12);
    const m = make(88, 70, t.RUBBLE);
    rect(m, 4, 4, 80, 62, t.ASH);
    scatter(m, 4, 4, 80, 62, t.RUBBLE, 200, () => true, rnd);
    scatter(m, 4, 4, 80, 62, t.DEAD, 30, () => true, rnd);
    // processional
    rect(m, 36, 4, 16, 62, t.MARBLE);
    lamps(m, 37, 6, 58, 6); lamps(m, 50, 6, 58, 6);
    // side halls
    rect(m, 8, 10, 18, 14, t.MARBLE);
    frame(m, 8, 10, 18, 14, t.WALL);
    set(m, 17, 23, t.DOOR);
    set(m, 16, 16, t.STATUE);
    rect(m, 62, 10, 18, 14, t.MARBLE);
    frame(m, 62, 10, 18, 14, t.WALL);
    set(m, 71, 23, t.DOOR);
    set(m, 70, 16, t.STATUE);
    // dead canals
    canalV(m, 20, 28, 48, 3);
    canalV(m, 65, 28, 48, 3);
    bridgeH(m, 20, 36, 3); bridgeH(m, 65, 36, 3);
    // court
    rect(m, 28, 30, 32, 18, t.MARBLE);
    frame(m, 30, 32, 28, 14, t.GOLD);
    set(m, 44, 38, t.FOUNT);
    set(m, 34, 36, t.COL); set(m, 54, 36, t.COL);
    set(m, 34, 42, t.COL); set(m, 54, 42, t.COL);
    // throne hall
    rect(m, 32, 50, 24, 16, t.MARBLE);
    frame(m, 32, 50, 24, 16, t.WALL);
    rect(m, 40, 52, 8, 10, t.CARPET);
    set(m, 43, 54, t.ALTAR); set(m, 44, 54, t.ALTAR);
    set(m, 44, 65, t.DOOR);
    set(m, 36, 54, t.COL); set(m, 51, 54, t.COL);
    scatter(m, 6, 50, 20, 14, t.CRATE, 8, (c) => c === t.ASH || c === t.RUBBLE, rnd);

    M.ruins = done("ruins", "Ruins of the Betrayed Court", "ruins", m, {
      spawn: { x: 44, y: 5 },
      events: [
        { type: "warp", x: 43, y: 3, map: "ashen", tx: 20, ty: 105, dir: "up" },
        { type: "warp", x: 44, y: 3, map: "ashen", tx: 20, ty: 105, dir: "up" },
        { type: "warp", x: 45, y: 3, map: "ashen", tx: 20, ty: 105, dir: "up" },
        { type: "save", x: 16, y: 16 },
        { type: "save", x: 44, y: 38 },
        { type: "npc", x: 44, y: 28, id: "echo", name: "Court Echo", hue: "#8a4a6a", talk: "echo" },
        { type: "npc", x: 34, y: 38, id: "tablet", name: "Courtyard Tablet", hue: "#d4b46a", scene: "courtyard_tablet" },
        { type: "chest", x: 70, y: 14, id: "chest_ruins_lore", item: "lore_kael" },
        { type: "chest", x: 12, y: 14, id: "chest_ruins_shard", item: "shard_crown" },
        { type: "chest", x: 8, y: 54, id: "chest_ruins_petal", item: "lotus_petal" },
        { type: "trigger", x: 42, y: 56, w: 6, h: 1, scene: "betrayed_court", flagNeedOff: "court_vn_done" },
        { type: "encounter", x: 44, y: 62, battle: "mirror_shade", once: "court_survived", appearIf: "unseal_choice_made", appearIfOff: "court_survived", name: "The Unbetrayed" },
        { type: "warp", x: 43, y: 65, map: "throne", tx: 28, ty: 11, dir: "down", needFlag: "court_survived" },
        { type: "warp", x: 44, y: 65, map: "throne", tx: 28, ty: 11, dir: "down", needFlag: "court_survived" },
        { type: "warp", x: 45, y: 65, map: "throne", tx: 28, ty: 11, dir: "down", needFlag: "court_survived" },
        { type: "sign", x: 44, y: 10, text: "THE BETRAYED COURT — Names were taken from the walls." }
      ]
    });
  })();

  // ----- THRONE 56x40 -----
  (function () {
    const rnd = rng(1);
    const m = make(56, 40, t.ASH);
    rect(m, 0, 0, 56, 6, t.MTN);
    rect(m, 0, 0, 6, 40, t.MTN);
    rect(m, 50, 0, 6, 40, t.MTN);
    rect(m, 18, 6, 20, 18, t.PALE);
    frame(m, 20, 8, 16, 12, t.WALL);
    rect(m, 24, 10, 8, 8, t.GOLD);
    set(m, 27, 12, t.ALTAR); set(m, 28, 12, t.ALTAR);
    set(m, 22, 10, t.COL); set(m, 33, 10, t.COL);
    set(m, 27, 19, t.DOOR); set(m, 28, 19, t.DOOR);
    canalH(m, 22, 16, 39, 3);
    bridgeV(m, 27, 22, 3); bridgeV(m, 28, 22, 3);
    rect(m, 22, 26, 12, 8, t.PATH);
    set(m, 28, 30, t.ALTAR);
    scatter(m, 8, 24, 40, 12, t.RUBBLE, 30, (c) => c === t.ASH, rnd);
    lamps(m, 21, 10, 18, 4); lamps(m, 34, 10, 18, 4);

    M.throne = done("throne", "Throne of Ash — Outer Gates", "throne", m, {
      spawn: { x: 28, y: 11 },
      events: [
        { type: "warp", x: 27, y: 6, map: "ruins", tx: 44, ty: 63, dir: "up" },
        { type: "warp", x: 28, y: 6, map: "ruins", tx: 44, ty: 63, dir: "up" },
        { type: "save", x: 28, y: 30 },
        { type: "trigger", x: 26, y: 18, w: 6, h: 1, scene: "slice_ending", flagNeedOff: "slice_ending_seen" },
        { type: "chest", x: 12, y: 28, id: "chest_throne_lore", item: "lore_throne" },
        { type: "sign", x: 30, y: 16, text: "BEYOND: the Demon King sleeps. Do not wake him kindly." }
      ]
    });
  })();

  // ----- INTERIORS (larger rooms) -----
  M.inn = parse("inn", "Hana's Inn", "town", `
|WWWWWWWWWWWWWWWWW
|W_______________W
|W_ooo_______bbb_W
|W_______________W
|W____CCCCCCC____W
|W____CCCCCCC____W
|W_______________W
|W_++_________++_W
|W_______________W
|W_______________W
|W_______________W
|WWWWWWWDWWWWWWWWW
`, {
    spawn: { x: 8, y: 10 }, indoors: true,
    events: [
      { type: "npc", x: 8, y: 5, id: "hana", name: "Hana", hue: "#d4a0b0", talk: "hana" },
      { type: "chest", x: 2, y: 2, id: "chest_inn_salve", item: "sealing_salve" },
      { type: "warp", x: 8, y: 11, map: "village", tx: DOORS.inn.dx + 1, ty: DOORS.inn.dy, dir: "right" }
    ]
  });

  M.house_mira = parse("house_mira", "Acolyte's Cottage", "town", `
|WWWWWWWWWWWW
|W__________W
|W_++_______W
|W__________W
|W____A_____W
|W__________W
|W__________W
|W__________W
|WWWWWWDWWWWW
`, {
    spawn: { x: 6, y: 7 }, indoors: true,
    events: [
      { type: "npc", x: 6, y: 4, id: "mira", name: "Acolyte Mira", hue: "#e0b0d0", talk: "mira", appearIf: "quest_acolyte_found" },
      { type: "chest", x: 2, y: 2, id: "chest_mira", item: "prayer_beads", appearIf: "quest_acolyte_found" },
      { type: "sign", x: 4, y: 4, text: "A half-finished letter: 'Mother, the canal fox is real—' the rest is wet.", set: "quest_acolyte_found" },
      { type: "warp", x: 6, y: 8, map: "village", tx: DOORS.mira.dx - 1, ty: DOORS.mira.dy, dir: "left" }
    ]
  });

  M.house_wen = parse("house_wen", "Wen's Shed", "town", `
|WWWWWWWWWWWW
|W__________W
|W_ooo______W
|W__________W
|W____*_____W
|W__________W
|W__________W
|W__________W
|WWWWWWDWWWWW
`, {
    spawn: { x: 6, y: 7 }, indoors: true,
    events: [
      { type: "chest", x: 2, y: 2, id: "chest_wen", item: "lore_west" },
      { type: "sign", x: 5, y: 4, text: "Seed packets: LOTUS (do not let demon prince near), LOTUS (backup), BEANS." },
      { type: "warp", x: 6, y: 8, map: "village", tx: DOORS.wen.dx + 1, ty: DOORS.wen.dy, dir: "right" }
    ]
  });

  M.tavern = parse("tavern", "The Poisoned Word", "city", `
|WWWWWWWWWWWWWWWWW
|W_______________W
|W_ooo_______bbb_W
|W_______________W
|W___CCCCCCCCC___W
|W___CCCCCCCCC___W
|W_______________W
|W_++_++_++_++___W
|W_______________W
|W_______________W
|W_______________W
|W_______________W
|WWWWWWWWDWWWWWWWW
`, {
    spawn: { x: 8, y: 11 }, indoors: true,
    events: [
      { type: "npc", x: 8, y: 5, id: "bard", name: "Bard with a Letter", hue: "#b080c0", scene: "sealed_letter" },
      { type: "npc", x: 3, y: 8, id: "sera", name: "Sera", hue: "#e0a070", scene: "sera_found", appearIfOff: "sera_found" },
      { type: "warp", x: 8, y: 12, map: "meridia", tx: 14, ty: 25, dir: "down" }
    ]
  });

  M.blacksmith = parse("blacksmith", "Korin's Forge", "city", `
|WWWWWWWWWWWWWW
|W____________W
|W_###____ooo_W
|W_#A#________W
|W_###________W
|W____________W
|W____________W
|W____________W
|W____________W
|W____________W
|WWWWWWWDWWWWWW
`, {
    spawn: { x: 7, y: 9 }, indoors: true,
    events: [
      { type: "npc", x: 4, y: 3, id: "korin", name: "Korin", hue: "#c07040", scene: "blacksmith" },
      { type: "warp", x: 7, y: 10, map: "meridia", tx: 88, ty: 25, dir: "down" }
    ]
  });

  M.keeper_house = parse("keeper_house", "Lantern Keep", "city", `
|WWWWWWWWWWWW
|W__________W
|W_L________W
|W__________W
|W____A_____W
|W__________W
|W__________W
|W__________W
|WWWWWWDWWWWW
`, {
    spawn: { x: 6, y: 7 }, indoors: true,
    events: [
      { type: "npc", x: 6, y: 4, id: "keeper", name: "Lantern Keeper", hue: "#e8d080", scene: "lantern_keeper" },
      { type: "warp", x: 6, y: 8, map: "meridia", tx: 14, ty: 48, dir: "down" }
    ]
  });

  M.korin_home = parse("korin_home", "Korin's Rooms", "city", `
|WWWWWWWWWWWW
|W__________W
|W_ooo______W
|W__________W
|W__________W
|W__________W
|W__________W
|W__________W
|WWWWWWDWWWWW
`, {
    spawn: { x: 6, y: 7 }, indoors: true,
    events: [
      { type: "chest", x: 2, y: 2, id: "chest_korin", item: "sealing_salve" },
      { type: "warp", x: 6, y: 8, map: "meridia", tx: 88, ty: 48, dir: "down" }
    ]
  });

  return M;
})();
