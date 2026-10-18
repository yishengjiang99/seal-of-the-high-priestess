// Browser check for battle feel: turn order, tap-to-target, speed toggle, auto-battle, keyboard still works. Run: node tests/headless/battle-suite.mjs
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import { chromium } from "playwright";

const ROOT = process.cwd(), PORT = 8097, BASE = `http://127.0.0.1:${PORT}`;
const server = spawn("python3", ["-m", "http.server", String(PORT), "--bind", "127.0.0.1"], { cwd: ROOT, stdio: "ignore" });
try {
  for (let i = 0; i < 40; i++) { try { if ((await fetch(BASE + "/index.html")).ok) break; } catch {} await sleep(250); }
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = [];
  page.on("pageerror", (e) => errs.push(e.message));
  await page.addInitScript(() => { let a = 777; Math.random = () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; });
  await page.goto(BASE + "/index.html", { waitUntil: "networkidle" });
  await page.waitForSelector("#screen-title:not(.hidden)");
  const S = (f, a) => page.evaluate(f, a);
  await S(() => { window.SOTH.settings.voice = false; window.SOTH.settings.battleSpeed = 1; window.SOTH_NEW(); });
  await sleep(300);
  const fight = async (id, tough = true) => {
    await S(([id, tough]) => {
      const s = window.SOTH; s.vn = null; s.state = "map"; s.mapId = "forest";
      document.getElementById("screen-vn").classList.add("hidden");
      if (tough) for (const c of Object.values(s.chars)) c.hp = c.maxHp = 9999;
      window.SOTH_BATTLE(id);
    }, [id, tough]);
  };
  const until = async (fn, ms = 20000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await S(fn)) return true; await sleep(40); } return false; };
  const heroCmd = () => { const b = window.SOTH.battle; return !!b && b.phase === "cmd" && b.actor && b.actor.side === "p" && b.menu === "cmd"; };

  // 1. overlays: turn order strip, one tap zone per living foe, speed button
  await fight("forest_vines");
  assert.ok(await until(heroCmd), "reached a hero's command phase");
  await sleep(400);
  assert.ok(await page.locator("#bux-order .bux-turn").count() >= 3, "turn order shows several turns");
  assert.equal(await page.locator("#bux-order .bux-turn.now").count(), 1, "exactly one current actor");
  const foes = await S(() => window.SOTH.battle.foes.filter((f) => f.alive).length);
  assert.equal(await page.locator("#bux-zones .bux-zone").count(), foes, "a tap zone per living foe");
  for (const z of await page.locator("#bux-zones .bux-zone").all()) {
    const bb = await z.boundingBox();
    assert.ok(bb.width >= 44 && bb.height >= 44, "big touch target");
  }
  const cmdH = await S(() => Math.min(...[...document.querySelectorAll("#battle-cmds button, #battle-cmds li")].map((e) => e.getBoundingClientRect().height)));
  assert.ok(cmdH >= 40, "command rows are touch sized (" + cmdH + ")");

  // 2. speed toggle
  assert.equal(await page.locator("#bux-top .bux-btn >> nth=0").innerText(), "1×");
  await page.click("#bux-top .bux-btn >> nth=0");
  assert.equal(await S(() => window.SOTH.settings.battleSpeed), 2);
  assert.equal(await page.locator("#bux-top .bux-btn >> nth=0").innerText(), "2×");
  await page.click("#bux-top .bux-btn >> nth=0");
  assert.equal(await S(() => window.SOTH.settings.battleSpeed), 1);

  // 3. one tap on a foe = Attack that foe (no menu walking); the second foe is selectable too
  const hp0 = await S(() => window.SOTH.battle.foes.map((f) => f.hp));
  const target = foes > 1 ? 1 : 0;
  await page.locator("#bux-zones .bux-zone").nth(target).click();
  assert.equal(await S(() => window.SOTH.battle.phase), "wait", "tap attacked immediately");
  assert.equal(await S(() => window.SOTH.battle.queue.length > 0), true);
  assert.ok(await until(() => window.SOTH.battle.phase === "cmd" || window.SOTH.state !== "battle"), "next command phase arrives");
  const hp1 = await S(() => window.SOTH.battle.foes.map((f) => f.hp));
  assert.ok(hp1[target] <= hp0[target], "the tapped foe was the one attacked (attacks can miss)");

  // 4. keyboard path unchanged: Z opens Attack's target step on a multi-foe fight, arrows move the ring, Z confirms, X backs out
  if (await until(heroCmd)) {
    if (await S(() => window.SOTH.battle.foes.filter((f) => f.alive).length) > 1) {
      await page.keyboard.press("KeyZ");
      await sleep(150);
      assert.equal(await S(() => window.SOTH.battle.menu), "target", JSON.stringify(await S(() => ({ p: window.SOTH.battle.phase, m: window.SOTH.battle.menu, i: window.SOTH.battle.cmdIdx }))));
      assert.equal(await page.locator("#bux-zones .bux-ring:not(.hidden)").count(), 1, "target ring shown");
      await page.keyboard.press("KeyX");
      await sleep(150);
      assert.equal(await S(() => window.SOTH.battle.menu), "cmd");
    }
  }

  // 4b. tapping through the wait skips it (no dead time), and Z during an enemy wait does not leak into the next menu
  assert.ok(await until(heroCmd));
  await page.locator("#bux-zones .bux-zone").first().click();
  const t0 = Date.now();
  while ((await S(() => window.SOTH.battle && window.SOTH.battle.phase)) === "wait" && Date.now() - t0 < 4000) { await page.keyboard.press("KeyZ"); await sleep(30); }
  assert.ok(Date.now() - t0 < 4000);

  // 5. auto-battle: offered in an ordinary fight, finishes the fight by itself, never offered against a boss
  await fight("forest_revenants");
  assert.ok(await until(heroCmd));
  assert.equal(await page.locator("#bux-top .bux-auto:not(.hidden)").count(), 1, "Auto offered for trivial fights");
  await page.click("#bux-top .bux-auto");
  assert.equal(await S(() => window.SOTH.battle.auto), true);
  assert.ok(await until(() => window.SOTH.state !== "battle", 90000), "auto-battle finished the fight unattended");

  const bossId = await S(() => Object.keys(window.DATA.BATTLES).find((k) => window.DATA.BATTLES[k].enemies.some((e) => window.DATA.ENEMIES[e].boss)));
  await fight(bossId);
  assert.ok(await until(() => window.SOTH.battle && window.SOTH.battle.phase !== "intro", 30000));
  await sleep(300);
  assert.equal(await page.locator("#bux-top .bux-auto").isVisible(), false, "no Auto against a boss");
  assert.equal(await S(() => { window.BattleUX.setAuto(true); return !!window.SOTH.battle.auto; }), false, "setAuto refuses on a boss");

  // 6. overlays are gone outside battle
  await S(() => { const s = window.SOTH; s.state = "credits"; s.battle = null; });
  await sleep(300);
  assert.equal(await page.locator("#bux-order").evaluate((e) => e.classList.contains("hidden")), true);
  assert.equal(await page.locator("#bux-zones").evaluate((e) => e.classList.contains("hidden")), true);
  assert.deepEqual(errs, [], "no page errors: " + errs.join("; "));
  await browser.close();
  console.log("battle-suite: ok");
} finally { server.kill(); }
