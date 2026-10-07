/* =============================================================================
   Content loader — server-driven game content with offline fallbacks.
   Runs after the bundled content scripts (content.js, maps.js, dialogue.js =
   the bundled snapshot) and before the engine, which it starts when done.

   1. GET {contentURL}?have=<bundled hash> with a short timeout (1.5 s).
      The server answers { schema, version, baseHash, base?, overrides }:
        base       newer full content, only sent when our bundle is older
        overrides  JSON Merge Patch tuned on the server (always sent)
   2. Network failure -> last good response cached in localStorage.
   3. Nothing cached / invalid -> bundled snapshot as-is.
   Every candidate is validated (SothContent.validate): data only, no markup,
   asset references limited to bundled files; failures fall back a level.
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
  const CACHE_KEY = "soth_content_cache_v1";
  const bundled = { DATA: window.DATA, MAPS: window.MAPS, SCENES: window.SCENES };
  const have = C.contentHash(bundled);
  const assets = (host && host.assets) || [];
  const status = { source: "bundled", have, version: null, warnings: [], errors: [] };
  window.SOTH_CONTENT = status;

  function readCache() {
    try {
      const c = JSON.parse(localStorage.getItem(CACHE_KEY) || "null");
      return c && c.schema === C.SCHEMA && c.payload ? c : null;
    } catch (e) { return null; }
  }
  function writeCache(c) {
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(c)); } catch (e) {}
  }
  async function fetchRemote(cache) {
    if (typeof fetch !== "function") return null;
    const ctl = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timer = setTimeout(() => { if (ctl) ctl.abort(); }, TIMEOUT);
    try {
      const headers = {};
      if (cache && cache.have === have && cache.etag) headers["If-None-Match"] = cache.etag;
      const q = (url.indexOf("?") >= 0 ? "&" : "?") + "have=" + have + "&schema=" + C.SCHEMA;
      const r = await fetch(url + q, { headers, signal: ctl ? ctl.signal : undefined, cache: "no-cache" });
      if (r.status === 304 && cache && cache.have === have) return { payload: cache.payload, from: "remote" };
      if (!r.ok) return null;
      const payload = await r.json();
      if (!payload || payload.schema !== C.SCHEMA) return null;
      writeCache({ schema: C.SCHEMA, have, etag: r.headers.get("ETag"), payload, savedAt: Date.now() });
      return { payload, from: "remote" };
    } catch (e) {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }
  // trustBase: the payload's base was issued for this exact bundle (cached copies made for an
  // older app build must not replace a newer bundle).
  function apply(payload, from, trustBase) {
    const useBase = trustBase && payload.base && payload.baseHash && payload.baseHash !== have;
    const base = useBase ? payload.base : bundled;
    const merged = C.mergePatch(base, payload.overrides || {});
    const res = C.validate(merged, { ref: bundled, assets });
    status.warnings = res.warnings;
    status.errors = res.errors;
    if (!res.ok) return false;
    window.DATA = res.content.DATA;
    window.MAPS = res.content.MAPS;
    window.SCENES = res.content.SCENES;
    status.source = from;
    status.version = payload.version == null ? null : payload.version;
    status.baseHash = useBase ? payload.baseHash : have;
    return true;
  }
  function startEngine() {
    if (status.warnings.length && window.console) console.warn("[content]", status.source, status.warnings);
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
        if (!(got && apply(got.payload, got.from, true)) && cache) {
          apply(cache.payload, "cache", cache.have === have);
        }
      }
    } catch (e) {
      status.errors = [String(e && e.message || e)];
    }
    startEngine();
  })();
})();
