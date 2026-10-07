# Temple of the High Priestess for iOS

A SwiftUI shell around the web game. The game is bundled in the app and served offline from `app://game/` by `AppSchemeHandler`. Byte ranges are supported so voice clips stream.

- **Bridge:** `js/platform.js` posts to `webkit.messageHandlers.soth`, and `window.SOTH_HOST` is injected at document start.
- **Saves:** the native `SaveStore` is the source of truth and seeds `localStorage`. `SyncClient` syncs it to https://grepawk.com/high-priestess/api using `If-Match` revisions. If two devices both changed a slot, the app asks which one to keep. The identity is stored in the iCloud Keychain.
- **Lifecycle:** a suspend save is written when the app goes to the background, and sync runs in a background task.
- **Content:** story text and balance are server-driven (`js/content-loader.js`): the latest server version, then the cached copy, then the bundled snapshot. Assets always stay bundled.
- **Native features:** haptics for game sfx, game controllers mapped to the game keys, an ambient or playback audio session, and a settings sheet (cloud save, delete cloud data, sound, haptics, about).
- **Device support:** iPhone only, landscape only, iOS 17+. Bundle ID `com.ragnus.weather`, team 83D36RPMUM, ASC Apple ID 6819973123.

To build locally:

```bash
scripts/ios-sync-web.sh            # copies index.html, css/, js/, assets/ (no reference art), audio/ into ios/WebBundle/Web
cd ios && xcodegen generate && open HighPriestess.xcodeproj
```

CI workflows:

- `.github/workflows/ios-sim.yml` runs the simulator tests (including booting the real game in a WKWebView) and saves a launch screenshot.
- `.github/workflows/ios-testflight.yml` archives the app, signs it (reusing or creating an App Store profile through the ASC API, never deleting anything) and uploads it to TestFlight. It waits for processing to reach VALID. It never submits for review.
