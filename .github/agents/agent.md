# Agent rules — Seal of the High Priestess

## E2E testing and headless Chrome screenshots

Every pull request that changes game logic, UI, or adds new features **must**
include a matching e2e test and a headless Chrome screenshot proving the
change works in a real browser.

### Requirements

1. **E2E tests** — add or extend a spec under `tests/e2e/` using Playwright.
   - Cover the changed surface: new screens, new tabs, new game-state
     transitions, new UI controls.
   - Each new feature must have at minimum:
     - A test that verifies the feature is present in the DOM.
     - A test that exercises the primary happy-path interaction.
     - A screenshot captured with `page.screenshot({ path: "artifacts/<feature>.png" })`.
   - Tests for idle/temple mechanics must assert that the Temple tab renders
     and that idle resources are initialised without console errors.

2. **Headless Chrome screenshots** — every significant visual state must be
   captured during e2e test runs:
   - Title screen (`artifacts/title-screen.png`)
   - Any new screen or menu tab introduced by the PR (e.g. `artifacts/temple-tab.png`)
   - Failure screenshots are saved automatically by Playwright on test failure.
   - Screenshot artifacts are uploaded to GitHub Actions and linked in a PR
     comment by the CI `e2e` job.

3. **CI** — the `e2e` job in `.github/workflows/ci.yml` runs automatically on
   every `push` and `pull_request`. It must pass before merging.
   - Do not disable or skip the `e2e` job without a documented reason.
   - If Playwright browsers need updating, run `npx playwright install --with-deps chromium`.

4. **Validation before PR creation**:
   - Run `npm test` (or `npx playwright test`) locally to confirm all tests pass.
   - Inspect the generated screenshots in `artifacts/` to verify visual correctness.
   - Commit `package.json`, `package-lock.json`, `playwright.config.js`, and any
     new spec files alongside your feature code.

### File layout

```
tests/
  e2e/
    game.spec.js      ← core game + idle/temple tests
    <feature>.spec.js ← one spec per major feature area (add as needed)
playwright.config.js  ← Playwright configuration (webServer, reporters, projects)
artifacts/            ← screenshots written at test time (gitignored at runtime)
```

### Quick reference

```bash
# Run all e2e tests
npm test

# Run a single spec
npx playwright test tests/e2e/game.spec.js

# Open interactive Playwright UI
npm run test:e2e:ui

# Serve the game locally (used by playwright.config.js webServer)
python3 -m http.server 8080
```
