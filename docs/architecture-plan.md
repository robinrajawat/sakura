# Sakura: from single-file HTML to a real codebase

**Status:** Phase 0 and Phase 1 (partial) complete. Phases 2–5 are still future work.

## Why

Measured directly from `index.html` before this work started:

- **49,456 lines** in one file — markup, ~2,400 lines of CSS, and a single
  inline `<script>` block of roughly 2.4 MB of JavaScript.
- **2,143 functions**, essentially all in one shared global scope.
- **310+ top-level `let` statements** (many lines declare several at once),
  every one a name any of those 2,143 functions can read or write, with
  nothing stopping a typo or an ordering mistake.
- **Zero persisted tests.** Every test written for a fix — sharing,
  templates, the scrollbar bug — was created, run once, and deleted. Nothing
  survives between sessions to catch a future regression.

Two production bugs came directly from this in one afternoon: `FOLDERS_KEY`
(and eight sibling `*_KEY` constants) is read by boot code roughly 18,000
lines before it's declared — a temporal-dead-zone crash, caught only because
it happened to sit inside a `try/catch`. The exact same bug class was then
introduced by a second change the same day, caught only by manually running
a page-load error probe before shipping. `no-use-before-define` — a standard
ESLint rule — would have caught both before either ever ran in a browser.

## Scope, corrected from the original proposal

The original version of this plan assumed a single `index.html` deployed to
a GitHub Pages *project* page (`robinrajawat.github.io/sakura`). Checking
the actual GitHub Pages API before starting Phase 0 found two things that
changed the plan:

1. **There's a second full app**, `hub.html` (~148 KB) — a separate,
   mobile-focused page with its own scope (To-Dos and Journal only, requires
   sign-in, no local-only mode). Both files are now treated as build entries.
2. **Production is `www.sakura-notes.com`**, a custom domain, served
   directly from the `main` branch root via GitHub's *legacy* Pages build
   (`"build_type": "legacy"`, not GitHub-Actions-based) — a real, live site,
   not a project-page subpath. This means Vite's `base` is `/`, not
   `/sakura/`, and — more importantly — it means Phase 0 does **not** touch
   the deployment mechanism at all. Production keeps serving the
   hand-maintained root `index.html`/`hub.html` exactly as it does today
   until a later, deliberate decision to switch. Phase 0 is a branch
   (`refactor/modularize`) with new dev tooling, verified thoroughly, merged
   to `main` as source-only additions — nothing about what's live changes as
   a result of merging it.

The repo also already has its own safety infrastructure, predating this
plan, worth preserving rather than replacing:

- `.githooks/pre-commit` + `scripts/setup-git-identity.sh` — blocks a commit
  whose author email isn't `robinsinghrajawat@gmail.com` (guards against a
  past incident where a placeholder email got committed under someone else's
  real GitHub identity).
- `scripts/validate_html_structure.py` — parses `index.html` with a real
  WHATWG-spec parser and checks structural invariants, guarding against a
  past incident where a stray literal `<Title>` in help prose got tokenized
  as a real `<title>` tag (a RAWTEXT element, same category as `<script>`),
  silently truncating the entire main script.

CI (below) now also runs this same HTML validator, and the build-smoke test
checks for the same failure mode (a catastrophically truncated build output)
from the Vite side.

## What "properly" means here — and what it doesn't

**Chosen:** TypeScript + ES modules + Vite, output as static files, same
GitHub Pages deployment model as today. Kept **vanilla** — no React, no Vue,
no component framework. A framework rewrite is a second, independent,
much larger risk than the module split itself, with no evidence it's
needed — the actual problems are state organization and test coverage, not
the rendering approach. If wanted later, it's a separate decision made once
the codebase is already modular enough for it to be a contained change.

**TypeScript adopted incrementally** — new code goes straight into `src/`
as real `.ts`, but the legacy `index.html`/`hub.html` aren't part of the
TypeScript project at all yet (`tsconfig.json`'s `include` only covers
`src/**` and `tests/unit/**`). They join the TS project piece by piece as
Phase 1+ actually extracts code out of them — never a big-bang conversion.

## What Phase 0 actually delivered

Pure additive tooling, verified end-to-end before being committed:

- `package.json`, `vite.config.js` (multi-page: `index.html` + `hub.html`,
  `base: '/'`), `tsconfig.json`, `eslint.config.js`
  (`@typescript-eslint/no-use-before-define: error` — see "Why" above),
  `vitest.config.ts`, `playwright.config.ts`.
- `src/main.ts` — placeholder only, not imported by either HTML file yet.
- `tests/unit/` — one scaffold test proving the Vitest pipeline runs.
- `tests/e2e/` — the start of a **permanent** regression suite, seeded with
  two tests carried over from recent fixes (visibility-badge wording,
  notifications scrollbar CSS) plus two new ones written specifically to
  validate this phase: `build-smoke.spec.ts` (dist/ exists, isn't
  catastrophically truncated relative to source) and
  `built-output-loads.spec.ts` (the *built* `index.html`/`hub.html` actually
  load in a browser and the editor pane renders — not just present on disk).
- `.github/workflows/ci.yml` — typecheck, lint, unit tests, build, e2e tests,
  and the existing `validate_html_structure.py` safeguard, on every push and
  PR. **No deploy step** — see Scope above.

Verified locally before commit: `npm run typecheck`, `npm run lint`,
`npm run test:unit`, `npm run build` (produces `dist/index.html` at
3,897.97 KB and `dist/hub.html` at 148.45 KB — both present, neither
truncated), and the full `npm run test:e2e` suite, including loading the
actual built output in a real browser and confirming the editor pane
renders. All green.

## Target module layout (Phase 1+)

```
src/
  main.ts                 — bootstrap / composition root
  core/                    — outline engine: node model, CRUD, undo/redo,
                             render. No sync, no UI chrome.
  state/                   — typed state modules, one per domain, replacing
                             the 300+ scattered top-level `let`s
  sync/                    — Firestore sync, sharing, presence, realtime
                             listeners. Highest-risk area — extracted LAST.
  features/
    pad/                   — Notes, Q&A, Diagrams, Mind Maps, Decision Logs,
                             Remarks, Attachments
    hub/                   — To-Dos, Meetings, Journal, Library (shared
                             between index.html's desktop Hub panel and
                             hub.html's mobile page — currently duplicated
                             sync logic between the two; a real target for
                             this extraction to de-duplicate)
    templates/
    export/                — docx/pptx/pdf/opml/md/Sakura-JSON
    ai/                    — the seven provider integrations
    settings/
  ui/                      — shared primitives: modals, toasts, dropdowns,
                             the cross-tab banner, etc.
tests/
  unit/                    — Vitest, for core/ and state/ logic
  e2e/                     — Playwright, committed and maintained
firestore.rules             — unchanged, deployed exactly as today (manual
                             paste into Firebase Console)
```

## Migration order — risk-ascending

**Phase 0 — tooling scaffold, zero behavior change. (Done.)**

**Phase 1 — pure, leaf utilities. (Done — this commit.)**
Extracted three functions, each with full unit-test parity against a pinned copy of the
original: `escapeHtml` (index.html's `esc()`, used ~183 times — the highest-value, most
security-relevant target), `generateId` (unifies `genDocId`/`genTemplateId`/`mnUid`, three
near-identical copies, into one parameterized function), `formatRelativeTime` (needed one
minimal addition — an injectable `now` parameter, defaulting to `Date.now()` — since the
original calls `Date.now()` internally, making it untestable without either mocking global
time or a flaky real-clock wait; every real call site still calls it with one argument,
unaffected).

**Important: none of these are wired into index.html/hub.html yet.** Production behavior is
unchanged — verified via an empty `git diff` against both files. This is deliberate, not an
oversight: the live app is a classic (non-module) `<script>`, executing synchronously in
document order. A `<script type="module">` is always deferred (runs after parsing, like
`defer`), so simply adding a module `<script>` importing these utilities and assigning them
to `window` would NOT make them available in time for the classic script's own top-to-bottom
execution — they'd be `undefined` at every one of the 183 call sites until the deferred module
happened to run, which is too late. Solving this properly (most likely: converting the main
script to `type="module"` itself, a bigger, separately-tested step, since that also changes
top-level `let`/`function` scoping semantics from global to module-scoped) is real
infrastructure work belonging to its own deliberate phase — not something to bolt on
piecemeal, function by function, during extraction. Until then, Phase 1's value is what it
already provides: a verified-correct, fully typed, fully tested canonical implementation
ready to become the real one the moment cutover happens, plus the extraction/test
methodology now proven on real code instead of only placeholders.

Still open within Phase 1 (not done this pass, real candidates for a future session):
OPML/Markdown/plain-text export converters (larger, more logic per function, worth their own
focused pass with equally thorough equivalence tests) and a few other small pure helpers
noticed along the way but not yet inventoried exhaustively.

**Phase 2 — state consolidation.**
Replace the scattered `let`s with typed state modules, one domain at a time.
Purely mechanical — behavior must stay identical, verified against the
Phase-0 E2E baseline before and after each domain.

**Phase 3 — feature domain extraction.**
Templates, Hub panels (with an eye toward de-duplicating the index.html /
hub.html split noted above), Diagrams, Export, AI providers — in order of
increasing coupling to sync, each becoming its own module with an explicit
public interface and its own tests.

**Phase 4 — sync, sharing, presence.**
Extracted last, deliberately — this module has already produced the most
bugs (the notification click-through, the missing role-change alert, the
missing presence indicator, and the live-sync gap all lived here), so it
gets the harness only once that harness is proven everywhere else.

**Phase 5 — strict mode everywhere.**
Every module `strict: true` TypeScript, no `allowJs` escape hatch left.

## Open items for a later, deliberate decision (not blocking Phase 0)

- **Deployment mechanism.** Whether/when to switch from the current
  "legacy" GitHub Pages build (serving `main` root directly) to a
  GitHub-Actions-built-and-deployed `dist/`. Not part of this plan's scope
  until the build pipeline has a real track record.
- **`hub.html` code duplication.** It re-implements its own sync logic for
  To-Dos/Journal, separate from `index.html`'s. Phase 3's Hub extraction is
  the natural point to unify this, but it's a real behavior-risk area (two
  independently-evolved sync paths) worth its own careful look when it comes
  up, not assumed away here.
- **Dev-dependency vulnerabilities.** `npm audit` currently reports 5
  (3 moderate, 1 high, 1 critical), all in `esbuild`'s dev-server-only code
  path (transitively via `vite`/`vitest`) — doesn't affect production, since
  nothing in `dist/` or the deployed site runs esbuild's dev server. Left
  as-is for Phase 0 rather than force-upgrading to a new Vite major mid-scaffold;
  worth revisiting in a future, deliberate dependency-upgrade pass.
