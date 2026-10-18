/* Minimal string tables for the game's own UI text (toasts, option labels). English only for now.
   I18N.t("key", {name: "x"}) -> table[lang][key] -> English -> the key itself; "{name}" placeholders.
   Language: SOTH_HOST.locale (iOS shell) or navigator.language, reduced to the base code ("fr-CA" -> "fr").
   Elements with data-i18n="key" get their text set by I18N.apply(). Story dialogue is content, not UI text. */
window.I18N = (() => {
  const tables = {};
  const host = window.SOTH_HOST || null;
  const raw = String((host && host.locale) || (typeof navigator !== "undefined" && navigator.language) || "en");
  const lang = raw.toLowerCase().split(/[-_]/)[0] || "en";
  function format(str, vars) {
    return vars ? str.replace(/\{(\w+)\}/g, (m, k) => (vars[k] == null ? m : String(vars[k]))) : str;
  }
  function t(key, vars) {
    const s = (tables[lang] && tables[lang][key]) || (tables.en && tables.en[key]) || key;
    return format(s, vars);
  }
  function register(code, table) { tables[code] = Object.assign(tables[code] || {}, table); }
  function apply(root) {
    const scope = root || document;
    if (!scope.querySelectorAll) return;
    scope.querySelectorAll("[data-i18n]").forEach((el) => { el.textContent = t(el.getAttribute("data-i18n")); });
  }
  return { lang, t, register, apply, tables };
})();
