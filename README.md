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

### Keys

| Key | Action |
|-----|--------|
| WASD / Arrows | Move |
| Z / Enter / Space | Confirm, interact |
| X / Shift | Cancel, run |
| Esc | Menu |
| C | Rest at a lotus altar |

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
