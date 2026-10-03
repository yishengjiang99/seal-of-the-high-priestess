#!/usr/bin/env node
// Pre-generates ElevenLabs voice clips for every spoken line and writes static
// bundles under audio/voice/<bundle>/ with a manifest.json each, plus
// audio/voice/index.json. A clip's file name is a hash of everything that
// determines its audio (text, voice id, model, format, seed, voice settings),
// so existing clips are reused and only new or changed lines hit the API.
//
// Usage: ELEVENLABS_API_KEY=... node scripts/generate-voice.mjs [--dry-run]
//          [--only=<bundle>[,<bundle>]] [--limit=N] [--no-prune] [--concurrency=N]
// Without a key it only rebuilds manifests from clips already on disk.
// Env: ELEVENLABS_API_BASE (override API host, used by tests), VOICE_OUT_DIR.
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync, appendFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { AUDIO_DIR, buildIndex, buildManifest, loadGameData, planBundles } from "./voice-lib.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const [k, v] = a.replace(/^--/, "").split("=");
  return [k, v ?? true];
}));
const DRY = !!args["dry-run"];
const ONLY = args.only ? new Set(String(args.only).split(",").filter(Boolean)) : null;
const LIMIT = args.limit ? Number(args.limit) : Infinity;
const PRUNE = !args["no-prune"];
const CONCURRENCY = Math.max(1, Number(args.concurrency || process.env.ELEVENLABS_CONCURRENCY || 2));
const API_KEY = process.env.ELEVENLABS_API_KEY || "";
const API = process.env.ELEVENLABS_API_BASE || "https://api.elevenlabs.io";

const config = JSON.parse(readFileSync(path.join(ROOT, "voice/config.json"), "utf8"));
const { SCENES, DATA, MAPS, VoiceLines } = loadGameData(ROOT);
const plan = planBundles(config, VoiceLines.collectBundles(SCENES, DATA, MAPS));
const outDir = path.resolve(ROOT, process.env.VOICE_OUT_DIR || AUDIO_DIR);
mkdirSync(outDir, { recursive: true });

const clipPath = (bundle, line) => path.join(outDir, bundle, line.file);
const present = (bundle) => (line) => existsSync(clipPath(bundle, line)) && statSync(clipPath(bundle, line)).size > 0;

// Any clip already on disk, by file name, so identical lines reuse audio.
const onDisk = new Map();
for (const b of existsSync(outDir) ? readdirSync(outDir) : []) {
  const dir = path.join(outDir, b);
  if (!statSync(dir).isDirectory()) continue;
  for (const f of readdirSync(dir)) if (f !== "manifest.json") onDisk.set(f, path.join(dir, f));
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fatal = null;

async function tts(line) {
  const { req } = line;
  const url = `${API}/v1/text-to-speech/${encodeURIComponent(req.voice_id)}?output_format=${encodeURIComponent(req.output_format)}`;
  const body = { text: req.text, model_id: req.model_id, voice_settings: req.voice_settings };
  if (req.seed != null) body.seed = req.seed;
  for (let attempt = 1; attempt <= 5; attempt++) {
    let res;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: { "xi-api-key": API_KEY, "content-type": "application/json", accept: "audio/mpeg" },
        body: JSON.stringify(body)
      });
    } catch (e) {
      if (attempt === 5) throw e;
      await sleep(1000 * 2 ** attempt);
      continue;
    }
    if (res.ok) return Buffer.from(await res.arrayBuffer());
    const detail = (await res.text().catch(() => "")).slice(0, 300);
    if (res.status === 429 || res.status >= 500) {
      if (attempt === 5) throw new Error(`HTTP ${res.status}: ${detail}`);
      await sleep(1500 * 2 ** attempt);
      continue;
    }
    const err = new Error(`HTTP ${res.status}: ${detail}`);
    // Bad key or exhausted quota: stop instead of failing every line.
    if (res.status === 401 || /quota_exceeded|invalid_api_key/.test(detail)) err.fatal = true;
    throw err;
  }
}

const todo = [];
let reused = 0, copied = 0;
for (const [bundle, lines] of Object.entries(plan)) {
  if (ONLY && !ONLY.has(bundle)) continue;
  for (const line of lines) {
    const dest = clipPath(bundle, line);
    if (present(bundle)(line)) { reused++; continue; }
    const src = onDisk.get(line.file);
    if (src && !DRY) { mkdirSync(path.dirname(dest), { recursive: true }); copyFileSync(src, dest); copied++; continue; }
    todo.push({ bundle, line, dest });
  }
}
const queue = todo.slice(0, LIMIT);
const chars = queue.reduce((n, t) => n + t.line.text.length, 0);
console.log(`voice: ${Object.keys(plan).length} bundles, ${reused} cached, ${copied} copied, ${todo.length} to generate (${chars} chars this run)`);

let made = 0;
const failures = [];
if (queue.length && !DRY && !API_KEY) {
  console.log("voice: ELEVENLABS_API_KEY not set; skipping generation and only rebuilding manifests");
} else if (queue.length && !DRY) {
  let next = 0;
  await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
    while (next < queue.length && !fatal) {
      const t = queue[next++];
      try {
        const buf = await tts(t.line);
        if (!buf.length) throw new Error("empty audio");
        mkdirSync(path.dirname(t.dest), { recursive: true });
        writeFileSync(t.dest, buf);
        made++;
        console.log(`  + ${t.bundle}/${t.line.file} [${t.line.voice}] ${t.line.text.slice(0, 60)}`);
      } catch (e) {
        failures.push({ bundle: t.bundle, file: t.line.file, error: e.message });
        console.error(`  ! ${t.bundle}/${t.line.file}: ${e.message}`);
        if (e.fatal) fatal = e;
      }
    }
  }));
} else if (DRY) {
  for (const t of queue) console.log(`  would generate ${t.bundle}/${t.line.file} [${t.line.voice}] ${t.line.text.slice(0, 60)}`);
}

// Manifests and index (only clips that exist are listed, so the client falls
// back to text for everything else). No timestamps: output is reproducible.
if (!DRY) {
  let pruned = 0;
  for (const [bundle, lines] of Object.entries(plan)) {
    const dir = path.join(outDir, bundle);
    const isPresent = present(bundle);
    if (PRUNE && existsSync(dir)) {
      const keep = new Set(lines.map((l) => l.file).concat("manifest.json"));
      for (const f of readdirSync(dir)) if (!keep.has(f)) { rmSync(path.join(dir, f)); pruned++; }
    }
    if (!lines.some(isPresent) && !existsSync(dir)) continue;
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, "manifest.json"), JSON.stringify(buildManifest(config, bundle, lines, isPresent), null, 2) + "\n");
  }
  if (PRUNE) {
    for (const b of readdirSync(outDir)) {
      const dir = path.join(outDir, b);
      if (statSync(dir).isDirectory() && !plan[b]) { rmSync(dir, { recursive: true }); pruned++; }
    }
  }
  const index = buildIndex(config, plan, present);
  writeFileSync(path.join(outDir, "index.json"), JSON.stringify(index, null, 2) + "\n");
  const total = Object.values(plan).reduce((n, l) => n + l.length, 0);
  const have = Object.values(index.bundles).reduce((n, b) => n + b.clips, 0);
  const summary = `voice: generated ${made}, failed ${failures.length}, pruned ${pruned}; ${have}/${total} lines have clips`;
  console.log(summary);
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### Voice clips\n\n${summary}\n` +
      (failures.length ? `\nFailures (first 20):\n\n${failures.slice(0, 20).map((f) => `- ${f.bundle}/${f.file}: ${f.error}`).join("\n")}\n` : ""));
  }
  if (fatal) { console.error(`voice: stopped early: ${fatal.message}`); process.exitCode = 2; }
  else if (failures.length) process.exitCode = 3;
}
