/* Tile maps. Legend used by parse(): see TILE_CH. Events are world-objects. */
window.MAPS = (() => {
  const CH = {
    " ": 0,  // void / pit (solid)
    ".": 1,  // grass
    ",": 2,  // cobble / path
    "~": 3,  // water
    "#": 4,  // wall / stone
    "=": 5,  // interior floor
    "_": 6,  // wood floor
    "T": 7,  // tree
    "B": 8,  // bridge
    "R": 9,  // roof
    "A": 10, // altar (walkable)
    "F": 11, // fence
    "L": 12, // lamp
    "D": 13, // door tile (walkable)
    "C": 14, // carpet
    "%": 15, // rubble
    "a": 16, // ash
    "^": 17, // mountain
    "x": 18, // corrupt grass
    "l": 19, // lily water
    "H": 20, // hedge / bush
    "W": 21, // interior wall (wood)
    "+": 22, // column
    "s": 23, // snow / pale stone
    "P": 24, // plaza mosaic
    "G": 25, // gravel / dirt
    "M": 26  // marble
  };

  function parse(id, name, music, raw, extras) {
    const lines = raw.trimEnd().split("\n").map(l => (l.startsWith("|") ? l.slice(1) : l));
    const h = lines.length, w = Math.max(...lines.map(l => l.length));
    const tiles = [];
    for (let y = 0; y < h; y++) {
      const row = [];
      const line = lines[y].padEnd(w, " ");
      for (let x = 0; x < w; x++) row.push(CH[line[x]] ?? 0);
      tiles.push(row);
    }
    return { id, name, music, w, h, tiles, ...(extras || {}) };
  }

  const M = {};

  M.temple = parse("temple", "Silver Lotus Temple — Sanctum", "temple", `
|################################################
|#==============================================#
|#==++++================================++++====#
|#==+==+========CCCCCCCCCCCCCCCC========+==+====#
|#==++++========C==============C========++++====#
|#===============C======AA======C===============#
|#===============C======AA======C===============#
|#====WWWW=======C==============C=======WWWW====#
|#====W__W=======CCCCCCCCCCCCCCCC=======W__W====#
|#====W__W======================================#
|#====W__D======================================#
|#==============================================#
|#====++++++++++++++++++====++++++++++++++++====#
|#====+================+====+================+==#
|#====+================+====+================+==#
|#====+================+====+================+==#
|#====++++++++++++++++++====++++++++++++++++====#
|#..............................................#
|#..........HHHH..........HHHH..................#
|#..........H..H..........H..H..................#
|#....,,,,,H,,,,H,,,,A,,,,,,,,,H,,,,H,,,,,,.....#
|#....,######################################,..#
|#....,D====================================D,..#
|#....,======================================,..#
|#....,======================================,..#
|#....,######################################,..#
|#..............................................#
|#......................D.......................#
|################################################
`, {
    spawn: { x: 23, y: 6 },
    indoors: true,
    events: [
      { type: "npc", x: 22, y: 5, id: "suyin", name: "Abbess Suyin", hue: "#d4b46a", talk: "suyin" },
      { type: "npc", x: 10, y: 10, id: "ren", name: "Acolyte Ren", hue: "#a0c4e8", talk: "ren", quest: "missing_acolyte" },
      { type: "npc", x: 36, y: 20, id: "wen", name: "Old Wen", hue: "#8a7a5a", talk: "wen" },
      { type: "save", x: 24, y: 20 },
      { type: "chest", x: 6, y: 8, id: "chest_temple_petal", item: "lotus_petal" },
      { type: "chest", x: 41, y: 8, id: "chest_temple_lore", item: "lore_west" },
      { type: "sign", x: 24, y: 12, text: "Here the lotus opens toward the west. Do not confuse opening with leaving." },
      { type: "warp", x: 23, y: 27, map: "village", tx: 24, ty: 3, dir: "down" },
      { type: "warp", x: 22, y: 27, map: "village", tx: 24, ty: 3, dir: "down" },
      { type: "warp", x: 24, y: 27, map: "village", tx: 24, ty: 3, dir: "down" }
    ]
  });

  M.village = parse("village", "Lotus-Step Village", "town", `
|TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT
|TTTT....RRRRRR........TTTT........RRRRRR....TTTTTT
|TTT.....R####R..HHHH..TTTT..HHHH..R####R.....TTTTT
|TT......R#__#R..H..H..,,,,..H..H..R#__#R......TTTT
|TT......R#__DR,,,,,,,,D,,D,,,,,,,,RD__#R......TTTT
|TT......R####R,,LLLL,,,,,,,,,,LLLL,R####R......TTT
|TT............,,~~~~,,,,,,,,,,~~~~,,............TT
|TT...RRRRRR,,,l~~~~l,,,,A,,,,,l~~~~l,,,RRRRRR...TT
|TT...R####R,,,~~~~~~,,,,,,,,,,~~~~~~,,,R####R...TT
|TT...R#__#R,,,~~~~B,,,,,,,,,,B~~~~,,,R#__#R...TT
|TT...R#__DR,,,,,,,,,,,,,,,,,,,,,,,,,,RD__#R...TT
|TT...R####R,,LLLL,,,,,,,,,,LLLL,,R####R...TT
|TT............,,~~~~,,,,,,,,,,~~~~,,............TT
|TT............,l~~~~l,,,,,,,,l~~~~l,............TT
|TTTT..........,,~~~~,,,,,,,,,,~~~~,,..........TTTT
|TTTT..HHHHH...,,B,,,,,,,,,,,,,,B,,,..HHHHH..TTTTTT
|TTT...H,,,H...,,,,,,,,,,,,,,,,,,,,,,..H,,,H...TTTT
|TT....H,A,H...RRRRRR....RRRRRR....RRRRH,L,H....TTT
|TT....H,,,H...R####R....R####R....R####H,,,H....TT
|TT....HHHHH...R#__#R....R#__#R....R#__#HHHHH....TT
|TT............R#__DR,,,,RD__#R,,,,RD__#R........TT
|TT...GCG......R####R....R####R....R####R...TTTTTTT
|TT...GGG...................................TTTTTTT
|TTTT.....TTTTTT....TTTTTTTTTTTT....TTTTTTTTTTTTTTT
|TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT
`, {
    spawn: { x: 24, y: 4 },
    events: [
      { type: "warp", x: 24, y: 2, map: "temple", tx: 23, ty: 26, dir: "up" },
      { type: "warp", x: 23, y: 2, map: "temple", tx: 23, ty: 26, dir: "up" },
      { type: "warp", x: 25, y: 2, map: "temple", tx: 23, ty: 26, dir: "up" },
      { type: "warp", x: 9, y: 4, map: "inn", tx: 6, ty: 8, dir: "up", door: true },
      { type: "warp", x: 40, y: 4, map: "house_mira", tx: 5, ty: 7, dir: "up", door: true },
      { type: "warp", x: 8, y: 10, map: "house_wen", tx: 5, ty: 7, dir: "up", door: true },
      { type: "npc", x: 18, y: 16, id: "jori", name: "Jori", hue: "#e8c070", talk: "jori", quest: "canal_fox" },
      { type: "npc", x: 32, y: 9, id: "fisherman", name: "Canal Fisher", hue: "#6a8aaa", talk: "fisherman" },
      { type: "npc", x: 28, y: 20, id: "hana_out", name: "Hana", hue: "#d4a0b0", talk: "hana" },
      { type: "save", x: 24, y: 7 },
      { type: "chest", x: 4, y: 21, id: "chest_village_chalice", item: "moonwell_chalice" },
      { type: "sign", x: 26, y: 5, text: "Lotus-Step Village — last kind light before the trees begin to speak." },
      { type: "trigger", x: 24, y: 22, w: 6, h: 1, flagNeed: "intro_done", flagNeedOff: "camp1_done", scene: "first_camp" },
      { type: "warp", x: 24, y: 23, map: "forest", tx: 24, ty: 2, dir: "down" },
      { type: "warp", x: 23, y: 23, map: "forest", tx: 24, ty: 2, dir: "down" },
      { type: "warp", x: 25, y: 23, map: "forest", tx: 24, ty: 2, dir: "down" }
    ]
  });

  M.inn = parse("inn", "Hana's Inn", "town", `
|WWWWWWWWWWWWW
|W___________W
|W_+++____+++W
|W___________W
|W____CCC____W
|W____CCC____W
|W___________W
|W_HH_____HH_W
|W___________W
|WWWWWWDWWWWWW
`, {
    spawn: { x: 6, y: 8 }, indoors: true,
    events: [
      { type: "npc", x: 6, y: 5, id: "hana", name: "Hana", hue: "#d4a0b0", talk: "hana" },
      { type: "chest", x: 2, y: 2, id: "chest_inn_salve", item: "sealing_salve" },
      { type: "warp", x: 6, y: 9, map: "village", tx: 9, ty: 5, dir: "down" }
    ]
  });

  M.house_mira = parse("house_mira", "Acolyte's Cottage", "town", `
|WWWWWWWWWW
|W________W
|W_++_____W
|W________W
|W____A___W
|W________W
|W________W
|WWWWWDWWWW
`, {
    spawn: { x: 5, y: 6 }, indoors: true,
    events: [
      { type: "npc", x: 5, y: 4, id: "mira", name: "Acolyte Mira", hue: "#e0b0d0", talk: "mira",
        appearIf: "quest_acolyte_found", },
      { type: "chest", x: 2, y: 2, id: "chest_mira", item: "prayer_beads", appearIf: "quest_acolyte_found" },
      { type: "sign", x: 3, y: 4, text: "A half-finished letter: 'Mother, the canal fox is real, I swear—' the rest is wet." },
      { type: "warp", x: 5, y: 7, map: "village", tx: 40, ty: 5, dir: "down" }
    ]
  });

  M.house_wen = parse("house_wen", "Wen's Shed", "town", `
|WWWWWWWWWW
|W________W
|W________W
|W_TTT____W
|W________W
|W________W
|W________W
|WWWWWDWWWW
`, {
    spawn: { x: 5, y: 6 }, indoors: true,
    events: [
      { type: "chest", x: 2, y: 2, id: "chest_wen", item: "lore_west" },
      { type: "sign", x: 4, y: 3, text: "Seed packets labeled: LOTUS (do not let demon prince near), LOTUS (backup), BEANS." },
      { type: "warp", x: 5, y: 7, map: "village", tx: 8, ty: 11, dir: "down" }
    ]
  });

  M.forest = parse("forest", "Whispering Forest", "forest", `
|TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT
|TT....TTTTTTTTxxTTTTTTTTTTTTTTTTTTTxxTTTT....TTT
|TT.G..TT....TTxxTT....TTTT....TTxxTT....TT..G.TT
|TT.G..TT.A..TTxxTT.GG..TT..GG.TTxxTT..A.TT..G.TT
|TT,,,,TT,,,,xx,,xx,,,,TT,,,,xx,,xx,,,,TT,,,,.TT
|TTTT,,TT,,TTTTTTTT,,TTTTTT,,TTTTTTTT,,TT,,TTTTT
|TTTT,,GG,,TTxxxxxx,,TTxxTT,,xxxxxxTT,,GG,,TTTTT
|TT....GG....xxxx......xx......xxxx....GG....TT
|TT.G......TTxxxxTT..........TTxxxxTT......G.TT
|TT.G..TTTTTT,,,,TTTTTTTTTTTT,,,,TTTTTTTT..G.TT
|TT,,,,xx,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,xx,,,,TT
|TTTT,,xx,,TTTTTT,,,,TTTT,,,,TTTTTT,,xx,,TTTTT
|TTTT,,GG,,TTxxxx,,TT,,,,TT,,xxxxTT,,GG,,TTTTT
|TT....GG....xxxx..TT.AA.TT..xxxx....GG....TT
|TT..........TTxx..TT....TT..xxTT..........TT
|TTTTTTTTTT,,TTxx,,TTTTTTTTTTxxTT,,TTTTTTTTTT
|TT..........,,,,................,,,,..........TT
|TT..TTTTTT......TTTTTTTTTTTTTT......TTTTTT..TT
|TT..TTxxxx..GG..TTxxxxxxxxxxTT..GG..xxxxTT..TT
|TT..TTxxxx..GG..TT....AA....TT..GG..xxxxTT..TT
|TT,,,,xx,,,,,,,,TT..........TT,,,,,,,,xx,,,,TT
|TTTT,,TTTTTTTT,,TTTTTTDDTTTTTT,,TTTTTTTT,,TTTT
|TTTT............xxxxxxxxxxxxxxxx............TTTT
|TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT
`, {
    spawn: { x: 24, y: 2 },
    events: [
      { type: "warp", x: 24, y: 1, map: "village", tx: 24, ty: 22, dir: "up" },
      { type: "save", x: 9, y: 3 },
      { type: "save", x: 38, y: 3 },
      { type: "npc", x: 24, y: 13, id: "shen", name: "Master Shen", hue: "#c0c4a0", scene: "quest_shen",
        appearIfOff: "quest_shen" },
      { type: "chest", x: 6, y: 8, id: "chest_forest_bow", item: "whisperwood_bow" },
      { type: "chest", x: 41, y: 16, id: "chest_forest_petal", item: "lotus_petal" },
      { type: "encounter", x: 16, y: 10, battle: "tutorial_wisp", once: "tut_wisp",
        appearIfOff: "tut_wisp" },
      { type: "encounter", x: 24, y: 19, battle: "hollow_oak", once: "hollow_oak_dead",
        appearIfOff: "hollow_oak_dead", name: "Heartwood Hollow" },
      { type: "encounter", x: 32, y: 10, battle: "forest_vines", once: "forest_skirmish",
        appearIfOff: "forest_skirmish" },
      { type: "sign", x: 24, y: 4, text: "The trees whisper in the old tongue. Do not answer unless you can afford the reply." },
      { type: "warp", x: 23, y: 21, map: "meridia", tx: 22, ty: 2, dir: "down", needFlag: "hollow_oak_dead" },
      { type: "warp", x: 24, y: 21, map: "meridia", tx: 22, ty: 2, dir: "down", needFlag: "hollow_oak_dead" },
      { type: "warp", x: 25, y: 21, map: "meridia", tx: 22, ty: 2, dir: "down", needFlag: "hollow_oak_dead" },
      { type: "block", x: 23, y: 21, needFlagOff: "hollow_oak_dead", text: "The heartwood still bars the west. Something old is standing in the path." }
    ]
  });

  M.meridia = parse("meridia", "Kingdom of Meridia", "city", `
|^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
|^ssssRRRRRR......PPPPPPPP......RRRRRRssss^^^^^^
|^sss.R####R.HHHH.PPPPPPPP.HHHH.R####R.sss^^^^^^
|^ss..R#__#R.H..H.PP,,A,,PP.H..H.R#__#R..ss^^^^^
|^s...R#__DR,,,,,,,,D,,,,D,,,,,,,,RD__#R...s^^^^
|^s...R####R,,LLLL,,,,,,,,,,LLLL,,R####R...s^^^^
|^....,,,,,,,~~~~,,,,,,,,,,~~~~,,,,,,,......^^^^
|^..RRRRR,,,l~~~~l,,,PPPP,,,l~~~~l,,,RRRRR..^^^^
|^..R####R,,,~~~~~~,,,PPPP,,,~~~~~~,,,R####R..^^
|^..R#__#R,,,~~~~B,,,,,,,,,,B~~~~,,,R#__#R..^^
|^..R#__DR,,,,,,,,,,,,,,,,,,,,,,,,,,RD__#R..^^
|^..R####R,,LLLL,,,,,,,,,,LLLL,,R####R..^^^^
|^...........~~~~,,,,,,,,,,~~~~...........^^^^^^
|^..HHHHH...,~~~~,,,,,,,,,,~~~~,...HHHHH..^^^^^^
|^..H,,,H...B,,,,,,,,,,,,,,B....H,,,H..^^^^^^
|^..H,A,H,,,,,,,,,,,,,,,,,,,,,,,,,H,L,H..^^^^^^
|^..H,,,H...RRRRRR....RRRRRR....RRH,,,H..^^^^^^
|^..HHHHH...R####R....R####R....R#HHHHH..^^^^^^
|^..........R#__#R....R#__#R....R#__#R...^^^^^^
|^...PCP....R#__DR,,,,RD__#R,,,,RD__#R...^^^^^^
|^...PPP....R####R....R####R....R####R...^^^^^^
|^........................................^^^^^^
|^ss,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,ss^^^^
|^ssssssssssssssssssGGGGGGsssssssssssssssss^^^^^
|^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
`, {
    spawn: { x: 22, y: 3 },
    events: [
      { type: "warp", x: 22, y: 1, map: "forest", tx: 24, ty: 20, dir: "up" },
      { type: "warp", x: 8, y: 4, map: "tavern", tx: 7, ty: 10, dir: "up", door: true },
      { type: "warp", x: 39, y: 4, map: "blacksmith", tx: 6, ty: 8, dir: "up", door: true },
      { type: "warp", x: 9, y: 10, map: "keeper_house", tx: 5, ty: 7, dir: "up", door: true },
      { type: "warp", x: 10, y: 19, map: "korin_home", tx: 5, ty: 7, dir: "up", door: true },
      { type: "npc", x: 22, y: 9, id: "lyra_npc", name: "Lyra", hue: "#c4a06a", scene: "meridia_arrival",
        appearIfOff: "lyra_joined" },
      { type: "npc", x: 30, y: 15, id: "captain", name: "Watch-Captain", hue: "#7080a0", talk: "captain" },
      { type: "npc", x: 16, y: 15, id: "granny", name: "Market Granny", hue: "#c0a080", talk: "granny" },
      { type: "npc", x: 6, y: 13, id: "jori2", name: "Jori", hue: "#e8c070", scene: "canal_quest_start",
        appearIf: "camp1_done", appearIfOff: "quest_canal" },
      { type: "save", x: 22, y: 3 },
      { type: "chest", x: 3, y: 19, id: "chest_meridia_petal", item: "lotus_petal" },
      { type: "sign", x: 24, y: 5, text: "MERIDIA — By canal and lantern, we keep the west at a polite distance." },
      { type: "encounter", x: 22, y: 21, battle: "canal_specter", once: "quest_canal",
        appearIf: "canal_ready", appearIfOff: "quest_canal", name: "The Canal's Mouth" },
      { type: "warp", x: 22, y: 23, map: "ashen", tx: 14, ty: 2, dir: "down", needFlag: "lyra_joined" },
      { type: "warp", x: 21, y: 23, map: "ashen", tx: 14, ty: 2, dir: "down", needFlag: "lyra_joined" },
      { type: "warp", x: 23, y: 23, map: "ashen", tx: 14, ty: 2, dir: "down", needFlag: "lyra_joined" },
      { type: "block", x: 22, y: 23, needFlagOff: "lyra_joined", text: "The watch will not open the western gate without a scout's word. Find Lyra in the plaza." }
    ]
  });

  M.tavern = parse("tavern", "The Poisoned Word", "city", `
|WWWWWWWWWWWWWWW
|W_____________W
|W_++_______++_W
|W_____________W
|W___CCCCCCC___W
|W___CCCCCCC___W
|W_____________W
|W_HH_HH_HH_HH_W
|W_____________W
|W_____________W
|W_____________W
|WWWWWWWDWWWWWWW
`, {
    spawn: { x: 7, y: 10 }, indoors: true,
    events: [
      { type: "npc", x: 7, y: 5, id: "bard", name: "Bard with a Letter", hue: "#b080c0", scene: "sealed_letter" },
      { type: "npc", x: 3, y: 8, id: "sera", name: "Sera", hue: "#e0a070", scene: "sera_found",
        appearIfOff: "sera_found" },
      { type: "warp", x: 7, y: 11, map: "meridia", tx: 8, ty: 5, dir: "down" }
    ]
  });

  M.blacksmith = parse("blacksmith", "Korin's Forge", "city", `
|WWWWWWWWWWWW
|W__________W
|W_###__###_W
|W_#A#______W
|W_###______W
|W__________W
|W__________W
|W__________W
|WWWWWWDWWWWW
`, {
    spawn: { x: 6, y: 7 }, indoors: true,
    events: [
      { type: "npc", x: 4, y: 3, id: "korin", name: "Korin", hue: "#c07040", scene: "blacksmith" },
      { type: "warp", x: 6, y: 8, map: "meridia", tx: 39, ty: 5, dir: "down" }
    ]
  });

  M.keeper_house = parse("keeper_house", "Lantern Keep", "city", `
|WWWWWWWWWW
|W________W
|W_L______W
|W________W
|W____A___W
|W________W
|W________W
|WWWWWDWWWW
`, {
    spawn: { x: 5, y: 6 }, indoors: true,
    events: [
      { type: "npc", x: 5, y: 4, id: "keeper", name: "Lantern Keeper", hue: "#e8d080", scene: "lantern_keeper" },
      { type: "warp", x: 5, y: 7, map: "meridia", tx: 9, ty: 11, dir: "down" }
    ]
  });

  M.korin_home = parse("korin_home", "Korin's Rooms", "city", `
|WWWWWWWWWW
|W________W
|W________W
|W________W
|W________W
|W________W
|W________W
|WWWWWDWWWW
`, {
    spawn: { x: 5, y: 6 }, indoors: true,
    events: [
      { type: "chest", x: 2, y: 2, id: "chest_korin", item: "sealing_salve" },
      { type: "warp", x: 5, y: 7, map: "meridia", tx: 10, ty: 20, dir: "down" }
    ]
  });

  M.ashen = parse("ashen", "Ashen Pass", "pass", `
|^^^^^^^^^^^^^^
|^aaaaaaaaaaaa^
|^aa,,,,aaaaaa^
|^aaaa,,aaa^^^
|^^^aa,,aa^^^^
|^aaaa,,aaaa^^
|^aaA,,,,aaa^^
|^aaaa,,%aaa^^
|^aaa,,,%aa^^^
|^aaaa,,aaaa^^
|^aa,,,,%aaa^^
|^aa,,aaaaaa^^
|^a,,,,GGaaa^^
|^aaa,,GGaa^^^
|^aaaa,,aaaa^^
|^aaA,,,,%aa^^
|^aaaa,,aaaa^^
|^aaa,,,%aa^^^
|^aa,,,,aaaa^^
|^aaaa,,%aaa^^
|^aaa,,,,aaa^^
|^aaaa,,aaaa^^
|^aa%,,,%aa^^^
|^aaaa,,aaaa^^
|^aaa,,,,%aa^^
|^aaaa,,aaaa^^
|^aaA,,,,aaa^^
|^aaaa,,%^^^
|^aaa,,,,D^^^
|^aaaaaaaa^^^^
|^^^^^^^^^^^^^^
`, {
    spawn: { x: 6, y: 2 },
    events: [
      { type: "warp", x: 6, y: 1, map: "meridia", tx: 22, ty: 22, dir: "up" },
      { type: "save", x: 4, y: 6 },
      { type: "save", x: 4, y: 15 },
      { type: "save", x: 4, y: 26 },
      { type: "chest", x: 9, y: 7, id: "chest_pass_charm", item: "climber_charm" },
      { type: "trigger", x: 5, y: 12, scene: "ashen_camp", flagNeedOff: "ashen_camp_done" },
      { type: "encounter", x: 6, y: 18, battle: "bound_hound", once: "quest_hound",
        appearIfOff: "quest_hound", name: "The Bound Hound" },
      { type: "encounter", x: 6, y: 27, battle: "gate_warden", once: "warden_dead",
        appearIfOff: "warden_dead", name: "Ashen Gate Warden" },
      { type: "warp", x: 6, y: 28, map: "ruins", tx: 18, ty: 2, dir: "down", needFlag: "warden_dead" },
      { type: "sign", x: 8, y: 4, text: "ASHEN PASS — The mountain keeps what the war would not bury." }
    ]
  });

  M.ruins = parse("ruins", "Ruins of the Betrayed Court", "ruins", `
|%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
|%MMMMM%%%%%aaaa%%%%%MMMMM%%%%%aaaa%%%%%MMMMM%%%
|%M+++M%%%%%aaaa%%%%%M+++M%%%%%aaaa%%%%%M+++M%%%
|%M===M%%%%%,,,,%%%%%M===M%%%%%,,,,%%%%%M===M%%%
|%M===D,,,,,,,,,,D,,,,,,,,,,D,,,,,,,,,,D===M%%%
|%MMMMM,,,,LLLL,,,,,,,,,,LLLL,,,,MMMMM%%%%%%%%%
|%%%%%%,,,,~~~~,,,,,,,,,,~~~~,,,,%%%%%%%%%%%%%%%%
|%%MMMM,,,l~~~~l,,,MMMM,,,l~~~~l,,,MMMM%%%%%%%%%%
|%%M++M,,,,~~~~,,,,M++M,,,,~~~~,,,,M++M%%%%%%%%%%
|%%M==M,,,,B,,,,,,,,,,B,,,,,,,,,,B==M%%%%%%%%%%
|%%M==D,,,,,,,,,,,,,,,,,,,,,,,,,,,,D==M%%%%%%%%%%
|%%MMMM,,,,LLLL,,,,,,,,,,LLLL,,,,MMMM%%%%%%%%%%
|%%%%%%,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,%%%%%%%%%%%%
|%%,,,,%%%%%MMMMMMMMMMMMMMMMMM%%%%%,,,,%%%%%%%%%%
|%%,A,,%%%%%M================M%%%%%,,A,%%%%%%%%%%
|%%,,,,%%%%%M==CCCC====CCCC==M%%%%%,,,,%%%%%%%%%%
|%%,,,,%%%%%M==C++C====C++C==M%%%%%,,,,%%%%%%%%%%
|%%,,,,,,,,DM==CCCC====CCCC==M D,,,,,,,,%%%%%%%%%
|%%%%%%%%%%M==================M%%%%%%%%%%%%%%%%%%
|%%%%%%%%%%M========AA========M%%%%%%%%%%%%%%%%%%
|%%%%%%%%%%M==================M%%%%%%%%%%%%%%%%%%
|%%%%%%%%%%MMMMMMMMMDMMMMMMMMMM%%%%%%%%%%%%%%%%%%
|%%%%%%%%%%%%%%%%%%,,,%%%%%%%%%%%%%%%%%%%%%%%%%%%
|%%%%%%%%%%%%%%%%%%,A,%%%%%%%%%%%%%%%%%%%%%%%%%%%
|%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
`, {
    spawn: { x: 18, y: 3 },
    events: [
      { type: "warp", x: 18, y: 2, map: "ashen", tx: 6, ty: 27, dir: "up" },
      { type: "save", x: 4, y: 14 },
      { type: "save", x: 18, y: 23 },
      { type: "npc", x: 18, y: 10, id: "echo", name: "Court Echo", hue: "#8a4a6a", talk: "echo" },
      { type: "npc", x: 10, y: 16, id: "tablet", name: "Courtyard Tablet", hue: "#d4b46a", scene: "courtyard_tablet" },
      { type: "chest", x: 32, y: 3, id: "chest_ruins_lore", item: "lore_kael" },
      { type: "chest", x: 6, y: 8, id: "chest_ruins_shard", item: "shard_crown" },
      { type: "trigger", x: 18, y: 19, scene: "betrayed_court", flagNeedOff: "court_vn_done" },
      { type: "encounter", x: 18, y: 21, battle: "mirror_shade", once: "court_survived",
        appearIf: "unseal_choice_made", appearIfOff: "court_survived", name: "The Unbetrayed" },
      { type: "warp", x: 18, y: 21, map: "throne", tx: 12, ty: 2, dir: "down", needFlag: "court_survived" },
      { type: "sign", x: 20, y: 6, text: "THE BETRAYED COURT — Names were taken from the walls. The walls remember anyway." }
    ]
  });

  M.throne = parse("throne", "Throne of Ash — Outer Gates", "throne", `
|aaaaaaaaaaaaaaaaaaaaaaaa
|aa^^^^^^^^^^^^^^^^^^aaaa
|aa^ssssssssssssssss^aaaa
|aa^ss++++AAAA++++ss^aaaa
|aa^ss+==========+ss^aaaa
|aa^ss+==========+ss^aaaa
|aa^ss++++====++++ss^aaaa
|aa^ssssss,DD,ssssss^aaaa
|aa^^^^^^,~~~~,^^^^^^aaaa
|aaaaaaaa,~~~~,aaaaaaaaaa
|aaaaaaaa,B~~B,aaaaaaaaaa
|aaaaaaaa,,,,,,aaaaaaaaaa
|aaaaaa,,,,A,,,,,aaaaaaaa
|aaaaaa,,,,,,,,,,aaaaaaaa
|aaaaaa,,,,aa,,,,aaaaaaaa
|aaaaaaaaaaaaaaaaaaaaaaaa
`, {
    spawn: { x: 12, y: 2 },
    events: [
      { type: "warp", x: 12, y: 1, map: "ruins", tx: 18, ty: 20, dir: "up" },
      { type: "save", x: 12, y: 12 },
      { type: "trigger", x: 12, y: 7, scene: "slice_ending", flagNeedOff: "slice_ending_seen" },
      { type: "chest", x: 8, y: 12, id: "chest_throne_lore", item: "lore_throne" },
      { type: "sign", x: 14, y: 6, text: "BEYOND: the Throne of Ash. The Demon King is sleeping. Do not wake him kindly. Do not wake him at all — unless you are the rite." }
    ]
  });

  return M;
})();
