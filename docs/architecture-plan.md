# Sakura: from single-file HTML to a real codebase

**Status:** Phase 0 and Phase 1 complete. Phase 2 in progress (4 domains done, remaining
candidates blocked on core-outline coupling). Phase 3 started (Templates' storage layer done;
Hub panels/Diagrams/Export/AI providers and the rest of Templates not yet begun). Phases 4–5
still future work.

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

**Phase 1 — pure, leaf utilities. (Done — three batches now; the third came later, once
investigating what a "core outline engine" extraction would need turned out to have real
overlap with this phase's own scope.)**

First batch: `escapeHtml` (index.html's `esc()`, used ~183 times — the highest-value,
most security-relevant target), `generateId` (unifies `genDocId`/`genTemplateId`/`mnUid`,
three near-identical copies, into one parameterized function), `formatRelativeTime` (needed
one minimal addition — an injectable `now` parameter, defaulting to `Date.now()` — since the
original calls `Date.now()` internally, making it untestable without either mocking global
time or a flaky real-clock wait; every real call site still calls it with one argument,
unaffected). Second batch: the complete pure dependency chain behind Markdown export —
`stripSemanticMarkers`/`getNodePlainText` (fully pure string transforms, no changes needed at
all), `computeOutlineNumbers` and `serializeMarkdown` (both needed their implicit global-state
reads — the `outlineNumbering` user-preference toggle, and the live `nodes` array default —
turned into explicit, required parameters; unlike the clock injection above, no default was
added for `outlineNumbering`, since there's no universally-correct default for a user
preference the way "the current time" is for a clock, and guessing one would risk silently
diverging from the app's actual current setting).

Deliberately NOT extracted in the first two batches: `serializeOpml`, despite looking like a
natural next target — it calls `getMeta()`, which reads live DOM (`el('header-title')`), so it
isn't actually a pure leaf function without a real signature change to accept the title as a
parameter too. Left for a later pass rather than force-fit into "pure, leaf" scope it doesn't
cleanly meet.

Third batch (`src/core/nodeQueries.ts`): the tree-query layer underneath outline rendering —
`getIndex`/`getParentIndex`/`getSubtreeEnd`/`countDescendants`/`nodeHasChildren`/
`getVisibleNodeIndexes`/`getSelectionRangeIds`/`hasLaterSiblingAtDepth`/`buildPrefix`/
`buildVertFlags`/`isSectionNodeText`/`nodeIsSection`/`isIdSelected`. Found while looking for
what a genuine "core outline engine" module would need to own (see Phase 2's discussion of why
its remaining candidates — search/tabs/diagram-anchor state — are blocked on `nodes`/`render()`
coupling): these turned out to already BE Phase 1 material, not a new category of work.
`buildPrefix`/`buildVertFlags` already took an optional `scopedNodes` parameter defaulting to
the live global — literally Phase 1's own pattern, just not carried all the way through yet.
The rest needed the same treatment as the Markdown-export batch: `nodes`/`collapsedIds`/
`selectAllMode`/`multiSelectedIds`/`selectedId`/`treeIndentWidth`/`sectionMarkersDepthZero`
turned from implicit global reads into explicit parameters, zero logic changes otherwise.

**All three batches now fully cut over — Phase 1 is complete, not just written.**

`nodeQueries.ts` went first among the three despite being written last, since it needed real,
separately-scoped infrastructure work the other two didn't: its 13 functions were scattered
across ~2,000 lines of `index.html`, interleaved with unrelated stateful functions
(`toggleCollapse`, `enterFocus`, `ensureSelection`, etc.) that had to stay exactly where they
were. A pure code-motion commit first relocated all 13 declarations into one contiguous, marked
region (verified via a sorted removed/added-line diff — the only textual additions were the
cluster marker comments), making them splice-able as one block the same way every Phase 2 slice
is.

The splice itself then had to be one atomic swap, not incremental, for a reason that only became
concrete once the generator was actually pointed at this file: `generate-index-blocks.mjs`
compiles a whole source file as a single block, so all 13 signatures changed at once (implicit
global reads — `nodes`, `collapsedIds`, `treeIndentWidth`, `sectionMarkersDepthZero`,
`selectAllMode`, `multiSelectedIds`, `selectedId` — becoming explicit parameters), which meant
every one of the 268 real call sites had to move in the same commit as the definition swap. Done
via a paren/string-aware codemod (not hand-edited) after confirming argument counts were uniform
per function; `buildPrefix`/`buildVertFlags` needed a genuine positional-argument reorder
(`scopedNodes` moved from a trailing optional parameter to a required leading one), not just an
appended arg, since their old call sites already passed it explicitly in a different order. This
pass also surfaced a generator bug: `compileToPlainJs` assumed `tsc` places compiled output flat
in its temp `outDir` — true for every import-free Phase 2 state module, but `nodeQueries.ts` has
an `import type` reference to `serializeMarkdown.ts` (fully erased from the emitted JS) that makes
`tsc` infer a shared `rootDir` across both files, nesting the output instead. Fixed by searching
recursively for the compiled file instead of assuming a flat path.
`tests/e2e/generated-nodequeries-smoke.spec.ts` exercises the highest-risk part of this cutover —
real tree rendering, both tree-line modes, collapse/expand fold-badge counts, focus-mode
breadcrumbs, and range selection — against the real DOM with a real 5-node multi-depth tree.

Following `nodeQueries.ts`, the remaining two batches (`escapeHtml`/`generateId`/
`formatRelativeTime`, and `stripSemanticMarkers`/`computeOutlineNumbers`/`serializeMarkdown`)
were wired in too. Much lower risk: no scattered definitions interleaved with off-limits stateful
code, and 4 of the 5 remaining functions needed zero call-site changes —
either a thin hand-written wrapper preserving the original name (`function esc(value){return
escapeHtml(value);}`, similarly for `genDocId`; `genTemplateId`/`mnUid` live elsewhere in
`index.html` and were hand-edited in place to delegate the same way, e.g. `function
genTemplateId(){return generateId('t')}`), or the name and signature already matched the original
exactly (`formatRelativeTime`, `stripSemanticMarkers`/`getNodePlainText`). Only
`computeOutlineNumbers`/`serializeMarkdown` needed real call-site work — a required explicit
`outlineNumbering` parameter (no default, same reasoning as `sectionMarkersDepthZero` above), 7
sites, append-only, no reordering. The two functions needed the same small relocation treatment
as `nodeQueries.ts` first, since they were interleaved with un-extracted sibling functions
(`serializeTreeText`, `serializeClipboardHtml`).

This second pass caught a real generator bug of its own, not just a mechanical one:
`serializeMarkdown.ts` has a genuine VALUE import (`import { getNodePlainText } from
'./stripSemanticMarkers'`) — unlike `nodeQueries.ts`'s `import type` reference above, which
`tsc` fully erases, a real value import survives compilation as a literal `import` statement.
Spliced into the classic (non-module) script, that's a syntax error which silently kills the
**entire** script block, not just the one function — every previously-working generated function
(`esc`, `genDocId`, `nodeQueries.ts`'s `getIndex`, everything) went undefined at once. Root-caused
by comparing behavior against `main` (confirming it wasn't a pre-existing `file://`-loading
quirk) and fixed in `compileToPlainJs` by stripping any surviving `import ... from '...';` line
from compiled output — safe because every generated block shares one script scope with every
other block and the rest of `index.html`, so a cross-block reference is already a bare global by
the time it's used, function-declaration hoisting making physical block order irrelevant. Caught
by the new `tests/e2e/generated-phase1-remaining-smoke.spec.ts` before merge, not in production —
exactly the value this generator+test harness is supposed to provide, and a good reminder that
even a "simple wiring" pass over already-tested code needs the same real-DOM verification as a
genuinely risky one.

`hub.html` needed no changes at all across either cutover (verified zero diff both times) — none
of Phase 1's functions are used there.

6 files (5 in `src/utils/`, 1 in `src/core/`), 75 unit tests total (verified passing), each
backed by a pinned oracle copy of the actual current index.html implementation asserting exact
behavioral equivalence — all six now live in `index.html`, none still tested-and-waiting.

**Phase 2 — state consolidation. (In progress — 4 of many domains done.)**
Replace the scattered `let`s with typed state modules, one domain at a time.
Purely mechanical — behavior must stay identical, verified against the
Phase-0 E2E baseline before and after each domain.

Mechanism, established across the first three slices: each domain becomes a
dependency-injected `src/state/<domain>.ts` (no imports, no re-exports — see
Phase 1's constraint above, which turned out to matter here too), compiled
and spliced into `index.html` by `scripts/generate-index-blocks.mjs` between
`GENERATED:<name>:START`/`END` marker comments. Every generated block shares
ONE script scope with the rest of `index.html` at runtime (no module
wrapper, no `window.*` indirection) — this is what lets every existing
external call site keep calling generated functions exactly as before, with
zero signature changes, but it also means a top-level identifier declared
by two different domains is a duplicate declaration (a hard SyntaxError for
`let`/`const`). `generate-index-blocks.mjs` now checks for this
automatically after a real instance of exactly this bug shipped between two
draft slices and was only caught by manually reading the generated output —
see the git history around that fix for the specific case. Whether a symbol
is `export`ed from the TS source does NOT provide real runtime privacy in
this model (every top-level declaration is visible to every other block and
to the rest of `index.html` either way) — it only controls whether Vitest
can import it directly and whether the collision checker tracks it. What
actually preserves an external call site's compatibility is keeping the
*name* the same (or adding a same-shaped getter, e.g.
`isPresenceTrackingDocId()`, when a rename is otherwise wanted).

Done so far: `src/state/presence.ts` (live "who's here" tracking),
`src/state/notifications.ts` (the notification inbox's state and business
logic — deliberately NOT `renderNotifList()`, which stays hand-written since
it's pure DOM construction with nothing to consolidate), `src/state/admin.ts`
(feedback-inbox access control), and `src/state/vault.ts` (Secure Storage
session state and pure Web Crypto primitives only — see below for why this
one shipped narrower than the first three). Each shipped as its own PR:
tested module, a real-browser Playwright smoke test exercising the generated
block against the actual DOM (not stubs), full local verification
(typecheck/lint/generate:verify/unit/build/e2e/HTML-structure-validator),
and a diff scoped to exactly its own region of `index.html`.

Candidate-selection lesson from picking the first three: the domains that
were actually safe to extract in isolation, at full scope, shared a shape —
self-contained, Firestore-adjacent or otherwise I/O-bound, and light on
direct DOM construction. Domains investigated and set aside as NOT safe for
that same full-scope treatment:
- Outline search state (`searchQuery`/`searchMatches`/`searchIndex`/
  `searchOpen`), tab state (`openTabs`/`tabDragState`/`tabOverviewItems`),
  diagram-anchor state — all read/write the core `nodes` array and call
  `render()` directly, which doesn't have a stable module boundary yet.
  These are more honestly Phase 3 (or a "core outline engine" slice that
  doesn't exist yet in this plan) than Phase 2 leaf state. Still set aside —
  no change here.
- Secure Storage vault (`vaultCryptoKey`/`decryptedKeyCache`/
  `decryptedGistTokenCache`, AES-GCM/PBKDF2) — initially deferred whole
  (self-contained from `nodes`/`render()`, but read/written from several
  external call sites and genuinely security-sensitive). Revisited
  deliberately with a narrower scope instead of the first three's full-
  domain treatment: only the session state and the *pure* Web Crypto
  primitives (`vaultActive`/`vaultUnlocked`/`b64FromBytes`/`bytesFromB64`/
  `deriveVaultKey`/`vaultEncrypt`/`vaultDecrypt`) were extracted.
  `setupVaultPassphrase`/`unlockVault`/`lockVault`/`disableVaultEncryption`/
  `updateVaultStatusUI`/`updateVaultChip` — the passphrase-dialog
  orchestration and cross-subsystem localStorage migration — stayed
  hand-written, exactly where they were, calling the generated exports as
  bare identifiers. This "extract only the pure, testable core; leave
  orchestration alone" split is itself a reusable pattern for any future
  domain that's self-contained but has genuinely risky side effects. Real
  Web Crypto is natively available in Node (`globalThis.crypto.subtle`), so
  the resulting tests are real AES-GCM/PBKDF2 round-trips, not mocks.

The bulk of the ~300 remaining top-level `let`s still fall into the
core-outline-coupled bucket, not the easy one. Continuing Phase 2 further
likely means tackling that coupling directly (arguably pulling Phase 3's
`core/` work forward), rather than finding more easy, isolated slices —
the vault turned out to still be tractable, but only by narrowing scope;
there's no guarantee the next candidate offers even that option.

**Phase 3 — feature domain extraction. (Started — Templates' storage layer done, everything
else in this phase not yet begun.)**
Templates, Hub panels (with an eye toward de-duplicating the index.html /
hub.html split noted above), Diagrams, Export, AI providers — in order of
increasing coupling to sync, each becoming its own module with an explicit
public interface and its own tests.

First slice: `src/state/templatesIndex.ts` — the templates index's localStorage CRUD and
trash-state toggling (`templateKey`/`builtinTemplateId`/`getBuiltinTemplateIconById`/
`loadTemplatesIndex`/`saveTemplatesIndex`/`setTemplateIcon`/`touchTemplateIndex`/
`loadActiveTemplatesIndex`/`loadTrashedTemplatesIndex`/`moveTemplateToTrashCore`/
`restoreTemplateFromTrashCore`), using the exact "extract only the pure, testable core; leave
orchestration alone" pattern the vault extraction established above. Deliberately excluded from
this slice, and why: DOM rendering (`renderTemplatesList`/`openTemplatesMenu`/
`renderSidebarTemplates`, same reasoning as `renderNotifList` staying hand-written);
anything touching the live `nodes` array (`applyTemplateNodes`/`stampTemplateDateAuthor`/
`applyBuiltinDefaultTemplate`/`applyDefaultTemplate`) — the same core-outline coupling blocking
Phase 2's remaining candidates, genuinely not extractable until a real `core/` module boundary
exists; `applyIncomingTemplateData` (Firestore sync, Phase 4 territory); and
`permanentlyDeleteTemplateCore`, investigated specifically and found to reach into a sibling,
not-yet-extracted domain (the template/folder map storage) plus a real Firestore delete —
genuinely cross-domain, unlike `moveTemplateToTrashCore`/`restoreTemplateFromTrashCore`, which
only touch the templates index itself and so were included.

All 11 extracted functions kept their original names and signatures exactly — the lowest
call-site risk of any cutover in this project so far (zero call sites needed to change).
Needed the same relocation-then-splice two-step as `nodeQueries.ts`/`serializeMarkdown.ts`
(the 11 were scattered across ~170 lines, interleaved with un-extracted siblings like
`builtinTplIcons`/`getBuiltinTemplateDefs`). Caught two real problems before/during generation:
a would-be duplicate `const` collision against still-hand-written sibling code that reads the
same storage-key/version constants (`TEMPLATES_INDEX_KEY`/`TEMPLATE_KEY_PREFIX`/
`BUILTIN_TEMPLATES_VERSION` — fixed by inlining the literal values instead of redeclaring them),
and a real cross-block collision the generator's own collision checker caught on the first
`npm run generate` attempt (this module's internal `deps`/`requireDeps` names collided with
`presence.ts`'s identically-named internals — fixed with the same prefixing pattern
`notifications.ts` used for its own past collision). New
`tests/e2e/generated-templatesindex-smoke.spec.ts` does a full create/list/icon/trash/restore
round-trip against real localStorage and specifically checks that an unrelated, physically
distant function is still callable — the check that would have caught the prior cutover's
import-statement bug that silently killed the whole script.

Not yet started in Phase 3: Hub panels, Diagrams, Export, AI providers, and the rest of the
Templates domain (rendering, node-array manipulation, sync). The real architectural fork ahead:
keep picking off narrow, storage-layer-only slices domain by domain (lower risk, incremental,
what worked here), or invest in scoping a real `core/` module boundary for `nodes`/`render()`
directly — which is what's actually needed before the DOM- and node-coupled pieces of *any*
domain (not just Templates) become safely extractable, and before Phase 2's remaining
core-outline-coupled `let`s can move either. Not decided yet.

**Phase 4 — sync, sharing, presence.**
Presence (see Phase 2 above) ended up extracted early, as a deliberately
small pilot for the generate-index-blocks.mjs pipeline itself — this
doesn't contradict the original "extracted last" reasoning below, which is
about the bulk of sync/sharing (the notification click-through, the missing
role-change alert, the live-sync gap) still living in index.html untouched.
Extracted last, deliberately — this module has already produced the most
bugs, so it gets the harness only once that harness is proven everywhere
else.

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
