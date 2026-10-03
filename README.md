# Seal of the High Priestess

A browser-native 2D JRPG / visual-novel hybrid. Design inspiration: **LinaHua (@Linahuaa)** — a solo, AI-assisted epic in the spirit of Final Fantasy VI × Fate/Stay Night, built around kickass dialogue, named gear, and slow strategic combat.

**Subtitle:** *A Journey of Purification and Poisoned Words*

No engine, no CDN, no build step. Open `index.html` through any static host.

## Play

```bash
cd seal-of-the-high-priestess
python3 -m http.server 8080
```

Then visit http://localhost:8080

## Headless test suite

```bash
npm ci
npx playwright install --with-deps chromium
npm run test:ci
```

### Keys

| Key | Action |
|-----|--------|
| WASD / Arrows | Move |
| Z / Enter / Space | Confirm, interact |
| X / Shift | Cancel, run |
| Ctrl / F | Skip the current scene (stops at choices) |
| Esc | Menu |
| C | Rest at a lotus altar |

Spoken dialogue uses pre-generated **ElevenLabs** clips, one voice per character (see `voice/config.json`). Toggle it under Options (default on). Advance a line to cut the current clip; auto-advance waits until the clip finishes. Lines without a clip (or if audio fails to load) just stay text-only. The browser never calls ElevenLabs.

## Voice clips

`scripts/generate-voice.mjs` reads every spoken line from `js/dialogue.js`, `js/content.js` (NPC talk) and `js/maps.js` (signs), and writes static bundles:

```
audio/voice/
  index.json                  # bundle -> manifest path, clip/missing counts
  scene-intro/manifest.json   # "speaker|text" -> { file, hash, voice, ... }
  scene-intro/<hash>.mp3
  talk-wen/...  signs/...  ui/...
```

A clip's file name is the first 24 hex chars of a SHA-256 over its text, voice id, model, output format, seed and voice settings, so a run only calls the API for new or changed lines and prunes clips nothing references any more.

```bash
npm run voice:plan                                  # dry run: what would be generated
ELEVENLABS_API_KEY=... npm run voice:generate       # generate missing clips locally
```

In CI, the **Generate voice clips** workflow (`.github/workflows/voice.yml`) runs on `workflow_dispatch` and on pushes to `main` that touch dialogue or voice config. It uses the `ELEVENLABS_API_KEY` repo secret, commits new clips back to `main` with `[skip ci]`, and asks GitHub Pages to rebuild.

## Host on GitHub Pages

1. Create a repo (example: `seal-of-the-high-priestess`).
2. Upload this folder as the repository **root** (so `index.html` sits at `/`).
3. GitHub → **Settings** → **Pages** → Deploy from branch `main` → folder `/ (root)`.
4. Open `https://<user>.github.io/seal-of-the-high-priestess/`.

With `gh`:

```bash
gh repo create seal-of-the-high-priestess --public --source . --remote origin --push
gh api -X PUT "repos/<user>/seal-of-the-high-priestess/pages" -f build_type=legacy -F source[branch]=main -F source[path]=/
```

Saves use `localStorage` and stay in that browser.

## What this slice contains

- Full intro (temple → village → forest → Heartwood Hollow → Meridia)
- Four party members: **Elara** (priestess), **Kael** (sealed demon prince), **Lyra** (scout), **Thorn** (bound bruiser)
- Battle loop as specified: Mana spend / Meditate / Break the High Seal (Kael berserk, Elara gassed) / charge-up and gassed-out turns
- Three+ story bosses (Hollow Oak, Canal Specter, Gate Warden, Bound Hound, The Unbetrayed)
- Named gear and techniques only — no XP grind, no generic shops (Korin reforges)
- Optional quests, lotus-altar saves, day/night tint
- Visual-novel scenes totaling several thousand words of original dialogue
- Mid-game climax: whether to fully unseal Kael
- Slice ending at the Throne of Ash outer gates

## Extending

Add rows to the tables in `js/content.js`, rooms in `js/maps.js`, and scripts in `js/dialogue.js`. The engine (`js/game.js`) is a finite state machine: `title | vn | map | battle | menu`.

Debug from the browser console:

```js
SOTH_FLAG("lyra_joined", 1)
SOTH_BATTLE("hollow_oak")
SOTH_SCENE("intro")
```
