/* =============================================================================
   Content core — shared by the game (browser / iOS WebView) and the save/content
   server. Pure data helpers, no DOM, no eval:
     hash53(str)              stable 53-bit hash (hex) of a JSON string
     contentHash(content)     hash of JSON.stringify({DATA, MAPS, SCENES, PAYWALL?, FLAGS?})
     mergePatch(target, p)    RFC 7386 JSON Merge Patch (returns a new value)
     validate(content, opts)  shape / safety / asset checks against a reference
   Server content is DATA ONLY (App Review 2.5.2): strings, numbers, booleans,
   arrays and objects. It can never carry code or markup.
   Collections: DATA, MAPS, SCENES (game content, required) and PAYWALL (paywall
   copy/art/placement/offered product; never prices) + FLAGS (feature flags), optional.
   ============================================================================= */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.SothContent = factory();
})(typeof self !== "undefined" ? self : this, function () {
  const SCHEMA = 1;
  const COLLECTIONS = ["DATA", "MAPS", "SCENES", "PAYWALL", "FLAGS"];
  const REQUIRED = ["DATA", "MAPS", "SCENES"];
  // In-app purchase product IDs the paywall may offer (prices come from the App Store, never from content).
  const PRODUCTS = {
    fullGame: ["com.ragnus.weather.fullgame", "com.ragnus.weather.fullgame.b"],
    supporter: ["com.ragnus.weather.supporter"]
  };
  const ASSET_RE = /\.(jpe?g|png|webp|gif|mp3|m4a|aac|ogg|wav|ttf|otf|woff2?)$/i;
  const MAX_TILE = 63;

  function hash53(str, seed) {
    let h1 = 0xdeadbeef ^ (seed || 0), h2 = 0x41c6ce57 ^ (seed || 0);
    for (let i = 0; i < str.length; i++) {
      const ch = str.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 2654435761);
      h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(14, "0");
  }
  // Absent optional collections serialize away, so pre-PAYWALL content keeps its hash.
  function pick(c) { return { DATA: c.DATA, MAPS: c.MAPS, SCENES: c.SCENES, PAYWALL: c.PAYWALL, FLAGS: c.FLAGS }; }
  function contentHash(c) { return hash53(JSON.stringify(pick(c))); }

  const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
  function clone(v) { return v === undefined ? v : JSON.parse(JSON.stringify(v)); }
  function mergePatch(target, patch) {
    if (!isObj(patch)) return clone(patch);
    const out = isObj(target) ? Object.assign({}, target) : {};
    for (const k of Object.keys(patch)) {
      if (k === "__proto__" || k === "constructor" || k === "prototype") continue;
      if (patch[k] === null) delete out[k];
      else out[k] = mergePatch(out[k], patch[k]);
    }
    return out;
  }

  // Walk every value; returns list of [parentRef, key, value, path].
  function walk(v, path, fn, parent, key) {
    fn(v, path, parent, key);
    if (Array.isArray(v)) v.forEach((x, i) => walk(x, path + "[" + i + "]", fn, v, i));
    else if (isObj(v)) Object.keys(v).forEach((k) => walk(v[k], path + "." + k, fn, v, k));
  }
  function getPath(root, keys) {
    let v = root;
    for (const k of keys) { if (v == null) return undefined; v = v[k]; }
    return v;
  }
  function referencedAssets(c) {
    const s = new Set();
    walk(pick(c), "", (v) => { if (typeof v === "string" && ASSET_RE.test(v)) s.add(v); });
    return s;
  }

  /**
   * validate(content, { ref, assets }) -> { ok, errors[], warnings[], content }
   *   ref     bundled/base content the result must stay compatible with (same collections,
   *           same DATA tables, same value types at the top of each table)
   *   assets  iterable of asset file paths known to exist in the bundle; asset references
   *           outside it are reverted to the ref value at the same path, else removed.
   * Errors reject the whole content (caller falls back); warnings are auto-repaired.
   */
  function validate(input, opts) {
    const errors = [], warnings = [];
    const ref = opts && opts.ref ? opts.ref : null;
    let c;
    try { c = clone(pick(input || {})); } catch (e) { return { ok: false, errors: ["not JSON-serializable"], warnings, content: null }; }
    for (const k of REQUIRED) if (!isObj(c[k])) errors.push(k + " missing or not an object");
    for (const k of ["PAYWALL", "FLAGS"]) if (c[k] !== undefined && !isObj(c[k])) errors.push(k + " must be an object");
    if (errors.length) return { ok: false, errors, warnings, content: null };
    if (ref) {
      for (const t of Object.keys(ref.DATA)) {
        if (!(t in c.DATA)) errors.push("DATA." + t + " missing");
        else if (typeof c.DATA[t] !== typeof ref.DATA[t] || Array.isArray(c.DATA[t]) !== Array.isArray(ref.DATA[t]))
          errors.push("DATA." + t + " has the wrong type");
      }
    }
    // Data only: no functions can exist after JSON, and no markup or script-ish strings.
    let count = 0;
    walk(c, "", (v, path) => {
      count++;
      if (typeof v === "string" && /[<>]|javascript:/i.test(v)) errors.push("markup not allowed at " + path);
      if (typeof v === "number" && !Number.isFinite(v)) errors.push("non-finite number at " + path);
    });
    if (count > 400000) errors.push("content too large");
    if (errors.length) return { ok: false, errors: errors.slice(0, 50), warnings, content: null };

    // Asset references: bundled filenames only.
    const known = new Set(opts && opts.assets ? Array.from(opts.assets) : []);
    if (ref) referencedAssets(ref).forEach((a) => known.add(a));
    const fixes = [];
    walk(c, "", (v, path, parent, key) => {
      if (typeof v !== "string" || !ASSET_RE.test(v) || known.has(v) || parent == null) return;
      fixes.push([parent, key, path, v]);
    });
    for (const [parent, key, path, v] of fixes) {
      const keys = path.replace(/\[(\d+)\]/g, ".$1").split(".").filter(Boolean);
      const back = ref ? getPath(ref, keys) : undefined;
      if (typeof back === "string" && known.has(back)) { parent[key] = back; warnings.push("unknown asset " + v + " at " + path + " -> reverted"); }
      else if (Array.isArray(parent)) { parent[key] = null; warnings.push("unknown asset " + v + " at " + path + " -> dropped"); }
      else { delete parent[key]; warnings.push("unknown asset " + v + " at " + path + " -> removed"); }
    }
    // Maps must stay walkable: integer tile grid matching w x h.
    for (const id of Object.keys(c.MAPS)) {
      const m = c.MAPS[id];
      const good = isObj(m) && Number.isInteger(m.w) && Number.isInteger(m.h) && m.w > 0 && m.h > 0 && m.w <= 1024 && m.h <= 1024 &&
        Array.isArray(m.tiles) && m.tiles.length === m.h &&
        m.tiles.every((r) => Array.isArray(r) && r.length === m.w && r.every((t) => Number.isInteger(t) && t >= 0 && t <= MAX_TILE));
      if (good) continue;
      if (ref && ref.MAPS[id]) { c.MAPS[id] = clone(ref.MAPS[id]); warnings.push("map " + id + " invalid -> reverted to bundled"); }
      else { delete c.MAPS[id]; warnings.push("map " + id + " invalid -> removed"); }
    }
    // Everything the bundle has must still exist (content can add or tune, not delete core pieces).
    if (ref) {
      for (const id of Object.keys(ref.MAPS)) if (!c.MAPS[id]) { c.MAPS[id] = clone(ref.MAPS[id]); warnings.push("map " + id + " missing -> restored"); }
      for (const id of Object.keys(ref.SCENES)) if (!c.SCENES[id]) { c.SCENES[id] = clone(ref.SCENES[id]); warnings.push("scene " + id + " missing -> restored"); }
      for (const t of ["CHARS", "SKILLS", "ITEMS", "ENEMIES", "BATTLES", "QUESTS"]) {
        if (!isObj(ref.DATA[t]) || !isObj(c.DATA[t])) continue;
        for (const id of Object.keys(ref.DATA[t])) if (!isObj(c.DATA[t][id])) { c.DATA[t][id] = clone(ref.DATA[t][id]); warnings.push(t + "." + id + " missing -> restored"); }
      }
    }
    // Paywall + flags: config only. Invalid pieces revert to the bundled config.
    if (ref && isObj(ref.PAYWALL) && !isObj(c.PAYWALL)) c.PAYWALL = clone(ref.PAYWALL);
    if (ref && isObj(ref.FLAGS) && !isObj(c.FLAGS)) c.FLAGS = clone(ref.FLAGS);
    if (isObj(c.PAYWALL)) {
      const pwErr = paywallProblems(c.PAYWALL, c.MAPS);
      if (pwErr.length) {
        warnings.push("PAYWALL invalid (" + pwErr.slice(0, 3).join("; ") + ") -> reverted to bundled");
        if (ref && isObj(ref.PAYWALL)) c.PAYWALL = clone(ref.PAYWALL); else delete c.PAYWALL;
      }
    }
    if (isObj(c.FLAGS)) {
      for (const k of Object.keys(c.FLAGS)) {
        const v = c.FLAGS[k];
        if (!/^[A-Za-z][A-Za-z0-9_]{0,40}$/.test(k) || !(typeof v === "boolean" || typeof v === "number" || typeof v === "string")) {
          delete c.FLAGS[k];
          warnings.push("flag " + k + " invalid -> removed");
        }
      }
    }
    // Battles may only use enemies that exist.
    if (isObj(c.DATA.BATTLES) && isObj(c.DATA.ENEMIES)) {
      for (const [id, b] of Object.entries(c.DATA.BATTLES)) {
        const list = b && (b.enemies || b.foes);
        if (!Array.isArray(list)) continue;
        const bad = list.filter((e) => !c.DATA.ENEMIES[typeof e === "string" ? e : e && e.id]);
        if (bad.length) {
          if (ref && ref.DATA.BATTLES[id]) { c.DATA.BATTLES[id] = clone(ref.DATA.BATTLES[id]); warnings.push("battle " + id + " uses unknown enemies -> reverted"); }
          else { delete c.DATA.BATTLES[id]; warnings.push("battle " + id + " uses unknown enemies -> removed"); }
        }
      }
    }
    return { ok: true, errors, warnings, content: c };
  }

  function paywallProblems(pw, maps) {
    const out = [];
    walk(pw, "PAYWALL", (v, path, parent, key) => { if (typeof key === "string" && /price/i.test(key)) out.push("prices are not configurable (" + path + ")"); });
    if (pw.offer !== undefined && PRODUCTS.fullGame.indexOf(pw.offer) < 0) out.push("unknown offer " + pw.offer);
    if (pw.offerVariants !== undefined) {
      if (!Array.isArray(pw.offerVariants)) out.push("offerVariants must be an array");
      else pw.offerVariants.forEach((v, i) => {
        if (!isObj(v) || PRODUCTS.fullGame.indexOf(v.product) < 0) out.push("offerVariants[" + i + "] unknown product");
        else if (!(typeof v.weight === "number" && v.weight >= 0 && v.weight <= 1000)) out.push("offerVariants[" + i + "] bad weight");
      });
    }
    if (pw.gatedMaps !== undefined) {
      if (!Array.isArray(pw.gatedMaps) || !pw.gatedMaps.every((m) => typeof m === "string" && maps && maps[m])) out.push("gatedMaps must list known maps");
      else if (pw.gatedMaps.indexOf("temple") >= 0) out.push("the prologue cannot be gated");
    }
    if (pw.supporter !== undefined && (!isObj(pw.supporter) || (pw.supporter.product !== undefined && PRODUCTS.supporter.indexOf(pw.supporter.product) < 0))) out.push("unknown supporter product");
    if (pw.placements !== undefined && !isObj(pw.placements)) out.push("placements must be an object");
    if (pw.regionCompleteFlags !== undefined && !isObj(pw.regionCompleteFlags)) out.push("regionCompleteFlags must be an object");
    return out;
  }

  return { SCHEMA, COLLECTIONS, PRODUCTS, hash53, contentHash, mergePatch, validate, referencedAssets, clone };
});
