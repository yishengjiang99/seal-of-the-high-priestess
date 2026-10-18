// Browser check for quest guidance: tracker, pointer, world map, "Where do I go?". Run: node tests/headless/quest-suite.mjs
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import { chromium } from "playwright";

const ROOT = process.cwd(), PORT = 8095, BASE = `http://127.0.0.1:${PORT}`;
const server = spawn("python3", ["-m", "http.server", String(PORT), "--bind", "127.0.0.1"], { cwd: ROOT, stdio: "ignore" });
try {
  for (let i = 0; i < 40; i++) { try { if ((await fetch(BASE + "/index.html")).ok) break; } catch {} await sleep(250); }
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = [];
  page.on("pageerror", (e) => errs.push(e.message));
  await page.goto(BASE + "/index.html", { waitUntil: "networkidle" });
  await page.waitForSelector("#screen-title:not(.hidden)");
  const S = (f, a) => page.evaluate(f, a);
  await S(() => { window.SOTH.settings.voice = false; window.SOTH_NEW(); });
  await sleep(400);
  const put = (map, x, y, flags) => S(([map, x, y, flags]) => {
    const s = window.SOTH; s.vn = null; s.state = "map"; s.mapId = map; s.px = x * 32 + 16; s.py = y * 32 + 16; s.dir = "down";
    Object.assign(s.flags, flags);
    document.getElementById("screen-vn").classList.add("hidden"); document.getElementById("map-hud").classList.remove("hidden");
    window.SOTH_TEST_RESET && window.SOTH_TEST_RESET();
  }, [map, x, y, flags]);

  // 1. tracker shows the first objective, the pointer points at the exit door once the target is on another map
  await put("temple", 36, 40, {});
  await sleep(900);
  assert.match(await page.locator("#quest-tracker").innerText(), /Leave the temple/);
  assert.equal(await S(() => !!window.SOTH.flags.seen_temple), true, "visited maps are remembered");
  await put("village", 46, 60, { left_temple: 1, intro_done: 1, camp1_done: 1 });
  await sleep(900);
  assert.match(await page.locator("#quest-tracker").innerText(), /forest trail/i);
  assert.equal(await page.locator("#quest-pointer").evaluate((e) => !e.classList.contains("hidden") && e.classList.contains("exit")), true, "doorway highlight toward the forest");
  assert.match(await page.locator("#quest-pointer .q-plabel").innerText(), /Whispering Forest/);

  // 2. tapping the tracker pauses on the world map; close resumes
  await page.click("#quest-tracker");
  await page.waitForSelector("#quest-map:not(.hidden)");
  assert.equal(await S(() => window.SOTH.state), "menu");
  assert.ok(await page.locator("#quest-map .q-node").count() >= 12);
  assert.ok(await page.locator("#quest-map .q-node.target").count() === 1, "one glowing next destination");
  await page.locator("#quest-map .q-node >> text=Meridia").first().click();
  assert.match(await page.locator("#quest-map .qm-info").innerText(), /Meridia/);
  await page.click("#quest-map .q-close");
  assert.equal(await S(() => window.SOTH.state), "map");
  assert.equal(await page.locator("#quest-map").evaluate((e) => e.classList.contains("hidden")), true);

  // 3. pause menu: "Where do I go?" re-reads the hint, then Show on map
  await page.keyboard.press("Escape");
  await sleep(200);
  await page.click("#quest-menu-row .q-btn >> nth=0");
  assert.match(await page.locator("#quest-card").innerText(), /forest trail/i);
  await page.click("#quest-card .q-btn >> nth=0");
  await page.waitForSelector("#quest-map:not(.hidden)");
  await page.keyboard.press("Escape");   // closes the map first, not the pause menu
  await sleep(300);
  assert.equal(await S(() => window.SOTH.state), "menu");
  await page.keyboard.press("Escape");
  await sleep(300);
  assert.equal(await S(() => window.SOTH.state), "map");

  // 4. progress: the tracker follows the flags; hidden outside the map
  await S(() => { window.SOTH_FLAG("tut_wisp"); });
  await sleep(600);
  assert.match(await page.locator("#quest-tracker").innerText(), /Heartwood/);
  await S(() => { window.SOTH.state = "credits"; });
  await sleep(100);
  assert.equal(await page.locator("#quest-tracker").evaluate((e) => e.classList.contains("hidden")), true);
  assert.deepEqual(errs, []);
  await browser.close();
  console.log("quest suite ok");
} finally { server.kill(); }
