/* =============================================================================
   Content loader: server-driven game content with offline fallbacks.
   Runs after the bundled content scripts (content.js, maps.js, dialogue.js,
   config.js = the bundled snapshot) and before the engine, which it starts.

   1. GET {contentURL}?have=<bundled hash>&schema=2 with a short timeout (1.5 s).
      The server answers a SIGNED envelope { schema: 2, kid, alg: "Ed25519",
      payload: "<json>", sig }. payload = { schema, version, have, baseHash,
      base?, overrides, updatedAt, issuedAt }:
        base       newer full content, only sent when our bundle is older
        overrides  JSON Merge Patch tuned on the server (always sent)
      The signature covers the exact payload string and is checked against the
      bundled public keys (js/content-keys.js). In the iOS app the native shell
      fetches and verifies (CryptoKit) and serves the envelope at
      app://game/__content (SOTH_HOST.contentVerified).
   2. Network failure or bad signature: use the last good envelope, re-verified
      (web: localStorage; iOS: the native cache behind the same URL).
   3. Nothing cached or invalid: use the bundled snapshot as-is.
   Every candidate is validated (SothContent.validate): data only, no markup,
   asset references limited to bundled files, paywall offers limited to known
   product IDs, never prices. Failures fall back a level.
   Local dev / headless tests (localhost) use the bundled snapshot unless
   ?content=remote. ?content=bundled forces the bundle anywhere.
   ============================================================================= */
(() => {
  const C = window.SothContent;
  const host = window.SOTH_HOST || null;
  const qs = new URLSearchParams(location.search);
  const isLocal = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
  const url = (host && host.contentURL) || "https://grepawk.com/high-priestess/api/v1/content";
  const mode = qs.get("content") || (isLocal && !host ? "bundled" : "remote");
  const TIMEOUT = (host && host.contentTimeoutMs) || 1500;
  const CACHE_KEY = "soth_content_cache_v2";
  const KEYS = (host && host.contentKeys) || window.SOTH_CONTENT_KEYS || {};
  const trustHost = !!(host && host.contentVerified);
  const useCache = !(host && host.contentCache === false);
  const bundled = { DATA: window.DATA, MAPS: window.MAPS, SCENES: window.SCENES, PAYWALL: window.PAYWALL, FLAGS: window.FLAGS };
  const have = C.contentHash(bundled);
  const assets = (host && host.assets) || [];
  const status = { source: "bundled", have, version: null, warnings: [], errors: [] };
  window.SOTH_CONTENT = status;

  function bytes(b64) {
    const s = atob(b64.replace(/-/g, "+").replace(/_/g, "/"));
    const out = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
    return out;
  }
  // Signed envelope -> payload object, or null.
  async function open(env) {
    if (!env || env.schema !== 2 || typeof env.payload !== "string" || typeof env.sig !== "string") return null;
    if (!trustHost) {
      const k = KEYS[env.kid];
      if (!k || env.alg !== "Ed25519" || !(window.crypto && crypto.subtle)) return null;
      try {
        const key = await crypto.subtle.importKey("raw", bytes(k), { name: "Ed25519" }, false, ["verify"]);
        const ok = await crypto.subtle.verify({ name: "Ed25519" }, key, bytes(env.sig), new TextEncoder().encode(env.payload));
        if (!ok) { status.errors.push("bad signature"); return null; }
      } catch (e) {
        status.errors.push("signature check unavailable");
        return null;
      }
    }
    try {
      const p = JSON.parse(env.payload);
      return p && p.schema === 2 ? p : null;
    } catch (e) { return null; }
  }
  function readCache() {
    if (!useCache) return null;
    try {
      const c = JSON.parse(localStorage.getItem(CACHE_KEY) || "null");
      return c && c.env ? c : null;
    } catch (e) { return null; }
  }
  function writeCache(c) {
    if (!useCache) return;
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(c)); } catch (e) {}
  }
  async function fetchRemote(cache) {
    if (typeof fetch !== "function") return null;
    const ctl = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timer = setTimeout(() => { if (ctl) ctl.abort(); }, TIMEOUT);
    try {
      const headers = {};
      if (cache && cache.have === have && cache.etag) headers["If-None-Match"] = cache.etag;
      const q = (url.indexOf("?") >= 0 ? "&" : "?") + "have=" + have + "&schema=2";
      const r = await fetch(url + q, { headers, signal: ctl ? ctl.signal : undefined, cache: "no-cache" });
      if (r.status === 304 && cache && cache.have === have) {
        const p = await open(cache.env);
        return p ? { payload: p, from: "remote" } : null;
      }
      if (!r.ok) return null;
      const env = await r.json();
      const p = await open(env);
      if (!p) return null;
      writeCache({ have, etag: r.headers.get("ETag"), env, savedAt: Date.now() });
      return { payload: p, from: r.headers.get("X-Soth-Source") === "cache" ? "cache" : "remote" };
    } catch (e) {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }
  // A base is used only when the payload was issued for this exact bundle (a cached copy made
  // for an older app build must not replace a newer bundle).
  function apply(payload, from) {
    const useBase = payload.have === have && payload.base && payload.baseHash && payload.baseHash !== have;
    const base = useBase ? Object.assign({}, bundled, payload.base) : bundled;
    const merged = C.mergePatch(base, payload.overrides || {});
    const res = C.validate(merged, { ref: bundled, assets });
    status.warnings = res.warnings;
    status.errors = res.errors;
    if (!res.ok) return false;
    window.DATA = res.content.DATA;
    window.MAPS = res.content.MAPS;
    window.SCENES = res.content.SCENES;
    window.PAYWALL = res.content.PAYWALL;
    window.FLAGS = res.content.FLAGS || {};
    status.source = from;
    status.version = payload.version == null ? null : payload.version;
    status.baseHash = useBase ? payload.baseHash : have;
    return true;
  }
  function startEngine() {
    if (status.warnings.length && window.console) console.warn("[content]", status.source, status.warnings);
    if (window.Platform) {
      Platform.event("content", { source: status.source, version: status.version, have, PAYWALL: window.PAYWALL || null, FLAGS: window.FLAGS || {} });
    }
    const s = document.createElement("script");
    s.src = "js/game.js";
    s.async = false;
    document.body.appendChild(s);
  }

  (async () => {
    try {
      if (mode !== "bundled") {
        const cache = readCache();
        const got = await fetchRemote(cache);
        if (!(got && apply(got.payload, got.from)) && cache) {
          const p = await open(cache.env);
          if (p) apply(p, "cache");
        }
      }
    } catch (e) {
      status.errors = [String(e && e.message || e)];
    }
    startEngine();
  })();
})();
