/* =============================================================================
   Temple of the High Priestess — engine
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
    amb: [],            // ambient weather/mood motes, per scene
    dmgNums: [],
    shake: 0,
    flash: 0,
    keys: {},
    just: {},
    mouse: { x: W * 0.5, y: H * 0.5, click: false, locked: false },
    hover: 0,
    titleIdx: 0,
    anim: 0,
    tileFx: 0,
    images: {},
    ready: false,
    tutorialsSeen: {},
    idle: null
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
    ControlLeft: "skip", ControlRight: "skip", KeyF: "skip",
    Digit3: "macro3", Numpad3: "macro3"
  };
  window.addEventListener("keydown", (e) => {
    // Number keys pick the matching dialogue choice ("1." / "2." on screen).
    const num = /^(?:Digit|Numpad)([1-9])$/.exec(e.code);
    if (num && S.state === "vn" && S.vn?.choices) {
      const i = +num[1] - 1;
      if (i < S.vn.choices.length) { S.vn.choiceIdx = i; pickChoice(); }
      e.preventDefault();
      return;
    }
    const k = KEYMAP[e.code] || KEYMAP[e.key];
    if (!k) return;
    if (k === "macro3") {
      beginHealingRainAim();
      e.preventDefault();
      return;
    }
    if (!S.keys[k]) S.just[k] = true;
    S.keys[k] = true;
    if (["ok", "cancel", "menu", "up", "down", "left", "right", "skip"].includes(k)) e.preventDefault();
  });
  window.addEventListener("keyup", (e) => {
    const k = KEYMAP[e.code] || KEYMAP[e.key];
    if (k) S.keys[k] = false;
  });
  canvas.addEventListener("mousemove", (e) => {
    if (document.pointerLockElement === canvas) {
      const r = canvas.getBoundingClientRect();
      S.mouse.x = clamp(S.mouse.x + e.movementX * (W / r.width), 0, W);
      S.mouse.y = clamp(S.mouse.y + e.movementY * (H / r.height), 0, H);
      return;
    }
    const r = canvas.getBoundingClientRect();
    S.mouse.x = (e.clientX - r.left) * (W / r.width);
    S.mouse.y = (e.clientY - r.top) * (H / r.height);
  });
  canvas.addEventListener("mousedown", (e) => {
    if (e.button === 2 || e.button === 3) {
      beginHealingRainAim();
      e.preventDefault();
      return;
    }
    S.mouse.click = true; S.just.ok = true;
  });
  canvas.addEventListener("contextmenu", (e) => e.preventDefault());
  document.addEventListener("pointerlockchange", () => {
    S.mouse.locked = document.pointerLockElement === canvas;
  });

  // Touch controls. Each finger is tracked on its own, so holding the d-pad
  // while tapping Z no longer drops the walk, and sliding a thumb across the
  // d-pad changes direction.
  const IS_TOUCH = "ontouchstart" in window;
  const touchHeld = new Map();          // pointerId -> button
  function touchPress(b) {
    b.classList.add("held");
    if (b.dataset.dir) S.keys[b.dataset.dir] = true;
    if (b.dataset.k === "KeyZ") { S.just.ok = true; S.keys.ok = true; }
    if (b.dataset.k === "KeyX") { S.just.cancel = true; S.keys.cancel = true; }
    if (b.dataset.k === "Escape") { S.just.menu = true; }
    if (b.dataset.k === "KeyC") { S.just.camp = true; }
  }
  function touchRelease(b) {
    b.classList.remove("held");
    if ([...touchHeld.values()].includes(b)) return;   // another finger still on it
    if (b.dataset.dir) S.keys[b.dataset.dir] = false;
    if (b.dataset.k === "KeyZ") S.keys.ok = false;
    if (b.dataset.k === "KeyX") S.keys.cancel = false;
  }
  $("touch").addEventListener("pointerdown", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    e.preventDefault();
    touchHeld.set(e.pointerId, b);
    touchPress(b);
  });
  window.addEventListener("pointermove", (e) => {
    const cur = touchHeld.get(e.pointerId);
    if (!cur || !cur.dataset.dir) return;
    const over = document.elementFromPoint(e.clientX, e.clientY);
    const nb = over && over.closest && over.closest("#dpad button");
    if (nb && nb !== cur) { touchHeld.set(e.pointerId, nb); touchRelease(cur); touchPress(nb); }
  });
  const touchUp = (e) => {
    const b = touchHeld.get(e.pointerId);
    if (!b) return;
    touchHeld.delete(e.pointerId);
    touchRelease(b);
  };
  ["pointerup", "pointercancel"].forEach((ev) => window.addEventListener(ev, touchUp));
  $("touch").addEventListener("contextmenu", (e) => e.preventDefault());
  if (IS_TOUCH) {
    $("touch").classList.remove("hidden");
    document.body.classList.add("touch");
    // iOS ignores user-scalable=no; stop pinch / double-tap zoom on the game.
    // (Double-tap zoom is already off via touch-action in the CSS.)
    ["gesturestart", "gesturechange"].forEach((ev) => document.addEventListener(ev, (e) => e.preventDefault(), { passive: false }));
    // A finger lifted while the page lost focus must not leave Kael walking.
    window.addEventListener("blur", () => {
      touchHeld.forEach((b) => b.classList.remove("held"));
      touchHeld.clear();
      S.keys.up = S.keys.down = S.keys.left = S.keys.right = S.keys.ok = S.keys.cancel = false;
    });
  }

  function pressed(k) { const v = S.just[k]; S.just[k] = false; return v; }
  function flushJust() { /* kept until consumed */ }
  function requestBattlePointerLock() {
    if (document.pointerLockElement === canvas || !canvas.requestPointerLock) return;
    try { canvas.requestPointerLock(); } catch (e) {}
  }
  function releaseBattlePointerLock() {
    if (document.pointerLockElement !== canvas || !document.exitPointerLock) return;
    document.exitPointerLock();
  }

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
    try { Platform.setItem("soth_settings", JSON.stringify(S.settings)); } catch (e) {}
  }
  let noiseBuf = null;
  function noiseBurst(dur, gain, hp, at) {
    if (!actx || S.settings.vol <= 0) return;
    if (!noiseBuf) {
      noiseBuf = actx.createBuffer(1, actx.sampleRate, actx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    const t = (at || actx.currentTime);
    const src = actx.createBufferSource(), f = actx.createBiquadFilter(), g = actx.createGain();
    src.buffer = noiseBuf; f.type = "highpass"; f.frequency.value = hp || 800;
    src.connect(f); f.connect(g); g.connect(master);
    g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.start(t); src.stop(t + dur + 0.02);
  }
  function tone(freq, dur, type, gain, at, slideTo) {
    if (!actx || S.settings.vol <= 0) return;
    const t = at || actx.currentTime;
    const o = actx.createOscillator(), g = actx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    o.connect(g); g.connect(master);
    g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.start(t); o.stop(t + dur + 0.02);
  }
  // Layered one-shots for the bigger moments.
  function bigSfx(kind) {
    if (!actx || S.settings.vol <= 0) return;
    const t = actx.currentTime;
    if (kind === "chains") {
      for (let i = 0; i < 7; i++) tone(1800 + Math.random() * 1400, 0.09, "square", 0.025, t + i * 0.07);
      noiseBurst(0.5, 0.05, 3000, t);
    } else if (kind === "snap") {
      noiseBurst(0.7, 0.22, 400, t);
      tone(70, 0.9, "sawtooth", 0.12, t, 32);
      for (let i = 0; i < 5; i++) tone(2400 + i * 300, 0.25, "triangle", 0.03, t + 0.02 * i);
    } else if (kind === "boom") {
      tone(60, 1.2, "sine", 0.2, t, 30);
      noiseBurst(0.6, 0.08, 200, t);
    } else if (kind === "encounter") {
      tone(220, 0.35, "sawtooth", 0.05, t, 880);
      noiseBurst(0.3, 0.05, 2000, t + 0.05);
    } else if (kind === "die") {
      tone(500, 0.4, "triangle", 0.06, t, 90);
      noiseBurst(0.35, 0.05, 1200, t);
    } else if (kind === "bossdie") {
      tone(300, 1.6, "sawtooth", 0.1, t, 40);
      noiseBurst(1.4, 0.14, 300, t);
      tone(60, 1.8, "sine", 0.18, t + 0.1, 28);
    }
  }
  function sfx(kind) {
    Platform.haptic(kind);
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
  // TUNES — each zone has: base freq (Hz), melody (minor/dark) and melodyMaj
  // (major/bright) sequences, chord table, bass line, tempo, waveform.
  // A null in a melody array = rest.  Integers are semitones above base.
  // ---------------------------------------------------------------------------
  // Goal tiles (tile coords) used to detect "approaching goal" → major mode.
  const MAP_GOALS = {
    temple: { x: 36, y: 50 }, town: { x: 44, y: 5 },
    city:   { x: 44, y: 65 }, forest: { x: 50, y: 70 },
    pass:   { x: 50, y: 70 }, ruins: { x: 44, y: 65 },
    throne: { x: 28, y: 18 }, battle: { x: 32, y: 32 }
  };
  // The Seal leitmotif: rise to the minor seventh, fall back through the
  // sixth and land on the fourth. Title, temple, boss, victory and ending all
  // quote it so the theme reads as one score.
  const SEAL = [0, 3, 7, 10, 8, 7, 3, 5];
  const SEAL_MAJ = [0, 4, 7, 11, 9, 7, 4, 5];
  const TUNES = {
    // Title: the motif alone, slow, with long rests.
    title: {
      base: 196, wave: "sine", tempo: 0.62,
      melody: [0, null, 3, 7, null, 10, 8, null, 7, null, 3, 5, null, null, 3, null,
               0, null, 3, 7, null, 12, 10, null, 8, 7, 5, 3, null, 0, null, null],
      melodyMaj: null,
      chords: [[0, 7, 12], [8, 12, 15], [5, 8, 12], [7, 10, 14]],
      chordEvery: 8,
      bass: [0, null, 0, null, 8, null, 7, null],
      bassOct: 0.5
    },
    // Boss: the motif in driving eighths over a pedal, an octave answer.
    boss: {
      base: 110, wave: "sawtooth", tempo: 0.2,
      melody: [12, 15, 19, 22, 20, 19, 15, 17, 12, 15, 19, 22, 24, 22, 20, 19,
               0, 3, 7, 10, 8, 7, 3, 5, 6, 5, 3, 1, 0, null, 0, null],
      melodyMaj: null,
      chords: [[0, 7, 12], [8, 12, 15], [5, 8, 12], [6, 10, 13]],
      chordEvery: 8,
      bass: [0, 0, 12, 0, 0, 12, 0, 10],
      bassOct: 0.5
    },
    // Ending: the motif in major, unhurried.
    ending: {
      base: 196, wave: "triangle", tempo: 0.7,
      melody: [0, 4, 7, 11, 9, 7, 4, 5, null, 4, 2, 0, null, null, null, null,
               0, 4, 7, 12, 11, 9, 7, 9, 11, 12, null, 7, 12, null, null, null],
      melodyMaj: null,
      chords: [[0, 4, 7], [9, 12, 16], [5, 9, 12], [7, 11, 14]],
      chordEvery: 8,
      bass: [0, null, 0, null, 9, null, 7, null],
      bassOct: 0.5
    },
    // Temple of the Priestess — minor: pentatonic A minor; major: A major pentatonic
    temple: {
      base: 220, wave: "sine", tempo: 1.4,
      // Opens on the Seal motif, then answers in pentatonic.
      melody:    [0, 3, 7, 10, 8, 7, 3, 5, 2, 4, 7, 9, 12, 9, 7, null,
                  0, 7, 12, 16, 14, 12, 7, 4, 2, 0, 4, 7, 9, 7, 4, null],
      melodyMaj: [0, 4, 7, 11, 9, 7, 4, 5, 2, 4, 9, 11, 12, 11, 9, null,
                  4, 7, 9, 12, 16, 14, 12, 9, 7, 4, 2, 4, 7, 9, 4, null],
      chords: [[0, 7, 12], [2, 9, 14], [4, 7, 11], [0, 7, 12]],
      chordEvery: 8,
      bass: [0, 0, 7, 0, 9, 0, 7, 0],
      bassOct: 0.5
    },
    // Town — minor: Dorian; major: bright G major
    town: {
      base: 196, wave: "triangle", tempo: 0.65,
      melody:    [0, 2, 3, 5, 7, 5, 3, 2, 0, 3, 7, 10, 9, 7, 5, 3,
                  2, 3, 5, 7, 9, 10, 9, 7, 5, 3, 2, 0, null, 0, 2, null],
      melodyMaj: [0, 2, 4, 7, 9, 7, 4, 2, 0, 4, 7, 11, 9, 7, 4, 2,
                  4, 7, 9, 11, 12, 11, 9, 7, 4, 2, 0, 2, 4, 7, null, null],
      chords: [[0, 7, 10], [3, 7, 10], [5, 9, 12], [2, 5, 9]],
      chordEvery: 8,
      bass: [0, 0, 3, 0, 5, 0, 7, 0],
      bassOct: 0.5
    },
    // City — minor: Mixolydian; major: F major, confident and bright
    city: {
      base: 174, wave: "triangle", tempo: 0.57,
      melody:    [0, 4, 7, 10, 12, 10, 7, 4, 5, 9, 12, 10, 7, 5, 4, null,
                  3, 7, 10, 12, 14, 12, 10, 7, 5, 3, 0, 3, 5, 7, null, null],
      melodyMaj: [0, 4, 7, 11, 12, 11, 7, 4, 5, 9, 12, 11, 7, 5, 4, null,
                  4, 7, 11, 12, 14, 12, 11, 7, 5, 4, 0, 4, 5, 7, null, null],
      chords: [[0, 7, 10], [5, 9, 12], [3, 7, 10], [0, 4, 7]],
      chordEvery: 8,
      bass: [0, 0, 5, 0, 3, 0, 7, 0],
      bassOct: 0.5
    },
    // Forest — minor: Lydian (already bright); major: D major, open and hopeful
    forest: {
      base: 146, wave: "sine", tempo: 1.7,
      melody:    [0, 2, 4, 6, 7, 9, 11, 12, 11, 9, 7, 6, 4, 2, 0, null,
                  7, 9, 11, 12, 14, 12, 11, 9, 7, 6, 4, 2, 4, 6, 7, null],
      melodyMaj: [0, 4, 7, 9, 11, 12, 11, 9, 7, 4, 2, 0, null, 4, 7, 9,
                  9, 11, 12, 14, 12, 11, 9, 7, 4, 2, 4, 7, 9, 11, 7, null],
      chords: [[0, 7, 11], [2, 6, 9], [4, 7, 11], [6, 9, 14]],
      chordEvery: 8,
      bass: [0, 0, 7, 0, 4, 0, 7, 0],
      bassOct: 0.5
    },
    // Mountain Pass — minor: Phrygian (very dark); major: C major (lighter)
    pass: {
      base: 130, wave: "sawtooth", tempo: 1.55,
      melody:    [0, 1, 3, 5, 7, 8, 7, 5, 3, 1, 0, 3, 7, 10, 8, null,
                  0, 1, 3, 7, 8, 10, 8, 7, 5, 3, 1, 0, null, 0, 1, null],
      melodyMaj: [0, 2, 4, 7, 9, 7, 4, 2, 0, 4, 7, 9, 11, 9, 7, null,
                  2, 4, 7, 9, 11, 12, 11, 9, 7, 4, 2, 0, null, 2, 4, null],
      chords: [[0, 7, 10], [1, 5, 8], [3, 7, 10], [0, 3, 7]],
      chordEvery: 8,
      bass: [0, 0, 1, 0, 3, 0, 7, 0],
      bassOct: 0.5
    },
    // Ruins — minor: Locrian dread; major: A major sparse, eerie hope
    ruins: {
      base: 110, wave: "triangle", tempo: 2.2,
      melody:    [0, 1, 3, null, 6, null, 8, 6, null, 3, 1, 0, null, 8, 6, null,
                  0, null, 6, null, 8, 10, 8, 6, null, 3, null, 1, 0, null, null, null],
      melodyMaj: [0, 4, 7, null, 9, null, 11, 9, null, 7, 4, 0, null, 11, 9, null,
                  0, null, 7, null, 9, 11, 9, 7, null, 4, null, 2, 0, null, null, null],
      chords: [[0, 6, 8], [1, 6, 10], [3, 8, 13], [0, 3, 6]],
      chordEvery: 8,
      bass: [0, 0, 6, 0, 1, 0, 6, 0],
      bassOct: 0.5
    },
    // Throne Room — minor: weighty G minor; major: triumphant G major
    throne: {
      base: 98, wave: "sine", tempo: 2.3,
      melody:    [0, 3, 7, 10, 12, 15, 12, 10, 7, 3, 0, null, 5, 8, 12, null,
                  0, 7, 12, 15, 19, 15, 12, 7, 5, 3, 0, 3, 7, 10, null, null],
      melodyMaj: [0, 4, 7, 11, 12, 16, 12, 11, 7, 4, 0, null, 5, 9, 12, null,
                  0, 7, 12, 16, 19, 16, 12, 7, 5, 4, 0, 4, 7, 11, null, null],
      chords: [[0, 7, 12], [3, 7, 10], [5, 8, 12], [0, 5, 10]],
      chordEvery: 4,
      bass: [0, 0, 5, 0, 3, 0, 7, 0],
      bassOct: 0.5
    },
    // Battle — minor: diminished/octatonic; major: driving E major pentatonic
    battle: {
      base: 164, wave: "square", tempo: 0.42,
      melody:    [0, 3, 6, 9, 0, 6, 3, 9, 1, 4, 7, 10, 1, 7, 4, 10,
                  0, 1, 3, 6, 7, 9, 10, null, 0, 3, 6, 9, 7, 4, 1, null],
      melodyMaj: [0, 4, 7, 11, 0, 7, 4, 11, 2, 5, 9, 12, 2, 9, 5, 12,
                  0, 2, 4, 7, 9, 11, 12, null, 0, 4, 7, 11, 9, 5, 2, null],
      chords: [[0, 6, 9], [3, 6, 10], [1, 4, 9], [0, 3, 7]],
      chordEvery: 8,
      bass: [0, 3, 6, 9, 0, 6, 3, 9],
      bassOct: 0.5
    }
  };
  // "major" when moving closer to the map goal, "minor" when moving away
  // modeBlend: 0 = fully minor, 1 = fully major; interpolates slowly
  let musicId = null, musicTimer = 0, musicStep = 0;
  let musicMode = "minor", modeBlend = 0, prevGoalDist = Infinity, idleTime = 0, musicFade = 1;
  // One-shot phrases on top of (or instead of) the loop.
  const JINGLES = {
    // Victory: the motif in major, then a held tonic chord.
    victory: { base: 262, wave: "square", step: 0.11, notes: [...SEAL_MAJ, 12, null, 12], hold: [0, 4, 7, 12] },
    // Region sting: first half of the motif.
    region: { base: 220, wave: "triangle", step: 0.2, notes: [0, 3, 7, 10], hold: [0, 7, 10] },
    // Vista swell: the motif, slow, major.
    vista: { base: 196, wave: "sine", step: 0.32, notes: SEAL_MAJ, hold: [0, 4, 7, 11] }
  };
  function playJingle(id) {
    const j = JINGLES[id];
    if (!j || !actx || S.settings.vol <= 0) return;
    const t0 = actx.currentTime + 0.03;
    j.notes.forEach((n, i) => {
      if (n === null) return;
      tone(j.base * Math.pow(2, n / 12), j.step * 1.8, j.wave, 0.05, t0 + i * j.step);
    });
    const th = t0 + j.notes.length * j.step;
    (j.hold || []).forEach((n, i) => tone(j.base * Math.pow(2, n / 12), 1.6, i ? "sine" : j.wave, 0.04 - i * 0.006, th));
  }
  function playMusic(id) {
    if (musicId === id) return;
    musicId = id;
    musicStep = 0;
    musicTimer = 0;
    prevGoalDist = Infinity;
    modeBlend = musicMode === "major" ? 1 : 0;
  }
  function tickMusic(dt) {
    if (!actx || !musicId || S.settings.vol <= 0) return;
    const tune = TUNES[musicId];
    if (!tune) return;
    const dtSec = dt / 1000;

    // --- Goal proximity: approaching → major, retreating → minor ---
    if (S.state === "map") {
      const goal = MAP_GOALS[musicId];
      if (goal) {
        const dist = Math.hypot(S.px / T - goal.x, S.py / T - goal.y);
        if (prevGoalDist !== Infinity) {
          if (dist < prevGoalDist - 0.15) musicMode = "major";
          else if (dist > prevGoalDist + 0.15) musicMode = "minor";
        }
        prevGoalDist = dist;
      }
      // Idle fade: > 20 s of no movement → lower to 10 % volume
      if (S.moving) { idleTime = 0; }
      else { idleTime += dtSec; }
    }
    // Blend mode gradually: ~10 s to fully switch major↔minor
    const modeTarget = musicMode === "major" ? 1 : 0;
    modeBlend += (modeTarget - modeBlend) * Math.min(1, dtSec * 0.1);
    // Fade volume slowly (~8 s ramp)
    const fadeTarget = idleTime > 20 ? 0.1 : 1.0;
    musicFade += (fadeTarget - musicFade) * Math.min(1, dtSec * 0.12);

    musicTimer += dtSec;
    if (musicTimer < tune.tempo) return;
    musicTimer = 0;
    const step = musicStep++;
    const t = actx.currentTime;
    const minorArr = tune.melody;
    const majorArr = tune.melodyMaj || tune.melody;   // null = fixed mode
    // Use modeBlend to probabilistically select major vs minor step
    const useMajor = Math.random() < modeBlend;
    const melodyArr = useMajor ? majorArr : minorArr;
    const semitone = melodyArr[step % melodyArr.length];

    // Melody note (skip if rest)
    if (semitone !== null) {
      const o = actx.createOscillator();
      const g = actx.createGain();
      o.type = tune.wave;
      o.frequency.value = tune.base * Math.pow(2, semitone / 12);
      // Subtle vibrato on slow tunes
      let lfo = null, lfoG = null;
      if (tune.tempo >= 0.45) {
        lfo = actx.createOscillator();
        lfoG = actx.createGain();
        lfo.frequency.value = 5;
        lfoG.gain.value = tune.base * 0.003;
        lfo.connect(lfoG); lfoG.connect(o.frequency);
        lfo.start(t); lfo.stop(t + tune.tempo * 1.7);
      }
      o.connect(g); g.connect(master);
      g.gain.setValueAtTime(0.04 * musicFade, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + tune.tempo * 1.5);
      o.start(t); o.stop(t + tune.tempo * 1.7);
      // Disconnect vibrato nodes when the melody note ends to allow GC
      if (lfo) o.onended = () => { try { lfoG.disconnect(); lfo.disconnect(); } catch (_) {} };
    }

    // Bass note every beat
    const bassNote = tune.bass[step % tune.bass.length];
    if (bassNote !== null) {
      const b = actx.createOscillator();
      const bg = actx.createGain();
      b.type = "sine";
      b.frequency.value = tune.base * tune.bassOct * Math.pow(2, bassNote / 12);
      b.connect(bg); bg.connect(master);
      bg.gain.setValueAtTime(0.03 * musicFade, t);
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
        const vel = Math.max(0.001, (0.012 - i * 0.003) * musicFade);
        cg.gain.setValueAtTime(vel, t + i * 0.018);
        cg.gain.exponentialRampToValueAtTime(0.001, t + tune.tempo * tune.chordEvery * 0.9);
        c.start(t + i * 0.018); c.stop(t + tune.tempo * tune.chordEvery);
      });
    }
  }

  // ---------------------------------------------------------------------------
  // Voiced dialogue — pre-generated ElevenLabs clips (scripts/generate-voice.mjs)
  // served as static bundles: audio/voice/index.json lists bundles, and each
  // audio/voice/<bundle>/manifest.json maps "speaker|text" to a clip file.
  // Nothing here talks to ElevenLabs. A missing index, manifest or clip just
  // means that line stays text-only.
  // ---------------------------------------------------------------------------
  const VOICE_ROOT = "audio/voice/";
  const VL = window.VoiceLines || null;
  let voiceIndex = null;          // parsed index.json, or false when unavailable
  let voiceIndexP = null;
  const voiceBundles = {};        // bundle -> Promise<manifest | null>
  let voiceAudio = null;
  let voiceSeq = 0;
  let speaking = false;

  function speechOk() {
    return !!VL && typeof Audio !== "undefined" && typeof fetch === "function";
  }
  function fetchJson(url) {
    return fetch(url, { cache: "no-cache" })
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null);
  }
  function loadVoiceIndex() {
    if (!speechOk()) return Promise.resolve(null);
    if (!voiceIndexP) {
      voiceIndexP = fetchJson(VOICE_ROOT + "index.json").then((j) => {
        voiceIndex = j && j.bundles ? j : false;
        refreshVoiceStatus();
        return voiceIndex || null;
      });
    }
    return voiceIndexP;
  }
  function loadVoiceBundle(name) {
    if (!voiceBundles[name]) {
      voiceBundles[name] = loadVoiceIndex().then((idx) => {
        const meta = idx && idx.bundles[name];
        if (!meta) return null;
        return fetchJson(VOICE_ROOT + meta.manifest).then((m) => (m && m.lines ? m : null));
      });
    }
    return voiceBundles[name];
  }
  function harvestVoices() { loadVoiceIndex(); }
  function refreshVoiceStatus() {
    const el = $("opt-voice-status");
    if (!el) return;
    if (!speechOk()) { el.textContent = "This browser cannot play voice clips — dialogue stays text-only."; return; }
    if (voiceIndex === null) { el.textContent = "Loading voice clips…"; return; }
    if (!voiceIndex) { el.textContent = "Voice clips are not available — dialogue stays text-only."; return; }
    const b = Object.values(voiceIndex.bundles);
    const clips = b.reduce((n, x) => n + (x.clips || 0), 0);
    const missing = b.reduce((n, x) => n + (x.missing || 0), 0);
    el.textContent = clips + " voiced lines (ElevenLabs" + (voiceIndex.model_id ? ", " + voiceIndex.model_id : "") + ")" +
      (missing ? "; " + missing + " lines not voiced yet stay text-only." : ".");
  }
  function setSpeakingName(on) {
    const name = $("vn-name");
    if (name) name.classList.toggle("speaking", !!on && !!name.textContent);
  }
  function speechFinished(seq) {
    if (seq !== voiceSeq) return;
    speaking = false;
    setSpeakingName(false);
    if (S.vn) S.vn.speechDone = true;
  }
  function stopSpeech() {
    voiceSeq++;
    speaking = false;
    setSpeakingName(false);
    if (voiceAudio) {
      const a = voiceAudio;
      voiceAudio = null;
      a.onended = a.onerror = a.onplaying = null;
      try { a.pause(); a.removeAttribute("src"); a.load(); } catch (e) {}
    }
    S._voiceDone = null;
  }
  // Plays the clip for a line; calls onDone once when it ends, fails or is absent.
  function speakLine(sp, text, bundle, onDone) {
    stopSpeech();
    const seq = voiceSeq;
    const done = () => {
      const wasCurrent = seq === voiceSeq;
      speechFinished(seq);
      if (wasCurrent && onDone) onDone();
    };
    if (S.vn) S.vn.speechDone = false;
    if (!S.settings.voice || !speechOk() || !VL.isSpeakable(text)) return done();
    const vol = clamp(S.settings.voiceVol == null ? 0.85 : S.settings.voiceVol, 0, 1);
    if (vol <= 0.01) return done();
    const key = VL.lineKey(sp, text);
    loadVoiceBundle(bundle || "").then((m) => {
      if (seq !== voiceSeq) return;
      const entry = m && m.lines[key];
      if (!entry) return done();
      const a = new Audio();
      a.preload = "auto";
      a.volume = vol;
      a.onplaying = () => { if (seq === voiceSeq) { speaking = true; setSpeakingName(true); } };
      a.onended = done;
      a.onerror = done;
      a.src = VOICE_ROOT + m.bundle + "/" + entry.file;
      voiceAudio = a;
      const p = a.play();
      if (p && p.catch) p.catch(done);
    }, done);
  }
  function previewVoices() {
    if (!speechOk()) return;
    S.settings.voice = true;
    const lines = VL.PREVIEW_LINES.slice();
    const next = () => {
      const l = lines.shift();
      if (l) speakLine(l[0], l[1], "ui", () => setTimeout(next, 280));
    };
    next();
  }
  function voiceBundleFor(sc) {
    return VL ? VL.bundleForScene(sc && sc.id) : "";
  }
  harvestVoices();

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
  // Scale-to-fit. #frame is the visible viewport minus safe-area insets; the
  // 1280x720 #app is placed in it at the largest scale that fits. #app used to
  // be a flex item that shrank to its min-content width on narrow screens
  // (a ~120x220 sliver on phones) before being scaled down by width.
  // The canvas backing store follows scale x devicePixelRatio so it stays
  // crisp on retina phones; drawing code keeps using 1280x720 coordinates.
  const DECK_H = 196;                   // portrait control deck under the game
  let fitKey = "";
  function fit() {
    const frame = $("frame"), app = $("app"), touch = $("touch"), hint = $("rotate-hint");
    const cs = getComputedStyle(frame);
    const pl = parseFloat(cs.paddingLeft) || 0, pr = parseFloat(cs.paddingRight) || 0;
    const pt = parseFloat(cs.paddingTop) || 0, pb = parseFloat(cs.paddingBottom) || 0;
    const vw = frame.clientWidth, vh = frame.clientHeight;
    const fw = Math.max(1, vw - pl - pr), fh = Math.max(1, vh - pt - pb);
    let scale = Math.min(fw / W, fh / H);
    // Portrait phones: the game is width-bound, so the spare band below it
    // becomes a control deck instead of covering the game's own UI.
    const deck = IS_TOUCH && fh - H * scale >= DECK_H + 24;
    const areaH = deck ? fh - DECK_H : fh;
    scale = Math.min(fw / W, areaH / H);
    const gw = W * scale, gh = H * scale;
    const gx = pl + (fw - gw) / 2;
    const gy = pt + (areaH - gh) / 2;
    app.style.transform = `translate(${gx}px, ${gy}px) scale(${scale})`;

    const dpr = window.devicePixelRatio || 1;
    const k = clamp(scale * dpr, 0.5, 2);
    const cw = Math.round(W * k), ch = Math.round(H * k);
    if (canvas.width !== cw || canvas.height !== ch) {
      canvas.width = cw; canvas.height = ch;
    }
    ctx.setTransform(cw / W, 0, 0, ch / H, 0, 0);

    if (IS_TOUCH) {
      touch.classList.toggle("mode-deck", deck);
      touch.classList.toggle("mode-overlay", !deck);
      const set = (n, v) => touch.style.setProperty(n, `${Math.round(v)}px`);
      if (deck) {
        const deckTop = gy + gh;
        const bottom = Math.max(16, (vh - pb - deckTop - 160) / 2) + pb;
        set("--btn-right", pr + 20); set("--btn-bottom", bottom);
        set("--dpad-left", pl + 16); set("--dpad-bottom", bottom - 6);
        hint.style.setProperty("--hint-top", `${Math.round(deckTop + 14)}px`);
      } else {
        const btn = 52, dp = 44;
        const gutL = gx - pl, gutR = vw - pr - (gx + gw);
        set("--btn-right", gutR >= btn + 12 ? pr + (gutR - btn) / 2 : pr + 8);
        set("--btn-top", pt + fh * 0.56);
        set("--dpad-left", gutL >= dp * 3 + 12 ? pl + (gutL - dp * 3) / 2 : pl + 8);
        set("--dpad-bottom", pb + 10);
      }
      hint.classList.toggle("hidden", !deck);
    }
    fitKey = `${vw}x${vh}@${dpr}`;
  }
  window.addEventListener("resize", fit);
  window.addEventListener("orientationchange", () => { fit(); setTimeout(fit, 250); setTimeout(fit, 700); });
  if (window.visualViewport) window.visualViewport.addEventListener("resize", fit);
  // iOS can settle the toolbar / safe areas without a resize event.
  setInterval(() => {
    const f = $("frame");
    if (`${f.clientWidth}x${f.clientHeight}@${window.devicePixelRatio || 1}` !== fitKey) fit();
  }, 1000);

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
    Platform.event("flag", { k, v });
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
    if (DATA.GROWTH[k]) Object.values(S.chars).forEach(applyGrowth);
    if (S.idle) {
      if (k === "hollow_oak_dead") {
        idleAdd("divine_favor", 8, true);
        idleAdd("starlight_dust", 12, true);
      }
      if (k === "quest_canal") idleAdd("ritual_ash", 18, true);
      if (k === "warden_dead") {
        idleAdd("seal_fragments", 24, true);
        S.idle.premium.chronos_crystals += 3;
      }
      if (k === "court_survived") {
        idleAdd("divine_favor", 20, true);
        S.idle.premium.chronos_crystals += 6;
      }
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

  function idleDefaults() {
    const resources = {};
    const unclaimed = {};
    const structures = {};
    const attendants = {};
    const assignments = {};
    const automation = {};
    Object.keys(DATA.IDLE.resources).forEach((k) => { resources[k] = 0; unclaimed[k] = 0; });
    Object.values(DATA.IDLE.structures).forEach((st) => {
      structures[st.id] = { tier: st.id === "incense_grove" || st.id === "central_spire" ? 1 : 0, unlocked: st.id === "incense_grove" || st.id === "central_spire" };
    });
    Object.values(DATA.IDLE.attendants).forEach((at) => {
      attendants[at.id] = { unlocked: at.unlockRank <= 1, rank: 1 };
    });
    Object.values(DATA.IDLE.automationRules).forEach((r) => {
      automation[r.id] = { enabled: r.id === "incense_to_ash", threshold: r.when.pctAbove };
    });
    return {
      version: 1,
      resources,
      unclaimed,
      structures,
      attendants,
      assignments,
      automation,
      focusMode: "balanced",
      report: null,
      overflowLost: {},
      premium: { chronos_crystals: 8, divine_boons: 0, offlineCapBonusHours: 0, speedBoostMins: 0 },
      ascension: { level: 0, multiplier: 1, loreUnlocked: [] },
      event: { activeId: "lunar_bloom", startedAt: Date.now() },
      options: { reducedMotion: false, highContrastIcons: false, simplifiedAutomation: false, sleepMode: false },
      timing: { lastTickAt: Date.now(), lastClaimAt: Date.now(), anomalyCount: 0, anomalyReason: "" }
    };
  }

  function ensureIdleState() {
    if (!S.idle) S.idle = idleDefaults();
    const d = idleDefaults();
    S.idle.resources = Object.assign({}, d.resources, S.idle.resources || {});
    S.idle.unclaimed = Object.assign({}, d.unclaimed, S.idle.unclaimed || {});
    S.idle.structures = Object.assign({}, d.structures, S.idle.structures || {});
    S.idle.attendants = Object.assign({}, d.attendants, S.idle.attendants || {});
    S.idle.assignments = Object.assign({}, d.assignments, S.idle.assignments || {});
    S.idle.automation = Object.assign({}, d.automation, S.idle.automation || {});
    S.idle.premium = Object.assign({}, d.premium, S.idle.premium || {});
    S.idle.ascension = Object.assign({}, d.ascension, S.idle.ascension || {});
    S.idle.event = Object.assign({}, d.event, S.idle.event || {});
    S.idle.options = Object.assign({}, d.options, S.idle.options || {});
    S.idle.timing = Object.assign({}, d.timing, S.idle.timing || {});
    if (!S.idle.focusMode || !DATA.IDLE.focusModes[S.idle.focusMode]) S.idle.focusMode = "balanced";
  }

  function idleStoryRank() {
    const marks = ["hollow_oak_dead", "lyra_joined", "quest_canal", "warden_dead", "thorn_joined", "court_survived"];
    const score = marks.reduce((n, k) => n + (flagOn(k) ? 1 : 0), 0);
    return 1 + score;
  }

  function idleCapacityByResource(resId) {
    ensureIdleState();
    let cap = 80 + idleStoryRank() * 24 + S.idle.ascension.level * 48;
    Object.values(DATA.IDLE.structures).forEach((st) => {
      const inst = S.idle.structures[st.id];
      const tier = inst?.tier || 0;
      if (!tier) return;
      const capAdd = st.baseCapacity + st.perTierCapacity * Math.max(0, tier - 1);
      cap += capAdd;
      if ((st.baseRates[resId] || 0) > 0) cap += capAdd * 0.16;
    });
    return cap;
  }

  function idleTotal(resId) {
    return (S.idle.resources[resId] || 0) + (S.idle.unclaimed[resId] || 0);
  }

  function idleAdd(resId, amount, toClaimable) {
    if (!amount || amount <= 0) return 0;
    const cap = idleCapacityByResource(resId);
    const room = Math.max(0, cap - idleTotal(resId));
    const add = Math.min(room, amount);
    if (add > 0) {
      if (toClaimable) S.idle.unclaimed[resId] = (S.idle.unclaimed[resId] || 0) + add;
      else S.idle.resources[resId] = (S.idle.resources[resId] || 0) + add;
    }
    const lost = amount - add;
    if (lost > 0) S.idle.overflowLost[resId] = (S.idle.overflowLost[resId] || 0) + lost;
    return add;
  }

  function idleConsume(resId, amount) {
    if (!amount || amount <= 0) return true;
    const total = idleTotal(resId);
    if (total + 1e-6 < amount) return false;
    const fromUnclaimed = Math.min(S.idle.unclaimed[resId] || 0, amount);
    S.idle.unclaimed[resId] = (S.idle.unclaimed[resId] || 0) - fromUnclaimed;
    const rem = amount - fromUnclaimed;
    if (rem > 0) S.idle.resources[resId] = Math.max(0, (S.idle.resources[resId] || 0) - rem);
    return true;
  }

  function idleCanAfford(cost) {
    if (!cost) return true;
    return Object.entries(cost).every(([k, v]) => idleTotal(k) >= v);
  }

  function idleSpend(cost) {
    if (!idleCanAfford(cost)) return false;
    Object.entries(cost).forEach(([k, v]) => idleConsume(k, v));
    return true;
  }

  function idleProductionRates() {
    ensureIdleState();
    const rates = {};
    Object.keys(DATA.IDLE.resources).forEach((k) => { rates[k] = 0; });
    const focusBonus = DATA.IDLE.focusModes[S.idle.focusMode]?.bonuses || {};
    const event = DATA.IDLE.events[S.idle.event.activeId];
    const storyRank = idleStoryRank();
    const globalMult = (1 + (storyRank - 1) * 0.07) * (S.idle.ascension.multiplier || 1) * (S.idle.options.sleepMode ? 1.2 : 1);
    Object.values(DATA.IDLE.structures).forEach((st) => {
      const inst = S.idle.structures[st.id];
      const tier = inst?.tier || 0;
      if (!inst?.unlocked || tier <= 0) return;
      const tierMult = 1 + (tier - 1) * 0.18;
      let attendantMult = 1;
      const aid = S.idle.assignments[st.id];
      if (aid && S.idle.attendants[aid]?.unlocked) attendantMult += (DATA.IDLE.attendants[aid]?.bonus || 0);
      Object.entries(st.baseRates).forEach(([resId, base]) => {
        let v = base * tierMult * attendantMult * globalMult;
        if (focusBonus[resId]) v *= 1 + focusBonus[resId];
        if (event && event.bonusResource === resId) v *= 1 + event.bonus;
        rates[resId] += v;
      });
    });
    return rates;
  }

  function idleRunRecipe(recipeId, times) {
    const recipe = DATA.IDLE.recipes[recipeId];
    if (!recipe || times <= 0) return 0;
    let done = 0;
    for (let i = 0; i < times; i++) {
      if (!Object.entries(recipe.in).every(([k, v]) => idleTotal(k) >= v)) break;
      Object.entries(recipe.in).forEach(([k, v]) => idleConsume(k, v));
      Object.entries(recipe.out).forEach(([k, v]) => idleAdd(k, v, true));
      done++;
    }
    return done;
  }

  function idleRunAutomation(seconds) {
    Object.values(DATA.IDLE.automationRules).forEach((rule) => {
      const cfg = S.idle.automation[rule.id];
      if (!cfg?.enabled) return;
      const threshold = cfg.threshold ?? rule.when.pctAbove;
      const cap = idleCapacityByResource(rule.when.resource);
      const pct = cap > 0 ? idleTotal(rule.when.resource) / cap : 0;
      if (pct < threshold) return;
      const autoMult = S.idle.options.simplifiedAutomation ? 1.4 : 1;
      const count = Math.max(1, Math.floor(seconds * rule.runsPerMinute / 60 * autoMult));
      idleRunRecipe(rule.recipe, count);
    });
    const topTier = Object.values(S.idle.assignments).reduce((m, aid) => Math.max(m, DATA.IDLE.attendants[aid]?.automationTier || 0), 0);
    if (topTier >= 3 && seconds >= 1) {
      const claimable = Object.values(S.idle.unclaimed).reduce((n, v) => n + v, 0);
      const cap = Object.keys(DATA.IDLE.resources).reduce((n, k) => n + idleCapacityByResource(k), 0);
      if (claimable > cap * 0.28) idleClaimAll();
    }
  }

  function idleMilestoneUnlocks() {
    const f = S.idle.resources.divine_favor || 0;
    if (f >= 24 && !flagOn("idle_vision_1")) {
      setFlag("idle_vision_1", 1);
      S.quests.idle_vision_1 = "active";
    }
    if (f >= 60 && !flagOn("idle_vision_2")) {
      setFlag("idle_vision_2", 1);
      S.quests.idle_vision_2 = "active";
    }
    if (f >= 60 && S.quests.idle_vision_1 === "active") S.quests.idle_vision_1 = "done";
    if (f >= 90 && S.quests.idle_vision_2 === "active") S.quests.idle_vision_2 = "done";
  }

  function idleSimulate(seconds, mode) {
    ensureIdleState();
    if (!seconds || seconds <= 0) return;
    const rates = idleProductionRates();
    Object.entries(rates).forEach(([resId, r]) => idleAdd(resId, r * seconds, true));
    idleRunAutomation(seconds);
    S.idle.premium.chronos_crystals += seconds * 0.00006 * (1 + (S.idle.ascension.level || 0) * 0.2);
    idleMilestoneUnlocks();
    if (mode === "battleReward") {
      idleAdd("starlight_dust", 4 + idleStoryRank() * 0.5, true);
      idleAdd("temple_offerings", 6 + idleStoryRank(), true);
    }
  }

  function idleOfflineWindows(elapsedSec) {
    ensureIdleState();
    const capFull = 12 * 3600 + (S.idle.premium.offlineCapBonusHours || 0) * 3600;
    const capDim = 24 * 3600;
    const hardCap = 48 * 3600;
    const clamp = Math.max(0, Math.min(elapsedSec, hardCap));
    const full = Math.min(clamp, capFull);
    const dim = Math.min(Math.max(0, clamp - capFull), capDim);
    return { clamp, full, dim, hardCap };
  }

  function idleApplyOffline(elapsedSec, reason) {
    ensureIdleState();
    const now = Date.now();
    const before = Object.assign({}, S.idle.unclaimed);
    const { clamp, full, dim } = idleOfflineWindows(elapsedSec);
    let conservativeFactor = 1;
    if (elapsedSec > 96 * 3600 || elapsedSec < -5) {
      S.idle.timing.anomalyCount++;
      S.idle.timing.anomalyReason = "clock_shift";
      conservativeFactor = 0.1;
      if (elapsedSec < 0) {
        S.idle.timing.lastTickAt = now;
        return;
      }
    } else if (elapsedSec < 0) {
      S.idle.timing.anomalyCount++;
      S.idle.timing.anomalyReason = "negative_time";
      S.idle.timing.lastTickAt = now;
      return;
    }
    const conservative = (S.idle.timing.anomalyCount > 0 ? 0.5 : 1) * conservativeFactor;
    idleSimulate(full * conservative, "offline_full");
    idleSimulate(dim * 0.25 * conservative, "offline_dim");
    const report = {};
    Object.keys(DATA.IDLE.resources).forEach((k) => { report[k] = (S.idle.unclaimed[k] || 0) - (before[k] || 0); });
    S.idle.report = { reason, elapsedSec: clamp, fullSec: full, dimSec: dim, generated: report, at: now };
    S.idle.timing.lastTickAt = now;
  }

  function idleClaimAll() {
    ensureIdleState();
    let gained = 0;
    Object.keys(DATA.IDLE.resources).forEach((k) => {
      const n = S.idle.unclaimed[k] || 0;
      if (n <= 0) return;
      S.idle.resources[k] = (S.idle.resources[k] || 0) + n;
      S.idle.unclaimed[k] = 0;
      const cap = idleCapacityByResource(k);
      if (S.idle.resources[k] > cap) {
        const spill = S.idle.resources[k] - cap;
        S.idle.resources[k] = cap;
        S.idle.overflowLost[k] = (S.idle.overflowLost[k] || 0) + spill;
        gained += n - spill;
      } else {
        gained += n;
      }
    });
    S.idle.timing.lastClaimAt = Date.now();
    if (gained > 0) toast("The attendants lay your offerings at the Seal.");
  }

  function idleApplyAccessibility() {
    ensureIdleState();
    document.body.classList.toggle("reduced-motion", !!S.idle.options.reducedMotion);
    document.body.classList.toggle("high-contrast-icons", !!S.idle.options.highContrastIcons);
  }

  function idleAvailableAttendants() {
    const rank = idleStoryRank();
    return Object.values(DATA.IDLE.attendants).filter((a) => {
      const unlocked = rank >= a.unlockRank;
      if (unlocked) S.idle.attendants[a.id].unlocked = true;
      return S.idle.attendants[a.id].unlocked;
    });
  }

  function idleUpgradeStructure(id) {
    ensureIdleState();
    const st = DATA.IDLE.structures[id];
    const inst = S.idle.structures[id];
    if (!st || !inst) return;
    const rank = idleStoryRank();
    if (rank < st.unlockRank) { toast("Your rank is not yet sufficient for this sanctum."); return; }
    if (!inst.unlocked) inst.unlocked = true;
    const nextTier = inst.tier + 1;
    const scale = Math.pow(1.35, Math.max(0, nextTier - 1));
    const cost = {};
    Object.entries(st.upgradeCost || {}).forEach(([k, v]) => { cost[k] = Math.ceil(v * scale); });
    if (!idleSpend(cost)) { toast("Insufficient offerings for that upgrade."); return; }
    inst.tier = nextTier;
    toast(`${st.name} rises to tier ${nextTier}.`);
  }

  function idleAssignAttendant(structureId, attendantId) {
    ensureIdleState();
    if (!S.idle.attendants[attendantId]?.unlocked) return;
    S.idle.assignments[structureId] = attendantId;
    toast(`${DATA.IDLE.attendants[attendantId].name} now tends the ${DATA.IDLE.structures[structureId].name}.`);
  }

  function idleAscend() {
    ensureIdleState();
    const need = DATA.IDLE.ascension.threshold;
    if (!idleCanAfford(need)) { toast("The Renewal ritual demands more fragments and favor."); return; }
    idleSpend(need);
    const level = (S.idle.ascension.level || 0) + 1;
    S.idle.ascension.level = level;
    S.idle.ascension.multiplier = 1 + level * DATA.IDLE.ascension.gainPerAscension;
    Object.keys(S.idle.resources).forEach((k) => {
      if (k === "chronos_crystals") return;
      S.idle.resources[k] = 0;
      S.idle.unclaimed[k] = 0;
    });
    Object.keys(S.idle.structures).forEach((sid) => {
      const keepBase = sid === "incense_grove" || sid === "central_spire";
      S.idle.structures[sid].tier = keepBase ? 1 : 0;
      S.idle.structures[sid].unlocked = keepBase;
    });
    const lore = DATA.IDLE.ascension.loreUnlocks[(level - 1) % DATA.IDLE.ascension.loreUnlocks.length];
    if (lore && !S.idle.ascension.loreUnlocked.includes(lore)) S.idle.ascension.loreUnlocked.push(lore);
    S.idle.premium.chronos_crystals += 4;
    toast("Renewal complete. The Seal remembers more than before.");
  }

  function idleCycleFocus() {
    const keys = Object.keys(DATA.IDLE.focusModes);
    const idx = Math.max(0, keys.indexOf(S.idle.focusMode));
    S.idle.focusMode = keys[(idx + 1) % keys.length];
    toast(`Focus set: ${DATA.IDLE.focusModes[S.idle.focusMode].name}.`);
  }

  function idleTickRuntime(dt) {
    ensureIdleState();
    const now = Date.now();
    const sec = Math.max(0, Math.min(3, dt / 1000));
    let mult = 1;
    if ((S.idle.premium.speedBoostMins || 0) > 0) {
      mult = 2.25;
      S.idle.premium.speedBoostMins = Math.max(0, S.idle.premium.speedBoostMins - sec / 60);
    }
    idleSimulate(sec * mult, "online");
    if (now - (S.idle.event.startedAt || now) > 1000 * 60 * 20) {
      const ids = Object.keys(DATA.IDLE.events);
      const i = Math.max(0, ids.indexOf(S.idle.event.activeId));
      S.idle.event.activeId = ids[(i + 1) % ids.length];
      S.idle.event.startedAt = now;
      toast(`Season shifts: ${DATA.IDLE.events[S.idle.event.activeId].name}.`);
    }
    S.idle.timing.lastTickAt = now;
  }

  function newGame() {
    S.flags = { intro_done: 0 };
    S.inventory = ["moonwell_chalice", "lotus_petal", "sealing_salve"];
    DATA.ITEMS.moonwell_chalice._uses = 3;
    DATA.ITEMS.lotus_petal._uses = 4;
    DATA.ITEMS.sealing_salve._uses = 2;
    S.quests = { main_pilgrimage: "active", missing_acolyte: "active" };
    S.chars = { elara: makeChar("elara"), kael: makeChar("kael") };
    S.party = ["elara", "kael"];
    S.idle = idleDefaults();
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
      idle: S.idle,
      when: Date.now(),
      lastActiveAt: Date.now()
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
    S.idle = d.idle || idleDefaults();
    ensureIdleState();
    idleApplyAccessibility();
    const last = d.lastActiveAt || d.when || Date.now();
    const elapsed = Math.max(0, (Date.now() - last) / 1000);
    idleApplyOffline(elapsed, "load");
  }
  function saveSlot(n) {
    try { Platform.setItem("soth_slot_" + n, JSON.stringify(serialize())); sfx("save"); toast("Saved to slot " + (n + 1)); }
    catch (e) { toast("Save failed"); }
  }
  function loadSlot(n) {
    try {
      const d = JSON.parse(Platform.getItem("soth_slot_" + n) || "null");
      if (!d) return false;
      if (!Platform.gate(d.mapId, "load")) return false;
      deserialize(d);
      hideAllScreens();
      enterMap();
      Platform.event("progress", { flags: Object.keys(S.flags).filter((k) => S.flags[k]) });
      return true;
    } catch (e) { return false; }
  }
  // Suspend save ("auto" slot): written when the app/tab goes to the background while the
  // player is free on the map, so iOS killing a backgrounded app never loses progress.
  function suspendSave() {
    if (S.state !== "map" && !(S.state === "menu" && S._return === "map")) return null;
    try { const json = JSON.stringify(serialize()); Platform.setItem("soth_slot_auto", json); return json; }
    catch (e) { return null; }
  }
  Platform.on("suspend", suspendSave);
  Platform.on("entitlements", (e) => {
    if (e && e.full && S.state === "map") toast((window.PAYWALL && PAYWALL.copy && PAYWALL.copy.unlockedToast) || "The full journey is open.");
  });
  Platform.on("savesChanged", () => { if (S.state === "title") $("btn-continue").disabled = !hasAnySave(); });
  document.addEventListener("visibilitychange", () => { if (document.hidden && !Platform.native) suspendSave(); });
  const SLOT_IDS = [0, 1, 2, "auto"];
  function hasAnySave() {
    return SLOT_IDS.some((i) => !!Platform.getItem("soth_slot_" + i));
  }
  function latestSave() {
    let best = -1, t = 0;
    for (const i of SLOT_IDS) {
      try {
        const d = JSON.parse(Platform.getItem("soth_slot_" + i) || "null");
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
    playMusic("title");
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
      if (n !== -1) loadSlot(n);
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
    try { Platform.setItem("soth_settings", JSON.stringify(S.settings)); } catch (e) {}
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
  // Location banner: replays its slide-in whenever the area changes.
  function showLocation(name, force) {
    const loc = $("map-location");
    if (!force && loc.textContent === name) return;
    loc.textContent = name;
    loc.classList.remove("enter");
    void loc.offsetWidth;
    loc.classList.add("enter");
  }
  // First visit to a region: a centred title card and the motif's opening.
  function maybeRegionCard(id) {
    const r = DATA.REGIONS && DATA.REGIONS[id];
    if (!r || flagOn("region_" + id)) return;
    S.flags["region_" + id] = 1;
    S.regionCard = { name: r.name, sub: r.sub, t: 0, dur: 3600 };
    playJingle("region");
  }
  function drawRegionCard(dt) {
    const c = S.regionCard;
    if (!c) return;
    c.t += dt;
    if (c.t >= c.dur) { S.regionCard = null; return; }
    const a = Math.min(1, c.t / 500, (c.dur - c.t) / 700);
    const k = Math.min(1, c.t / 900);
    ctx.save();
    ctx.globalAlpha = a;
    const y = H * 0.2;
    const g = ctx.createLinearGradient(0, y - 70, 0, y + 110);
    g.addColorStop(0, "rgba(6,4,12,0)"); g.addColorStop(0.22, "rgba(6,4,12,0.8)"); g.addColorStop(0.88, "rgba(6,4,12,0.8)"); g.addColorStop(1, "rgba(6,4,12,0)");
    ctx.fillStyle = g; ctx.fillRect(0, y - 70, W, 180);
    ctx.fillStyle = "rgba(212,180,106,0.8)";
    const lw = 360 * k;
    ctx.fillRect(W / 2 - lw, y - 34, lw * 2, 1); ctx.fillRect(W / 2 - lw, y + 40, lw * 2, 1);
    ctx.textAlign = "center";
    ctx.font = "44px Iowan Old Style, Palatino, serif";
    ctx.letterSpacing = (14 - 10 * k).toFixed(1) + "px";
    ctx.fillStyle = "#f4ead4";
    ctx.shadowColor = "rgba(0,0,0,0.9)"; ctx.shadowBlur = 16;
    ctx.fillText(c.name, W / 2, y + 12);
    ctx.letterSpacing = "2px";
    ctx.font = "italic 18px Iowan Old Style, Palatino, serif";
    ctx.fillStyle = "#d4b46a";
    ctx.fillText(c.sub, W / 2, y + 66);
    ctx.restore();
  }
  // Ashen Pass vista: the camera pulls back and Meridia's lamps show far below.
  function startVista(ev) {
    if (S.vista) return;
    if (ev.once) S.flags[ev.once] = 1;
    S.vista = { t: 0, dur: 6500, text: ev.text };
    $("map-hud").classList.add("cinematic");
    playJingle("vista");
    if (ev.text) speakLine("", ev.text, "signs");
  }
  function vistaEase() {
    const v = S.vista; if (!v) return 0;
    const inT = 1800, outT = 1100;
    let k;
    if (v.t < inT) k = v.t / inT;
    else if (v.t > v.dur - outT) k = Math.max(0, (v.dur - v.t) / outT);
    else k = 1;
    return k * k * (3 - 2 * k);
  }
  function updateVista(dt) {
    const v = S.vista;
    v.t += dt;
    S.moving = false;
    if (v.t > 1800 && v.t < v.dur - 1100 && pressed("ok")) v.t = v.dur - 1100;
    if (v.t >= v.dur) { S.vista = null; $("map-hud").classList.remove("cinematic"); }
  }
  // Behind the map while the camera pulls back: dusk sky, ridges and the
  // valley floor, so the world past the map's edge reads as distance.
  function drawVistaBackdrop(c) {
    c.save();
    const g = c.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, "#1c1228"); g.addColorStop(0.3, "#4a2a3a"); g.addColorStop(0.44, "#a8603e");
    g.addColorStop(0.5, "#3a2a36"); g.addColorStop(0.75, "#141626"); g.addColorStop(1, "#0a0c16");
    c.fillStyle = g; c.fillRect(0, 0, W, H);
    const ridge = (base, amp, f1, f2, col) => {
      c.fillStyle = col; c.beginPath(); c.moveTo(0, H);
      for (let x = 0; x <= W; x += 20) c.lineTo(x, base + Math.sin(x / f1) * amp + Math.sin(x / f2 + 1.3) * amp * 0.35);
      c.lineTo(W, H); c.fill();
    };
    ridge(H * 0.42, 16, 170, 53, "rgba(40,26,44,0.9)");
    ridge(H * 0.56, 26, 230, 71, "rgba(22,18,32,0.95)");
    ridge(H * 0.74, 34, 300, 91, "rgba(12,12,22,1)");
    // mist bands drifting across the valley
    for (let i = 0; i < 3; i++) {
      const y = H * (0.5 + i * 0.12) + Math.sin(S.anim / 2200 + i) * 6;
      const m = c.createLinearGradient(0, y - 24, 0, y + 24);
      m.addColorStop(0, "rgba(120,100,130,0)"); m.addColorStop(0.5, "rgba(120,100,130,0.16)"); m.addColorStop(1, "rgba(120,100,130,0)");
      c.fillStyle = m; c.fillRect(0, y - 24, W, 48);
    }
    c.restore();
  }
  // The backdrop dissolves the upper map into open sky: the party stands on
  // the lip of the pass with the lowlands beyond.
  let vistaCanvas = null;
  function drawVistaSky(k) {
    if (!vistaCanvas) { vistaCanvas = document.createElement("canvas"); vistaCanvas.width = W; vistaCanvas.height = H; }
    const vc = vistaCanvas.getContext("2d");
    vc.globalCompositeOperation = "source-over";
    vc.clearRect(0, 0, W, H);
    vc.save(); drawVistaBackdrop(vc); vc.restore();
    vc.globalCompositeOperation = "destination-in";
    const mask = vc.createLinearGradient(0, 0, 0, H);
    mask.addColorStop(0, "rgba(0,0,0,1)"); mask.addColorStop(0.5, "rgba(0,0,0,1)"); mask.addColorStop(0.7, "rgba(0,0,0,0)"); mask.addColorStop(1, "rgba(0,0,0,0)");
    vc.fillStyle = mask; vc.fillRect(0, 0, W, H);
    ctx.save(); ctx.globalAlpha = k; ctx.drawImage(vistaCanvas, 0, 0); ctx.restore();
  }
  function drawVistaOverlay() {
    const k = vistaEase();
    if (k <= 0) return;
    ctx.save();
    // Meridia: a rumor of lamps on the horizon
    ctx.globalCompositeOperation = "lighter";
    for (let i = 0; i < 46; i++) {
      const x = W * 0.5 + Math.sin(i * 12.9898) * 220 + Math.cos(i * 4.1) * 60;
      const y = H * 0.4 + Math.abs(Math.sin(i * 78.233)) * 26;
      const tw = 0.55 + Math.sin(S.anim / 260 + i * 1.7) * 0.45;
      const r = 6 + (i % 4);
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, `rgba(255,214,150,${0.9 * tw * k})`); g.addColorStop(1, "rgba(255,180,90,0)");
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, 6.3); ctx.fill();
    }
    ctx.globalCompositeOperation = "source-over";
    // vignette pulls the eye to the lamps
    const vg = ctx.createRadialGradient(W / 2, H * 0.42, H * 0.3, W / 2, H * 0.5, W * 0.7);
    vg.addColorStop(0, "rgba(0,0,0,0)"); vg.addColorStop(1, `rgba(6,4,10,${0.75 * k})`);
    ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
    // letterbox + caption
    const bar = 74 * k;
    ctx.fillStyle = "#000"; ctx.fillRect(0, 0, W, bar); ctx.fillRect(0, H - bar, W, bar);
    if (S.vista && S.vista.text) {
      ctx.globalAlpha = Math.min(1, k * 1.4);
      ctx.textAlign = "center"; ctx.fillStyle = "#f4ead4";
      ctx.font = "italic 24px Iowan Old Style, Palatino, serif";
      ctx.fillText(S.vista.text, W / 2, H - bar / 2 + 8);
    }
    ctx.restore();
  }
  // Screen fade: out to black, run the swap, back in. Input is held meanwhile.
  function fadeSwap(fn, outMs = 170, inMs = 320) {
    if (S.fade && S.fade.phase === "out") return;
    S.fade = { phase: "out", t: 0, outMs, inMs, fn };
  }
  function updateFade(dt) {
    const f = S.fade;
    if (!f) return;
    f.t += dt;
    if (f.phase === "out" && f.t >= f.outMs) {
      f.phase = "in"; f.t = 0;
      const fn = f.fn; f.fn = null;
      if (fn) fn();
    } else if (f.phase === "in" && f.t >= f.inMs) {
      S.fade = null;
    }
  }
  function fadeAlpha() {
    const f = S.fade;
    if (!f) return 0;
    return f.phase === "out" ? Math.min(1, f.t / f.outMs) : Math.max(0, 1 - f.t / f.inMs);
  }
  function enterMap() {
    S.state = "map";
    hideAllScreens();
    $("map-hud").classList.remove("hidden");
    showLocation(map().name);
    playMusic(map().music || "temple");
    maybeRegionCard(S.mapId);
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
    if (!Platform.gate(ev.map, "warp")) {
      toast((window.PAYWALL && PAYWALL.copy && PAYWALL.copy.lockedToast) || "The road ahead is part of the Full Game.");
      return;
    }
    const m = MAPS[ev.map];
    if (!m || S.fade) return;
    S.warpLock = 600;
    sfx("ok");
    fadeSwap(() => {
      S.mapId = ev.map;
      S.px = (ev.tx + 0.5) * T;
      S.py = (ev.ty + 0.5) * T;
      if (ev.dir) S.dir = ev.dir;
      S.trail = [];
      S.warpLock = 400;
      S.camX = S.px - W / 2; S.camY = S.py - H / 2;
      showLocation(m.name, true);
      playMusic(m.music || "temple");
      maybeRegionCard(ev.map);
    });
  }
  // Next optional camp chat the story has unlocked, if any.
  function campChatAvailable() {
    return (DATA.CAMP_CHATS || []).find((c) => c.need.every(flagOn) && !flagOn(c.done) && SCENES[c.scene]) || null;
  }
  function startCampChat(c) {
    setFlag(c.done, 1);
    toast("Camp: " + c.title);
    startScene(c.scene);
  }
  function altarHere() {
    const f = footTile(), fc = facingTile();
    return [...eventsAt(f.x, f.y), ...eventsAt(fc.x, fc.y)].some((e) => e.type === "save");
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
    if (S.idle?.options?.sleepMode) {
      toast("Deep Meditation is active. Disable it from Temple settings to resume rites and dialogue.");
      return;
    }
    const f = facingTile(), here = footTile();
    const list = [...eventsAt(f.x, f.y), ...eventsAt(here.x, here.y)];
    for (const ev of list) {
      if (ev.type === "warp") { tryWarp(ev); return; }
      if (ev.type === "save") {
        restAtAltar(); openMenu();
        const chat = campChatAvailable();
        if (chat) toast(`Camp chat waiting: "${chat.title}". Press C at the altar.`);
        return;
      }
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
      if (ev.type === "encounter") { bigSfx("encounter"); S.flash = 160; startBattle(ev.battle); return; }
      if (ev.type === "block") { talkSimple("", ev.text); return; }
    }
  }
  function stepTriggers() {
    if (S.warpLock > 0) return;
    const f = footTile();
    for (const ev of eventsAt(f.x, f.y)) {
      if (ev.type === "warp") { tryWarp(ev); return; }
      if (ev.type === "vista") { startVista(ev); return; }
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
    if (S.fade) { S.moving = false; return; }
    if (S.vista) { updateVista(dt); return; }
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
      if (altarHere()) {
        const chat = campChatAvailable();
        restAtAltar();
        if (chat) startCampChat(chat); else openMenu();
      }
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
    if (px < -T || py < -T || px > viewW || py > viewH) return;
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

  let viewW = W, viewH = H;
  function drawMap() {
    const m = map();
    // Vista pulls the camera back (zoom out) and drifts it down the slope.
    // Never zoom past the map's own size, and keep the camera inside it, so
    // the pull-back can't reveal the void beyond the map's edges.
    const vk = S.vista ? vistaEase() : 0;
    const minZoom = Math.min(1, Math.max(W / (m.w * T), H / (m.h * T)));
    const zoom = Math.max(minZoom, 1 - 0.35 * vk);
    viewW = W / zoom; viewH = H / zoom;
    let ox = S.camX, oy = S.camY;
    if (vk > 0) {
      ox = clamp(S.px - viewW / 2, 0, Math.max(0, m.w * T - viewW));
      oy = clamp(S.py - viewH * (0.5 + 0.24 * vk), 0, Math.max(0, m.h * T - viewH));
    }
    ctx.fillStyle = "#0a0c10";
    ctx.fillRect(0, 0, W, H);
    ctx.save();
    if (zoom !== 1) ctx.scale(zoom, zoom);
    const x0 = Math.max(0, Math.floor(ox / T) - 1);
    const y0 = Math.max(0, Math.floor(oy / T) - 1);
    const x1 = Math.min(m.w, x0 + Math.ceil(viewW / T) + 2);
    const y1 = Math.min(m.h, y0 + Math.ceil(viewH / T) + 2);
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
    const chatReady = !!campChatAvailable();
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
        if (chatReady) {
          // a waiting camp chat: speech bubble over the altar
          const by = py - 30 + Math.sin(S.anim / 260) * 3;
          ctx.fillStyle = "rgba(244,234,212,0.95)";
          ctx.beginPath(); ctx.ellipse(px, by, 12, 9, 0, 0, 6.3); ctx.fill();
          ctx.beginPath(); ctx.moveTo(px - 3, by + 7); ctx.lineTo(px + 2, by + 13); ctx.lineTo(px + 4, by + 6); ctx.fill();
          ctx.fillStyle = "#3a2a48";
          for (let d = -1; d <= 1; d++) { ctx.beginPath(); ctx.arc(px + d * 5, by, 1.6, 0, 6.3); ctx.fill(); }
        }
      }
      if (ev.type === "npc") {
        drawChibi(px, py, ev.id.includes("lyra") ? "lyra" : ev.id === "thorn" ? "thorn" : "npc", "down", false);
        ctx.fillStyle = ev.hue || "#ddd";
        ctx.beginPath(); ctx.arc(px, py - 12, 7, 0, 6.3); ctx.fill();
        ctx.fillStyle = "#1a1020"; ctx.fillRect(px - 3, py - 14, 2, 2); ctx.fillRect(px + 1, py - 14, 2, 2);
      }
      if (ev.type === "encounter") {
        // Visible, hand-placed foes: a pulsing aura and a shadowed figure.
        const boss = DATA.BATTLES[ev.battle]?.enemies.some((e) => DATA.ENEMIES[e]?.boss);
        const pr = (boss ? 22 : 16) + Math.sin(S.anim / 240 + ev.x) * 3;
        const ag = ctx.createRadialGradient(px, py, 2, px, py, pr);
        ag.addColorStop(0, "rgba(200,40,60,0.55)"); ag.addColorStop(1, "rgba(120,20,40,0)");
        ctx.fillStyle = ag; ctx.beginPath(); ctx.arc(px, py, pr, 0, 6.3); ctx.fill();
        const bob = Math.sin(S.anim / 380 + ev.y) * 2;
        ctx.fillStyle = "rgba(14,8,20,0.92)";
        ctx.beginPath(); ctx.ellipse(px, py - 4 + bob, boss ? 11 : 8, boss ? 15 : 11, 0, 0, 6.3); ctx.fill();
        ctx.fillStyle = "#ff5a6a";
        ctx.fillRect(px - 4, py - 8 + bob, 2, 2); ctx.fillRect(px + 2, py - 8 + bob, 2, 2);
        ctx.fillStyle = "#e8c070";
        ctx.font = "10px serif"; ctx.textAlign = "center";
        ctx.fillText(ev.name || "!", px, py - (boss ? 26 : 20));
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
    const dark = m.indoors ? 0 : nightAlpha();
    if (dark) { ctx.fillStyle = `rgba(8,10,28,${dark})`; ctx.fillRect(0, 0, viewW, viewH); }
    // Lamps bloom through the veil — the canal town should feel lit, not tinted.
    const lampPow = 0.22 + dark * 1.5;
    ctx.globalCompositeOperation = "lighter";
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        if (m.tiles[y][x] !== 12) continue;
        const px = x * T - ox + 16, py = y * T - oy + 10;
        const r = 46 + Math.sin(S.anim / 420 + x * 1.7 + y) * 4;
        const g2 = ctx.createRadialGradient(px, py, 2, px, py, r);
        g2.addColorStop(0, `rgba(255,214,150,${0.5 * lampPow})`);
        g2.addColorStop(0.45, `rgba(240,180,90,${0.2 * lampPow})`);
        g2.addColorStop(1, "rgba(240,180,90,0)");
        ctx.fillStyle = g2;
        ctx.beginPath(); ctx.arc(px, py, r, 0, 6.3); ctx.fill();
      }
    }
    ctx.globalCompositeOperation = "source-over";
    ctx.restore();
    viewW = W; viewH = H;
    if (vk > 0) drawVistaSky(vk);
    drawAmbient();
    if (vk > 0) drawVistaOverlay();
  }
  function nightAlpha() {
    const h = S.time;
    if (h < 6) return 0.45;
    if (h < 8) return 0.2;
    if (h >= 20) return 0.4;
    if (h >= 18) return 0.18;
    return 0;
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
    if (sc.music) playMusic(sc.music);
    else if (!musicId && MAPS[S.mapId]) playMusic(MAPS[S.mapId].music || "temple");
    if (S.settings.voice) loadVoiceBundle(voiceBundleFor(sc));
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
      if (line.fx) lineFx(line.fx);
      speakLine(line.s || "", line.t || "", voiceBundleFor(vn.def));
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
  // Soft keystroke tick for players who read with voices off.
  let blipT = 0;
  function typeBlip() {
    if (!actx || S.settings.vol <= 0) return;
    const t = actx.currentTime;
    if (t - blipT < 0.035) return;
    blipT = t;
    const osc = actx.createOscillator(), g = actx.createGain();
    osc.connect(g); g.connect(master);
    osc.type = "square";
    osc.frequency.setValueAtTime(1500 + Math.random() * 260, t);
    g.gain.setValueAtTime(0.012, t);
    g.gain.exponentialRampToValueAtTime(0.0005, t + 0.03);
    osc.start(t); osc.stop(t + 0.04);
  }
  // Per-line staging directives from dialogue.js: { fx: "shake" | "flash" | ... }
  function lineFx(kind) {
    if (kind === "shake") { S.shake = 16; sfx("hit"); }
    else if (kind === "quake") { S.shake = 26; sfx("unseal"); }
    else if (kind === "flash") { S.flash = 320; }
    else if (kind === "petal") { ambBurst("petal", 18); sfx("petal"); }
    else if (kind === "ember") { ambBurst("ember", 22); sfx("flame"); }
    else if (kind === "chime") sfx("save");
  }
  function renderVn(line) {
    const vn = S.vn;
    const scr = $("screen-vn");
    const left = $("vn-left"), right = $("vn-right");
    const sp = (line && line.s) || "";
    const talk = vn.def.mode === "talk";
    const narration = !sp;

    scr.style.setProperty("--sp", narration ? "#d4b46a" : speakerHue(sp));
    scr.classList.toggle("narration", narration);
    $("vn-name").textContent = speakerName(sp);

    const expr = (line && line.e) || "neutral";
    for (const el of [left, right]) {
      el.className = "vn-portrait";
      el.style.transform = "";
    }
    scr.classList.toggle("no-portrait", talk && sp !== "elara" && sp !== "kael" && sp !== "shade");

    // Who is on screen, and who is speaking. In full VN both leads hold the
    // frame; the listener steps back instead of vanishing.
    const stage = (el, who, focused) => {
      const art = DATA.PORTRAITS[who];
      if (!art) return;
      el.src = art[expr] || art[Object.keys(art)[0]];
      el.classList.add("show", focused ? "focus" : "away", "e-" + expr);
      if (focused && vn.lastSpeaker !== sp) {
        el.classList.remove("pop");
        void el.offsetWidth;
        el.classList.add("pop");
      }
    };

    if (talk) {
      if (sp === "elara" && S.images.elara) stage(left, "elara", true);
      else if ((sp === "kael" || sp === "shade") && S.images.kael) stage(left, "kael", true);
    } else {
      if (S.images.elara) stage(left, "elara", sp === "elara");
      if (S.images.kael) stage(right, "kael", sp === "kael" || sp === "shade");
    }
    vn.lastSpeaker = sp;

    buildVnText(line);
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
      scr.classList.add("choosing");
    } else {
      $("vn-next").style.display = "";
      $("vn-skip").classList.remove("hidden");
      scr.classList.remove("choosing");
    }
  }
  // Dialogue markup: *word* is emphasis. Each glyph becomes a span so the
  // typewriter can fade characters in individually.
  function buildVnText(line) {
    const vn = S.vn;
    const raw = (line && line.t) || "";
    const host = $("vn-text");
    let plain = "", em = false;
    const frag = document.createDocumentFragment();
    const spans = [];
    for (let i = 0; i < raw.length; i++) {
      const c = raw[i];
      if (c === "*") { em = !em; continue; }
      const el = document.createElement("span");
      el.className = em ? "ch em" : "ch";
      el.textContent = c;
      frag.appendChild(el);
      spans.push(el);
      plain += c;
    }
    host.innerHTML = "";
    host.appendChild(frag);
    vn.full = plain;
    vn.spans = spans;
    vn.revealed = 0;
    vn.hold = 0;
    if (vn.shown >= plain.length) vn.shown = plain.length;
    renderVnText();
  }
  // Each speaker owns an accent colour; the VN box, nameplate and glyph reveal
  // all tint from it so who is talking reads before the name does.
  const SPEAKER_HUE = {
    elara: "#a8c6f0", kael: "#e8807c", lyra: "#e2c07a", thorn: "#9dbb8e",
    suyin: "#d6c6f0", shen: "#8fd8c0", shade: "#e070a8", korin: "#e8a870",
    sera: "#f0aec0", bard: "#c4a8e8", keeper: "#a6e0d8", jori: "#f0d490",
    mira: "#e8c0d0", hana: "#f0d0b0", wen: "#c0b8a8", ren: "#cfe0f8",
    echo: "#b090c8", captain: "#9ab0c8", granny: "#d8c0a0", monk: "#a8b8e0",
    pilgrim: "#c8c0a8", baker: "#e8c890", florist: "#e8a8c0", boatman: "#8fc0c8",
    kid2: "#f0dca0", guard: "#a0b0c0", fisherman: "#88b8c8"
  };
  function speakerHue(sp) { return SPEAKER_HUE[sp] || "#d4b46a"; }
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
    if (!vn) return;
    if (!vn.spans) { $("vn-text").textContent = (vn.full || "").slice(0, vn.shown); return; }
    const n = Math.min(vn.spans.length, Math.floor(vn.shown));
    for (let i = vn.revealed; i < n; i++) vn.spans[i].classList.add("on");
    vn.revealed = Math.max(vn.revealed, n);
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
    if (vn.hold > 0) {
      vn.hold -= dt;
    } else if (vn.shown < vn.full.length) {
      const before = Math.floor(vn.shown);
      vn.shown = Math.min(vn.full.length, vn.shown + dt * spd);
      const after = Math.floor(vn.shown);
      if (after > before && S.settings.textSpeed !== 9 && after < vn.full.length) {
        // Let punctuation land. Dialogue reads as speech, not as a ticker.
        const c = vn.full[after - 1];
        if (c === "," || c === ";" || c === ":") vn.hold = 80;
        else if (c === "." || c === "!" || c === "?") vn.hold = 170;
        else if (c === "\u2014" || c === "\u2013") vn.hold = 130;
        else if (!S.settings.voice && (after % 3 === 0) && c !== " ") typeBlip();
      }
    }
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
      playMusic("ending");
    } else if (end.type === "choice_then_battle") {
      startBattle("mirror_shade");
    }
  }

  // ---------------------------------------------------------------------------
  // Battle — LinaHua's loop
  // ---------------------------------------------------------------------------
  const ELARA_START_MANA = 0.4;
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
        side: "p", alive: c.hp > 0,
        // The font starts low every fight: Breaking the Seal is earned in-battle.
        ...(pid === "elara" ? { res: Math.round(c.maxRes * ELARA_START_MANA) } : {})
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
        intro: e.intro, slamBase: e.slamBase
      };
    });
    const boss = foes.find((f) => f.boss);
    S.battle = {
      id, def, pals, foes, log: [], queue: [], qi: 0, phase: "intro",
      menu: "cmd", cmdIdx: 0, skillList: [], targetList: [],
      wait: 700, actor: null, empoweredThisFight: new Set(),
      unsealedHere: false, healingRainAim: null,
      // Intro: iris in, and for bosses a title card before anyone moves.
      introT: 0, introDur: boss ? 2600 : 700, boss: boss || null,
      pendingTutorial: def.tutorial || null,
      // Battle clock for Game Center boss times (time hidden in the background doesn't count).
      t0: performance.now(), hiddenMs: 0, hiddenAt: 0
    };
    S.state = "battle";
    S.cine = null; S.hitStop = 0;
    hideAllScreens();
    $("battle-hud").classList.remove("hidden");
    $("battle-hud").classList.add("cinematic");
    playMusic(boss ? "boss" : "battle");
    if (boss) bigSfx("boom");
    if (S.settings.voice) loadVoiceBundle("battle");
    const intro = foes[0].intro || "Enemies draw near.";
    blog(intro);
    rebuildBattleQueue();
    renderBattleHUD();
  }
  function maybeTutorial(id) {
    if (S.tutorialsSeen[id]) return;
    S.tutorialsSeen[id] = 1;
    const text = {
      basic: { h: "Battle", p: "Turns are slow on purpose. Attack is rarely the whole plan. Watch the log. Z confirms, X backs out." },
      boss1: { h: "The Heart of the Design", p: "Elara spends Mana to Shield, Heal, or Empower. Every fight starts with her font at 40%; it refills when her Wards absorb blows and when she is struck. Meditate restores Mana but takes her turn and leaves her vulnerable. At full Mana she can Break the High Seal: Kael goes Apeshit Berserk for 4 turns, then Elara is Gassed (cannot act) for 2. Many skills CHARGE (empty turns first) or GAS you afterward. The Hollow Oak telegraphs a root slam — Ward Elara before it lands. Empower Kael, then let him charge Hellcoil." },
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
    const el = $("battle-log");
    el.innerHTML = S.battle.log
      .map((l, i) => `<div style="opacity:${(1 - i * 0.26).toFixed(2)};font-size:${(15 - i).toFixed(0)}px">${l}</div>`)
      .join("");
    el.classList.remove("beat");
    void el.offsetWidth;
    el.classList.add("beat");
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
    if (!aliveE().length) {
      // let the last foe finish dissolving before the victory beat
      if (b.foes.some((f) => f.dieT > 0)) { b.phase = "wait"; b.wait = 120; return; }
      beginVictory(); return;
    }
    // extra berserk action: Kael acts twice
    if (b._extraKael) { b._extraKael = false; }
    let guard = 0;
    while (guard++ < 24) {
      if (b.qi >= b.queue.length) rebuildBattleQueue();
      const a = b.queue[b.qi++];
      if (!a || !a.alive) continue;
      if (a._skipTick) a._skipTick = false; else tickBattler(a);
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
        emit("petal", 280, 300, 18);
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
    if (e.ai === "warden" && pct <= 0.33 && (e.phase === 2 || e.phase === 2.5)) {
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
      const cls = "battler-card" + (isActive ? " active-hero acting" : "") + (p.alive ? "" : " down");
      return `<div class="${cls}">
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
      const blocked = !dead && !isActive && !swappableHero(p);
      return `<button class="hero-tab${isActive ? " active" : ""}${dead ? " dead" : ""}${blocked ? " blocked" : ""}" data-hero="${p.id}" title="${p.name}${dead ? " (down)" : blocked ? " (cannot act now)" : ""}">
        ${p.name}
      </button>`;
    }).join("");
    heroSel.querySelectorAll(".hero-tab:not(.dead):not(.blocked)").forEach((btn) => {
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
  // A hero can take the current turn only if they could act right now and
  // still have their own turn pending this round. The two swap slots, so
  // nobody gains or loses an action.
  function heroCanAct(p) {
    return !!p && p.alive && !(p.gassed > 0) && !(p.charging > 0) && !p.meditating && !(p.stun > 0);
  }
  function swappableHero(p) {
    const b = S.battle;
    if (!b || !heroCanAct(p)) return false;
    if (p === b.actor) return true;
    const j = b.queue.indexOf(p);
    return j >= b.qi;
  }
  function selectHero(id) {
    const b = S.battle;
    if (!b || b.phase !== "cmd" || b.healingRainAim) return;
    const pal = b.pals.find((p) => p.id === id);
    if (!pal || pal === b.actor) return;
    if (!swappableHero(pal)) { sfx("cancel"); toast(`${pal.name} cannot act right now.`); return; }
    const cur = b.qi - 1, j = b.queue.indexOf(pal);
    if (cur >= 0 && b.queue[cur] === b.actor) {
      b.queue[cur] = pal; b.queue[j] = b.actor;
      b.actor._skipTick = true;   // already ticked for this turn
    }
    tickBattler(pal);
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
  function canUseBattleSkill(actor, sid) {
    if (!actor || !sid) return null;
    const sk = DATA.SKILLS[sid];
    if (!sk) return null;
    const known = skillsOf(S.chars[actor.id] || actor);
    if (!known.includes(sid)) return null;
    if (sk.berserkOnly && !actor.berserk) return null;
    if (sk.requireFull && actor.res < actor.maxRes) return null;
    const cost = sk.cost === "all" ? actor.res : (sk.cost || 0);
    if (typeof cost === "number" && actor.res < cost) return null;
    return sk;
  }
  function beginHealingRainAim() {
    const b = S.battle;
    if (!b || b.phase !== "cmd" || !b.actor || b.actor.side !== "p") return false;
    const sk = canUseBattleSkill(b.actor, "healing_rain");
    if (!sk) return false;
    b.healingRainAim = { skillId: "healing_rain", radius: 180 };
    requestBattlePointerLock();
    renderBattleHUD();
    toast("Healing Rain ready — aim, then click or Z. X cancels.");
    sfx("ok");
    return true;
  }
  function cancelHealingRainAim(silent = false) {
    if (!S.battle?.healingRainAim) return;
    S.battle.healingRainAim = null;
    releaseBattlePointerLock();
    if (!silent) {
      sfx("cancel");
      renderBattleHUD();
    }
  }
  function confirmHealingRainAim() {
    const b = S.battle;
    if (!b || !b.healingRainAim || !b.actor) return;
    S.mouse.click = false;
    const sk = canUseBattleSkill(b.actor, b.healingRainAim.skillId);
    b.healingRainAim = null;
    releaseBattlePointerLock();
    if (!sk) { sfx("cancel"); renderBattleHUD(); return; }
    useSkill(b.actor, sk, null);
    finishPlayer();
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
    if (it.heal) { t.hp = Math.min(t.maxHp, t.hp + it.heal); blog(`${it.name} restores ${it.heal} HP to ${t.name}.`); sfx("heal"); emit("heal", 300, 300, 10); }
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
    const origin = user.side === "p" ? { x: 280, y: 300 } : { x: 900, y: 260 };
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
      blog("Elara spends the entire font. The High Seal cracks. Kael goes apeshit.");
      startUnsealCine();
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
    // damage — the actor lunges so the hit reads as a hit
    user.lunge = 22;
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
  // Break the High Seal: the battle freezes for a cut-in. Darken, red band,
  // Kael's portrait slides in bound in gold chains; the chains snap.
  function startUnsealCine() {
    S.cine = { kind: "unseal", t: 0, dur: 2700, snapped: false };
    $("battle-hud").classList.add("cinematic");
    bigSfx("chains");
    const [e, k] = VL ? VL.BATTLE_LINES : [];
    if (e) speakLine(e[0], e[1], "battle", () => { if (k) speakLine(k[0], k[1], "battle"); });
  }
  function updateCine(dt) {
    const c = S.cine;
    c.t += dt;
    if (!c.snapped && c.t >= 1100) {
      c.snapped = true;
      bigSfx("snap");
      S.flash = 300; S.shake = 22;
    }
    if (c.t >= c.dur) {
      S.cine = null;
      $("battle-hud").classList.remove("cinematic");
      S.shake = 16;
      emit("unseal", 640, 320, 50);
      renderBattleHUD();
    }
  }
  function drawChain(x0, y0, x1, y1, offset, alpha) {
    const len = Math.hypot(x1 - x0, y1 - y0), n = Math.floor(len / 22);
    const ang = Math.atan2(y1 - y0, x1 - x0);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = "#e8c070"; ctx.lineWidth = 4;
    for (let i = 0; i < n; i++) {
      const f = i / n;
      ctx.save();
      ctx.translate(x0 + (x1 - x0) * f + Math.cos(ang) * offset, y0 + (y1 - y0) * f + Math.sin(ang) * offset);
      ctx.rotate(ang + (i % 2 ? Math.PI / 2 : 0) * 0.0);
      ctx.beginPath(); ctx.ellipse(0, 0, 11, i % 2 ? 3 : 6, i % 2 ? 0 : 0, 0, 6.3); ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
  }
  function drawCine() {
    const c = S.cine;
    if (!c) return;
    const t = c.t;
    const a = Math.min(1, t / 250, (c.dur - t) / 400);
    ctx.save();
    ctx.fillStyle = `rgba(0,0,0,${0.78 * a})`;
    ctx.fillRect(0, 0, W, H);
    // red diagonal band sweeping in from the right
    const slide = Math.min(1, t / 380);
    const bx = W * (1 - slide);
    ctx.globalAlpha = a;
    const band = ctx.createLinearGradient(0, 0, W, 0);
    band.addColorStop(0, "rgba(120,10,24,0.0)"); band.addColorStop(0.35, "rgba(180,20,40,0.85)"); band.addColorStop(1, "rgba(60,0,10,0.95)");
    ctx.fillStyle = band;
    ctx.beginPath();
    ctx.moveTo(bx + W * 0.18, 0); ctx.lineTo(bx + W * 1.2, 0); ctx.lineTo(bx + W * 1.0, H); ctx.lineTo(bx - W * 0.02, H);
    ctx.fill();
    // Kael portrait in a skewed frame
    const img = S.images.kael;
    const pk = Math.min(1, Math.max(0, (t - 120) / 420));
    const ease = 1 - Math.pow(1 - pk, 3);
    const fx = W + 40 - (W * 0.56) * ease;
    if (img) {
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(fx + 90, 40); ctx.lineTo(fx + 560, 40); ctx.lineTo(fx + 470, H - 40); ctx.lineTo(fx, H - 40);
      ctx.clip();
      const ih = H - 80, iw = ih * (img.width / img.height);
      ctx.drawImage(img, fx + 280 - iw / 2, 40, iw, ih);
      ctx.fillStyle = "rgba(200,30,40,0.22)"; ctx.fillRect(fx, 40, 560, H - 80);
      ctx.restore();
      ctx.strokeStyle = "rgba(232,192,112,0.9)"; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(fx + 90, 40); ctx.lineTo(fx + 560, 40); ctx.lineTo(fx + 470, H - 40); ctx.lineTo(fx, H - 40); ctx.closePath(); ctx.stroke();
    }
    // chains across him, snapping at 1.1s and flying apart
    const cx = fx + 280, cy = H / 2;
    if (!c.snapped) {
      const jitter = Math.sin(t / 30) * 2;
      drawChain(cx - 300, cy - 200 + jitter, cx + 300, cy + 200, 0, a);
      drawChain(cx - 300, cy + 200, cx + 300, cy - 200 + jitter, 0, a);
    } else {
      const d = (t - 1100) * 0.6, fa = Math.max(0, 1 - (t - 1100) / 700);
      drawChain(cx - 300 - d, cy - 200 - d * 0.6, cx - 20 - d, cy - 10 - d * 0.6, 0, fa);
      drawChain(cx + 20 + d, cy + 10 + d * 0.6, cx + 300 + d, cy + 200 + d * 0.6, 0, fa);
      drawChain(cx - 300 - d, cy + 200 + d * 0.6, cx - 20 - d, cy + 10 + d * 0.6, 0, fa);
      drawChain(cx + 20 + d, cy - 10 - d * 0.6, cx + 300 + d, cy - 200 - d * 0.6, 0, fa);
    }
    // title
    const tk = Math.min(1, Math.max(0, (t - 300) / 350));
    ctx.globalAlpha = a * tk;
    ctx.textAlign = "left";
    ctx.font = "italic 700 56px Iowan Old Style, Palatino, serif";
    ctx.fillStyle = "#f4ead4"; ctx.shadowColor = "rgba(0,0,0,0.9)"; ctx.shadowBlur = 18;
    ctx.fillText("BREAK THE", 70 - (1 - tk) * 80, H * 0.4);
    ctx.fillStyle = "#ff5a5a";
    ctx.fillText("HIGH SEAL", 110 - (1 - tk) * 120, H * 0.4 + 62);
    ctx.shadowBlur = 0;
    ctx.font = "18px Avenir Next, Segoe UI, sans-serif";
    ctx.fillStyle = "#e8c070";
    ctx.fillText("Kael: Apeshit Berserk, 4 turns  ·  Elara: Gassed, 2 turns", 114, H * 0.4 + 104);
    ctx.restore();
  }
  // Battle intro: iris opening from black, plus the boss title card.
  function drawBattleIntro() {
    const b = S.battle;
    if (!b || b.introT >= b.introDur + 400) return;
    const t = b.introT;
    ctx.save();
    const ir = Math.min(1, t / 520);
    if (ir < 1) {
      const r = Math.hypot(W, H) * 0.5 * (ir * ir);
      ctx.fillStyle = "#000";
      ctx.beginPath(); ctx.rect(0, 0, W, H); ctx.arc(W / 2, H * 0.45, Math.max(1, r), 0, 6.3, true); ctx.fill("evenodd");
      // shard streaks for the cut in
      ctx.strokeStyle = `rgba(255,240,220,${0.5 * (1 - ir)})`; ctx.lineWidth = 2;
      for (let i = 0; i < 10; i++) {
        const ang = i * 0.628 + 0.3;
        ctx.beginPath(); ctx.moveTo(W / 2 + Math.cos(ang) * r, H * 0.45 + Math.sin(ang) * r);
        ctx.lineTo(W / 2 + Math.cos(ang) * (r + 200), H * 0.45 + Math.sin(ang) * (r + 200)); ctx.stroke();
      }
    }
    if (b.boss && t > 350) {
      const ct = t - 350, dur = b.introDur - 350;
      const ca = Math.min(1, ct / 300, Math.max(0, (dur + 300 - ct) / 500));
      const bar = 80 * Math.min(1, ct / 300);
      ctx.fillStyle = "#000"; ctx.fillRect(0, 0, W, bar); ctx.fillRect(0, H - bar, W, bar);
      ctx.globalAlpha = ca;
      const y = H * 0.66;
      const band = ctx.createLinearGradient(0, y - 60, 0, y + 60);
      band.addColorStop(0, "rgba(90,10,20,0)"); band.addColorStop(0.5, "rgba(110,14,28,0.85)"); band.addColorStop(1, "rgba(90,10,20,0)");
      ctx.fillStyle = band; ctx.fillRect(0, y - 60, W, 120);
      const k = Math.min(1, ct / 600);
      ctx.fillStyle = "rgba(232,192,112,0.9)";
      ctx.fillRect(W / 2 - 420 * k, y - 38, 840 * k, 2); ctx.fillRect(W / 2 - 420 * k, y + 44, 840 * k, 2);
      ctx.textAlign = "center";
      ctx.font = "600 50px Iowan Old Style, Palatino, serif";
      ctx.letterSpacing = (18 - 14 * k).toFixed(1) + "px";
      ctx.fillStyle = "#f8e6b8"; ctx.shadowColor = "rgba(0,0,0,0.9)"; ctx.shadowBlur = 20;
      ctx.fillText(b.boss.name.toUpperCase(), W / 2, y + 14);
      ctx.letterSpacing = "1px"; ctx.shadowBlur = 0;
      const ep = DATA.ENEMIES[b.boss.tid]?.epithet;
      if (ep) {
        ctx.font = "italic 19px Iowan Old Style, Palatino, serif";
        ctx.fillStyle = "#f4ead4";
        ctx.fillText(ep, W / 2, y + 74);
      }
    }
    ctx.restore();
  }
  function drawVictory() {
    const b = S.battle;
    if (!b || b.phase !== "victory") return;
    const t = b.vT;
    const a = Math.min(1, t / 300);
    ctx.save();
    ctx.globalAlpha = a;
    const y = H * 0.3;
    const g = ctx.createLinearGradient(0, y - 60, 0, y + 60);
    g.addColorStop(0, "rgba(10,8,4,0)"); g.addColorStop(0.5, "rgba(30,22,6,0.7)"); g.addColorStop(1, "rgba(10,8,4,0)");
    ctx.fillStyle = g; ctx.fillRect(0, y - 60, W, 120);
    const k = Math.min(1, t / 500);
    ctx.textAlign = "center";
    ctx.font = "600 60px Iowan Old Style, Palatino, serif";
    ctx.letterSpacing = (24 - 16 * k).toFixed(1) + "px";
    ctx.fillStyle = "#f8e0a0"; ctx.shadowColor = "rgba(255,200,90,0.6)"; ctx.shadowBlur = 24;
    ctx.fillText("VICTORY", W / 2, y + 20);
    ctx.letterSpacing = "1px"; ctx.shadowBlur = 0;
    ctx.font = "italic 17px Iowan Old Style, Palatino, serif";
    ctx.fillStyle = "#f4ead4";
    ctx.fillText("No experience. The story moves.", W / 2, y + 54);
    ctx.restore();
  }
  function posOf(b) {
    const dirSign = b.side === "p" ? 1 : -1;
    const lunge = (b.lunge || 0) * dirSign;
    const hit = b.flash > 0 ? Math.sin(b.flash / 18) * (b.flash / 60) : 0;
    if (b.side === "p") {
      const i = S.battle.pals.indexOf(b);
      // FF-style diagonal line, kept above the hero tabs even with four.
      return { x: 236 + i * 62 + lunge + hit, y: 222 + i * 48 };
    }
    const i = S.battle.foes.indexOf(b);
    return { x: 900 + (i % 2) * 132 - Math.floor(i / 2) * 70 + lunge + hit, y: 240 + i * 62 };
  }
  // Devotion: Elara's font refills when her Wards drink a blow and when she
  // is struck herself, so the High Seal can be earned inside a fight.
  const DEVOTION_WARD = 0.3, DEVOTION_HURT = 0.15;
  function devotion(amount) {
    const b = S.battle;
    const el = b && b.pals.find((p) => p.id === "elara" && p.alive);
    if (!el || amount <= 0 || el.res >= el.maxRes) return;
    const before = el.res;
    el.res = Math.min(el.maxRes, el.res + amount);
    if (el.res > before) floatTxt(el, "+" + (el.res - before) + " mana", "#9fd0ff");
  }
  function damage(t, n, why) {
    if (t.shield > 0) {
      const use = Math.min(t.shield, n);
      t.shield -= use; n -= use;
      if (t.side === "p" && why === "hit") devotion(Math.min(16, Math.round(use * DEVOTION_WARD)));
      if (n <= 0) { blog(`The Ward absorbs the blow.`); floatTxt(t, "ward", "#7eb8d4"); return; }
    }
    if (t.side === "p" && t.id === "elara" && why === "hit") devotion(Math.min(12, Math.round(n * DEVOTION_HURT)));
    t.hp -= n;
    const heavy = n >= 45;
    t.flash = 240;
    floatTxt(t, "−" + n, why === "heal" ? "#7bc47b" : heavy ? "#ffd27a" : "#ff9aa4", heavy);
    // Shake and hit-stop scale with the damage dealt.
    const sev = Math.min(1, n / 90);
    S.shake = Math.min(26, S.shake + 2 + sev * 16);
    S.hitStop = Math.max(S.hitStop || 0, why === "bleed" ? 0 : 45 + sev * 85);
    if (heavy) S.flash = 140;
    if (t.hp <= 0) {
      t.hp = 0; t.alive = false;
      blog(`${t.name} falls.`);
      sfx("hurt");
      if (t.side === "e") {
        t.dieMax = t.dieT = t.boss ? 1700 : 700;
        const p = posOf(t);
        emit("death", p.x, p.y, t.boss ? 70 : 26);
        if (t.boss) { S.flash = 420; S.shake = 28; S.hitStop = 280; bigSfx("bossdie"); }
        else bigSfx("die");
      }
    }
  }
  function floatTxt(t, text, color, big) {
    const p = posOf(t);
    S.dmgNums.push({ x: p.x + rnd(-10, 10), y: p.y - 24, text, color, life: 900, big: !!big });
  }
  function emit(kind, x, y, n) {
    for (let i = 0; i < n; i++) {
      S.particles.push({
        x: x + (kind === "death" ? rnd(-40, 40) : 0), y: y + (kind === "death" ? rnd(-50, 30) : 0),
        vx: rnd(-1.4, 1.4), vy: rnd(-2.2, -0.2),
        life: (kind === "death" ? 1100 : 700) + Math.random() * 400, kind, t: 0
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
        damage(t, (e.slamBase ?? 38) + e.atk, "hit"); sfx("hit"); emit("hit", posOf(t).x, posOf(t).y, 10);
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
    for (const x of b.pals.concat(b.foes)) {
      if (x.lunge > 0) x.lunge = Math.max(0, x.lunge - dt * 0.12);
      if (x.flash > 0) x.flash -= dt;
    }
    for (const x of b.foes) if (x.dieT > 0) x.dieT -= dt;
    if (b.introT < b.introDur + 400) b.introT += dt; // lets the card fade out after the intro
    if (b.phase === "intro") {
      if (b.introT < b.introDur) return;
      $("battle-hud").classList.remove("cinematic");
      if (b.pendingTutorial) { const t = b.pendingTutorial; b.pendingTutorial = null; maybeTutorial(t); if (b.phase === "tutorial") return; }
      b.phase = "wait"; b.wait = 250 / S.settings.battleSpeed;
      return;
    }
    if (b.phase === "victory") {
      b.vT += dt;
      if (b.vT > 3000 || (b.vT > 1000 && pressed("ok"))) winBattle();
      return;
    }
    if (b.phase === "tutorial") {
      if (pressed("ok") || pressed("cancel")) { $("battle-tutorial").classList.add("hidden"); b.phase = "wait"; b.wait = 300; }
      return;
    }
    if (b.phase === "cmd") {
      if (b.healingRainAim) {
        if (pressed("cancel")) { cancelHealingRainAim(); return; }
        if (pressed("ok") || S.mouse.click) { confirmHealingRainAim(); return; }
        return;
      }
      if (pressed("up")) { b.cmdIdx = Math.max(0, b.cmdIdx - 1); renderBattleHUD(); sfx("ui"); }
      if (pressed("down")) { b.cmdIdx = Math.min((b._items || []).length - 1, b.cmdIdx + 1); renderBattleHUD(); sfx("ui"); }
      if (pressed("ok")) confirmCmd();
      if (pressed("cancel")) {
        if (b.menu !== "cmd") { b.menu = "cmd"; b.cmdIdx = 0; renderBattleHUD(); sfx("cancel"); }
      }
      return;
    }
    if (b.phase === "wait") {
      b.wait -= dt;
      if (b.wait <= 0) nextActor();
    }
  }
  // Victory beat: fanfare, party hop, a held moment before the story resumes.
  function beginVictory() {
    const b = S.battle;
    b.phase = "victory"; b.vT = 0; b.actor = null;
    musicId = null;
    playJingle("victory");
    blog("Victory.");
    $("battle-hud").classList.add("cinematic");
    renderBattleHUD();
  }
  // Summary for the native shell (Game Center achievements + boss-time leaderboards).
  function battleResult(b) {
    const hidden = b.hiddenMs + (b.hiddenAt ? performance.now() - b.hiddenAt : 0);
    return {
      id: b.def && b.def.id, boss: b.boss ? b.boss.tid : null,
      ms: Math.max(0, Math.round(performance.now() - b.t0 - hidden - (b.introDur || 0))),
      unsealed: !!b.unsealedHere, fallen: b.pals.filter((p) => !p.alive).length
    };
  }
  document.addEventListener("visibilitychange", () => {
    const b = S.battle;
    if (!b || b.t0 == null) return;
    if (document.hidden) b.hiddenAt = performance.now();
    else if (b.hiddenAt) { b.hiddenMs += performance.now() - b.hiddenAt; b.hiddenAt = 0; }
  });
  function winBattle() {
    const b = S.battle;
    Platform.haptic("victory");
    Platform.event("battle_won", battleResult(b));
    cancelHealingRainAim(true);
    $("battle-hud").classList.remove("cinematic");
    if (S.idle) idleSimulate(120, "battleReward");
    if (b.def.victoryFlag) setFlag(b.def.victoryFlag, 1);
    const post = b.def.post;
    S.battle = null;
    // Battlers are copies of S.chars; write HP/resource back.
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
    cancelHealingRainAim(true);
    $("battle-hud").classList.remove("cinematic");
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
    // Drifting haze bands read as distance behind the combatants.
    for (let i = 0; i < 4; i++) {
      const y = 180 + i * 90;
      const x = ((S.anim / (60 + i * 22)) % (W + 700)) - 350;
      ctx.fillStyle = `rgba(255,255,255,${0.014 + i * 0.004})`;
      ctx.beginPath(); ctx.ellipse(x, y, 420, 46 - i * 6, 0, 0, 6.3); ctx.fill();
      ctx.beginPath(); ctx.ellipse(x - 720, y, 420, 46 - i * 6, 0, 0, 6.3); ctx.fill();
    }
    drawBattleSkyline(bg);
    // ground plate
    const fg = ctx.createRadialGradient(640, 520, 40, 640, 520, 480);
    fg.addColorStop(0, "rgba(255,255,255,0.075)");
    fg.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = fg;
    ctx.beginPath(); ctx.ellipse(640, 520, 460, 84, 0, 0, 6.3); ctx.fill();
    drawAmbient();
    b.foes.forEach((e, i) => {
      if (!e.alive && !(e.dieT > 0)) return;
      const p = posOf(e);
      drawFoe(p.x, p.y, e);
    });
    b.pals.forEach((p) => {
      if (!p.alive) { ctx.globalAlpha = 0.3; }
      const pos = posOf(p);
      ctx.fillStyle = "rgba(0,0,0,0.32)";
      ctx.beginPath(); ctx.ellipse(pos.x, pos.y + 40, 32, 9, 0, 0, 6.3); ctx.fill();
      if (p.charging > 0) {
        // Charging characters sit inside a tightening ring of light.
        const r = 62 - (S.anim / 12 % 22);
        ctx.strokeStyle = `rgba(212,180,106,${0.15 + (22 - (S.anim / 12 % 22)) / 60})`;
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(pos.x, pos.y, r, 0, 6.3); ctx.stroke(); ctx.lineWidth = 1;
      }
      const hop = b.phase === "victory" && p.alive ? -Math.abs(Math.sin(b.vT / 170 + b.pals.indexOf(p) * 0.9)) * 16 : 0;
      drawChibi(pos.x, pos.y + hop, p.id, "right", p.charging > 0 || hop < 0, null, 3.1);
      if (p.flash > 0) {
        ctx.globalAlpha = Math.min(0.7, p.flash / 300);
        ctx.fillStyle = "#fff";
        ctx.beginPath(); ctx.ellipse(pos.x, pos.y - 6, 32, 46, 0, 0, 6.3); ctx.fill();
        ctx.globalAlpha = 1;
      }
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
        const bob = Math.sin(S.anim / 220) * 5;
        ctx.fillStyle = "rgba(212,180,106,0.16)";
        ctx.beginPath(); ctx.ellipse(pos.x, pos.y + 40, 40, 12, 0, 0, 6.3); ctx.fill();
        ctx.fillStyle = "#f0dca8";
        ctx.beginPath();
        ctx.moveTo(pos.x, pos.y - 66 + bob);
        ctx.lineTo(pos.x - 8, pos.y - 80 + bob);
        ctx.lineTo(pos.x + 8, pos.y - 80 + bob);
        ctx.fill();
      }
    });
    if (b.healingRainAim) {
      const x = clamp(S.mouse.x, 0, W);
      const y = clamp(S.mouse.y, 0, H);
      const r = b.healingRainAim.radius || 180;
      ctx.fillStyle = "rgba(90, 210, 120, 0.22)";
      ctx.strokeStyle = "rgba(150, 255, 170, 0.95)";
      ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(x, y, r, 0, 6.3); ctx.fill(); ctx.stroke();
      ctx.setLineDash([12, 8]);
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x, y, r * 0.62, 0, 6.3); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = "rgba(190, 255, 205, 0.95)";
      ctx.beginPath(); ctx.arc(x, y, 6, 0, 6.3); ctx.fill();
      ctx.lineWidth = 1;
    }
    drawVictory();
    drawBattleIntro();
    drawCine();
  }
  // Parallax silhouettes so each arena reads as a place, not a gradient.
  function drawBattleSkyline(bg) {
    const drift = Math.sin(S.anim / 6000) * 8;
    ctx.save();
    ctx.translate(drift, 0);
    if (bg === "canal") {
      ctx.fillStyle = "rgba(6,18,26,0.55)";
      for (let i = 0; i < 5; i++) {
        const x = 60 + i * 280;
        ctx.fillRect(x, 250, 150, 300);
        ctx.beginPath(); ctx.moveTo(x - 14, 250); ctx.lineTo(x + 75, 196); ctx.lineTo(x + 164, 250); ctx.fill();
      }
      ctx.fillStyle = "rgba(120,200,220,0.06)";
      ctx.fillRect(0, 470, W, 120);
    } else if (bg === "pass") {
      ctx.fillStyle = "rgba(10,8,10,0.5)";
      for (let i = 0; i < 6; i++) {
        const x = i * 260 - 80;
        ctx.beginPath(); ctx.moveTo(x, 520); ctx.lineTo(x + 150, 190 + (i % 3) * 60); ctx.lineTo(x + 300, 520); ctx.fill();
      }
    } else if (bg === "ruins") {
      ctx.fillStyle = "rgba(12,6,14,0.55)";
      for (let i = 0; i < 7; i++) {
        const x = 40 + i * 190, h = 210 + (i % 3) * 70;
        ctx.fillRect(x, 520 - h, 44, h);
        ctx.fillRect(x - 10, 520 - h - 14, 64, 14);
      }
    } else {
      ctx.fillStyle = "rgba(4,14,8,0.5)";
      for (let i = 0; i < 9; i++) {
        const x = i * 155 - 40, h = 220 + (i % 4) * 60;
        ctx.fillRect(x + 26, 520 - h * 0.35, 14, h * 0.35);
        ctx.beginPath(); ctx.arc(x + 33, 520 - h * 0.35, 58, 0, 6.3); ctx.fill();
      }
    }
    ctx.restore();
    // horizon haze
    const hz = ctx.createLinearGradient(0, 430, 0, 560);
    hz.addColorStop(0, "rgba(255,255,255,0)");
    hz.addColorStop(1, "rgba(255,255,255,0.05)");
    ctx.fillStyle = hz; ctx.fillRect(0, 430, W, 130);
  }
  function drawFoe(x, y, e) {
    const k = e.boss ? 2.2 : 1.5;                 // enemies read at party scale
    const float = Math.sin(S.anim / 700 + x) * (e.boss ? 3 : 5);
    // Death: white-out, stretch upward and dissolve.
    const dying = !e.alive && e.dieT > 0;
    const dk = dying ? 1 - e.dieT / e.dieMax : 0;
    ctx.save(); ctx.translate(x, y);
    if (dying) {
      ctx.globalAlpha = Math.max(0, 1 - dk * 1.1);
      ctx.translate(0, -dk * 30);
      ctx.scale(1 - dk * 0.35, 1 + dk * 0.6);
      e.flash = Math.max(e.flash || 0, 320 * (1 - dk));
    }
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.beginPath(); ctx.ellipse(0, 44 * (e.boss ? 1.6 : 1.2), (e.boss ? 62 : 26), 12, 0, 0, 6.3); ctx.fill();
    ctx.save();
    ctx.translate(0, float);
    ctx.scale(k, k);
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
    if (e.flash > 0) {
      ctx.globalAlpha = Math.min(0.65, e.flash / 320);
      ctx.fillStyle = "#fff";
      ctx.beginPath(); ctx.ellipse(0, 0, e.boss ? 46 : 26, e.boss ? 56 : 32, 0, 0, 6.3); ctx.fill();
      ctx.globalAlpha = 1;
    }
    ctx.restore();                                 // end scaled art
    if (dying) { ctx.restore(); return; }
    if (e.telegraph) {
      // Wind-up ring: the tell the whole fight is built around.
      const r = (e.boss ? 132 : 74) + Math.sin(S.anim / 160) * 5;
      ctx.strokeStyle = "rgba(232,192,112,0.95)";
      ctx.setLineDash([6, 6]); ctx.lineWidth = 2.5;
      ctx.lineDashOffset = -S.anim / 40;
      ctx.beginPath(); ctx.arc(0, 0, r, 0, 6.3); ctx.stroke();
      ctx.setLineDash([]); ctx.lineDashOffset = 0; ctx.lineWidth = 1;
      const gg = ctx.createRadialGradient(0, 0, r * 0.5, 0, 0, r);
      gg.addColorStop(0, "rgba(232,192,112,0)");
      gg.addColorStop(1, "rgba(232,192,112,0.16)");
      ctx.fillStyle = gg; ctx.beginPath(); ctx.arc(0, 0, r, 0, 6.3); ctx.fill();
    }
    const ny = e.boss ? -128 : -70;
    ctx.textAlign = "center";
    ctx.font = `${e.boss ? 17 : 14}px Iowan Old Style, Palatino, serif`;
    ctx.lineWidth = 4; ctx.strokeStyle = "rgba(6,4,12,0.85)";
    ctx.strokeText(e.name, 0, ny);
    ctx.fillStyle = e.boss ? "#f0d8a0" : "#e8e0cc";
    ctx.fillText(e.name, 0, ny);
    ctx.lineWidth = 1;
    const bw = e.boss ? 150 : 70, by = e.boss ? 86 : 60;
    const frac = Math.max(0, e.hp / e.maxHp);
    ctx.fillStyle = "rgba(6,6,12,0.85)"; ctx.fillRect(-bw / 2 - 1, by - 1, bw + 2, 9);
    const hg = ctx.createLinearGradient(-bw / 2, 0, bw / 2, 0);
    hg.addColorStop(0, frac < 0.3 ? "#7a1e28" : "#6d2b38");
    hg.addColorStop(1, frac < 0.3 ? "#e04a5a" : "#d45a6a");
    ctx.fillStyle = hg; ctx.fillRect(-bw / 2, by, bw * frac, 7);
    ctx.fillStyle = "rgba(255,255,255,0.25)"; ctx.fillRect(-bw / 2, by, bw * frac, 2);
    ctx.strokeStyle = "rgba(212,180,106,0.5)"; ctx.strokeRect(-bw / 2 - 1.5, by - 1.5, bw + 3, 10);
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
      const idleLore = (S.idle?.ascension?.loreUnlocked || []).map((t) => `<h3>Seal Fragment</h3><p>${t}</p>`).join("");
      body.innerHTML = (lore.map((it) => `<h3>${it.name}</h3><p>${it.desc}</p>`).join("") + idleLore) || "<p>No tablets yet.</p>";
    }
    if (S.menuTab === "temple") {
      ensureIdleState();
      const rates = idleProductionRates();
      const focusName = DATA.IDLE.focusModes[S.idle.focusMode]?.name || "Balanced Growth";
      const event = DATA.IDLE.events[S.idle.event.activeId];
      const offline = S.idle.report;
      const entries = Object.keys(DATA.IDLE.resources).map((k) => {
        const meta = DATA.IDLE.resources[k];
        const vault = S.idle.resources[k] || 0;
        const claim = S.idle.unclaimed[k] || 0;
        const cap = idleCapacityByResource(k);
        const fillPct = cap > 0 ? (idleTotal(k) / cap * 100) : 0;
        return `<div class="idle-card">
          <div class="row"><span>${meta.icon} ${meta.name}</span><span>${vault.toFixed(1)} + ${claim.toFixed(1)}</span></div>
          <div class="bar hp"><i style="width:${Math.min(100, fillPct).toFixed(1)}%"></i></div>
          <p class="mutedline">Rate ${rates[k].toFixed(3)}/s · Cap ${cap.toFixed(0)}</p>
        </div>`;
      }).join("");
      const structRows = Object.values(DATA.IDLE.structures).map((st) => {
        const inst = S.idle.structures[st.id];
        const tier = inst?.tier || 0;
        const unlocked = inst?.unlocked || idleStoryRank() >= st.unlockRank;
        const aid = S.idle.assignments[st.id];
        const an = aid ? DATA.IDLE.attendants[aid]?.name : "Unassigned";
        return `<div class="row">
          <span>${st.name} · ${st.tierZone} · Tier ${tier}${!unlocked ? " (Locked)" : ""}</span>
          <span>
            <button class="tiny temple-up" data-idle-up="${st.id}">Upgrade</button>
            <button class="tiny temple-assign" data-idle-assign="${st.id}">Assign</button>
          </span>
        </div><p class="mutedline">Attendant: ${an}</p>`;
      }).join("");
      const attendants = idleAvailableAttendants().map((a) => `<span class="chip">${a.name} · Tier ${a.automationTier}</span>`).join("");
      const autoRows = Object.values(DATA.IDLE.automationRules).map((rule) => {
        const cfg = S.idle.automation[rule.id];
        const on = !!cfg?.enabled;
        const pct = ((cfg?.threshold ?? rule.when.pctAbove) * 100).toFixed(0);
        return `<div class="row"><span>${rule.id.replaceAll("_", " ")} (${pct}% threshold)</span><span><button class="tiny temple-auto" data-idle-auto="${rule.id}">${on ? "On" : "Off"}</button></span></div>`;
      }).join("");
      const codex = `
        <h3>Seal Codex</h3>
        <p>Formula: <strong>Base Rate × Structure Tier × Attendant Bonus × Story Rank × Ascension</strong>, then focus/event bonuses.</p>
        <p>Offline efficiency: 12h full, then 24h at 25%, then hard-capped. Large clock shifts trigger conservative gains.</p>
        <p>Sleep Mode improves passive rates but is intended for passive sessions rather than active loops.</p>`;
      const offlineBits = offline ? Object.entries(offline.generated || {}).filter(([, v]) => v > 0.05).slice(0, 4).map(([k, v]) => `${DATA.IDLE.resources[k].name}: ${v.toFixed(1)}`).join(" · ") : "";
      const offlineLine = offline ? `<p class="mutedline">While absent (${Math.floor(offline.elapsedSec / 60)}m), attendants gathered power under ${event?.name || "lunar tides"}.${offlineBits ? " " + offlineBits : ""}</p>` : "";
      body.innerHTML = `
        <h3>Temple Overview</h3>
        ${offlineLine}
        <p class="mutedline">Focus: <strong>${focusName}</strong> · Event: <strong>${event?.name || "None"}</strong> · Ascension: <strong>${S.idle.ascension.level}</strong> (x${(S.idle.ascension.multiplier || 1).toFixed(2)}) · Chronos: <strong>${(S.idle.premium.chronos_crystals || 0).toFixed(1)}</strong></p>
        <div class="idle-actions">
          <button class="tiny" data-idle-act="claim">Harvest All</button>
          <button class="tiny" data-idle-act="focus">Cycle Focus</button>
          <button class="tiny" data-idle-act="speed">Spend 3 Chronos (+30m speed)</button>
          <button class="tiny" data-idle-act="cap">Spend 5 Chronos (+1h offline cap)</button>
          <button class="tiny" data-idle-act="ascend">Renewal of the Seal</button>
        </div>
        <h3>Live Production</h3>
        <div class="idle-grid">${entries}</div>
        <h3>Structures</h3>
        ${structRows}
        <h3>Attendants</h3>
        <p>${attendants || "None awakened yet."}</p>
        <h3>Automation</h3>
        ${autoRows}
        <h3>Accessibility & Idle QoL</h3>
        <div class="row"><span>Reduced Motion</span><span><button class="tiny temple-opt" data-idle-opt="reducedMotion">${S.idle.options.reducedMotion ? "On" : "Off"}</button></span></div>
        <div class="row"><span>High Contrast Icons</span><span><button class="tiny temple-opt" data-idle-opt="highContrastIcons">${S.idle.options.highContrastIcons ? "On" : "Off"}</button></span></div>
        <div class="row"><span>Simplified Automation Presets</span><span><button class="tiny temple-opt" data-idle-opt="simplifiedAutomation">${S.idle.options.simplifiedAutomation ? "On" : "Off"}</button></span></div>
        <div class="row"><span>Deep Meditation (Sleep Mode)</span><span><button class="tiny temple-opt" data-idle-opt="sleepMode">${S.idle.options.sleepMode ? "On" : "Off"}</button></span></div>
        <h3>Codex</h3>
        ${codex}
      `;
      body.querySelectorAll("[data-idle-act]").forEach((btn) => btn.addEventListener("click", () => {
        const act = btn.dataset.idleAct;
        if (act === "claim") idleClaimAll();
        if (act === "focus") idleCycleFocus();
        if (act === "ascend") idleAscend();
        if (act === "speed") {
          if ((S.idle.premium.chronos_crystals || 0) >= 3) {
            S.idle.premium.chronos_crystals -= 3;
            S.idle.premium.speedBoostMins = (S.idle.premium.speedBoostMins || 0) + 30;
            toast("Time bends around the spire.");
          } else toast("Not enough Chronos Crystals.");
        }
        if (act === "cap") {
          if ((S.idle.premium.chronos_crystals || 0) >= 5) {
            S.idle.premium.chronos_crystals -= 5;
            S.idle.premium.offlineCapBonusHours = Math.min(24, (S.idle.premium.offlineCapBonusHours || 0) + 1);
            toast("The seal's offline span grows by one hour.");
          } else toast("Not enough Chronos Crystals.");
        }
        renderMenu();
      }));
      body.querySelectorAll("[data-idle-up]").forEach((btn) => btn.addEventListener("click", () => { idleUpgradeStructure(btn.dataset.idleUp); renderMenu(); }));
      body.querySelectorAll("[data-idle-assign]").forEach((btn) => btn.addEventListener("click", () => {
        const sid = btn.dataset.idleAssign;
        const unlocked = idleAvailableAttendants().map((a) => a.id);
        if (!unlocked.length) { toast("No attendants are yet awake."); return; }
        const cur = S.idle.assignments[sid];
        const i = Math.max(-1, unlocked.indexOf(cur));
        const next = unlocked[(i + 1) % unlocked.length];
        idleAssignAttendant(sid, next);
        renderMenu();
      }));
      body.querySelectorAll("[data-idle-auto]").forEach((btn) => btn.addEventListener("click", () => {
        const id = btn.dataset.idleAuto;
        const cur = !!S.idle.automation[id]?.enabled;
        S.idle.automation[id].enabled = !cur;
        renderMenu();
      }));
      body.querySelectorAll("[data-idle-opt]").forEach((btn) => btn.addEventListener("click", () => {
        const key = btn.dataset.idleOpt;
        S.idle.options[key] = !S.idle.options[key];
        idleApplyAccessibility();
        renderMenu();
      }));
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
      body.innerHTML = `<p><button data-act="opt">Options</button></p><p><button data-act="totitle">Return to Title</button></p>` +
        (Platform.upsell("menu") ? `<p><button data-act="fullgame">Unlock the Full Game…</button></p>` : "");
      body.querySelector("[data-act=fullgame]")?.addEventListener("click", () => Platform.paywall("menu"));
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
    if (mode === "load") {
      try {
        const d = JSON.parse(Platform.getItem("soth_slot_auto") || "null");
        if (d) {
          const btn = document.createElement("button");
          btn.className = "save-slot";
          btn.innerHTML = `<div>Suspend save — ${MAPS[d.mapId]?.name || d.mapId}</div><div class="when">${new Date(d.when).toLocaleString()}</div>`;
          btn.addEventListener("click", () => loadSlot("auto"));
          box.appendChild(btn);
        }
      } catch (e) {}
    }
    for (let i = 0; i < 3; i++) {
      let label = "Empty slot " + (i + 1);
      try {
        const d = JSON.parse(Platform.getItem("soth_slot_" + i) || "null");
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
  // ---------------------------------------------------------------------------
  // Ambient mood layer — petals, motes, fireflies, ash. Cheap, scene-aware.
  // ---------------------------------------------------------------------------
  const AMB_MAPS = {
    temple: { petal: 20, mote: 10 },
    village: { petal: 16, mote: 8 },
    forest: { mote: 18, petal: 4 },
    meridia: { petal: 12, mote: 10 },
    ashen: { ash: 22 },
    ruins: { ash: 18, mote: 6 },
    throne: { ash: 26, ember: 6 }
  };
  function ambTarget() {
    if (S.state === "title") return { petal: 22, mote: 12 };
    if (S.state === "battle") {
      const bg = S.battle?.def.bg;
      if (bg === "canal") return { mote: 14 };
      if (bg === "pass") return { ash: 16 };
      if (bg === "ruins") return { ash: 14, ember: 6 };
      return { mote: 10, petal: 6 };
    }
    if (S.state === "map" || (S.state === "vn" && S.vn?.def.mode === "talk")) {
      const m = MAPS[S.mapId];
      if (m?.indoors) return { mote: 6 };
      const base = AMB_MAPS[S.mapId] || { mote: 8 };
      if (nightAlpha() > 0.3 && (S.mapId === "forest" || S.mapId === "village")) {
        return Object.assign({}, base, { firefly: 12 });
      }
      return base;
    }
    if (S.state === "vn") {
      const bg = S.vn?.def.bg;
      if (bg === "forest") return { mote: 14 };
      if (bg === "pass" || bg === "ruins") return { ash: 16 };
      if (bg === "throne") return { ash: 20, ember: 5 };
      if (bg === "forge") return { ember: 14 };
      return { petal: 14, mote: 8 };
    }
    return {};
  }
  function mkAmb(kind, seeded) {
    const y = seeded ? rnd(-40, H) : (kind === "ember" ? H + 10 : -20);
    const a = { kind, x: rnd(-40, W + 40), y, t: rnd(0, 6.3), sz: 3, vx: 0, vy: 0, sway: 0, a: 1 };
    if (kind === "petal") { a.vx = rnd(-0.055, -0.012); a.vy = rnd(0.022, 0.055); a.sz = rnd(3, 6.5); a.sway = rnd(0.4, 1.2); a.a = rnd(0.5, 0.9); }
    else if (kind === "mote") { a.vx = rnd(-0.012, 0.012); a.vy = rnd(-0.02, -0.005); a.y = seeded ? rnd(0, H) : H + 10; a.sz = rnd(1, 2.4); a.a = rnd(0.25, 0.65); }
    else if (kind === "firefly") { a.vx = rnd(-0.02, 0.02); a.vy = rnd(-0.012, 0.012); a.y = rnd(80, H - 60); a.sz = rnd(1.6, 2.8); a.sway = rnd(0.8, 2); a.a = 1; }
    else if (kind === "ash") { a.vx = rnd(-0.03, 0.03); a.vy = rnd(0.012, 0.04); a.sz = rnd(1.5, 3.5); a.sway = rnd(0.3, 0.9); a.a = rnd(0.2, 0.5); }
    else if (kind === "ember") { a.vx = rnd(-0.02, 0.02); a.vy = rnd(-0.09, -0.04); a.sz = rnd(1.4, 2.6); a.a = rnd(0.5, 1); }
    return a;
  }
  function ambBurst(kind, n) {
    for (let i = 0; i < n; i++) {
      const a = mkAmb(kind, true);
      a.y = rnd(H * 0.15, H * 0.75);
      S.amb.push(a);
    }
  }
  function updateAmbient(dt) {
    const want = ambTarget();
    const have = {};
    for (const a of S.amb) have[a.kind] = (have[a.kind] || 0) + 1;
    // Drop motes that no longer belong to this scene, then top up the rest.
    if (S.amb.length && !S._ambState) S._ambState = "";
    const key = S.state + ":" + (S.mapId || "") + ":" + (S.vn?.def.bg || "") + ":" + (S.battle?.def.bg || "");
    if (key !== S._ambKey) {
      S._ambKey = key;
      S.amb = S.amb.filter((a) => want[a.kind]);
      for (const [kind, n] of Object.entries(want)) {
        for (let i = (have[kind] || 0); i < n; i++) S.amb.push(mkAmb(kind, true));
      }
    }
    for (const [kind, n] of Object.entries(want)) {
      if ((have[kind] || 0) < n && Math.random() < dt / 260) S.amb.push(mkAmb(kind, false));
    }
    S.amb = S.amb.filter((a) => {
      a.t += dt / 520;
      a.x += (a.vx + Math.sin(a.t) * a.sway * 0.02) * dt;
      a.y += a.vy * dt;
      if (a.kind === "firefly") {
        a.x += Math.cos(a.t * 0.7) * 0.02 * dt;
        a.y += Math.sin(a.t * 1.1) * 0.014 * dt;
        return a.x > -60 && a.x < W + 60 && a.y > -60 && a.y < H + 60;
      }
      if (a.kind === "ember") { a.a -= dt / 2600; return a.y > -30 && a.a > 0.05; }
      return a.y < H + 30 && a.y > -60 && a.x > -80 && a.x < W + 80;
    });
  }
  function drawAmbient() {
    for (const a of S.amb) {
      if (a.kind === "petal") {
        ctx.globalAlpha = a.a;
        ctx.fillStyle = "#f2d2e2";
        ctx.beginPath();
        ctx.ellipse(a.x, a.y, a.sz, a.sz * 0.5, a.t, 0, 6.3);
        ctx.fill();
      } else if (a.kind === "mote") {
        ctx.globalAlpha = a.a * (0.6 + Math.sin(a.t * 1.6) * 0.4);
        ctx.fillStyle = "#ffe9b8";
        ctx.beginPath(); ctx.arc(a.x, a.y, a.sz, 0, 6.3); ctx.fill();
      } else if (a.kind === "firefly") {
        const pulse = 0.35 + Math.abs(Math.sin(a.t * 1.3)) * 0.65;
        ctx.globalAlpha = pulse;
        const g = ctx.createRadialGradient(a.x, a.y, 0, a.x, a.y, a.sz * 5);
        g.addColorStop(0, "rgba(210,255,150,0.95)");
        g.addColorStop(1, "rgba(180,240,120,0)");
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(a.x, a.y, a.sz * 5, 0, 6.3); ctx.fill();
      } else if (a.kind === "ash") {
        ctx.globalAlpha = a.a;
        ctx.fillStyle = "#b8b0a8";
        ctx.fillRect(a.x, a.y, a.sz, a.sz);
      } else if (a.kind === "ember") {
        ctx.globalAlpha = a.a;
        ctx.fillStyle = "#ff9a50";
        ctx.beginPath(); ctx.arc(a.x, a.y, a.sz, 0, 6.3); ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  function updateFx(dt) {
    S.tileFx += dt;
    S.anim += dt;
    if (S.shake > 0) S.shake *= 0.86;
    if (S.flash > 0) S.flash -= dt;
    updateAmbient(dt);
    if (toastT > 0) toastT -= dt;
    S.particles = S.particles.filter((p) => {
      p.t += dt; p.x += p.vx * dt * 0.06; p.y += p.vy * dt * 0.06; p.life -= dt;
      return p.life > 0;
    });
    S.dmgNums = S.dmgNums.filter((d) => { d.life -= dt; d.y -= dt * 0.038 * (d.life / 900); return d.life > 0; });
  }
  function drawFx() {
    for (const p of S.particles) {
      const a = Math.max(0, p.life / 800);
      ctx.globalAlpha = a;
      if (p.kind === "petal") { ctx.fillStyle = "#e8d0e8"; ctx.beginPath(); ctx.ellipse(p.x, p.y, 4, 2, p.t / 200, 0, 6.3); ctx.fill(); }
      else if (p.kind === "flame" || p.kind === "unseal") { ctx.fillStyle = p.kind === "unseal" ? "#ff6a40" : "#e04030"; ctx.fillRect(p.x, p.y, 3, 6); }
      else if (p.kind === "heal") { ctx.fillStyle = "#80e0a0"; ctx.fillRect(p.x, p.y, 3, 8); }
      else if (p.kind === "death") { ctx.fillStyle = p.t % 300 < 150 ? "#fff6e0" : "#e8c070"; ctx.fillRect(p.x, p.y, 3, 3); p.vy -= 0.004; }
      else { ctx.fillStyle = "#f4ead4"; ctx.fillRect(p.x, p.y, 2, 2); }
    }
    ctx.globalAlpha = 1;
    ctx.textAlign = "center";
    for (const d of S.dmgNums) {
      const k = 1 - d.life / 900;                     // 0 at spawn, 1 at death
      const pop = k < 0.18 ? 1.45 - k * 2.2 : 1;      // punchy scale-in
      const size = (d.big ? 34 : 24) * pop;
      ctx.globalAlpha = Math.max(0, Math.min(1, d.life / 500));
      ctx.font = `600 ${size.toFixed(1)}px ${d.big ? "Iowan Old Style, Palatino, serif" : "Avenir Next, Segoe UI, sans-serif"}`;
      ctx.lineWidth = 4; ctx.strokeStyle = "rgba(6,4,12,0.9)";
      ctx.strokeText(d.text, d.x, d.y);
      ctx.fillStyle = d.color;
      ctx.fillText(d.text, d.x, d.y);
    }
    ctx.globalAlpha = 1; ctx.lineWidth = 1;
    if (toastT > 0) {
      const a = Math.min(1, toastT / 400);
      ctx.globalAlpha = a;
      const g = ctx.createLinearGradient(0, 24, 0, 66);
      g.addColorStop(0, "rgba(28,22,44,0.94)"); g.addColorStop(1, "rgba(10,8,18,0.94)");
      ctx.fillStyle = g;
      ctx.fillRect(W / 2 - 270, 24, 540, 42);
      ctx.strokeStyle = "rgba(212,180,106,0.85)"; ctx.strokeRect(W / 2 - 270, 24, 540, 42);
      ctx.fillStyle = "rgba(212,180,106,0.35)";
      ctx.fillRect(W / 2 - 270, 24, 540, 1);
      ctx.fillStyle = "#f4ead4"; ctx.font = "17px Iowan Old Style, Palatino, serif";
      ctx.fillText(toastMsg, W / 2, 51);
      ctx.globalAlpha = 1;
    }
    if (S.flash > 0) {
      ctx.fillStyle = `rgba(255,248,230,${Math.min(0.85, S.flash / 420)})`;
      ctx.fillRect(0, 0, W, H);
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
    updateFade(dt);
    if (S.state !== "boot") idleTickRuntime(dt);
    ctx.save();
    if (S.shake > 0.4) ctx.translate((Math.random() - 0.5) * S.shake, (Math.random() - 0.5) * S.shake);
    if (S.state === "title" || S.state === "credits" || S.state === "options" || S.state === "saves") {
      // Painted backdrop with a slow Ken Burns drift so the title breathes.
      if (S.images.title) {
        const k = 1.07 + Math.sin(S.anim / 11000) * 0.025;
        const dw = W * k, dh = H * k;
        const px = (W - dw) / 2 + Math.sin(S.anim / 15000) * 16;
        const py = (H - dh) / 2 + Math.cos(S.anim / 19000) * 10;
        ctx.drawImage(S.images.title, px, py, dw, dh);
      } else { ctx.fillStyle = "#0c0914"; ctx.fillRect(0, 0, W, H); }
      drawAmbient();
      if (S.state === "title") updateTitle();
      if (S.state === "credits" && pressed("cancel")) showTitle();
      if (S.state === "options" && pressed("cancel")) {
        if (S._optFrom === "title") showTitle(); else openMenu();
      }
    } else if (S.state === "map") {
      updateMap(dt); drawMap();
    } else if (S.state === "vn") {
      if (S.vn?.def.mode === "talk") drawMap();
      else {
        if (S.images.title && S.vn?.def.bg === "temple") {
          const k = 1.05 + Math.sin(S.anim / 14000) * 0.015;
          ctx.drawImage(S.images.title, (W - W * k) / 2, (H - H * k) / 2, W * k, H * k);
        } else {
          ctx.fillStyle = "#100c18"; ctx.fillRect(0, 0, W, H);
        }
        drawAmbient();
      }
      updateVn(dt);
    } else if (S.state === "battle") {
      if (S.cine) updateCine(dt);
      else if (S.hitStop > 0) S.hitStop -= dt;    // freeze-frame on impact
      else updateBattle(dt);
      drawBattle();
    } else if (S.state === "menu") {
      drawMap();
      if (pressed("menu") || pressed("cancel")) closeMenu();
    } else if (S.state === "gameover") {
      ctx.fillStyle = "#100808"; ctx.fillRect(0, 0, W, H);
    }
    drawFx();
    ctx.restore();
    if (S.state === "map" || S.state === "vn" || S.state === "menu") drawRegionCard(dt);
    const fa = fadeAlpha();
    if (fa > 0) { ctx.fillStyle = `rgba(4,3,8,${fa.toFixed(3)})`; ctx.fillRect(0, 0, W, H); }
    S.mouse.click = false;
    requestAnimationFrame(frame);
  }

  // Boot
  async function boot() {
    fit();
    try {
      const st = JSON.parse(Platform.getItem("soth_settings") || "null");
      if (st) Object.assign(S.settings, st);
    } catch (e) {}
    ensureIdleState();
    idleApplyAccessibility();
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
