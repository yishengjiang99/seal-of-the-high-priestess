// Renders the App Store listing screenshots from the real game (the bundled web engine, same JS/CSS/art the
// iOS shell loads) in headless Chromium at the phone / tablet CSS viewport, scaled to the exact store pixels.
//   iPhone 6.9" landscape: 956x440 pt @3x = 2868x1320   -> docs/asc/screenshots/en-US/iphone-69-*.png
//   iPad 13"    landscape: 1376x1032 pt @2x = 2752x2064 -> docs/asc/screenshots/en-US/ipad-13-*.png
//     The game is a 16:9 canvas and its layout switches to a portrait/phone mode below ~1.6:1, so the iPad frames are
//     captured at 1376x774 (16:9) and centred on the game's own background colour (#08060d) in the 4:3 tablet canvas.
// The Full Game paywall is native SwiftUI, so it is NOT rendered here: iphone-69-06-paywall.png comes from the
// iOS simulator (ios-sim.yml, launch argument -paywallDemo).
// Run: node scripts/asc/capture_listing_shots.mjs [iphone|ipad|all]   (needs `npm ci` for playwright + chromium)
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";
import { chromium } from "playwright";

const ROOT = process.cwd(), PORT = 8123, BASE = `http://127.0.0.1:${PORT}`;
const OUT = "docs/asc/screenshots/en-US";
const DEVICES = {
  iphone: { prefix: "iphone-69", viewport: { width: 956, height: 440 }, scale: 3 },
  ipad: { prefix: "ipad-13", viewport: { width: 1376, height: 774 }, scale: 2, canvas: { width: 1376, height: 1032 } },
};
const which = process.argv[2] || "all";
mkdirSync(OUT, { recursive: true });
const server = spawn("python3", ["-m", "http.server", String(PORT), "--bind", "127.0.0.1"], { cwd: ROOT, stdio: "ignore" });
let browser;
try {
  for (let i = 0; i < 40; i++) { try { if ((await fetch(BASE + "/index.html")).ok) break; } catch {} await sleep(250); }
  browser = await chromium.launch({ headless: true });
  for (const [name, d] of Object.entries(DEVICES)) {
    if (which !== "all" && which !== name) continue;
    await run(name, d);
  }
} finally {
  if (browser) await browser.close();
  server.kill();
}

async function run(name, d) {
  const ctx = await browser.newContext({ viewport: d.viewport, deviceScaleFactor: d.scale, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push(e.message));
  // Seeded RNG so the shots are reproducible.
  await page.addInitScript(() => { let a = 4242; Math.random = () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; });
  await page.goto(BASE + "/index.html", { waitUntil: "networkidle" });
  await page.waitForSelector("#screen-title:not(.hidden)");
  await sleep(1500);
  const E = (f, a) => page.evaluate(f, a);
  const shot = async (n, label) => {
    const file = `${OUT}/${d.prefix}-${n}-${label}.png`;
    if (!d.canvas) {
      await page.screenshot({ path: file });
    } else {
      const png = (await page.screenshot()).toString("base64");
      const cp = await ctx.newPage();
      await cp.setViewportSize(d.canvas);
      await cp.setContent(`<body style="margin:0;background:#08060d;display:flex;align-items:center;justify-content:center;width:${d.canvas.width}px;height:${d.canvas.height}px"><img style="width:${d.viewport.width}px;height:${d.viewport.height}px" src="data:image/png;base64,${png}"></body>`);
      await cp.screenshot({ path: file });
      await cp.close();
    }
    console.log("wrote", file);
  };

  // 1. title
  await shot("01", "title");

  await E(() => { window.SOTH.settings.voice = false; window.SOTH.settings.textSpeed = 9; window.SOTH_NEW(); });
  await sleep(600);
  const put = (map, x, y, flags) => E(([map, x, y, flags]) => {
    const s = window.SOTH; s.vn = null; s.state = "map"; s.mapId = map; s.px = x * 32 + 16; s.py = y * 32 + 16; s.dir = "down";
    Object.assign(s.flags, flags);
    document.getElementById("screen-vn").classList.add("hidden"); document.getElementById("map-hud").classList.remove("hidden");
    window.SOTH_TEST_RESET && window.SOTH_TEST_RESET();
  }, [map, x, y, flags]);

  // 2. exploration: the Silver Lotus Temple (painted 2.5D map)
  await put("temple", 36, 40, { intro_done: 1 });
  await sleep(2500);
  await shot("02", "temple-exploration");

  // 3. dialogue: the opening scene
  await E(() => window.SOTH_SCENE("intro"));
  await sleep(1200);
  for (let i = 0; i < 5; i++) { await page.keyboard.press("KeyZ"); await sleep(500); }
  await sleep(800);
  await shot("03", "dialogue");

  // 4. battle: the Hollow Oak boss
  const until = async (fn, ms = 20000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await E(fn)) return true; await sleep(60); } return false; };
  await E(() => {
    const s = window.SOTH; s.vn = null; s.state = "map"; s.mapId = "forest";
    document.getElementById("screen-vn").classList.add("hidden");
    window.SOTH_BATTLE("hollow_oak");
  });
  // The first boss fight opens with a tutorial card: tap through it, then wait for Kael's command menu.
  if (await until(() => window.SOTH.battle && window.SOTH.battle.phase === "tutorial", 8000)) {
    await sleep(500);
    await page.mouse.click(d.viewport.width / 2, d.viewport.height / 2);
  }
  await until(() => { const b = window.SOTH.battle; return !!b && b.phase === "cmd" && b.actor && b.actor.side === "p" && b.menu === "cmd"; });
  await sleep(1000);
  await shot("04", "boss-battle");

  // 5. quest / world map
  await E(() => { const s = window.SOTH; s.battle = null; });
  await put("village", 46, 60, { left_temple: 1, intro_done: 1, camp1_done: 1, seen_temple: 1 });
  await sleep(1500);
  await page.click("#quest-tracker .q-main");
  await page.waitForSelector("#quest-map:not(.hidden)");
  await sleep(1200);
  await shot("05", "world-map");

  if (errs.length) console.log("page errors:", errs);
  await ctx.close();
}
