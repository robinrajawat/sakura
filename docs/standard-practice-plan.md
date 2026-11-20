# Standard practice plan (owner, 2026-11-20)

Why: on 2026-11-19 an iPhone-only startup failure reached the owner and took a day to find. The
cause was Sakura starting itself two thirds of the way through its main script, so the first draw
reached code that wasn't set up yet (fixed in #915). It got through because:

- **No test ever ran in Safari's engine.** `phone-ios` is Chromium at an iPhone's screen size.
- **Errors on devices are invisible.** Each failure reached us only through the owner's screenshots,
  one round trip at a time. Fixes went in against guesses before the real error was known.
- **Every merge goes straight to the live site**, and the owner finds problems there. Nine changes
  went live on 2026-11-19.
- **One 38,000-line script.** A failure part way through startup silently breaks everything after it.

Done already:

- #913: a failed start shows the browser's error, with Reload and Copy.
- #914: CI runs `*.safari.spec.ts` in WebKit (startup checks).
- #915: startup runs last, and `tests/unit/startupOrder.test.ts` keeps it there.

## 1. Test in Safari's engine (built 2026-11-20; done once CI is green)

Built: `phone-ios` runs in WebKit. Long-press, swipe and pinch go through
`tests/e2e/fixtures/touch.ts`: Chrome's own touch input in Chromium, and in WebKit the pointer
events Sakura listens for, dispatched in the page (with pointer capture honoured, which the diagram
viewer needs). `SAKURA_SYNTH_TOUCH=1` forces the WebKit path in Chromium to check it locally; all 48
gesture tests pass both ways. A local run without WebKit leaves the two WebKit projects out with a
warning; CI always runs them. The flaky To-Dos draft test did not fail once in 400+ local runs
(alone, under CPU load, and in the full phone suite four times), and CI's history no longer has its
error, so it now prints what storage held when it fails instead of getting a guessed fix.

Original plan:

- Make `phone-ios` a WebKit project (`devices['iPhone 13']`, no `browserName: 'chromium'`), keeping
  `phone-android` on Chromium. CI already installs WebKit.
- Tests that drive touch through Chrome's DevTools protocol (`newCDPSession`,
  `Input.dispatchTouchEvent`, used for long-press) only run in Chromium. Rewrite them with
  Playwright's own touch (`locator.tap()`, `page.touchscreen`), or tag them Chromium-only with a
  stated reason.
- WebKit can't be installed in the cloud container (its download is blocked), so CI is where WebKit
  runs. **Never run `npx playwright install` in the container**: on 2026-11-20 a failed WebKit
  download made Playwright delete the Chromium build the tests use. It was restored by linking
  `/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell` to
  `/opt/pw-browsers/chromium_headless_shell`.
- Done when the full phone suite passes in WebKit in CI.

## 2. Error reports from devices (built 2026-11-20)

Built: **Sentry** (owner 2026-11-20: "do what's standard for the applications in this category"), on
by default with Settings → About → Error reports to turn it off (option A; opt-in, B, would miss a
fresh device failing at startup). The SDK (@sentry/browser, pinned) is built into its own hashed file
and loaded by index.html's first script on the live site only. Reports carry no user, IP, cookies,
query values, breadcrumbs or local variables (`src/telemetry/`). The old opt-in Firestore crash
reports are gone. Existing users get a one-time notice before any report (privacy.html promises
that for significant changes). privacy.html and the open-source notices are updated.

Sentry: organisation `robinrajawat`, project `sakura-web` (Browser JavaScript, EU region), error
monitoring only (no replay, tracing or logs); not connected to the GitHub repo. The DSN is in
`web/src/telemetry/sentryConfig.ts`; index.html's CSP allows only its host. Owner: turn on
"Prevent Storing of IP Addresses" (project Settings → Security & Privacy) and email alerts on new
issues.

Original plan:

When Sakura fails on any device, it reports what failed so we can read it, instead of waiting for a
screenshot.

- **Recommended: Sakura's own Cloudflare Worker** (`ai.sakura-notes.com`, `worker/`). There's no third
  party, and it's free at this size. Each report carries the error message, the code location, the
  app version and the browser, and nothing from documents. It is rate-limited and dropped after
  30 days.
- **Alternative: Sentry**, the usual hosted tool. It's richer, but adds a third party.
- Either way: one line in `web/public/privacy.html`, with its Effective date updated. Merging
  anything under `worker/` redeploys the live Worker, so the owner merges it on purpose.
- **Owner to decide:** own Worker or Sentry.

## 3. A preview before going live (set up 2026-11-20)

Set up: Cloudflare Pages project `sakura-preview` (owner's Cloudflare account, the Pages workflow;
owner chose it over a Workers app, which Cloudflare now promotes, because it needs no change in the
repo). It builds `npm run build -w sakura-web` into `web/dist` with `NODE_VERSION=22`, for every
branch. Branch control (Settings → Builds): production branch `main`, preview branch "All
non-production branches", automatic deployments **on**: pausing them (tried 2026-11-20) stops
previews too. A build of `main` only updates the project's own copy, never www. The project must stay
connected to GitHub (Settings → Git repository; the Cloudflare Workers and Pages app needs access to
`robinrajawat/sakura`), or nothing builds. Addresses:

- **`https://preview.sakura-notes.com`**: always the latest push to Claude's working branch
  (`claude/clever-carson-durens`, via its branch address
  `claude-clever-carson-durens.sakura-preview-6so.pages.dev`). The one bookmark to open on the iPhone.
- Each PR's own address, which Cloudflare posts on the PR.

What a preview can't do: Google sign-in (Firebase allows only listed domains; owner 2026-11-20:
previews stay signed out, so a preview never syncs into the real account), Hosted AI and signed-in
PDF (the Worker accepts only www.sakura-notes.com), and error reports (Sentry runs on the live site
only). Testing sync on a phone needs a separate test account; not set up.

Original plan:

- Every PR gets its own preview address. Cloudflare Pages does this for free from the GitHub repo,
  on the Cloudflare account the domain already uses.
- The owner opens the preview on the iPhone before saying "merge"; production stays on GitHub
  Pages.
- Claude writes the exact setup steps (connect repo → build command `npm run build -w sakura-web`
  → output `web/dist`) and adds the preview link to each PR.

## 4. Release discipline (from now on)

- Fewer, larger releases: batch related fixes into one PR rather than one PR per symptom.
- Each release is checked on the preview (`preview.sakura-notes.com`) on a real iPhone before merging.
- If something breaks live: revert the PR first, then investigate.
- Diagnose before fixing: get the real error (Details, the failed-start screen, error reports)
  before changing code.

## 5. Code structure (ongoing)

- Keep moving code into `web/src/` modules when an area is changed anyway (the standing rule).
  Modules can't use a variable before it is declared, and lint (`no-use-before-define`) checks them.
- Startup stays last in the main script (unit test).
- Known flaky test to root-cause, not re-run (now prints its storage state on failure; see step 1): `phone-background-safety.phone.spec.ts`, "a task
  typed in Add a task… but not added comes back after the app is closed". It failed in CI and
  locally on 2026-11-19, and passed when re-run alone. A data-safety test that fails now and then
  may be hiding a real bug.

## Order

1. Step 1 (Safari engine for the phone suite) and the flaky To-Dos test.
2. Step 2, once the owner picks own Worker or Sentry.
3. Step 3, when the owner has 15 minutes.
4. Step 4 starts now. Step 5 is ongoing.
