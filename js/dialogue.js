/* Visual-novel scripts. Labels + goto for branches. Flags set via `set`. */
window.SCENES = {
  intro: {
    id: "intro", bg: "temple", mode: "vn",
    onEnd: { type: "map", map: "temple" },
    script: [
      { s: "", t: "Silver Lotus Temple. Twilight. The sanctum smells of wet stone and crushed petals. A boy-shaped catastrophe kneels at the altar in chains of pale gold, and a girl who is High Priestess stands over him with a staff she is not allowed to shake." },
      { s: "suyin", t: "Elara. The west has opened its mouth. The Throne of Ash is speaking in its sleep. You will go. You will take the sealed prince. You will purify what our grandmothers only postponed." },
      { s: "elara", e: "neutral", t: "I have read the rite forty-one times. I have corrected the forty-first. I am not afraid of the road." },
      { s: "suyin", t: "I did not ask if you were afraid of the road. I asked if you were afraid of him." },
      { s: "kael", e: "smirk", t: "Ask louder. I enjoy the part where the Church pretends I am a weather problem." },
      { s: "elara", e: "neutral", t: "You will not speak until the binding is set. That is not a sermon. That is a safety instruction." },
      { s: "kael", e: "smirk", t: "Little saint. Your safety instructions have a tremor in them. Charming. Like a bell that knows it is cracked." },
      { s: "elara", e: "blush", t: "The scriptures say patience is a virtue. They do not say I have to like the people who test it." },
      { s: "suyin", t: "The High Seal will hold most of him. What remains is escort, spite, and a very expensive sword. Elara: if he runs, the seal unravels you first. If you die, it unravels him. This is not a marriage. It is a mutual hostage situation with better lighting." },
      { s: "kael", e: "serious", t: "My court put knives in the places they used to put my name. Humanity arrived at dawn and found me already kneeling, which they have been insufferable about ever since. I do not escort priestesses. I survive them." },
      { s: "elara", e: "determined", t: "Then survive me westward. The Demon King is a conversation that has gone on too long. I intend to finish it without raising my voice." },
      { s: "kael", e: "smirk", t: "You are seventeen. You intend a great many things. The continent is a graveyard of intended girls." },
      { s: "elara", e: "angry", t: "And you are eighteen and unemployed. Do not lecture me on graves you personally stocked." },
      { s: "kael", e: "smirk", t: "There. The foot-stamp. I was wondering when the High Priestess would remember she still has ankles." },
      { s: "elara", e: "blush", t: "…The binding. Now. Before I revise the rite to include a gag." },
      { s: "", t: "Gold light climbs Kael's throat like a polite noose. The seals on his hands brighten, then dim to a coal-glow. He does not bow. He does not look away. Elara's staff is very steady. Her ears are pink." },
      { s: "kael", e: "soft", t: "If you die, little priestess, the seal breaks and I am free — yet somehow that outcome displeases me. Do try harder not to be useless." },
      { s: "elara", e: "neutral", t: "I will take that as an oath. Badly phrased. Logged." },
      { s: "suyin", t: "Go at dawn. Speak to the house first; they will want to touch your sleeves and pretend it is blessing. The village road runs into the Whispering Forest. Do not answer the trees. Do not let him answer the trees. And Elara—" },
      { s: "elara", e: "neutral", t: "Mother?" },
      { s: "suyin", t: "You are allowed to be seventeen on the days the world is not ending. I have packed you tea for those days. There are four of them. Use them in the correct order." },
      { s: "kael", e: "smirk", t: "I will drink the tea." },
      { s: "elara", e: "angry", t: "You will not drink the tea." },
      { choices: [
        { t: "Keep your dignity. Bow to the abbess. Ignore him.", set: { intro_dignity: 1, intro_done: 1 }, goto: "leave" },
        { t: "Look at Kael. \"You will drink water, and you will say please.\"", set: { intro_fire: 1, intro_done: 1 }, goto: "snap" }
      ]},
      { label: "snap", s: "kael", e: "smirk", t: "Please is a human word. I will consider a nod." },
      { s: "elara", e: "determined", t: "A nod, then. I am collecting small civilities the way other pilgrims collect scars." },
      { goto: "leave" },
      { label: "leave", s: "", t: "The sanctum releases them. Outside, lotus beds tick in the evening wind. The road west is a dark sentence with no period. The pilgrimage of purification has a first step, and it is made of two people who would rather be anyone else." }
    ]
  },

  leaving_temple: {
    id: "leaving_temple", bg: "temple", mode: "vn",
    onEnd: { type: "map" },
    script: [
      { s: "elara", e: "neutral", t: "The village first. Then the forest. If you mock the acolytes I will add a clause to the seal about laundry." },
      { s: "kael", e: "smirk", t: "Little saint, your sermons are as dull as your fashion sense. White and blue. The palette of people who have never been interesting at a funeral." },
      { s: "elara", e: "blush", t: "These are vestments. They are not supposed to be interesting. They are supposed to be clean." },
      { s: "kael", e: "smirk", t: "Then we agree: you are succeeding at the wrong thing." }
    ]
  },

  first_camp: {
    id: "first_camp", bg: "camp", mode: "vn",
    onEnd: { type: "map", map: "forest", x: 24, y: 3 },
    script: [
      { s: "", t: "The Whispering Forest does not wait for permission. By the time the lanterns of Lotus-Step are only a rumor at their backs, the trees have begun to speak in the voices of people who almost made it through. Elara sets a fire that is too neat. Kael refuses to sit until she asks, and then sits too close." },
      { s: "elara", e: "neutral", t: "We rest here. In the morning we find the heartwood that has been eating scouts. You will not wander. You will not answer if your name is called from the dark. It will not be your name. It will be an old war wearing your mouth." },
      { s: "kael", e: "smirk", t: "You packed tea and a lecture. How lavish. Tell me, High Priestess: when you close your eyes, do you still see the abbess's hands shaking, or have you already filed that under 'acceptable losses'?" },
      { s: "elara", e: "angry", t: "Do not—" },
      { s: "kael", e: "smirk", t: "Do not what? Touch the bruise? You stood in that sanctum like a statue someone had wound too tight. Super-wise. Super-seventeen. You flushed when I called you little saint and then you put a noose of gold on my throat with very steady hands. Which of those is the performance?" },
      { s: "elara", e: "sad", t: "Both. That is the job. The rite does not care if I am tired of being older than my age and younger than my title. The Demon King will not wait for my voice to finish dropping." },
      { s: "kael", e: "serious", t: "Ah. Honesty. How gauche. I prefer you when you are quoting scripture at my coat." },
      { s: "elara", e: "neutral", t: "Your coat is a crime against tailoring. The scriptures are silent on that, so I will be loud." },
      { s: "kael", e: "smirk", t: "There. Ankles again. Good. If you go marble on me in the trees, I will have to carry you, and I have a policy about carrying people who smell like lotuses: I do it, and I complain for a decade." },
      { s: "elara", e: "blush", t: "You will not carry me." },
      { s: "kael", e: "smirk", t: "Then do not faint. It is a very simple contract. Even a Church can understand simple contracts. They understood the one they wrote on my bones." },
      { s: "elara", e: "sad", t: "I read that contract. I argued a clause. They did not take it. I am sorry." },
      { s: "kael", e: "soft", t: "…Don't. Pity is a human condiment. I was a prince. I am still a prince. The difference is only who is allowed to say so." },
      { s: "elara", e: "neutral", t: "I will say so, if you want it said. Not because you are good. Because you are here, and the west is worse, and I will not walk it with a man who thinks his name is contraband." },
      { choices: [
        { t: "Offer him the first of Suyin's four teas.", set: { camp_tea: 1, camp1_done: 1, kael_aff: 1 }, goto: "tea" },
        { t: "Keep the tea. Offer a watch-shift instead.", set: { camp_watch: 1, camp1_done: 1, elara_aff: 1 }, goto: "watch" }
      ]},
      { label: "tea", s: "kael", e: "smirk", t: "It tastes like wet flowers and a woman trying not to cry into a kettle. Fine. I'll drink it. Don't look at me like you've won a war." },
      { s: "elara", e: "blush", t: "I look like someone who has one fewer tea and one more problem. Sleep. I will take first watch. If the trees say your name, I will tell them you are busy being insufferable." },
      { goto: "endcamp" },
      { label: "watch", s: "kael", e: "serious", t: "First watch is mine. You did a rite today. Rites leave holes. Things with teeth like holes." },
      { s: "elara", e: "neutral", t: "That was almost concern. Should I log it with the nod?" },
      { s: "kael", e: "smirk", t: "Log it as a tactical assessment. If you die, I have to drag a sermon-corpse to a mountain. I refuse. Sleep, little saint. Dream of a wardrobe with more than two colors." },
      { label: "endcamp", s: "", t: "The fire ticks. Somewhere west, a tree that used to be a temple inhales. In the morning there will be a boss that cannot be shouted to death. Tonight there is tea, or the absence of tea, and two people learning the shape of each other's silences." }
    ]
  },

  tut_wisp_vn: {
    id: "tut_wisp_vn", bg: "forest", mode: "talk",
    onEnd: { type: "map" },
    script: [
      { s: "elara", e: "neutral", t: "Wisps. The forest shedding old prayers. They are not the heartwood. Do not spend the Seal on them. Do not spend me on them." },
      { s: "kael", e: "smirk", t: "I spent a glance. You are welcome." }
    ]
  },

  post_hollow: {
    id: "post_hollow", bg: "forest", mode: "vn",
    onEnd: { type: "map" },
    script: [
      { s: "", t: "The Heartwood Hollow comes down like a cathedral deciding to be a log. Sap that is too dark for sap beads on Elara's staff. Kael is breathing as if he has been asked to do it on purpose. The path west, for the first time, is a path." },
      { s: "elara", e: "sad", t: "It was a guardian. It was also a victim. I do not like that those keep being the same word." },
      { s: "kael", e: "serious", t: "Then you will hate the mountain. And the court. And the Throne. Journey-to-the-west stories are just long lists of things that were people once and then were jobs." },
      { s: "elara", e: "neutral", t: "You charged Hellcoil. I saw you take the empty turn. You stood there like a statue and let it look at you." },
      { s: "kael", e: "smirk", t: "I was giving you time to be useful. You meditated. Vulnerable as a hymn. I could have been polite and died. I chose not to. File it under 'tactical.'" },
      { s: "elara", e: "blush", t: "If I had unsealed you, the tree would be ash and I would be on the ground. That is the shape of our math. I will not always refuse the math. I am telling you now so you cannot pretend to be surprised." },
      { s: "kael", e: "soft", t: "When you do it — if you do it — do not apologize while I am killing the sky. I cannot stand apologies in my teeth." },
      { s: "elara", e: "determined", t: "Meridia next. Human kingdom. Canals, lanterns, a smith who does not sell better swords. Try not to declare yourself at the gate." },
      { s: "kael", e: "smirk", t: "I never declare. I arrive. The difference is tax." },
      { set: { hollow_oak_dead: 1 } }
    ]
  },

  meridia_arrival: {
    id: "meridia_arrival", bg: "meridia", mode: "vn",
    onEnd: { type: "map" },
    script: [
      { s: "", t: "Meridia is a city that learned canals from a god and lanterns from a committee. The plaza smells of oil, bread, and the particular fear of people who have a wall and know it is not enough. A woman with a bow is already tired of them." },
      { s: "lyra", t: "Elara of the Silver Lotus. You're late, little saint. I watched you bless a cat two villages back. The forest is eating people and you are blessing a cat." },
      { s: "elara", e: "blush", t: "It was a temple cat. There are protocols. Also it looked at me like I was the junior." },
      { s: "lyra", t: "I'm Lyra. I used to stand your doors. Then the doors started pretending the west wasn't a direction. I took the map personally. I'm coming with you. Someone has to count the arrows and tell the prince when his coat is on fire." },
      { s: "kael", e: "smirk", t: "It has never been on fire. It has been adjacent to glory." },
      { s: "lyra", t: "Uh-huh. You two have the slowest-burn argument I have ever been drafted into. Don't make me play mother. I will, and I will be mean about it." },
      { s: "elara", e: "neutral", t: "The western gate is closed without a scout's word. That is you. Thank you. I will not make you play mother. I will make you play eyes." },
      { s: "lyra", t: "Acceptable. There's a smith named Korin who will not sell you a legend. There's a bard in the Poisoned Word selling a letter with a dead prince's wax. There's a canal that has started having teeth. Pick your optional tragedies; I like the ones with names." },
      { s: "kael", e: "serious", t: "The letter." },
      { s: "elara", e: "neutral", t: "We will look. We will also look at the child by the water. We are a pilgrimage, not a shopping list." },
      { s: "lyra", t: "Same thing, if you do it right. Welcome to Meridia. Try not to bleed on the mosaic. It's original." },
      { set: { lyra_joined: 1 } }
    ]
  },

  quest_shen: {
    id: "quest_shen", bg: "forest", mode: "vn",
    onEnd: { type: "map" },
    script: [
      { s: "", t: "The man under the marked tree is sitting in a way that suggests he lost an argument and is too polite to leave. His beard has leaves in it on purpose." },
      { s: "shen", t: "Ah. The High Priestess. I came here to ask a tree why it had started eating names. The tree asked me why I had stopped teaching. We have been at an impasse for nine days. Do you have any tea?" },
      { s: "elara", e: "neutral", t: "I have three remaining. One is for a day the world is not ending. Today is not that day. I will still pour." },
      { s: "shen", t: "Good. In return: Lotus Palm. It is not a stronger slap. It is a slap that remembers what the body was before it became a boss. You will use it, and I will be — not proud, I am too old for proud — less disappointed." },
      { s: "kael", e: "smirk", t: "A technique from a man who lost to bark. Our arsenal grows distinguished." },
      { s: "shen", t: "Boy. When she unseals you, try to hit the thing I could not talk out of being a door. I would like my argument to have a conclusion." },
      { s: "elara", e: "determined", t: "I will learn it. I will use it. I will tell the next tree you sent your regards." },
      { set: { quest_shen: 1 } }
    ]
  },

  canal_quest_start: {
    id: "canal_quest_start", bg: "meridia", mode: "talk",
    onEnd: { type: "map" },
    script: [
      { s: "jori", t: "It followed us from Lotus-Step. The shoe-thief. It's in the south canal. Lyra said if I lied again she'd make me eat a map. I'm not lying." },
      { s: "lyra", t: "He is lying about the size. He is not lying about the teeth. South walk. I'll mark it. Don't unseal the prince into a municipal water feature. The paperwork would outlive us." },
      { set: { canal_ready: 1 } }
    ]
  },

  post_canal: {
    id: "post_canal", bg: "meridia", mode: "vn",
    onEnd: { type: "map" },
    script: [
      { s: "lyra", t: "That's the shot. Scout's Mercy. You interrupt a telegraph or you interrupt a funeral. I learned it watching you refuse to let a child be a metaphor." },
      { s: "elara", e: "sad", t: "It was wearing a shoe. I am going to be angry about a shoe for a year." },
      { s: "kael", e: "soft", t: "Be angry. Anger is a kind of seal. It holds the worse things in." },
      { s: "elara", e: "blush", t: "That was almost kind." },
      { s: "kael", e: "smirk", t: "Misheard. I said 'anger is a kind of steel.' Your lotus is full of water. It rusts the ear." },
      { set: { quest_canal: 1 } }
    ]
  },

  blacksmith: {
    id: "blacksmith", bg: "forge", mode: "talk",
    onEnd: { type: "map" },
    script: [
      { s: "korin", t: "I don't sell better. I make true. Your robe has a name even if you haven't given it one. Bring me Sera from the tavern's stupid story, and I'll put the First Oath back in the silk. That's the only upgrade I know how to love." },
      { cond: { sera_found: 1 }, s: "korin", t: "You brought her. She's tired of being a reason. Good. Reasons make poor daughters and excellent steel. Come here, Priestess. Hold still. This will look like gold. It will feel like someone keeping a promise you forgot you made at twelve." },
      { cond: { sera_found: 1 }, set: { quest_blacksmith: 1 } },
      { cond: { sera_found: 0 }, s: "elara", e: "neutral", t: "I will bring her. Not as metal. As a person who is tired." }
    ]
  },

  sera_found: {
    id: "sera_found", bg: "tavern", mode: "talk",
    onEnd: { type: "map" },
    script: [
      { s: "sera", t: "The bard's story was stupid. I followed it anyway. That's a family trait. Tell father I'm tired of being a reason in someone else's metal. I'll walk home. I'm not a chest. Don't 'collect' me." },
      { s: "elara", e: "neutral", t: "I would not. I am seventeen and I still know the difference between a quest and a kidnapping." },
      { s: "kael", e: "smirk", t: "The Church is historically foggy on that difference. She's funny. Keep her." },
      { set: { sera_found: 1 } }
    ]
  },

  sealed_letter: {
    id: "sealed_letter", bg: "tavern", mode: "vn",
    onEnd: { type: "map" },
    script: [
      { s: "bard", t: "Letter. Wax like a wound. Mark of a prince who doesn't exist. I can sell it to a collector, or I can watch a man in a torn coat pretend he isn't hungry." },
      { s: "kael", e: "serious", t: "Give it." },
      { s: "elara", e: "neutral", t: "We will pay in an honest stare, as advertised. If it is a trap, I will be disappointed in a professional way." },
      { s: "", t: "The wax breaks like a scab. The hand is Kael's, from a year he does not claim. It is not a love letter. It is worse: a list of names he meant to save, written in a hurry, none of them saved." },
      { s: "kael", e: "soft", t: "Poisoned Benediction. A court-curse turned around. I was saving it for my siblings. They used it first. How cultured." },
      { s: "elara", e: "sad", t: "You may learn it. You may use it. You may not use it on yourself in the quiet. That is not a sermon. That is the seal talking. And me." },
      { s: "kael", e: "smirk", t: "Logged. With the nod. With the tea. You are building a museum of my almost-decencies. It will be a very small building." },
      { set: { quest_letter: 1 } }
    ]
  },

  lantern_keeper: {
    id: "lantern_keeper", bg: "meridia", mode: "talk",
    onEnd: { type: "map" },
    script: [
      { s: "keeper", t: "Stand here. Watch the water. If I say 'the prince is harmless,' the lantern will gutter. If I say 'the priestess is only a child,' it will go out. I need a witness that the lights still hate a lie. Take the lantern. It does not go out in the presence of a lie. Including yours, including his, including mine." },
      { s: "elara", e: "determined", t: "I will carry it. I will try to deserve it." },
      { s: "kael", e: "smirk", t: "I will stand next to it and see how brave a lamp can be." },
      { set: { quest_lantern: 1 } }
    ]
  },

  ashen_camp: {
    id: "ashen_camp", bg: "pass", mode: "vn",
    onEnd: { type: "map" },
    script: [
      { s: "", t: "Ashen Pass is a throat. The wind has opinions. Far below, Meridia is a scatter of honest lamps. Elara's veil — if Korin kept his promise — threads gold in the gusts. Kael stands on the edge as if edges were a social class he still belongs to." },
      { s: "lyra", t: "Warden at the gate. Old war-job. Multi-phase. If you spam your pretty slash, prince, it will eat the slash and then eat the girl. We set up or we become a folk song I refuse to be in." },
      { s: "elara", e: "neutral", t: "Empower two different people. Mark the stance. Charge what must be charged. I will meditate when the window is kind. I will unseal when the window is not. Lyra: if I go down, you drag me. Not him. He would complain in iambs." },
      { s: "kael", e: "smirk", t: "I complain in the original demonic. Iambs are for people with less to say." },
      { s: "elara", e: "blush", t: "There is something chained on this mountain. Thorn, if the rumors are a person. We will look. We do not leave seals to starve politely." },
      { s: "kael", e: "serious", t: "Don't make a habit of collecting my species. We are not cats. We do not bless well." },
      { s: "lyra", t: "Eat. Sleep. Tomorrow we teach a door some manners." },
      { set: { ashen_camp_done: 1 } }
    ]
  },

  post_hound: {
    id: "post_hound", bg: "pass", mode: "vn",
    onEnd: { type: "map" },
    script: [
      { s: "", t: "The hound is a man when the chain comes off, which is an old trick of mid-tier demons and also of people. He is broad and tired and looking at Kael like a debt that learned to walk." },
      { s: "thorn", t: "Name's Thorn. Was. Still is. They left me as scenery. You hit like a prince and a priestess and a woman who counts arrows. I'll tank. I'll pay blood. Don't unseal him on my account unless the mountain is ending. I know what a cracked seal feels like from the inside. It isn't poetry." },
      { s: "kael", e: "serious", t: "You were Court. Outer. I remember the gauntlets." },
      { s: "thorn", t: "You remember everyone's metal. It's almost a personality. I'm coming. Someone has to be the door while you two have your K-drama." },
      { s: "elara", e: "neutral", t: "Welcome. We rearrange at altars. You will not be scenery. That is the whole rite, in miniature." },
      { set: { quest_hound: 1, thorn_joined: 1 } }
    ]
  },

  post_warden: {
    id: "post_warden", bg: "pass", mode: "vn",
    onEnd: { type: "map" },
    script: [
      { s: "", t: "The Ashen Gate Warden folds up the way a vow folds when the person who made it is finally allowed to stop. The pass opens on a palace that has been dead in public for a year." },
      { s: "elara", e: "sad", t: "He was a man, then a job, then a door. I would like, just once, to fight a thing that was born a monster and stayed one. For the simplicity." },
      { s: "kael", e: "soft", t: "Simplicity is a human luxury. Welcome to my old house. Do not touch the mirrors. They have opinions, and one of them is me." },
      { s: "lyra", t: "Formation on the altar. Then we go in. If the prince gets quiet, that's the danger, not the jokes." },
      { s: "thorn", t: "I was quiet for a mountain. I don't recommend it." },
      { set: { warden_dead: 1 } }
    ]
  },

  courtyard_tablet: {
    id: "courtyard_tablet", bg: "ruins", mode: "talk",
    onEnd: { type: "map" },
    script: [
      { s: "elara", e: "neutral", t: "Old law. Seal-script. I can read this. It wants to be a circlet. It wants to talk to bindings as if they were guests." },
      { s: "kael", e: "serious", t: "Put it on. If anyone is going to wear my house, it should be the girl who keeps logging my nods." },
      { s: "elara", e: "blush", t: "That was—  I will. Not because you said. Because the tablet said. You may stand there looking like you didn't." },
      { set: { quest_tablet: 1 } }
    ]
  },

  betrayed_court: {
    id: "betrayed_court", bg: "ruins", mode: "vn",
    onEnd: { type: "choice_then_battle" },
    script: [
      { s: "", t: "The throne room of the Betrayed Court still has a ceiling, which feels like an insult. Gold has gone the color of old blood. Kael walks in as if the floor might recognize him and apologize. It does not. A mirror at the far end is too clean." },
      { s: "kael", e: "serious", t: "They ate me at midnight. Not with teeth. With votes. My siblings put on my names like coats. Humanity arrived at dawn, very proud of their timing, and found a prince already kneeling in a puddle of his own continuity. I let them bind me. Do you understand? I let them. Pride is a kind of suicide that walks." },
      { s: "elara", e: "sad", t: "I read the fragment. I argued a clause. I am still sorry. I will keep being sorry in the correct amounts. Not enough to drown you. Enough that you know the Church is not a single mouth." },
      { s: "kael", e: "smirk", t: "Little saint. Don't you dare be wise at my ruins. This is my scene. I have been saving the venom for the acoustics." },
      { s: "elara", e: "angry", t: "Then spend it. I can hold it. I held a tree. I held a door. I can hold you." },
      { s: "kael", e: "soft", t: "That sentence is illegal. Take it back." },
      { s: "elara", e: "blush", t: "I will not. I am seventeen and I have decided. You are not a weather problem. You are my escort. You are my disaster. You are the person I will unseal when the math says so, and I will not apologize in your teeth." },
      { s: "", t: "The mirror smiles with his mouth. The Unbetrayed steps out: Kael if no one had ever loved him badly. Seals intact, pride unpunctured, eyes like a coronation." },
      { s: "shade", t: "She will crack you open like a useful jar. Look at her. Ready to spend her whole font to make you a weapon. That is not love. That is liturgy. Come home. We still have your name in the warm place." },
      { s: "kael", e: "angry", t: "I left it on purpose." },
      { s: "elara", e: "determined", t: "Kael. This is the window. I can break the High Seal — fully, for this fight — and you can end him the way he fears. I will be gassed. I will be on the floor. The party will cover me. Or I keep the seal, I keep my feet, and we do this the long way, with meditation and marks and the slow arithmetic I was built for." },
      { s: "kael", e: "soft", t: "If you unseal me, do not watch my face. Watch the door. If you don't, don't you dare do it later as an apology. Pick. This is the only kind of kindness I understand: a decision that costs you." },
      { choices: [
        { t: "Unseal him. Spend the font. Trust the party with your body.", set: { unseal_choice: "yes", unseal_choice_made: 1, court_vn_done: 1, unsealed_once: 1 }, goto: "yes" },
        { t: "Keep the seal. Keep your feet. Fight the long fight.", set: { unseal_choice: "no", unseal_choice_made: 1, court_vn_done: 1 }, goto: "no" }
      ]},
      { label: "yes", s: "elara", e: "determined", t: "Kael. Forgive the liturgy. I am spending myself. Go apeshit." },
      { s: "kael", e: "berserk", t: "Logged." },
      { goto: "fight" },
      { label: "no", s: "elara", e: "neutral", t: "Not as an apology. Not as a spectacle. We do this with our hands still our own. Cover me while I meditate. I will not be a jar." },
      { s: "kael", e: "smirk", t: "Boring. Correct. I will be moderately disastrous." },
      { label: "fight", s: "", t: "The Unbetrayed opens his hands. The court, which has been dead in public, becomes a problem in private." }
    ]
  },

  post_mirror: {
    id: "post_mirror", bg: "ruins", mode: "vn",
    onEnd: { type: "map", map: "throne", x: 12, y: 3 },
    script: [
      { s: "", t: "The mirror is a mirror again. Kael does not look at it. Elara's hands are shaking in the specific way of someone who has the right to be seventeen for one hour and is spending it on purpose." },
      { cond: { unseal_choice: "yes" }, s: "kael", e: "soft", t: "You hit the floor. I hated it. I also ended him. Do not make that face. I can hold two true things. I am very expensive." },
      { cond: { unseal_choice: "yes" }, s: "elara", e: "blush", t: "I watched the door. As requested. The door was you coming back." },
      { cond: { unseal_choice: "no" }, s: "kael", e: "smirk", t: "The long way. You meditated like a woman who intended to live. I have decided this is attractive in a tactical sense." },
      { cond: { unseal_choice: "no" }, s: "elara", e: "angry", t: "Do not call my survival attractive. Call it correct." },
      { cond: { unseal_choice: "no" }, s: "kael", e: "smirk", t: "Correct, then. Ugly word. Fits you like the gold." },
      { s: "lyra", t: "Outer gates of the Throne are a walk from here. That's the end of what I agreed to, on paper. I'm still here. Paper can drown." },
      { s: "thorn", t: "I'll be the door until there isn't one." },
      { s: "elara", e: "determined", t: "Then we go. The Demon King is sleeping. We will not wake him kindly. We will not wake him at all — unless the rite says so. I have read it forty-two times now. I have not corrected the forty-second." },
      { s: "kael", e: "smirk", t: "Little saint. After you. Try not to bless the ash. It takes it personally." },
      { set: { court_survived: 1 } }
    ]
  },

  slice_ending: {
    id: "slice_ending", bg: "throne", mode: "vn",
    onEnd: { type: "credits" },
    script: [
      { s: "", t: "The outer gates of the Throne of Ash are a mouth that has not closed since the last High Priestess asked a king to sleep. Beyond: a pilgrimage's remaining years. Cities that are arguments. Demons that are people. A continent that wants to be purified and does not want to be clean." },
      { s: "elara", e: "neutral", t: "This is not the end. This is the first honest door. I am still seventeen. I am still the rite. I am still going to stamp my foot when you deserve it." },
      { s: "kael", e: "smirk", t: "Good. If you become marble I will have to find a new hobby. I have recently taken up 'not dying beside a priestess.' It is niche. It is mine." },
      { s: "lyra", t: "I'll scout the next ten years if I have to. Count your arrows. Count your teas. Count the times he almost says it." },
      { s: "thorn", t: "I'll be the door." },
      { s: "elara", e: "determined", t: "Then we walk. Purification is not cleanliness. It is a road. Poisoned words can be a kind of lantern, if you hold them at the right angle." },
      { s: "kael", e: "soft", t: "Don't you dare make that a sermon." },
      { s: "elara", e: "blush", t: "It is already in the notes." },
      { s: "", t: "SEAL OF THE HIGH PRIESTESS — end of the vertical slice. The Throne waits. The ten-year vision waits. Nobody may play it. It will still be the personal favourite." },
      { set: { slice_ending_seen: 1 } }
    ]
  }
};
