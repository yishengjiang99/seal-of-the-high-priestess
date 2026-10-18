/* =============================================================================
   Platform adapter — the only place the game talks to its host.
   Web: plain localStorage, everything else is a no-op.
   iOS app (window.SOTH_HOST set by the native shell before any script runs):
     - storage writes are mirrored to the native save store (the source of truth,
       which seeds localStorage at document start and syncs to the cloud),
     - haptics / game events / suspend-save go to the shell over
       webkit.messageHandlers.soth,
     - purchases: the shell owns StoreKit and pushes entitlements in
       (SOTH_HOST.entitlements at start, Platform.call("entitlements", e) later).
       Paywall regions come from window.PAYWALL (server-driven config). The web
       build never gates anything.
   ============================================================================= */
window.Platform = (() => {
  const host = window.SOTH_HOST || null;
  const handler = host && window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.soth;
  const native = !!handler;
  function post(msg) {
    if (!native) return;
    try { handler.postMessage(msg); } catch (e) {}
  }
  function getItem(k) {
    try { return localStorage.getItem(k); } catch (e) { return null; }
  }
  // Throws when nothing could persist the value (web with storage blocked), so callers can report it.
  function setItem(k, v) {
    let ok = true;
    try { localStorage.setItem(k, v); } catch (e) { ok = false; }
    post({ type: "store", key: k, value: v });
    if (!ok && !native) throw new Error("storage unavailable");
  }
  function removeItem(k) {
    try { localStorage.removeItem(k); } catch (e) {}
    post({ type: "store", key: k, value: null });
  }
  const hooks = {};
  let ent = (host && host.entitlements) || {};
  const paywallOn = () => native && !!window.PAYWALL && !(window.FLAGS && window.FLAGS.paywall === false);
  function placementOn(name) {
    const p = window.PAYWALL && window.PAYWALL.placements && window.PAYWALL.placements[name];
    return !p || p.enabled !== false;
  }
  // Active input method (touch / gamepad / keyboard), pushed by the shell when a controller or
  // keyboard is used; a touch switches back. Exposed as Platform.input and as an input-* class
  // on <html> so prompts can match the device. No styling is attached here.
  let input = { mode: "touch", controller: null };
  function setInput(info) {
    if (!info || !info.mode) return;
    input = { mode: String(info.mode), controller: info.controller || null };
    const cl = document.documentElement.classList;
    ["touch", "gamepad", "keyboard"].forEach((m) => cl.toggle("input-" + m, m === input.mode));
    if (hooks.inputChanged) { try { hooks.inputChanged(input); } catch (e) {} }
  }
  if (typeof window.addEventListener === "function") {
    window.addEventListener("touchstart", () => { if (input.mode !== "touch") setInput({ mode: "touch" }); }, { passive: true, capture: true });
  }
  // Accessibility preferences. iOS: pushed by the shell (SOTH_HOST.a11y at start, Platform.call("a11y", p)
  // later) from its Settings + the system Reduce Motion switch. Web: stored in localStorage
  // ("soth_a11y", edited in Options) with prefers-reduced-motion as the default.
  //   subtitleScale  dialogue text size multiplier (1 = default)
  //   reduceMotion   no screen shake / flashes, CSS animations off
  //   colorCues      extra non-colour cues (patterned bars, shape markers)
  const a11y = { subtitleScale: 1, reduceMotion: false, colorCues: false };
  function applyA11y(p) {
    if (!p || typeof p !== "object") return;
    if (p.subtitleScale != null) a11y.subtitleScale = Math.min(2, Math.max(0.8, +p.subtitleScale || 1));
    if (p.reduceMotion != null) a11y.reduceMotion = !!p.reduceMotion;
    if (p.colorCues != null) a11y.colorCues = !!p.colorCues;
    const el = document.documentElement;
    el.style.setProperty("--subtitle-scale", String(a11y.subtitleScale));
    el.classList.toggle("a11y-reduce-motion", a11y.reduceMotion);
    el.classList.toggle("a11y-cues", a11y.colorCues);
    if (hooks.a11yChanged) { try { hooks.a11yChanged(a11y); } catch (e) {} }
  }
  (function initA11y() {
    let saved = null;
    try { saved = JSON.parse(getItem("soth_a11y") || "null"); } catch (e) {}
    const mq = typeof window.matchMedia === "function" ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;
    applyA11y({ reduceMotion: !!(mq && mq.matches), ...(saved || {}), ...((host && host.a11y) || {}) });
  })();
  return {
    native,
    a11y,
    // Web Options: change and remember a preference (the iOS shell owns these on iOS).
    setA11y(p) {
      applyA11y(p);
      try { setItem("soth_a11y", JSON.stringify(a11y)); } catch (e) {}
    },
    get input() { return input; },
    name: native ? (host.platform || "native") : "web",
    getItem, setItem, removeItem,
    haptic(kind) { post({ type: "haptic", kind }); },
    event(name, data) { post({ type: "event", name, data: data || null }); },
    // The engine registers hooks; the host calls them (e.g. Platform.call("suspend")).
    on(name, fn) { hooks[name] = fn; },
    call(name, arg) {
      if (name === "entitlements" && arg && typeof arg === "object") ent = arg;
      if (name === "inputMode") { setInput(arg); return input; }
      if (name === "a11y") { applyA11y(arg); return a11y; }
      try { return hooks[name] ? hooks[name](arg) : null; } catch (e) { return null; }
    },
    entitled(name) { return !!ent[name]; },
    // false = the map is past the free part and the Full Game isn't owned: the shell shows the paywall.
    gate(mapId, why) {
      if (!paywallOn() || ent.full) return true;
      const gated = (window.PAYWALL.gatedMaps || []).indexOf(mapId) >= 0;
      if (!gated) return true;
      if (placementOn("region1_end")) post({ type: "paywall", placement: "region1_end", map: mapId, why: why || "" });
      return false;
    },
    // Soft upsell entry points (e.g. the menu) are shown only when this is true.
    upsell(placement) { return paywallOn() && !ent.full && placementOn(placement); },
    paywall(placement) { post({ type: "paywall", placement: placement || "menu" }); }
  };
})();
