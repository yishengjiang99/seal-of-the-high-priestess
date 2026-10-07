#!/usr/bin/env node
// Build the content snapshot the server publishes as its "base":
//   node scripts/build-content.mjs [--out content-snapshot.json]
// Evaluates the bundled content scripts (js/content.js, js/maps.js, js/dialogue.js, js/config.js) exactly as
// the browser does, so the hash matches what the game computes at runtime for this bundle.
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ctx = { console };
ctx.window = ctx; ctx.self = ctx;
vm.createContext(ctx);
for (const f of ["js/content.js", "js/maps.js", "js/dialogue.js", "js/config.js", "js/content-core.js"]) {
  vm.runInContext(fs.readFileSync(path.join(root, f), "utf8"), ctx, { filename: f });
}
const C = ctx.SothContent;
// Round-trip through JSON in this realm so the output is plain data.
const content = JSON.parse(JSON.stringify({ DATA: ctx.DATA, MAPS: ctx.MAPS, SCENES: ctx.SCENES, PAYWALL: ctx.PAYWALL, FLAGS: ctx.FLAGS }));
const hash = C.contentHash(content);

// Asset files that ship in the app/web bundle (lina-ref.jpg and store screenshots never ship).
const EXCLUDE = new Set(["assets/lina-ref.jpg"]);
const assets = [];
(function walk(dir) {
  for (const e of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
    const rel = `${dir}/${e.name}`;
    if (e.isDirectory()) { if (rel !== "assets/screenshots") walk(rel); }
    else if (!EXCLUDE.has(rel)) assets.push(rel);
  }
})("assets");
assets.sort();

const res = C.validate(content, { ref: content, assets });
if (!res.ok || res.warnings.length) {
  console.error("bundled content failed validation:", res.errors, res.warnings);
  process.exit(1);
}
let commit = null;
try { commit = execSync("git rev-parse HEAD", { cwd: root }).toString().trim(); } catch (e) {}
const out = { schema: C.SCHEMA, hash, assets, source: { commit, builtAt: new Date().toISOString() }, content };
const i = process.argv.indexOf("--out");
const json = JSON.stringify(out);
if (i > 0) fs.writeFileSync(process.argv[i + 1], json);
else process.stdout.write(json);
console.error(`content snapshot ${hash}: ${Object.keys(content.SCENES).length} scenes, ${Object.keys(content.MAPS).length} maps, ${assets.length} assets, ${json.length} bytes`);
