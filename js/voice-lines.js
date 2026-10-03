/* Shared voice-line logic, used by the browser (window.VoiceLines) and by
   scripts/generate-voice.mjs (via a vm context). Keep this file dependency
   free and deterministic: the generator and the client must agree on how a
   line is cleaned, keyed and assigned to a bundle. */
(function (root) {
  "use strict";

  // Lines the Options "Preview voices" button plays.
  const PREVIEW_LINES = [
    ["elara", "The scriptures say patience is a virtue. But you are testing every one of them."],
    ["kael", "Little saint. Your sermons are as dull as your fashion sense."]
  ];

  // Text as it is sent to TTS (and as it is keyed in a manifest).
  function cleanSpeech(text) {
    return String(text || "")
      .replace(/[\u2014\u2013]/g, ", ")
      .replace(/\s+/g, " ")
      .replace(/[\u266a\u25c8\u25be]/g, "")
      .replace(/\*/g, "")
      .trim();
  }

  // Lines that are pure punctuation ("...") are not worth a clip.
  function isSpeakable(text) {
    return /[A-Za-z0-9]/.test(cleanSpeech(text));
  }

  // Manifest key for a line: speaker + cleaned text. Speaker "" is narration.
  function lineKey(speaker, text) {
    return String(speaker || "") + "|" + cleanSpeech(text);
  }

  // Scene id (as passed to startScene) -> bundle name.
  function bundleForScene(id) {
    id = String(id || "");
    if (id === "_talk") return "signs";
    if (id === "_preview") return "ui";
    if (id.indexOf("_t_") === 0) return "talk-" + id.slice(3);
    return "scene-" + id;
  }

  // Walk the game data and return { bundleName: [{ speaker, text }] } with
  // lines deduplicated per bundle and in script order.
  function collectBundles(SCENES, DATA, MAPS) {
    const out = {};
    const add = (bundle, speaker, text) => {
      if (!text || !isSpeakable(text)) return;
      const list = out[bundle] || (out[bundle] = []);
      const key = lineKey(speaker, text);
      if (list.some((l) => l.key === key)) return;
      list.push({ key, speaker: String(speaker || ""), text: cleanSpeech(text) });
    };
    for (const id of Object.keys(SCENES || {})) {
      for (const line of SCENES[id].script || []) {
        if (line.choices || !line.t) continue;
        add(bundleForScene(id), line.s, line.t);
      }
    }
    const talk = (DATA && DATA.NPC_TALK) || {};
    for (const id of Object.keys(talk)) {
      for (const line of talk[id] || []) add(bundleForScene("_t_" + id), line.s, line.t);
    }
    for (const id of Object.keys(MAPS || {})) {
      for (const ev of (MAPS[id] && MAPS[id].events) || []) {
        if ((ev.type === "sign" || ev.type === "block") && ev.text) add("signs", "", ev.text);
      }
    }
    for (const [sp, t] of PREVIEW_LINES) add("ui", sp, t);
    return out;
  }

  const api = { PREVIEW_LINES, cleanSpeech, isSpeakable, lineKey, bundleForScene, collectBundles };
  root.VoiceLines = api;
})(typeof window !== "undefined" ? window : globalThis);
