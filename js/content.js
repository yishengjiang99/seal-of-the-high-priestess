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
      skills: ["lotus_ward", "silver_mercy", "congregation", "empower", "meditate", "unseal", "healing_rain", "purifying_light"],
      weapon: null, armor: "novice_robe", accessory: null,
      bio: "Seventeen. High Priestess of the Silver Lotus. Super-intelligent, preternaturally wise in lore and ritual — and still emotionally seventeen."
    },
    kael: {
      id: "kael", name: "Kael", role: "Sealed Demon Prince",
      resName: "Fury", resKey: "fury",
      maxHp: 128, maxRes: 80, atk: 22, def: 16, spd: 14, acc: 92,
      color: "#c23b4a", accent: "#5a1a1a",
      skills: ["mock", "crimson_cut", "hellcoil", "abyssal_bloom", "thronebreaker", "iron_will", "ash_revival"],
      weapon: "shackled_fang", armor: "torn_court_coat", accessory: null,
      bio: "Eighteen. Former Demon Prince. Betrayed, cast out, subdued by humanity. Sharp-tongued tsundere bound as Elara's escort."
    },
    lyra: {
      id: "lyra", name: "Lyra", role: "Temple Scout",
      resName: "Focus", resKey: "focus",
      maxHp: 86, maxRes: 90, atk: 20, def: 12, spd: 18, acc: 98,
      color: "#c4a06a", accent: "#3a5a2a",
      skills: ["pinpoint", "detect", "needle_rain", "smoke_veil", "aimed_shot", "cover_fire"],
      weapon: "temple_recurve", armor: "scout_cloak", accessory: null,
      bio: "Pragmatic former temple guardian. Dry humor. Ranged utility and detection."
    },
    thorn: {
      id: "thorn", name: "Thorn", role: "Bound Bruiser",
      resName: "Blood", resKey: "blood",
      maxHp: 170, maxRes: 70, atk: 24, def: 26, spd: 8, acc: 88,
      color: "#7a8a6a", accent: "#3a2a1a",
      skills: ["iron_guard", "blood_price", "crushing_bind", "last_wall", "martyr_charge", "earthshatter"],
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
    unsealed_once: { kael: { atk: 4 } },
    sparring_done: { elara: { atk: 2, def: 1 } },
    quest_herbalist: { elara: { maxRes: 6 }, lyra: { maxHp: 4 } },
    thorn_confession: { thorn: { atk: 3, maxHp: 8 } }
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
    },
    martyr_charge: {
      id: "martyr_charge", name: "Martyr's Charge",
      desc: "Thorn taunts every enemy, then lunges. If HP drops below half, he gets a bonus hit. He has done this before.",
      cost: 20, target: "enemies", power: 18, taunt: 3, martyrBurst: true, aoe: true, fx: "guard"
    },
    earthshatter: {
      id: "earthshatter", name: "Earthshatter",
      desc: "Thorn slams the ground. Two charging turns. Everything standing falls down. Everything.",
      cost: 30, target: "enemies", power: 34, charge: 2, aoe: true, stun: 0.45, fx: "guard"
    },

    healing_rain: {
      id: "healing_rain", name: "Healing Rain",
      desc: "Silver-lotus light falls over every ally. Modest healing, but it asks nothing back. That's the hard part.",
      cost: 32, target: "allies", heal: 28, fx: "heal"
    },
    purifying_light: {
      id: "purifying_light", name: "Purifying Light",
      desc: "Elara cleanses one ally's debuffs and heals them. She borrowed the technique from a prayer she used to think was figurative.",
      cost: 20, target: "ally", heal: 18, cleanse: true, fx: "petal"
    },

    aimed_shot: {
      id: "aimed_shot", name: "Aimed Shot",
      desc: "Lyra holds her breath for one turn. No charge penalty if she's already detected a weakness.",
      cost: 18, target: "enemy", power: 26, charge: 1, bonusIfMarked: true, fx: "arrow"
    },
    cover_fire: {
      id: "cover_fire", name: "Cover Fire",
      desc: "Three rapid shots across all enemies. Low power per arrow, but they can't all dodge the same corner.",
      cost: 20, target: "enemies", power: 10, aoe: true, hits: 3, fx: "arrow"
    },
    iron_will: {
      id: "iron_will", name: "Iron Will",
      desc: "Kael grits his teeth and refuses to die this turn. Damage taken is halved. He hates that this works.",
      cost: 14, target: "self", damageReduction: 0.5, duration: 1, fx: "guard"
    },
    ash_revival: {
      id: "ash_revival", name: "Ash Revival",
      desc: "Berserk only. Kael spends Fury to revive a fallen ally with a fraction of HP. He will not admit what this costs him.",
      cost: 36, target: "ally", revive: 0.25, berserkOnly: true, fx: "flame"
    }
  };

  // ---- Named items / gear (no generic shops) ----
  C.ITEMS = {
    novice_robe: { id: "novice_robe", name: "Novice Lotus Robe", slot: "armor", who: "elara", def: 2, desc: "White cloth that has never yet been washed of someone else's blood." },
    veil_first_oath: { id: "veil_first_oath", name: "Veil of the First Oath", slot: "armor", who: "elara", def: 6, maxRes: 12, desc: "Reforged by Korin from temple-silk and a daughter's kept promise. Elara's sleeves run with gold that was not there yesterday." },
    prayer_beads: { id: "prayer_beads", name: "Silver Lotus Prayer Beads", slot: "accessory", who: "elara", manaRegen: 4, desc: "An acolyte's beads, returned. Each click is a name Elara refused to forget." },
    herbalist_wrap: { id: "herbalist_wrap", name: "Canal-Herb Wrap", slot: "accessory", who: "elara", maxRes: 10, healBonus: 4, desc: "Wound over Elara's wrist by the herbalist. Smells like mud and purpose. The regen it grants comes from listening, not power." },
    shackled_fang: { id: "shackled_fang", name: "Shackled Fang", slot: "weapon", who: "kael", atk: 4, desc: "A blade allowed him the way a dog is allowed teeth. The seal hums in the fuller." },
    shard_crown: { id: "shard_crown", name: "Shard of the Betrayed Crown", slot: "accessory", who: "kael", crit: 12, furyOnHit: 3, desc: "A splinter of the circlet they tore from him. He will not put it on. He will not put it down." },
    reforged_edge: { id: "reforged_edge", name: "Reforged Edge", slot: "weapon", who: "kael", atk: 8, crit: 6, desc: "A blade without a seal. He found it in the ruins and said nothing. Elara noticed and said nothing back." },
    torn_court_coat: { id: "torn_court_coat", name: "Torn Court Coat", slot: "armor", who: "kael", def: 3, desc: "Black and crimson. The tears are original. The seals are not." },
    temple_recurve: { id: "temple_recurve", name: "Temple Recurve", slot: "weapon", who: "lyra", atk: 3, desc: "Standard issue, except Lyra has not been standard in years." },
    whisperwood_bow: { id: "whisperwood_bow", name: "Whisperwood Longbow", slot: "weapon", who: "lyra", atk: 8, acc: 4, desc: "Cut from a tree that still remembers being a person. It does not forgive. It does aim." },
    scout_cloak: { id: "scout_cloak", name: "Scout's Cloak", slot: "armor", who: "lyra", def: 2, spd: 1, desc: "Olive, mended, smelling faintly of lamp oil and canal water." },
    canal_quiver: { id: "canal_quiver", name: "Canal Scout Quiver", slot: "accessory", who: "lyra", acc: 3, focusRegen: 3, desc: "Lyra tied the canal-herb bundles to each arrow. She says it's aerodynamic. It is also kind." },
    binding_gauntlets: { id: "binding_gauntlets", name: "Thorn's Binding Gauntlets", slot: "weapon", who: "thorn", atk: 5, def: 2, desc: "The same metal that binds him, turned outward. He asked for this." },
    patched_pauldron: { id: "patched_pauldron", name: "Patched Pauldron", slot: "armor", who: "thorn", def: 5, desc: "Iron that has been hit by worse than you." },
    mountain_pauldron: { id: "mountain_pauldron", name: "Ashen Pass Pauldron", slot: "armor", who: "thorn", def: 9, maxHp: 12, desc: "Forged from a spike that fell on him and didn't stop him. He had it filed down and welded on." },
    climber_charm: { id: "climber_charm", name: "Ashen Pass Climber's Charm", slot: "accessory", who: "any", def: 2, hazard: true, desc: "A prayer against falling rock, tied in red string by someone who did not make the summit." },
    seal_circlet: { id: "seal_circlet", name: "Seal-Scribed Circlet", slot: "accessory", who: "elara", maxRes: 8, unsealBonus: 1, desc: "A tablet's worth of old law, beaten into a thin crown. It knows how to talk to seals." },
    lantern_meridia: { id: "lantern_meridia", name: "Lantern of Meridia", slot: "accessory", who: "any", acc: 4, desc: "A canal-lantern that does not go out in the presence of a lie. The keeper said this like a joke. It was not." },
    moonwell_chalice: { id: "moonwell_chalice", name: "Moonwell Chalice", type: "consumable", uses: 3, heal: 64, desc: "Temple water that has seen the moon. Three draughts. Not for sale." },
    lotus_petal: { id: "lotus_petal", name: "Pressed Lotus Petal", type: "consumable", uses: 4, res: 22, resOf: "elara", desc: "A petal from the sanctum pond. Restores Elara's Mana. She hates using them. She will." },
    sealing_salve: { id: "sealing_salve", name: "Sealing Salve", type: "consumable", uses: 2, ungassed: 1, desc: "A bitter paste. Shortens Gassed by one turn. The abbess's private recipe." },
    canal_herb: { id: "canal_herb", name: "Canal Herb Bundle", type: "consumable", uses: 3, heal: 28, allRegen: 1, desc: "Lyra pulled these from the water margins. They smell like canal mud and pragmatism." },
    demon_tonic: { id: "demon_tonic", name: "Demon's Draft", type: "consumable", uses: 2, res: 30, resOf: "kael", desc: "A flask the herbalist brewed from old court-recipes. Kael says it tastes like ambition that didn't work." },
    ward_incense: { id: "ward_incense", name: "Ward Incense", type: "consumable", uses: 2, shieldAll: 20, desc: "Burned before a known danger. Smells like the temple at night. Everyone pretends not to feel safer." },
    lore_west: { id: "lore_west", name: "Pilgrim's Primer: The Westward Rite", type: "lore", desc: "Purification is not cleanliness. It is a road. The demons of Aetheria were not born monstrous; they were left unburied by an old war." },
    lore_kael: { id: "lore_kael", name: "Fragment: The Night of Knives", type: "lore", desc: "The Demon Court ate its own prince at midnight. Humanity's ritualists arrived at dawn, and found a boy already kneeling in his own blood, too proud to fall over." },
    lore_throne: { id: "lore_throne", name: "Ash-Tablet 7", type: "lore", desc: "The Demon King sleeps because a High Priestess asked him to. The seal is a conversation. Conversations end." },
    lore_lyra: { id: "lore_lyra", name: "Temple Guard Log — Final Entry", type: "lore", desc: "She wrote: 'I am resigning. The temple is safe. I am not. I am going west to find the line between those two things.'" },
    lore_thorn: { id: "lore_thorn", name: "Chain-Keeper's Report", type: "lore", desc: "Subject shows no sign of aggression when addressed by name. This makes us nervous." }
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
    bound_hound: { id: "bound_hound", name: "The Bound Hound", desc: "Something large is chained in Ashen Pass, answering to a name Thorn flinches at.", reward: "climber_charm" },
    herbalist_errand: { id: "herbalist_errand", name: "What the Canal Grows", desc: "An old herbalist in Meridia needs someone who can walk the water margin without running. She says the plants have been moving.", reward: "canal_herb" },
    sparring_kael: { id: "sparring_kael", name: "Lessons from a Prince", desc: "Kael offers to teach Elara how to stand in a fight. She accepts. Neither of them will say why.", reward: null },
    idle_vision_1: { id: "idle_vision_1", name: "Waxing Vision", desc: "Gather 24 Divine Favor through temple automation to receive the first moon-vision.", reward: "lore fragment" },
    idle_vision_2: { id: "idle_vision_2", name: "Seal Communion", desc: "Deepen communion by surpassing 60 Divine Favor, then sustain growth to 90 to stabilize the rite.", reward: "ascension lore" }
  };

  // ---- Enemies / bosses ----
  C.ENEMIES = {
    wisp: { id: "wisp", name: "Hollow Wisp", maxHp: 36, atk: 10, def: 4, spd: 12, acc: 85, skills: ["nibble"], color: "#a0d0e8" },
    vine: { id: "vine", name: "Spite-Vine", maxHp: 48, atk: 12, def: 8, spd: 8, acc: 80, skills: ["lash", "tangle"], color: "#4a6a3a" },
    ashling: { id: "ashling", name: "Ashling", maxHp: 40, atk: 14, def: 5, spd: 14, acc: 88, skills: ["cinder"], color: "#c07040" },
    court_echo: { id: "court_echo", name: "Court Echo", maxHp: 70, atk: 16, def: 10, spd: 13, acc: 90, skills: ["mock_echo", "slash"], color: "#8a4a6a" },
    pale_revenant: {
      id: "pale_revenant", name: "Pale Revenant",
      maxHp: 58, atk: 13, def: 6, spd: 16, acc: 92,
      skills: ["wail", "drain"], color: "#d8d0e8",
      intro: "A soldier who did not know the war ended. Still keeping watch on a border that stopped mattering."
    },
    shadow_knight: {
      id: "shadow_knight", name: "Shadow Knight",
      maxHp: 88, atk: 18, def: 14, spd: 10, acc: 86,
      skills: ["slash", "shield_bash", "dark_edge"], color: "#4a4a6a",
      intro: "Demon court armor with nothing inside. The binding's ghost. It salutes."
    },
    ritual_drone: {
      id: "ritual_drone", name: "Ritual Drone",
      maxHp: 44, atk: 11, def: 7, spd: 9, acc: 82,
      skills: ["leech_chant", "hex"], color: "#7a6a3a",
      intro: "A priest who learned what the ritual was for, and did not stop."
    },

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
    forest_revenants: { id: "forest_revenants", bg: "forest", enemies: ["pale_revenant", "pale_revenant"], victoryFlag: "forest_revenants" },
    canal_specter: { id: "canal_specter", bg: "canal", enemies: ["canal_specter"], tutorial: "mark",
      victoryFlag: "quest_canal", post: "post_canal" },
    meridia_knights: { id: "meridia_knights", bg: "ruins", enemies: ["shadow_knight", "ritual_drone"],
      victoryFlag: "meridia_knights", post: "post_meridia_skirmish" },
    gate_warden: { id: "gate_warden", bg: "pass", enemies: ["gate_warden"], tutorial: "setup",
      victoryFlag: "warden_dead", post: "post_warden" },
    bound_hound: { id: "bound_hound", bg: "pass", enemies: ["bound_hound"],
      victoryFlag: "quest_hound", post: "post_hound" },
    court_echoes: { id: "court_echoes", bg: "ruins", enemies: ["court_echo", "court_echo"] },
    court_knights: { id: "court_knights", bg: "ruins", enemies: ["shadow_knight", "shadow_knight", "ritual_drone"],
      victoryFlag: "court_knights" },
    mirror_shade: { id: "mirror_shade", bg: "ruins", enemies: ["mirror_shade"], tutorial: "unseal_choice",
      victoryFlag: "court_survived", post: "post_mirror" }
  };

  C.NPC_TALK = {
    suyin: [
      { s: "suyin", t: "The west does not want you. That is why you go." },
      { s: "elara", e: "neutral", t: "I have the rite. I do not have your blessing to be afraid." },
      { s: "suyin", t: "Take my fear instead. Do not become a seal yourself." },
      { s: "suyin", t: "The Demon Prince is a wound the court left open. Do not heal him too fast. Let him do some of it." },
      { s: "elara", e: "blush", t: "I know." },
      { s: "suyin", t: "You don't. But you will." }
    ],
    ren: [
      { s: "ren", t: "Mira went for lamp-oil. She is good at gossip. Bad at clocks." },
      { s: "elara", e: "neutral", t: "I will look." },
      { s: "ren", t: "She might have stopped at the canal bridge. She always stops at the canal bridge." }
    ],
    wen: [
      { s: "wen", t: "Keep the demon off the lotus beds. Princes are terrible for soil." },
      { s: "kael", e: "smirk", t: "I can be trusted with a flower." },
      { s: "wen", t: "That's what the last prince said." },
      { s: "kael", e: "serious", t: "What happened to the last prince." },
      { s: "wen", t: "He stopped being a prince. Quietly." },
      { s: "kael", e: "soft", t: "..." }
    ],
    hana: [
      { s: "hana", t: "Room's free for the priestess. The demon pays extra for scorch marks." },
      { s: "kael", e: "smirk", t: "Church's tab. They already billed me for a lifetime." },
      { s: "hana", t: "The priestess gets the south room. Faces the canal. She'll need the view." },
      { s: "elara", e: "blush", t: "I do not need a view." },
      { s: "hana", t: "Everyone needs a view, love. Have some tea." }
    ],
    jori: [
      { s: "jori", t: "The canal ate my sister's shoe. Teeth made of water. Not a lie." },
      { s: "lyra", t: "He's been telling this story for two days." },
      { s: "jori", t: "That doesn't mean it stopped being true." }
    ],
    fisherman: [
      { s: "fisherman", t: "Don't fish after the lanterns blink twice." },
      { s: "elara", e: "neutral", t: "What happens after the lanterns blink twice?" },
      { s: "fisherman", t: "You stop fishing and start swimming." }
    ],
    mira: [
      { s: "mira", t: "I wasn't lost. I fell in. Please don't tell Mother Suyin." },
      { s: "elara", e: "blush", t: "I am going to tell her you fell in." },
      { s: "mira", t: "Can you at least say I fell in bravely." },
      { s: "elara", e: "neutral", t: "I will say it was a courageous plunge." },
      { s: "mira", t: "Perfect." }
    ],
    korin: [
      { s: "korin", t: "I don't sell better. I make true. Bring Sera home and I'll remember your sleeves." },
      { s: "elara", e: "neutral", t: "I will bring her back. As a person, not a task." },
      { s: "korin", t: "She'll give you trouble. She gets that from me. I'm sorry in advance." }
    ],
    sera: [
      { s: "sera", t: "Tell father I'm tired of being a reason in his metal." },
      { s: "kael", e: "soft", t: "Tell him yourself. Reasons should be able to walk." },
      { s: "sera", t: "...the demon prince has a point." }
    ],
    bard: [
      { s: "bard", t: "Letter. Dead prince's wax. Fifty rumors, or one stare from the torn coat." },
      { s: "kael", e: "serious", t: "How did you get this." },
      { s: "bard", t: "Found it in the ashes. Thought it was worth something to someone." },
      { s: "kael", e: "soft", t: "To several people. Most of them don't breathe anymore." }
    ],
    keeper: [
      { s: "keeper", t: "These lights die when someone lies. Stand here. Watch." },
      { s: "elara", e: "neutral", t: "I'm watching." },
      { s: "keeper", t: "That's the first true thing someone's said near this lamp in a month." },
      { s: "elara", e: "blush", t: "What was the last one." },
      { s: "keeper", t: "A child saying they were afraid." }
    ],
    captain: [
      { s: "captain", t: "You are Church and west. Don't bleed on the mosaic." },
      { s: "elara", e: "neutral", t: "We will try." },
      { s: "captain", t: "The last party that came through was all dead inside before the pass. I mean professionally." },
      { s: "kael", e: "smirk", t: "We have a head start. Elara is only professionally alive." }
    ],
    granny: [
      { s: "granny", t: "Priestesses used to be eighty and vinegar. Go on. Make the road ashamed." },
      { s: "elara", e: "blush", t: "I will do my best." },
      { s: "granny", t: "Your best is not a thing you should warn people about. Just do it." }
    ],
    lyra_meet: [
      { s: "lyra", t: "Late. You blessed a cat." },
      { s: "elara", e: "blush", t: "Temple cat. Protocols." },
      { s: "lyra", t: "I'm coming. Someone has to count arrows." },
      { s: "kael", e: "smirk", t: "Temple guardian. You're the one who locked the south corridor every full moon." },
      { s: "lyra", t: "I'm the one who locked it because of you." },
      { s: "kael", e: "soft", t: "Sound judgment." }
    ],
    echo: [
      { s: "echo", t: "Prince. Put your name back on." },
      { s: "kael", e: "serious", t: "I left it. Warmth is how you get betrayed." },
      { s: "echo", t: "And yet here you are. Walking west with someone warm." },
      { s: "kael", e: "angry", t: "Tactical." },
      { s: "echo", t: "Logged." }
    ],
    monk: [
      { s: "monk", t: "The pond keeps the names we are too proud to say. Do not skip stones." },
      { s: "elara", e: "neutral", t: "I know." },
      { s: "monk", t: "Not you. Him." },
      { s: "kael", e: "serious", t: "I was not going to skip stones." },
      { s: "monk", t: "You were thinking about it." }
    ],
    pilgrim: [
      { s: "pilgrim", t: "I walked from Meridia. The trees tried my name. I did not answer. I still hear it." },
      { s: "elara", e: "sad", t: "Does it fade?" },
      { s: "pilgrim", t: "I think you have to earn that. I don't know how yet." }
    ],
    baker: [
      { s: "baker", t: "Bread's cheap. Rumors aren't. The west gate smells like weather that wants a war." },
      { s: "kael", e: "smirk", t: "Weather. That's a polite word for it." },
      { s: "baker", t: "I'm a polite man. Roll doesn't cost extra if you take it and leave fast." }
    ],
    florist: [
      { s: "florist", t: "Lotus for the temple. Thorns for the prince. He can pay in scowls." },
      { s: "kael", e: "smirk", t: "I'll give you two." },
      { s: "florist", t: "Deal." }
    ],
    boatman: [
      { s: "boatman", t: "I don't take the canals after second blink. That's when the water has teeth." },
      { s: "lyra", t: "He means it. I asked him once. He showed me the dent in the hull." }
    ],
    kid2: [
      { s: "kid2", t: "If I light every lamp, the fox can't come. That's the rule. I made the rule." },
      { s: "elara", e: "neutral", t: "That is a sound rule." },
      { s: "kid2", t: "Do you have rules?" },
      { s: "elara", e: "blush", t: "I have about forty. I break most of them." }
    ],
    guard: [
      { s: "guard", t: "Scout's word opens the west. Until then, the mountain can keep its opinions." },
      { s: "lyra", t: "Scout's word. Fine. They've been working twice as hard." },
      { s: "guard", t: "That's how passes get opened, ma'am." }
    ],
    herbalist: [
      { s: "herbalist", t: "The canal margins have been walking. I know that sounds stupid. They have been walking." },
      { s: "elara", e: "neutral", t: "It doesn't sound stupid. It sounds like something we should look at." },
      { s: "herbalist", t: "Bring me back whatever you find. I'll make something useful from it." },
      { s: "kael", e: "smirk", t: "We bring her combat-philosophy and she makes tea." },
      { s: "herbalist", t: "Tea is combat philosophy." }
    ],
    spirit_shrine: [
      { s: "", t: "A small shrine by the road. Someone left a silver coin and a folded note." },
      { s: "elara", e: "sad", t: "They always leave notes to people who aren't here." },
      { s: "kael", e: "soft", t: "Read it." },
      { s: "elara", e: "neutral", t: "\"I kept your favorite lamp lit. The road is fine. Please be fine.\"" },
      { s: "kael", e: "soft", t: "..." },
      { s: "elara", e: "blush", t: "I will not ask." },
      { s: "kael", e: "smirk", t: "Good." }
    ]
  };

  C.IDLE = {
    resources: {
      moonlight_essence: { id: "moonlight_essence", name: "Moonlight Essence", icon: "☾", rarity: "common" },
      sacred_incense: { id: "sacred_incense", name: "Sacred Incense", icon: "🕯", rarity: "common" },
      temple_offerings: { id: "temple_offerings", name: "Temple Offerings", icon: "◈", rarity: "common" },
      ritual_ash: { id: "ritual_ash", name: "Ritual Ash", icon: "✦", rarity: "uncommon" },
      starlight_dust: { id: "starlight_dust", name: "Starlight Dust", icon: "✧", rarity: "uncommon" },
      seal_fragments: { id: "seal_fragments", name: "Seal Fragments", icon: "⬡", rarity: "rare" },
      divine_favor: { id: "divine_favor", name: "Divine Favor", icon: "❂", rarity: "epic" },
      chronos_crystals: { id: "chronos_crystals", name: "Chronos Crystals", icon: "⟡", rarity: "premium" }
    },
    focusModes: {
      balanced: { id: "balanced", name: "Balanced Growth", bonuses: {} },
      essence: { id: "essence", name: "Essence Priority", bonuses: { moonlight_essence: 0.25, sacred_incense: 0.2 } },
      fragments: { id: "fragments", name: "Fragment Farming", bonuses: { seal_fragments: 0.35, ritual_ash: 0.15 } }
    },
    structures: {
      incense_grove: {
        id: "incense_grove", name: "Incense Grove", tierZone: "Outer Courtyard", unlockRank: 1,
        baseCapacity: 340, perTierCapacity: 260, baseRates: { sacred_incense: 0.22 }, upgradeCost: { moonlight_essence: 120, temple_offerings: 40 }
      },
      reflecting_pool: {
        id: "reflecting_pool", name: "Lunar Reflecting Pool", tierZone: "Middle Sanctum", unlockRank: 2,
        baseCapacity: 420, perTierCapacity: 300, baseRates: { moonlight_essence: 0.19 }, upgradeCost: { sacred_incense: 160, temple_offerings: 60 }
      },
      attendant_quarters: {
        id: "attendant_quarters", name: "Attendant Quarters", tierZone: "Middle Sanctum", unlockRank: 2,
        baseCapacity: 260, perTierCapacity: 120, baseRates: { temple_offerings: 0.14 }, upgradeCost: { moonlight_essence: 180, sacred_incense: 120 }
      },
      relic_shrine: {
        id: "relic_shrine", name: "Relic Shrine", tierZone: "Inner Holy", unlockRank: 3,
        baseCapacity: 260, perTierCapacity: 180, baseRates: { starlight_dust: 0.06 }, upgradeCost: { ritual_ash: 80, moonlight_essence: 220 }
      },
      automation_glyph: {
        id: "automation_glyph", name: "Automation Glyph", tierZone: "Inner Holy", unlockRank: 4,
        baseCapacity: 220, perTierCapacity: 140, baseRates: { divine_favor: 0.01 }, upgradeCost: { starlight_dust: 90, seal_fragments: 30 }
      },
      central_spire: {
        id: "central_spire", name: "Central Seal Spire", tierZone: "Central Spire", unlockRank: 1,
        baseCapacity: 500, perTierCapacity: 420, baseRates: { moonlight_essence: 0.06, temple_offerings: 0.05 }, upgradeCost: { moonlight_essence: 200, sacred_incense: 200 }
      }
    },
    attendants: {
      novice_nara: { id: "novice_nara", name: "Novice Nara", role: "grove", unlockRank: 1, bonus: 0.09, automationTier: 1 },
      sister_ysa: { id: "sister_ysa", name: "Sister Ysa", role: "pool", unlockRank: 2, bonus: 0.12, automationTier: 1 },
      keeper_tarin: { id: "keeper_tarin", name: "Keeper Tarin", role: "shrine", unlockRank: 3, bonus: 0.15, automationTier: 2 },
      spectral_ves: { id: "spectral_ves", name: "Spectral Ves", role: "glyph", unlockRank: 4, bonus: 0.18, automationTier: 3 },
      high_abbess_echo: { id: "high_abbess_echo", name: "High Abbess Echo", role: "spire", unlockRank: 5, bonus: 0.22, automationTier: 3 }
    },
    recipes: {
      incense_to_ash: { id: "incense_to_ash", name: "Incense to Ash", in: { sacred_incense: 16, moonlight_essence: 8 }, out: { ritual_ash: 4 } },
      ash_to_fragments: { id: "ash_to_fragments", name: "Ash to Fragments", in: { ritual_ash: 18, starlight_dust: 6 }, out: { seal_fragments: 3 } },
      fragment_offering: { id: "fragment_offering", name: "Fragment Offering", in: { seal_fragments: 20, temple_offerings: 40 }, out: { divine_favor: 4 } }
    },
    automationRules: {
      incense_to_ash: { id: "incense_to_ash", when: { resource: "sacred_incense", pctAbove: 0.8 }, runsPerMinute: 4, recipe: "incense_to_ash" },
      ash_to_fragments: { id: "ash_to_fragments", when: { resource: "ritual_ash", pctAbove: 0.65 }, runsPerMinute: 3, recipe: "ash_to_fragments" },
      fragments_to_favor: { id: "fragments_to_favor", when: { resource: "seal_fragments", pctAbove: 0.55 }, runsPerMinute: 2, recipe: "fragment_offering" }
    },
    ascension: {
      name: "Renewal of the Seal",
      threshold: { seal_fragments: 120, divine_favor: 32 },
      gainPerAscension: 0.15,
      keeps: ["chronos_crystals", "ascension_level", "offline_cap_bonus"],
      loreUnlocks: [
        "Fragment: The First Seal Was a Promise",
        "Fragment: The Moon Remembers Oaths",
        "Fragment: The Priestess Who Refused Sleep"
      ]
    },
    events: {
      lunar_bloom: { id: "lunar_bloom", name: "Lunar Bloom", bonusResource: "moonlight_essence", bonus: 0.2 },
      ash_requiem: { id: "ash_requiem", name: "Ash Requiem", bonusResource: "ritual_ash", bonus: 0.25 },
      mirror_tide: { id: "mirror_tide", name: "Mirror Tide", bonusResource: "seal_fragments", bonus: 0.18 }
    }
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
