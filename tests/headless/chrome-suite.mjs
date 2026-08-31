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

    await browser.close();
  } finally {
    await cleanup();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
