/* =============================================================================
   Bundled app config: the offline fallback for the server-driven PAYWALL and
   FLAGS collections (see js/content-core.js, server/README.md). Data only.
   PAYWALL controls copy, art, placement and WHICH product is offered. Prices
   always come from the App Store. Only the iOS app shows a paywall (Platform.gate).
   ============================================================================= */
window.PAYWALL = {
  // Full Game product offered. offerVariants (if non-empty and FLAGS.priceTest) splits players by
  // weight using a stable hash of the player ID (price test between App Store price tiers; each
  // player stays in one arm). Sandbox / TestFlight / App Review always get `offer` ($4.99 tier).
  offer: "com.ragnus.weather.fullgame",
  offerVariants: [
    { product: "com.ragnus.weather.fullgame", weight: 500 },
    { product: "com.ragnus.weather.fullgame.b", weight: 500 }
  ],
  // Prologue (temple) + region 1 (village, forest and their interiors) are free.
  gatedMaps: ["wilderness", "meridia", "ashen", "ruins", "throne"],
  // Story flags that complete a region (funnel: region_complete).
  regionCompleteFlags: { hollow_oak_dead: "region1" },
  placements: {
    region1_end: { enabled: true },
    menu: { enabled: true }
  },
  copy: {
    title: "The Seal Holds. For Now.",
    subtitle: "The Hollow Oak is dead, and the road west is open.",
    body: "Elara and Kael have crossed the Whispering Forest. Beyond it lie the Western Wilderness, the canal kingdom of Meridia, the Ashen Pass and the Throne of Ash, along with what Kael was before the chains.",
    bullets: [
      "Every remaining region and the full story to the ending",
      "All voiced scenes, bosses, quests and camp conversations",
      "One purchase. No ads, no subscriptions, nothing to grind for",
      "Shared with your Family Sharing group"
    ],
    cta: "Unlock the Full Game",
    lockedToast: "The road west waits beyond the forest. Unlock the Full Game to continue.",
    unlockedToast: "The road west is open. The full journey is yours.",
    art: "assets/backgrounds/title.jpg"
  },
  supporter: {
    product: "com.ragnus.weather.supporter",
    title: "Supporter Pack",
    body: "A thank-you for supporting a solo-made game. It's cosmetic only and gives no gameplay advantage.",
    bullets: [
      "Voice Gallery: replay every voiced line, scene by scene",
      "Alternate app icon: Kael, unchained",
      "Your name in our hearts (and a supporter badge in Settings)"
    ]
  }
};

window.FLAGS = {
  paywall: true,
  priceTest: true,
  supporterPack: true,
  voiceGallery: true,
  funnelEvents: true
};
