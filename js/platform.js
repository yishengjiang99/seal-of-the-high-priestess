/* =============================================================================
   Platform adapter — the only place the game talks to its host.
   Web: plain localStorage, everything else is a no-op.
   iOS app (window.SOTH_HOST set by the native shell before any script runs):
     - storage writes are mirrored to the native save store (the source of truth,
       which seeds localStorage at document start and syncs to the cloud),
     - haptics / game events / suspend-save go to the shell over
       webkit.messageHandlers.soth.
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
  return {
    native,
    name: native ? (host.platform || "native") : "web",
    getItem, setItem, removeItem,
    haptic(kind) { post({ type: "haptic", kind }); },
    event(name, data) { post({ type: "event", name, data: data || null }); },
    // The engine registers hooks; the host calls them (e.g. Platform.call("suspend")).
    on(name, fn) { hooks[name] = fn; },
    call(name, arg) { try { return hooks[name] ? hooks[name](arg) : null; } catch (e) { return null; } }
  };
})();
