# Age rating declaration (App Store Connect → App Information → Age Rating)

Set through the API by `scripts/asc/app_review_setup.py` from `docs/asc/age-rating.json`. These are honest answers based on the shipped content (js/dialogue.js, js/content.js, js/maps.js, art, voice), reviewed 2026-10-07.

| Question | Answer | Why |
|---|---|---|
| Cartoon or Fantasy Violence | **Infrequent/Mild** | Turn-based battles against demons, wisps and a corrupted oak are stylized and mild: anime art with hit flashes and HP bars, no blood, no gore, no injury shown, and enemies simply fade out. Yisheng chose this level on 2026-10-18. |
| Realistic Violence | **Infrequent/Mild** | Some story text describes blood and injury (for example, a flashback of a boy "kneeling in his own blood", the "Blood Price" skill). It's text only, nothing is depicted. |
| Prolonged Graphic or Sadistic Realistic Violence | None | |
| Guns or Other Weapons | **Infrequent/Mild** | Fantasy swords, staves and chains appear in art and as equipment. There are no guns. |
| Horror/Fear Themes | **Infrequent/Mild** | Demons, a sealed demon prince, a poisoned land, and dark ruins. |
| Mature or Suggestive Themes | **Infrequent/Mild** | Betrayal, imprisonment and binding, a character's past death, and one line that uses "suicide" as a metaphor ("Pride is a suicide that walks"). Nothing is suggestive or romantic. |
| Profanity or Crude Humor | None | No profanity in the script. |
| Sexual Content or Nudity / Graphic Sexual Content and Nudity | None | |
| Alcohol, Tobacco, or Drug Use or References | None | "Poison" is a story and status effect, not drugs. There is an inn/tavern location ("The Poisoned Word"), but the only drinks mentioned are tea and water. |
| Medical or Treatment Information | None | |
| Simulated Gambling | None | |
| Contests | None | |
| Gambling (real money) | No | |
| Loot boxes | No | Purchases are one-time unlocks with known contents. |
| Unrestricted Web Access | No | External links (Terms, Privacy, Support) open in Safari. The web view only loads the bundled game. |
| Messaging and Chat / User-Generated Content / Social Media | No | Single-player, with no user content. |
| Advertising | No | |
| Parental Controls / Age Assurance | No | The game has neither. Purchases follow Apple's Ask to Buy. |
| Health or Wellness Topics | No | |

After the API update to Infrequent/Mild fantasy violence, App Store Connect recomputes the rating. After the 2026-10-18 upload ASC still computes **12+** (`appStoreAgeRating: TWELVE_PLUS`; Brazil self-rated 12, Korea 12). Lowering fantasy violence did not change it: Infrequent/Mild realistic violence, horror/fear and mature/suggestive themes are each enough for 12+ on their own. Getting to 9+ would need all of those at None, which would not be honest for the story text. Made for Kids: no.