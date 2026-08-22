/* Visual-novel scripts. Keep lines short; flags/labels unchanged. */
window.SCENES = {
  intro: {
    id: "intro", bg: "temple", mode: "vn",
    onEnd: { type: "map", map: "temple" },
    script: [
      { s: "", t: "Silver Lotus Temple. Twilight. Kael kneels in gold chains. Elara holds a staff she is not allowed to shake." },
      { s: "suyin", t: "Westward. Take the prince. Finish what we postponed." },
      { s: "kael", e: "smirk", t: "Ask louder. I like it when the Church pretends I am weather." },
      { s: "elara", e: "neutral", t: "Do not speak until the binding is set." },
      { s: "kael", e: "smirk", t: "Little saint. Your sermons are as dull as your fashion sense." },
      { s: "elara", e: "blush", t: "The scriptures say patience is a virtue. They do not say I have to like you." },
      { s: "suyin", t: "If he runs, the seal takes you first. If you die, it takes him. Mutual hostage. Better lighting." },
      { s: "kael", e: "serious", t: "My court voted me into a grave. I do not escort priestesses. I survive them." },
      { s: "elara", e: "determined", t: "Then survive me west." },
      { s: "kael", e: "smirk", t: "You are seventeen. The continent is full of intended girls." },
      { s: "elara", e: "angry", t: "You are eighteen and unemployed. Bind him. Now." },
      { s: "", t: "Gold climbs his throat. He does not bow. Her ears go pink." },
      { s: "kael", e: "soft", t: "If you die, the seal breaks and I am free. Somehow that displeases me. Try not to be useless." },
      { s: "elara", e: "neutral", t: "Logged. Badly phrased." },
      { s: "suyin", t: "Village, then forest. Do not answer the trees. Elara— you may be seventeen on the days the world is not ending. I packed four teas. Use them in order." },
      { s: "kael", e: "smirk", t: "I will drink the tea." },
      { s: "elara", e: "angry", t: "You will not." },
      { choices: [
        { t: "Bow to the abbess. Ignore him.", set: { intro_dignity: 1, intro_done: 1 }, goto: "leave" },
        { t: "\"You will drink water. Say please.\"", set: { intro_fire: 1, intro_done: 1 }, goto: "snap" }
      ]},
      { label: "snap", s: "kael", e: "smirk", t: "Please is a human word. I will consider a nod." },
      { s: "elara", e: "determined", t: "A nod, then." },
      { goto: "leave" },
      { label: "leave", s: "", t: "The road west has no period. They walk anyway." }
    ]
  },

  leaving_temple: {
    id: "leaving_temple", bg: "temple", mode: "vn",
    onEnd: { type: "map" },
    script: [
      { s: "elara", e: "neutral", t: "Village first. Mock the acolytes and I add laundry to the seal." },
      { s: "kael", e: "smirk", t: "White and blue. The palette of people who have never been interesting at a funeral." },
      { s: "elara", e: "blush", t: "Vestments. They are supposed to be clean." },
      { s: "kael", e: "smirk", t: "Then you are succeeding at the wrong thing." }
    ]
  },

  first_camp: {
    id: "first_camp", bg: "camp", mode: "vn",
    onEnd: { type: "map", map: "forest", x: 24, y: 3 },
    script: [
      { s: "", t: "Forest edge. A fire that is too neat. Kael sits too close." },
      { s: "elara", e: "neutral", t: "Sleep. If the dark calls your name, it is not your name. Do not answer." },
      { s: "kael", e: "smirk", t: "Tea and a lecture. Which one is the performance, little saint— the wisdom, or the flush?" },
      { s: "elara", e: "sad", t: "Both. That is the job." },
      { s: "kael", e: "smirk", t: "If you faint I will carry you. Then I will complain for a decade." },
      { s: "elara", e: "blush", t: "You will not carry me." },
      { s: "kael", e: "serious", t: "Then do not faint. Simple contract. Your Church understood the one on my bones." },
      { s: "elara", e: "sad", t: "I argued a clause. They refused. I am sorry." },
      { s: "kael", e: "soft", t: "Don't. I was a prince. I am still a prince." },
      { choices: [
        { t: "Offer him the first tea.", set: { camp_tea: 1, camp1_done: 1, kael_aff: 1 }, goto: "tea" },
        { t: "Keep the tea. Take first watch.", set: { camp_watch: 1, camp1_done: 1, elara_aff: 1 }, goto: "watch" }
      ]},
      { label: "tea", s: "kael", e: "smirk", t: "Tastes like wet flowers. Fine. Don't look at me like you won." },
      { s: "elara", e: "blush", t: "Sleep. If the trees ask, I will say you are busy." },
      { goto: "endcamp" },
      { label: "watch", s: "kael", e: "serious", t: "First watch is mine. Rites leave holes." },
      { s: "elara", e: "neutral", t: "That was almost concern." },
      { s: "kael", e: "smirk", t: "Tactical. I refuse to drag a sermon-corpse. Sleep." },
      { label: "endcamp", s: "", t: "The fire ticks. West, something old inhales." }
    ]
  },

  tut_wisp_vn: {
    id: "tut_wisp_vn", bg: "forest", mode: "talk",
    onEnd: { type: "map" },
    script: [
      { s: "elara", e: "neutral", t: "Wisps. Do not spend the Seal on them." },
      { s: "kael", e: "smirk", t: "I spent a glance. You're welcome." }
    ]
  },

  post_hollow: {
    id: "post_hollow", bg: "forest", mode: "vn",
    onEnd: { type: "map" },
    script: [
      { s: "", t: "The heartwood falls. The west is a path now." },
      { s: "elara", e: "sad", t: "Guardian and victim. I hate that those keep being the same word." },
      { s: "kael", e: "smirk", t: "You meditated. I charged. File it under tactical." },
      { s: "elara", e: "blush", t: "If I unseal you, I hit the floor. I will not always refuse that math." },
      { s: "kael", e: "soft", t: "When you do—don't apologize in my teeth." },
      { s: "elara", e: "determined", t: "Meridia next. Try not to declare yourself." },
      { s: "kael", e: "smirk", t: "I never declare. I arrive." },
      { set: { hollow_oak_dead: 1 } }
    ]
  },

  meridia_arrival: {
    id: "meridia_arrival", bg: "meridia", mode: "vn",
    onEnd: { type: "map" },
    script: [
      { s: "lyra", t: "Late, little saint. Forest is eating people. You blessed a cat." },
      { s: "elara", e: "blush", t: "Temple cat. There are protocols." },
      { s: "lyra", t: "Lyra. I used to guard your doors. I'm coming. Someone has to count arrows." },
      { s: "kael", e: "smirk", t: "My coat has never been on fire. Adjacent to glory." },
      { s: "lyra", t: "Smith who won't sell legends. Bard with a dead prince's letter. Canal with teeth. Pick your tragedy." },
      { s: "kael", e: "serious", t: "The letter." },
      { s: "elara", e: "neutral", t: "And the child by the water. We are not a shopping list." },
      { s: "lyra", t: "Same thing, done right. Don't bleed on the mosaic." },
      { set: { lyra_joined: 1 } }
    ]
  },

  quest_shen: {
    id: "quest_shen", bg: "forest", mode: "vn",
    onEnd: { type: "map" },
    script: [
      { s: "shen", t: "I came to scold a tree. It scolded me back. Nine days. Tea?" },
      { s: "elara", e: "neutral", t: "One cup. Today is not a tea day, but I will pour." },
      { s: "shen", t: "Lotus Palm. Not a stronger slap. A slap that remembers the body. Try not to disappoint me." },
      { s: "kael", e: "smirk", t: "A technique from a man who lost to bark." },
      { s: "shen", t: "When she unseals you, hit the thing I could not talk out of being a door." },
      { set: { quest_shen: 1 } }
    ]
  },

  canal_quest_start: {
    id: "canal_quest_start", bg: "meridia", mode: "talk",
    onEnd: { type: "map" },
    script: [
      { s: "jori", t: "The shoe-thief followed us. South canal. I am not lying." },
      { s: "lyra", t: "He's lying about the size. Not the teeth. Do not unseal the prince into city water." },
      { set: { canal_ready: 1 } }
    ]
  },

  post_canal: {
    id: "post_canal", bg: "meridia", mode: "vn",
    onEnd: { type: "map" },
    script: [
      { s: "lyra", t: "Scout's Mercy. Interrupt the telegraph, or the funeral." },
      { s: "elara", e: "sad", t: "It was wearing a shoe." },
      { s: "kael", e: "soft", t: "Be angry. Anger holds the worse things in." },
      { s: "elara", e: "blush", t: "That was almost kind." },
      { s: "kael", e: "smirk", t: "Misheard. I said steel." },
      { set: { quest_canal: 1 } }
    ]
  },

  blacksmith: {
    id: "blacksmith", bg: "forge", mode: "talk",
    onEnd: { type: "map" },
    script: [
      { s: "korin", t: "I don't sell better. I make true. Bring Sera home and I'll put the First Oath back in your silk." },
      { cond: { sera_found: 1 }, s: "korin", t: "You brought her. Hold still. This will look like gold." },
      { cond: { sera_found: 1 }, set: { quest_blacksmith: 1 } },
      { cond: { sera_found: 0 }, s: "elara", e: "neutral", t: "I will bring her. As a person. Not as metal." }
    ]
  },

  sera_found: {
    id: "sera_found", bg: "tavern", mode: "talk",
    onEnd: { type: "map" },
    script: [
      { s: "sera", t: "The story was stupid. I followed it. Tell father I'm walking home. Don't 'collect' me." },
      { s: "elara", e: "neutral", t: "I know the difference between a quest and a kidnapping." },
      { s: "kael", e: "smirk", t: "The Church is historically foggy on that." },
      { set: { sera_found: 1 } }
    ]
  },

  sealed_letter: {
    id: "sealed_letter", bg: "tavern", mode: "vn",
    onEnd: { type: "map" },
    script: [
      { s: "bard", t: "Letter. Dead prince's wax. Buy it, or stare." },
      { s: "kael", e: "serious", t: "Give it." },
      { s: "", t: "His handwriting. A list of names he meant to save. None saved." },
      { s: "kael", e: "soft", t: "Poisoned Benediction. I saved it for my siblings. They used it first." },
      { s: "elara", e: "sad", t: "Learn it. Use it. Not on yourself." },
      { s: "kael", e: "smirk", t: "Logged." },
      { set: { quest_letter: 1 } }
    ]
  },

  lantern_keeper: {
    id: "lantern_keeper", bg: "meridia", mode: "talk",
    onEnd: { type: "map" },
    script: [
      { s: "keeper", t: "This lantern dies when someone lies. Take it. Including you." },
      { s: "elara", e: "determined", t: "I will try to deserve it." },
      { s: "kael", e: "smirk", t: "I will stand next to it." },
      { set: { quest_lantern: 1 } }
    ]
  },

  ashen_camp: {
    id: "ashen_camp", bg: "pass", mode: "vn",
    onEnd: { type: "map" },
    script: [
      { s: "lyra", t: "Warden ahead. Multi-phase. Spam and it eats her. We set up." },
      { s: "elara", e: "neutral", t: "Empower two people. Mark. Charge. If I drop, Lyra drags me. Not him." },
      { s: "kael", e: "smirk", t: "I complain in the original demonic." },
      { s: "elara", e: "blush", t: "Something chained on this mountain. We look." },
      { s: "kael", e: "serious", t: "Do not collect my species. We are not cats." },
      { s: "lyra", t: "Sleep. Tomorrow we teach a door manners." },
      { set: { ashen_camp_done: 1 } }
    ]
  },

  post_hound: {
    id: "post_hound", bg: "pass", mode: "vn",
    onEnd: { type: "map" },
    script: [
      { s: "thorn", t: "Thorn. They left me as scenery. I'll tank. Don't unseal him on my account." },
      { s: "kael", e: "serious", t: "Outer Court. I remember the gauntlets." },
      { s: "thorn", t: "You remember everyone's metal. I'm coming. Someone has to be the door during the K-drama." },
      { s: "elara", e: "neutral", t: "Welcome. You will not be scenery." },
      { set: { quest_hound: 1, thorn_joined: 1 } }
    ]
  },

  post_warden: {
    id: "post_warden", bg: "pass", mode: "vn",
    onEnd: { type: "map" },
    script: [
      { s: "elara", e: "sad", t: "Man, then job, then door. I would like, once, a monster that stayed a monster." },
      { s: "kael", e: "soft", t: "Welcome to my old house. Don't touch the mirrors. One of them is me." },
      { s: "lyra", t: "If he gets quiet, that's the danger." },
      { s: "thorn", t: "I was quiet for a mountain. Don't recommend it." },
      { set: { warden_dead: 1 } }
    ]
  },

  courtyard_tablet: {
    id: "courtyard_tablet", bg: "ruins", mode: "talk",
    onEnd: { type: "map" },
    script: [
      { s: "elara", e: "neutral", t: "Seal-script. It wants to be a circlet." },
      { s: "kael", e: "serious", t: "Wear it. If anyone wears my house, it should be you." },
      { s: "elara", e: "blush", t: "Because the tablet said. Not because you did." },
      { set: { quest_tablet: 1 } }
    ]
  },

  betrayed_court: {
    id: "betrayed_court", bg: "ruins", mode: "vn",
    onEnd: { type: "choice_then_battle" },
    script: [
      { s: "", t: "The throne room still has a ceiling. The mirror is too clean." },
      { s: "kael", e: "serious", t: "They ate me with votes. I let humanity bind me. Pride is a suicide that walks." },
      { s: "elara", e: "angry", t: "Then spend the venom. I can hold it." },
      { s: "kael", e: "soft", t: "Don't you dare be wise at my ruins." },
      { s: "elara", e: "blush", t: "I will unseal you when the math says so. I will not apologize in your teeth." },
      { s: "", t: "The Unbetrayed steps out of the glass. Kael, if no one had ever hurt him." },
      { s: "shade", t: "She will crack you like a useful jar. That is liturgy, not love. Come home." },
      { s: "kael", e: "angry", t: "I left on purpose." },
      { s: "elara", e: "determined", t: "I can break the Seal. You end him. I hit the floor. Or we do it the long way, and I keep my feet." },
      { s: "kael", e: "soft", t: "If you unseal me, watch the door. Not my face. Pick. Kindness that costs." },
      { choices: [
        { t: "Unseal him. Trust the party.", set: { unseal_choice: "yes", unseal_choice_made: 1, court_vn_done: 1, unsealed_once: 1 }, goto: "yes" },
        { t: "Keep the seal. Fight long.", set: { unseal_choice: "no", unseal_choice_made: 1, court_vn_done: 1 }, goto: "no" }
      ]},
      { label: "yes", s: "elara", e: "determined", t: "Go apeshit." },
      { s: "kael", e: "berserk", t: "Logged." },
      { goto: "fight" },
      { label: "no", s: "elara", e: "neutral", t: "Cover me. I will not be a jar." },
      { s: "kael", e: "smirk", t: "Boring. Correct." },
      { label: "fight", s: "", t: "The mirror draws a blade." }
    ]
  },

  post_mirror: {
    id: "post_mirror", bg: "ruins", mode: "vn",
    onEnd: { type: "map", map: "throne", x: 12, y: 3 },
    script: [
      { cond: { unseal_choice: "yes" }, s: "kael", e: "soft", t: "You hit the floor. I hated it. I also ended him." },
      { cond: { unseal_choice: "yes" }, s: "elara", e: "blush", t: "I watched the door. It was you coming back." },
      { cond: { unseal_choice: "no" }, s: "kael", e: "smirk", t: "The long way. Attractive. Tactically." },
      { cond: { unseal_choice: "no" }, s: "elara", e: "angry", t: "Call it correct." },
      { s: "lyra", t: "Throne gates from here. Paper said I was done. Paper can drown." },
      { s: "thorn", t: "I'll be the door." },
      { s: "elara", e: "determined", t: "Then we go." },
      { s: "kael", e: "smirk", t: "After you. Don't bless the ash." },
      { set: { court_survived: 1 } }
    ]
  },

  slice_ending: {
    id: "slice_ending", bg: "throne", mode: "vn",
    onEnd: { type: "credits" },
    script: [
      { s: "", t: "The outer gates. The King is still sleeping. The rest of the road is years." },
      { s: "elara", e: "neutral", t: "Not the end. First honest door." },
      { s: "kael", e: "smirk", t: "Good. I have taken up not dying beside a priestess." },
      { s: "lyra", t: "I'll scout. Count the times he almost says it." },
      { s: "thorn", t: "Door." },
      { s: "elara", e: "determined", t: "Purification is a road. Not cleanliness." },
      { s: "kael", e: "soft", t: "Don't make that a sermon." },
      { s: "elara", e: "blush", t: "Too late." },
      { s: "", t: "End of the slice. The Throne waits." },
      { set: { slice_ending_seen: 1 } }
    ]
  }
};
