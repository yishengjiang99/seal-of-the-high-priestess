import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { promisify } from "node:util";
import { canonical, clipHash, clipRequest, loadGameData, planBundles } from "../scripts/voice-lib.mjs";

const ROOT = process.cwd();
const config = JSON.parse(await readFile(path.join(ROOT, "voice/config.json"), "utf8"));
const game = loadGameData(ROOT);
const run = promisify(execFile);

test("client no longer uses the Web Speech API", async () => {
  const src = await readFile(path.join(ROOT, "js/game.js"), "utf8");
  assert.doesNotMatch(src, /speechSynthesis|SpeechSynthesisUtterance/);
  assert.doesNotMatch(src, /elevenlabs\.io/i);
});

test("canonical JSON ignores key order", () => {
  assert.equal(canonical({ b: 1, a: { d: 2, c: [3, { f: 4, e: 5 }] } }), canonical({ a: { c: [3, { e: 5, f: 4 }], d: 2 }, b: 1 }));
});

test("clip hash is stable and covers text, voice, model and settings", () => {
  const base = clipRequest(config, "elara", "Then survive me west.");
  assert.equal(clipHash(base), clipHash(clipRequest(config, "elara", "Then survive me west.")));
  assert.match(clipHash(base), /^[0-9a-f]{24}$/);
  const variants = [
    { ...base, text: "Then survive me east." },
    { ...base, voice_id: "other" },
    { ...base, model_id: "eleven_turbo_v2_5" },
    { ...base, voice_settings: { ...base.voice_settings, stability: 0.1 } }
  ];
  for (const v of variants) assert.notEqual(clipHash(v), clipHash(base));
});

test("every spoken scene line maps to a planned clip in its scene bundle", () => {
  const { SCENES, DATA, MAPS, VoiceLines } = game;
  const plan = planBundles(config, VoiceLines.collectBundles(SCENES, DATA, MAPS));
  const keys = (b) => new Set((plan[b] || []).map((l) => l.key));
  for (const [id, sc] of Object.entries(SCENES)) {
    const have = keys(VoiceLines.bundleForScene(id));
    for (const line of sc.script) {
      if (!line.t || line.choices || !VoiceLines.isSpeakable(line.t)) continue;
      assert.ok(have.has(VoiceLines.lineKey(line.s, line.t)), `${id}: ${line.t}`);
    }
  }
  for (const id of Object.keys(DATA.NPC_TALK)) assert.ok(plan["talk-" + id], id);
  assert.ok(plan.signs.length > 0);
  assert.equal(VoiceLines.bundleForScene("_t_wen"), "talk-wen");
  assert.equal(VoiceLines.bundleForScene("_talk"), "signs");
  assert.equal(VoiceLines.lineKey("kael", "*Little* saint—  ok"), "kael|Little saint,  ok".replace(/\s+/g, " "));
});

test("generator writes bundles once and reuses cached clips", async () => {
  const out = await mkdtemp(path.join(os.tmpdir(), "voice-"));
  let calls = 0;
  const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      calls++;
      assert.equal(req.headers["xi-api-key"], "test-key");
      const j = JSON.parse(body);
      assert.equal(j.model_id, config.model_id);
      res.writeHead(200, { "content-type": "audio/mpeg" });
      res.end(Buffer.from("ID3fake:" + j.text));
    });
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const env = { ...process.env, ELEVENLABS_API_KEY: "test-key", ELEVENLABS_API_BASE: `http://127.0.0.1:${server.address().port}`, VOICE_OUT_DIR: out };
  try {
    await run(process.execPath, ["scripts/generate-voice.mjs", "--only=ui,talk-wen"], { env, cwd: ROOT });
    const first = calls;
    assert.ok(first >= 3, `expected API calls, got ${first}`);
    const index = JSON.parse(await readFile(path.join(out, "index.json"), "utf8"));
    assert.deepEqual(Object.keys(index.bundles).sort(), ["talk-wen", "ui"]);
    const manifest = JSON.parse(await readFile(path.join(out, "ui", "manifest.json"), "utf8"));
    const entry = manifest.lines["kael|Little saint. Your sermons are as dull as your fashion sense."];
    assert.ok(entry, "preview line in ui manifest");
    assert.ok((await readdir(path.join(out, "ui"))).includes(entry.file));
    await run(process.execPath, ["scripts/generate-voice.mjs", "--only=ui,talk-wen"], { env, cwd: ROOT });
    assert.equal(calls, first, "second run must not call the API");
    const again = JSON.parse(await readFile(path.join(out, "ui", "manifest.json"), "utf8"));
    assert.deepEqual(again, manifest);
  } finally {
    server.close();
    await rm(out, { recursive: true, force: true });
  }
});
