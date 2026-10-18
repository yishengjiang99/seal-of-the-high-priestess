# App Store listing: Temple of the High Priestess (en-US)

Source of truth for the ASC listing, modeled on the ProTune pattern in `yishengjiang99/photo-recipes`.
`scripts/asc/upload_seal_listing.py` reads the fastlane-layout files under `docs/asc/metadata/` and pushes them to App
Store Connect (bundle `com.ragnus.weather`, Apple ID 6819973123, SKU High-priestess-game, team 83D36RPMUM).

The fenced Name / Subtitle / Promotional text / Keywords / Description blocks below are the **upload-ready** copy and must
equal `metadata/en-US/*.txt`. Check: `python3 docs/asc/check_copy.py` (limits, banned words and competitor trademarks,
keyword hygiene, URLs, review contact, reviewer-note points, screenshot sizes). Never use "Grok" anywhere in the listing.

Nothing here submits for review. Submitting is a separate manual step (`asc-submit-review.yml`), run by the owner only.
The Game Center attachment, the Paid Apps Agreement, IAP records and pricing are Yisheng's and are not touched by the
listing script. The listing does not mention Game Center, achievements or leaderboards until the attachment is done.

## Name (30)
```
Temple of the High Priestess
```

28/30. Matches the app's display title.

## Subtitle (30)
```
Fantasy JRPG of sealed pacts
```

28/30.

## Promotional text (170)
```
A priestess and a bound demon prince walk west under a seal neither can break. Free to start: the prologue and the entire first region cost nothing.
```

148/170. Promotional text can be edited without a new review.

## Keywords (100)
```
rpg,anime,story,strategy,offline,adventure,quest,demon,visual,novel,voiced,controller,party,magic
```

97/100, comma-separated with no spaces. No keyword repeats a word in the name or subtitle (Apple combines them for
search), no plurals duplicating singulars, no competitor or franchise names.

## Description (4000)
```
Elara is a young priestess of the Silver Lotus Temple. Kael is a demon prince in golden chains. The seal that binds them is mutual: if one dies, the other pays. Now the Church has sent them west together, and neither of them is happy about it.

Temple of the High Priestess is a story-first fantasy JRPG for iPhone, played in landscape. Walk the painted ruins, talk your way through tense and funny conversations, and fight turn-based battles where every move is a decision, not a button to mash.

FREE TO DOWNLOAD
• The prologue and all of Region 1 are free: the Silver Lotus Temple, Lotus-Step Village and the Whispering Forest, ending with the Hollow Oak.
• "Full Game" is a one-time purchase that unlocks the remaining regions and the rest of the story. No subscription, no ads, nothing to grind for.
• The Full Game is shared with your Family Sharing group. Restore Purchases is built in.
• An optional Supporter Pack is cosmetic only and gives no gameplay advantage.

A STORY WITH VOICE
• Dialogue scenes with anime-style portraits and voiced lines.
• Choices that change how scenes play out.
• Camp conversations at lotus altars let the party talk between fights.

STRATEGIC TURN-BASED BATTLES
• Elara spends Mana to shield, heal and empower. Kael builds Fury and unleashes it. Set up a plan, then watch it land.
• A turn-order strip shows who acts next. Tap an enemy to attack it, or pick skills from the orb bar.
• Battle Speed 1x or 2x, and Auto-battle for ordinary fights. Bosses always stay in your hands.

EXPLORE AT YOUR OWN PACE
• Tap to move, or use a controller or keyboard.
• A quest tracker points you to the next objective, and the World Map shows where you have been and where you are going.
• Fast travel to places you have already visited.

MADE TO BE PLAYED ANYWHERE
• Fully playable offline. Story, art and voices are all on your device.
• Game controller and hardware keyboard support.
• Accessibility options: subtitle size, Reduce Motion and colour-safe cues, with Dynamic Type and VoiceOver in the menus.
• No account or login. Your save is tied to your device and can sync through an anonymous player ID. You can delete your cloud data any time in Settings.

Terms of Use: https://grepawk.com/high-priestess/terms
Privacy Policy: https://grepawk.com/high-priestess/privacy
Support: https://grepawk.com/high-priestess/support
```

2354/4000. Everything in it is shipped in build 5: free prologue and region 1, one-time Full Game, optional cosmetic
Supporter Pack, voiced scenes, turn-based combat with turn-order strip / 1x-2x / Auto-battle, tap-to-move, quest tracker,
World Map, fast travel, offline play, controller / keyboard support, accessibility settings, anonymous cloud save with in-app
deletion. There is no What's New text: ASC does not allow it on a first version (add `whatsnew.txt` from 1.1 on).

## Support URL
```
https://grepawk.com/high-priestess/support
```

## Marketing URL
```
https://grepawk.com/high-priestess/
```

## Privacy Policy URL
```
https://grepawk.com/high-priestess/privacy
```

## Copyright
```
2026 Yisheng Jiang
```

## Categories
- Primary: `GAMES` with subcategories `GAMES_ROLE_PLAYING` (first) and `GAMES_ADVENTURE` (second). ASC models "Role Playing
  primary, Adventure secondary" as the two Games genres of the primary category. The script sets `primarySubcategoryOne` and
  `primarySubcategoryTwo`; if the API refuses a combination the run prints the error and the verify step reports the gap.
- Secondary category: none (`secondary_category.txt` is empty). Add a value such as `ENTERTAINMENT` there if wanted.

## Age rating (answers: `docs/asc/age-rating.json`, rationale: `docs/asc/age-rating.md`)
Gambling: none (no simulated gambling, no real-money gambling, no loot boxes). User-generated content: none. Messaging /
chat: none. Unrestricted web access: none.

**Fantasy violence is declared Frequent/Intense, not mild/infrequent.** The turn-based battles against demons and a corrupted
oak are the core loop (stylized, no gore), and the earlier declaration (computed rating 12+) already says so, so the script
applies `age-rating.json` as-is instead of lowering it. Changing it to Infrequent/Mild is Yisheng's call (edit
`violenceCartoonOrFantasy` in `age-rating.json`); it would understate the game's main activity.

**TODO for Yisheng: `socialMediaAgeRestricted`.** The API schema has this age-rating field and it is still null. The script
does not set it (the game has no social features and `socialMedia` is false). The verify step prints it as a `[TODO]` and a
warning, not a failure. If App Store Connect insists on an answer before submission, answer it in App Information > Age
Rating. Any other unanswered age-rating question fails the verify step. Keys in `age-rating.json` that the API does not
know are skipped with a warning.

## Export compliance
The script sets `usesNonExemptEncryption=false` on the attached build when it is not already cleared (the game only uses
HTTPS via the system stack).

## App Review information
Contact: Yisheng Jiang, yisheng.jiang@gmail.com, +1 669 251 7789. No demo account (`demo_required` = false). Notes:
`metadata/review_information/notes.txt` (free download, prologue and region 1 free, Full Game non-consumable IAP, sandbox always
offers the $4.99 product, server-driven data-only content with no downloaded executable code, anonymous device-bound account
with in-app data deletion, how to reach the paywall). It replaces `docs/asc/review-notes.txt`, which
`scripts/asc/app_review_setup.py` now reads from the new location.

## App Privacy
Apple has no API for the privacy "nutrition label". Reuse `docs/asc/app-privacy-1.0.md` (click-by-click checklist, matches
`PrivacyInfo.xcprivacy`): 4 data types, all linked to the user, none used for tracking: User ID, Purchase History, Gameplay
Content, Product Interaction. Privacy policy: https://grepawk.com/high-priestess/privacy. This step is Yisheng's, in the website.

## Screenshots
Real captures of the game, landscape (the app is landscape-only). The game's own engine, art, text and UI are rendered; no
mock-up chrome and no added marketing text.

| ASC display type | Size | Files |
|---|---|---|
| `APP_IPHONE_67` (6.9" iPhone) | 2868 x 1320 (ASC also accepts 1320 x 2868) | `screenshots/en-US/iphone-69-0{1..6}-*.png` |
| `APP_IPAD_PRO_3GEN_129` (13" iPad) | 2752 x 2064 (ASC also accepts 2064 x 2752) | `screenshots/en-US/ipad-13-0{1..5}-*.png` |

Order: 01 title, 02 exploring the Silver Lotus Temple, 03 dialogue (Elara and Kael), 04 boss battle (Hollow Oak), 05 World
Map / quest guidance, 06 Full Game paywall (iPhone only).

- 01 to 05 are rendered by `scripts/asc/capture_listing_shots.mjs` (headless Chromium, the bundled web engine the iOS shell
  loads, seeded RNG; iPhone 956 x 440 pt at 3x, iPad frames at 1376 x 774 pt at 2x centred on the game's background colour in
  the 4:3 canvas). They show the game without the iOS safe-area insets / Dynamic Island, with the 16:9 game view pillarboxed on
  the wider iPhone screen, exactly as the game lays out.
- 06 is a native iOS Simulator capture (iPhone 17 Pro Max, build 5 sources) of the SwiftUI Full Game paywall via the
  `-paywallDemo` launch argument (from the `ios-sim.yml` artifact), because the paywall is not part of the web view.
- iPad: the target is iPhone-only (`TARGETED_DEVICE_FAMILY: 1`). ASC asks for iPad screenshots only for apps that run
  natively on iPad, so the script does **not** upload or verify the iPad set unless `INCLUDE_IPAD=true`. The files are kept
  in the repo so they are ready if iPad support ships. There is no native iPad paywall capture.

## TestFlight: What to Test (build 5)
```
Play the prologue and the first region. Check tap-to-move, the quest tracker and World Map, the faster battles (tap an enemy to attack, 1x/2x speed, Auto-battle on ordinary fights), and the Full Game paywall (gear icon > Purchases). Please report anything that gets you stuck.
```

## Workflow
`.github/workflows/asc-seal-listing-upload.yml` (manual): inputs version_string, build_number, screenshots, verify_only.
Always run with `verify_only=true` first. It never submits for review.
