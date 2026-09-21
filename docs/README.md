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

## Closed / historical reference (`history/`)

Real, accurate records of finished work — not stale, just done. Nothing here needs further
updates; each is kept as the record of what was true when it closed.

- **`history/architecture-plan.md`** — `web/`'s own TypeScript modularization history
  (Stage 1/Stage 2). Frozen — this is `web/`'s authoritative architecture record.
