import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const PORT = 8093;
const BASE = `http://127.0.0.1:${PORT}`;
const SHOTS = path.join(ROOT, "assets", "screenshots");

async function waitForServer(url, retries = 40) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {}
    await sleep(250);
  }
  throw new Error(`server did not start: ${url}`);
}

async function main() {
  await mkdir(SHOTS, { recursive: true });
  const server = spawn("python3", ["-m", "http.server", String(PORT), "--bind", "127.0.0.1"], {
    cwd: ROOT,
    stdio: "ignore",
  });

  const cleanup = async () => {
    if (!server.killed) server.kill("SIGTERM");
    await sleep(150);
  };

  try {
    await waitForServer(`${BASE}/index.html`);
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const pageErrors = [];
    page.on("pageerror", (e) => pageErrors.push(e.message));
    await page.goto(`${BASE}/index.html`, { waitUntil: "networkidle" });

    await page.waitForSelector("#screen-title:not(.hidden)");
    await page.waitForSelector("#title-menu button[data-act='new']");
    await page.screenshot({ path: path.join(SHOTS, "title-screen.png"), fullPage: true });

    await page.evaluate(() => {
      window.SOTH.state = "menu";
      document.getElementById("screen-menu").classList.remove("hidden");
      document.getElementById("screen-title").classList.add("hidden");
      document.getElementById("screen-vn").classList.add("hidden");
      document.getElementById("battle-hud").classList.add("hidden");
      document.getElementById("map-hud").classList.add("hidden");
    });

    await page.click("#menu-tabs button[data-tab='temple']");
    await page.waitForSelector("#menu-body h3");
    const bodyText = await page.locator("#menu-body").innerText();
    assert.match(bodyText, /Temple Overview/);
    assert.match(bodyText, /Harvest All/);
    assert.match(bodyText, /Cycle Focus/);
    assert.match(bodyText, /Renewal of the Seal/);

    await page.screenshot({ path: path.join(SHOTS, "temple-tab-overview.png"), fullPage: true });

    const focusBefore = await page.locator("#menu-body .mutedline").first().innerText();
    await page.click("#menu-body [data-idle-act='focus']");
    await page.waitForTimeout(100);
    const focusAfter = await page.locator("#menu-body .mutedline").first().innerText();
    assert.notEqual(focusBefore, focusAfter);

    await page.click("#menu-body [data-idle-opt='reducedMotion']");
    const reducedMotion = await page.evaluate(() => document.body.classList.contains("reduced-motion"));
    assert.equal(reducedMotion, true);

    // Game data must load (maps.js used to throw before MAPS was defined).
    assert.equal(await page.evaluate(() => typeof window.MAPS === "object" && !!window.MAPS.wilderness), true);
    assert.deepEqual(pageErrors, []);

    await voiceChecks(browser);
    await gameplayChecks(browser);

    await browser.close();
  } finally {
    await cleanup();
  }
}

// Voice clips: the client looks up the line in its scene bundle, requests the
// clip, and keeps going (text only) when the clip is missing or fails.
async function voiceChecks(browser) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const clipRequests = [];
  let firstKey = null;
  await page.route("**/audio/voice/index.json", (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({ version: 1, model_id: "test", bundles: { "scene-intro": { manifest: "scene-intro/manifest.json", clips: 1, missing: 0 } } })
  }));
  await page.route("**/audio/voice/scene-intro/manifest.json", (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({ version: 1, bundle: "scene-intro", lines: { [firstKey]: { file: "deadbeef.mp3" } } })
  }));
  await page.route("**/audio/voice/**/*.mp3", (route) => { clipRequests.push(new URL(route.request().url()).pathname); route.fulfill({ status: 404, body: "" }); });
  await page.goto(`${BASE}/index.html`, { waitUntil: "networkidle" });
  firstKey = await page.evaluate(() => {
    const l = window.SCENES.intro.script[0];
    return window.VoiceLines.lineKey(l.s, l.t);
  });
  await page.evaluate(() => { window.SOTH.settings.voice = true; window.SOTH_SCENE("intro"); });
  await page.waitForFunction(() => window.SOTH.vn && window.SOTH.vn.speechDone === true, null, { timeout: 5000 });
  assert.deepEqual(clipRequests, ["/audio/voice/scene-intro/deadbeef.mp3"]);
  assert.deepEqual(errors, []);
  assert.match(await page.locator("#vn-text").innerText(), /\S/);
  await page.close();
}

// Regression checks for story flow and battle rules.
async function gameplayChecks(browser) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route("**/audio/voice/**", (route) => route.fulfill({ status: 404, body: "" }));
  await page.goto(`${BASE}/index.html`, { waitUntil: "networkidle" });
  await page.waitForSelector("#screen-title:not(.hidden)");
  const S = (fn, arg) => page.evaluate(fn, arg);

  // Number keys pick dialogue choices.
  await S(() => { window.SOTH.settings.voice = false; window.SOTH_NEW(); });
  await page.waitForFunction(() => window.SOTH.state === "vn");
  await S(() => { window.SOTH.vn.i = window.SCENES.intro.script.findIndex((l) => l.choices); window.SOTH.vn.shown = 1e9; });
  await page.keyboard.press("KeyZ");
  await page.waitForFunction(() => !!window.SOTH.vn?.choices);
  await page.keyboard.press("Digit2");
  assert.equal(await S(() => window.SOTH.flags.intro_fire), 1, "Digit2 picks the second choice");

  // Map warps fade and replay the location banner.
  await S(() => { window.SOTH.vn = null; window.SOTH.state = "map"; window.SOTH.mapId = "temple"; window.SOTH.px = 36.5 * 32; window.SOTH.py = 49.5 * 32; window.SOTH.dir = "down"; document.getElementById("map-hud").classList.remove("hidden"); });
  await page.keyboard.down("ArrowDown");
  try {
    await page.waitForFunction(() => window.SOTH.mapId === "village", null, { timeout: 6000 });
  } catch (e) {
    throw new Error("warp did not fire: " + JSON.stringify(await S(() => ({ s: window.SOTH.state, m: window.SOTH.mapId, y: window.SOTH.py / 32, f: window.SOTH.fade, w: window.SOTH.warpLock }))));
  } finally { await page.keyboard.up("ArrowDown"); }
  await page.waitForFunction(() => !window.SOTH.fade, null, { timeout: 4000 });
  assert.equal(await page.locator("#map-location").innerText(), "Lotus-Step Village");
  assert.ok(await S(() => document.getElementById("map-location").classList.contains("enter")));

  // Elara opens every fight at 40% Mana.
  await S(() => window.SOTH_BATTLE("hollow_oak"));
  const mana = await S(() => { const e = window.SOTH.battle.pals.find((p) => p.id === "elara"); return [e.res, e.maxRes]; });
  assert.equal(mana[0], Math.round(mana[1] * 0.4));

  // A Gassed hero cannot be swapped into the turn.
  await page.waitForFunction(() => window.SOTH.battle && (window.SOTH.battle.phase === "cmd" || window.SOTH.battle.phase === "tutorial"), null, { timeout: 5000 });
  if (await S(() => window.SOTH.battle.phase === "tutorial")) await page.keyboard.press("KeyZ");
  await page.waitForFunction(() => window.SOTH.battle.phase === "cmd", null, { timeout: 5000 });
  const swap = await S(() => {
    const b = window.SOTH.battle;
    const other = b.pals.find((p) => p !== b.actor);
    other.gassed = 2;
    const before = b.actor.id;
    b.phase = "cmd";
    document.querySelector(`.hero-tab[data-hero="${other.id}"]`).click();
    return { before, after: b.actor.id };
  });
  assert.equal(swap.after, swap.before, "gassed hero stayed out of the turn");

  // Beating the Unbetrayed leaves the party somewhere they can walk.
  await S(() => {
    window.SOTH.battle = null; window.SOTH.flags.unseal_choice = "no";
    window.SOTH.settings.skipDialog = true;     // run straight to the scene's end
    window.SOTH_SCENE("post_mirror");
    window.SOTH.settings.skipDialog = false;
  });
  await page.waitForFunction(() => window.SOTH.state === "map" && window.SOTH.mapId === "throne", null, { timeout: 4000 });
  const y0 = await S(() => window.SOTH.py);
  await page.keyboard.down("ArrowDown"); await page.waitForTimeout(500); await page.keyboard.up("ArrowDown");
  assert.ok(await S(() => window.SOTH.py) > y0 + 8, "party can move after the mirror fight");

  assert.deepEqual(errors, []);
  await page.close();
}

main().then(() => process.exit(process.exitCode || 0), (err) => {
  console.error(err);
  process.exit(1);
});
