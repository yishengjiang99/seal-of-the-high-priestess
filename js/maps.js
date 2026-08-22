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
  function house(m, x, y, w, h) {
    rect(m, x, y, w, 2, t.ROOF);
    rect(m, x, y + 2, w, h - 2, t.WALL);
    for (let i = 1; i < w - 1; i += 2) set(m, x + i, y + 2, t.WINDOW);
    const dx = x + (w >> 1), dy = y + h - 1;
    set(m, dx, dy, t.DOOR);
    return { x, y, w, h, dx, dy };
  }
  function garden(m, x, y, w, h, rnd) {
    rect(m, x, y, w, h, t.GRASS);
    frame(m, x, y, w, h, t.HEDGE);
    scatter(m, x + 1, y + 1, w - 2, h - 2, t.FLOWER, (w * h) >> 2, (c) => c === t.GRASS, rnd);
  }
  function plaza(m, x, y, w, h) {
    rect(m, x, y, w, h, t.PLAZA);
    set(m, x + (w >> 1), y + (h >> 1), t.FOUNT);
  }
  function done(id, name, music, m, extras) {
    return { id, name, music, w: m.w, h: m.h, tiles: m.tiles, ...(extras || {}) };
  }

  const M = {};

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

  // ----- VILLAGE 100x76 canal town -----
  (function () {
    const rnd = rng(77);
    const m = make(100, 76, t.GRASS);
    // forest belt
    rect(m, 0, 0, 100, 6, t.TREE);
    rect(m, 0, 70, 100, 6, t.TREE);
    rect(m, 0, 0, 4, 76, t.TREE);
    rect(m, 96, 0, 4, 76, t.TREE);
    scatter(m, 4, 6, 92, 8, t.TREE, 40, (c) => c === t.GRASS, rnd);
    // temple approach
    rect(m, 46, 4, 8, 12, t.PATH);
    set(m, 47, 4, t.STAIR); set(m, 48, 4, t.STAIR); set(m, 49, 4, t.STAIR);
    set(m, 48, 6, t.STATUE); set(m, 46, 8, t.LAMP); set(m, 53, 8, t.LAMP);
    // dual canals
    canalV(m, 32, 12, 62, 4);
    canalV(m, 64, 12, 62, 4);
    canalH(m, 62, 32, 67, 3);
    // main cobble
    rect(m, 36, 12, 28, 50, t.PATH);
    rect(m, 8, 20, 24, 6, t.PATH);
    rect(m, 68, 20, 24, 6, t.PATH);
    rect(m, 8, 38, 24, 5, t.PATH);
    rect(m, 68, 38, 24, 5, t.PATH);
    plaza(m, 45, 24, 10, 8);
    set(m, 50, 28, t.ALTAR);
    set(m, 46, 25, t.BENCH); set(m, 53, 25, t.BENCH);
    set(m, 46, 30, t.STALL); set(m, 53, 30, t.STALL);
    set(m, 44, 28, t.LAMP); set(m, 55, 28, t.LAMP);
    lamps(m, 37, 14, 58, 5); lamps(m, 62, 14, 58, 5);
    lamps(m, 44, 14, 20, 6); lamps(m, 55, 14, 20, 6);
    // bridges across canals
    bridgeH(m, 32, 22, 4); bridgeH(m, 64, 22, 4);
    bridgeH(m, 32, 40, 4); bridgeH(m, 64, 40, 4);
    bridgeH(m, 32, 54, 4); bridgeH(m, 64, 54, 4);
    // docks
    bridgeV(m, 31, 28, 4); bridgeV(m, 68, 28, 4);
    set(m, 31, 30, t.CRATE); set(m, 68, 32, t.CRATE);
    // houses west
    const inn = house(m, 8, 14, 8, 7);
    const wen = house(m, 8, 28, 7, 6);
    house(m, 18, 14, 7, 6);
    house(m, 8, 46, 7, 6);
    house(m, 18, 46, 6, 6);
    // houses east
    const mira = house(m, 76, 14, 7, 6);
    house(m, 84, 14, 7, 6);
    house(m, 76, 28, 7, 6);
    house(m, 84, 44, 8, 7);
    house(m, 74, 44, 7, 6);
    // south row
    house(m, 38, 56, 7, 6);
    house(m, 48, 56, 6, 6);
    house(m, 56, 56, 7, 6);
    // gardens / market
    garden(m, 38, 14, 8, 6, rnd);
    garden(m, 54, 14, 8, 6, rnd);
    set(m, 40, 48, t.STALL); set(m, 43, 48, t.STALL); set(m, 56, 48, t.STALL);
    set(m, 46, 50, t.BENCH); set(m, 53, 50, t.BENCH);
    scatter(m, 6, 54, 20, 12, t.FLOWER, 24, (c) => c === t.GRASS, rnd);
    scatter(m, 72, 54, 20, 12, t.FLOWER, 20, (c) => c === t.GRASS, rnd);
    scatter(m, 6, 8, 20, 6, t.HEDGE, 10, (c) => c === t.GRASS, rnd);
    scatter(m, 5, 64, 90, 6, t.TREE, 28, (c) => c === t.GRASS, rnd);
    // south road to forest
    rect(m, 46, 62, 8, 10, t.PATH);
    set(m, 45, 64, t.LAMP); set(m, 54, 64, t.LAMP);

    M.village = done("village", "Lotus-Step Village", "town", m, {
      spawn: { x: 48, y: 8 },
      events: [
        { type: "warp", x: 47, y: 5, map: "temple", tx: 36, ty: 48, dir: "up" },
        { type: "warp", x: 48, y: 5, map: "temple", tx: 36, ty: 48, dir: "up" },
        { type: "warp", x: 49, y: 5, map: "temple", tx: 36, ty: 48, dir: "up" },
        { type: "warp", x: inn.dx, y: inn.dy, map: "inn", tx: 8, ty: 10, dir: "up", door: true },
        { type: "warp", x: mira.dx, y: mira.dy, map: "house_mira", tx: 6, ty: 8, dir: "up", door: true },
        { type: "warp", x: wen.dx, y: wen.dy, map: "house_wen", tx: 5, ty: 8, dir: "up", door: true },
        { type: "npc", x: 40, y: 36, id: "jori", name: "Jori", hue: "#e8c070", talk: "jori", quest: "canal_fox" },
        { type: "npc", x: 31, y: 29, id: "fisherman", name: "Canal Fisher", hue: "#6a8aaa", talk: "fisherman" },
        { type: "npc", x: 50, y: 52, id: "hana_out", name: "Hana", hue: "#d4a0b0", talk: "hana" },
        { type: "npc", x: 41, y: 48, id: "baker", name: "Baker", hue: "#e0b080", talk: "baker" },
        { type: "npc", x: 57, y: 48, id: "florist", name: "Florist", hue: "#d0e0a0", talk: "florist" },
        { type: "npc", x: 70, y: 24, id: "boatman", name: "Boatman", hue: "#6a90a8", talk: "boatman" },
        { type: "npc", x: 22, y: 22, id: "kid2", name: "Lantern Kid", hue: "#f0d090", talk: "kid2" },
        { type: "save", x: 50, y: 28 },
        { type: "chest", x: 6, y: 56, id: "chest_village_chalice", item: "moonwell_chalice" },
        { type: "chest", x: 90, y: 58, id: "chest_village_petal", item: "lotus_petal" },
        { type: "sign", x: 50, y: 12, text: "Lotus-Step Village — last kind light before the trees begin to speak." },
        { type: "sign", x: 50, y: 44, text: "West canal / East canal. Do not swim. The water has opinions." },
        { type: "trigger", x: 46, y: 68, w: 8, h: 1, flagNeed: "intro_done", flagNeedOff: "camp1_done", scene: "first_camp" },
        { type: "warp", x: 47, y: 70, map: "forest", tx: 50, ty: 4, dir: "down" },
        { type: "warp", x: 48, y: 70, map: "forest", tx: 50, ty: 4, dir: "down" },
        { type: "warp", x: 49, y: 70, map: "forest", tx: 50, ty: 4, dir: "down" },
        { type: "warp", x: 50, y: 70, map: "forest", tx: 50, ty: 4, dir: "down" }
      ]
    });
  })();

  // ----- FOREST 104x88 -----
  (function () {
    const rnd = rng(404);
    const m = make(104, 88, t.TREE);
    rect(m, 2, 2, 100, 84, t.GRASS);
    scatter(m, 2, 2, 100, 84, t.TREE, 1400, (c) => c === t.GRASS, rnd);
    scatter(m, 2, 2, 100, 84, t.DEAD, 80, (c) => c === t.GRASS || c === t.TREE, rnd);
    scatter(m, 2, 2, 100, 84, t.HEDGE, 60, (c) => c === t.GRASS, rnd);
    // main trail
    line(m, 50, 2, 50, 18, t.DIRT, 1);
    line(m, 50, 18, 28, 32, t.DIRT, 1);
    line(m, 28, 32, 28, 48, t.DIRT, 1);
    line(m, 28, 48, 50, 58, t.DIRT, 1);
    line(m, 50, 58, 50, 84, t.DIRT, 1);
    line(m, 50, 18, 74, 30, t.DIRT, 1);
    line(m, 74, 30, 78, 52, t.DIRT, 1);
    line(m, 78, 52, 60, 64, t.DIRT, 1);
    line(m, 60, 64, 50, 70, t.DIRT, 1);
    line(m, 28, 40, 12, 44, t.DIRT, 1);
    line(m, 74, 36, 94, 40, t.DIRT, 1);
    // stream
    canalV(m, 40, 20, 50, 2);
    bridgeH(m, 40, 32, 2);
    canalH(m, 50, 40, 62, 2);
    bridgeV(m, 50, 50, 2);
    // clearings
    rect(m, 22, 36, 14, 10, t.GRASS);
    scatter(m, 22, 36, 14, 10, t.FLOWER, 16, () => true, rnd);
    set(m, 28, 40, t.ALTAR);
    rect(m, 68, 28, 16, 12, t.GRASS);
    scatter(m, 68, 28, 16, 12, t.FLOWER, 10, () => true, rnd);
    set(m, 76, 32, t.STATUE);
    // corrupt grove
    rect(m, 16, 58, 22, 16, t.CORRUPT);
    scatter(m, 16, 58, 22, 16, t.DEAD, 28, () => true, rnd);
    // boss grove
    rect(m, 40, 68, 24, 14, t.CORRUPT);
    scatter(m, 40, 68, 24, 14, t.DEAD, 18, () => true, rnd);
    rect(m, 48, 72, 8, 6, t.DIRT);
    set(m, 52, 74, t.ALTAR);
    // east ruin
    rect(m, 84, 54, 12, 10, t.RUBBLE);
    rect(m, 86, 56, 8, 6, t.DIRT);
    set(m, 90, 58, t.STATUE);
    lamps(m, 49, 6, 16, 5);
    lamps(m, 27, 34, 48, 5);
    lamps(m, 51, 60, 80, 6);

    M.forest = done("forest", "Whispering Forest", "forest", m, {
      spawn: { x: 50, y: 4 },
      events: [
        { type: "warp", x: 49, y: 2, map: "village", tx: 48, ty: 68, dir: "up" },
        { type: "warp", x: 50, y: 2, map: "village", tx: 48, ty: 68, dir: "up" },
        { type: "warp", x: 51, y: 2, map: "village", tx: 48, ty: 68, dir: "up" },
        { type: "save", x: 28, y: 40 },
        { type: "save", x: 76, y: 32 },
        { type: "save", x: 52, y: 64 },
        { type: "npc", x: 29, y: 41, id: "shen", name: "Master Shen", hue: "#c0c4a0", scene: "quest_shen", appearIfOff: "quest_shen" },
        { type: "chest", x: 12, y: 44, id: "chest_forest_bow", item: "whisperwood_bow" },
        { type: "chest", x: 94, y: 40, id: "chest_forest_petal", item: "lotus_petal" },
        { type: "chest", x: 90, y: 57, id: "chest_forest_salve", item: "sealing_salve" },
        { type: "encounter", x: 36, y: 22, battle: "tutorial_wisp", once: "tut_wisp", appearIfOff: "tut_wisp" },
        { type: "encounter", x: 20, y: 64, battle: "forest_vines", once: "forest_skirmish", appearIfOff: "forest_skirmish" },
        { type: "encounter", x: 52, y: 74, battle: "hollow_oak", once: "hollow_oak_dead", appearIfOff: "hollow_oak_dead", name: "Heartwood Hollow" },
        { type: "sign", x: 50, y: 8, text: "The trees whisper. Do not answer unless you can afford the reply." },
        { type: "sign", x: 76, y: 34, text: "A stone with no name. Someone loved a scout here." },
        { type: "warp", x: 49, y: 85, map: "meridia", tx: 50, ty: 6, dir: "down", needFlag: "hollow_oak_dead" },
        { type: "warp", x: 50, y: 85, map: "meridia", tx: 50, ty: 6, dir: "down", needFlag: "hollow_oak_dead" },
        { type: "warp", x: 51, y: 85, map: "meridia", tx: 50, ty: 6, dir: "down", needFlag: "hollow_oak_dead" },
        { type: "block", x: 50, y: 85, needFlagOff: "hollow_oak_dead", text: "The heartwood still bars the west." }
      ]
    });
  })();

  // ----- MERIDIA 108x84 -----
  (function () {
    const rnd = rng(900);
    const m = make(108, 84, t.GRASS);
    // mountain walls
    rect(m, 0, 0, 108, 4, t.MTN);
    rect(m, 0, 0, 6, 84, t.MTN);
    rect(m, 102, 0, 6, 84, t.MTN);
    rect(m, 0, 80, 108, 4, t.MTN);
    rect(m, 6, 4, 96, 8, t.PALE);
    // canals
    canalV(m, 30, 14, 70, 4);
    canalV(m, 74, 14, 70, 4);
    canalH(m, 70, 30, 77, 3);
    // streets
    rect(m, 34, 12, 40, 58, t.PATH);
    rect(m, 10, 24, 20, 6, t.PATH);
    rect(m, 78, 24, 20, 6, t.PATH);
    rect(m, 10, 48, 20, 6, t.PATH);
    rect(m, 78, 48, 20, 6, t.PATH);
    plaza(m, 48, 22, 12, 10);
    set(m, 54, 27, t.ALTAR);
    set(m, 50, 24, t.BENCH); set(m, 57, 24, t.BENCH);
    set(m, 50, 30, t.STATUE); set(m, 57, 30, t.STALL);
    set(m, 47, 27, t.LAMP); set(m, 60, 27, t.LAMP);
    lamps(m, 35, 14, 66, 5); lamps(m, 72, 14, 66, 5);
    lamps(m, 48, 14, 20, 5); lamps(m, 60, 14, 20, 5);
    bridgeH(m, 30, 26, 4); bridgeH(m, 74, 26, 4);
    bridgeH(m, 30, 50, 4); bridgeH(m, 74, 50, 4);
    bridgeH(m, 30, 64, 4); bridgeH(m, 74, 64, 4);
    // districts
    const tavern = house(m, 10, 16, 9, 8);
    const smith = house(m, 84, 16, 9, 8);
    const keep = house(m, 10, 40, 8, 7);
    const korin = house(m, 84, 40, 8, 7);
    house(m, 10, 56, 8, 7);
    house(m, 20, 56, 7, 6);
    house(m, 82, 56, 8, 7);
    house(m, 92, 56, 7, 6);
    house(m, 40, 58, 8, 7);
    house(m, 52, 58, 7, 6);
    house(m, 62, 58, 8, 7);
    garden(m, 38, 14, 8, 6, rnd);
    garden(m, 62, 14, 8, 6, rnd);
    set(m, 42, 46, t.STALL); set(m, 46, 46, t.STALL); set(m, 50, 46, t.STALL);
    set(m, 58, 46, t.STALL); set(m, 62, 46, t.STALL);
    set(m, 44, 52, t.BENCH); set(m, 64, 52, t.BENCH);
    set(m, 54, 40, t.STATUE);
    scatter(m, 8, 66, 92, 12, t.FLOWER, 40, (c) => c === t.GRASS, rnd);
    // south gate road
    rect(m, 50, 70, 8, 10, t.PATH);
    rect(m, 48, 76, 12, 4, t.PALE);
    set(m, 49, 76, t.WALL); set(m, 58, 76, t.WALL);

    M.meridia = done("meridia", "Kingdom of Meridia", "city", m, {
      spawn: { x: 54, y: 8 },
      events: [
        { type: "warp", x: 53, y: 5, map: "forest", tx: 50, ty: 83, dir: "up" },
        { type: "warp", x: 54, y: 5, map: "forest", tx: 50, ty: 83, dir: "up" },
        { type: "warp", x: 55, y: 5, map: "forest", tx: 50, ty: 83, dir: "up" },
        { type: "warp", x: tavern.dx, y: tavern.dy, map: "tavern", tx: 8, ty: 12, dir: "up", door: true },
        { type: "warp", x: smith.dx, y: smith.dy, map: "blacksmith", tx: 7, ty: 10, dir: "up", door: true },
        { type: "warp", x: keep.dx, y: keep.dy, map: "keeper_house", tx: 6, ty: 8, dir: "up", door: true },
        { type: "warp", x: korin.dx, y: korin.dy, map: "korin_home", tx: 6, ty: 8, dir: "up", door: true },
        { type: "npc", x: 54, y: 30, id: "lyra_npc", name: "Lyra", hue: "#c4a06a", scene: "meridia_arrival", appearIfOff: "lyra_joined" },
        { type: "npc", x: 62, y: 40, id: "captain", name: "Watch-Captain", hue: "#7080a0", talk: "captain" },
        { type: "npc", x: 46, y: 46, id: "granny", name: "Market Granny", hue: "#c0a080", talk: "granny" },
        { type: "npc", x: 36, y: 36, id: "jori2", name: "Jori", hue: "#e8c070", scene: "canal_quest_start", appearIf: "camp1_done", appearIfOff: "quest_canal" },
        { type: "npc", x: 50, y: 46, id: "baker2", name: "Spice Seller", hue: "#d09070", talk: "baker" },
        { type: "npc", x: 20, y: 28, id: "guard", name: "Gate Guard", hue: "#8090a8", talk: "guard" },
        { type: "npc", x: 80, y: 28, id: "guard2", name: "Canal Watch", hue: "#8090a8", talk: "guard" },
        { type: "save", x: 54, y: 27 },
        { type: "chest", x: 12, y: 68, id: "chest_meridia_petal", item: "lotus_petal" },
        { type: "chest", x: 96, y: 68, id: "chest_meridia_salve", item: "sealing_salve" },
        { type: "sign", x: 54, y: 16, text: "MERIDIA — By canal and lantern, we keep the west at a polite distance." },
        { type: "encounter", x: 54, y: 72, battle: "canal_specter", once: "quest_canal", appearIf: "canal_ready", appearIfOff: "quest_canal", name: "The Canal's Mouth" },
        { type: "warp", x: 53, y: 78, map: "ashen", tx: 18, ty: 4, dir: "down", needFlag: "lyra_joined" },
        { type: "warp", x: 54, y: 78, map: "ashen", tx: 18, ty: 4, dir: "down", needFlag: "lyra_joined" },
        { type: "warp", x: 55, y: 78, map: "ashen", tx: 18, ty: 4, dir: "down", needFlag: "lyra_joined" },
        { type: "block", x: 54, y: 78, needFlagOff: "lyra_joined", text: "The western gate stays shut without a scout's word. Find Lyra in the plaza." }
      ]
    });
  })();

  // ----- ASHEN PASS 40x110 switchbacks -----
  (function () {
    const rnd = rng(3);
    const m = make(40, 110, t.MTN);
    rect(m, 2, 2, 36, 106, t.ASH);
    scatter(m, 2, 2, 36, 106, t.RUBBLE, 120, () => true, rnd);
    scatter(m, 2, 2, 36, 106, t.DEAD, 40, () => true, rnd);
    // switchback trail
    line(m, 18, 2, 18, 16, t.PATH, 1);
    line(m, 18, 16, 8, 28, t.PATH, 1);
    line(m, 8, 28, 8, 40, t.PATH, 1);
    line(m, 8, 40, 28, 52, t.PATH, 1);
    line(m, 28, 52, 28, 64, t.PATH, 1);
    line(m, 28, 64, 10, 76, t.PATH, 1);
    line(m, 10, 76, 10, 88, t.PATH, 1);
    line(m, 10, 88, 20, 98, t.PATH, 1);
    line(m, 20, 98, 20, 108, t.PATH, 1);
    // camps / overlooks
    rect(m, 14, 18, 10, 6, t.DIRT);
    set(m, 18, 20, t.ALTAR); set(m, 16, 20, t.BENCH); set(m, 20, 20, t.CRATE);
    rect(m, 6, 42, 8, 6, t.DIRT);
    set(m, 8, 44, t.ALTAR);
    rect(m, 24, 66, 10, 6, t.DIRT);
    set(m, 28, 68, t.ALTAR); set(m, 26, 68, t.CRATE);
    rect(m, 8, 90, 10, 6, t.DIRT);
    set(m, 12, 92, t.STATUE);
    lamps(m, 17, 4, 14, 5);
    lamps(m, 9, 30, 40, 5);
    lamps(m, 27, 54, 64, 5);
    lamps(m, 11, 78, 88, 5);
    // cave pockets
    rect(m, 30, 30, 6, 5, t.RUBBLE);
    rect(m, 4, 70, 6, 5, t.RUBBLE);

    M.ashen = done("ashen", "Ashen Pass", "pass", m, {
      spawn: { x: 18, y: 4 },
      events: [
        { type: "warp", x: 17, y: 2, map: "meridia", tx: 54, ty: 76, dir: "up" },
        { type: "warp", x: 18, y: 2, map: "meridia", tx: 54, ty: 76, dir: "up" },
        { type: "warp", x: 19, y: 2, map: "meridia", tx: 54, ty: 76, dir: "up" },
        { type: "save", x: 18, y: 20 },
        { type: "save", x: 8, y: 44 },
        { type: "save", x: 28, y: 68 },
        { type: "chest", x: 32, y: 32, id: "chest_pass_charm", item: "climber_charm" },
        { type: "chest", x: 5, y: 72, id: "chest_pass_petal", item: "lotus_petal" },
        { type: "trigger", x: 16, y: 50, w: 6, h: 1, scene: "ashen_camp", flagNeedOff: "ashen_camp_done" },
        { type: "encounter", x: 12, y: 92, battle: "bound_hound", once: "quest_hound", appearIfOff: "quest_hound", name: "The Bound Hound" },
        { type: "encounter", x: 20, y: 104, battle: "gate_warden", once: "warden_dead", appearIfOff: "warden_dead", name: "Ashen Gate Warden" },
        { type: "warp", x: 19, y: 107, map: "ruins", tx: 40, ty: 4, dir: "down", needFlag: "warden_dead" },
        { type: "warp", x: 20, y: 107, map: "ruins", tx: 40, ty: 4, dir: "down", needFlag: "warden_dead" },
        { type: "warp", x: 21, y: 107, map: "ruins", tx: 40, ty: 4, dir: "down", needFlag: "warden_dead" },
        { type: "sign", x: 20, y: 8, text: "ASHEN PASS — The mountain keeps what the war would not bury." },
        { type: "sign", x: 28, y: 66, text: "Look down. Meridia is a rumor of lamps." }
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
      { type: "warp", x: 8, y: 11, map: "village", tx: 12, ty: 22, dir: "down" }
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
      { type: "warp", x: 6, y: 8, map: "village", tx: 79, ty: 21, dir: "down" }
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
      { type: "warp", x: 6, y: 8, map: "village", tx: 11, ty: 35, dir: "down" }
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
