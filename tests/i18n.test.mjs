import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const read = (f) => fs.readFileSync(new URL("../" + f, import.meta.url), "utf8");

function load(locale) {
  const win = { SOTH_HOST: locale ? { locale } : null };
  const sandbox = { window: win, navigator: { language: "en-US" } };
  vm.runInNewContext(read("js/i18n.js"), sandbox);
  vm.runInNewContext(read("js/strings.en.js"), { window: win, I18N: win.I18N });
  return win.I18N;
}

test("keys used by the game and the options UI all exist in the English table", () => {
  const I = load();
  const src = read("js/game.js") + read("js/a11y-ui.js") + read("index.html") + read("js/quest.js").replace(/\bt\("/g, 'I18N.t("');
  const used = new Set([...src.matchAll(/I18N\.t\("([\w.]+)"/g)].map((m) => m[1]));
  [...src.matchAll(/data-i18n="([\w.]+)"/g)].forEach((m) => used.add(m[1]));
  assert.ok(used.size >= 25, "expected the migrated toasts");
  for (const k of used) assert.ok(I.tables.en[k], `missing string: ${k}`);
  // every table key is referenced (no dead strings)
  for (const k of Object.keys(I.tables.en)) assert.ok(used.has(k), `unused string: ${k}`);
});

test("formatting, fallback and language selection", () => {
  const I = load("fr-CA");
  assert.equal(I.lang, "fr");
  assert.equal(I.t("toast.saved", { n: 2 }), "Saved to slot 2");   // no fr table: English fallback
  assert.equal(I.t("no.such.key"), "no.such.key");
  I.register("fr", { "toast.saved": "Sauvegardé dans l'emplacement {n}" });
  assert.equal(I.t("toast.saved", { n: 2 }), "Sauvegardé dans l'emplacement 2");
  assert.equal(I.t("toast.obtained", { name: "Key" }), "Obtained: Key");
});

test("English strings keep their exact wording", () => {
  const en = load().tables.en;
  assert.equal(en["toast.altar_rest"], "The lotus altar takes the night. The party is whole.");
  assert.equal(en["toast.camp_chat"], 'Camp chat waiting: "{title}". {action} at the altar.');
});
