/* Quest guidance: tells the player where to go next.
   Data lives in the content bundle (DATA.GUIDE, js/content.js); this module holds
   - pure logic (objective progression, map-graph routing, world-map model) that the unit tests run in Node, and
   - a small DOM layer: objective tracker, in-map arrow / doorway ring, world map screen, "Where do I go?" card.
   game.js only calls Quest.attach({...}) once and Quest.frame(t) every frame. UI text goes through I18N (quest.* keys);
   story text is never touched. Touch-first: every control is a >=44px tap target; no d-pad / Z / X. */
(function (root, factory) {
  const Q = factory(root);
  if (typeof module === "object" && module.exports) module.exports = Q;
  else root.Quest = Q;
})(typeof window !== "undefined" ? window : globalThis, function (root) {
  "use strict";
  const T = 32;

  // ------------------------------------------------------------------ logic
  const on = (flags, k) => !!(flags && flags[k]);
  function evalCond(c, flags) {
    if (!c) return true;
    if (c.flag !== undefined) return on(flags, c.flag);
    if (Array.isArray(c.all)) return c.all.every((x) => evalCond(x, flags));
    if (Array.isArray(c.any)) return c.any.some((x) => evalCond(x, flags));
    return false;
  }
  function condFlags(c, out) {
    out = out || [];
    if (!c) return out;
    if (c.flag !== undefined) out.push(c.flag);
    for (const k of ["all", "any"]) if (Array.isArray(c[k])) c[k].forEach((x) => condFlags(x, out));
    return out;
  }

  // Where the player is in the story. The current main objective is the first one not done; anything before the
  // furthest completed main objective counts as done too, so skipping ahead never leaves a stale pointer.
  function status(g, flags) {
    const objs = (g && g.objectives) || [];
    const main = objs.filter((o) => o.track === "main");
    let last = -1;
    main.forEach((o, i) => { if (evalCond(o.done, flags)) last = i; });
    const doneIds = {};
    main.forEach((o, i) => { if (i <= last) doneIds[o.id] = true; });
    const current = main[last + 1] || null;
    const side = objs.filter((o) => o.track === "side");
    const sideDone = side.filter((o) => evalCond(o.done, flags));
    const sideActive = side.filter((o) => !evalCond(o.done, flags) && evalCond(o.after, flags));
    for (const o of sideDone) doneIds[o.id] = true;
    let tracked = current;
    const tid = flags && flags.guide_track;
    if (typeof tid === "string") { const s = sideActive.find((o) => o.id === tid); if (s) tracked = s; }
    return { main, current, finished: !current, doneIds, sideActive, sideDone, tracked, mainDone: last + 1, mainTotal: main.length };
  }

  // Map graph from warp events.
  const adjCache = new WeakMap();
  function adjacency(maps) {
    let a = adjCache.get(maps);
    if (a) return a;
    a = {};
    for (const id of Object.keys(maps)) {
      for (const ev of maps[id].events || []) {
        if (ev.type !== "warp" || !maps[ev.map] || ev.map === id) continue;
        ((a[id] = a[id] || {})[ev.map] = (a[id][ev.map] || [])).push(ev);
      }
    }
    adjCache.set(maps, a);
    return a;
  }
  const openWarps = (list, flags) => list.filter((w) => !w.needFlag || on(flags, w.needFlag));
  function route(maps, flags, from, to, ignoreLocks) {
    if (!maps[from] || !maps[to]) return null;
    if (from === to) return [from];
    const adj = adjacency(maps), prev = { [from]: null }, q = [from];
    while (q.length) {
      const cur = q.shift();
      for (const nx of Object.keys(adj[cur] || {})) {
        if (nx in prev) continue;
        if (!ignoreLocks && !openWarps(adj[cur][nx], flags).length) continue;
        prev[nx] = cur;
        if (nx === to) { const p = [to]; let c = cur; while (c) { p.unshift(c); c = prev[c]; } return p; }
        q.push(nx);
      }
    }
    return null;
  }
  // Maps you can walk to from `from` with the flags you have now.
  function reachable(maps, flags, from) {
    const adj = adjacency(maps), seen = { [from]: true }, q = [from];
    while (q.length) {
      const cur = q.shift();
      for (const nx of Object.keys(adj[cur] || {})) {
        if (seen[nx] || !openWarps(adj[cur][nx], flags).length) continue;
        seen[nx] = true; q.push(nx);
      }
    }
    return seen;
  }
  function lockText(maps, flags, path) {
    const adj = adjacency(maps);
    for (let i = 0; i + 1 < path.length; i++) {
      const list = adj[path[i]][path[i + 1]];
      if (!openWarps(list, flags).length) { const w = list.find((x) => x.needText); return { from: path[i], to: path[i + 1], text: w ? w.needText : "" }; }
    }
    return null;
  }

  // Pick, for each hop of a route, the door that makes the whole trip shortest (several gates can lead to the same
  // map: e.g. Meridia's north gate and west gate both open on the wilderness, but only one is near the ash road).
  // cost(mapId, a, b) estimates the walk between two tiles; straight-line distance by default.
  const euclid = (mapId, a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  function planHops(maps, flags, path, start, target, cost) {
    cost = cost || euclid;
    const adj = adjacency(maps);
    let layer = [{ pos: start, total: 0, chain: [] }];
    for (let i = 0; i + 1 < path.length; i++) {
      const all = adj[path[i]][path[i + 1]];
      const open = openWarps(all, flags);
      const cands = open.length ? open : all;
      const next = [];
      for (const w of cands) {
        let best = null;
        for (const st of layer) {
          const total = st.total + cost(path[i], st.pos, w);
          if (!best || total < best.total) best = { pos: { x: w.tx, y: w.ty }, total, chain: st.chain.concat([w]) };
        }
        next.push(best);
      }
      layer = next;
    }
    let best = null;
    for (const st of layer) {
      const total = st.total + (target ? cost(path[path.length - 1], st.pos, target) : 0);
      if (!best || total < best.total) best = { total, chain: st.chain };
    }
    return best.chain;
  }

  // What to point at right now, given the objective, the map the player is on and their tile.
  function nextStep(maps, flags, obj, mapId, tile) {
    if (!obj || !maps[mapId]) return null;
    if (obj.map === mapId) return { kind: "here", x: obj.x, y: obj.y, map: mapId, obj };
    let path = route(maps, flags, mapId, obj.map, false);
    if (!path) path = route(maps, flags, mapId, obj.map, true);
    if (!path) return { kind: "none", obj };
    const lock = lockText(maps, flags, path);
    const all = adjacency(maps)[mapId][path[1]];
    const open = openWarps(all, flags);
    const use = open.length ? open : all;
    const start = tile || { x: use[0].x, y: use[0].y };
    const best = planHops(maps, flags, path, start, obj)[0];
    // doorway = the run of warp tiles around the chosen one
    const grp = use.filter((w) => Math.abs(w.x - best.x) <= 3 && Math.abs(w.y - best.y) <= 3);
    const x = grp.reduce((s, w) => s + w.x, 0) / grp.length, y = grp.reduce((s, w) => s + w.y, 0) / grp.length;
    return { kind: "exit", x, y, map: mapId, toMap: path[1], path, lock, obj };
  }

  function visited(flags, id, here) { return id === here || on(flags, "seen_" + id) || on(flags, "region_" + id); }

  // World-map model: nodes with state, edges with lock state, the highlighted route.
  function worldModel(maps, g, flags, here) {
    const gn = (g && g.nodes) || {};
    const st = status(g, flags);
    const reach = reachable(maps, flags, here);
    const adj = adjacency(maps);
    const targetMap = st.tracked ? st.tracked.map : null;
    const nodes = [];
    for (const id of Object.keys(gn)) {
      if (!maps[id]) continue;
      const vis = visited(flags, id, here);
      const state = id === here ? "current" : vis ? "visited" : reach[id] ? "open" : "locked";
      nodes.push({ id, name: maps[id].name || id, label: gn[id].label || maps[id].name || id, x: gn[id].x, y: gn[id].y, note: gn[id].note || "", state, target: id === targetMap, interior: !!maps[id].indoors, visited: vis });
    }
    const seenPair = {}, edges = [];
    for (const a of Object.keys(adj)) for (const b of Object.keys(adj[a])) {
      if (!gn[a] || !gn[b]) continue;
      const key = a < b ? a + "|" + b : b + "|" + a;
      if (seenPair[key]) continue;
      seenPair[key] = true;
      const open = openWarps(adj[a][b], flags).length || (adj[b] && adj[b][a] ? openWarps(adj[b][a], flags).length : 0);
      edges.push({ a, b, open: !!open, oneway: !(adj[a] && adj[a][b]) || !(adj[b] && adj[b][a]) });
    }
    let routeIds = null;
    if (targetMap) routeIds = route(maps, flags, here, targetMap, false) || route(maps, flags, here, targetMap, true);
    return { nodes, edges, route: routeIds, status: st };
  }

  function placeInfo(maps, g, flags, id) {
    const m = maps[id];
    if (!m) return null;
    const npcs = [], foes = [];
    let altars = 0;
    for (const ev of m.events || []) {
      if (ev.appearIf && !on(flags, ev.appearIf)) continue;
      if (ev.appearIfOff && on(flags, ev.appearIfOff)) continue;
      if (ev.type === "npc" && ev.name) npcs.push(ev.name);
      else if (ev.type === "encounter" && ev.name) foes.push(ev.name);
      else if (ev.type === "save") altars++;
    }
    const adj = adjacency(maps);
    const exits = Object.keys(adj[id] || {}).map((to) => ({ id: to, name: maps[to].name || to, open: openWarps(adj[id][to], flags).length > 0, text: ((adj[id][to].find((w) => w.needText) || {}).needText) || "" }));
    const st = status(g, flags);
    const objectives = [st.current].concat(st.sideActive).filter((o) => o && o.map === id);
    return { id, name: m.name || id, npcs: Array.from(new Set(npcs)), foes: Array.from(new Set(foes)), altars, exits, objectives };
  }

  const logic = { evalCond, condFlags, status, adjacency, route, reachable, planHops, nextStep, worldModel, placeInfo, visited, lockText, openWarps };

  // ------------------------------------------------------------------ UI
  if (typeof document === "undefined") return Object.assign({ T }, logic);

  let A = null, root$ = null;
  let els = {};
  let lastMap = null, lastKey = "", nextCheck = 0, fromTracker = false, selected = null;
  const NS = "http://www.w3.org/2000/svg";
  const t = (k, v) => (root.I18N ? root.I18N.t(k, v) : k);
  function el(tag, cls, text, parent) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    if (parent) parent.appendChild(e);
    return e;
  }
  function svg(tag, attrs, parent) {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  const guide = () => (root.DATA && root.DATA.GUIDE) || null;
  const maps = () => root.MAPS || {};
  const flags = () => (A ? A.S.flags : {});
  const motionOk = () => !(root.Platform && Platform.a11y && Platform.a11y.reduceMotion);

  function build() {
    root$ = document.getElementById("app");
    els.tracker = el("div", "", null, root$);
    els.tracker.id = "quest-tracker"; els.tracker.classList.add("hidden");
    els.trkMain = el("button", "q-main", null, els.tracker);
    els.trkMain.type = "button";
    els.trkTitle = el("span", "q-title", "", els.trkMain);
    els.trkHint = el("span", "q-hint", "", els.trkMain);
    els.trkMain.addEventListener("click", () => openMap(true));
    els.trkGo = el("button", "q-go hidden", null, els.tracker);
    els.trkGo.type = "button";
    el("span", "q-go-ico", "➤", els.trkGo);
    el("span", "q-go-txt", t("quest.travel_short"), els.trkGo);
    els.trkGo.setAttribute("aria-label", t("quest.travel_objective"));
    els.trkGo.addEventListener("click", (e) => { e.stopPropagation(); travelToObjective(); });

    els.pointer = el("div", "", null, root$);
    els.pointer.id = "quest-pointer"; els.pointer.classList.add("hidden"); els.pointer.setAttribute("aria-hidden", "true");
    els.ring = el("i", "q-ring", null, els.pointer);
    els.arrow = el("i", "q-arrow", null, els.pointer);
    els.plabel = el("span", "q-plabel", "", els.pointer);

    // "Where do I go?" card
    els.card = el("div", "hidden", null, root$);
    els.card.id = "quest-card"; els.card.setAttribute("role", "dialog"); els.card.setAttribute("aria-live", "polite");
    els.cardKicker = el("div", "q-kicker", "", els.card);
    els.cardTitle = el("h3", "", "", els.card);
    els.cardHint = el("p", "", "", els.card);
    els.cardWhere = el("p", "q-where", "", els.card);
    const row = el("div", "q-row", null, els.card);
    els.cardMap = el("button", "q-btn", t("quest.show_map"), row);
    els.cardOk = el("button", "q-btn ghost", t("quest.close"), row);
    els.cardMap.type = els.cardOk.type = "button";
    els.cardOk.addEventListener("click", closeCard);
    els.cardMap.addEventListener("click", () => { closeCard(); openMap(false); });

    // World map
    els.map = el("section", "hidden", null, root$);
    els.map.id = "quest-map"; els.map.setAttribute("role", "dialog"); els.map.setAttribute("aria-label", t("quest.world_map"));
    const head = el("header", "", null, els.map);
    el("h2", "", t("quest.world_map"), head);
    els.mapMeta = el("span", "q-meta", "", head);
    els.mapClose = el("button", "q-close", "✕", head);
    els.mapClose.type = "button"; els.mapClose.setAttribute("aria-label", t("quest.close"));
    els.mapClose.addEventListener("click", closeMap);
    const body = el("div", "qm-body", null, els.map);
    els.svgHost = el("div", "qm-svg", null, body);
    els.info = el("aside", "qm-info", null, body);
    const legend = el("footer", "", null, els.map);
    for (const [cls, label] of [["current", t("quest.legend_here")], ["visited", t("quest.legend_visited")], ["open", t("quest.legend_unexplored")], ["locked", t("quest.legend_locked")], ["target", t("quest.legend_next")]]) {
      const s = el("span", "lg", null, legend);
      el("i", "dot " + cls, null, s);
      s.appendChild(document.createTextNode(label));
    }

    // Pause-menu entries
    const tabs = document.getElementById("menu-tabs");
    if (tabs && tabs.parentNode) {
      const mrow = el("div", "", null);
      mrow.id = "quest-menu-row";
      const b1 = el("button", "q-btn", t("quest.where"), mrow);
      const b2 = el("button", "q-btn ghost", t("quest.world_map"), mrow);
      b1.type = b2.type = "button";
      b1.addEventListener("click", () => showCard());
      b2.addEventListener("click", () => openMap(false));
      tabs.parentNode.insertBefore(mrow, tabs);
    }
    document.addEventListener("keydown", (e) => {
      if (e.key !== "Escape") return;
      if (!els.card.classList.contains("hidden")) { e.stopImmediatePropagation(); e.preventDefault(); closeCard(); }
      else if (!els.map.classList.contains("hidden")) { e.stopImmediatePropagation(); e.preventDefault(); closeMap(); }
    }, true);
  }

  const stateLabel = (st) => ({ current: t("quest.state_current"), visited: t("quest.state_visited"), open: t("quest.state_open"), locked: t("quest.state_locked") })[st];
  function mapName(id) { const m = maps()[id]; return (m && m.name) || id; }
  function playerTile() { return { x: Math.floor(A.S.px / T), y: Math.floor(A.S.py / T) }; }
  function currentStep() {
    const g = guide(); if (!g || !A) return null;
    const st = status(g, flags());
    if (!st.tracked) return null;
    return nextStep(maps(), flags(), st.tracked, A.S.mapId, playerTile());
  }
  function whereText(step) {
    if (!step) return "";
    if (step.kind === "here") return t("quest.where_here");
    if (step.kind === "exit") return step.lock && step.lock.text ? step.lock.text : t("quest.where_exit", { place: mapName(step.toMap), dest: mapName(step.obj.map) });
    return t("quest.where_unknown");
  }

  function refreshText() {
    const g = guide(); if (!g) return;
    const st = status(g, flags());
    const o = st.tracked;
    const title = o ? o.title : (g.finale && g.finale.title) || "";
    const hint = o ? o.hint : (g.finale && g.finale.hint) || "";
    els.trkTitle.textContent = title;
    els.trkHint.textContent = hint;
    els.trkMain.setAttribute("aria-label", t("quest.tracker_label", { title, hint }));
    els.tracker.classList.toggle("side", !!o && o.track === "side");
    return st;
  }

  function showCard() {
    const g = guide(); if (!g || !A) return;
    const st = status(g, flags());
    const o = st.tracked;
    els.cardKicker.textContent = o ? (o.track === "side" ? t("quest.kicker_side") : t("quest.kicker_main")) : t("quest.kicker_done");
    els.cardTitle.textContent = o ? o.title : (g.finale && g.finale.title) || "";
    els.cardHint.textContent = o ? o.hint : (g.finale && g.finale.hint) || "";
    const step = o ? nextStep(maps(), flags(), o, A.S.mapId, playerTile()) : null;
    els.cardWhere.textContent = whereText(step);
    els.cardWhere.classList.toggle("hidden", !step);
    els.cardMap.classList.toggle("hidden", !guide().nodes);
    els.card.classList.remove("hidden");
    els.cardOk.focus && els.cardOk.focus({ preventScroll: true });
  }
  function closeCard() { els.card.classList.add("hidden"); }

  // ---- fast travel (visited maps only; plain map state only; server switch FLAGS.fastTravel)
  const travelOn = () => !(root.FLAGS && root.FLAGS.fastTravel === false);
  function canTravelTo(id) {
    if (!A || !travelOn() || !maps()[id]) return false;
    const S = A.S;
    if (S.fade || S.vista || !(S.state === "map" || (S.state === "menu" && (S._return === "map" || fromTracker)))) return false;
    return visited(flags(), id, null) && id !== S.mapId;
  }
  function objectiveTravelTarget() {
    const g = guide(); if (!g || !A) return null;
    const o = status(g, flags()).tracked;
    if (!o) return null;
    const S = A.S;
    if (o.map === S.mapId) {
      const tile = playerTile();
      return Math.abs(tile.x - o.x) + Math.abs(tile.y - o.y) > 16 && travelOn() && S.state === "map" && !S.fade ? o : null;
    }
    return canTravelTo(o.map) ? o : null;
  }
  function travel(id, x, y) {
    if (!A) return false;
    const sameMapOk = id === A.S.mapId && x != null;
    if (!sameMapOk && !canTravelTo(id)) return false;
    els.map.classList.add("hidden"); closeCard();
    if (A.S.state === "menu") { fromTracker = false; A.closeMenu(); }
    return A.fastTravel(id, x, y);
  }
  function travelToObjective() {
    const o = objectiveTravelTarget();
    if (o) travel(o.map, o.x, o.y);
  }

  // ---- world map screen
  function openMap(pause) {
    if (!A || !guide() || !guide().nodes) return;
    if (pause) {
      if (A.S.state !== "map" || A.S.fade) return;
      A.openMenu(); fromTracker = true;
    } else if (A.S.state !== "menu") return;
    selected = null;
    els.map.classList.remove("hidden");
    renderMap();
  }
  function closeMap() {
    if (els.map.classList.contains("hidden")) return;
    els.map.classList.add("hidden");
    if (fromTracker) { fromTracker = false; if (A.S.state === "menu") A.closeMenu(); }
  }
  function renderMap() {
    const g = guide(), here = A.S.mapId;
    const wm = worldModel(maps(), g, flags(), here);
    const byId = {};
    wm.nodes.forEach((n) => { byId[n.id] = n; });
    els.mapMeta.textContent = t("quest.progress", { done: wm.status.mainDone, total: wm.status.mainTotal });
    els.svgHost.textContent = "";
    const s = svg("svg", { viewBox: "0 0 100 62", role: "img", "aria-label": t("quest.world_map") }, els.svgHost);
    // region halos
    for (const r of g.regions || []) {
      const ns = r.maps.map((m) => byId[m]).filter(Boolean);
      if (!ns.length) continue;
      const x0 = Math.min.apply(null, ns.map((n) => n.x)) - 7, x1 = Math.max.apply(null, ns.map((n) => n.x)) + 7;
      const y0 = Math.min.apply(null, ns.map((n) => n.y)) - 8, y1 = Math.max.apply(null, ns.map((n) => n.y)) + 8;
      svg("rect", { x: x0, y: y0, width: x1 - x0, height: y1 - y0, rx: 5, class: "q-region" }, s);
      const tx = svg("text", { x: x0 + 2, y: y0 + 3.4, class: "q-regionname" }, s);
      tx.textContent = r.name;
    }
    const inRoute = {};
    if (wm.route) for (let i = 0; i + 1 < wm.route.length; i++) inRoute[wm.route[i] + "|" + wm.route[i + 1]] = inRoute[wm.route[i + 1] + "|" + wm.route[i]] = true;
    for (const e of wm.edges) {
      const a = byId[e.a], b = byId[e.b];
      svg("line", { x1: a.x, y1: a.y, x2: b.x, y2: b.y, class: "q-edge" + (e.open ? "" : " locked") + (e.oneway ? " oneway" : "") + (inRoute[e.a + "|" + e.b] ? " route" : "") }, s);
    }
    for (const n of wm.nodes) {
      const grp = svg("g", { class: "q-node " + n.state + (n.target ? " target" : "") + (n.interior ? " interior" : ""), tabindex: "0", role: "button", "aria-label": n.name + ", " + stateLabel(n.state) + (n.target ? ", " + t("quest.legend_next") : "") }, s);
      svg("circle", { cx: n.x, cy: n.y, r: 4.4, class: "q-hit" }, grp);
      if (n.target) svg("circle", { cx: n.x, cy: n.y, r: n.interior ? 3.6 : 4.8, class: "q-glow" }, grp);
      svg("circle", { cx: n.x, cy: n.y, r: n.interior ? 1.7 : 2.6, class: "q-dot" }, grp);
      if (n.state === "current") svg("circle", { cx: n.x, cy: n.y, r: n.interior ? 2.8 : 3.8, class: "q-you" }, grp);
      if (n.state === "locked") { const l = svg("text", { x: n.x, y: n.y + 0.9, class: "q-lock", "text-anchor": "middle" }, grp); l.textContent = "🔒"; }
      const tx = svg("text", { x: n.x, y: n.y + (n.interior ? 4.4 : 6.4), class: "q-label", "text-anchor": "middle" }, grp);
      tx.textContent = n.label;
      const pick = () => { selected = n.id; renderMap(); };
      grp.addEventListener("click", pick);
      grp.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(); } });
    }
    renderInfo(wm, selected || (wm.status.tracked ? wm.status.tracked.map : here));
  }
  function renderInfo(wm, id) {
    const info = placeInfo(maps(), guide(), flags(), id);
    const node = wm.nodes.find((n) => n.id === id);
    const box = els.info;
    box.textContent = "";
    if (!info || !node) return;
    el("h3", "", info.name, box);
    const chip = el("span", "q-chip " + node.state, stateLabel(node.state), box);
    if (node.target) chip.textContent += " · " + t("quest.legend_next");
    if (node.note) el("p", "q-note", node.note, box);
    if (canTravelTo(id)) {
      const tgt = wm.status.tracked && wm.status.tracked.map === id ? wm.status.tracked : null;
      const b = el("button", "q-btn q-travel", t("quest.travel_here"), box);
      b.type = "button";
      b.addEventListener("click", () => travel(id, tgt ? tgt.x : null, tgt ? tgt.y : null));
    } else if (node.visited && id !== A.S.mapId && travelOn()) {
      el("p", "q-note", t("quest.travel_not_now"), box);
    }
    const list = (label, items) => { if (!items.length) return; const p = el("p", "q-line", null, box); el("b", "", label + " ", p); p.appendChild(document.createTextNode(items.join(", "))); };
    for (const o of info.objectives) {
      const d = el("div", "q-obj" + (wm.status.tracked && wm.status.tracked.id === o.id ? " on" : ""), null, box);
      el("b", "", o.title, d); el("span", "", o.hint, d);
      if (o.track === "side" || (wm.status.tracked && wm.status.tracked.id !== o.id)) {
        const b = el("button", "q-btn small", t("quest.track"), d);
        b.type = "button";
        b.addEventListener("click", () => { A.S.flags.guide_track = o.track === "side" ? o.id : 0; lastKey = ""; refreshText(); renderMap(); });
      }
    }
    if (wm.status.tracked && wm.status.tracked.track === "side") {
      const b = el("button", "q-btn small ghost", t("quest.track_main"), box);
      b.type = "button";
      b.addEventListener("click", () => { A.S.flags.guide_track = 0; lastKey = ""; refreshText(); renderMap(); });
    }
    list(t("quest.people"), info.npcs);
    list(t("quest.foes"), info.foes);
    if (info.altars) list(t("quest.rest"), [t("quest.altars", { n: info.altars })]);
    list(t("quest.exits"), info.exits.map((x) => x.name + (x.open ? "" : " 🔒")));
    const locked = info.exits.find((x) => !x.open && x.text);
    if (node.state === "locked" || locked) {
      const why = (wm.route && wm.route.length > 1 && lockText(maps(), flags(), wm.route)) || null;
      const text = (node.state === "locked" && why && why.text) || (locked && locked.text) || "";
      if (text) el("p", "q-lockwhy", text, box);
    }
  }

  // ---- in-map pointer
  function hidePointer() { els.pointer.classList.add("hidden"); }
  function updatePointer() {
    const step = currentStep();
    if (!step || step.kind === "none") return hidePointer();
    const p = A.worldToScreen((step.x + 0.5) * T, (step.y + 0.5) * T, tmp);
    const z = Math.max(0.6, A.zoom ? A.zoom() : 1);
    const W = 1280, H = 720, mx = 54, mt = 96, mb = 64;
    // already standing at the target: nothing to point at
    const tile = playerTile();
    if (step.kind === "here" && Math.abs(tile.x - step.x) + Math.abs(tile.y - step.y) <= 1) return hidePointer();
    const inside = p.x >= mx && p.x <= W - mx && p.y >= mt && p.y <= H - mb;
    const ring = Math.round(Math.max(44, Math.min(96, 58 * z)));
    els.pointer.classList.remove("hidden");
    els.pointer.classList.toggle("exit", step.kind === "exit");
    els.pointer.classList.toggle("inside", inside);
    els.pointer.classList.toggle("calm", !motionOk());
    let label = step.kind === "exit" ? t("quest.exit_to", { place: mapName(step.toMap) }) : step.obj.title;
    const dist = Math.round(Math.abs(tile.x - step.x) + Math.abs(tile.y - step.y));
    if (!inside && dist > 0) label += " · " + t("quest.steps", { n: dist });
    if (label !== els.plabel._t) { els.plabel.textContent = label; els.plabel._t = label; }
    if (inside) {
      els.pointer.style.setProperty("--ring", ring + "px");
      els.pointer.style.transform = "translate(" + p.x.toFixed(1) + "px," + p.y.toFixed(1) + "px)";
      els.arrow.style.transform = "translate(-50%, " + (-ring * 0.5 - 30) + "px) rotate(90deg)";
      els.plabel.style.transform = "translate(-50%, " + (-ring * 0.5 - 62) + "px)";
    } else {
      // clamp to the screen edge along the line from the middle of the usable area to the target
      const cx = W / 2, cy = (mt + H - mb) / 2, hx = W / 2 - mx, hy = (H - mb - mt) / 2;
      const dx = p.x - cx, dy = p.y - cy;
      const k = Math.min(hx / Math.max(Math.abs(dx), 1e-6), hy / Math.max(Math.abs(dy), 1e-6));
      const ang = Math.atan2(dy, dx) * 180 / Math.PI;
      els.pointer.style.transform = "translate(" + (cx + dx * k).toFixed(1) + "px," + (cy + dy * k).toFixed(1) + "px)";
      els.pointer.style.setProperty("--ring", "0px");
      els.arrow.style.transform = "translate(-50%,-50%) rotate(" + ang.toFixed(1) + "deg)";
      els.plabel.style.transform = "translate(" + (dx < 0 ? "26px" : "calc(-100% - 26px)") + ", -50%)";
    }
  }
  const tmp = { x: 0, y: 0 };
  const clampN = (v, a, b) => Math.max(a, Math.min(b, v));

  function visibleHud() {
    const S = A.S;
    if (S.state !== "map" || S.fade || S.vista) return false;
    const hud = document.getElementById("map-hud");
    return !!hud && !hud.classList.contains("hidden") && !hud.classList.contains("cinematic");
  }

  let faults = 0;
  function frame(tm) {
    if (!A || faults > 5) return;
    try { frameInner(tm); } catch (e) { faults++; if (faults > 5) { try { els.tracker.classList.add("hidden"); hidePointer(); } catch (_) {} } }
  }
  function frameInner(tm) {
    const S = A.S;
    if (S.state !== "menu" && !els.map.classList.contains("hidden")) { els.map.classList.add("hidden"); fromTracker = false; }
    if (S.state !== "menu") closeCardIfStale();
    if (S.mapId !== lastMap && S.state === "map") {
      lastMap = S.mapId;
      if (S.mapId && !S.flags["seen_" + S.mapId]) S.flags["seen_" + S.mapId] = 1;
      lastKey = "";
    }
    const show = visibleHud() && !!guide();
    els.tracker.classList.toggle("hidden", !show);
    if (!show) { hidePointer(); return; }
    if (tm >= nextCheck) {
      nextCheck = tm + 250;
      const st = status(guide(), S.flags);
      const key = (st.tracked ? st.tracked.id : "-") + "|" + st.mainDone;
      if (key !== lastKey) { lastKey = key; refreshText(); announce(st); }
      els.trkGo.classList.toggle("hidden", !objectiveTravelTarget());
    }
    updatePointer();
  }
  function closeCardIfStale() { if (A.S.state === "title") closeCard(); }
  let lastAnnounced = null;
  function announce(st) {
    const id = st.tracked ? st.tracked.id : "-";
    if (lastAnnounced === null) { lastAnnounced = id; return; }
    if (id !== lastAnnounced) {
      lastAnnounced = id;
      els.tracker.classList.remove("pulse");
      void els.tracker.offsetWidth;
      if (motionOk()) els.tracker.classList.add("pulse");
    }
  }

  function attach(api) {
    if (A) return;
    A = api;
    build();
  }
  return Object.assign({ T, attach, frame, showCard, openMap, closeMap, travel }, logic);
});
