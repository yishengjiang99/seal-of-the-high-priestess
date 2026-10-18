/* Web Options: Text size / Reduce motion / Colour-safe cues. On iOS the native Settings own these
   (Platform.native), so the block is not shown there. Loaded after game.js; touches nothing else. */
(() => {
  const P = window.Platform;
  const I18N = window.I18N || { apply() {}, t: (k) => k };
  const host = document.getElementById("opt-voice-status");
  if (!P || P.native || !host || document.getElementById("opt-a11y")) return;
  const box = document.createElement("div");
  box.id = "opt-a11y";
  box.innerHTML = `
    <h3 data-i18n="opt.a11y"></h3>
    <label><span data-i18n="opt.subtitle"></span>
      <select id="opt-subtitle">
        <option value="1" data-i18n="opt.subtitle.1"></option>
        <option value="1.2" data-i18n="opt.subtitle.2"></option>
        <option value="1.4" data-i18n="opt.subtitle.3"></option>
        <option value="1.7" data-i18n="opt.subtitle.4"></option>
      </select>
    </label>
    <label class="check"><input id="opt-reduce-motion" type="checkbox" /> <span data-i18n="opt.reduce_motion"></span></label>
    <label class="check"><input id="opt-cues" type="checkbox" /> <span data-i18n="opt.cues"></span></label>`;
  I18N.apply(box);
  host.after(box);
  const sel = box.querySelector("#opt-subtitle");
  const rm = box.querySelector("#opt-reduce-motion");
  const cues = box.querySelector("#opt-cues");
  const sync = () => {
    const near = [...sel.options].reduce((a, o) => (Math.abs(+o.value - P.a11y.subtitleScale) < Math.abs(+a.value - P.a11y.subtitleScale) ? o : a));
    sel.value = near.value;
    rm.checked = P.a11y.reduceMotion;
    cues.checked = P.a11y.colorCues;
  };
  sel.addEventListener("change", () => P.setA11y({ subtitleScale: +sel.value }));
  rm.addEventListener("change", () => P.setA11y({ reduceMotion: rm.checked }));
  cues.addEventListener("change", () => P.setA11y({ colorCues: cues.checked }));
  P.on("a11yChanged", sync);
  sync();
})();
