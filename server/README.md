# temple-api: save sync + server-driven content

Live at **https://grepawk.com/high-priestess/api/**. It runs on the grepawk.com droplet:

| | |
|---|---|
| Code | `/var/www/temple-api` (deployed from this folder) |
| Service | `temple-api.service`, running as `www-data` on 127.0.0.1:**8791** with `BASE_PATH=/high-priestess`. Migrations run on start. |
| Database | local MySQL, database `temple`, user `temple@localhost` |
| Secrets | `/etc/temple.env` (root:www-data 640). Created once by `deploy/bootstrap-remote.sh` and never committed or printed. |
| nginx | `location ^~ /high-priestess/api/` (proxy) and `location ^~ /high-priestess/` (static legal pages in `/var/www/high-priestess`), inside `/etc/nginx/sites-available/finalcut` |

Express 5 + mysql2. The content validator `lib/content-core.cjs` is a vendored copy of `../js/content-core.js`, the same code the game runs. `npm run vendor`, `npm test` and the deploy script refresh it.

## Deploy

```bash
server/deploy/deploy-grepawk.sh               # code + unit file + nginx (inserted only once; backup + nginx -t + auto-restore)
server/deploy/deploy-grepawk.sh --bootstrap   # first time: also creates the DB/user and /etc/temple.env
tools/high-priestess-site/deploy-grepawk.sh   # support/privacy/terms pages -> https://grepawk.com/high-priestess/
node server/deploy/smoke.mjs                  # live end-to-end smoke test (creates and deletes a throwaway player)
```

Test locally against any MySQL or MariaDB: `TEST_MYSQL_URL=mysql://user:pw@127.0.0.1:3306/temple_test npm test`. CI runs this in `.github/workflows/server.yml` against a MySQL 8 service container.

## Save API (used by the iOS app)

Auth is anonymous. The app generates `installId` (UUID) and `secret` (64 hex) and keeps them in the iCloud-synchronizable Keychain, so a new iPhone on the same Apple ID gets the same player. The server stores only SHA-256 hashes of the secret and of the tokens.

| Method | Path | Notes |
|---|---|---|
| GET | `/health` | `{ok, db, content:{baseHash, overridesVersion}}` |
| POST | `/v1/auth/device` | `{installId, secret, appVersion?}` → `201` (new) or `200` with `{token, playerId}`. Wrong secret for a known install → `403`. |
| GET | `/v1/saves` | Slot summaries `{slot, revision, summary, bytes, clientUpdatedAt, serverUpdatedAt}` |
| GET | `/v1/saves/:slot` | Slot is `0`, `1`, `2` or `auto`. Returns `{…, data}`, or `404 {revision:0}` for an empty slot. |
| PUT | `/v1/saves/:slot` | Header **`If-Match: <revision>`** (`0` for a new slot); body `{data:"<save JSON string>", summary?, gameVersion?, clientUpdatedAt?}`. Returns `200 {revision}`, **`409 {server:<current copy>}`** on a stale revision, or `428` without If-Match. The replaced copy goes to history (the last 10 are kept). |
| GET | `/v1/saves/:slot/history` | Earlier revisions |
| GET / PUT | `/v1/settings` | `{data:"<settings JSON string>"}` |
| DELETE | `/v1/me` | Deletes the player, devices, tokens, saves, history and settings (the app's "Delete cloud data" button) |

All routes except `/health`, `/v1/auth/device` and `/v1/content` need `Authorization: Bearer <token>`.

## Content API (server-driven story text and balance; assets stay bundled)

The game's content is `{DATA, MAPS, SCENES}`, about 290 KB of pure JSON from `js/content.js`, `js/maps.js` and `js/dialogue.js`. The server serves it in two layers:

1. **Base**: a published snapshot of the repo content. `.github/workflows/content-publish.yml` builds it with `scripts/build-content.mjs` and PUTs it on every push to `main` that touches content, or on manual dispatch. It is identified by a content hash (cyrb53 of the JSON).
2. **Overrides**: an [RFC 7386 JSON Merge Patch](https://www.rfc-editor.org/rfc/rfc7386) applied on top of whichever base is active. Overrides are versioned (1, 2, 3, …) and survive base re-publishes. **This is where you make live edits.**

### Client endpoint

`GET /high-priestess/api/v1/content?have=<bundled hash>&schema=1`

- Returns `{schema, version, baseHash, overrides, updatedAt}`. It adds `base` only when `have` is an older base the server has published. A bundle the server has never seen (an app build newer than the server) keeps its own content.
- Sends `ETag: W/"c1-<baseHash|nobase>-<overridesVersion>"`. If-None-Match → `304`.
- `Cache-Control: no-cache`, `Access-Control-Allow-Origin: *` (the web build fetches it cross-origin), gzip.

### Editing content (admin)

The token is `CONTENT_ADMIN_TOKEN` from `/etc/temple.env`. The same value is stored as the repo secret of the same name, which the publish workflow uses.

```bash
API=https://grepawk.com/high-priestess/api/v1/admin/content
TOKEN=$(ssh root@grepawk.com "sed -n 's/^CONTENT_ADMIN_TOKEN=//p' /etc/temple.env")   # don't echo it
H="Authorization: Bearer $TOKEN"

curl -s -H "$H" $API/overrides            # current overrides + version
curl -s -H "$H" $API/effective            # the full merged content clients get (handy to find keys)
curl -s -H "$H" $API/history              # override versions + published bases

# Replace the overrides (the whole patch, not a delta). expectedVersion guards against lost updates (409 if stale).
curl -s -X PUT -H "$H" -H 'content-type: application/json' $API/overrides -d '{
  "expectedVersion": 0,
  "note": "tune wisp, retitle",
  "overrides": {
    "DATA": {
      "SUBTITLE": "A Journey of Purification and Poisoned Words",
      "ENEMIES": { "wisp": { "maxHp": 30, "atk": 9 } },
      "ITEMS": { "novice_robe": { "desc": "White cloth, not yet washed of anyone else’s blood." } }
    }
  }
}'

curl -s -X POST -H "$H" -H 'content-type: application/json' $API/rollback -d '{"version": 0}'   # 0 = no overrides
```

Merge-patch rules: objects merge key by key, and `null` deletes a key. **Arrays are replaced wholesale.** To change one line of a scene, send that scene's whole `script` array; copy it from `/effective`. Clients pick up a change on their next launch (the server caches for 10 s).

### Validation (server on write, and again in the game on load)

- Data only. JSON with no functions. Strings containing `<`, `>` or `javascript:` are rejected, which follows App Review guideline 2.5.2 (no remote code).
- **Asset references must be bundled filenames** (portraits, backgrounds, voice clips, music …), checked against the asset list in the published base. Unknown references fall back to the bundled value; if there is none, they are dropped, with a warning.
- Maps keep valid integer tile grids (`w`×`h`, tile ids 0–63). Bundled maps, scenes and core `DATA` tables can't be deleted. Battles may only use known enemies.
- Invalid overrides → `422 {errors}` and nothing is stored.

### Fallback in the game (`js/content-loader.js`)

1. Fetch `/v1/content`, giving up after **1.5 s**. On iOS the app proxies it through `app://game/__content`.
2. If that fails, use the last good response, cached in `localStorage["soth_content_cache_v1"]`. A cached base counts only if it was built for this same bundled hash.
3. If there is no cache, use the **bundled snapshot**, which is always present and plays fully offline.

Every result is validated against the bundle before it replaces `window.DATA/MAPS/SCENES`, and only then is `js/game.js` started. `window.SOTH_CONTENT` reports `{source: remote|cache|bundled, version, warnings, errors}`. `?content=bundled` forces the bundle. Runs on localhost or in a headless browser use the bundle unless you add `?content=remote`.
