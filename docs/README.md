# docs/ index

Start here. This folder mixes active planning docs with closed historical records — this page
exists so that distinction is visible without opening every file.

## The `web/` migration is discontinued (2026-08-31)

**`history/web-migration/framework-migration-plan.md`** carries the actual decision at the top
of the file — read that first if you're touching anything related to `web/`. Short version:
`web/` (the React rewrite) will not be developed further and will never be deployed; `legacy/`
is production permanently. The rest of `history/web-migration/` is the historical record of that
stopped effort, not active work queues — kept for reference, not maintained further.

## Active

- **`legacy-handoff-prompt.md`** — the current copy-pasteable prompt for starting a fresh Claude
  session on this repo from scratch (including a different Claude account), for continuing after
  a session/usage limit. Scoped to `legacy/`-only work now that the `web/` migration is
  discontinued. Keep its "Current state" section updated at the end of every work session. **Start
  here.**
- **`ai-hosted-vault-design.md`** — design record for Sakura Hosted AI, a Cloudflare Worker
  (`worker/`) that gives `legacy/` zero-setup AI funded by Robin's own provider account,
  *alongside* BYOK rather than replacing it (the doc's own "Origin, and a real scope change"
  section covers the two reversals that landed on that). **Done and live**: the Worker
  (auth, quota, encrypted provider storage, per-provider request/response adapters, admin
  endpoints), its admin panel in `legacy/`'s Settings, and the user-facing client wiring
  ("Sakura Hosted AI (beta)" in Settings → AI → Provider) are all built, merged to `main`, and
  deployed. All three "Open decisions" the doc originally listed are resolved — see that section.

## Closed / historical reference (`history/`)

Real, accurate records of finished work — not stale, just done. Nothing here needs further
updates; each is kept as the record of what was true when it closed.

- **`history/phase5-parity-checklist.md`** — Phase 5's audit deliverable: the row-by-row
  feature-by-feature check that first surfaced the full gap between `web/` and `legacy/`. Closed
  (see its own "Phase 5 status: closed" section) — every ❌/⚠️ row it found is now tracked inside
  `history/web-migration/phase6-full-parity-plan.md` instead.
- **`history/architecture-plan.md`** — `legacy/`'s own TypeScript modularization history
  (Stage 1/Stage 2, predates the `web/` rewrite entirely). Frozen — this is `legacy/`'s
  authoritative architecture record, and stays that way now that `web/` is discontinued.
- **`history/web-migration/`** — everything from the discontinued `web/` React rewrite, grouped
  together now that none of it is active work:
  - **`framework-migration-plan.md`** — the phase index (Phase 0 through 6) and the decisions
    locked in for the `web/` rewrite. Its own top section carries the 2026-08-31 discontinuation
    decision; everything below that is the historical plan as it stood while active.
  - **`phase6-full-parity-plan.md`** — Phase 6 (full feature + visual parity), complete before the
    migration was discontinued.
  - **`phase7-app-shell-and-dashboard-plan.md`** — Phase 7 (sign-in/onboarding/document chrome),
    complete before the migration was discontinued.
  - **`phase8-design-system-parity-plan.md`** — Phase 8 (shared design-system components), the
    phase in progress when the migration was discontinued; its own top section notes this.
  - **`post-cutover-backlog.md`** — the list of gaps that were deliberately deferred past a
    planned cutover that will now never happen. Kept for reference only.
  - **`handoff-prompt.md`** — the OLD handoff prompt, used while the `web/` migration was active.
    Superseded by `legacy-handoff-prompt.md` above for starting a new session — this one is kept
    only as the historical record of the migration's own workflow rules and phase-by-phase state.
    Its own opening block and "Current state" section both point forward to the new file.

## If you're only reading one thing

`legacy-handoff-prompt.md` if you're starting a session with no prior context at all —
`history/web-migration/framework-migration-plan.md`'s top section if you specifically need the
`web/` discontinuation decision and its reasoning.
