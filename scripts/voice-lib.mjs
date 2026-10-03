// Pure helpers for the voice pipeline (no network). Imported by
// scripts/generate-voice.mjs and tests/voice.test.mjs.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";

export const AUDIO_DIR = "audio/voice";
export const MANIFEST_VERSION = 1;
export const HASH_LEN = 24;

// Load the browser data files into a sandbox and return their globals.
export function loadGameData(root) {
  const ctx = { console };
  ctx.window = ctx;
  vm.createContext(ctx);
  for (const f of ["content", "maps", "dialogue", "voice-lines"]) {
    const file = path.join(root, "js", f + ".js");
    vm.runInContext(readFileSync(file, "utf8"), ctx, { filename: file });
  }
  return { SCENES: ctx.SCENES, DATA: ctx.DATA, MAPS: ctx.MAPS, VoiceLines: ctx.VoiceLines };
}

// Stable JSON: object keys sorted recursively.
export function canonical(value) {
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  if (value && typeof value === "object") {
    return "{" + Object.keys(value).sort().map((k) => JSON.stringify(k) + ":" + canonical(value[k])).join(",") + "}";
  }
  return JSON.stringify(value);
}

// Everything that determines the bytes ElevenLabs returns for a line.
export function voiceFor(config, speaker) {
  const v = config.voices[speaker] || config.voices[config.default_voice];
  if (!v) throw new Error(`no voice for speaker "${speaker}" and no default_voice`);
  return {
    voice: speaker in config.voices ? speaker : config.default_voice,
    voice_id: v.voice_id,
    voice_settings: { ...(config.default_settings || {}), ...(v.settings || {}) }
  };
}

export function clipRequest(config, speaker, text) {
  const v = voiceFor(config, speaker);
  return {
    text,
    voice_id: v.voice_id,
    model_id: config.model_id,
    output_format: config.output_format,
    seed: config.seed ?? null,
    voice_settings: v.voice_settings
  };
}

export function clipHash(req) {
  return createHash("sha256").update(canonical(req)).digest("hex").slice(0, HASH_LEN);
}

export function extFor(format) {
  const f = String(format || "");
  if (f.startsWith("mp3")) return "mp3";
  if (f.startsWith("opus")) return "opus";
  if (f.startsWith("pcm")) return "pcm";
  return "bin";
}

// Plan the full output: bundles -> lines with hash + file name.
export function planBundles(config, bundles) {
  const ext = extFor(config.output_format);
  const plan = {};
  for (const name of Object.keys(bundles).sort()) {
    plan[name] = bundles[name].map((l) => {
      const req = clipRequest(config, l.speaker, l.text);
      const hash = clipHash(req);
      return { ...l, req, hash, file: `${hash}.${ext}`, voice: voiceFor(config, l.speaker).voice };
    });
  }
  return plan;
}

export function buildManifest(config, name, lines, present) {
  const out = {};
  for (const l of lines) {
    if (!present(l)) continue;
    out[l.key] = { file: l.file, hash: l.hash, speaker: l.speaker, voice: l.voice, text: l.text };
  }
  return {
    version: MANIFEST_VERSION,
    bundle: name,
    model_id: config.model_id,
    output_format: config.output_format,
    lines: Object.fromEntries(Object.keys(out).sort().map((k) => [k, out[k]]))
  };
}

// presentFor(bundle) returns a predicate telling whether a line's clip exists.
// Bundles without any clip are left out so the client never fetches them.
export function buildIndex(config, plan, presentFor) {
  const bundles = {};
  for (const name of Object.keys(plan).sort()) {
    const total = plan[name].length;
    const clips = plan[name].filter(presentFor(name)).length;
    if (clips) bundles[name] = { manifest: `${name}/manifest.json`, clips, missing: total - clips };
  }
  return { version: MANIFEST_VERSION, model_id: config.model_id, output_format: config.output_format, bundles };
}
