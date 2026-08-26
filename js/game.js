/* =============================================================================
   Seal of the High Priestess — engine
   States: title, vn, map, battle, menu, gameover, credits, saves, options
   Battle implements LinaHua's loop: Mana spend / Meditate / Unseal berserk /
   charge-up turns / gassed-out turns. No XP. Named gear only.
   ============================================================================= */
(() => {
  const W = 1280, H = 720, T = 32;
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  const $ = (id) => document.getElementById(id);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rnd = (a, b) => a + Math.random() * (b - a);
  const irnd = (a, b) => (a + Math.floor(Math.random() * (b - a + 1)));
  const deep = (o) => JSON.parse(JSON.stringify(o));

  const SOLID = new Set([0, 3, 4, 7, 9, 11, 12, 15, 17, 19, 20, 21, 22, 28, 29, 31, 32, 33, 34, 36, 37]);

  const S = {
    state: "boot",
    settings: { vol: 0.7, textSpeed: 2, battleSpeed: 1, auto: false, voice: true, voiceVol: 0.85, skipDialog: false },
    flags: {},
    inventory: [],
    quests: {},
    party: [],          // ids in formation
    chars: {},          // live battler-stats keyed by id
    mapId: "temple",
    px: 0, py: 0, dir: "down", moving: false,
    camX: 0, camY: 0,
    trail: [],
    time: 14,           // hour 0-24; afternoon matches the canal-town still
    vn: null,
    battle: null,
    menuTab: "party",
    saveMode: "save",
    lastBattle: null,
    particles: [],
    dmgNums: [],
    shake: 0,
    keys: {},
    just: {},
    mouse: { x: 0, y: 0, click: false },
    hover: 0,
    titleIdx: 0,
    anim: 0,
    tileFx: 0,
    images: {},
    ready: false,
    tutorialsSeen: {}
  };

  // ---------------------------------------------------------------------------
  // Input
  // ---------------------------------------------------------------------------
  const KEYMAP = {
    ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right",
    KeyW: "up", KeyS: "down", KeyA: "left", KeyD: "right",
    KeyZ: "ok", Enter: "ok", Space: "ok",
    KeyX: "cancel", ShiftLeft: "cancel", ShiftRight: "cancel",
    Escape: "menu", KeyC: "camp", KeyQ: "menu",
    ControlLeft: "skip", ControlRight: "skip", KeyF: "skip"
  };
  window.addEventListener("keydown", (e) => {
    const k = KEYMAP[e.code] || KEYMAP[e.key];
    if (!k) return;
    if (!S.keys[k]) S.just[k] = true;
    S.keys[k] = true;
    if (["ok", "cancel", "menu", "up", "down", "left", "right", "skip"].includes(k)) e.preventDefault();
  });
  window.addEventListener("keyup", (e) => {
    const k = KEYMAP[e.code] || KEYMAP[e.key];
    if (k) S.keys[k] = false;
  });
  canvas.addEventListener("mousemove", (e) => {
    const r = canvas.getBoundingClientRect();
    S.mouse.x = (e.clientX - r.left) * (W / r.width);
    S.mouse.y = (e.clientY - r.top) * (H / r.height);
  });
  canvas.addEventListener("mousedown", () => { S.mouse.click = true; S.just.ok = true; });

  $("touch").addEventListener("pointerdown", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    if (b.dataset.dir) S.keys[b.dataset.dir] = true;
    if (b.dataset.k === "KeyZ") { S.just.ok = true; S.keys.ok = true; }
    if (b.dataset.k === "KeyX") { S.just.cancel = true; S.keys.cancel = true; }
    if (b.dataset.k === "Escape") { S.just.menu = true; }
  });
  $("touch").addEventListener("pointerup", () => {
    S.keys.up = S.keys.down = S.keys.left = S.keys.right = S.keys.ok = S.keys.cancel = false;
  });
  if ("ontouchstart" in window) $("touch").classList.remove("hidden");

  function pressed(k) { const v = S.just[k]; S.just[k] = false; return v; }
  function flushJust() { /* kept until consumed */ }

  // ---------------------------------------------------------------------------
  // Audio — oscillator SFX + looping ambient cells
  // ---------------------------------------------------------------------------
  let actx = null, master = null, musicNodes = [];
  function ensureAudio() {
    if (actx) return;
    actx = new (window.AudioContext || window.webkitAudioContext)();
    master = actx.createGain();
    master.gain.value = S.settings.vol;
    master.connect(actx.destination);
  }
  function setVol(v) {
    S.settings.vol = v;
    if (master) master.gain.value = v;
    try { localStorage.setItem("soth_settings", JSON.stringify(S.settings)); } catch (e) {}
  }
  function sfx(kind) {
    if (!actx || S.settings.vol <= 0) return;
    const o = actx.createOscillator();
    const g = actx.createGain();
    o.connect(g); g.connect(master);
    const t = actx.currentTime;
    const table = {
      ui: [660, 0.06, "square"],
      ok: [880, 0.08, "square"],
      cancel: [330, 0.08, "square"],
      hit: [180, 0.12, "sawtooth"],
      crit: [420, 0.16, "sawtooth"],
      heal: [720, 0.18, "sine"],
      petal: [920, 0.2, "sine"],
      flame: [140, 0.22, "sawtooth"],
      unseal: [90, 0.45, "sawtooth"],
      hurt: [120, 0.2, "triangle"],
      save: [520, 0.25, "sine"],
      step: [220, 0.03, "square"]
    };
    const [f, d, type] = table[kind] || table.ui;
    o.type = type; o.frequency.setValueAtTime(f, t);
    if (kind === "unseal") o.frequency.exponentialRampToValueAtTime(40, t + d);
    if (kind === "heal" || kind === "petal") o.frequency.exponentialRampToValueAtTime(f * 1.6, t + d);
    g.gain.setValueAtTime(0.08, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + d);
    o.start(t); o.stop(t + d + 0.02);
  }
  // ---------------------------------------------------------------------------
  // TUNES — each zone has: base freq (Hz), melody sequence (semitones from base),
  // a chord table (semitone triads played every N beats), bass line, tempo, and
  // waveform.  Melody arrays can include octave shifts via plain semitone values
  // (e.g. 12 = one octave up).  A null in melody = rest.
  // ---------------------------------------------------------------------------
  const TUNES = {
    // Temple of the Priestess — pentatonic A minor, meditative, ethereal
    temple: {
      base: 220, wave: "sine", tempo: 0.48,
      melody: [0, 4, 7, 12, 9, 7, 4, 0, 2, 4, 7, 9, 12, 9, 7, null,
               0, 7, 12, 16, 14, 12, 7, 4, 2, 0, 4, 7, 9, 7, 4, null],
      chords: [[0, 7, 12], [2, 9, 14], [4, 7, 11], [0, 7, 12]],
      chordEvery: 8,
      bass: [0, 0, 7, 0, 9, 0, 7, 0],
      bassOct: 0.5
    },
    // Town — lively Dorian, bouncy triangle feel
    town: {
      base: 196, wave: "triangle", tempo: 0.22,
      melody: [0, 2, 3, 5, 7, 5, 3, 2, 0, 3, 7, 10, 9, 7, 5, 3,
               2, 3, 5, 7, 9, 10, 9, 7, 5, 3, 2, 0, null, 0, 2, null],
      chords: [[0, 7, 10], [3, 7, 10], [5, 9, 12], [2, 5, 9]],
      chordEvery: 8,
      bass: [0, 0, 3, 0, 5, 0, 7, 0],
      bassOct: 0.5
    },
    // City — jazz-inflected Mixolydian, bustling, confident
    city: {
      base: 174, wave: "triangle", tempo: 0.19,
      melody: [0, 4, 7, 10, 12, 10, 7, 4, 5, 9, 12, 10, 7, 5, 4, null,
               3, 7, 10, 12, 14, 12, 10, 7, 5, 3, 0, 3, 5, 7, null, null],
      chords: [[0, 7, 10], [5, 9, 12], [3, 7, 10], [0, 4, 7]],
      chordEvery: 8,
      bass: [0, 0, 5, 0, 3, 0, 7, 0],
      bassOct: 0.5
    },
    // Forest — Lydian shimmer, wandering, mysterious
    forest: {
      base: 146, wave: "sine", tempo: 0.58,
      melody: [0, 2, 4, 6, 7, 9, 11, 12, 11, 9, 7, 6, 4, 2, 0, null,
               7, 9, 11, 12, 14, 12, 11, 9, 7, 6, 4, 2, 4, 6, 7, null],
      chords: [[0, 7, 11], [2, 6, 9], [4, 7, 11], [6, 9, 14]],
      chordEvery: 8,
      bass: [0, 0, 7, 0, 4, 0, 7, 0],
      bassOct: 0.5
    },
    // Mountain Pass — Phrygian tension, cold and exposed
    pass: {
      base: 130, wave: "sawtooth", tempo: 0.52,
      melody: [0, 1, 3, 5, 7, 8, 7, 5, 3, 1, 0, 3, 7, 10, 8, null,
               0, 1, 3, 7, 8, 10, 8, 7, 5, 3, 1, 0, null, 0, 1, null],
      chords: [[0, 7, 10], [1, 5, 8], [3, 7, 10], [0, 3, 7]],
      chordEvery: 8,
      bass: [0, 0, 1, 0, 3, 0, 7, 0],
      bassOct: 0.5
    },
    // Ruins — Locrian dread, sparse, haunting
    ruins: {
      base: 110, wave: "triangle", tempo: 0.72,
      melody: [0, 1, 3, null, 6, null, 8, 6, null, 3, 1, 0, null, 8, 6, null,
               0, null, 6, null, 8, 10, 8, 6, null, 3, null, 1, 0, null, null, null],
      chords: [[0, 6, 8], [1, 6, 10], [3, 8, 13], [0, 3, 6]],
      chordEvery: 8,
      bass: [0, 0, 6, 0, 1, 0, 6, 0],
      bassOct: 0.5
    },
    // Throne Room — majestic, low D, full voicing, slow and weighty
    throne: {
      base: 98, wave: "sine", tempo: 0.78,
      melody: [0, 3, 7, 10, 12, 15, 12, 10, 7, 3, 0, null, 5, 8, 12, null,
               0, 7, 12, 15, 19, 15, 12, 7, 5, 3, 0, 3, 7, 10, null, null],
      chords: [[0, 7, 12], [3, 7, 10], [5, 8, 12], [0, 5, 10]],
      chordEvery: 4,
      bass: [0, 0, 5, 0, 3, 0, 7, 0],
      bassOct: 0.5
    },
    // Battle — diminished / octatonic, fast, aggressive, urgent
    battle: {
      base: 164, wave: "square", tempo: 0.14,
      melody: [0, 3, 6, 9, 0, 6, 3, 9, 1, 4, 7, 10, 1, 7, 4, 10,
               0, 1, 3, 6, 7, 9, 10, null, 0, 3, 6, 9, 7, 4, 1, null],
      chords: [[0, 6, 9], [3, 6, 10], [1, 4, 9], [0, 3, 7]],
      chordEvery: 8,
      bass: [0, 3, 6, 9, 0, 6, 3, 9],
      bassOct: 0.5
    }
  };
  let musicId = null, musicTimer = 0, musicStep = 0;
  function playMusic(id) {
    if (musicId === id) return;
    musicId = id;
    musicStep = 0;
    musicTimer = 0;
  }
  function tickMusic(dt) {
    if (!actx || !musicId || S.settings.vol <= 0) return;
    const tune = TUNES[musicId];
    if (!tune) return;
    musicTimer += dt / 1000;
    if (musicTimer < tune.tempo) return;
    musicTimer = 0;
    const step = musicStep++;
    const t = actx.currentTime;
    const semitone = tune.melody[step % tune.melody.length];

    // Melody note (skip if rest)
    if (semitone !== null) {
      const o = actx.createOscillator();
      const g = actx.createGain();
      o.type = tune.wave;
      o.frequency.value = tune.base * Math.pow(2, semitone / 12);
      // Subtle vibrato on slow tunes
      if (tune.tempo >= 0.45) {
        const lfo = actx.createOscillator();
        const lfoG = actx.createGain();
        lfo.frequency.value = 5;
        lfoG.gain.value = tune.base * 0.003;
        lfo.connect(lfoG); lfoG.connect(o.frequency);
        lfo.start(t); lfo.stop(t + tune.tempo * 1.8);
      }
      o.connect(g); g.connect(master);
      g.gain.setValueAtTime(0.04, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + tune.tempo * 1.5);
      o.start(t); o.stop(t + tune.tempo * 1.7);
    }

    // Bass note every beat
    const bassNote = tune.bass[step % tune.bass.length];
    if (bassNote !== null) {
      const b = actx.createOscillator();
      const bg = actx.createGain();
      b.type = "sine";
      b.frequency.value = tune.base * tune.bassOct * Math.pow(2, bassNote / 12);
      b.connect(bg); bg.connect(master);
      bg.gain.setValueAtTime(0.03, t);
      bg.gain.exponentialRampToValueAtTime(0.001, t + tune.tempo * 1.9);
      b.start(t); b.stop(t + tune.tempo * 2);
    }

    // Chord voicing every N steps
    if (tune.chords && step % tune.chordEvery === 0) {
      const chord = tune.chords[Math.floor(step / tune.chordEvery) % tune.chords.length];
      chord.forEach((cn, i) => {
        const c = actx.createOscillator();
        const cg = actx.createGain();
        c.type = tune.wave === "square" ? "sawtooth" : "sine";
        c.frequency.value = tune.base * Math.pow(2, cn / 12);
        c.connect(cg); cg.connect(master);
        const vel = 0.012 - i * 0.003;
        cg.gain.setValueAtTime(vel, t + i * 0.018);
        cg.gain.exponentialRampToValueAtTime(0.001, t + tune.tempo * tune.chordEvery * 0.9);
        c.start(t + i * 0.018); c.stop(t + tune.tempo * tune.chordEvery);
      });
    }
  }

  // ---------------------------------------------------------------------------
  // Web Speech API — per-speaker dialogue
  // ---------------------------------------------------------------------------
  const VOICE_PROFILE = {
    elara: { gender: "f", pitch: 1.28, rate: 0.98, vol: 1, prefer: /samantha|victoria|karen|moira|tessa|zira|fiona|siri|female|google uk english female/i },
    kael: { gender: "m", pitch: 0.68, rate: 0.9, vol: 1, prefer: /daniel|alex|fred|david|gordon|tom|male|google uk english male/i },
    shade: { gender: "m", pitch: 0.5, rate: 0.82, vol: 0.95, prefer: /daniel|alex|male/i },
    lyra: { gender: "f", pitch: 1.08, rate: 1.08, vol: 1, prefer: /karen|moira|female/i },
    thorn: { gender: "m", pitch: 0.55, rate: 0.8, vol: 1, prefer: /fred|daniel|male/i },
    suyin: { gender: "f", pitch: 0.88, rate: 0.86, vol: 1, prefer: /moira|fiona|victoria|female/i },
    shen: { gender: "m", pitch: 0.7, rate: 0.84, vol: 1 },
    lyra_npc: { gender: "f", pitch: 1.08, rate: 1.08, vol: 1 },
    bard: { gender: "m", pitch: 1.05, rate: 1.05, vol: 1 },
    korin: { gender: "m", pitch: 0.62, rate: 0.88, vol: 1 },
    sera: { gender: "f", pitch: 1.2, rate: 1.05, vol: 1 },
    keeper: { gender: "m", pitch: 0.78, rate: 0.9, vol: 1 },
    jori: { gender: "m", pitch: 1.35, rate: 1.12, vol: 0.95 },
    mira: { gender: "f", pitch: 1.32, rate: 1.1, vol: 1 },
    hana: { gender: "f", pitch: 1.12, rate: 1.0, vol: 1 },
    wen: { gender: "m", pitch: 0.58, rate: 0.82, vol: 1 },
    ren: { gender: "m", pitch: 1.1, rate: 1.05, vol: 1 },
    echo: { gender: "m", pitch: 0.55, rate: 0.78, vol: 0.85 },
    fisherman: { gender: "m", pitch: 0.7, rate: 0.9, vol: 1 },
    captain: { gender: "m", pitch: 0.72, rate: 0.95, vol: 1 },
    granny: { gender: "f", pitch: 0.8, rate: 0.88, vol: 1 },
    "": { gender: "n", pitch: 0.82, rate: 0.88, vol: 0.62 }
  };
  const FEM_RE = /female|woman|girl|samantha|victoria|karen|moira|tessa|fiona|zira|susan|siri|kathy|princess|grandma/i;
  const MALE_RE = /male|man|boy|daniel|alex|fred|david|tom|gordon|ralph|jorge|bruce|fred|grandpa|aaron|nicky/i;
  let voices = [];
  let voiceBySpeaker = {};
  let speakTimer = 0;
  let speaking = false;

  function speechOk() {
    return typeof window !== "undefined" && "speechSynthesis" in window && typeof SpeechSynthesisUtterance !== "undefined";
  }
  function harvestVoices() {
    if (!speechOk()) return;
    voices = window.speechSynthesis.getVoices() || [];
    voiceBySpeaker = {};
    refreshVoiceStatus();
  }
  function refreshVoiceStatus() {
    const el = $("opt-voice-status");
    if (!el) return;
    if (!speechOk()) {
      el.textContent = "This browser has no Web Speech API — dialogue will stay silent.";
      return;
    }
    const n = voices.filter((v) => /^en/i.test(v.lang) || /english/i.test(v.name)).length || voices.length;
    el.textContent = n ? n + " English voice" + (n === 1 ? "" : "s") + " available. Elara and Kael use different pitches even on a single voice." : "Waiting for system voices…";
  }
  function genderOfVoice(v) {
    if (FEM_RE.test(v.name) || FEM_RE.test(v.voiceURI || "")) return "f";
    if (MALE_RE.test(v.name) || MALE_RE.test(v.voiceURI || "")) return "m";
    return "n";
  }
  function pickVoice(sp) {
    if (voiceBySpeaker[sp]) return voiceBySpeaker[sp];
    const p = VOICE_PROFILE[sp] || VOICE_PROFILE[""];
    const en = voices.filter((v) => /^en/i.test(v.lang) || /english/i.test(v.name));
    const pool = en.length ? en : voices.slice();
    if (!pool.length) return null;
    let chosen = null;
    if (p.prefer) chosen = pool.find((v) => p.prefer.test(v.name) || p.prefer.test(v.voiceURI || ""));
    if (!chosen && p.gender === "f") chosen = pool.find((v) => genderOfVoice(v) === "f");
    if (!chosen && p.gender === "m") chosen = pool.find((v) => genderOfVoice(v) === "m");
    if (!chosen) {
      const idx = Math.abs([...sp].reduce((a, c) => a + c.charCodeAt(0), 0)) % pool.length;
      chosen = pool[idx];
    }
    // Keep Elara/Kael on different voices when possible
    if (sp === "kael" && voiceBySpeaker.elara && chosen === voiceBySpeaker.elara && pool.length > 1) {
      chosen = pool.find((v) => v !== voiceBySpeaker.elara) || chosen;
    }
    voiceBySpeaker[sp] = chosen;
    return chosen;
  }
  function cleanSpeech(text) {
    return String(text || "")
      .replace(/[—–]/g, ", ")
      .replace(/\s+/g, " ")
      .replace(/[♪◈▾]/g, "")
      .trim();
  }
  function stopSpeech() {
    speaking = false;
    const name = $("vn-name");
    if (name) name.classList.remove("speaking");
    if (!speechOk()) return;
    try { window.speechSynthesis.cancel(); } catch (e) {}
    S._utter = null;
    if (speakTimer) { clearTimeout(speakTimer); speakTimer = 0; }
  }
  function speakLine(sp, text) {
    stopSpeech();
    if (!S.settings.voice || !speechOk()) return;
    const t = cleanSpeech(text);
    if (!t) return;
    const p = VOICE_PROFILE[sp] || VOICE_PROFILE[""] || { pitch: 1, rate: 1, vol: 1 };
    const u = new SpeechSynthesisUtterance(t);
    const v = pickVoice(sp);
    if (v) u.voice = v;
    u.lang = (v && v.lang) || "en-US";
    u.rate = clamp(p.rate || 1, 0.6, 1.4);
    u.pitch = clamp(p.pitch || 1, 0.4, 1.8);
    u.volume = clamp((S.settings.voiceVol || 0) * (p.vol == null ? 1 : p.vol), 0, 1);
    if (u.volume <= 0.01) return;
    u.onstart = () => {
      speaking = true;
      const name = $("vn-name");
      if (name && name.textContent) name.classList.add("speaking");
    };
    u.onend = () => {
      speaking = false;
      const name = $("vn-name");
      if (name) name.classList.remove("speaking");
      if (S.vn) S.vn.speechDone = true;
    };
    u.onerror = () => { speaking = false; };
    S._utter = u;
    S.vn && (S.vn.speechDone = false);
    // Chrome drops speak() if it follows cancel() in the same turn
    speakTimer = setTimeout(() => {
      speakTimer = 0;
      try { window.speechSynthesis.speak(u); } catch (e) {}
    }, 40);
  }
  function previewVoices() {
    if (!speechOk()) return;
    S.settings.voice = true;
    const lines = [
      ["elara", "The scriptures say patience is a virtue. But you are testing every one of them."],
      ["kael", "Little saint. Your sermons are as dull as your fashion sense."]
    ];
    let i = 0;
    const next = () => {
      if (i >= lines.length) return;
      const [sp, t] = lines[i++];
      stopSpeech();
      speakLine(sp, t);
      const u = S._utter;
      if (u) u.onend = () => { speaking = false; setTimeout(next, 280); };
    };
    next();
  }
  if (speechOk()) {
    harvestVoices();
    window.speechSynthesis.addEventListener("voiceschanged", harvestVoices);
  }

  // ---------------------------------------------------------------------------
  // Images / resize
  // ---------------------------------------------------------------------------
  function loadImages() {
    const list = [
      ["title", DATA.BGS.title],
      ["elara", DATA.PORTRAITS.elara.neutral],
      ["kael", DATA.PORTRAITS.kael.smirk]
    ];
    return Promise.all(list.map(([k, src]) => new Promise((res) => {
      const img = new Image();
      img.onload = () => { S.images[k] = img; res(); };
      img.onerror = () => res();
      img.src = src;
    })));
  }
  function fit() {
    const scale = Math.min(window.innerWidth / W, window.innerHeight / H);
    $("app").style.transform = `scale(${scale})`;
  }
  window.addEventListener("resize", fit);

  // ---------------------------------------------------------------------------
  // Party / items / flags
  // ---------------------------------------------------------------------------
  function makeChar(id) {
    const t = DATA.CHARS[id];
    return {
      id, name: t.name, role: t.role, resName: t.resName, resKey: t.resKey,
      maxHp: t.maxHp, hp: t.maxHp, maxRes: t.maxRes, res: t.maxRes,
      atk: t.atk, def: t.def, spd: t.spd, acc: t.acc,
      color: t.color, accent: t.accent,
      baseSkills: t.skills.slice(),
      weapon: t.weapon, armor: t.armor, accessory: t.accessory,
      charging: 0, chargeSkill: null, chargeTarget: null,
      gassed: 0, shield: 0, empowered: 0, mocked: 0, marked: 0,
      evade: 0, defUp: 0, taunt: 0, bleed: 0, stun: 0,
      berserk: 0, unsealCd: 0, meditating: false, vulnerable: false,
      alive: true
    };
  }
  function applyGrowth(ch) {
    const t = DATA.CHARS[ch.id];
    ch.maxHp = t.maxHp; ch.maxRes = t.maxRes; ch.atk = t.atk; ch.def = t.def; ch.spd = t.spd; ch.acc = t.acc;
    for (const [flag, bump] of Object.entries(DATA.GROWTH)) {
      if (!S.flags[flag] || !bump[ch.id]) continue;
      for (const [k, v] of Object.entries(bump[ch.id])) ch[k] = (ch[k] || 0) + v;
    }
    for (const slot of ["weapon", "armor", "accessory"]) {
      const it = ch[slot] && DATA.ITEMS[ch[slot]];
      if (!it) continue;
      if (it.atk) ch.atk += it.atk;
      if (it.def) ch.def += it.def;
      if (it.spd) ch.spd += it.spd;
      if (it.acc) ch.acc += it.acc;
      if (it.maxRes) ch.maxRes += it.maxRes;
      if (it.maxHp) ch.maxHp += it.maxHp;
    }
    ch.hp = Math.min(ch.hp, ch.maxHp);
    ch.res = Math.min(ch.res, ch.maxRes);
  }
  function skillsOf(ch) {
    return (DATA.CHARS[ch.id].skills || []).filter((sid) => {
      const sk = DATA.SKILLS[sid];
      if (!sk) return false;
      if (sk.needFlag && !S.flags[sk.needFlag]) return false;
      return true;
    });
  }
  function grant(itemId, silent) {
    const it = DATA.ITEMS[itemId];
    if (!it) return;
    if (it.slot) {
      const who = it.who === "any" ? S.party[0] : it.who;
      const ch = S.chars[who];
      if (ch) {
        ch[it.slot] = itemId;
        applyGrowth(ch);
      }
      if (!S.inventory.includes(itemId)) S.inventory.push(itemId);
    } else if (!S.inventory.includes(itemId) || it.type === "consumable") {
      S.inventory.push(itemId);
      if (it.type === "consumable") it._uses = it.uses;
    }
    if (!silent) toast(`Obtained: ${it.name}`);
  }
  function setFlag(k, v) {
    if (v === undefined) v = 1;
    S.flags[k] = v;
    if (k === "lyra_joined" && !S.party.includes("lyra")) {
      S.chars.lyra = makeChar("lyra"); S.party.push("lyra"); applyGrowth(S.chars.lyra);
    }
    if (k === "thorn_joined" && !S.party.includes("thorn")) {
      S.chars.thorn = makeChar("thorn"); S.party.push("thorn"); applyGrowth(S.chars.thorn);
    }
    if (k === "quest_shen") grant("lotus_petal", true);
    if (k === "quest_acolyte_found") grant("prayer_beads");
    if (k === "quest_blacksmith") grant("veil_first_oath");
    if (k === "quest_letter") { /* skill unlock via flag */ }
    if (k === "quest_lantern") grant("lantern_meridia");
    if (k === "quest_tablet") grant("seal_circlet");
    if (k === "quest_canal") { /* skill flag */ }
    if (k === "quest_hound") grant("climber_charm");
    if (k === "hollow_oak_dead" || k === "warden_dead" || k === "court_survived" || k === "unsealed_once") {
      Object.values(S.chars).forEach(applyGrowth);
    }
    // quest tracking
    const qmap = {
      missing_acolyte: "quest_acolyte_found", master_shen: "quest_shen", canal_fox: "quest_canal",
      blacksmith_daughter: "quest_blacksmith", sealed_letter: "quest_letter",
      lantern_keeper: "quest_lantern", courtyard_tablet: "quest_tablet", bound_hound: "quest_hound"
    };
    for (const [qid, f] of Object.entries(qmap)) {
      if (k === f) S.quests[qid] = "done";
    }
  }
  function flagOn(k) { return !!S.flags[k]; }
  let toastMsg = "", toastT = 0;
  function toast(m) { toastMsg = m; toastT = 2200; }

  function newGame() {
    S.flags = { intro_done: 0 };
    S.inventory = ["moonwell_chalice", "lotus_petal", "sealing_salve"];
    DATA.ITEMS.moonwell_chalice._uses = 3;
    DATA.ITEMS.lotus_petal._uses = 4;
    DATA.ITEMS.sealing_salve._uses = 2;
    S.quests = { main_pilgrimage: "active", missing_acolyte: "active" };
    S.chars = { elara: makeChar("elara"), kael: makeChar("kael") };
    S.party = ["elara", "kael"];
    Object.values(S.chars).forEach(applyGrowth);
    S.mapId = "temple";
    const sp = MAPS.temple.spawn;
    S.px = sp.x * T + T / 2; S.py = sp.y * T + T / 2;
    S.dir = "down"; S.trail = []; S.time = 18;
    startScene("intro");
  }

  // ---------------------------------------------------------------------------
  // Save
  // ---------------------------------------------------------------------------
  function serialize() {
    const itemUses = {};
    S.inventory.forEach((id) => {
      const it = DATA.ITEMS[id];
      if (it && it.type === "consumable") itemUses[id] = it._uses ?? it.uses;
    });
    return {
      flags: S.flags, inventory: S.inventory, quests: S.quests,
      party: S.party, chars: S.chars, mapId: S.mapId,
      px: S.px, py: S.py, dir: S.dir, time: S.time,
      tutorialsSeen: S.tutorialsSeen, itemUses,
      when: Date.now()
    };
  }
  function deserialize(d) {
    S.flags = d.flags || {};
    S.inventory = d.inventory || [];
    S.quests = d.quests || {};
    S.party = d.party || ["elara", "kael"];
    S.chars = d.chars || {};
    S.mapId = d.mapId || "temple";
    S.px = d.px; S.py = d.py; S.dir = d.dir || "down";
    S.time = d.time || 12;
    S.tutorialsSeen = d.tutorialsSeen || {};
    S.trail = [];
    if (d.itemUses) {
      Object.entries(d.itemUses).forEach(([id, n]) => { if (DATA.ITEMS[id]) DATA.ITEMS[id]._uses = n; });
    }
  }
  function saveSlot(n) {
    try { localStorage.setItem("soth_slot_" + n, JSON.stringify(serialize())); sfx("save"); toast("Saved to slot " + (n + 1)); }
    catch (e) { toast("Save failed"); }
  }
  function loadSlot(n) {
    try {
      const d = JSON.parse(localStorage.getItem("soth_slot_" + n) || "null");
      if (!d) return false;
      deserialize(d);
      hideAllScreens();
      enterMap();
      return true;
    } catch (e) { return false; }
  }
  function hasAnySave() {
    for (let i = 0; i < 3; i++) if (localStorage.getItem("soth_slot_" + i)) return true;
    return false;
  }
  function latestSave() {
    let best = -1, t = 0;
    for (let i = 0; i < 3; i++) {
      try {
        const d = JSON.parse(localStorage.getItem("soth_slot_" + i) || "null");
        if (d && d.when > t) { t = d.when; best = i; }
      } catch (e) {}
    }
    return best;
  }

  // ---------------------------------------------------------------------------
  // Screens
  // ---------------------------------------------------------------------------
  function hideAllScreens() {
    ["screen-title", "screen-options", "screen-credits", "screen-vn", "screen-menu", "screen-over", "screen-saves"]
      .forEach((id) => $(id).classList.add("hidden"));
    $("map-hud").classList.add("hidden");
    $("battle-hud").classList.add("hidden");
    $("screen-vn").classList.remove("open-vn", "talk");
  }
  function showTitle() {
    stopSpeech();
    S.state = "title";
    hideAllScreens();
    const t = $("screen-title");
    t.classList.remove("hidden");
    if (S.images.title) t.style.backgroundImage = `url(${DATA.BGS.title})`;
    $("btn-continue").disabled = !hasAnySave();
    S.titleIdx = 0;
    highlightTitle();
    playMusic("temple");
  }
  function highlightTitle() {
    const btns = [...$("title-menu").querySelectorAll("button")].filter((b) => !b.disabled);
    btns.forEach((b, i) => b.classList.toggle("on", i === S.titleIdx));
  }
  function titleAct(act) {
    sfx("ok");
    if (act === "new") { ensureAudio(); newGame(); }
    if (act === "continue") {
      ensureAudio();
      const n = latestSave();
      if (n >= 0) loadSlot(n);
    }
    if (act === "options") showOptions(true);
    if (act === "credits") {
      hideAllScreens();
      $("screen-credits").classList.remove("hidden");
      S.state = "credits";
    }
  }
  $("title-menu").addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (b && b.dataset.act) titleAct(b.dataset.act);
  });
  function showOptions(fromTitle) {
    S._optFrom = fromTitle ? "title" : S.state;
    hideAllScreens();
    $("screen-options").classList.remove("hidden");
    S.state = "options";
    $("opt-vol").value = (S.settings.vol * 100) | 0;
    $("opt-text").value = String(S.settings.textSpeed);
    $("opt-battle").value = String(S.settings.battleSpeed);
    $("opt-auto").checked = S.settings.auto;
    $("opt-skip").checked = !!S.settings.skipDialog;
    $("opt-voice").checked = !!S.settings.voice;
    $("opt-voice-vol").value = ((S.settings.voiceVol ?? 0.85) * 100) | 0;
    $("opt-voice").disabled = !speechOk();
    $("opt-voice-test").disabled = !speechOk();
    harvestVoices();
    refreshVoiceStatus();
  }
  $("opt-vol").addEventListener("input", () => { ensureAudio(); setVol($("opt-vol").value / 100); });
  $("opt-text").addEventListener("change", () => { S.settings.textSpeed = +$("opt-text").value; persistSettings(); });
  $("opt-battle").addEventListener("change", () => { S.settings.battleSpeed = +$("opt-battle").value; persistSettings(); });
  $("opt-auto").addEventListener("change", () => { S.settings.auto = $("opt-auto").checked; persistSettings(); });
  $("opt-skip").addEventListener("change", () => { S.settings.skipDialog = $("opt-skip").checked; persistSettings(); });
  $("opt-voice").addEventListener("change", () => {
    S.settings.voice = $("opt-voice").checked;
    if (!S.settings.voice) stopSpeech();
    persistSettings();
  });
  $("opt-voice-vol").addEventListener("input", () => {
    S.settings.voiceVol = $("opt-voice-vol").value / 100;
    persistSettings();
  });
  $("opt-voice-test").addEventListener("click", () => { previewVoices(); });
  $("vn-skip").addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (S.state === "vn") vnSkip();
  });
  $("vn-box").addEventListener("click", (e) => {
    if (e.target.closest("#vn-skip") || e.target.closest("#vn-choices")) return;
    if (S.state === "vn") S.just.ok = true;
  });
  function persistSettings() {
    try { localStorage.setItem("soth_settings", JSON.stringify(S.settings)); } catch (e) {}
  }
  document.body.addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b || !b.dataset.act) return;
    const a = b.dataset.act;
    if (a === "opt-back" || a === "credits-back") {
      if (S._optFrom === "title" || a === "credits-back") showTitle();
      else openMenu();
    }
    if (a === "menu-close") closeMenu();
    if (a === "retry" && S.lastBattle) startBattle(S.lastBattle);
    if (a === "load") openSaves("load");
    if (a === "title") showTitle();
    if (a === "saves-back") {
      if (S.state === "saves" && S.saveMode === "load" && !$("screen-menu").classList.contains("hidden")) openMenu();
      else if (S._fromOver) { $("screen-over").classList.remove("hidden"); S.state = "gameover"; $("screen-saves").classList.add("hidden"); }
      else openMenu();
    }
  });
  $("menu-tabs").addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    S.menuTab = b.dataset.tab;
    renderMenu();
  });

  // ---------------------------------------------------------------------------
  // Map
  // ---------------------------------------------------------------------------
  function map() { return MAPS[S.mapId]; }
  function tileAt(tx, ty) {
    const m = map();
    if (!m || ty < 0 || tx < 0 || ty >= m.h || tx >= m.w) return 0;
    return m.tiles[ty][tx];
  }
  function solidAt(px, py) {
    const tx = Math.floor(px / T), ty = Math.floor(py / T);
    const tt = tileAt(tx, ty);
    if (SOLID.has(tt)) return true;
    if (tt === 6 && map() && !map().indoors) return true; // overworld wood = building mass
    const m = map();
    for (const ev of m.events) {
      if (!eventVisible(ev)) continue;
      if (ev.type === "npc" || ev.type === "encounter") {
        if (tx === ev.x && ty === ev.y) return true;
      }
      if (ev.type === "block" && flagOn(ev.needFlagOff ? null : "_") ) {}
      if (ev.type === "block" && ev.needFlagOff && !flagOn(ev.needFlagOff) && tx === ev.x && ty === ev.y) return true;
    }
    return false;
  }
  function eventVisible(ev) {
    if (ev.appearIf && !flagOn(ev.appearIf)) return false;
    if (ev.appearIfOff && flagOn(ev.appearIfOff)) return false;
    if (ev.once && flagOn(ev.once)) return false;
    return true;
  }
  function eventsAt(tx, ty) {
    return (map().events || []).filter((ev) => {
      if (!eventVisible(ev)) return false;
      const w = ev.w || 1, h = ev.h || 1;
      return tx >= ev.x && tx < ev.x + w && ty >= ev.y && ty < ev.y + h;
    });
  }
  function enterMap() {
    S.state = "map";
    hideAllScreens();
    $("map-hud").classList.remove("hidden");
    $("map-location").textContent = map().name;
    playMusic(map().music || "temple");
    S.camX = S.px - W / 2; S.camY = S.py - H / 2;
  }
  function footTile() { return { x: Math.floor(S.px / T), y: Math.floor(S.py / T) }; }
  function facingTile() {
    const f = footTile();
    if (S.dir === "up") return { x: f.x, y: f.y - 1 };
    if (S.dir === "down") return { x: f.x, y: f.y + 1 };
    if (S.dir === "left") return { x: f.x - 1, y: f.y };
    return { x: f.x + 1, y: f.y };
  }
  function tryWarp(ev) {
    if (ev.needFlag && !flagOn(ev.needFlag)) {
      toast(ev.needText || "The way is closed.");
      return;
    }
    const m = MAPS[ev.map];
    if (!m) return;
    S.mapId = ev.map;
    S.px = (ev.tx + 0.5) * T;
    S.py = (ev.ty + 0.5) * T;
    if (ev.dir) S.dir = ev.dir;
    S.trail = [];
    S.warpLock = 400;
    $("map-location").textContent = m.name;
    playMusic(m.music || "temple");
    sfx("ok");
  }
  function restAtAltar() {
    Object.values(S.chars).forEach((c) => {
      if (!S.party.includes(c.id)) return;
      c.hp = c.maxHp; c.res = c.maxRes;
      c.gassed = 0; c.charging = 0; c.berserk = 0; c.unsealCd = 0;
      c.shield = 0; c.bleed = 0; c.stun = 0;
    });
    S.time = (S.time + 8) % 24;
    sfx("heal");
    toast("The lotus altar takes the night. The party is whole.");
  }
  function interact() {
    const f = facingTile(), here = footTile();
    const list = [...eventsAt(f.x, f.y), ...eventsAt(here.x, here.y)];
    for (const ev of list) {
      if (ev.type === "warp") { tryWarp(ev); return; }
      if (ev.type === "save") { restAtAltar(); openMenu(); return; }
      if (ev.type === "chest") {
        if (flagOn("chest_" + ev.id) || flagOn(ev.id)) { toast("Empty."); return; }
        setFlag(ev.id, 1);
        grant(ev.item);
        sfx("ok");
        return;
      }
      if (ev.type === "sign") {
        if (ev.set) setFlag(ev.set, 1);
        talkSimple("", ev.text); return;
      }
      if (ev.type === "npc") {
        if (ev.quest && S.quests[ev.quest] === "active" && ev.id === "mira") setFlag("quest_acolyte_found");
        if (ev.quest === "missing_acolyte" && ev.id === "ren") S.quests.missing_acolyte = "active";
        if (ev.scene) { startScene(ev.scene); return; }
        if (ev.talk) { startTalk(ev.talk); return; }
      }
      if (ev.type === "encounter") { startBattle(ev.battle); return; }
      if (ev.type === "block") { talkSimple("", ev.text); return; }
    }
  }
  function stepTriggers() {
    if (S.warpLock > 0) return;
    const f = footTile();
    for (const ev of eventsAt(f.x, f.y)) {
      if (ev.type === "warp") { tryWarp(ev); return; }
      if (ev.type === "trigger") {
        if (ev.flagNeed && !flagOn(ev.flagNeed)) continue;
        if (ev.flagNeedOff && flagOn(ev.flagNeedOff)) continue;
        if (ev.scene) startScene(ev.scene);
        return;
      }
    }
  }

  function updateMap(dt) {
    if (S.warpLock > 0) S.warpLock -= dt;
    const speed = (S.keys.cancel ? 2.8 : 1.7);
    let dx = 0, dy = 0;
    if (S.keys.up) dy -= 1;
    if (S.keys.down) dy += 1;
    if (S.keys.left) dx -= 1;
    if (S.keys.right) dx += 1;
    if (dx || dy) {
      if (Math.abs(dx) > Math.abs(dy)) S.dir = dx < 0 ? "left" : "right";
      else S.dir = dy < 0 ? "up" : "down";
      const len = Math.hypot(dx, dy) || 1;
      dx = (dx / len) * speed; dy = (dy / len) * speed;
      const nx = S.px + dx, ny = S.py + dy;
      const r = 10;
      if (!solidAt(nx, S.py + r) && !solidAt(nx, S.py - 4) && !solidAt(nx - r, S.py) && !solidAt(nx + r, S.py)) S.px = nx;
      if (!solidAt(S.px, ny + r) && !solidAt(S.px, ny - 4) && !solidAt(S.px - r, ny) && !solidAt(S.px + r, ny)) S.py = ny;
      S.trail.push({ x: S.px, y: S.py, dir: S.dir });
      if (S.trail.length > 80) S.trail.shift();
      S.moving = true;
    } else S.moving = false;
    if (pressed("ok")) interact();
    if (pressed("menu")) openMenu();
    if (pressed("camp")) {
      const f = footTile();
      if (eventsAt(f.x, f.y).some((e) => e.type === "save")) { restAtAltar(); openMenu(); }
      else toast("Rest at a glowing lotus altar.");
    }
    stepTriggers();
    const m = map();
    S.camX += ((S.px - W / 2) - S.camX) * 0.12;
    S.camY += ((S.py - H / 2) - S.camY) * 0.12;
    S.camX = clamp(S.camX, 0, Math.max(0, m.w * T - W));
    S.camY = clamp(S.camY, 0, Math.max(0, m.h * T - H));
  }

  // Tile painter
  const tileCache = {};
  function tseed(x, y) { return ((x * 73856093) ^ (y * 19349663)) >>> 0; }
  function paintTile(type, x, y, ox, oy) {
    const px = Math.floor(x * T - ox), py = Math.floor(y * T - oy);
    if (px < -T || py < -T || px > W || py > H) return;
    const night = !map().indoors && (S.time < 6 || S.time >= 20);
    ctx.save();
    ctx.translate(px, py);
    const s = tseed(x, y);
    const j = (n) => ((s >> n) & 7) / 7;
    switch (type) {
      case 0: ctx.fillStyle = "#07060a"; ctx.fillRect(0, 0, T, T); break;
      case 1: { // grass — RPG Maker lime
        ctx.fillStyle = night ? "#1c3c18" : "#3d9c34";
        ctx.fillRect(0, 0, T, T);
        ctx.fillStyle = night ? "#2a5424" : "#52b844";
        for (let i = 0; i < 12; i++) ctx.fillRect((s >> i) & 28, (s >> (i + 2)) & 28, 3, 2);
        if ((s & 15) === 1) { ctx.fillStyle = "#e878b0"; ctx.fillRect(12, 10, 3, 3); }
        break;
      }
      case 2: case 24: { // warm cobble like the canal street
        ctx.fillStyle = "#8a7a64"; ctx.fillRect(0, 0, T, T);
        const stones = ["#d2c4a8", "#c4b494", "#e0d4bc", "#b8a888"];
        ctx.fillStyle = stones[s & 3]; ctx.fillRect(1, 1, 14, 13);
        ctx.fillStyle = stones[(s >> 2) & 3]; ctx.fillRect(16, 1, 15, 14);
        ctx.fillStyle = stones[(s >> 4) & 3]; ctx.fillRect(1, 16, 15, 15);
        ctx.fillStyle = stones[(s >> 6) & 3]; ctx.fillRect(17, 17, 14, 14);
        ctx.strokeStyle = "#7a6a54"; ctx.strokeRect(0.5, 0.5, 31, 31);
        const gish = (tt) => tt === 1 || tt === 7 || tt === 20 || tt === 27;
        ctx.fillStyle = "rgba(40,70,30,0.35)";
        if (gish(tileAt(x, y - 1))) ctx.fillRect(0, 0, T, 4);
        if (gish(tileAt(x, y + 1))) ctx.fillRect(0, T - 4, T, 4);
        if (gish(tileAt(x - 1, y))) ctx.fillRect(0, 0, 4, T);
        if (gish(tileAt(x + 1, y))) ctx.fillRect(T - 4, 0, 4, T);
        break;
      }
      case 3: case 19: { // teal canal water + lily
        const w = 0.5 + Math.sin(S.tileFx / 380 + x * 0.35 + y * 0.25) * 0.5;
        ctx.fillStyle = night ? "#163830" : "#2a7a82";
        ctx.fillRect(0, 0, T, T);
        ctx.fillStyle = night ? "#1c5048" : "#3a98a0";
        ctx.globalAlpha = 0.45 + w * 0.35;
        ctx.fillRect(0, (6 + w * 12) % T, T, 5);
        ctx.globalAlpha = 1;
        ctx.fillStyle = "rgba(180,230,230,0.25)";
        ctx.fillRect(4, (14 + w * 8) % T, 12, 2);
        if (type === 19) {
          ctx.fillStyle = "#3a8c34";
          ctx.beginPath(); ctx.ellipse(16, 17, 11, 7, 0, 0, 6.3); ctx.fill();
          ctx.fillStyle = "#f0e8a0";
          ctx.beginPath(); ctx.arc(16, 16, 3, 0, 6.3); ctx.fill();
        }
        break;
      }
      case 4: { // tan house wall
        ctx.fillStyle = "#d8c4a0"; ctx.fillRect(0, 0, T, T);
        ctx.fillStyle = "#e8d8b8";
        ctx.fillRect(1, 1, T - 2, 14); ctx.fillRect(1, 17, T - 2, 14);
        ctx.strokeStyle = "#c0a878"; ctx.strokeRect(0.5, 0.5, 31, 31);
        ctx.fillStyle = "#c4b090"; ctx.fillRect(0, 15, T, 2);
        break;
      }
      case 5: ctx.fillStyle = "#c9c0a8"; ctx.fillRect(0, 0, T, T);
        ctx.fillStyle = "#d8d0ba"; ctx.fillRect(2, 2, T - 4, T - 4); break;
      case 6:
        if (map() && !map().indoors) {
          ctx.fillStyle = "#3a6a38"; ctx.fillRect(0, 0, T, T);
          ctx.fillStyle = "#2a4a28"; ctx.fillRect(0, 0, T, 6);
          ctx.strokeStyle = "#4a8a44";
          for (let i = 6; i < 32; i += 5) { ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(32, i); ctx.stroke(); }
        } else {
          ctx.fillStyle = "#6a4a28"; ctx.fillRect(0, 0, T, T);
          ctx.strokeStyle = "#8a6a40"; ctx.beginPath(); ctx.moveTo(0, 16); ctx.lineTo(32, 16); ctx.stroke();
        }
        break;
      case 7: { // tree
        ctx.fillStyle = night ? "#1c3c18" : "#3d9c34"; ctx.fillRect(0, 0, T, T);
        ctx.fillStyle = "#6a4428"; ctx.fillRect(13, 20, 6, 12);
        ctx.fillStyle = night ? "#1a4a20" : "#247a2c";
        ctx.beginPath(); ctx.arc(16, 13, 13, 0, 6.3); ctx.fill();
        ctx.fillStyle = night ? "#2a6a30" : "#3da03c";
        ctx.beginPath(); ctx.arc(10, 16, 8, 0, 6.3); ctx.fill();
        ctx.beginPath(); ctx.arc(22, 15, 7, 0, 6.3); ctx.fill();
        break;
      }
      case 8: ctx.fillStyle = "#2a7a82"; ctx.fillRect(0, 0, T, T);
        ctx.fillStyle = "#a07040"; ctx.fillRect(0, 6, T, 20);
        ctx.strokeStyle = "#c49a60";
        for (let i = 4; i < 32; i += 7) { ctx.beginPath(); ctx.moveTo(i, 6); ctx.lineTo(i, 26); ctx.stroke(); }
        break;
      case 9: { // bright green roof
        ctx.fillStyle = "#2a6e30"; ctx.fillRect(0, 0, T, T);
        ctx.fillStyle = "#3d9c3a"; ctx.fillRect(0, 5, T, T - 5);
        ctx.fillStyle = "#1e4e24"; ctx.fillRect(0, 0, T, 5);
        ctx.strokeStyle = "#2e7a32";
        for (let i = 6; i < 32; i += 4) { ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(32, i); ctx.stroke(); }
        ctx.fillStyle = "#8a5a30"; ctx.fillRect(22, 0, 6, 7);
        ctx.fillStyle = "#5a3a18"; ctx.fillRect(23, 0, 4, 2);
        break;
      }
      case 10: { // altar
        ctx.fillStyle = night ? "#1a3320" : "#3d7a3a"; ctx.fillRect(0, 0, T, T);
        ctx.fillStyle = "#e8e4f0"; ctx.fillRect(6, 10, 20, 16);
        ctx.fillStyle = "#d4b46a"; ctx.fillRect(8, 8, 16, 6);
        const g = ctx.createRadialGradient(16, 12, 2, 16, 12, 16);
        g.addColorStop(0, "rgba(180,220,255,0.7)"); g.addColorStop(1, "rgba(180,220,255,0)");
        ctx.fillStyle = g; ctx.fillRect(0, 0, T, T);
        break;
      }
      case 11: { // wooden fence
        ctx.fillStyle = night ? "#1c3c18" : "#3d9c34"; ctx.fillRect(0, 0, T, T);
        ctx.fillStyle = "#c4a070"; ctx.fillRect(4, 10, 24, 5);
        ctx.fillStyle = "#8a6030"; ctx.fillRect(6, 8, 4, 18); ctx.fillRect(22, 8, 4, 18);
        break;
      }
      case 12: { // lamp over cobble
        ctx.fillStyle = "#8a7a64"; ctx.fillRect(0, 0, T, T);
        ctx.fillStyle = "#d2c4a8"; ctx.fillRect(1, 1, 14, 14); ctx.fillRect(16, 16, 15, 15);
        const g = ctx.createRadialGradient(16, 7, 2, 16, 7, 16);
        g.addColorStop(0, "rgba(255,230,140,0.7)"); g.addColorStop(1, "rgba(255,230,140,0)");
        ctx.fillStyle = g; ctx.fillRect(-4, -8, 40, 36);
        ctx.fillStyle = "#2a2420"; ctx.fillRect(14, 12, 4, 18);
        ctx.fillStyle = "#ffe56a";
        ctx.beginPath(); ctx.arc(16, 8, 6, 0, 6.3); ctx.fill();
        ctx.fillStyle = "#fff4c0";
        ctx.beginPath(); ctx.arc(15, 7, 2, 0, 6.3); ctx.fill();
        break;
      }
      case 13: { // brown door on tan wall
        ctx.fillStyle = "#d8c4a0"; ctx.fillRect(0, 0, T, T);
        ctx.fillStyle = "#7a4a24"; ctx.fillRect(6, 2, 20, 28);
        ctx.fillStyle = "#9a6230"; ctx.fillRect(8, 4, 16, 24);
        ctx.fillStyle = "#d4b46a"; ctx.beginPath(); ctx.arc(22, 18, 2, 0, 6.3); ctx.fill();
        break;
      }
      case 14: ctx.fillStyle = "#6a2a3a"; ctx.fillRect(0, 0, T, T);
        ctx.fillStyle = "#8a3a4a"; ctx.fillRect(2, 2, T - 4, T - 4); break;
      case 15: ctx.fillStyle = "#4a4440"; ctx.fillRect(0, 0, T, T);
        ctx.fillStyle = "#6a645c"; ctx.fillRect(4 + j(1) * 8, 6, 12, 10); break;
      case 16: ctx.fillStyle = "#5a5048"; ctx.fillRect(0, 0, T, T);
        ctx.fillStyle = "#3a3834"; ctx.fillRect(j(2) * 20, j(3) * 20, 8, 6); break;
      case 17: ctx.fillStyle = "#6a5a52"; ctx.fillRect(0, 0, T, T);
        ctx.fillStyle = "#8a7a70";
        ctx.beginPath(); ctx.moveTo(0, 32); ctx.lineTo(16, 4); ctx.lineTo(32, 32); ctx.fill(); break;
      case 18: ctx.fillStyle = "#3a4a30"; ctx.fillRect(0, 0, T, T);
        ctx.fillStyle = "#6a3a78"; ctx.globalAlpha = 0.45;
        ctx.fillRect(4, 8, 8, 6); ctx.fillRect(18, 16, 10, 7); ctx.globalAlpha = 1; break;
      case 20: { // round bush
        ctx.fillStyle = night ? "#1c3c18" : "#3d9c34"; ctx.fillRect(0, 0, T, T);
        ctx.fillStyle = night ? "#1e5a24" : "#2e8c30";
        ctx.beginPath(); ctx.arc(16, 18, 13, 0, 6.3); ctx.fill();
        ctx.fillStyle = night ? "#2a6a30" : "#48a840";
        ctx.beginPath(); ctx.arc(16, 14, 10, 0, 6.3); ctx.fill();
        break;
      }
      case 21: ctx.fillStyle = "#4a3020"; ctx.fillRect(0, 0, T, T);
        ctx.strokeStyle = "#2a1810"; ctx.strokeRect(0.5, 0.5, 31, 31); break;
      case 22: ctx.fillStyle = "#c9c0a8"; ctx.fillRect(0, 0, T, T);
        ctx.fillStyle = "#e8e0cc"; ctx.fillRect(10, 0, 12, T);
        ctx.fillStyle = "#d4b46a"; ctx.fillRect(8, 0, 16, 6); break;
      case 23: ctx.fillStyle = "#b0b8c0"; ctx.fillRect(0, 0, T, T);
        ctx.fillStyle = "#d0d6dc"; ctx.fillRect(2, 2, 12, 12); break;
      case 25: ctx.fillStyle = "#6a5a40"; ctx.fillRect(0, 0, T, T);
        ctx.fillStyle = "#8a7a58"; ctx.fillRect(j(2) * 16, j(4) * 16, 10, 8); break;
      case 26: ctx.fillStyle = "#d8d0c8"; ctx.fillRect(0, 0, T, T);
        ctx.strokeStyle = "#b0a8a0"; ctx.strokeRect(0.5, 0.5, 31, 31); break;
      case 27: { // flowers
        ctx.fillStyle = night ? "#1c3c18" : "#3d9c34"; ctx.fillRect(0, 0, T, T);
        ctx.fillStyle = "#52b844"; ctx.fillRect(2, 2, T - 4, T - 4);
        const cols = ["#e070a0", "#e8e070", "#f4ead4", "#80c0e8", "#e09050"];
        for (let i = 0; i < 5; i++) {
          ctx.fillStyle = cols[(s >> (i * 3)) & 7] || cols[0];
          ctx.beginPath(); ctx.arc(6 + ((s >> i) & 18), 8 + ((s >> (i + 2)) & 16), 2.2, 0, 6.3); ctx.fill();
        }
        break;
      }
      case 28: { // statue
        ctx.fillStyle = night ? "#1c3c18" : "#3d9c34"; ctx.fillRect(0, 0, T, T);
        ctx.fillStyle = "#c0c4c8"; ctx.fillRect(8, 22, 16, 8);
        ctx.fillStyle = "#d8dce0"; ctx.fillRect(12, 6, 8, 18);
        ctx.beginPath(); ctx.arc(16, 6, 6, 0, 6.3); ctx.fill();
        ctx.fillStyle = "#d4b46a"; ctx.fillRect(14, 20, 4, 3);
        break;
      }
      case 29: { // crate
        ctx.fillStyle = night ? "#3a3e48" : "#6a6e78"; ctx.fillRect(0, 0, T, T);
        ctx.fillStyle = "#8a5a30"; ctx.fillRect(6, 10, 20, 18);
        ctx.strokeStyle = "#5a3a18"; ctx.strokeRect(6.5, 10.5, 19, 17);
        ctx.fillStyle = "#c49a60"; ctx.fillRect(6, 16, 20, 2);
        break;
      }
      case 30: { // stairs
        ctx.fillStyle = "#6a6e78"; ctx.fillRect(0, 0, T, T);
        ctx.fillStyle = "#8a8490";
        for (let i = 0; i < 4; i++) ctx.fillRect(2, 4 + i * 7, 28, 5);
        ctx.strokeStyle = "#4a4e56";
        for (let i = 0; i < 4; i++) ctx.strokeRect(2.5, 4.5 + i * 7, 27, 5);
        break;
      }
      case 31: { // window on tan wall
        ctx.fillStyle = "#d8c4a0"; ctx.fillRect(0, 0, T, T);
        ctx.fillStyle = "#2a3848"; ctx.fillRect(6, 6, 20, 18);
        ctx.fillStyle = "#7ec8e8"; ctx.globalAlpha = 0.4; ctx.fillRect(8, 8, 16, 14); ctx.globalAlpha = 1;
        ctx.strokeStyle = "#c0a070"; ctx.strokeRect(6.5, 6.5, 19, 17);
        ctx.beginPath(); ctx.moveTo(16, 6); ctx.lineTo(16, 24); ctx.moveTo(6, 15); ctx.lineTo(26, 15); ctx.stroke();
        break;
      }
      case 32: { // deep water
        const w = 0.5 + Math.sin(S.tileFx / 500 + x * 0.3) * 0.5;
        ctx.fillStyle = night ? "#0c1828" : "#143a58"; ctx.fillRect(0, 0, T, T);
        ctx.fillStyle = "#1c5070"; ctx.globalAlpha = 0.4 + w * 0.2;
        ctx.fillRect(0, (12 + w * 8) % T, T, 3); ctx.globalAlpha = 1;
        break;
      }
      case 33: { // bench
        ctx.fillStyle = "#8a7a64"; ctx.fillRect(0, 0, T, T);
        ctx.fillStyle = "#d2c4a8"; ctx.fillRect(1, 1, 14, 14);
        ctx.fillStyle = "#6a4a28"; ctx.fillRect(4, 14, 24, 6);
        ctx.fillStyle = "#4a3020"; ctx.fillRect(4, 20, 4, 8); ctx.fillRect(24, 20, 4, 8);
        break;
      }
      case 34: { // fountain
        ctx.fillStyle = night ? "#3a3e48" : "#6a6e78"; ctx.fillRect(0, 0, T, T);
        ctx.fillStyle = "#8a9098"; ctx.beginPath(); ctx.arc(16, 18, 12, 0, 6.3); ctx.fill();
        ctx.fillStyle = night ? "#1c4a68" : "#3a88b8"; ctx.beginPath(); ctx.arc(16, 16, 8, 0, 6.3); ctx.fill();
        ctx.fillStyle = "#d4b46a"; ctx.fillRect(14, 6, 4, 10);
        ctx.fillStyle = "rgba(180,220,255,0.5)"; ctx.beginPath(); ctx.arc(16, 8, 3, 0, 6.3); ctx.fill();
        break;
      }
      case 35: { // gold inlay
        ctx.fillStyle = "#c9c0a8"; ctx.fillRect(0, 0, T, T);
        ctx.fillStyle = "#d4b46a"; ctx.globalAlpha = 0.55;
        ctx.beginPath(); ctx.moveTo(16, 4); ctx.lineTo(28, 16); ctx.lineTo(16, 28); ctx.lineTo(4, 16); ctx.closePath(); ctx.fill();
        ctx.globalAlpha = 1;
        break;
      }
      case 36: { // stall
        ctx.fillStyle = night ? "#1c3c18" : "#3d9c34"; ctx.fillRect(0, 0, T, T);
        ctx.fillStyle = "#c23b4a"; ctx.fillRect(2, 4, 28, 10);
        ctx.fillStyle = "#f4ead4"; ctx.fillRect(2, 8, 28, 3);
        ctx.fillStyle = "#8a5a30"; ctx.fillRect(4, 14, 24, 12);
        ctx.fillStyle = "#e8c070"; ctx.fillRect(8, 16, 6, 6);
        break;
      }
      case 37: { // dead / corrupt tree
        ctx.fillStyle = night ? "#1a2018" : "#3a4a30"; ctx.fillRect(0, 0, T, T);
        ctx.fillStyle = "#3a2820"; ctx.fillRect(13, 18, 6, 14);
        ctx.fillStyle = "#4a3060";
        ctx.beginPath(); ctx.arc(16, 12, 12, 0, 6.3); ctx.fill();
        ctx.fillStyle = "#6a3a78"; ctx.globalAlpha = 0.5;
        ctx.beginPath(); ctx.arc(10, 14, 7, 0, 6.3); ctx.fill(); ctx.globalAlpha = 1;
        break;
      }
      default: ctx.fillStyle = "#222"; ctx.fillRect(0, 0, T, T);
    }
    ctx.restore();
  }

  function drawChibi(x, y, who, dir, walk, overlay, scale) {
    const ch = DATA.CHARS[who] || { color: "#ccc", accent: "#888" };
    const bob = walk ? Math.sin(S.anim / 80) * 2 : 0;
    const sc = scale || 1;
    ctx.save();
    ctx.translate(x, y + bob);
    ctx.scale(sc, sc);
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.beginPath(); ctx.ellipse(0, 12, 9, 3.5, 0, 0, 6.3); ctx.fill();
    ctx.strokeStyle = "rgba(10,8,16,0.85)";
    ctx.lineWidth = 1.4;
    // body
    ctx.fillStyle = ch.color;
    if (who === "elara") ctx.fillStyle = "#e8eef8";
    if (who === "kael") ctx.fillStyle = "#2a1218";
    if (who === "lyra") ctx.fillStyle = "#6a5030";
    if (who === "thorn") ctx.fillStyle = "#3a4a30";
    ctx.fillRect(-7, -4, 14, 14);
    ctx.strokeStyle = "#1a1020";
    ctx.lineWidth = 1;
    ctx.strokeRect(-7.5, -4.5, 15, 15);
    if (who === "elara") {
      ctx.fillStyle = "#a0c8e0"; ctx.fillRect(-7, 4, 14, 6);
      ctx.fillStyle = "#d4b46a"; ctx.fillRect(-7, -4, 14, 2);
    }
    if (who === "kael") {
      ctx.fillStyle = "#8a1a28"; ctx.fillRect(-7, -4, 14, 5);
      ctx.strokeStyle = "#e04050"; ctx.strokeRect(-6, -2, 12, 8);
    }
    // head
    ctx.fillStyle = "#f0d0b8";
    if (who === "thorn") ctx.fillStyle = "#8a8a84";
    ctx.beginPath(); ctx.arc(0, -12, 8, 0, 6.3); ctx.fill();
    ctx.strokeStyle = "#1a1020"; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(0, -12, 8, 0, 6.3); ctx.stroke();
    // hair
    if (who === "elara") {
      ctx.fillStyle = "#d8e0ec";
      ctx.beginPath(); ctx.arc(0, -14, 8, Math.PI, 0); ctx.fill();
      ctx.fillRect(6, -14, 3, 14); // ponytail
      ctx.fillStyle = "#f0f4ff"; ctx.fillRect(5, -18, 5, 4); // lotus
    } else if (who === "kael") {
      ctx.fillStyle = "#1a0a10";
      ctx.beginPath(); ctx.arc(0, -14, 8, Math.PI, 0); ctx.fill();
      ctx.fillStyle = "#a01828"; ctx.fillRect(-8, -12, 4, 6);
    } else if (who === "lyra") {
      ctx.fillStyle = "#6a3a18";
      ctx.beginPath(); ctx.arc(0, -14, 8, Math.PI, 0); ctx.fill();
    } else if (who === "thorn") {
      ctx.fillStyle = "#2a2a24";
      ctx.beginPath(); ctx.arc(0, -14, 8, Math.PI, 0); ctx.fill();
      ctx.fillStyle = "#4a4a40";
      ctx.fillRect(-7, -20, 3, 6); ctx.fillRect(4, -20, 3, 6);
    }
    // eyes
    ctx.fillStyle = "#1a1020";
    const ex = dir === "left" ? -3 : dir === "right" ? 1 : -2;
    if (dir !== "up") {
      ctx.fillRect(ex, -13, 2, 2); ctx.fillRect(ex + 4, -13, 2, 2);
      if (who === "elara") { ctx.fillStyle = "#7a4aaa"; ctx.fillRect(ex, -13, 2, 2); }
      if (who === "kael") { ctx.fillStyle = "#e03040"; ctx.fillRect(ex, -13, 2, 2); }
    }
    // legs
    ctx.fillStyle = "#2a2030";
    const step = walk ? Math.sin(S.anim / 70) * 3 : 0;
    ctx.fillRect(-5, 10, 4, 6 + step); ctx.fillRect(1, 10, 4, 6 - step);
    if (overlay === "gold") {
      ctx.strokeStyle = "#d4b46a"; ctx.strokeRect(-8, -4, 16, 14);
    }
    ctx.restore();
  }

  function drawMap() {
    const m = map();
    const ox = S.camX, oy = S.camY;
    const x0 = Math.max(0, Math.floor(ox / T) - 1);
    const y0 = Math.max(0, Math.floor(oy / T) - 1);
    const x1 = Math.min(m.w, x0 + Math.ceil(W / T) + 2);
    const y1 = Math.min(m.h, y0 + Math.ceil(H / T) + 2);
    ctx.fillStyle = "#0a0c10";
    ctx.fillRect(0, 0, W, H);
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) paintTile(m.tiles[y][x], x, y, ox, oy);
    // south-facing drop shadows like FF6 / RPG Maker objects
    ctx.fillStyle = "rgba(0,0,0,0.22)";
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const tt = m.tiles[y][x];
        if (tt !== 7 && tt !== 9 && tt !== 4 && tt !== 31 && tt !== 37 && tt !== 12) continue;
        const px = Math.floor(x * T - ox), py = Math.floor(y * T - oy);
        if (tt === 7 || tt === 37) ctx.fillRect(px + 6, py + 26, 20, 8);
        else if (tt === 12) ctx.fillRect(px + 12, py + 28, 8, 5);
        else ctx.fillRect(px + 2, py + 28, 28, 6);
      }
    }
    // events
    for (const ev of m.events) {
      if (!eventVisible(ev)) continue;
      const px = ev.x * T - ox + 16, py = ev.y * T - oy + 16;
      if (ev.type === "chest" && !flagOn(ev.id)) {
        ctx.fillStyle = "#8a5a20"; ctx.fillRect(px - 8, py - 6, 16, 12);
        ctx.fillStyle = "#d4b46a"; ctx.fillRect(px - 2, py - 8, 4, 4);
      }
      if (ev.type === "save") {
        const g = ctx.createRadialGradient(px, py, 2, px, py, 18 + Math.sin(S.anim / 200) * 4);
        g.addColorStop(0, "rgba(180,220,255,0.7)"); g.addColorStop(1, "rgba(180,220,255,0)");
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(px, py, 18, 0, 6.3); ctx.fill();
      }
      if (ev.type === "npc") {
        drawChibi(px, py, ev.id.includes("lyra") ? "lyra" : ev.id === "thorn" ? "thorn" : "npc", "down", false);
        ctx.fillStyle = ev.hue || "#ddd";
        ctx.beginPath(); ctx.arc(px, py - 12, 7, 0, 6.3); ctx.fill();
        ctx.fillStyle = "#1a1020"; ctx.fillRect(px - 3, py - 14, 2, 2); ctx.fillRect(px + 1, py - 14, 2, 2);
      }
      if (ev.type === "encounter") {
        ctx.fillStyle = "rgba(180,40,50,0.35)";
        ctx.beginPath(); ctx.arc(px, py, 16, 0, 6.3); ctx.fill();
        ctx.fillStyle = "#e8c070";
        ctx.font = "10px serif"; ctx.textAlign = "center";
        ctx.fillText(ev.name || "!", px, py - 18);
      }
    }
    // followers then leader
    const party = S.party;
    for (let i = party.length - 1; i >= 1; i--) {
      const idx = Math.max(0, S.trail.length - 1 - i * 12);
      const tr = S.trail[idx] || { x: S.px, y: S.py, dir: S.dir };
      drawChibi(tr.x - ox, tr.y - oy, party[i], tr.dir, S.moving, S.chars[party[i]]?.armor === "veil_first_oath" ? "gold" : null);
    }
    drawChibi(S.px - ox, S.py - oy, party[0], S.dir, S.moving, S.chars.elara?.armor === "veil_first_oath" ? "gold" : null);
    // night veil
    if (!m.indoors) {
      const h = S.time;
      let a = 0;
      if (h < 6) a = 0.45;
      else if (h < 8) a = 0.2;
      else if (h >= 20) a = 0.4;
      else if (h >= 18) a = 0.18;
      if (a) { ctx.fillStyle = `rgba(8,10,28,${a})`; ctx.fillRect(0, 0, W, H); }
    }
  }

  function talkSimple(name, text) {
    startScene({
      id: "_talk", bg: "", mode: "talk", onEnd: { type: "map" },
      script: [{ s: name, t: text }]
    });
  }
  function startTalk(id) {
    const lines = DATA.NPC_TALK[id];
    if (!lines) return;
    startScene({ id: "_t_" + id, bg: "", mode: "talk", onEnd: { type: "map" }, script: lines });
  }

  // ---------------------------------------------------------------------------
  // Visual novel
  // ---------------------------------------------------------------------------
  function startScene(idOrObj) {
    const sc = typeof idOrObj === "string" ? SCENES[idOrObj] : idOrObj;
    if (!sc) return;
    S.vn = {
      def: sc, i: 0, shown: 0, full: "", waiting: false, choices: null, choiceIdx: 0, done: false, autoT: 0
    };
    S.state = "vn";
    hideAllScreens();
    const el = $("screen-vn");
    el.classList.remove("hidden");
    el.classList.toggle("open-vn", sc.mode !== "talk");
    el.classList.toggle("talk", sc.mode === "talk");
    if (sc.mode !== "talk") {
      $("map-hud").classList.add("hidden");
      const bgKey = sc.bg;
      if (bgKey === "temple" && S.images.title) {
        $("vn-cg").style.backgroundImage = `url(${DATA.BGS.title})`;
      } else {
        $("vn-cg").style.backgroundImage = vnGradient(bgKey);
      }
    } else {
      $("map-hud").classList.remove("hidden");
      $("vn-cg").style.backgroundImage = "none";
    }
    if (S.settings.skipDialog) vnSkip();
    else vnAdvance(true);
  }
  function vnGradient(bg) {
    const g = {
      temple: "linear-gradient(180deg,#1a1430,#3a2a48 40%,#1a1830)",
      camp: "linear-gradient(180deg,#0e1220,#1a1830 40%,#2a1a14)",
      forest: "linear-gradient(180deg,#0c1a10,#163020 50%,#0a120c)",
      meridia: "linear-gradient(180deg,#2a3048,#c48a50 55%,#1a2030)",
      forge: "linear-gradient(180deg,#2a1810,#8a4030 60%,#1a0c08)",
      tavern: "linear-gradient(180deg,#2a1a18,#5a3028 50%,#1a1010)",
      pass: "linear-gradient(180deg,#3a3028,#6a5a50 40%,#2a2018)",
      ruins: "linear-gradient(180deg,#1a1018,#3a2030 50%,#10080e)",
      throne: "linear-gradient(180deg,#1a1010,#4a2020 45%,#100808)"
    };
    return g[bg] || g.temple;
  }
  function condOk(line) {
    if (!line.cond) return true;
    return Object.entries(line.cond).every(([k, v]) => {
      const cur = S.flags[k];
      if (v === 0 || v === false) return !cur;
      return cur === v || !!cur === !!v;
    });
  }
  function vnApplySet(set) {
    if (!set) return;
    for (const [k, v] of Object.entries(set)) setFlag(k, v);
  }
  function vnFindLabel(lab) {
    return S.vn.def.script.findIndex((l) => l.label === lab);
  }
  function vnAdvance(first) {
    const vn = S.vn;
    if (!vn) return;
    if (!first && vn.shown < vn.full.length) { vn.shown = vn.full.length; renderVnText(); return; }
    if (vn.choices) return;
    stopSpeech();
    while (vn.i < vn.def.script.length) {
      const line = vn.def.script[vn.i];
      vn.i++;
      if (line.goto) { vn.i = vnFindLabel(line.goto); continue; }
      if (line.set && !line.t && !line.choices) { vnApplySet(line.set); continue; }
      if (line.cond && !condOk(line)) continue;
      if (line.label && !line.t && !line.choices) continue;
      if (line.choices) {
        vn.choices = line.choices; vn.choiceIdx = 0; vn.waiting = true; vn.full = ""; vn.shown = 0;
        renderVn(line); return;
      }
      vnApplySet(line.set);
      vn.full = line.t || "";
      vn.shown = 0;
      vn.waiting = false;
      vn.speechDone = false;
      vn.line = line;
      renderVn(line);
      speakLine(line.s || "", line.t || "");
      return;
    }
    endScene();
  }
  function vnSkip() {
    const vn = S.vn;
    if (!vn) return;
    if (vn.choices) return;
    stopSpeech();
    let guard = 0;
    while (vn.i < vn.def.script.length && guard++ < 500) {
      const line = vn.def.script[vn.i];
      vn.i++;
      if (!line) continue;
      if (line.goto) { vn.i = vnFindLabel(line.goto); continue; }
      if (line.cond && !condOk(line)) continue;
      if (line.label && !line.t && !line.choices && !line.set) continue;
      if (line.set) vnApplySet(line.set);
      if (line.choices) {
        vn.choices = line.choices;
        vn.choiceIdx = 0;
        vn.waiting = true;
        vn.full = "";
        vn.shown = 0;
        vn.line = line;
        renderVn(line);
        sfx("ui");
        return;
      }
    }
    endScene();
  }
  function renderVn(line) {
    const vn = S.vn;
    const left = $("vn-left"), right = $("vn-right");
    const sp = (line && line.s) || "";
    $("vn-name").textContent = speakerName(sp);
    left.classList.remove("show", "dim", "blush");
    right.classList.remove("show", "dim", "blush");
    left.style.transform = "";
    const talk = vn.def.mode === "talk";
    $("screen-vn").classList.toggle("no-portrait", talk && sp !== "elara" && sp !== "kael" && sp !== "shade");
    if (sp === "elara" && S.images.elara) {
      left.src = DATA.PORTRAITS.elara.neutral;
      left.classList.add("show");
      if (line.e === "blush") left.classList.add("blush");
      if (!talk && S.images.kael) { right.src = DATA.PORTRAITS.kael.smirk; right.classList.add("show", "dim"); }
    } else if ((sp === "kael" || sp === "shade") && S.images.kael) {
      if (talk) {
        left.src = DATA.PORTRAITS.kael.smirk;
        left.classList.add("show");
        left.style.transform = "none";
      } else {
        right.src = DATA.PORTRAITS.kael.smirk;
        right.classList.add("show");
        if (S.images.elara) { left.src = DATA.PORTRAITS.elara.neutral; left.classList.add("show", "dim"); }
      }
    } else if (!talk) {
      if (S.images.elara) {
        left.src = DATA.PORTRAITS.elara.neutral; left.classList.add("show");
        if (sp !== "elara") left.classList.add("dim");
      }
      if (S.images.kael) {
        right.src = DATA.PORTRAITS.kael.smirk; right.classList.add("show");
        if (sp !== "kael" && sp !== "shade") right.classList.add("dim");
      }
    }
    renderVnText();
    const box = $("vn-choices");
    box.innerHTML = "";
    if (vn.choices) {
      vn.choices.forEach((c, i) => {
        const b = document.createElement("button");
        b.textContent = (i + 1) + ". " + c.t;
        b.className = i === vn.choiceIdx ? "on" : "";
        b.addEventListener("click", () => { vn.choiceIdx = i; pickChoice(); });
        box.appendChild(b);
      });
      $("vn-next").style.display = "none";
      $("vn-skip").classList.add("hidden");
      $("screen-vn").classList.add("choosing");
    } else {
      $("vn-next").style.display = "";
      $("vn-skip").classList.remove("hidden");
      $("screen-vn").classList.remove("choosing");
    }
  }
  function speakerName(sp) {
    if (!sp) return "";
    if (sp === "shade") return "The Unbetrayed";
    if (DATA.CHARS[sp]) return DATA.CHARS[sp].name;
    const names = { suyin: "Abbess Suyin", shen: "Master Shen", lyra: "Lyra", thorn: "Thorn",
      bard: "Bard", korin: "Korin", sera: "Sera", keeper: "Lantern Keeper", jori: "Jori",
      mira: "Mira", hana: "Hana", wen: "Old Wen", ren: "Acolyte Ren", echo: "Court Echo",
      fisherman: "Canal Fisher", captain: "Watch-Captain", granny: "Market Granny",
      monk: "Night Monk", pilgrim: "Pilgrim", baker: "Baker", florist: "Florist",
      boatman: "Boatman", kid2: "Lantern Kid", guard: "Guard", narration: "" };
    return names[sp] || sp;
  }
  function renderVnText() {
    const vn = S.vn;
    $("vn-text").textContent = (vn.full || "").slice(0, vn.shown);
  }
  function pickChoice() {
    const vn = S.vn;
    const c = vn.choices[vn.choiceIdx];
    vnApplySet(c.set);
    vn.choices = null;
    if (c.goto) vn.i = vnFindLabel(c.goto);
    sfx("ok");
    if (S.settings.skipDialog) vnSkip();
    else vnAdvance(true);
  }
  function updateVn(dt) {
    const vn = S.vn;
    if (!vn) return;
    if (vn.choices) {
      if (pressed("up")) vn.choiceIdx = (vn.choiceIdx + vn.choices.length - 1) % vn.choices.length;
      if (pressed("down")) vn.choiceIdx = (vn.choiceIdx + 1) % vn.choices.length;
      if (pressed("ok")) pickChoice();
      [...$("vn-choices").children].forEach((b, i) => b.classList.toggle("on", i === vn.choiceIdx));
      pressed("skip");
      return;
    }
    const spd = S.settings.textSpeed === 9 ? 999 : S.settings.textSpeed * 0.055;
    vn.shown = Math.min(vn.full.length, vn.shown + dt * spd);
    renderVnText();
    if (S.settings.auto && vn.shown >= vn.full.length) {
      const voiceHold = S.settings.voice && speechOk() && !vn.speechDone && !!vn.full;
      vn.autoT += dt;
      if (!voiceHold && vn.autoT > 900) { vn.autoT = 0; vnAdvance(); }
    }
    if (pressed("skip")) { vnSkip(); return; }
    if (pressed("ok") || pressed("cancel")) { vnAdvance(); sfx("ui"); }
  }
  function endScene() {
    stopSpeech();
    const sc = S.vn.def;
    S.vn = null;
    const end = sc.onEnd || { type: "map" };
    if (end.type === "map") {
      if (end.map) {
        S.mapId = end.map;
        const m = MAPS[end.map];
        const x = end.x ?? m.spawn.x, y = end.y ?? m.spawn.y;
        S.px = (x + 0.5) * T; S.py = (y + 0.5) * T;
      }
      enterMap();
    } else if (end.type === "credits") {
      hideAllScreens();
      $("screen-credits").classList.remove("hidden");
      S.state = "credits";
    } else if (end.type === "choice_then_battle") {
      startBattle("mirror_shade");
    }
  }

  // ---------------------------------------------------------------------------
  // Battle — LinaHua's loop
  // ---------------------------------------------------------------------------
  function startBattle(id) {
    const def = DATA.BATTLES[id];
    if (!def) return;
    S.lastBattle = id;
    const pals = S.party.map((pid) => {
      const c = S.chars[pid];
      return Object.assign({}, c, {
        charging: 0, chargeSkill: null, chargeTarget: null, gassed: 0,
        shield: 0, empowered: 0, mocked: 0, marked: 0, evade: 0, defUp: 0,
        taunt: 0, bleed: 0, stun: 0, meditating: false, vulnerable: false,
        side: "p", alive: c.hp > 0
      });
    });
    const foes = def.enemies.map((eid, i) => {
      const e = DATA.ENEMIES[eid];
      return {
        id: eid + "_" + i, tid: eid, name: e.name, maxHp: e.maxHp, hp: e.maxHp,
        maxRes: 99, res: 99, atk: e.atk, def: e.def, spd: e.spd, acc: e.acc,
        color: e.color, boss: !!e.boss, ai: e.ai || "basic",
        charging: 0, chargeSkill: null, gassed: 0, shield: 0, empowered: 0,
        mocked: 0, marked: 0, evade: 0, defUp: 0, taunt: 0, bleed: 0, stun: 0,
        berserk: 0, phase: 1, telegraph: null, turnN: 0, side: "e", alive: true,
        intro: e.intro
      };
    });
    S.battle = {
      id, def, pals, foes, log: [], queue: [], qi: 0, phase: "intro",
      menu: "cmd", cmdIdx: 0, skillList: [], targetList: [],
      wait: 700, actor: null, empoweredThisFight: new Set(),
      unsealedHere: false
    };
    S.state = "battle";
    hideAllScreens();
    $("battle-hud").classList.remove("hidden");
    playMusic("battle");
    const intro = foes[0].intro || "Enemies draw near.";
    blog(intro);
    if (def.tutorial) maybeTutorial(def.tutorial);
    rebuildBattleQueue();
    S.battle.wait = 600 / S.settings.battleSpeed;
    renderBattleHUD();
  }
  function maybeTutorial(id) {
    if (S.tutorialsSeen[id]) return;
    S.tutorialsSeen[id] = 1;
    const text = {
      basic: { h: "Battle", p: "Turns are slow on purpose. Attack is rarely the whole plan. Watch the log. Z confirms, X backs out." },
      boss1: { h: "The Heart of the Design", p: "Elara spends Mana to Shield, Heal, or Empower. Meditate restores Mana but takes her turn and leaves her vulnerable. At full Mana she can Break the High Seal: Kael goes Apeshit Berserk for 4 turns, then Elara is Gassed (cannot act) for 2. Many skills CHARGE (empty turns first) or GAS you afterward. The Hollow Oak telegraphs a root slam — Ward Elara before it lands. Empower Kael, then let him charge Hellcoil." },
      mark: { h: "Marks", p: "Lyra's Detect Weakness makes the next hits count. Interrupt telegraphs with Scout's Mercy if you earned it." },
      setup: { h: "Multi-step setup", p: "The Warden only drops its stance after two different allies have been Empowered this fight, and a charged skill connects. Do not spam. Build." },
      unseal_choice: { h: "The cost you chose", p: "If you unsealed Kael, spend the font and survive Elara's Gassed turns. If you kept the seal, Meditate, mark, and out-arithmetic the mirror." }
    }[id];
    if (!text) return;
    const el = $("battle-tutorial");
    el.classList.remove("hidden");
    el.innerHTML = `<h3>${text.h}</h3><p>${text.p}</p><p style="margin-top:8px;color:var(--gold)">Press Z to continue.</p>`;
    S.battle.phase = "tutorial";
  }
  function blog(s) {
    S.battle.log.unshift(s);
    S.battle.log = S.battle.log.slice(0, 4);
    $("battle-log").innerHTML = S.battle.log.map((l, i) => `<div style="opacity:${1 - i * 0.22}">${l}</div>`).join("");
  }
  function rebuildBattleQueue() {
    const b = S.battle;
    const all = [...b.pals, ...b.foes].filter((x) => x.alive);
    all.sort((a, c) => c.spd - a.spd || (a.side === "p" ? -1 : 1));
    b.queue = all;
    b.qi = 0;
  }
  function aliveP() { return S.battle.pals.filter((p) => p.alive); }
  function aliveE() { return S.battle.foes.filter((p) => p.alive); }
  function nextActor() {
    const b = S.battle;
    if (!aliveP().length) { loseBattle(); return; }
    if (!aliveE().length) { winBattle(); return; }
    // extra berserk action: Kael acts twice
    if (b._extraKael) { b._extraKael = false; }
    let guard = 0;
    while (guard++ < 24) {
      if (b.qi >= b.queue.length) rebuildBattleQueue();
      const a = b.queue[b.qi++];
      if (!a || !a.alive) continue;
      tickBattler(a);
      if (!a.alive) continue;
      if (a.stun > 0) { a.stun--; blog(`${a.name} is stunned.`); continue; }
      if (a.charging > 0) {
        a.charging--;
        if (a.charging === 0 && a.chargeSkill) {
          blog(`${a.name} unleashes ${DATA.SKILLS[a.chargeSkill].name}!`);
          resolveSkill(a, DATA.SKILLS[a.chargeSkill], a.chargeTarget);
          a.chargeSkill = null; a.chargeTarget = null;
          afterAct(a);
        } else blog(`${a.name} is charging… (${a.charging} turn${a.charging === 1 ? "" : "s"})`);
        b.wait = 700 / S.settings.battleSpeed; b.phase = "wait"; b.actor = a;
        renderBattleHUD(); return;
      }
      if (a.gassed > 0) {
        a.gassed--;
        blog(`${a.name} is Gassed and cannot act. (${a.gassed} remaining)`);
        b.wait = 650 / S.settings.battleSpeed; b.phase = "wait"; b.actor = a;
        renderBattleHUD(); return;
      }
      if (a.meditating) {
        const amt = a._medAmt || 44;
        a.res = Math.min(a.maxRes, a.res + amt);
        a.meditating = false; a.vulnerable = false;
        blog(`${a.name} completes her meditation. Mana ${a.res}/${a.maxRes}.`);
        emit("petal", 280, 420, 18);
        sfx("heal");
        b.wait = 700 / S.settings.battleSpeed; b.phase = "wait"; b.actor = a;
        renderBattleHUD(); return;
      }
      b.actor = a;
      if (a.side === "p") {
        b.phase = "cmd"; b.menu = "cmd"; b.cmdIdx = 0;
        renderBattleHUD();
        return;
      } else {
        enemyTurn(a);
        return;
      }
    }
  }
  function tickBattler(a) {
    if (a.bleed > 0) { a.bleed--; damage(a, 8, "bleed"); }
    if (a.mocked > 0) a.mocked--;
    if (a.marked > 0) a.marked--;
    if (a.empowered > 0) a.empowered--;
    if (a.evade > 0) a.evade--;
    if (a.defUp > 0) a.defUp--;
    if (a.taunt > 0) a.taunt--;
    if (a.berserk > 0) {
      a.berserk--;
      if (a.berserk === 0 && a.id === "kael") {
        blog("The High Seal reasserts. Kael's fire folds back into the brands.");
        a.unsealCd = 6;
      }
    }
    if (a.unsealCd > 0) a.unsealCd--;
    if (a._vulnTurns > 0) { a._vulnTurns--; if (!a._vulnTurns) a.vulnerable = false; }
    a.vulnerable = a.vulnerable || !!a.meditating || a.charging > 0;
    if (a.id === "elara" && DATA.ITEMS[a.accessory]?.manaRegen && a.side === "p") {
      a.res = Math.min(a.maxRes, a.res + DATA.ITEMS[a.accessory].manaRegen);
    }
  }
  function afterAct(a) {
    if (a.id === "kael" && a.berserk > 0 && !S.battle._didExtra) {
      S.battle._didExtra = true;
      S.battle.qi = Math.max(0, S.battle.qi - 1);
      blog("Berserk: Kael takes an extra action.");
    } else S.battle._didExtra = false;
    if (a.tid && a.boss) checkPhase(a);
  }
  function checkPhase(e) {
    const pct = e.hp / e.maxHp;
    if (e.ai === "hollow_oak" && pct <= 0.5 && e.phase === 1) {
      e.phase = 2; e.def = Math.max(4, e.def - 8);
      blog("The heartwood cracks. It is vulnerable — for now.");
    }
    if (e.ai === "warden" && pct <= 0.66 && e.phase === 1) {
      e.phase = 2; blog("The Warden's stance deepens. Empower two different allies, then land a charged blow.");
    }
    if (e.ai === "warden" && pct <= 0.33 && e.phase === 2) {
      e.phase = 3; blog("The gate remembers fire. Stand together or burn apart.");
    }
  }

  function cmdsFor(a) {
    const list = [{ id: "attack", name: "Attack" }, { id: "skill", name: "Skill" }, { id: "item", name: "Item" }, { id: "defend", name: "Defend" }];
    return list;
  }
  function renderBattleHUD() {
    const b = S.battle; if (!b) return;
    const isCmd = b.phase === "cmd" && b.actor && b.actor.side === "p";

    // Party status cards
    $("battle-party").innerHTML = b.pals.map((p) => {
      const hp = Math.max(0, p.hp / p.maxHp * 100);
      const rs = Math.max(0, p.res / p.maxRes * 100);
      const tags = [];
      if (p.charging) tags.push("CHARGING " + p.charging);
      if (p.gassed) tags.push("GASSED " + p.gassed);
      if (p.meditating) tags.push("MEDITATING");
      if (p.berserk) tags.push("BERSERK " + p.berserk);
      if (p.shield) tags.push("WARD " + p.shield);
      if (p.empowered) tags.push("EMPOWERED");
      if (!p.alive) tags.push("DOWN");
      const rk = p.resKey || "res";
      const isActive = b.actor && b.actor.id === p.id;
      return `<div class="battler-card${isActive ? " active-hero" : ""}">
        <div class="nm">${p.name} <span class="tag">${tags.join(" · ")}</span></div>
        <div class="bar-label"><span>HP</span><span>${Math.max(0, p.hp|0)}/${p.maxHp}</span></div>
        <div class="bar hp"><i style="width:${hp}%"></i></div>
        <div class="bar-label"><span>${p.resName}</span><span>${p.res|0}/${p.maxRes}</span></div>
        <div class="bar ${rk}"><i style="width:${rs}%"></i></div>
      </div>`;
    }).join("");

    // Hero selector tabs
    const heroSel = $("battle-hero-select");
    heroSel.innerHTML = b.pals.map((p) => {
      const isActive = b.actor && b.actor.id === p.id;
      const dead = !p.alive;
      return `<button class="hero-tab${isActive ? " active" : ""}${dead ? " dead" : ""}" data-hero="${p.id}" title="${p.name}${dead ? " (down)" : ""}">
        ${p.name}
      </button>`;
    }).join("");
    heroSel.querySelectorAll(".hero-tab:not(.dead)").forEach((btn) => {
      btn.addEventListener("click", () => selectHero(btn.dataset.hero));
    });

    // Action bar — always show skills for the active player hero (or first alive pal if no cmd phase)
    const barHero = (isCmd ? b.actor : (b.pals.find((p) => p.alive) || b.pals[0]));
    const actionBar = $("battle-action-bar");
    if (barHero) {
      const skills = skillsOf(S.chars[barHero.id] || barHero);
      actionBar.innerHTML = skills.map((sid) => {
        const sk = DATA.SKILLS[sid];
        if (!sk) return "";
        const locked = !isCmd
          || (sk.berserkOnly && !barHero.berserk)
          || (sk.requireFull && barHero.res < barHero.maxRes)
          || (sk.cost === "all" ? false : barHero.res < (sk.cost || 0))
          || (sid === "unseal" && (S.chars.kael?.unsealCd > 0 || barHero.unsealCd > 0));
        const costTxt = sk.cost === "all" ? "ALL" : (sk.cost ? sk.cost + " " + (barHero.resName || "") : "");
        return `<button class="action-btn${locked ? " locked" : ""}" data-skill="${sid}" title="${sk.desc || sk.name}">
          <span class="ab-name">${sk.name}</span>
          ${costTxt ? `<span class="ab-cost">${costTxt}</span>` : ""}
        </button>`;
      }).join("");
      if (isCmd) {
        actionBar.querySelectorAll(".action-btn:not(.locked)").forEach((btn) => {
          btn.addEventListener("click", () => quickSkill(btn.dataset.skill));
        });
      }
    } else {
      actionBar.innerHTML = "";
    }

    const menu = $("battle-cmds");
    const who = $("battle-who");
    if (!isCmd) {
      who.textContent = b.actor ? b.actor.name : "";
      menu.innerHTML = "";
      $("battle-menu").style.opacity = b.phase === "cmd" ? 1 : 0.45;
      return;
    }
    $("battle-menu").style.opacity = 1;
    who.textContent = b.actor.name;
    let items = [];
    if (b.menu === "cmd") items = cmdsFor(b.actor).map((c) => ({ id: c.id, name: c.name }));
    if (b.menu === "skill") {
      items = skillsOf(S.chars[b.actor.id] || b.actor).map((sid) => {
        const sk = DATA.SKILLS[sid];
        const lock = (sk.berserkOnly && !b.actor.berserk) || (sk.requireFull && b.actor.res < b.actor.maxRes)
          || (sk.cost === "all" ? false : b.actor.res < (sk.cost || 0))
          || (sid === "unseal" && (S.chars.kael?.unsealCd > 0 || b.actor.unsealCd > 0 || !S.battle.pals.find(p => p.id === "kael" && p.alive)));
        const cost = sk.cost === "all" ? "ALL" : (sk.cost ? sk.cost + " " + (b.actor.resName || "") : "");
        const extra = [];
        if (sk.charge) extra.push(`charge ${sk.charge}`);
        if (sk.gassed) extra.push(`gassed ${sk.gassed}`);
        return { id: sid, name: sk.name, cost, lock, title: sk.desc + (extra.length ? " [" + extra.join(", ") + "]" : "") };
      });
      items.push({ id: "_back", name: "Back" });
    }
    if (b.menu === "item") {
      items = S.inventory.map((id, idx) => {
        const it = DATA.ITEMS[id];
        if (!it || it.type !== "consumable") return null;
        return { id: "item:" + idx, name: `${it.name} (${it._uses ?? it.uses})`, lock: (it._uses ?? it.uses) <= 0 };
      }).filter(Boolean);
      items.push({ id: "_back", name: "Back" });
    }
    if (b.menu === "target") {
      items = b.targetList.map((t) => ({ id: "t:" + t._i, name: t.name + (t.side === "e" ? `  ${t.hp|0}/${t.maxHp}` : "") }));
      items.push({ id: "_back", name: "Back" });
    }
    b._items = items;
    menu.innerHTML = items.map((it, i) =>
      `<button class="${i === b.cmdIdx ? "on" : ""} ${it.lock ? "locked" : ""}" data-i="${i}">
        ${it.name}${it.cost ? `<span class="cost">${it.cost}</span>` : ""}
      </button>`).join("");
    menu.querySelectorAll("button").forEach((btn) => {
      btn.addEventListener("click", () => { b.cmdIdx = +btn.dataset.i; confirmCmd(); });
    });
  }
  function selectHero(id) {
    const b = S.battle;
    if (!b || b.phase !== "cmd") return;
    const pal = b.pals.find((p) => p.id === id && p.alive);
    if (!pal) return;
    b.actor = pal;
    b.menu = "cmd"; b.cmdIdx = 0;
    sfx("ok");
    renderBattleHUD();
  }
  function quickSkill(sid) {
    const b = S.battle;
    if (!b || b.phase !== "cmd" || !b.actor || b.actor.side !== "p") return;
    const sk = DATA.SKILLS[sid];
    if (!sk) return;
    b.menu = "skill";
    // find index in skill list so confirmCmd works correctly
    const skills = skillsOf(S.chars[b.actor.id] || b.actor);
    const idx = skills.indexOf(sid);
    b._items = skills.map((s2, i) => {
      const sk2 = DATA.SKILLS[s2];
      const lock = (sk2.berserkOnly && !b.actor.berserk) || (sk2.requireFull && b.actor.res < b.actor.maxRes)
        || (sk2.cost === "all" ? false : b.actor.res < (sk2.cost || 0))
        || (s2 === "unseal" && (S.chars.kael?.unsealCd > 0 || b.actor.unsealCd > 0));
      const cost = sk2.cost === "all" ? "ALL" : (sk2.cost ? sk2.cost + " " + (b.actor.resName || "") : "");
      return { id: s2, name: sk2.name, cost, lock };
    });
    b._items.push({ id: "_back", name: "Back" });
    b.cmdIdx = idx >= 0 ? idx : 0;
    sfx("ok");
    confirmCmd();
  }
  function confirmCmd() {
    const b = S.battle, a = b.actor, it = b._items[b.cmdIdx];
    if (!it || it.lock) { sfx("cancel"); return; }
    sfx("ok");
    if (it.id === "_back") {
      b.menu = b.menu === "target" ? (b._from || "cmd") : "cmd";
      b.cmdIdx = 0; renderBattleHUD(); return;
    }
    if (b.menu === "cmd") {
      if (it.id === "attack") return pickTarget("enemy", { id: "attack" });
      if (it.id === "defend") { defend(a); finishPlayer(); return; }
      if (it.id === "skill") { b.menu = "skill"; b.cmdIdx = 0; renderBattleHUD(); return; }
      if (it.id === "item") { b.menu = "item"; b.cmdIdx = 0; renderBattleHUD(); return; }
    }
    if (b.menu === "skill") {
      const sk = DATA.SKILLS[it.id];
      b._skill = sk;
      if (sk.target === "self" || sk.unseal || sk.meditate) { useSkill(a, sk, a); finishPlayer(); return; }
      if (sk.target === "allies" || sk.target === "enemies") { useSkill(a, sk, null); finishPlayer(); return; }
      b._from = "skill";
      pickTarget(sk.target === "ally" ? "ally" : "enemy", sk);
      return;
    }
    if (b.menu === "item") {
      const idx = +it.id.split(":")[1];
      b._itemIdx = idx;
      pickTarget("ally", { item: true });
      return;
    }
    if (b.menu === "target") {
      const t = b.targetList[b.cmdIdx];
      if (b._itemIdx != null) { useItem(b._itemIdx, t); b._itemIdx = null; finishPlayer(); return; }
      useSkill(a, b._skill || DATA.SKILLS.attack, t);
      finishPlayer();
    }
  }
  function pickTarget(kind, sk) {
    const b = S.battle;
    b.menu = "target"; b.cmdIdx = 0; b._skill = sk;
    b.targetList = (kind === "ally" ? aliveP() : aliveE()).map((t, i) => Object.assign(t, { _i: i }));
    if (!b.targetList.length) { toast("No target."); return; }
    renderBattleHUD();
  }
  function finishPlayer() {
    afterAct(S.battle.actor);
    S.battle.phase = "wait";
    S.battle.wait = 700 / S.settings.battleSpeed;
    renderBattleHUD();
  }
  function defend(a) {
    a.defUp = Math.max(a.defUp, 1);
    a.res = Math.min(a.maxRes, a.res + 6);
    blog(`${a.name} defends. A little resource returns.`);
  }
  function useItem(idx, t) {
    const id = S.inventory[idx];
    const it = DATA.ITEMS[id];
    if (!it) return;
    it._uses = (it._uses ?? it.uses) - 1;
    if (it.heal) { t.hp = Math.min(t.maxHp, t.hp + it.heal); blog(`${it.name} restores ${it.heal} HP to ${t.name}.`); sfx("heal"); emit("heal", 300, 400, 10); }
    if (it.res) {
      const el = S.battle.pals.find((p) => p.id === "elara");
      if (el) { el.res = Math.min(el.maxRes, el.res + it.res); blog(`Mana +${it.res}.`); }
    }
    if (it.ungassed) {
      t.gassed = Math.max(0, t.gassed - 1);
      blog(`${t.name}'s Gassed shortens.`);
    }
    if (it._uses <= 0) toast(`${it.name} is spent.`);
  }
  function useSkill(user, sk, target) {
    if (!sk) return;
    if (sk.id === "attack") sk = DATA.SKILLS.attack;
    const cost = sk.cost === "all" ? user.res : (sk.cost || 0);
    if (sk.requireFull && user.res < user.maxRes) { blog("The font is not full."); return; }
    if (sk.berserkOnly && !user.berserk) { blog("The Seal forbids it."); return; }
    if (typeof cost === "number" && user.res < cost) { blog("Not enough resource."); return; }
    if (sk.charge && !user._releasing) {
      if (sk.cost === "all") user.res = 0;
      else user.res -= cost;
      user.charging = sk.charge;
      user.chargeSkill = sk.id;
      user.chargeTarget = target;
      user._releasing = false;
      blog(`${user.name} begins charging ${sk.name}. Vulnerable.`);
      return;
    }
    if (sk.cost === "all") user.res = 0;
    else if (cost) user.res = Math.max(0, user.res - cost);
    resolveSkill(user, sk, target);
    if (sk.gassed) user.gassed += sk.gassed;
  }
  function resolveSkill(user, sk, target) {
    sfx(sk.fx === "heal" || sk.fx === "petal" ? "heal" : sk.fx === "unseal" ? "unseal" : "hit");
    const origin = user.side === "p" ? { x: 280, y: 400 } : { x: 900, y: 280 };
    emit(sk.fx || "hit", origin.x, origin.y, 12);
    if (sk.meditate) {
      user.res = Math.min(user.maxRes, user.res + sk.meditate);
      user.vulnerable = true;
      user._vulnTurns = 1;
      blog(`${user.name} meditates (+${sk.meditate} Mana) and is completely vulnerable until her next turn. Cover her.`);
      emit("petal", origin.x, origin.y, 18);
      return;
    }
    if (sk.unseal) {
      const kael = S.battle.pals.find((p) => p.id === "kael");
      if (!kael || !kael.alive) { blog("Kael is not here to unseal."); return; }
      kael.berserk = sk.berserkTurns || 4;
      user.gassed += sk.selfGassed || 2;
      S.flags.unsealed_once = 1;
      S.battle.unsealedHere = true;
      S.shake = 14;
      blog("Elara spends the entire font. The High Seal cracks. Kael goes apeshit.");
      emit("unseal", 640, 320, 40);
      return;
    }
    const targets = [];
    if (sk.target === "enemies" || sk.aoe) targets.push(...aliveE());
    else if (sk.target === "allies") targets.push(...aliveP());
    else if (target) targets.push(target);
    if (sk.shield) { target.shield += sk.shield; blog(`Lotus Ward wraps ${target.name} (${sk.shield}).`); return; }
    if (sk.shieldAll) { aliveP().forEach((p) => p.shield += sk.shieldAll); blog(`Last Wall. The party is a door.`); return; }
    if (sk.heal && sk.target === "allies") {
      aliveP().forEach((p) => { p.hp = Math.min(p.maxHp, p.hp + sk.heal); floatTxt(p, "+" + sk.heal, "#7bc47b"); });
      blog(`${sk.name} mends the party.`); return;
    }
    if (sk.heal) { target.hp = Math.min(target.maxHp, target.hp + sk.heal); floatTxt(target, "+" + sk.heal, "#7bc47b"); blog(`${sk.name} restores ${sk.heal} HP.`); return; }
    if (sk.empower) {
      target.empowered = Math.max(target.empowered, 2);
      S.battle.empoweredThisFight.add(target.id);
      blog(`${target.name} is blessed. Their next blows will mean it.`);
      return;
    }
    if (sk.mock) { target.mocked = sk.mock; blog(`${user.name}: a poisoned word. ${target.name}'s accuracy falters.`); return; }
    if (sk.mark && !sk.power) { target.marked = 3; blog(`${target.name} is marked.`); return; }
    if (sk.taunt) { user.taunt = sk.taunt; user.defUp = Math.max(user.defUp, sk.defUp || 0); blog(`${user.name} becomes the door.`); return; }
    if (sk.evade) { aliveP().forEach((p) => p.evade = Math.max(p.evade, sk.evade)); blog("Smoke. The party is rumor."); return; }
    // damage
    for (const t of targets) {
      let pow = sk.power || 10;
      let atk = user.atk;
      if (user.berserk) atk *= 2.15;
      if (user.empowered) { atk *= 1.55; pow += 4; user.empowered = 0; }
      let def = t.def + (t.defUp ? 8 : 0);
      if (sk.pierce) def *= (1 - sk.pierce);
      if (t.marked) { atk *= 1.25; }
      if (t.vulnerable || t.charging || t.meditating) atk *= 1.25;
      let dmg = Math.max(1, Math.round(atk * pow / 10 - def * 0.45 + irnd(-2, 3)));
      if (sk.selfDamage) { damage(user, sk.selfDamage, "self"); }
      const acc = user.acc - (user.mocked ? 18 : 0) + (DATA.ITEMS[user.accessory]?.acc || 0);
      const evade = (t.evade ? 25 : 0);
      if (Math.random() * 100 > acc - evade) { blog(`${user.name} misses ${t.name}.`); floatTxt(t, "miss", "#aaa"); continue; }
      if (sk.interrupt && t.telegraph) { t.telegraph = null; blog(`${sk.name} interrupts the telegraph!`); dmg = Math.round(dmg * 1.2); }
      if (sk.stun && Math.random() < sk.stun) { t.stun = 1; blog(`${t.name} is bound.`); }
      if (sk.bleed) t.bleed = sk.bleed;
      if (sk.mark) t.marked = 3;
      damage(t, dmg, "hit");
      if (user.id === "kael" && DATA.ITEMS[user.accessory]?.furyOnHit) {
        user.res = Math.min(user.maxRes, user.res + DATA.ITEMS[user.accessory].furyOnHit);
      }
      // warden stance break
      if (t.ai === "warden" && t.phase === 2 && sk.charge >= 1 && S.battle.empoweredThisFight.size >= 2) {
        t.def = Math.max(6, t.def - 10);
        blog("The stance breaks. Two blessings and a charged blow — the door remembers it was a man.");
        t.phase = 2.5;
      }
    }
  }
  function posOf(b) {
    if (b.side === "p") {
      const i = S.battle.pals.indexOf(b);
      return { x: 220 + (i % 2) * 90, y: 300 + Math.floor(i / 2) * 90 };
    }
    const i = S.battle.foes.indexOf(b);
    return { x: 860 + (i % 2) * 110, y: 240 + Math.floor(i / 2) * 110 };
  }
  function damage(t, n, why) {
    if (t.shield > 0) {
      const use = Math.min(t.shield, n);
      t.shield -= use; n -= use;
      if (n <= 0) { blog(`The Ward absorbs the blow.`); floatTxt(t, "ward", "#7eb8d4"); return; }
    }
    t.hp -= n;
    floatTxt(t, "−" + n, why === "heal" ? "#7bc47b" : "#e07080");
    S.shake = Math.min(12, S.shake + (n > 40 ? 8 : 4));
    if (t.hp <= 0) {
      t.hp = 0; t.alive = false;
      blog(`${t.name} falls.`);
      sfx("hurt");
    }
  }
  function floatTxt(t, text, color) {
    const p = posOf(t);
    S.dmgNums.push({ x: p.x, y: p.y - 20, text, color, life: 800 });
  }
  function emit(kind, x, y, n) {
    for (let i = 0; i < n; i++) {
      S.particles.push({
        x, y, vx: rnd(-1.4, 1.4), vy: rnd(-2.2, -0.2),
        life: 700 + Math.random() * 400, kind, t: 0
      });
    }
  }

  function enemyTurn(e) {
    S.battle.phase = "wait";
    S.battle.wait = 850 / S.settings.battleSpeed;
    e.turnN = (e.turnN || 0) + 1;
    const ai = e.ai;
    const pals = aliveP();
    const tank = pals.find((p) => p.taunt > 0) || pals.sort((a, b) => a.hp - b.hp)[0];
    const elara = pals.find((p) => p.id === "elara");
    const pick = () => {
      if (elara && (elara.meditating || elara.charging || elara.gassed || elara.vulnerable)) return elara;
      return tank || pals[0];
    };
    if (e.telegraph) {
      const tg = e.telegraph;
      e.telegraph = null;
      if (tg.kind === "slam") {
        const t = pals.find((p) => p.id === tg.who) || pick();
        blog(`${e.name} slams ${t.name}!`);
        damage(t, 38 + e.atk, "hit"); sfx("hit"); emit("hit", posOf(t).x, posOf(t).y, 10);
      } else if (tg.kind === "aoe") {
        blog(`${e.name}'s prepared calamity lands.`);
        pals.forEach((p) => damage(p, 24 + Math.floor(e.atk * 0.6), "hit"));
      } else if (tg.kind === "dive") {
        const t = pick();
        blog(`${e.name} dives on ${t.name}.`);
        damage(t, 32, "hit");
      }
      afterAct(e); renderBattleHUD(); return;
    }
    if (ai === "hollow_oak") {
      const cycle = e.turnN % 4;
      if (e.phase === 1 && cycle === 1) {
        e.telegraph = { kind: "slam", who: "elara" };
        blog("Roots coil toward the priestess. It will strike next turn — Ward her.");
      } else if (cycle === 2) {
        blog("Spores. A slow poison on the party.");
        pals.forEach((p) => p.bleed = Math.max(p.bleed, 2));
      } else if (cycle === 3) {
        e.defUp = 2; blog("The bark hardens. A charged empowered blow would shame it.");
      } else {
        const t = pick(); blog(`${e.name} lashes ${t.name}.`); damage(t, 16 + Math.floor(e.atk * 0.5), "hit");
      }
    } else if (ai === "warden") {
      if (e.phase === 3 && e.turnN % 3 === 0) {
        e.telegraph = { kind: "aoe" };
        blog("The gate inhales fire. Next turn it will breathe on everyone.");
      } else if (e.turnN % 3 === 1) {
        e.telegraph = { kind: "slam", who: pick().id };
        blog(`The Warden raises a pillar toward ${pick().name}.`);
      } else {
        const t = pick(); blog(`Ashen blade. ${t.name}.`); damage(t, 20 + Math.floor(e.atk * 0.55), "hit");
      }
    } else if (ai === "mirror") {
      const t = elara && Math.random() < 0.5 ? elara : pick();
      if (e.turnN % 4 === 0) { t.mocked = 2; blog("The Unbetrayed uses Kael's mouth: a poisoned word."); }
      else if (e.turnN % 4 === 2) { e.telegraph = { kind: "slam", who: t.id }; blog("It coils a killing stroke. Charge in its shadow, or Ward."); }
      else { blog(`Crimson cut, stolen. ${t.name}.`); damage(t, 22 + Math.floor(e.atk * 0.6), "hit"); }
    } else if (ai === "specter") {
      if (e.turnN % 3 === 1) { e.telegraph = { kind: "dive" }; blog("The canal-mouth gathers. Interrupt it, or be a shoe."); }
      else { const t = pick(); damage(t, 18, "hit"); blog(`Water-teeth on ${t.name}.`); }
    } else if (ai === "hound") {
      const t = pals.slice().sort((a, b) => b.hp - a.hp)[0];
      blog(`The Bound Hound crashes into ${t.name}.`);
      damage(t, 26 + Math.floor(e.atk * 0.5), "hit");
    } else {
      const t = pick();
      damage(t, 10 + Math.floor(e.atk * 0.5), "hit");
      blog(`${e.name} strikes ${t.name}.`);
    }
    afterAct(e);
    renderBattleHUD();
  }

  function updateBattle(dt) {
    const b = S.battle;
    if (b.phase === "tutorial") {
      if (pressed("ok") || pressed("cancel")) { $("battle-tutorial").classList.add("hidden"); b.phase = "wait"; b.wait = 300; }
      return;
    }
    if (b.phase === "cmd") {
      if (pressed("up")) { b.cmdIdx = Math.max(0, b.cmdIdx - 1); renderBattleHUD(); sfx("ui"); }
      if (pressed("down")) { b.cmdIdx = Math.min((b._items || []).length - 1, b.cmdIdx + 1); renderBattleHUD(); sfx("ui"); }
      if (pressed("ok")) confirmCmd();
      if (pressed("cancel")) {
        if (b.menu !== "cmd") { b.menu = "cmd"; b.cmdIdx = 0; renderBattleHUD(); sfx("cancel"); }
      }
      return;
    }
    if (b.phase === "wait" || b.phase === "intro") {
      b.wait -= dt;
      if (b.wait <= 0) nextActor();
    }
  }
  function winBattle() {
    const b = S.battle;
    blog("Victory. No experience. The story moves.");
    if (b.def.victoryFlag) setFlag(b.def.victoryFlag, 1);
    const post = b.def.post;
    S.battle = null;
    // persist hp
    // already live on S.chars via reference? we cloned pals — copy back
    // startBattle cloned, so write back
    // We used Object.assign copies; write hp/res back
    // stored in last pals
    b.pals.forEach((p) => {
      const c = S.chars[p.id];
      if (!c) return;
      c.hp = Math.max(1, p.hp); // mercy after victory
      c.res = p.res;
    });
    if (post && SCENES[post]) startScene(post);
    else enterMap();
  }
  function loseBattle() {
    S.state = "gameover";
    hideAllScreens();
    $("screen-over").classList.remove("hidden");
    playMusic("ruins");
  }

  function drawBattle() {
    const b = S.battle; if (!b) return;
    const bg = b.def.bg;
    const grads = {
      forest: ["#142218", "#0a1410"],
      canal: ["#143040", "#0a1820"],
      pass: ["#2a2420", "#141010"],
      ruins: ["#201018", "#10080e"]
    };
    const g = ctx.createLinearGradient(0, 0, 0, H);
    const col = grads[bg] || grads.forest;
    g.addColorStop(0, col[0]); g.addColorStop(1, col[1]);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    // floor
    ctx.fillStyle = "rgba(255,255,255,0.04)";
    ctx.beginPath(); ctx.ellipse(640, 520, 420, 70, 0, 0, 6.3); ctx.fill();
    b.foes.forEach((e, i) => {
      if (!e.alive) return;
      const p = posOf(e);
      drawFoe(p.x, p.y, e);
    });
    b.pals.forEach((p) => {
      if (!p.alive) { ctx.globalAlpha = 0.3; }
      const pos = posOf(p);
      drawChibi(pos.x, pos.y, p.id, "right", p.charging > 0, null, 2.4);
      ctx.globalAlpha = 1;
      if (p.shield) {
        ctx.strokeStyle = "rgba(160,210,255,0.7)"; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(pos.x, pos.y, 38, 0, 6.3); ctx.stroke(); ctx.lineWidth = 1;
      }
      if (p.berserk) {
        ctx.strokeStyle = "rgba(220,40,50,0.85)"; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(pos.x, pos.y, 44, 0, 6.3); ctx.stroke(); ctx.lineWidth = 1;
      }
      if (S.battle.actor === p) {
        ctx.fillStyle = "#d4b46a";
        ctx.beginPath(); ctx.moveTo(pos.x, pos.y - 58); ctx.lineTo(pos.x - 7, pos.y - 46); ctx.lineTo(pos.x + 7, pos.y - 46); ctx.fill();
      }
    });
  }
  function drawFoe(x, y, e) {
    ctx.save(); ctx.translate(x, y);
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.beginPath(); ctx.ellipse(0, 40, e.boss ? 48 : 18, 10, 0, 0, 6.3); ctx.fill();
    const tid = e.tid || e.id;
    if (tid === "hollow_oak") {
      ctx.fillStyle = "#4a3020"; ctx.fillRect(-14, -10, 28, 50);
      ctx.fillStyle = "#1e4a28";
      ctx.beginPath(); ctx.arc(0, -28, 42, 0, 6.3); ctx.fill();
      ctx.fillStyle = "#3a6a30";
      ctx.beginPath(); ctx.arc(-22, -18, 22, 0, 6.3); ctx.fill();
      ctx.beginPath(); ctx.arc(24, -16, 20, 0, 6.3); ctx.fill();
      ctx.fillStyle = "#6a3a78"; ctx.globalAlpha = 0.45;
      ctx.beginPath(); ctx.arc(-8, -30, 10, 0, 6.3); ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = "#c0e070";
      ctx.fillRect(-10, -8, 4, 4); ctx.fillRect(6, -4, 4, 4);
    } else if (tid === "gate_warden") {
      ctx.fillStyle = "#6a4030"; ctx.fillRect(-28, -50, 56, 90);
      ctx.fillStyle = "#8a5a40"; ctx.fillRect(-40, -60, 80, 18);
      ctx.fillStyle = "#e8c070"; ctx.fillRect(-8, -20, 16, 40);
      ctx.fillStyle = "#1a1020"; ctx.fillRect(-12, -44, 8, 8); ctx.fillRect(4, -44, 8, 8);
    } else if (tid === "mirror_shade") {
      ctx.globalAlpha = 0.85;
      drawChibi(0, 0, "kael", "left", false, null, 2.6);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = "rgba(220,80,120,0.7)"; ctx.lineWidth = 2;
      ctx.strokeRect(-36, -70, 72, 100);
    } else if (tid === "canal_specter") {
      ctx.fillStyle = "#3a6a8a";
      ctx.beginPath(); ctx.ellipse(0, 10, 36, 22, 0, 0, 6.3); ctx.fill();
      ctx.fillStyle = "#d0e8f8"; ctx.beginPath(); ctx.arc(-10, -6, 6, 0, 6.3); ctx.fill();
      ctx.beginPath(); ctx.arc(12, -8, 6, 0, 6.3); ctx.fill();
      ctx.fillStyle = "#8a2020"; ctx.fillRect(-8, 8, 16, 4);
    } else if (tid === "bound_hound") {
      ctx.fillStyle = "#5a4a3a";
      ctx.beginPath(); ctx.ellipse(0, 8, 38, 22, 0, 0, 6.3); ctx.fill();
      ctx.fillRect(-30, -18, 18, 16); ctx.fillRect(18, -12, 14, 10);
      ctx.fillStyle = "#d4b46a"; ctx.fillRect(-20, 18, 40, 6);
    } else {
      ctx.fillStyle = e.color || "#6a3a4a";
      const s = e.boss ? 1.6 : 1.15;
      ctx.beginPath(); ctx.ellipse(0, 0, 22 * s, 28 * s, 0, 0, 6.3); ctx.fill();
      ctx.fillStyle = "#1a1020";
      ctx.fillRect(-8 * s, -10 * s, 5 * s, 5 * s); ctx.fillRect(4 * s, -10 * s, 5 * s, 5 * s);
    }
    if (e.telegraph) {
      ctx.strokeStyle = "#e8c070"; ctx.setLineDash([4, 4]); ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(0, 0, 56, 0, 6.3); ctx.stroke(); ctx.setLineDash([]); ctx.lineWidth = 1;
    }
    ctx.fillStyle = "#f4ead4";
    ctx.font = "15px serif"; ctx.textAlign = "center";
    ctx.fillText(e.name, 0, e.boss ? -78 : -44);
    const bw = e.boss ? 80 : 52;
    ctx.fillStyle = "#1c1826"; ctx.fillRect(-bw / 2, 48, bw, 8);
    ctx.fillStyle = "#d45a6a"; ctx.fillRect(-bw / 2, 48, bw * Math.max(0, e.hp / e.maxHp), 8);
    ctx.restore();
  }

  // ---------------------------------------------------------------------------
  // Menu / saves
  // ---------------------------------------------------------------------------
  function openMenu() {
    S._return = S.state;
    S.state = "menu";
    S.menuTab = "party";
    $("screen-menu").classList.remove("hidden");
    renderMenu();
  }
  function closeMenu() {
    $("screen-menu").classList.add("hidden");
    if (S._return === "map" || S._return === "menu") enterMap();
    else if (S._return === "battle") { S.state = "battle"; $("battle-hud").classList.remove("hidden"); }
    else showTitle();
  }
  function renderMenu() {
    [...$("menu-tabs").children].forEach((b) => b.classList.toggle("on", b.dataset.tab === S.menuTab));
    const body = $("menu-body");
    if (S.menuTab === "party") {
      body.innerHTML = S.party.map((id) => {
        const c = S.chars[id];
        const gear = [c.weapon, c.armor, c.accessory].map((g) => g && DATA.ITEMS[g]?.name).filter(Boolean).join(" · ");
        const sk = skillsOf(c).map((s) => DATA.SKILLS[s].name).join(", ");
        return `<h3>${c.name} — ${c.role}</h3>
          <p>HP ${c.hp|0}/${c.maxHp} · ${c.resName} ${c.res|0}/${c.maxRes} · ATK ${c.atk} DEF ${c.def} SPD ${c.spd}</p>
          <p>${gear || "Unadorned."}</p>
          <p style="color:var(--muted)">${sk}</p>`;
      }).join("");
    }
    if (S.menuTab === "items") {
      body.innerHTML = S.inventory.map((id) => {
        const it = DATA.ITEMS[id];
        if (!it) return "";
        const extra = it.type === "consumable" ? ` (${it._uses ?? it.uses} left)` : "";
        return `<div class="row"><span>${it.name}${extra}</span><span>${it.slot || it.type || ""}</span></div>
                <p style="color:var(--muted);margin:0 0 8px">${it.desc}</p>`;
      }).join("") || "<p>Pockets empty of names.</p>";
    }
    if (S.menuTab === "quests") {
      body.innerHTML = Object.values(DATA.QUESTS).map((q) => {
        const st = S.quests[q.id] || (q.main ? "active" : "???");
        if (st === "???" && !q.main) {
          // show if related flag seen
          if (!S.flags[q.id] && st !== "active" && st !== "done") return "";
        }
        const status = S.quests[q.id] || (q.main ? "active" : "");
        if (!status && !q.main) return "";
        return `<h3>${q.name} ${status === "done" ? "✓" : ""}</h3><p>${q.desc || (q.steps || []).join(" → ")}</p>`;
      }).join("");
    }
    if (S.menuTab === "lore") {
      const lore = S.inventory.map((id) => DATA.ITEMS[id]).filter((it) => it && it.type === "lore");
      body.innerHTML = lore.map((it) => `<h3>${it.name}</h3><p>${it.desc}</p>`).join("") || "<p>No tablets yet.</p>";
    }
    if (S.menuTab === "save") {
      body.innerHTML = `<p>Lotus altars also rest the party. Saves live in this browser.</p>
        <button class="save-slot" data-s="0">Write slot 1</button>
        <button class="save-slot" data-s="1">Write slot 2</button>
        <button class="save-slot" data-s="2">Write slot 3</button>
        <button class="save-slot" data-s="load">Load…</button>`;
      body.querySelectorAll(".save-slot").forEach((b) => b.addEventListener("click", () => {
        if (b.dataset.s === "load") openSaves("load");
        else saveSlot(+b.dataset.s);
      }));
    }
    if (S.menuTab === "system") {
      body.innerHTML = `<p><button data-act="opt">Options</button></p><p><button data-act="totitle">Return to Title</button></p>`;
      body.querySelector("[data-act=opt]")?.addEventListener("click", () => showOptions(false));
      body.querySelector("[data-act=totitle]")?.addEventListener("click", showTitle);
    }
  }
  function openSaves(mode) {
    S.saveMode = mode;
    S.state = "saves";
    hideAllScreens();
    $("screen-saves").classList.remove("hidden");
    $("save-title").textContent = mode === "save" ? "Save" : "Load";
    const box = $("save-slots");
    box.innerHTML = "";
    for (let i = 0; i < 3; i++) {
      let label = "Empty slot " + (i + 1);
      try {
        const d = JSON.parse(localStorage.getItem("soth_slot_" + i) || "null");
        if (d) {
          const loc = MAPS[d.mapId]?.name || d.mapId;
          label = `${loc} — party of ${d.party.length}`;
          const when = new Date(d.when).toLocaleString();
          const btn = document.createElement("button");
          btn.className = "save-slot";
          btn.innerHTML = `<div>${label}</div><div class="when">${when}</div>`;
          btn.addEventListener("click", () => {
            if (mode === "save") saveSlot(i);
            else loadSlot(i);
          });
          box.appendChild(btn);
          continue;
        }
      } catch (e) {}
      const btn = document.createElement("button");
      btn.className = "save-slot";
      btn.textContent = label;
      btn.addEventListener("click", () => { if (mode === "save") saveSlot(i); });
      box.appendChild(btn);
    }
  }

  // ---------------------------------------------------------------------------
  // Particles / numbers
  // ---------------------------------------------------------------------------
  function updateFx(dt) {
    S.tileFx += dt;
    S.anim += dt;
    if (S.shake > 0) S.shake *= 0.86;
    if (toastT > 0) toastT -= dt;
    S.particles = S.particles.filter((p) => {
      p.t += dt; p.x += p.vx * dt * 0.06; p.y += p.vy * dt * 0.06; p.life -= dt;
      return p.life > 0;
    });
    S.dmgNums = S.dmgNums.filter((d) => { d.life -= dt; d.y -= dt * 0.03; return d.life > 0; });
  }
  function drawFx() {
    for (const p of S.particles) {
      const a = Math.max(0, p.life / 800);
      ctx.globalAlpha = a;
      if (p.kind === "petal") { ctx.fillStyle = "#e8d0e8"; ctx.beginPath(); ctx.ellipse(p.x, p.y, 4, 2, p.t / 200, 0, 6.3); ctx.fill(); }
      else if (p.kind === "flame" || p.kind === "unseal") { ctx.fillStyle = p.kind === "unseal" ? "#ff6a40" : "#e04030"; ctx.fillRect(p.x, p.y, 3, 6); }
      else if (p.kind === "heal") { ctx.fillStyle = "#80e0a0"; ctx.fillRect(p.x, p.y, 3, 8); }
      else { ctx.fillStyle = "#f4ead4"; ctx.fillRect(p.x, p.y, 2, 2); }
    }
    ctx.globalAlpha = 1;
    ctx.font = "18px serif"; ctx.textAlign = "center";
    for (const d of S.dmgNums) {
      ctx.globalAlpha = Math.max(0, d.life / 800);
      ctx.fillStyle = d.color; ctx.fillText(d.text, d.x, d.y);
    }
    ctx.globalAlpha = 1;
    if (toastT > 0) {
      ctx.fillStyle = "rgba(10,8,18,0.85)";
      ctx.fillRect(W / 2 - 260, 24, 520, 36);
      ctx.strokeStyle = "#d4b46a"; ctx.strokeRect(W / 2 - 260, 24, 520, 36);
      ctx.fillStyle = "#f4ead4"; ctx.font = "16px serif";
      ctx.fillText(toastMsg, W / 2, 48);
    }
  }

  // ---------------------------------------------------------------------------
  // Loop / title update
  // ---------------------------------------------------------------------------
  function updateTitle() {
    const btns = [...$("title-menu").querySelectorAll("button")].filter((b) => !b.disabled);
    if (pressed("up")) { S.titleIdx = (S.titleIdx + btns.length - 1) % btns.length; highlightTitle(); sfx("ui"); }
    if (pressed("down")) { S.titleIdx = (S.titleIdx + 1) % btns.length; highlightTitle(); sfx("ui"); }
    if (pressed("ok")) titleAct(btns[S.titleIdx].dataset.act);
  }

  let last = 0;
  function frame(t) {
    const dt = Math.min(40, t - last || 16);
    last = t;
    const touch = $("touch");
    if (touch) {
      touch.classList.toggle("on-map", S.state === "map");
      touch.classList.toggle("on-dialog", S.state === "vn");
    }
    tickMusic(dt);
    updateFx(dt);
    ctx.save();
    if (S.shake > 0.4) ctx.translate((Math.random() - 0.5) * S.shake, (Math.random() - 0.5) * S.shake);
    if (S.state === "title" || S.state === "credits" || S.state === "options" || S.state === "saves") {
      // painted backdrop
      if (S.images.title) ctx.drawImage(S.images.title, 0, 0, W, H);
      else { ctx.fillStyle = "#0c0914"; ctx.fillRect(0, 0, W, H); }
      if (S.state === "title") updateTitle();
      if (S.state === "credits" && pressed("cancel")) showTitle();
      if (S.state === "options" && pressed("cancel")) {
        if (S._optFrom === "title") showTitle(); else openMenu();
      }
    } else if (S.state === "map") {
      updateMap(dt); drawMap();
    } else if (S.state === "vn") {
      if (S.vn?.def.mode === "talk") drawMap();
      else if (S.images.title && S.vn?.def.bg === "temple") ctx.drawImage(S.images.title, 0, 0, W, H);
      else {
        ctx.fillStyle = "#100c18"; ctx.fillRect(0, 0, W, H);
      }
      updateVn(dt);
    } else if (S.state === "battle") {
      updateBattle(dt); drawBattle();
    } else if (S.state === "menu") {
      drawMap();
      if (pressed("menu") || pressed("cancel")) closeMenu();
    } else if (S.state === "gameover") {
      ctx.fillStyle = "#100808"; ctx.fillRect(0, 0, W, H);
    }
    drawFx();
    ctx.restore();
    S.mouse.click = false;
    requestAnimationFrame(frame);
  }

  // Auto-equip rewards that are gear when granted via flags already handled.
  // Missing acolyte: talking to Mira in her house after finding the letter in the house.
  // Wire: village jori / forest / mira house sign. When player reads mira's wet letter, set quest found if they then go to house? 
  // Simpler: chest in house_mira appears with beads when appearIf quest_acolyte_found.
  // How to set quest_acolyte_found? Talk to mira... but she appears only if found.
  // Set found when player interacts with the sign in her house (the wet letter) OR talk to jori? 
  // Let's set it when entering house_mira and interacting with the sign.

  const _interact = interact;
  // already: sign in house_mira. Add hook:
  const origInteract = interact;
  // wrap after definition — monkeypatch events in interact via sign id. The sign text is enough; add in interact:
  // Can't easily. Add trigger on house_mira floor.

  // Boot
  async function boot() {
    fit();
    try {
      const st = JSON.parse(localStorage.getItem("soth_settings") || "null");
      if (st) Object.assign(S.settings, st);
    } catch (e) {}
    await loadImages();
    $("loader").style.display = "none";
    if (S.images.title) $("screen-title").style.backgroundImage = `url(${DATA.BGS.title})`;
    showTitle();
    requestAnimationFrame(frame);
    // click anywhere to unlock audio
    window.addEventListener("pointerdown", () => { ensureAudio(); harvestVoices(); }, { once: true });
  }

  // Debug
  window.SOTH = S;
  window.SOTH_NEW = newGame;
  window.SOTH_FLAG = setFlag;
  window.SOTH_BATTLE = startBattle;
  window.SOTH_SCENE = startScene;

  boot();
})();
