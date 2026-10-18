// Walking distance / time between consecutive main-chain objectives.
// Usage: node scripts/measure-travel.mjs [--mult 1.25] [--runafter 10] [--norun] [--json]   (before: --mult 1 --runafter 14)
import { chain, WALK_BASE, RUN_BASE, T, SPEED_MULT, RUN_PATH } from "./travel-lib.mjs";
const arg = (n, d) => { const i = process.argv.indexOf("--" + n); return i > 0 ? Number(process.argv[i + 1]) : d; };
const mult = arg("mult", SPEED_MULT), runAfter = arg("runafter", RUN_PATH), norun = process.argv.includes("--norun");
const rows = chain({ mult, norun, runAfter });
if (process.argv.includes("--json")) console.log(JSON.stringify(rows));
else {
  console.log(`walk ${(WALK_BASE * mult * 1000 / T).toFixed(2)} t/s, run ${(RUN_BASE * mult * 1000 / T).toFixed(2)} t/s${norun ? " (run off)" : " after " + runAfter + " tiles"}, 0.8 s per map change`);
  console.log("| # | objective | from -> to | tiles | map changes | seconds |\n|---|---|---|---|---|---|");
  let tt = 0, ts = 0;
  for (const r of rows) { tt += r.tiles; ts += r.secs; console.log(`| ${r.n} | ${r.id} | ${r.from} -> ${r.to} | ${r.tiles.toFixed(0)} | ${r.hops} | ${r.secs.toFixed(0)} |`); }
  console.log(`| | total | | ${tt.toFixed(0)} | | ${ts.toFixed(0)} |`);
}
