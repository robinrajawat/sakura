# Sakura: from single-file HTML to a real codebase

**Status:** Phase 0 and Phase 1 complete. Phase 2 in progress — 4 fully-extracted domains done,
plus three narrower re-investigations: outline search matching, tab cycling/reordering, and
diagram-anchor/orphan logic all turned out extractable once the `core/` pattern existed, even
though all three were originally set aside as blocked in one blanket judgment. Phase 3 in
progress (Templates' storage layer done, plus the `stampTemplateDateAuthor` follow-up and both
`applyTemplateNodes`'s and `applyBuiltinDefaultTemplate`'s node-construction logic — the latter
needed no new source at all, see below; AI provider prefs storage done; **all four of Hub's
feature domains done** — To-Dos, Journal, subtask CRUD, and due-date reminder checking;
Diagrams' display-list filtering/sorting done, plus six slices of the `diagramGen*` generation
subsystem itself (pure box-sizing/color math, the topology/confirmed-nodeMeta query layer, the
nodeMeta classification-proposal/plain-object bridge, the branch/tag/marker/shape
color-assignment layer, the pure tree-layout engine, and the final-rect/bounds computation);
**Decision Log domain in progress** (normalization layer, and lookup/anchor-label/status-query
layer — a domain untouched elsewhere in this migration); the much larger remaining
XML-cell-string-assembly and AI-classification portions of `diagramGen*` (plus
`generateDiagramFromOutline`/`diagramGenFinishGenerate` orchestration as a whole,
`diagramGenValidateGuideline`/`diagramGenLegend*`), the rest of the Decision Log domain
(DOM-dependent row/candidate helpers), Export, and the rest of Templates/Journal not yet begun).
`core/` module boundary: nine slices done (indent/outdent, moveSelected, drag-and-drop move,
paste, delete, the shared selection/parentId helpers, outline search matching, template
node-construction via injected `makeNode`/`emptyStyles` — the first slice to inject a
hand-written function as a dependency rather than reference an already-generated block, and
later reused as-is for `applyBuiltinDefaultTemplate` once its own explicit parenting was found
to be dead code — and `diagramGenDims.ts`, five pure text/color/box-sizing functions from the
`diagramGen*` subsystem with zero injected dependencies at all). Ten additional Phase 2/3-adjacent
slices: tab cycling/reordering, diagram-anchor/orphan logic, diagram-list filtering/sorting,
diagramGen*'s own topology/confirmed-nodeMeta query layer, nodeMeta classification-proposal
layer, branch/tag/marker color-assignment layer, tree-layout engine, and final-rect/bounds
computation, plus Decision Log's own normalization and lookup/anchor/status-query layers
(`src/state/tabOrder.ts`,
`src/state/diagramAnchor.ts`, `src/state/diagramDisplayList.ts`,
`src/state/diagramGenTopology.ts`, `src/state/diagramGenNodeMeta.ts`, `src/state/diagramGenColors.ts`,
`src/state/diagramGenLayout.ts`, `src/state/diagramGenRects.ts`, `src/state/decisionLog.ts`,
`src/state/decisionLogQueries.ts`
— not `core/`, since none touches the outline `nodes` array as a mutation target). **Hub's structural
blocker resolved:**
`scripts/generate-index-blocks.mjs` now supports multiple target HTML files (`targetFile` per
block, collision-checking scoped per file); first proven with an infrastructure-only pilot
(`hubGenerateId`, reusing Phase 1's `generateId.ts`), then four real feature-domain slices:
`hubTodos` (localStorage-backed), `hubJournal` (IndexedDB-backed), `hubSubtasks` (subtask
toggle/remove/add, exercised through real DOM event listeners since the logic lives in
anonymous handlers rather than named wrappers), and `hubReminders` (due-date notification
filtering/dedup, with the real `Notification` API construction staying hand-written). Phases
4–5 still future work.

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
  no change here. **Update, after the `core/` boundary existed:** all three
  were re-investigated and turned out narrower than the blanket verdict
  suggested. Outline search's matching logic — see `src/core/nodeSearch.ts`
  under the `core/` section below. Tab cycling/reordering — `cycleOpenTab`/
  `reorderTab` never touch `nodes` at all — see `src/state/tabOrder.ts`.
  Diagram-anchor labeling/orphan-detection/reordering — reads `nodes`
  read-only (never mutates it, never calls `render()`) — see
  `src/state/diagramAnchor.ts`. What remains genuinely coupled in each
  domain: outline search's `openSearch`/`closeSearch`/UI wiring; tab
  state's `switchDoc` (full document-load orchestration) and tab-strip
  drag visuals; diagram state's node-array-touching pieces (diagram
  creation/deletion tied to node lifecycle, `renderDiagramsList`'s DOM
  construction). No further claim about whether more of any of these three
  domains would offer the same opening.
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
means tackling that coupling directly — the `core/` module boundary work
below, now started rather than hypothetical — rather than finding more
easy, isolated slices; the vault turned out to still be tractable, but
only by narrowing scope, and there's no guarantee the remaining Phase 2
candidates offer even that option once the `core/` boundary is far enough
along to revisit them.

**Phase 3 — feature domain extraction. (In progress — Templates' storage layer and AI provider
prefs done; Hub's generator infrastructure exists but no Hub feature domain extracted yet;
everything else in this phase not yet begun.)**
Templates, Hub panels (with an eye toward de-duplicating the index.html /
hub.html split noted above — still just an aspiration, not attempted), Diagrams, Export, AI
providers — in order of increasing coupling to sync, each becoming its own module with an
explicit public interface and its own tests.

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

**Follow-up addition to `templatesIndex.ts`: `stampTemplateDateAuthorCore`.** Re-investigated,
much later in the project (after `core/` existed and after `tabOrder.ts`/`diagramAnchor.ts`/
`nodeSearch.ts` had each already shown that "touches `nodes`" was too broad a reason to exclude
something). `stampTemplateDateAuthor` mutates existing nodes' `text` fields in place via exact
string matching (`"Date:"`, `"Author:"`, `"Date · Author"`) — no node construction, no ambient
id-counter involvement, no selection-state side effects, genuinely different from
`applyTemplateNodes`/`applyBuiltinDefaultTemplate`/`applyDefaultTemplate` (still excluded,
correctly this time: those construct new nodes via `makeNode()`, which mutates the shared
`nextId` id-counter global as it goes — a real coupling this function doesn't have). `dateStr`/
`authorName` are passed in already-computed, keeping the DOM read (`el('doc-author')?.value`)
and date formatting in the hand-written wrapper. 10 new unit tests, all passing first run.
Extended `tests/e2e/generated-templatesindex-smoke.spec.ts` (same generated block, no new file)
with a second test exercising the real wrapper against a real `nodes` array and the real
`#doc-author` input.

Second slice: `src/state/aiProviders.ts` — the AI settings panel's prefs storage
(`computeLoadedAiPrefs`/`loadAiPrefsCore`/`saveAiPrefsCore`). Scope was narrowed during
investigation from the originally-planned "AI providers" slice: `getAllAiProviders()`/
`getAiProviderById()` in index.html are trivial one-line ambient lookups over the
`AI_BUILTIN_PROVIDERS` const with no real logic to test, so they were left hand-written rather
than extracted — generator/test overhead for zero bug-surface reduction. The genuinely testable
part is the stored-JSON parse/validate/merge logic (an unknown/stale stored provider id is
ignored rather than clamped; a per-provider `modelByProvider` entry overrides a flat `model`
field when both are present) — that's what got extracted, with `loadAiPrefs()`/`saveAiPrefs()`
kept as thin hand-written wrappers around it, same split as vault/templatesIndex. Deliberately
excluded: `syncAiProviderOptions`/`syncAiModelOptions`/`updateAiKeyStatus` (DOM construction,
same reasoning as `renderNotifList`); the `AI_CURATED_MODELS`-driven model-list rendering (pure
DOM, no storage). One real bug caught during the gauntlet, not before: the initial
`loadAiPrefsCore` wrapped only the storage read in `try/catch`, not the `getLocalStorage()` call
itself — a unit test for "getLocalStorage() throws" failed, fixed by widening the `try` to match
`saveAiPrefsCore`'s (and `templatesIndex.ts`'s) existing convention of catching from the deps
call onward. No name collisions this time (checked all 7 module-level identifiers against the
rest of index.html before considering it done — zero unexpected hits). New
`tests/e2e/generated-aiproviders-smoke.spec.ts` round-trips through the real, unchanged
`loadAiPrefs()`/`saveAiPrefs()` wrapper functions against real localStorage (not the extracted
functions directly, since the wrappers are the actual call path the app uses) and checks the
same "unrelated distant function still callable" invariant as every other cutover.

**Third slice: `src/state/tabOrder.ts`** — `computeNextTabDocId`/`reorderTabsCore`. Not a
Phase 3 domain in the original sense (Templates/Hub/Diagrams/Export/AI providers); this is a
revisit of Phase 2's "tab state," which was set aside early on as `nodes`-coupled alongside
outline search and diagram-anchor state. That framing turned out not to hold for these two
functions specifically: `cycleOpenTab`/`reorderTab` only ever read/write `openTabs`/
`activeTabDocId`, never the outline `nodes` array — the same over-broad-original-judgment shape
as `nodeSearch.ts`'s revisit of search matching, just in Phase 2 territory rather than `core/`
(since nothing here is about the outline tree). Both wrapper functions kept their exact original
names/signatures; the two real call sites (the `Ctrl+Tab` keydown handler, the tab-strip drop
handler) didn't change. `switchDoc`/`persistOpenTabs`/`renderTabStrip` (real orchestration —
loading a document's full editor state, localStorage writes, DOM rebuild) stayed hand-written,
same split as every other slice. 16 new unit tests, all passing first run. One e2e authoring
mistake caught and fixed before commit: passing a `Set` (inside a fake tab's `collapsedIds`) as
a `page.evaluate()` argument silently degrades to a plain object across Playwright's
serialization boundary, causing a real runtime error (`collapsedIds.has is not a function`)
once `cycleOpenTab` actually loaded that tab via `switchDoc`/`applyTabSnapshot` — fixed by
constructing the fake tab objects inside the page context instead of passing them in as
arguments. New `tests/e2e/generated-taborder-smoke.spec.ts` exercises the real, unchanged
`cycleOpenTab()`/`reorderTab()` wrappers against fully-formed fake tab objects (the same shape
`loadTabFromStorageObj` produces for a real document), including confirming the reorder persists
to the real `sakura_open_tabs_v1` localStorage key.

**Fourth slice: `src/state/diagramAnchor.ts`** — `computeDiagramAnchorLabel`/`isDiagramOrphaned`/
`diagramNeedsAttentionCore`/`reorderDiagramsCore`. Same shape as `tabOrder.ts`'s revisit: filed
under Phase 3 rather than `core/` since nothing here mutates the outline `nodes` array — the
anchor/orphan functions read `nodes` read-only (to check whether an anchored node id still
exists), and the reorder function only touches the separate `diagrams` array. References
`stripSemanticMarkers` (already a generated block from Phase 1) via the established
`declare function` ambient pattern. One genuine behavioral quirk pinned deliberately rather than
"fixed": `reorderDiagramRow`'s target index is computed *before* the dragged item is spliced out
and never recomputed afterward, so (unlike `reorderTabsCore`'s explicit `side` parameter)
dragging forward lands the item just *after* the target while dragging backward lands it just
*before* — a real asymmetry in the existing drag-and-drop UX, preserved exactly and pinned with
dedicated tests rather than "corrected" during extraction. 21 new unit tests, all passing first
run, including that quirk. New `tests/e2e/generated-diagramanchor-smoke.spec.ts` exercises all
four real, unchanged wrapper functions — including confirming the forward-drag quirk survives
through real orchestration (`markDirty`/`scheduleAutoSave`), not just the pure function alone.

**Hub's structural blocker — resolved (generator infrastructure only, no Hub feature domains
extracted yet).** Hub panels (todos/meetings/journal/library) had been un-investigated all
session, blocked on a real structural issue distinct from every other Phase 2/3 domain: Hub
isn't code living inside `index.html` at all — it's `hub.html`, a genuinely separate ~148 KB
file with its own independent classic `<script>` and its own top-level global scope. Every
extraction so far assumed one target file; `scripts/generate-index-blocks.mjs` had `index.html`
hardcoded as *the* target.

Generalized the generator to support multiple target files: each block now carries an optional
`targetFile` (defaulting to `'index.html'` for every existing block, so nothing about any prior
slice changed), blocks are grouped by target file before compiling/splicing/collision-checking,
and `generate()`/`--verify` operate per-file — writing or checking each target's own HTML
against its own generated output independently. Collision-checking is deliberately scoped per
file rather than globally: `index.html` and `hub.html` are separate runtime script scopes, so
the same top-level identifier existing in a block for each isn't a real collision the way it
would be between two blocks in the *same* file.

First (and so far only) `hub.html` block: `hubGenerateId`, deliberately the lowest-risk possible
pilot — not new source, but a *reuse* of the already-tested `src/utils/generateId.ts` from Phase
1. `hub.html`'s own `todoUid`/`jnUid`/`subUid` turned out to be exact matches for
`generateId(prefix, 6)` (same `.slice(2,8)` — suffix length 6 — just different prefixes), so no
new unit tests were needed at all; the existing `tests/unit/generateId.test.ts` already covers
this exact function, now exercised through a second, independent call path. New
`tests/e2e/generated-hubgenerateid-smoke.spec.ts` loads `hub.html` directly (not through
`index.html`) and confirms all three wrapper functions produce correctly-prefixed ids, two
back-to-back calls stay distinct, and the standard "unrelated distant function still callable"
check passes for `hub.html`'s own separate script — proving the multi-file mechanism end to end,
not just that the generator's own collision checker didn't complain.

Explicitly NOT done here: no Hub feature-domain logic (todos/meetings/journal/library CRUD,
sync, rendering) has been investigated or extracted — this work was scoped narrowly to proving
the file-targeting mechanism itself works, the same "prove the pattern with a deliberately small
pilot" discipline `presence.ts` used for the original `index.html`-only pipeline. Hub's real
feature domains remain a substantial, unscoped body of work — `scripts/validate_html_structure.py`
(the RAWTEXT-hijack guard wired into the pre-commit hook) also still only checks `index.html`;
extending it to `hub.html` would need its own pass, since `hub.html`'s script is far smaller than
the 1MB-minimum heuristic that guard uses for `index.html` and naively reusing that threshold
would make it fail immediately.

**First Hub feature-domain slice: `src/state/hubTodos.ts`** — `createTodo`/`loadTodosLocalCore`/
`saveTodosCore`, targeting `hub.html`. Unlike `hubGenerateId` (pure infrastructure proof, zero
new logic), this is a genuine feature-domain extraction: the To-Dos panel's item-creation
factory and its localStorage load/save layer, using the same dependency-injected pattern as
`templatesIndex.ts`/`aiProviders.ts` (`getLocalStorage`/`bumpSyncTimestamp`/`pushMetaToCloud`
injected, with `bumpSyncTimestamp`/`pushMetaToCloud` themselves real ambient hub.html globals —
Hub's own lightweight per-key cloud-sync mechanism, distinct from index.html's Firestore-doc
sync). `findTodo` (a trivial one-line lookup) stayed hand-written, same reasoning as
`getAllAiProviders` staying out of `aiProviders.ts`; `renderTodos` and the swipe-list DOM wiring
also stayed hand-written. Two real bugs caught by the unit tests before commit, not before: both
`loadTodosLocalCore` and `saveTodosCore` initially called `getLocalStorage()` *outside* their own
`try` block (an initial "throws on access" test failed for each) — the same class of mistake as
`aiProviders.ts`'s earlier `loadAiPrefsCore` bug, fixed the same way (widen the `try` to wrap the
deps call too). 12 new unit tests, all passing after those two fixes. New
`tests/e2e/generated-hubtodos-smoke.spec.ts` round-trips through the real, unchanged
`newTodo()`/`saveTodos()`/`loadTodosLocal()` wrapper functions against real localStorage in
`hub.html`'s own script scope, plus the standard distant-function-still-callable check.

**Follow-up addition to `hubTodos.ts`: `nextRepeatDate`.** Once identified as pure date
arithmetic (daily/weekly/weekdays advancement for a recurring todo's due date) with no
`todos`-array coupling at all, added to the same module in a second pass rather than treated as
a separate slice — same file, since it's squarely part of the To-Dos domain. No wrapper needed
in `hub.html` at all: fully pure, same name/signature, so the two real call sites (both inside
todo-completion handlers) keep referencing it as an ambient global exactly as before, now
supplied by the generated block instead of hand-written. 8 new unit tests, including the
weekday-skip-a-weekend case (a Friday due date repeats to the following Monday, not Saturday)
and month/year-boundary date arithmetic, all passing first run. Extended
`tests/e2e/generated-hubtodos-smoke.spec.ts` (rather than adding a new file, since it's the same
generated block) to cover daily/weekly/weekend-skipping through the real ambient global.

**Correction, since an earlier session note assumed Hub had more panels than it does:** Hub's
own header comment (`hub.html`, near the top) states its scope is deliberately **only** To-Dos
and Journal — Meeting Notes, Library, Recap, AI features, PDF export, and version history are
explicitly desktop-only and don't exist in `hub.html` at all, not merely "not yet extracted."
With `hubJournal.ts` (below) landed, both of Hub's actual feature domains now have their
storage/validation layers extracted.

Not yet started: the rest of Hub's To-Dos domain (subtasks, due-date reminder checking — the
latter genuinely coupled to the real `Notification` API and a DOM click handler, not
investigated here), and the rest of the Journal domain noted in its own write-up below.

**Second Hub feature-domain slice: `src/state/hubJournal.ts`** — `normalizeJournalEntryCore`/
`loadJournalLocalCore`/`saveJournalEntriesCore`, also targeting `hub.html`. Same dependency-
injected pattern as `hubTodos.ts`, but Journal is IndexedDB-backed (`idbGet`/`idbSet`) rather
than localStorage — mirroring index.html's own exact data shape (same field names, same
`jnUid()` id scheme) per hub.html's own comment on this domain, so entries stay compatible with
the desktop app's store and cloud sync in both directions. `findJournalEntry`/
`findOrCreateJournalEntry` (trivial lookups) and `stripJournalHtml`/`journalSnippet`
(genuinely DOM-dependent, not portable to a Node test environment) stayed hand-written, along
with `renderJournal` and the swipe-list DOM wiring. One subtlety caught and preserved rather
than "fixed": the original validates `createdAt`/`modifiedAt` with the coercive global
`isFinite()`, not the strict `Number.isFinite()` — a numeric string like `"500"` passes the
former but not the latter — matched exactly rather than silently tightened, with a dedicated
test pinning the distinction. `saveJournalEntriesCore` also preserves a real async-orchestration
quirk: the original fires `bumpSyncTimestamp`/`pushMetaToCloud` synchronously and
unconditionally right after calling `idbSet`, without awaiting it first — so those two side
effects happen regardless of whether the save itself eventually succeeds or fails; the core
function returns the `idbSet` promise itself (rather than swallowing it) so the hand-written
wrapper can still attach its own `.catch()` for the "device storage may be full" toast. 21 new
unit tests, all passing first run, including the `isFinite` and async-ordering pins. New
`tests/e2e/generated-hubjournal-smoke.spec.ts` exercises all three real, unchanged wrapper
functions against real (not mocked) browser IndexedDB.

Not yet started: the rest of the Journal domain (rich-text stripping display logic, which is
genuinely DOM-dependent). Hub's actual feature-domain scope (To-Dos + Journal only — see the
correction note above) is now fully covered at the storage/validation layer.

**Third Hub feature-domain slice: `src/state/hubSubtasks.ts`** — `toggleSubtaskCore`/
`removeSubtaskCore`/`addSubtaskCore`, targeting `hub.html`. Revisits the "genuinely separate...
not investigated" note `hubTodos.ts`'s own header left for subtask CRUD. Unlike every prior
slice, the original logic lived entirely inside three anonymous DOM event-listener callbacks
(a subtask-list click handler and a subtask-input keydown handler), not named wrapper
functions — so this is the first slice whose e2e test drives real UI interaction (typing into
the real subtask input and pressing Enter, clicking the real toggle/remove buttons) rather than
calling a directly-nameable wrapper. Each operation's core logic is small (flip a boolean,
filter an array, push an object) but genuinely worth pinning: `addSubtaskCore` truncates to 300
characters and unconditionally clears the parent task's `repeat` on every successful add
(subtasks and repeat are mutually exclusive in the UI) — but does neither when the trimmed
input is empty, matching the original's exact `if(!val)return` ordering (clearing repeat only
after confirming something was actually added). `subUid` (from the already-generated
`hubGenerateId` block) is referenced via the `declare function` ambient pattern, not DI — the
correct choice here since it's an already-generated block, unlike `templatesApply.ts`'s
`makeNode` which is hand-written. 15 new unit tests, all passing first run, including the
empty-input/repeat-preservation edge case and 300-character truncation. New
`tests/e2e/generated-hubsubtasks-smoke.spec.ts` opens a real task detail sheet via the real
`openTaskDetail()`, adds/toggles/removes a subtask through the real DOM (not direct core calls),
and confirms both in-memory state and the real `localStorage` entry reflect each step — plus the
standard distant-function-still-callable check, now proven for `hub.html`'s own script scope.

**Fourth Hub feature-domain slice: `src/state/hubReminders.ts`** — `computeDueRemindersCore`.
The last domain flagged as "not investigated" in `hubTodos.ts`'s own header. The original's
`checkDueReminders()` fused three things in one `forEach`: pure filtering (skip done/no-due-
date/not-yet-due tasks, dedup by "already notified today"), the real `new Notification(...)`
construction, and its `onclick` handler (`window.focus()`, `openTaskDetail()`). Extracted only
the filtering/dedup logic — computing which tasks need a reminder and the exact title text
(`"Overdue: X"` / `"Due today: X"`) — leaving the real Notification construction and click
wiring hand-written in the wrapper, same split as every prior slice. One behavior deliberately
preserved rather than "improved": the original marks a task as notified for today
UNCONDITIONALLY after the `try{ new Notification(...) }catch(e){}` block, even if the
constructor itself throws — so a task that fails to notify still won't be retried until
tomorrow. The core function can't know whether the real constructor will throw (that's the
wrapper's job), so it always marks every task it decides is due as notified in the map it
returns, matching the original's actual behavior. 12 new unit tests, all passing first run,
including the never-mutates-the-input-map check and the multi-task ordering/mixed-eligibility
case. New `tests/e2e/generated-hubreminders-smoke.spec.ts` calls the real, unchanged
`checkDueReminders()` wrapper with a spy `Notification` constructor installed (a fresh headless
browser context never has real notification permission, so `remindersEnabled()` — a real
top-level `function` binding — is reassigned to bypass that gate rather than mocking the
extracted core itself) — confirms the real wrapper constructs the right title/tag, dedups a
second same-day call, and that the real `onclick` handler it attaches correctly calls the real
`openTaskDetail()`/`window.focus()`/`n.close()`.

All four of Hub's real feature domains (confirmed earlier as only these two panels, To-Dos and
Journal — see the correction note above) now have their non-DOM logic extracted at every layer
this project's discipline reaches: storage, subtask CRUD, and reminder checking. Remaining Hub
work is genuinely DOM-dependent (rendering, rich-text stripping) and stays hand-written by
design, not by omission.

**First slice of Diagrams' larger remainder: `src/state/diagramDisplayList.ts`** —
`computeDiagramDisplayListCore`/`computeDiagramCanReorderCore`. Investigation of the `diagram*`
domain (102 top-level functions matching that name pattern, the large majority in a genuinely
separate `diagramGen*` XML/canvas-layout-generation subsystem — 32+ functions on their own,
deliberately NOT touched here, a real future scoping session) found `getDiagramDisplayList()`/
`diagramCanReorder()` were the closest match to this project's established narrow-slice shape:
pure filter/sort/pin logic over the `diagrams` array plus UI filter state, structurally similar
to `nodeSearch.ts`/`tabOrder.ts`'s own earlier revisits. `isDiagramOrphaned`/
`diagramNeedsAttentionCore` (already a generated block, `diagramAnchor.ts`) are referenced via
the established `declare function` ambient pattern; `diagramStatusOf`/`diagramStatusLabel` are
trivial hand-written one-liners (not a generated block), so their equivalent logic is inlined
directly into the new module instead, same precedent as `nodeSearch.ts` inlining
`escapeRegExpLiteral`.

**A real bug caught by the generator/build pipeline before merge, not by chance:** the new
module's first draft declared a private module-level `const DIAGRAM_STATUSES` — colliding with
index.html's own already-existing top-level `const DIAGRAM_STATUSES` (a hand-written array used
by several sibling diagram functions). Every generated block shares one script scope with the
rest of index.html, so this was a duplicate `const` declaration — a hard `SyntaxError` that
silently killed the ENTIRE script the moment the page loaded, not just this one function
(exactly the catastrophic failure mode `templatesIndex.ts`/`aiProviders.ts`'s own headers warn
about for storage-key constants). Caught immediately by the new e2e test failing with
`getDiagramDisplayList is not defined` — traced via a direct headless page-load check showing
the real `PAGEERROR: Identifier 'DIAGRAM_STATUSES' has already been declared`. Fixed by renaming
the module's private constants to `_DIAGRAM_STATUS_ORDER`/`_DIAGRAM_STATUS_LABELS`, the same
underscore-prefixed-private convention already used elsewhere for exactly this reason. A
reminder that every new module-level identifier needs a real collision check against the rest
of the target file before it's assumed safe — grep alone would have caught this before the test
run did.

21 new unit tests, all passing after the fix, including: never mutating the input `diagrams`
array, the search filter matching title OR status label, the "needs attention" filter never
matching a whiteboard, both sort modes (including an unknown/missing status sorting as
`'draft'`, and a missing `modifiedAt` sorting as `0`), the whiteboard-pin running only after the
search filter (so a whiteboard that doesn't match an active search stays excluded, not pinned
anyway), and all four of `diagramCanReorder`'s conditions independently. New
`tests/e2e/generated-diagramdisplaylist-smoke.spec.ts` exercises the real, unchanged
`getDiagramDisplayList()`/`diagramCanReorder()` wrappers against a real `diagrams` array and
real UI filter-state globals, plus the standard distant-function-still-callable check.

Deliberately excluded from this slice, per the scoping note above: `diagramGen*`'s XML/canvas
layout-generation subsystem, diagram CRUD/editor DOM wiring, and `renderDiagramsList`/
`updateDiagramBulkBar`'s own DOM construction — all left for dedicated future investigation, not
attempted here.

**First slice of `diagramGen*` itself: `src/core/diagramGenDims.ts`.** Of the ~32 `diagramGen*`
functions making up the deterministic tree-diagram generator ("Generate rough diagram from
outline"), investigation found five with zero DOM/canvas/measurement-API dependency and zero
reliance on the generator's own mutable traversal state (`nodes`, `nodeMeta`, id counters) —
`diagramGenHardTruncate` (text truncation), `diagramGenLighten` (hex color blend toward white),
and `diagramGenAdjustDimsForShape`/`diagramGenBoxDims`/`diagramGenMergedBoxDims` (label-fit box
sizing, estimated from character count rather than real canvas text measurement, so accurate to
extract without a browser). The much larger XML-emission/tree-layout/color-assignment/AI-
classification remainder (~27 functions) is still a genuinely separate, dedicated future scoping
session — not attempted here.

Lives in `src/core/` rather than `src/state/`, despite touching neither `nodes` nor `diagrams`:
the project's real core/-vs-state/ distinction is DI style (per-call-parameter vs.
`initXState(deps)` singleton — see `templatesApply.ts`'s own header), not nodes-touching. These
five have even less coupling than `templatesApply.ts` — no injected dependencies at all, every
input is a plain argument — but that's the `core/` shape with the DI step skipped entirely since
there's nothing to inject.

`diagramGenAdjustDimsForShape`/`diagramGenBoxDims`/`diagramGenMergedBoxDims` were originally
~500 lines away from `diagramGenHardTruncate`/`diagramGenLighten` in index.html — per this
project's "generator splices one contiguous block" constraint, relocated next to them in a
separate pure-code-motion commit first. That relocation caught its own near-miss: the
hand-written `DIAGRAM_GEN_PALETTE` const (unrelated to this slice) sat between
`diagramGenHardTruncate` and `diagramGenLighten`, which would have broken contiguity for the
generated block — moved ahead of `diagramGenHardTruncate` instead, before the marker/generator
work began, so the actual generated-block region ended up genuinely contiguous.

`DIAGRAM_GEN_MIN_W`/`MAX_W`/`PAD`/`CHAR_PX`/`ONE_LINE_H`/`TWO_LINE_H` are index.html's own
top-level consts, also read by hand-written code this slice doesn't touch (`diagramGenTrimText`'s
AI-shortening path, `DIAGRAM_GEN_CHAR_BUDGET`'s own computation) — so they couldn't be relocated
out of index.html entirely. Duplicated as private literals in the module instead, same precedent
as `diagramDisplayList.ts` duplicating `DIAGRAM_STATUSES`: every generated block shares one
script scope with the rest of index.html, so reusing the real names would be a duplicate
top-level `const` — the same SyntaxError-kills-the-whole-script failure mode documented
elsewhere in this file. A real collision check (grep, not just "it's underscore-prefixed") was
run against the rest of index.html for all five new private consts and all five new `*Core`
function names before treating them as safe, same discipline `diagramDisplayList.ts`'s own
`DIAGRAM_STATUSES` near-miss established.

67 new unit tests (46 pure logic + oracle-comparison, one test-authoring mistake caught before
commit — a miscounted truncation cut point in a hand-written expectation, not a real bug in the
extracted code, fixed by recounting against the actual algorithm). New
`tests/e2e/generated-diagramgendims-smoke.spec.ts` exercises the real, unchanged
`diagramGenHardTruncate`/`diagramGenLighten`/`diagramGenAdjustDimsForShape`/`diagramGenBoxDims`/
`diagramGenMergedBoxDims` wrapper functions directly, plus the standard distant-function-still-
callable check.

**Second slice of `diagramGen*`: `src/state/diagramGenTopology.ts`.** The pure topology/
confirmed-nodeMeta query layer — 15 functions answering "what does this node's position in the
render tree actually look like" once nodeMeta has been confirmed via the review screen:
`diagramGenIsContainer`/`IsSequence`/`IsHorizontal` (nodeMeta field reads), `diagramGenAllChildIdxs`/
`ChildIdxs`/`IsLeaf`/`IsChainGroup`/`HasEdgeLabelTag` (raw tree-topology queries),
`diagramGenChainHeaderSuppressed`/`IsConfirmedEdgeLabel`/`IsPassthrough`/`IsMergeCandidate`
(per-node classification against confirmed nodeMeta), and `diagramGenRenderChildIdxs`/
`ChainTailIdx`/`EdgeLabelBefore` (the render-filtered child list the actual XML-emission pass
consumes, recursive through passthrough/sequence chains). `diagramGenProposeNodeMeta`/
`diagramGenValidateGuideline`/`diagramGenLegend*` (the review-screen proposal/validation/legend
layer — classification heuristics and AI-response validation, a different concern) are
deliberately excluded, not attempted in this pass.

Lives in `src/state/`, not `src/core/` — this is Diagrams-domain logic reading the outline
`nodes` array read-only for context, not outline-mutation-domain logic itself, matching
`diagramAnchor.ts`/`diagramDisplayList.ts`'s own placement (`diagramGenDims.ts` is the one
`core/` exception among this subsystem's slices, and only because it has zero `nodes` coupling
at all — see its own header).

Like the first `diagramGenDims.ts` slice, three of the fifteen target functions
(`diagramGenIsContainer`/`IsSequence`/`IsHorizontal`) were ~320 lines away from the rest
(`diagramGenAllChildIdxs` onward) in index.html — relocated next to them in a separate
pure-code-motion commit first, since function declarations are hoisted so physical order never
affected runtime behavior.

**The generator's own collision checker (added in an earlier PR specifically to catch this bug
class) caught a real mistake before it ever reached index.html.** The module's first draft
duplicated `DIAGRAM_GEN_MAX_W`/`PAD`/`CHAR_PX` as private consts (to compute its own copy of
`DIAGRAM_GEN_CHAR_BUDGET`, needed by `diagramGenEdgeLabelBeforeCore`'s AI-shortening-truncation
call) — using the exact same private names `diagramGenDims.ts` had already claimed for the same
purpose. `npm run generate` refused to run, listing the three colliding identifiers by name.
Fixed by duplicating only the single derived value this module actually needs
(`_DIAGRAM_GEN_TOPOLOGY_CHAR_BUDGET = 66`) under a module-scoped private name, rather than the
three separate inputs — narrower, and avoids the collision entirely rather than needing a
same-purpose-different-name workaround. `getSubtreeEnd`/`getParentIndex` (from `nodeQueries.ts`),
`stripSemanticMarkers` (from its own Phase 1 block), and `diagramGenHardTruncateCore` (from this
subsystem's own first slice) are referenced via `declare function`, all already-generated
blocks; `getNodePlainText` (a hand-written one-liner wrapping `stripSemanticMarkers`, not itself
generated) is inlined as a private helper instead, same precedent as `diagramGenDims.ts`/
`nodeSearch.ts`/`diagramDisplayList.ts` inlining their own trivial hand-written dependencies. A
real collision check (grep against the rest of index.html and every other module) was run for
every new identifier — including the two non-exported private helpers, which still compile to
top-level declarations sharing the same script scope — before treating any of them as safe.

38 new unit tests, including an oracle-comparison suite run across 5 representative tree shapes
(nested depths, chain groups, confirmed/unconfirmed edge labels, sequences). Five of the
hand-written test expectations were wrong on the first pass — not bugs in the extracted logic,
which is a verbatim copy, but genuine misunderstandings of the original's own edge-label/
merge-candidate interaction (e.g. a real leaf sibling can itself become a merge candidate once an
edge-label sibling is excluded, and a passthrough child that doesn't consume a pending edge-label
lets it carry through to the next real child instead) — traced by hand against the original logic
and fixed before commit. New `tests/e2e/generated-diagramgentopology-smoke.spec.ts` exercises the
real, unchanged wrapper functions against a real `nodes` array and real `nodeMeta` Map, plus the
standard distant-function-still-callable check.

**Third slice of `diagramGen*`: `src/state/diagramGenNodeMeta.ts`.** The nodeMeta
classification-proposal and plain-object (de)serialization layer: `diagramGenProposeNodeMeta`
(seeds the review screen's first classification pass — a structural default of sequence+container
for a flat run of 2+ leaf children, plus a shape guess from a legacy `#edge-label` tag or a
`DIAGRAM_GEN_TAG_SHAPE_MAP` keyword match, never applied silently — everything downstream in
`diagramGenTopology.ts` reads only confirmed nodeMeta), and `diagramGenNodeMetaFromPlain`/
`ToPlain` (the plain Map<->JSON-object bridge used when persisting/loading a diagram's confirmed
nodeMeta). `diagramGenValidateGuideline` (AI-response validation, currently unused/dead code kept
for a future AI pass) and `diagramGenLegend*` (legend-XML generation) remain deliberately
excluded — different concerns, not attempted in this pass either.

Lives in `src/state/`, matching every other Diagrams-domain slice in this subsystem. The three
target functions were already contiguous in index.html — no pure-code-motion commit needed this
time, unlike the first two `diagramGen*` slices.

`diagramGenChildIdxsCore`/`diagramGenIsChainGroupCore`/`diagramGenHasEdgeLabelTagCore` (from
`diagramGenTopology.ts`, this subsystem's own second slice, already generated) are referenced via
`declare function`. `DIAGRAM_GEN_TAG_SHAPE_MAP` (index.html's own top-level const, verified via a
real grep to have exactly one other reader — `diagramGenProposeNodeMeta` itself) is duplicated as
a private literal, same reasoning as every other duplicated-constant precedent in this subsystem.

18 new unit tests, including a full round-trip test (`ToPlain` then `FromPlain` preserves every
entry). New `tests/e2e/generated-diagramgennodemeta-smoke.spec.ts` exercises the real, unchanged
wrapper functions — including the `ToPlain`/`FromPlain` round trip — against a real `nodes`
array, plus the standard distant-function-still-callable check.

**Fourth slice of `diagramGen*`: `src/state/diagramGenColors.ts`.** The pure branch/tag/marker
color-assignment layer, two functions: `assignDiagramGenColors` walks the render tree (via
`diagramGenTopology.ts`'s already-generated `diagramGenRenderChildIdxsCore`) assigning a palette
key to every node — multi-root docs get a cycled branch color per root; a tag on a node (or
inherited from a tagged ancestor) overrides branch color; an explicit node marker outranks both.
`diagramGenTagColorKey` (its sole caller, verified via grep) hashes a tag string to a
deterministic reserved hue, extracted alongside it in the same module.
`diagramGenLegend*`/`diagramGenValidateGuideline` remain deliberately excluded — different
concerns, not attempted in this pass either.

`diagramGenTagColorKey` (its only caller) and `assignDiagramGenColors` were separated by
`pickDiagramGenScope` in index.html — relocated next to each other in a separate
pure-code-motion commit first, same discipline as every prior slice.

`diagramGenRenderChildIdxsCore`/`diagramGenIsSequenceCore` (from `diagramGenTopology.ts`,
already generated) are referenced via `declare function`.
`DIAGRAM_GEN_TAG_CYCLE`/`DIAGRAM_GEN_BRANCH_CYCLE`/`DIAGRAM_GEN_MARKER_COLOR` (small constants,
also read by hand-written code this slice doesn't touch) are duplicated as private literals,
same precedent as every prior slice.

**A real type-accuracy bug caught before it caused a subtle production issue, not by luck.**
The module's first draft declared its own `ColorAssignNode` interface without a `depth` field —
compiled clean (TypeScript had no way to know the `declare function` ambient signatures for
`diagramGenRenderChildIdxsCore`/`diagramGenIsSequenceCore` actually require `depth` internally,
since those signatures were typed against the same too-narrow interface). Direct debugging when
early unit tests returned unexpectedly empty results traced it to `diagramGenAllChildIdxsCore`
(several layers down the call chain) silently receiving `undefined` for every node's depth.
Fixed by adding `depth: number` to `ColorAssignNode`. In the real app this would have worked by
accident (index.html's real node objects always carry `depth`), but the module's own type
contract was lying about what it actually needed — exactly the kind of drift this project's
TypeScript adoption exists to catch before it does matter.

11 new unit tests. Four were initially wrong for a different, well-established reason (not a bug
in the extracted code): a lone real leaf sibling with no shape/container folds into its parent as
a merge candidate and never gets its own render slot or color (see `diagramGenTopology.ts`'s own
tests for the same rule) — fixed by giving the relevant test node an explicit `shape` in
nodeMeta, which disqualifies it from merge-candidate exclusion, rather than changing the
extracted logic. New `tests/e2e/generated-diagramgencolors-smoke.spec.ts` exercises the real,
unchanged wrapper functions against a real `nodes` array, plus the standard
distant-function-still-callable check.

**Immediate follow-up, same module: `applyDiagramGenShapeColorOverridesCore`.** A small,
self-contained companion — runs after `assignDiagramGenColorsCore`, mutating its `colorByIdx`
output in place with AI-classified shape colors once a real shape classification exists anywhere
in scope (a no-op otherwise), with an explicit node marker still outranking shape here too. Added
directly to `diagramGenColors.ts` (same file, same generated block, no new markers) rather than
its own module, since it's a direct, small companion sharing the same domain and one of the same
duplicated constants (`DIAGRAM_GEN_MARKER_COLOR`); a new `DIAGRAM_GEN_SHAPE_COLOR` duplicate was
added alongside it, collision-checked the same way as every other duplicated constant in this
subsystem. No separate pure-code-motion commit was needed this time — the hand-written function
was removed outright and replaced by a generated wrapper, rather than needing to stay physically
in place while the generator was wired around it (the code-motion constraint only applies when
existing hand-written code must remain contiguous with itself before extraction; here there was
nothing to preserve in situ). 7 more unit tests (18 total in the file now) and a second `test()`
added to the existing `generated-diagramgencolors-smoke.spec.ts` (same generated block, no new
file), following this project's established "second test on a follow-up to an already-tested
block" precedent.

**Fifth slice of `diagramGen*`: `src/state/diagramGenLayout.ts`.** `layoutDiagramGenTree` — the
pure tree-layout engine: bottom-up subtree-width computation, then top-down x/y assignment, using
each node's own (label-derived) box dims rather than one fixed size throughout. A chain group's
column width is the widest box among the group members, so shorter step boxes still center under
the parent. Driven entirely by confirmed `nodeMeta.sequence`/`.direction` — a sequence's
width/placement always recurses into each child's own subtree, working identically whether that
child is a bare leaf or has its own further structure, so one code path covers both what used to
be "chain group" and "numbered sequence" as separate cases. Genuinely pure layout math: a
`Map<idx, {x,y}>` computed entirely from `scope`, the caller's already-computed `dimsByIdx` (from
`diagramGenDims.ts`'s own functions), and confirmed `nodeMeta` — no DOM, no canvas measurement,
no randomness.

`generateDiagramFromOutline` (the Generate-button entry point) and `diagramGenFinishGenerate`
(the actual XML-emission renderer that calls this layout function) remain deliberately excluded
— both are real orchestration (DOM, `diagrams` array mutation, AI calls, XML string assembly),
not pure logic, and are a much larger future scoping question of their own.

Already an isolated, self-contained function in index.html (unlike the first four `diagramGen*`
slices, none of its own logic was interleaved with anything else) — no pure-code-motion commit
needed this time.

`diagramGenRenderChildIdxsCore`/`diagramGenIsSequenceCore`/`diagramGenIsHorizontalCore`/
`diagramGenChainHeaderSuppressedCore` (from `diagramGenTopology.ts`, already generated) are
referenced via `declare function`. `DIAGRAM_GEN_GAP_X`/`DIAGRAM_GEN_GAP_Y`/
`DIAGRAM_GEN_GROUP_TITLE_GAP` (small numeric constants) are duplicated as private literals, same
precedent as every prior slice. The module's `LayoutNodeMetaEntry` type includes a `shape` field
it never reads directly — included for structural compatibility with the real, full nodeMeta
shape, since the ambient `diagramGenRenderChildIdxsCore` it delegates to DOES read `shape` for
merge-candidate/passthrough/edge-label exclusion; a caller passing the real nodeMeta Map needs
this to typecheck without a cast.

11 new unit tests, including a 4-tree oracle-comparison suite (fan-out, vertical sequence,
horizontal sequence, and a mixed container+sequence tree) pinned against a literal copy of the
original algorithm. One test needed the same merge-candidate-exclusion fix already established in
`diagramGenTopology.test.ts`/`diagramGenColors.test.ts` (a lone real leaf child with no
shape/container folds into its parent and never gets its own render slot or position) — not a bug
in the extracted code. New `tests/e2e/generated-diagramgenlayout-smoke.spec.ts` exercises the
real, unchanged `layoutDiagramGenTree` wrapper against a real `nodes` array, plus the standard
distant-function-still-callable check.

**Sixth slice of `diagramGen*`: `src/state/diagramGenRects.ts`.** `computeDiagramGenFinalRects` —
the pure final-rect/bounds computation: given the raw x/y `positions` from
`layoutDiagramGenTreeCore` and each node's box `dimsByIdx`, computes the final rendered
`{x, y, w, h}` rect for every node, snapped to a 10px grid in a center-preserving way and shifted
so the whole diagram's leftmost edge sits at a fixed 40px margin — plus `minX`/`maxX`/`maxY`/
`offsetX`, which `diagramGenFinishGenerate` needs later for the legend's x position and the
generated XML's overall page width/height. Genuinely pure math with **zero dependencies on any
other `diagramGen*` function or constant** — the only slice in this subsystem needing no
`declare function` ambient references at all.

**Unlike every prior slice, this was never a standalone named function in index.html** — an
inline fragment (`minX`/`maxX`/`maxY`/`snap10`/`offsetX`/`finalRect` computation) inside the much
larger `diagramGenFinishGenerate`. Two consequences: no pure-code-motion commit was possible or
needed (there was no self-contained function to relocate), and there's no original wrapper name
to preserve — the hand-written "wrapper" here is a single glue statement
(`const {finalRect,minX,maxX,maxY,offsetX}=computeDiagramGenFinalRectsCore(...)`) destructuring
the Core function's result into the exact same local names the rest of
`diagramGenFinishGenerate` already reads, so nothing downstream needed to change.

**A placement mistake caught and corrected before commit, not shipped.** The first attempt
placed the `GENERATED:diagramGenRects` markers *inside* `diagramGenFinishGenerate`'s own body
(between two of its statements), rather than at top level like every other slice. This would
still have worked functionally (nested function declarations are hoisted within their enclosing
function), but breaks the subsystem's own established contract that every generated block shares
one top-level script scope — a nested block would give the collision-checker and every other
generated block's assumptions about ambient global availability an inconsistent case to reason
about. Caught via a straightforward marker-position check before running the generator at all;
fixed by moving the markers to top level, immediately before `diagramGenFinishGenerate` itself,
matching every other slice's placement — the glue statement stayed inside the function body,
unchanged.

9 new unit tests, including an oracle-comparison suite across 3 representative position/dims
combinations, pinned against a literal copy of the original fragment. New
`tests/e2e/generated-diagramgenrects-smoke.spec.ts` calls the real, generated
`computeDiagramGenFinalRectsCore` directly by name (no wrapper exists to call instead), plus an
end-to-end check that a real `diagramGenFinishGenerate` call still produces well-formed XML
(inspected via the real `diagrams` array it pushes to as a side effect, since the function itself
has no return value) — proving the glue statement resolves correctly through the real
orchestration, not just in isolation.

**Decision Log domain — first slice: `src/state/decisionLog.ts`.** A domain not touched
anywhere else in this migration. `normalizeDecisionLog` validates and coerces an arbitrary raw
object (an imported/restored document's raw JSON, or legacy data from before decision logs were
split into their own top-level array — see `migrateNodeDecisionLogsToArray`'s own comment) into
a safe, well-typed shape: every string field defaults to `''` if not a string, `status` is
whitelisted against the three known statuses (defaulting to `'proposed'`), and `timestamp`
defaults to `null` unless it's a genuine finite number. Called from `normalizeNode`'s own
decisionLog-field normalization — the one real call site.

Genuinely standalone: zero dependencies on any other function or constant, no `declare function`
ambient references needed, no pure-code-motion commit required. Sibling normalizers
(`normalizeStyles`/`normalizeCodeBlock`/`normalizeTags`, also called from `normalizeNode`) remain
hand-written — a different, adjacent domain (general node-field normalization), not attempted
here.

Investigation found several more Decision-Log-domain candidates worth a future slice:
`findDecisionLog`/`decisionLogForNode` (pure array lookups over the `decisionLogs` array, the
latter enforcing the app's one-decision-log-per-node rule), `decisionStatusLabel`/
`decisionStatusOf` (trivial status label/whitelist helpers), and `decisionLogAnchorLabel` (near-
identical in shape to `diagramAnchor.ts`'s already-extracted `computeDiagramAnchorLabel` — same
`declare function` reference to `stripSemanticMarkers` would apply). `decisionRowSnippet`/
`getDecisionAnchorCandidates` read `nodes` and call the DOM-dependent `stripHtmlToText` — a
different concern, not attempted here.

10 new unit tests. New `tests/e2e/generated-decisionlog-smoke.spec.ts` exercises the real,
unchanged wrapper function plus its one real call site (`normalizeNode`), and the standard
distant-function-still-callable check.

**Decision Log domain — second slice: `src/state/decisionLogQueries.ts`.** The pure lookup/
anchor-label/status-query layer: `findDecisionLog`/`decisionLogForNode` (pure lookups over the
top-level `decisionLogs` array — the latter additionally enforcing the app's
one-decision-log-per-node rule, used both by the anchor picker and by `createDecisionLog`'s
"reuse the selected node if it's free" shortcut, so every path that assigns an anchor goes
through the same check), `decisionStatusLabel`/`decisionStatusOf` (trivial status
capitalize-or-default / whitelist-or-default helpers), and `decisionLogAnchorLabel` — near-
identical in shape to `diagramAnchor.ts`'s already-extracted `computeDiagramAnchorLabel` (same
three-way branch: never linked / linked-but-node-deleted / linked-with-text, same 60-character
truncation, same `declare function` reference to `stripSemanticMarkers`).
`decisionRowSnippet`/`getDecisionAnchorCandidates` (which call the DOM-dependent
`stripHtmlToText`) remain deliberately excluded — a different concern, not attempted here.

Already contiguous in index.html, no pure-code-motion commit needed.

**A real cross-module collision caught before ever running the generator, not by luck.** The
module's first draft duplicated `DECISION_STATUSES` under the exact same private name
(`_DECISION_STATUSES`) that `decisionLog.ts` (this domain's first slice, already merged) had
already claimed for the identical purpose — both are generated blocks sharing one top-level
script scope, so this would have been a duplicate top-level `const`. Caught via a real grep
against every other module's identifiers before wiring this file into the generator at all (the
same discipline established after `diagramGenTopology.ts`'s own cross-module collision with
`diagramGenDims.ts`) — fixed by renaming to `_DECISION_STATUSES_QUERIES` before the generator
ever ran, so `npm run generate` never had a chance to fail on it.

16 new unit tests. New `tests/e2e/generated-decisionlogqueries-smoke.spec.ts` exercises the real,
unchanged wrapper functions against real `decisionLogs`/`nodes` global state, plus the standard
distant-function-still-callable check.

Not yet started in Phase 3: Journal's rich-text stripping display logic (genuinely DOM-
dependent), the rest of Diagrams' `diagramGen*` generation subsystem (the remaining XML-cell
string assembly inside `diagramGenFinishGenerate`, `generateDiagramFromOutline`/
`diagramGenFinishGenerate` orchestration as a whole, AI classification, plus
`diagramGenValidateGuideline`/`diagramGenLegend*`), the rest of the Decision Log domain
(DOM-dependent row/candidate helpers — `decisionRowSnippet`/`getDecisionAnchorCandidates`), CRUD/
editor DOM wiring, Export, and the rest of the Templates domain (rendering, sync).

**`core/` module boundary — started.**
The real architectural fork the previous paragraph left open — keep picking off narrow,
storage-layer-only slices domain by domain, or invest in scoping a real `core/` module boundary
for `nodes`/`render()` directly — was decided: the boundary work started, on the reasoning that
continued narrow slices avoid the actual bottleneck rather than address it, and every remaining
Phase 2 candidate and every DOM/node-coupled half of Phase 3's domains stays stuck without it.

First slice: `src/core/nodeMutations.ts` — `canIndentAt`/`indentRootIndexes`/
`outdentRootIndexes`. A genuinely different kind of extraction than anything before it.
`nodeQueries.ts` worked because its 13 functions had zero side effects — pure relocation was
enough. Every mutation function in `index.html` (`insertSiblingBefore`, `moveNodeBlock`,
`pasteParsedNodes`, `handleDrop`, etc.) fuses pure state mutation with orchestration — undo-stack
pushes, dirty-flag marking, selection updates, `render()` calls, sometimes edit-mode triggers —
in the same lines, with no seam to relocate along. Extracting any of them means DECOMPOSING into
a pure state-transition plus the orchestration that calls it: real editing-logic surgery on a
production app with live user documents, not a mechanical move.

Given that risk, this started with the single simplest, lowest-risk candidate available:
indent/outdent. Pure depth-array mutation — no text-splitting, no clipboard, no drag-and-drop
edge cases — chosen specifically to prove the decomposition pattern holds before attempting
anything with a larger blast radius (move, paste, split, and delete are all real candidates for
later slices, each with its own higher-risk edge cases to work through). The extracted functions
preserve the original's mixed-depth partial-outdent behavior exactly — a root already at depth 0
is individually skipped, not an all-or-nothing guard for the whole call — verified with a
dedicated oracle test for that specific edge case.

Scoped deliberately narrow after checking real numbers, the same way every slice in this project
has been: `getSelectionRootIndexes`/`getSelectedIds`/`rebuildParentIds` are shared by far more
than indent/outdent (13/18/23 real call sites respectively, across `moveSelected`/
`moveNodeBlock`/`pasteParsedNodes`/`handleDrop`/`deleteSelected` and more) — extracting them now
would have meant updating every one of those call sites in the same slice, blowing well past
"the simplest possible first case." They stay hand-written; the orchestration wrapper
(`indentSelected`/`outdentSelected`, still hand-written, only their inner depth-mutation loop
replaced with calls into the new core functions) computes `rootIndexes` with them exactly as
before and passes the result in as a plain parameter.

This slice also established a new, reusable pattern for referencing an already-spliced
generated block's functions from a NEW generated block, without repeating the
`serializeMarkdown` cutover's mistake: `getSubtreeEnd` (from `nodeQueries.ts`) is referenced via
a bare `declare function` — a type-only declaration, verified via a minimal compile repro to
produce zero runtime JS emission, resolving at runtime to the real already-spliced function since
every generated block shares one script scope. This is deliberately NOT a real value import,
which would survive compilation as a literal `import` statement and silently kill the entire
script the way `serializeMarkdown.ts`'s did. The node-shape type (`QueryableNode`) IS a genuine
`import type` from `nodeQueries.ts` — fully erased, same reasoning as `nodeQueries.ts`'s own
`import type` reference to `serializeMarkdown.ts`'s types — reused rather than redefining an
equivalent interface.

New `tests/e2e/generated-nodemutations-smoke.spec.ts` exercises three layers: the pure functions
directly (including the mixed-depth edge case), the real orchestration wrappers against real app
state (confirming `pushUndo`/`markDirty`/`rebuildParentIds`/`render` all still fire — checking
undo-stack growth and `parentId` recomputation, not just the depth values), and the same
"unrelated, physically distant function still callable" check used since the `serializeMarkdown`
cutover to catch a script-killing regression before merge, not after.

Not yet started: move, paste, split, delete — the higher-risk mutation operations — and the
shared selection-computation helpers (`getSelectionRootIndexes`/`getSelectedIds`/
`rebuildParentIds`) this slice deliberately left hand-written. Each is a real next candidate,
likely in roughly that order (lowest to highest risk), each needing its own investigation into
what pure/orchestration seam actually exists before committing to a scope.

**Second slice: `moveSelected` (keyboard-driven reorder).** Added to the same
`src/core/nodeMutations.ts` file (same conceptual domain) rather than a new one — `canMoveUpAt`/
`canMoveDownAt` (pure guards, relocated with an explicit `nodes` parameter) and `moveNodeUp`/
`moveNodeDown` (pure mutation — splices the subtree rooted at `idx` past its adjacent sibling's
*entire* subtree, not just the sibling node, returning the moved root's `id` for `selectedId`
tracking). Chosen as the next-lowest-risk candidate after indent/outdent: still no
text-splitting or clipboard interaction, but real array-splice repositioning logic, one step up
in complexity.

Tight call-site impact, same discipline as every slice before it: only 2 real sites changed
(`canMoveUpAt`/`canMoveDownAt`, both inside `moveSelected`'s own body) — `moveSelected` itself
has 7 call sites elsewhere but stays hand-written as the orchestration wrapper, so none of those
needed to change. Two guard checks in `moveSelected` (`idx===0`, `end>=nodes.length`) were
already redundant with what `canMoveUpAt`/`canMoveDownAt` check internally — traced through and
confirmed, then preserved exactly as-is rather than simplified away, to avoid any
behavior-adjacent change outside this extraction's scope.

Deliberately excludes `moveNodeBlock`/`moveMultipleNodeBlocks`/`handleDrop` (drag-and-drop
reordering) — a substantially more complex superset of what `moveSelected` does (multiple modes
— above/below/child/end — depth remapping, descendant-of-target checks, multi-block moves) —
left for its own later, more carefully scoped slice.

Not yet started: drag-and-drop move, paste, split, delete, and the shared selection-computation
helpers this and the indent/outdent slice both deliberately left hand-written.

**Third slice: drag-and-drop move.** `isDescendantIndex`/`moveNodeBlockCore`/
`moveMultipleNodeBlocksCore`, added to the same `src/core/nodeMutations.ts` file. Meaningfully
more complex than the prior two slices — 4 modes (above/below/child/end), depth remapping with
a defensive floor, a descendant-of-target rejection guard, and a genuinely tricky multi-block
algorithm (extract every dragged block's position before any removal, remove last-to-first so
earlier blocks' indexes stay valid, re-resolve the target index after removal since ids stay
stable across splices but indices don't) — the complexity the previous slice's own "deliberately
deferred" note anticipated.

Turned out lower-risk on the call-site side than the internal complexity suggested:
`moveNodeBlock`/`moveMultipleNodeBlocks` were already nearly isolated — each has exactly one
real external caller (`handleDrop`), confirmed via call-site counts before starting (2 total
occurrences each = definition + one real call). Only one other real call site needed updating:
`isDescendantIndex`'s use inside the `dragover` DOM handler's live drag-validity check. Same
convention as every prior slice: the three new core functions mutate `nodes` in place and report
success/failure (a boolean, or the surviving dragged ids on success/`null` on rejection), without
touching `rebuildParentIds()` or any selection state — those stay in the now-thin hand-written
orchestration wrappers. `handleDrop` itself (`pushUndo`/`markDirty`/`clearDragIndicators`/
`dragState` reset/`render`/`showToast`, plus its own `undoStack.pop()` rollback on a rejected
move) is untouched — it already treated `moveNodeBlock`/`moveMultipleNodeBlocks` as a black box
and still does.

19 new oracle-backed unit tests covering all 4 modes, the subtree-moves-together case, all 4
single-block rejection guards, and 5 more for the multi-block function (including
argument-order-independent re-sorting by document position, and the return value preserving
argument order rather than position order). New e2e coverage calls `handleDrop` directly against
real app state: single-block move, an invalid multi-block drop that gets rolled back (confirming
the rollback itself really fires, not just that render still happens afterward), and a valid
multi-block drop — real array order, depths, undo-stack growth, `dragState` reset, and
`multiSelectedIds` all checked.

Not yet started: paste, split, delete — still ahead, likely in that order — and the shared
selection-computation helpers (`getSelectionRootIndexes`/`getSelectedIds`/`rebuildParentIds`/
`clearMultiSelection`) every slice so far has deliberately left hand-written.

**Fourth slice: paste insertion.** `computePasteOffsetDepth`/`insertParsedNodesCore`, added to
the same `src/core/nodeMutations.ts` file. Covers the depth-offset math and array-insertion
logic `pasteParsedNodes` needs to land pasted content as siblings of the node being edited,
rather than corrupting the tree structure by inserting depth-0 nodes mid-document.

Deliberately excludes `makeNode()` (node object construction — mints a fresh id from a global
`nextId` counter, 20+ other callers, a real side effect well outside this slice's scope) and the
decision-log/diagram `clipExtras` handling in `pasteParsedNodes` (a completely separate feature
domain, not part of the core outline engine at all). The core functions take already-built node
objects as input rather than building them, the same "pure functions receive fully-formed data,
orchestration wrappers do the side-effecting construction" split used for `makeNode` throughout
this module already (`indentSelected`/`moveSelected`/`handleDrop` never built node objects
either).

One real substitution worth noting for future slices: `insertParsedNodesCore` uses
`nodes.splice(0, nodes.length, ...mapped)` for the empty-document case, not the original's
`nodes=mapped` reassignment — a plain array parameter can't reassign the caller's own variable
binding the way a global assignment can, so this achieves the identical end state through the
same in-place-mutation convention every other function in this module already uses. Verified
with a dedicated test that the array reference itself is preserved, not just the resulting
contents — this is the first slice where the original code did a full reassignment rather than
an in-place splice, and it won't be the last time this substitution is needed.

Also confirmed a redundancy before relying on it, the same discipline as `canMoveUpAt`'s
redundant `idx===0` guard: the original's explicit `selectedId===null` check is mathematically
redundant with `insertIdx<0`, since node ids are always non-null numbers (verified via grep) —
`computePasteOffsetDepth` depends only on `insertIdx`, not `selectedId` itself.

8 new oracle-backed unit tests. New e2e coverage exercises the full orchestration path — a
depth-offset paste while editing a nested node (confirming pasted content lands at the right
depth), checking `pushUndo`/`markDirty`/`rebuildParentIds`/`render` AND the full selection-state
reset (`selectedId`/`selectAllMode`/`multiSelectedIds`/`selectionAnchorId`/`editingId`/
`flashNodeId`) — plus the empty-document replace case through the real orchestration wrapper.

Not yet started: split, delete — still ahead — and the shared selection-computation helpers
every slice so far has deliberately left hand-written.

**Fifth slice: delete — plus a real detour worth recording.** `split` (`splitNodeAtCursor`) was
assumed to be next per the ordering guessed above, but investigation showed it's genuinely dead
code: zero call sites anywhere, confirmed via exhaustive grep, not even indirect ones. The real
Enter-key handler (`onEditorKeyDown`) calls `insertSiblingAfter`/`insertChildFirst` instead,
never a text-split. Extracting dead code would mean no real orchestration path to test and no
actual user-facing risk being addressed — a materially weaker slice than anything done so far —
so it was skipped in favor of `deleteSelected`, which has 5 real call sites (confirmed via
call-site count before starting, same discipline as every prior slice). A good example of why
the "likely in that order" ordering guessed at the end of the previous slice's writeup was
explicitly a guess, not a plan: real investigation changes the plan when it should.

`deleteRootIndexes`, added to the same `src/core/nodeMutations.ts` file: removes each root
index's entire subtree, processing in reverse order so removing a later block never shifts the
array positions of an earlier not-yet-removed block (the same index-stability principle
`moveMultipleNodeBlocksCore` uses for its own removal step, simpler here since nothing needs
re-inserting afterward).

`deleteSelected` turned out to be the most cross-domain-entangled orchestration function of any
slice so far: its normal-delete path also cleans up an auto-rewrite AI queue, backlinks, and a
"featured tables" domain — three genuinely separate feature domains, not part of the core
outline engine at all, needing the deleted nodes' text/ids collected BEFORE the deletion so the
cleanups have the data they need afterward. None of that touched — `deleteRootIndexes` covers
only the actual subtree removal; the orchestration wrapper still collects that data and runs all
three cleanups in the same order as before, just calling the new core function instead of its
own inline reverse for-loop. `deleteSelected`'s OTHER branch (`selectAllMode`: clear the entire
document, reset `nextId`) is a fundamentally different, much simpler reset that doesn't go
through subtree removal at all — left entirely untouched, covered by its own e2e assertions to
confirm it still works correctly alongside the new core call in the same function.

5 new oracle-backed unit tests, including argument-order independence. New e2e coverage exercises
three real scenarios against live app state: a normal subtree delete (checking undo/dirty/
render/selection-fallback — landing on a remaining node, not `null`), the select-all clear-tree
branch, and the pure function directly with multiple disjoint subtrees in one call.

`src/core/nodeMutations.ts` now covers indent, outdent, keyboard move, drag-and-drop move,
paste, and delete — a substantial write-side complement to `nodeQueries.ts`'s read-only queries.

**Sixth slice: `src/core/nodeSelection.ts`** — `computeSelectedIds`/`computeSelectionRootIndexes`/
`rebuildParentIdsCore`. Originally flagged (both here and in `nodeMutations.ts`'s own header) as
the biggest remaining fork — "79 real call sites... extracting them would mean updating every
one of those call sites." That framing was wrong, caught on re-investigation: it conflated how
many places CALL a function with how many places need to CHANGE to extract it. Every one of the
three functions kept its original name and signature exactly, with index.html's
`getSelectedIds()`/`getSelectionRootIndexes()`/`rebuildParentIds()` becoming thin wrappers that
delegate to the extracted pure logic — the same pattern `nodeMutations.ts`'s own
`indentSelected()`/`outdentSelected()` wrappers already used around `indentRootIndexes`/
`outdentRootIndexes`. Zero of the 79 call sites needed to change; only the three function bodies
themselves moved. `clearMultiSelection` (the fourth function in the original list) stayed
hand-written — a genuine one-line ambient assignment with no logic to extract, same reasoning as
`getAllAiProviders` staying out of `aiProviders.ts`. `rebuildParentIdsCore` references
`getParentIndex` (from `nodeQueries.ts`) via the same `declare function` ambient-global pattern
`nodeMutations.ts` established. No name collisions found (checked all new module-level
identifiers against the rest of index.html). 24 new unit tests, all passing on the first run
against hand-written oracles pinned from the original inline logic. New
`tests/e2e/generated-nodeselection-smoke.spec.ts` exercises the wrappers through real editor
state — a real multi-select followed by a real `indentSelected()` call (which internally calls
`rebuildParentIds()` as part of its own orchestration) — rather than calling the extracted
functions directly, plus the standard "unrelated distant function still callable" check.

Not yet attempted for `core/`: nothing else has been identified as a comparably narrow next
slice — see Phase 3's status above for why Hub/Diagrams/Export don't currently offer one either.

**Seventh slice: `src/core/nodeSearch.ts`** — `computeSearchMatchIds`/`resolveSearchIndex`.
Revisits a Phase 2 candidate (outline search state) originally set aside as `nodes`-coupled,
before the `core/` pattern existed to make that coupling tractable. `computeSearchMatches`'s
actual matching logic (the whole-word-regex / case-sensitive / case-insensitive three-way
filter over `nodes`) turned out to already be pure and read-only — only the wrapping
assignments to `searchMatches`/`searchIndex` and the `updateSearchCount()` DOM call needed to
stay hand-written, same split as every other slice. `escapeRegExpLiteral` (a trivial one-line
hand-written helper, not itself a generated block, still used elsewhere by `replaceTextInNode`)
was inlined directly into the new module rather than referenced via `declare function` — that
ambient-reference pattern has so far only been used for functions from other ALREADY-GENERATED
blocks (`nodeQueries.ts`'s exports), not hand-written code, and wasn't worth extending for a
one-liner. One test-authoring mistake caught before commit, not a real bug: an initial test
asserted `\b` would match around a `$` character, which it can't (`$` isn't a word character, so
no word-boundary transition exists there) — fixed by picking a test case where the boundary
genuinely applies. 19 new unit tests, all passing (after that one fix) against a pinned oracle.
New `tests/e2e/generated-nodesearch-smoke.spec.ts` exercises the real, unchanged
`computeSearchMatches()` wrapper against a real multi-node tree — including a deliberately
stale/out-of-range `searchIndex` to prove `resolveSearchIndex`'s reset logic works through the
real call path, not just in isolation — plus the standard distant-function-still-callable check.

**Ninth slice, and the first of the "most promising, most novel" candidates flagged above:
`src/core/templatesApply.ts`** — `applyTemplateNodesCore`. Revisits the coupling
`templatesIndex.ts`'s own header originally flagged: `applyTemplateNodes` constructs nodes via
`makeNode()`, which mutates the shared `nextId` id-counter global as it goes
(`id: nextId++`). Unlike every prior generated block, which references already-extracted pure
logic via the `declare function` ambient-global pattern, `makeNode` is hand-written and used in
~30 other places in `index.html` unrelated to templates (paste, drag-and-drop, import) — not
itself a candidate for extraction, and the `declare function` pattern is reserved for
already-generated blocks. So this module takes the real `makeNode` and `emptyStyles` as
injected parameters instead — the first time a hand-written function has been injected as a
dependency rather than referenced ambiently, proving the pattern flagged as an open option in
lesson 4 of prior handoffs. Lives in `src/core/` (not `src/state/`) since it follows `core/`'s
per-call-parameter DI convention (matching `nodeMutations.ts`/`nodeSelection.ts`) rather than
`state/`'s `initXState(deps)` singleton — there is exactly one real call site
(`applyTemplateNodes`'s own wrapper body) passing deps directly, so a singleton would add
indirection for no benefit. The wrapper stays a thin pass-through: constructs `{makeNode,
emptyStyles}`, calls the core, assigns `nodes`/`nextId` from the result, then does
`rebuildParentIds()` and the selection reset by hand — same split every prior slice uses. 11 new
unit tests against a fake injected `makeNode` (a local id-minting counter standing in for the
real ambient one), covering defaulting, `isCheckbox`/`checked`/`tags` coercion, the
`emptyStyles()` fallback only firing when a raw node has no `styles`, and `nextId` being purely
derived from the ids the injected `makeNode` actually returned (never tracked independently).
New `tests/e2e/generated-templatesapply-smoke.spec.ts` calls the real `applyTemplateNodes()`
wrapper directly (not through `loadTemplateById()`, which also touches an unrelated
`#templates-menu` DOM element not relevant to this slice) with a seeded high `nextId`, confirming
fresh ids are really minted by the real `makeNode` rather than stale/hardcoded, that
`rebuildParentIds()` correctly derives `parentId` from `depth` afterward, and that the dirtied
selection state is genuinely reset — plus the standard distant-function-still-callable check.

**Deliberately excluded from this slice — `applyBuiltinDefaultTemplate`.** ~20 sequential
`makeNode` calls building a fixed 15-node tree with intermediate `.id` references for parenting.
Same DI pattern would apply, but transcribing that exact call sequence correctly is far more
failure-prone (a single reordered `push` silently changes the tree shape) than this module's
single `.map()` — left for a dedicated follow-up slice now that the injected-hand-written-
function pattern has a track record. `applyDefaultTemplate` itself is trivial branching
orchestration (custom-template path via `applyTemplateNodes`, or built-in path via
`applyBuiltinDefaultTemplate`) with no logic of its own to extract.

**Immediate follow-up: `applyBuiltinDefaultTemplate` turned out to need no new source at all.**
Before writing a second DI'd core, investigation checked whether the function's explicit
`.id`-based parenting (`makeNode('UI Layer',1,root.id)`, etc.) actually matters. It doesn't:
the function's own trailing `rebuildParentIds()` call unconditionally overwrites every node's
`parentId` from `depth` alone (`getParentIndex`'s nearest-preceding-node-at-depth-minus-1
scan) — verified byte-for-byte against the original's explicit parentIds before touching
production code (a small standalone script reproducing both the original construction and the
depth-derived rebuild, confirmed identical parentId arrays across all 16 nodes). Once the
explicit parenting is known to be dead, the whole function collapses to exactly the flat
`{text, depth, styles}` shape `applyTemplateNodesCore` already handles. The fix: a new
hand-written `DEFAULT_TEMPLATE_RAW_NODES` data array in `index.html` (same construction order,
16 entries) plus a rewritten `applyBuiltinDefaultTemplate()` that resets `nextId=1` and calls
the *same* generated `applyTemplateNodesCore` `applyTemplateNodes()` already uses — no new
`src/` module, no generator changes, since this is hand-written code calling an already-spliced
ambient function exactly the way every wrapper already does. A second test added to
`tests/e2e/generated-templatesapply-smoke.spec.ts` (same generated block, no new file) pins the
real wrapper's output against the exact original tree shape — every section's parentId chain,
the five-level-deep `Business Object → Root View Entity → Behaviour → Definition →
Implementation` nesting, `rootBold`, fresh id minting off a real `nextId=1` reset, and the
selection reset — rather than just "some 16-node tree." A good example of the "investigate
before assuming an ordering guess is right" lesson from earlier in this project: the doc's own
prior write-up assumed this would need its own DI'd core module; it didn't.

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
