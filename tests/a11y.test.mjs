import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

function load({ host = null, store = {}, reduce = false } = {}) {
  const classes = new Set();
  const style = {};
  const win = {
    SOTH_HOST: host,
    addEventListener() {},
    matchMedia: () => ({ matches: reduce }),
  };
  const sandbox = {
    window: win,
    document: { documentElement: { style: { setProperty: (k, v) => { style[k] = v; } }, classList: { toggle: (c, on) => (on ? classes.add(c) : classes.delete(c)) } } },
    localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } },
  };
  win.localStorage = sandbox.localStorage;
  vm.runInNewContext(fs.readFileSync(new URL("../js/platform.js", import.meta.url), "utf8"), sandbox);
  return { P: win.Platform, classes, style, store };
}

test("defaults follow the system reduce-motion preference", () => {
  assert.equal(load().P.a11y.reduceMotion, false);
  const { P, classes } = load({ reduce: true });
  assert.equal(P.a11y.reduceMotion, true);
  assert.ok(classes.has("a11y-reduce-motion"));
});

test("host (iOS) values override saved web values and are clamped", () => {
  const { P, style } = load({ store: { soth_a11y: JSON.stringify({ subtitleScale: 1.2 }) }, host: { a11y: { subtitleScale: 9, colorCues: true } } });
  assert.equal(P.a11y.subtitleScale, 2);
  assert.equal(style["--subtitle-scale"], "2");
  assert.equal(P.a11y.colorCues, true);
});

test("Platform.call('a11y') updates live and fires the hook; setA11y persists", () => {
  const { P, classes, store } = load();
  let seen = null;
  P.on("a11yChanged", (a) => { seen = { ...a }; });
  P.call("a11y", { reduceMotion: true, subtitleScale: 1.4 });
  assert.deepEqual(seen, { subtitleScale: 1.4, reduceMotion: true, colorCues: false });
  assert.ok(classes.has("a11y-reduce-motion"));
  P.setA11y({ colorCues: true });
  assert.equal(JSON.parse(store.soth_a11y).colorCues, true);
  assert.ok(classes.has("a11y-cues"));
});

test("input mode class follows the shell", () => {
  const { P, classes } = load();
  P.call("inputMode", { mode: "gamepad", controller: "Xbox" });
  assert.ok(classes.has("input-gamepad") && !classes.has("input-touch"));
  assert.equal(P.input.controller, "Xbox");
});
