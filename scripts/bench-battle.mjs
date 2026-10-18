// Battle pacing benchmark (headless Chromium, real time). A patient player: presses Z (confirm) once per menu step as soon as a menu
// is up and the previous action finished; optional --mash also presses Z during waits (what a tapping player does).
// Usage: node scripts/bench-battle.mjs [--mash] [--speed 1|2] [--auto] [battle ids...]
import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import { chromium } from "playwright";
const args = process.argv.slice(2);
const flag = (n) => args.includes("--" + n);
const val = (n, d) => { const i = args.indexOf("--" + n); return i >= 0 ? Number(args[i + 1]) : d; };
const ids = args.filter((a, i) => !a.startsWith("--") && !(i > 0 && args[i - 1].startsWith("--") && ["speed"].includes(args[i - 1].slice(2)))); 
const battles = ids.length ? ids : ["forest_vines", "forest_revenants", "meridia_knights"];
const ROOT = process.cwd(), PORT = 8096, BASE = `http://127.0.0.1:${PORT}`;
const server = spawn("python3", ["-m", "http.server", String(PORT), "--bind", "127.0.0.1"], { cwd: ROOT, stdio: "ignore" });
const out = [];
try {
  for (let i = 0; i < 40; i++) { try { if ((await fetch(BASE + "/index.html")).ok) break; } catch {} await sleep(250); }
  const browser = await chromium.launch({ headless: true });
  for (const id of battles) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    // seeded RNG so 1x vs 2x vs before/after compare the same fights
    await page.addInitScript(() => { let a = 12345; Math.random = () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; });
    await page.goto(BASE + "/index.html", { waitUntil: "networkidle" });
    await page.waitForSelector("#screen-title:not(.hidden)");
    await page.evaluate(([speed]) => {
      const S = window.SOTH; S.settings.voice = false; S.settings.battleSpeed = speed; window.SOTH_NEW(); S.settings.battleSpeed = speed;
    }, [val("speed", 1)]);
    await sleep(300);
    await page.evaluate(([id]) => {
      const S = window.SOTH; S.vn = null; S.state = "map"; S.mapId = "forest";
      document.getElementById("screen-vn").classList.add("hidden");
      for (const c of Object.values(S.chars)) { c.hp = c.maxHp = 9999; }
      window.SOTH_BATTLE(id);
    }, [id]);
    if (flag("auto")) await page.evaluate(() => { window.BattleUX && window.BattleUX.setAuto(true); });
    const t0 = Date.now();
    let inputs = 0, last = 0, rounds = 0;
    for (;;) {
      const st = await page.evaluate(() => { const S = window.SOTH, b = S.battle; return { state: S.state, phase: b && b.phase, menu: b && b.menu, qi: b && b.qi, auto: b && b.auto }; });
      if (st.state !== "battle") break;
      if (Date.now() - t0 > 120000) { out.push({ id, error: "timeout" }); break; }
      const now = Date.now();
      const ready = st.phase === "cmd" || st.phase === "tutorial" || (flag("mash") && ["wait", "victory", "intro"].includes(st.phase));
      if (ready && now - last > 140) { await page.keyboard.press("KeyZ"); inputs++; last = now; }
      await sleep(20);
    }
    const ms = Date.now() - t0;
    if (!out.find((o) => o.id === id)) out.push({ id, secs: +(ms / 1000).toFixed(1), inputs });
    await page.close();
  }
  await browser.close();
} finally { server.kill(); }
console.log(JSON.stringify(out));
const ok = out.filter((o) => o.secs);
console.log("average " + (ok.reduce((s, o) => s + o.secs, 0) / Math.max(1, ok.length)).toFixed(1) + " s, " + (ok.reduce((s, o) => s + o.inputs, 0) / Math.max(1, ok.length)).toFixed(1) + " inputs per battle");
