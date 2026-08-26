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
  },

  midnight_watch: {
    id: "midnight_watch", bg: "camp", mode: "vn",
    onEnd: { type: "map" },
    script: [
      { s: "", t: "The third watch. The fire has gone to embers. Kael is awake. He did not plan to be." },
      { s: "elara", e: "neutral", t: "You were supposed to sleep." },
      { s: "kael", e: "serious", t: "Princes learn to stay awake at table. Habit." },
      { s: "elara", e: "sad", t: "The court taught you to be afraid of sleep." },
      { s: "kael", e: "smirk", t: "The court taught me to be afraid of my siblings. Sleep was their best opportunity." },
      { s: "elara", e: "blush", t: "That is—" },
      { s: "kael", e: "serious", t: "Normal, in my house. Don't look at me like that." },
      { s: "elara", e: "neutral", t: "I am looking at the fire." },
      { s: "kael", e: "soft", t: "..." },
      { choices: [
        { t: "\"You are safe here. For tonight.\"", set: { midnight_kind: 1, midnight_done: 1, kael_aff: 1 }, goto: "kind" },
        { t: "Keep the silence. Pour him tea.", set: { midnight_tea: 1, midnight_done: 1, kael_aff: 1 }, goto: "tea" }
      ]},
      { label: "kind", s: "kael", e: "smirk", t: "Don't make promises that only require my cooperation." },
      { s: "elara", e: "blush", t: "You would have to cooperate by sleeping." },
      { s: "kael", e: "soft", t: "...Fine. One hour." },
      { goto: "end" },
      { label: "tea", s: "kael", e: "serious", t: "The fourth tea. Suyin said to use them in order." },
      { s: "elara", e: "neutral", t: "She said not to let you drink them." },
      { s: "kael", e: "soft", t: "And yet." },
      { s: "elara", e: "blush", t: "And yet." },
      { label: "end", s: "", t: "He sleeps before the cup is empty. She watches the west and says nothing that costs her." }
    ]
  },

  sparring_scene: {
    id: "sparring_scene", bg: "forest", mode: "vn",
    onEnd: { type: "map" },
    script: [
      { s: "kael", e: "smirk", t: "Your stance is wrong." },
      { s: "elara", e: "angry", t: "I was not aware we were fighting." },
      { s: "kael", e: "serious", t: "You will be fighting. Your feet are apologizing to the ground. Stop apologizing to the ground." },
      { s: "lyra", t: "He's not wrong." },
      { s: "elara", e: "determined", t: "Fine. Show me." },
      { s: "kael", e: "serious", t: "Weight back. Chin down. Stop looking like you are delivering a verdict and look like you are a verdict." },
      { s: "elara", e: "blush", t: "That is extremely abstract instruction." },
      { s: "kael", e: "smirk", t: "You are a High Priestess. You are used to abstract." },
      { s: "", t: "She adjusts. His eyes do the thing where they stop being cruel for a moment." },
      { s: "kael", e: "serious", t: "Better. The temple trained you to hold space. I am teaching you to claim it." },
      { s: "elara", e: "neutral", t: "There's a difference." },
      { s: "kael", e: "soft", t: "Yes." },
      { s: "elara", e: "determined", t: "Show me the difference." },
      { s: "kael", e: "smirk", t: "Don't ask me like that." },
      { s: "elara", e: "blush", t: "Like what." },
      { s: "kael", e: "serious", t: "Like you're already sure I will." },
      { s: "", t: "He teaches her. It takes the whole afternoon. Neither of them calls it what it is." },
      { set: { sparring_done: 1 } }
    ]
  },

  lyra_backstory: {
    id: "lyra_backstory", bg: "camp", mode: "vn",
    onEnd: { type: "map" },
    script: [
      { s: "elara", e: "neutral", t: "You guarded the temple for three years. Why did you leave?" },
      { s: "lyra", t: "Because I was good at it." },
      { s: "elara", e: "blush", t: "That is the opposite of a reason to leave." },
      { s: "lyra", t: "When you're good at standing still, you have to choose: stay still, or find out what you're good at when you move." },
      { s: "kael", e: "soft", t: "And?" },
      { s: "lyra", t: "I'm very good at moving." },
      { s: "thorn", t: "She's good at counting, too. She counted forty-two of them before the prince went berserk." },
      { s: "lyra", t: "Forty-three. I counted the warden." },
      { s: "elara", e: "neutral", t: "I'm glad you moved." },
      { s: "lyra", t: "Don't make it sentimental. I'm going the same direction. It was efficient." },
      { s: "elara", e: "blush", t: "Noted." },
      { s: "lyra", t: "...I'm glad you asked." }
    ]
  },

  thorn_confession: {
    id: "thorn_confession", bg: "pass", mode: "vn",
    onEnd: { type: "map" },
    script: [
      { s: "", t: "After the hound. Thorn has not spoken. The mountain has." },
      { s: "elara", e: "sad", t: "You knew them." },
      { s: "thorn", t: "Name was Veth. Outer Court. Good with walls. Better with people, when anyone looked." },
      { s: "kael", e: "serious", t: "I remember. Veth kept a list. Of names to say at the end." },
      { s: "thorn", t: "Yeah." },
      { s: "elara", e: "neutral", t: "The chain wasn't punishment." },
      { s: "thorn", t: "It was. I let myself get caught because I didn't know what else to do when the war stopped." },
      { s: "kael", e: "soft", t: "I kneeled for the same reason." },
      { s: "thorn", t: "..." },
      { s: "elara", e: "sad", t: "You both stayed in the old shape because the new one hadn't arrived yet." },
      { s: "thorn", t: "Is that what this is? The new one?" },
      { s: "elara", e: "determined", t: "The road toward it." },
      { s: "thorn", t: "That's enough." },
      { set: { thorn_confession: 1 } }
    ]
  },

  kael_letter_alone: {
    id: "kael_letter_alone", bg: "tavern", mode: "vn",
    onEnd: { type: "map" },
    script: [
      { s: "", t: "After the bard. The letter is in Kael's hand. He has not opened it." },
      { s: "elara", e: "neutral", t: "You don't have to read it now." },
      { s: "kael", e: "serious", t: "I know their handwriting. My brother. Eldest. He was last." },
      { s: "elara", e: "sad", t: "You saved the poison for them." },
      { s: "kael", e: "soft", t: "And they used it first. On me. That's—" },
      { s: "kael", e: "angry", t: "That's a very old joke." },
      { s: "elara", e: "neutral", t: "What does the letter say?" },
      { s: "kael", e: "soft", t: "\"I'm sorry. I was afraid. I was wrong. I hope you became something I couldn't ruin.\"" },
      { s: "", t: "Silence that has weight. She does not fill it." },
      { s: "kael", e: "smirk", t: "He always wrote too much." },
      { s: "elara", e: "blush", t: "That was the right amount." },
      { s: "kael", e: "soft", t: "...yes." },
      { s: "", t: "He folds the letter. Keeps it." }
    ]
  },

  elara_doubt: {
    id: "elara_doubt", bg: "ruins", mode: "vn",
    onEnd: { type: "map" },
    script: [
      { s: "", t: "Before the throne gates. The west smells like something that has been patient a long time." },
      { s: "elara", e: "sad", t: "I don't know if I can do this." },
      { s: "kael", e: "serious", t: "You can." },
      { s: "elara", e: "angry", t: "Don't say it like that. Don't say it like it's simple." },
      { s: "kael", e: "soft", t: "You are seventeen and you have carried a court, a seal, a demon, a scout, and a mountain since dawn. I'm not saying it's simple. I'm saying you can." },
      { s: "lyra", t: "He's right. And he hates being right. Look how much he hates it." },
      { s: "kael", e: "smirk", t: "Completely." },
      { s: "thorn", t: "I've been the door for fifteen months. If the kid can do this, it's worth the door." },
      { s: "elara", e: "blush", t: "I'm not—I'm the High Priestess." },
      { s: "thorn", t: "That too." },
      { s: "elara", e: "determined", t: "...okay." },
      { s: "kael", e: "soft", t: "Okay." },
      { s: "", t: "She walks first. Because she always does." }
    ]
  },

  dawn_banter: {
    id: "dawn_banter", bg: "camp", mode: "vn",
    onEnd: { type: "map" },
    script: [
      { s: "", t: "Dawn. Wrong side of the pass. Everyone awake before they wanted to be." },
      { s: "lyra", t: "The prince snores." },
      { s: "kael", e: "angry", t: "I do not snore." },
      { s: "lyra", t: "I timed it. Twelve seconds, pause, seven seconds, a sound like someone losing an argument." },
      { s: "elara", e: "blush", t: "I did not hear anything." },
      { s: "kael", e: "smirk", t: "Because she is polite." },
      { s: "thorn", t: "I heard it." },
      { s: "kael", e: "serious", t: "..." },
      { s: "elara", e: "neutral", t: "The tea is ready. No one is going to mention what they heard in exchange for hot tea. That is the deal." },
      { s: "lyra", t: "Deal." },
      { s: "thorn", t: "Deal." },
      { s: "kael", e: "smirk", t: "The deal is insulting. I accept." },
      { s: "elara", e: "blush", t: "Good morning." },
      { s: "", t: "The morning is good. It holds its breath and stays that way." }
    ]
  },

  post_meridia_skirmish: {
    id: "post_meridia_skirmish", bg: "meridia", mode: "vn",
    onEnd: { type: "map" },
    script: [
      { s: "lyra", t: "Shadow knights. They weren't here last month." },
      { s: "kael", e: "serious", t: "Court remnants. Someone is calling old armor with fresh orders." },
      { s: "elara", e: "neutral", t: "Does someone know we're coming?" },
      { s: "kael", e: "smirk", t: "Someone has always known. That's the point of the gate." },
      { s: "thorn", t: "Then we stop being subtle." },
      { s: "lyra", t: "We were never subtle. We had a demon prince and a priestess walking a canal street." },
      { s: "elara", e: "determined", t: "The pass, then. No detours." },
      { s: "kael", e: "soft", t: "No detours." }
    ]
  },

  quest_herbalist: {
    id: "quest_herbalist", bg: "meridia", mode: "vn",
    onEnd: { type: "map" },
    script: [
      { s: "herbalist", t: "You went into the margins. You're still here." },
      { s: "lyra", t: "The plants were moving. We did not ask them why. We asked them to stop." },
      { s: "herbalist", t: "That's better than the last three." },
      { s: "elara", e: "neutral", t: "What happened to the last three?" },
      { s: "herbalist", t: "They asked why. Plants don't have a short answer." },
      { s: "kael", e: "smirk", t: "Neither do priests." },
      { s: "elara", e: "blush", t: "I have short answers." },
      { s: "herbalist", t: "You have correct answers at length. Different thing." },
      { s: "herbalist", t: "Here. Canal-herb bundle. Use it before the pass — the mountain doesn't like people who arrive tired." },
      { set: { quest_herbalist: 1 } }
    ]
  }
};
