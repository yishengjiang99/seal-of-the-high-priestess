/* Battle feel overlays: visible turn order, tap-to-target zones with a clear target ring, a 1x/2x speed toggle and an
   Auto button for trivial fights. DOM only, placed in #app's 1280x720 space; the canvas battle renderer is untouched.
   game.js owns the rules (pacing, skip-on-tap, auto policy, tapTarget); this module only shows state and forwards taps.
   Controller / keyboard keep working: the menus and Z / X are unchanged, the target ring simply follows the cursor. */
(function (root) {
  "use strict";
  let A = null, host = null, els = {}, key = "", zoneKey = "", nextAt = 0, faults = 0;
  const t = (k, v) => (root.I18N ? root.I18N.t(k, v) : k);
  function el(tag, cls, text, parent) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    if (parent) parent.appendChild(e);
    return e;
  }
  const speedOf = () => ((A.S.settings.battleSpeed || 1) >= 1.5 ? 2 : 1);

  function build() {
    host = document.getElementById("app");
    els.top = el("div", "hidden", null, host); els.top.id = "bux-top";
    els.speed = el("button", "bux-btn", "", els.top); els.speed.type = "button";
    els.auto = el("button", "bux-btn bux-auto hidden", t("battle.auto"), els.top); els.auto.type = "button";
    els.speed.addEventListener("click", () => {
      A.S.settings.battleSpeed = speedOf() === 2 ? 1 : 2;
      if (A.persistSettings) A.persistSettings();
      key = ""; refresh();
    });
    els.auto.addEventListener("click", () => { A.setAuto(!(A.S.battle && A.S.battle.auto)); key = ""; refresh(); });
    els.order = el("div", "hidden", null, host); els.order.id = "bux-order"; els.order.setAttribute("aria-label", t("battle.order"));
    els.zones = el("div", "hidden", null, host); els.zones.id = "bux-zones";
    els.ring = el("div", "bux-ring hidden", null, els.zones);
    els.chip = el("div", "bux-chip hidden", "", els.zones);
    els.hint = el("div", "bux-hint hidden", t("battle.tap_hint"), host);
  }

  function visible() {
    const S = A.S, b = S.battle;
    if (S.state !== "battle" || !b || S.cine) return false;
    const hud = document.getElementById("battle-hud");
    return !(hud && hud.classList.contains("cinematic")) && b.phase !== "intro" && b.phase !== "victory" && b.phase !== "tutorial";
  }

  function refresh() {
    const S = A.S, b = S.battle;
    els.speed.textContent = speedOf() + "×";
    els.speed.setAttribute("aria-label", t("battle.speed", { n: speedOf() }));
    els.speed.classList.toggle("fast", speedOf() === 2);
    const ok = !!b && A.autoAllowed(b);
    els.auto.classList.toggle("hidden", !ok);
    els.auto.classList.toggle("on", !!(b && b.auto));
    els.auto.setAttribute("aria-pressed", b && b.auto ? "true" : "false");
    els.auto.setAttribute("aria-label", b && b.auto ? t("battle.auto_on") : t("battle.auto_label"));
  }

  function renderOrder(b) {
    const list = A.turnOrder(9);
    const k = list.map((x) => x.id + (x.now ? "!" : "")).join(",");
    if (k === els.order._k) return;
    els.order._k = k;
    els.order.textContent = "";
    list.forEach((x, i) => {
      const c = el("div", "bux-turn " + (x.side === "p" ? "hero" : "foe") + (x.now ? " now" : ""), null, els.order);
      const name = x.name || "?";
      el("span", "", name.replace(/^(the|an?)\s+/i, "").charAt(0).toUpperCase(), c);
      c.title = name;
      if (x.color && x.side === "e") c.style.setProperty("--tc", x.color);
      if (i === 0 && x.now) el("i", "bux-now", null, c);
    });
  }

  function renderZones(b) {
    const S = A.S;
    const cmd = b.phase === "cmd" && b.actor && b.actor.side === "p" && !b.healingRainAim;
    const targeting = cmd && b.menu === "target";
    const sel = targeting ? b.targetList[b.cmdIdx] : null;
    const units = !cmd ? [] : targeting ? b.targetList : b.foes.filter((f) => f.alive);
    const k = [cmd, targeting, b.cmdIdx, units.map((u) => u.id).join(",")].join("|");
    // zones are rebuilt only when the choice set changes; positions follow the units every frame
    if (k !== zoneKey) {
      zoneKey = k;
      els.zones.querySelectorAll(".bux-zone").forEach((z) => z.remove());
      units.forEach((u) => {
        const z = el("button", "bux-zone" + (targeting ? " live" : ""), null, els.zones);
        z.type = "button"; z._u = u;
        z.setAttribute("aria-label", u.name);
        z.addEventListener("click", (e) => { e.stopPropagation(); if (A.tapTarget(z._u)) zoneKey = ""; });
      });
      els.hint.classList.toggle("hidden", !(cmd && !targeting && units.length > 1 && !root.__buxHinted));
    }
    els.zones.classList.toggle("hidden", !cmd);
    els.zones.querySelectorAll(".bux-zone").forEach((z) => {
      const p = A.posOf(z._u);
      z.style.transform = "translate(" + (p.x - 56).toFixed(0) + "px," + (p.y - 84).toFixed(0) + "px)";
    });
    if (sel) {
      const p = A.posOf(sel);
      els.ring.classList.remove("hidden"); els.chip.classList.remove("hidden");
      els.ring.classList.toggle("ally", sel.side === "p");
      els.ring.style.transform = "translate(" + (p.x - 48).toFixed(0) + "px," + (p.y + 6).toFixed(0) + "px)";
      const txt = sel.name + "  " + (sel.hp | 0) + "/" + sel.maxHp;
      if (els.chip.textContent !== txt) els.chip.textContent = txt;
      els.chip.style.transform = "translate(" + (p.x - 70).toFixed(0) + "px," + (p.y - 92).toFixed(0) + "px)";
    } else { els.ring.classList.add("hidden"); els.chip.classList.add("hidden"); }
  }

  function frame(tm) {
    if (!A || faults > 5) return;
    try {
      const vis = visible();
      const show = vis;
      els.top.classList.toggle("hidden", !show);
      els.order.classList.toggle("hidden", !show);
      if (!show) { els.zones.classList.add("hidden"); els.hint.classList.add("hidden"); if (A.S.state !== "battle") { zoneKey = ""; key = ""; els.top.classList.add("hidden"); } return; }
      const b = A.S.battle;
      const k = [b.id, b.phase, b.auto ? 1 : 0, speedOf(), b.foes.length].join("|");
      if (k !== key) { key = k; refresh(); }
      if (tm >= nextAt) { nextAt = tm + 120; renderOrder(b); }
      renderZones(b);
      if (b.menu === "target" && !root.__buxHinted && b.phase === "cmd") root.__buxHinted = true;
    } catch (e) { faults++; }
  }

  function attach(api) { if (A) return; A = api; build(); refresh(); }
  root.BattleUX = { attach, frame, setAuto: (on) => A && A.setAuto(on) };
})(typeof window !== "undefined" ? window : globalThis);
