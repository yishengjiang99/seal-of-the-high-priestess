/* =============================================================================
   DATA TABLES — extend these to grow the game. Maps to LinaHua's design:
   named gear only, no XP grind, charge/gassed costs, Elara mana ↔ Kael unseal.
   ============================================================================= */
window.DATA = (() => {
  const C = {};

  C.TITLE = "Seal of the High Priestess";
  C.SUBTITLE = "A Journey of Purification and Poisoned Words";

  // ---- Characters (story stats; power rises only via flags / named gear) ----
  C.CHARS = {
    elara: {
      id: "elara", name: "Elara", role: "High Priestess",
      resName: "Mana", resKey: "mana",
      maxHp: 92, maxRes: 100, atk: 12, def: 14, spd: 11, acc: 96,
      color: "#c9d4e8", accent: "#7eb8d4",
      skills: ["lotus_ward", "silver_mercy", "congregation", "empower", "meditate", "unseal"],
      weapon: null, armor: "novice_robe", accessory: null,
      bio: "Seventeen. High Priestess of the Silver Lotus. Super-intelligent, preternaturally wise in lore and ritual — and still emotionally seventeen."
    },
    kael: {
      id: "kael", name: "Kael", role: "Sealed Demon Prince",
      resName: "Fury", resKey: "fury",
      maxHp: 128, maxRes: 80, atk: 22, def: 16, spd: 14, acc: 92,
      color: "#c23b4a", accent: "#5a1a1a",
      skills: ["mock", "crimson_cut", "hellcoil", "abyssal_bloom", "thronebreaker"],
      weapon: "shackled_fang", armor: "torn_court_coat", accessory: null,
      bio: "Eighteen. Former Demon Prince. Betrayed, cast out, subdued by humanity. Sharp-tongued tsundere bound as Elara's escort."
    },
    lyra: {
      id: "lyra", name: "Lyra", role: "Temple Scout",
      resName: "Focus", resKey: "focus",
      maxHp: 86, maxRes: 90, atk: 20, def: 12, spd: 18, acc: 98,
      color: "#c4a06a", accent: "#3a5a2a",
      skills: ["pinpoint", "detect", "needle_rain", "smoke_veil"],
      weapon: "temple_recurve", armor: "scout_cloak", accessory: null,
      bio: "Pragmatic former temple guardian. Dry humor. Ranged utility and detection."
    },
    thorn: {
      id: "thorn", name: "Thorn", role: "Bound Bruiser",
      resName: "Blood", resKey: "blood",
      maxHp: 170, maxRes: 70, atk: 24, def: 26, spd: 8, acc: 88,
      color: "#7a8a6a", accent: "#3a2a1a",
      skills: ["iron_guard", "blood_price", "crushing_bind", "last_wall"],
      weapon: "binding_gauntlets", armor: "patched_pauldron", accessory: null,
      bio: "Reformed mid-tier demon under a lesser seal. Gruff. Loyal once earned. Tank who pays in his own blood."
    }
  };

  // Story-flag stat bumps (no XP). Applied when flag is set.
  C.GROWTH = {
    hollow_oak_dead: { elara: { maxHp: 8, maxRes: 10 }, kael: { maxHp: 10, atk: 2 } },
    lyra_joined: { lyra: { maxHp: 6 } },
    warden_dead: { elara: { def: 2, maxRes: 8 }, kael: { atk: 3 }, lyra: { atk: 2 } },
    thorn_joined: { thorn: { maxHp: 12 } },
    court_survived: { kael: { maxHp: 14, maxRes: 10 }, elara: { maxHp: 10 } },
    unsealed_once: { kael: { atk: 4 } }
  };

  // ---- Skills ----
  // charge: empty turns spent preparing (vulnerable). gassed: skipped turns AFTER the skill.
  C.SKILLS = {
    attack: { id: "attack", name: "Attack", desc: "A basic strike. Never the answer to a boss — but it buys a turn.", cost: 0, target: "enemy", power: 10 },

    lotus_ward: {
      id: "lotus_ward", name: "Lotus Ward",
      desc: "A barrier of silver-lotus light. Absorbs harm for one ally. Costs moderate Mana.",
      cost: 18, target: "ally", shield: 52, fx: "petal"
    },
    silver_mercy: {
      id: "silver_mercy", name: "Silver Mercy",
      desc: "Restore HP to one ally. Scaling with remaining composure, not with grind.",
      cost: 14, target: "ally", heal: 38, fx: "heal"
    },
    congregation: {
      id: "congregation", name: "Congregation",
      desc: "A wide mercy. Restores the whole party — expensive, and you will miss the Mana.",
      cost: 28, target: "allies", heal: 22, fx: "heal"
    },
    empower: {
      id: "empower", name: "Blessing of the Lotus",
      desc: "The next attack of one ally deals bonus damage and may rattle the foe's stance.",
      cost: 22, target: "ally", empower: 1, fx: "petal"
    },
    meditate: {
      id: "meditate", name: "Meditate",
      desc: "Elara withdraws from the fight to restore a large portion of Mana. Completely vulnerable. The party must cover her.",
      cost: 0, target: "self", meditate: 44, vulnerable: true, fx: "petal"
    },
    unseal: {
      id: "unseal", name: "Break the High Seal",
      desc: "Spend the entire Mana font to crack Kael's binding. He enters Apeshit Berserk for 4 turns. Elara is then Gassed for 2 turns. The seal reasserts afterward with a cooldown.",
      cost: "all", requireFull: true, target: "self", unseal: true, selfGassed: 2, berserkTurns: 4, fx: "unseal"
    },
    lotus_palm: {
      id: "lotus_palm", name: "Lotus Palm",
      desc: "A technique taught by Master Shen. A precise strike that ignores a portion of defense and plants a purifying mark.",
      cost: 16, target: "enemy", power: 14, pierce: 0.4, mark: true, needFlag: "quest_shen", fx: "petal"
    },

    mock: {
      id: "mock", name: "Poisoned Word",
      desc: "Kael insults a foe so precisely their will flinches. Accuracy down. Costs little Fury.",
      cost: 8, target: "enemy", mock: 3, fx: "mock"
    },
    crimson_cut: {
      id: "crimson_cut", name: "Crimson Cut",
      desc: "A moderate sealed slash. All he is allowed, until she spends herself.",
      cost: 16, target: "enemy", power: 16, fx: "flame"
    },
    hellcoil: {
      id: "hellcoil", name: "Hellcoil",
      desc: "A coiled killing stroke. Requires one empty charging turn — Kael is a statue, and then he is a disaster.",
      cost: 24, target: "enemy", power: 28, charge: 1, fx: "flame"
    },
    abyssal_bloom: {
      id: "abyssal_bloom", name: "Abyssal Bloom",
      desc: "Berserk only. Dark fire blooms across every enemy. This is why they bound him.",
      cost: 20, target: "enemies", power: 22, aoe: true, berserkOnly: true, fx: "flame"
    },
    thronebreaker: {
      id: "thronebreaker", name: "Thronebreaker",
      desc: "Berserk only. A single-target atrocity. Afterward Kael is Gassed for a turn even inside the rage.",
      cost: 28, target: "enemy", power: 40, berserkOnly: true, gassed: 1, fx: "flame"
    },
    poisoned_benediction: {
      id: "poisoned_benediction", name: "Poisoned Benediction",
      desc: "Kael turns a court-curse into a blessing that hurts. Applies a slow bleed. Learned from a letter he was never meant to read.",
      cost: 18, target: "enemy", power: 12, bleed: 3, needFlag: "quest_letter", fx: "flame"
    },

    pinpoint: {
      id: "pinpoint", name: "Pinpoint Shot",
      desc: "A single arrow where it matters.",
      cost: 12, target: "enemy", power: 15, fx: "arrow"
    },
    detect: {
      id: "detect", name: "Detect Weakness",
      desc: "Lyra reads a stance the way other people read weather. Marked foes take bonus damage.",
      cost: 10, target: "enemy", mark: true, fx: "arrow"
    },
    needle_rain: {
      id: "needle_rain", name: "Rain of Needles",
      desc: "A sky of arrows. One charging turn. Punishes clustered pride.",
      cost: 22, target: "enemies", power: 16, aoe: true, charge: 1, fx: "arrow"
    },
    smoke_veil: {
      id: "smoke_veil", name: "Smoke Veil",
      desc: "The party becomes rumor. Evade up, then Lyra is Gassed for a turn — she ran the fuse herself.",
      cost: 16, target: "allies", evade: 2, gassed: 1, fx: "smoke"
    },
    scouts_mercy: {
      id: "scouts_mercy", name: "Scout's Mercy",
      desc: "A shot that interrupts a telegraph. Learned watching Elara refuse to let a child die in a canal.",
      cost: 14, target: "enemy", power: 10, interrupt: true, needFlag: "quest_canal", fx: "arrow"
    },

    iron_guard: {
      id: "iron_guard", name: "Iron Guard",
      desc: "Thorn becomes the door. Taunts, defense up.",
      cost: 10, target: "self", taunt: 2, defUp: 2, fx: "guard"
    },
    blood_price: {
      id: "blood_price", name: "Blood Price",
      desc: "He pays HP to hit like a siege engine. Self-damage is the point.",
      cost: 12, target: "enemy", power: 24, selfDamage: 18, fx: "blood"
    },
    crushing_bind: {
      id: "crushing_bind", name: "Crushing Bind",
      desc: "One charging turn. A chance to stun. He knows seals from the inside.",
      cost: 18, target: "enemy", power: 20, charge: 1, stun: 0.55, fx: "guard"
    },
    last_wall: {
      id: "last_wall", name: "Last Wall",
      desc: "A huge party shield. Thorn is Gassed for 2 turns after. Use it like a vow.",
      cost: 22, target: "allies", shieldAll: 40, gassed: 2, fx: "guard"
    }
  };

  // ---- Named items / gear (no generic shops) ----
  C.ITEMS = {
    novice_robe: { id: "novice_robe", name: "Novice Lotus Robe", slot: "armor", who: "elara", def: 2, desc: "White cloth that has never yet been washed of someone else's blood." },
    veil_first_oath: { id: "veil_first_oath", name: "Veil of the First Oath", slot: "armor", who: "elara", def: 6, maxRes: 12, desc: "Reforged by Korin from temple-silk and a daughter's kept promise. Elara's sleeves run with gold that was not there yesterday." },
    prayer_beads: { id: "prayer_beads", name: "Silver Lotus Prayer Beads", slot: "accessory", who: "elara", manaRegen: 4, desc: "An acolyte's beads, returned. Each click is a name Elara refused to forget." },
    shackled_fang: { id: "shackled_fang", name: "Shackled Fang", slot: "weapon", who: "kael", atk: 4, desc: "A blade allowed him the way a dog is allowed teeth. The seal hums in the fuller." },
    shard_crown: { id: "shard_crown", name: "Shard of the Betrayed Crown", slot: "accessory", who: "kael", crit: 12, furyOnHit: 3, desc: "A splinter of the circlet they tore from him. He will not put it on. He will not put it down." },
    torn_court_coat: { id: "torn_court_coat", name: "Torn Court Coat", slot: "armor", who: "kael", def: 3, desc: "Black and crimson. The tears are original. The seals are not." },
    temple_recurve: { id: "temple_recurve", name: "Temple Recurve", slot: "weapon", who: "lyra", atk: 3, desc: "Standard issue, except Lyra has not been standard in years." },
    whisperwood_bow: { id: "whisperwood_bow", name: "Whisperwood Longbow", slot: "weapon", who: "lyra", atk: 8, acc: 4, desc: "Cut from a tree that still remembers being a person. It does not forgive. It does aim." },
    scout_cloak: { id: "scout_cloak", name: "Scout's Cloak", slot: "armor", who: "lyra", def: 2, spd: 1, desc: "Olive, mended, smelling faintly of lamp oil and canal water." },
    binding_gauntlets: { id: "binding_gauntlets", name: "Thorn's Binding Gauntlets", slot: "weapon", who: "thorn", atk: 5, def: 2, desc: "The same metal that binds him, turned outward. He asked for this." },
    patched_pauldron: { id: "patched_pauldron", name: "Patched Pauldron", slot: "armor", who: "thorn", def: 5, desc: "Iron that has been hit by worse than you." },
    climber_charm: { id: "climber_charm", name: "Ashen Pass Climber's Charm", slot: "accessory", who: "any", def: 2, hazard: true, desc: "A prayer against falling rock, tied in red string by someone who did not make the summit." },
    seal_circlet: { id: "seal_circlet", name: "Seal-Scribed Circlet", slot: "accessory", who: "elara", maxRes: 8, unsealBonus: 1, desc: "A tablet's worth of old law, beaten into a thin crown. It knows how to talk to seals." },
    lantern_meridia: { id: "lantern_meridia", name: "Lantern of Meridia", slot: "accessory", who: "any", acc: 4, desc: "A canal-lantern that does not go out in the presence of a lie. The keeper said this like a joke. It was not." },
    moonwell_chalice: { id: "moonwell_chalice", name: "Moonwell Chalice", type: "consumable", uses: 3, heal: 64, desc: "Temple water that has seen the moon. Three draughts. Not for sale." },
    lotus_petal: { id: "lotus_petal", name: "Pressed Lotus Petal", type: "consumable", uses: 4, res: 22, resOf: "elara", desc: "A petal from the sanctum pond. Restores Elara's Mana. She hates using them. She will." },
    sealing_salve: { id: "sealing_salve", name: "Sealing Salve", type: "consumable", uses: 2, ungassed: 1, desc: "A bitter paste. Shortens Gassed by one turn. The abbess's private recipe." },
    lore_west: { id: "lore_west", name: "Pilgrim's Primer: The Westward Rite", type: "lore", desc: "Purification is not cleanliness. It is a road. The demons of Aetheria were not born monstrous; they were left unburied by an old war." },
    lore_kael: { id: "lore_kael", name: "Fragment: The Night of Knives", type: "lore", desc: "The Demon Court ate its own prince at midnight. Humanity's ritualists arrived at dawn, and found a boy already kneeling in his own blood, too proud to fall over." },
    lore_throne: { id: "lore_throne", name: "Ash-Tablet 7", type: "lore", desc: "The Demon King sleeps because a High Priestess asked him to. The seal is a conversation. Conversations end." }
  };

  C.QUESTS = {
    main_pilgrimage: { id: "main_pilgrimage", name: "The Westward Purification", main: true, steps: [
      "Receive the rite at Silver Lotus Temple",
      "Cross the Whispering Forest",
      "Seek passage in Meridia",
      "Survive Ashen Pass",
      "Walk the Betrayed Court",
      "Stand at the Throne of Ash"
    ]},
    missing_acolyte: { id: "missing_acolyte", name: "The Missing Acolyte", desc: "Acolyte Mira has not returned from the village canals. Abbess Suyin will not say she is afraid.", reward: "prayer_beads" },
    canal_fox: { id: "canal_fox", name: "The Canal's Hungry Mouth", desc: "A child swears a fox of water stole his sister's shoe. Lyra swears children lie. Someone is drowning.", reward: "scouts_mercy" },
    master_shen: { id: "master_shen", name: "The Man in the Trees", desc: "A wandering master was last seen walking into the Whispering Forest to argue with a tree. Rescue him.", reward: "lotus_palm" },
    blacksmith_daughter: { id: "blacksmith_daughter", name: "The Kept Promise", desc: "Korin the smith will not sell you a better sword. He will reforge what you already love, if you bring his daughter home from a rumor.", reward: "veil_first_oath" },
    sealed_letter: { id: "sealed_letter", name: "The Sealed Letter", desc: "A tavern bard is selling a letter sealed with a demon-prince's mark. Kael pretends not to hear.", reward: "poisoned_benediction" },
    lantern_keeper: { id: "lantern_keeper", name: "The Lantern That Won't Lie", desc: "The keeper of Meridia's canal-lights wants a witness for something he cannot say in daylight.", reward: "lantern_meridia" },
    courtyard_tablet: { id: "courtyard_tablet", name: "The Courtyard Tablet", desc: "In Kael's former palace, a tablet still waits to be read by someone who is not a demon.", reward: "seal_circlet" },
    bound_hound: { id: "bound_hound", name: "The Bound Hound", desc: "Something large is chained in Ashen Pass, answering to a name Thorn flinches at.", reward: "climber_charm" }
  };

  // ---- Enemies / bosses ----
  C.ENEMIES = {
    wisp: { id: "wisp", name: "Hollow Wisp", maxHp: 36, atk: 10, def: 4, spd: 12, acc: 85, skills: ["nibble"], color: "#a0d0e8" },
    vine: { id: "vine", name: "Spite-Vine", maxHp: 48, atk: 12, def: 8, spd: 8, acc: 80, skills: ["lash", "tangle"], color: "#4a6a3a" },
    ashling: { id: "ashling", name: "Ashling", maxHp: 40, atk: 14, def: 5, spd: 14, acc: 88, skills: ["cinder"], color: "#c07040" },
    court_echo: { id: "court_echo", name: "Court Echo", maxHp: 70, atk: 16, def: 10, spd: 13, acc: 90, skills: ["mock_echo", "slash"], color: "#8a4a6a" },

    hollow_oak: {
      id: "hollow_oak", name: "Heartwood Hollow", boss: true, maxHp: 460, atk: 22, def: 14, spd: 7, acc: 86,
      color: "#3a5a30", phases: 2,
      ai: "hollow_oak",
      intro: "A tree that remembers being worshipped, and has not forgiven the silence."
    },
    canal_specter: {
      id: "canal_specter", name: "Canal Specter", boss: true, maxHp: 320, atk: 18, def: 10, spd: 15, acc: 90,
      color: "#3a6a8a", phases: 1, ai: "specter",
      intro: "The hungry mouth in the water wears a child's stolen shoe like a crown."
    },
    gate_warden: {
      id: "gate_warden", name: "Ashen Gate Warden", boss: true, maxHp: 620, atk: 26, def: 16, spd: 10, acc: 88,
      color: "#8a4030", phases: 3, ai: "warden",
      intro: "A guardian who was a man, then a vow, then a door that learned to hate hands."
    },
    mirror_shade: {
      id: "mirror_shade", name: "The Unbetrayed", boss: true, maxHp: 580, atk: 28, def: 14, spd: 15, acc: 94,
      color: "#c23b4a", phases: 2, ai: "mirror",
      intro: "Kael, if no one had ever loved him badly. It smiles with his mouth."
    },
    bound_hound: {
      id: "bound_hound", name: "The Bound Hound", boss: true, maxHp: 400, atk: 24, def: 18, spd: 9, acc: 84,
      color: "#5a4a3a", phases: 1, ai: "hound",
      intro: "A mid-tier demon left on a mountain to starve politely. Thorn looks away."
    }
  };

  C.BATTLES = {
    tutorial_wisp: { id: "tutorial_wisp", bg: "forest", enemies: ["wisp", "wisp"], tutorial: "basic",
      victoryFlag: "tut_wisp",
      post: "tut_wisp_vn" },
    hollow_oak: { id: "hollow_oak", bg: "forest", enemies: ["hollow_oak"], tutorial: "boss1",
      victoryFlag: "hollow_oak_dead", post: "post_hollow" },
    forest_vines: { id: "forest_vines", bg: "forest", enemies: ["vine", "wisp"], victoryFlag: "forest_skirmish" },
    canal_specter: { id: "canal_specter", bg: "canal", enemies: ["canal_specter"], tutorial: "mark",
      victoryFlag: "quest_canal", post: "post_canal" },
    gate_warden: { id: "gate_warden", bg: "pass", enemies: ["gate_warden"], tutorial: "setup",
      victoryFlag: "warden_dead", post: "post_warden" },
    bound_hound: { id: "bound_hound", bg: "pass", enemies: ["bound_hound"],
      victoryFlag: "quest_hound", post: "post_hound" },
    court_echoes: { id: "court_echoes", bg: "ruins", enemies: ["court_echo", "court_echo"] },
    mirror_shade: { id: "mirror_shade", bg: "ruins", enemies: ["mirror_shade"], tutorial: "unseal_choice",
      victoryFlag: "court_survived", post: "post_mirror" }
  };

  C.NPC_TALK = {
    suyin: [
      { s: "suyin", t: "The west does not want you, child. That is why you must go. The Throne of Ash is a conversation that has gone on too long." },
      { s: "elara", e: "neutral", t: "I have the rite. I have the unwilling escort. I do not have your blessing to be afraid." },
      { s: "suyin", t: "Then take my fear instead. Come home. Or do not. Either way, do not become a seal yourself." }
    ],
    ren: [
      { s: "ren", t: "Mira went to the village yesterday for lamp-oil and gossip. She is extremely good at gossip. She is extremely bad at being on time." },
      { s: "elara", e: "neutral", t: "I will look. If you have been covering for her, I will pretend I am still seventeen enough to find it charming." }
    ],
    wen: [
      { s: "wen", t: "Don't let the demon walk on the lotus beds. I don't care if he's a prince. Princes are terrible for soil." },
      { s: "kael", e: "smirk", t: "I have razed courts, old man. I can be trusted with a flower." },
      { s: "wen", t: "That's what the last prince said." }
    ],
    hana: [
      { s: "hana", t: "Inn's full of rumors and empty of heroes. You look like both. Rooms are free for the High Priestess. The demon pays extra for the scorch marks he hasn't made yet." },
      { s: "kael", e: "smirk", t: "Put it on the Church's tab. They already billed me for the rest of my life." }
    ],
    jori: [
      { s: "jori", t: "The canal ate my sister's shoe! It had teeth made of water. Lyra says I'm a liar. I'm a very good liar, but not about this." }
    ],
    fisherman: [
      { s: "fisherman", t: "Don't fish after the lanterns blink twice. That's when the water remembers it used to be a mouth." }
    ],
    mira: [
      { s: "mira", t: "I wasn't lost. I was conducting an extremely important survey of canal-fox tracks. Also I fell in. Please do not tell Mother Suyin about the falling in." },
      { s: "elara", e: "blush", t: "I am High Priestess of the Silver Lotus, keeper of the westward rite, and I am going to tell her you fell in." }
    ],
    korin: [
      { s: "korin", t: "I don't sell better. I make true. Bring me a named thing and a reason, and I'll put a better reason in the metal. My daughter Sera went chasing a bard's story. Bring her home and I'll remember your sleeves." }
    ],
    sera: [
      { s: "sera", t: "The bard's story was stupid. I followed it anyway. That's a family trait. Tell father I'm tired of being a reason in someone else's metal." }
    ],
    bard: [
      { s: "bard", t: "Letter for sale. Wax like a wound. Mark of a prince who doesn't exist. Fifty rumors or one honest stare from the man in the torn coat." }
    ],
    keeper: [
      { s: "keeper", t: "Lights on the canal don't go out. Except when a person tells a lie big enough to be a geography. Stand here at dusk. Watch me not explain." }
    ],
    captain: [
      { s: "captain", t: "Meridia loves the Church and fears the west. You are both. Try not to bleed on the mosaic; it's original." }
    ],
    granny: [
      { s: "granny", t: "In my day High Priestesses were eighty and made of vinegar. Look at you. Soft. Sharp. Go on, then. Make the road ashamed of itself." }
    ],
    lyra_meet: [
      { s: "lyra", t: "You're late, little saint. I watched you bless a cat. The forest is eating people and you are blessing a cat." },
      { s: "elara", e: "blush", t: "It was a temple cat. There are protocols." },
      { s: "lyra", t: "I'm Lyra. I used to guard your doors. Now I guard the parts of the map your doors pretend aren't there. I'm coming. Someone has to count the arrows." }
    ],
    echo: [
      { s: "echo", t: "Prince. You left your name on the floor. We kept it warm. Put it back on." },
      { s: "kael", e: "serious", t: "I left it on purpose. Warmth is how you get betrayed." }
    ]
  };

  C.PORTRAITS = {
    elara: { neutral: "assets/portraits/elara_neutral.jpg", blush: "assets/portraits/elara_neutral.jpg", angry: "assets/portraits/elara_neutral.jpg", sad: "assets/portraits/elara_neutral.jpg", determined: "assets/portraits/elara_neutral.jpg" },
    kael: { smirk: "assets/portraits/kael_neutral.jpg", serious: "assets/portraits/kael_neutral.jpg", soft: "assets/portraits/kael_neutral.jpg", berserk: "assets/portraits/kael_neutral.jpg", angry: "assets/portraits/kael_neutral.jpg" }
  };

  C.BGS = {
    title: "assets/backgrounds/title.jpg"
  };

  return C;
})();
