# docs/ index

Start here. This folder mixes active planning docs with closed historical records — this page
exists so that distinction is visible without opening every file.

## Active

- **`phase6-full-parity-plan.md`** — the current work. Full parity + pixel-close visual match
  with `legacy/`, sequenced into phases, ending in an explicit pre-cutover gate. Read this first
  for "what's next."
- **`handoff-prompt.md`** — a copy-pasteable prompt for starting a fresh Claude session on this
  repo from scratch (including a different Claude account), for continuing after a session/usage
  limit. Keep its "Current state" section updated at the end of every work session.
- **`framework-migration-plan.md`** — the phase index (Phase 0 through 6) for the whole `web/`
  rewrite project. Still actively referenced: its own Phase 6 entry is a one-paragraph summary
  that points to `phase6-full-parity-plan.md` for full detail, and its repo-structure/decisions
  sections stay accurate for as long as the `legacy/`+`web/` coexistence period lasts.

## Closed / historical reference (`history/`)

Real, accurate records of finished work — not stale, just done. Nothing here needs further
updates; each is kept as the record of what was true when it closed.

- **`history/phase5-parity-checklist.md`** — Phase 5's audit deliverable: the row-by-row
  feature-by-feature check that first surfaced the full gap between `web/` and `legacy/`. Closed
  (see its own "Phase 5 status: closed" section) — every ❌/⚠️ row it found is now tracked inside
  `phase6-full-parity-plan.md` instead.
- **`history/architecture-plan.md`** — `legacy/`'s own TypeScript modularization history
  (Stage 1/Stage 2, predates the `web/` rewrite entirely). Frozen — not where current work
  happens, kept as the authoritative record for `legacy/` until Phase 6 retires it.

## If you're only reading one thing

`phase6-full-parity-plan.md` for what's being built next, `handoff-prompt.md` if you're starting
a session with no prior context at all.
