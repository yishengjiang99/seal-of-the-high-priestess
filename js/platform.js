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
  return {
    native,
    name: native ? (host.platform || "native") : "web",
    getItem, setItem, removeItem,
    haptic(kind) { post({ type: "haptic", kind }); },
    event(name, data) { post({ type: "event", name, data: data || null }); },
    // The engine registers hooks; the host calls them (e.g. Platform.call("suspend")).
    on(name, fn) { hooks[name] = fn; },
    call(name, arg) {
      if (name === "entitlements" && arg && typeof arg === "object") ent = arg;
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
