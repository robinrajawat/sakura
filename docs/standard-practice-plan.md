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
`web/src/telemetry/sentryConfig.ts`; index.html's CSP allows only its host. "Prevent Storing of IP
Addresses" is on at organisation level; the alert "Send a notification for high priority issues"
emails the owner. No session records either: Sentry hears from a device only when something goes
wrong.

Verified 2026-11-20 on the live site (Mac): a test error reached Sentry and the alert email arrived;
the report had no user or IP and its address ended at `sakura-notes.com/`. Not yet done: source
maps, so a report points at readable code instead of the minified page.

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
branch. Branch control (Settings → Builds): the **production branch is Claude's working branch**,
`claude/clever-carson-durens`, not `main` (this project is only for testing; the live site is GitHub
Pages), preview branch "All non-production branches", automatic deployments **on**: pausing them
(tried 2026-11-20) stops previews too. The project must stay connected to GitHub (Settings → Git
repository; the Cloudflare Workers and Pages app needs access to `robinrajawat/sakura`), or nothing
builds. If a session works on a branch with another name, the owner changes the production branch to
it. Addresses:

- **`https://preview.sakura-notes.com`**: the project's production copy, so always the latest push to
  the working branch. The owner's iPhone bookmark. (A custom domain on a Pages project always shows
  the production branch, so with `main` as production it showed the live code: 2026-11-20.) Its DNS
  record is a CNAME to `sakura-preview-6so.pages.dev`.
- Each push's own address, and for other branches `https://<branch>.sakura-preview-6so.pages.dev`.
  Cloudflare posts them on the PR.

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
- Each release is checked on its preview (`preview.sakura-notes.com`, or the link Cloudflare posts on the PR) on a real iPhone before merging.
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

## 6. Release process (switch on before the first outside users)

Owner 2026-11-20: small PRs are fine while the owner is the only user; before a broader audience the
release must be controlled and standard. Today every merge to `main` goes live (`deploy.yml`, and
`deploy-worker.yml` for `worker/`). When switched on, in one PR:

- Small PRs keep merging to `main` (trunk-based). Merging no longer publishes: `deploy.yml` (and
  `deploy-worker.yml`) run when a **GitHub release is published**, not on every push.
- `main` is staging: `https://main.sakura-preview-6so.pages.dev` (Cloudflare builds it), checked on
  the iPhone before a release.
- A release: Releases → new tag (`v2026.12.1`), notes drafted from the merged PRs (also shown as
  "What's new" in the app), checklist: preview checked, CI green, Sentry quiet. The tag is the
  version in Settings → About and in Sentry, so errors group by release.
- Roll back by publishing (or re-running the deploy for) the previous release; an urgent fix is a
  merge plus an immediate release.
- Not needed at first: feature flags, gradual rollouts.

**When:** before the first outside users, i.e. the 3–5 user tests in the positioning plan. Until then
the preview check before each merge (step 3) is the safety net.

## Order

1. Steps 1–3: done (2026-11-20).
2. Step 4 starts now. Step 5 is ongoing.
3. Step 6 before the first outside users.
