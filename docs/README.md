# docs/ index

Start here. This folder mixes active planning docs with closed historical records — this page
exists so that distinction is visible without opening every file.

## Active

- **`handoff-prompt.md`** — the current copy-pasteable prompt for starting a fresh Claude
  session on this repo from scratch (including a different Claude account), for continuing after
  a session/usage limit. Keep its "Current state" section updated at the end of every work
  session. **Start here.**
- **`ai-hosted-vault-design.md`** — design record for Sakura Hosted AI, a Cloudflare Worker
  (`worker/`) that gives `web/` zero-setup AI funded by Robin's own provider account,
  *alongside* BYOK rather than replacing it (the doc's own "Origin, and a real scope change"
  section covers the two reversals that landed on that). **Done and live**: the Worker
  (auth, quota, encrypted provider storage, per-provider request/response adapters, admin
  endpoints), its admin panel in `web/`'s Settings, and the user-facing client wiring
  ("Sakura Hosted AI (beta)" in Settings → AI → Provider) are all built, merged to `main`, and
  deployed. All three "Open decisions" the doc originally listed are resolved — see that section.

- **`cloud-first-plan.md`** — proposed (2026-11-12): make the account's copy the real one for
  signed-in people while guests can still try Sakura without an account. Six phases, starting
  with safe (versioned) cloud writes. Not started.

- **`mobile-plan.md`**: approved and built (2026-11-13). One app for every screen size, with a limited
  phone layout that leaves the desktop untouched; hub.html, the old phone page, now only forwards to it.
  Phases 0–5 done; a real-phone typing check and the faster first load remain. Tablets (2026-11-22): the
  computer layout adapted for touch (`touch.css`), see its "Touch and the on-screen keyboard" section.

- **`standard-practice-plan.md`**: adopted 2026-11-20, after an iPhone-only startup failure. The
  steps are: test in Safari's engine, error reports from devices, a preview before going live,
  release discipline, and code structure. Step 1 comes next.

- **`data-safety-audit.md`**: what was checked for data loss on 2026-11-16 (after a title went
  missing on an iPhone), what was fixed, and what is still open.

- **`mcp-plan.md`**: parked idea (2026-11-22). A read-only MCP server so AI assistants can read a
  person's notes; free on the current plans, using the person's own sign-in token so Firestore's
  rules still decide access. Not approved: build only if target users ask for it.

## Closed / historical reference (`history/`)

Real, accurate records of finished work — not stale, just done. Nothing here needs further
updates; each is kept as the record of what was true when it closed.

- **`history/architecture-plan.md`** — `web/`'s own TypeScript modularization history
  (Stage 1/Stage 2). Frozen — this is `web/`'s authoritative architecture record.
