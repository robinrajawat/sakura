# Framework migration plan — from single-file to a hosted SPA

## STATUS: DISCONTINUED (2026-08-31)

**This migration is stopped. `web/` will not be developed further and will never be deployed.**
Production (`www.sakura-notes.com`) stays on `legacy/` permanently, not just "until a cutover
gate passes" — there is no longer a planned cutover. Decision made directly by the project owner
after a hands-on review of the `web/` rewrite (PR #316's fixes were the last slice of work; see
`docs/handoff-prompt.md`'s "Current state" for the full list of what shipped and what didn't):
core tree-editing behavior and several other areas were judged not close enough to `legacy/`'s
real experience to be worth the remaining effort, even after 8+ phases of parity work. All
further effort goes into refining `legacy/` directly instead.

**What this means practically:**
- Do not open new PRs against `web/` (`sakura-web` workspace) unless explicitly asked to resume
  the migration — that would need a new, separate, explicit decision, not an assumption.
- `.github/workflows/deploy.yml` keeps building and publishing `legacy/` exclusively, as it
  always has. If it still builds a `web/dist` `/web-preview/` artifact alongside legacy (see
  "Repo structure" in `docs/handoff-prompt.md`), that can be removed as unneeded cleanup, but
  leaving it isn't a problem to fix urgently.
- `web/` itself is not being deleted as part of this — removing ~9 phases of working code is a
  separate, larger decision than pausing further investment in it, and isn't assumed just because
  the migration stopped. Leave it in place unless the project owner asks for removal.
- Everything below this section is kept as a historical record of the plan and decisions made
  while the migration was active — accurate as of when it was written, not maintained further.

## Why this doc exists, and why it's separate from architecture-plan.md

`docs/history/architecture-plan.md` covers the TypeScript modularization of the *existing*
single-file app — extracting logic out of `index.html`/`hub.html` into tested `src/`
modules, spliced back into those same two files at build time. That plan's whole
premise is preserving the single-file, download-and-open distribution model while
making the source underneath it maintainable.

This doc is different in kind, not degree: Sakura's distribution model itself is
changing. It was never a hard requirement — early on the app was slim enough that a
single file made sense, and "no build step" became a stated value in the README as
a natural consequence, not a deliberate long-term constraint. That constraint is now
explicitly dropped: **the app will be accessed exclusively via a hosted URL, not
downloaded and opened as a file.** Once that's true, the reasons to avoid a real
frontend framework — the biggest one being "we ship one HTML file, so we can't ship
compiled JS chunks" — no longer apply. This plan is about actually adopting one.

**Decisions locked in 2026-08-21:** React, Zustand, no routing, GitHub Pages,
npm workspaces. **Phase 0 (repo scaffolding) complete same day** — the
`legacy/`+`web/` npm-workspaces split is live, `web/`'s React + Vite +
TypeScript + Zustand toolchain is proven end to end (typecheck, lint, unit
test, build, and a real dev-server render all verified), and `legacy/`'s full
gauntlet re-verified green after the move with zero behavioral change.
Production (`www.sakura-notes.com`) is unaffected — `deploy.yml` still builds
and publishes `legacy/` exclusively. See "Decisions" and "Interim repo
structure" below for what actually landed; **Phase 1 (porting the pure logic
layer) is next.**

## Decisions (resolved — Phase 0 can proceed)

1. **Framework: React.** Ecosystem maturity was the deciding factor over Svelte,
   given the actual shape of this app — heavy drag-and-drop tree editing, rich
   text, diagram embedding all have first-class, battle-tested React libraries
   (`@dnd-kit`/`react-dnd`, Tiptap/Slate, React Flow), thinner equivalents in
   Svelte's ecosystem. Also the safer bet for future hiring/outside help, and
   the deepest AI-tooling familiarity, which matters given how much of this
   migration will be AI-assisted. Tradeoff accepted knowingly: React's runtime
   is heavier than Svelte's compile-away model, so bundle size and initial load
   need active, ongoing attention (route/panel-level code-splitting, per Phase 3
   below) rather than coming for free.
2. **State management: Zustand.** Closest analogue to the existing hand-rolled
   `src/state/*.ts` modules' shape — small, focused, mostly-pure state
   containers map onto a lightweight store library far more directly than onto
   Redux Toolkit's heavier ceremony or plain Context+useReducer's manual wiring.
3. **Routing: none.** Documents keep the current tab-switching model, not
   per-document URLs. Simpler migration surface, and the GitHub-Pages
   `404.html`-fallback wrinkle for path-based SPA routing (noted in "Hosting
   stays the same" below) doesn't apply — no client-side router needed at all
   for Phase 0–5's scope. Revisit only if a concrete need for shareable
   document links comes up later; not a blocker either way if it does, since
   adding a router afterward doesn't require re-architecting the state layer.
4. **Hosting: stays on GitHub Pages**, via the existing `deploy.yml` — no new
   platform, no new cost. See "Hosting stays the same" below for why a React
   build output needs no structural change to the pipeline.
5. **Monorepo tooling: plain npm workspaces.** Nx/Turborepo would be overkill
   for a two-package repo — see "Interim repo structure" below.

## Hosting stays the same

This is worth stating plainly since it came up directly: a React or Svelte
production build is `vite build` output — static HTML/CSS/JS files, exactly the
same *category* of artifact `dist/` already is today after Stage 2
(`docs/history/architecture-plan.md`). GitHub Pages doesn't care what produced those
files. The existing pipeline — `.github/workflows/deploy.yml` builds via
`npm run build` and publishes via `actions/deploy-pages` — needs no structural
change, only a different `npm run build` underneath it (a real framework build
instead of `vite build` + `copy-static-assets.mjs` against a single HTML entry).
Custom domain, HTTPS, and the free-tier hosting all carry over unchanged. No new
cost, no new platform, no purchase required.

One real technical wrinkle, not a blocker, and currently moot given decision
#3 above (no routing): if a router is ever introduced later using real paths
rather than hash-based routing, GitHub Pages needs a `404.html` fallback trick
(or hash routing, which sidesteps this entirely) since Pages has no
server-side rewrite rules for SPA deep links. Small, well-documented, standard
for GitHub-Pages-hosted SPAs — noted here only so it isn't a surprise if
routing gets revisited down the line.

## What ports directly vs. what needs rework

The modularization project (Phases 0–5, `docs/history/architecture-plan.md`) turns out to
be exactly the right preparation for this, even though it wasn't done with this in
mind. Breaking it down honestly:

**Ports with little to no change** — the pure logic layer:
- `src/utils/*` (escapeHtml, generateId, formatRelativeTime, stripSemanticMarkers,
  serializeMarkdown, serializeOpml, serializeTreeText*, parseInlineSegments,
  serializeClipboardHtml) — pure functions, framework-agnostic by construction.
  Copy over as-is.
- `src/core/*` (nodeQueries, nodeMutations, nodeSearch, nodeSelection,
  templatesApply, diagramGenDims) — pure or near-pure tree operations. These
  become the logic inside React hooks / Svelte stores, not rewritten so much as
  *wrapped*.
- `src/state/*` that's genuinely pure computation (syncApply, syncReconcile,
  sharedDocSync, tabOrder, diagramAnchor, the diagramGen* family, templatesIndex,
  decisionLogQueries) — same story: wrap in a store, don't rewrite the logic.
- The existing `tests/unit/*.test.ts` suite (738 tests as of this writing) largely
  travels with its module — these test pure functions, not DOM structure, so they
  keep working almost unchanged as regression coverage through the rewrite.

**Needs real rework** — anything currently written as direct DOM manipulation:
- Every render path in `index.html`/`hub.html` that builds/updates DOM by hand
  (the actual outline tree rendering, panel open/close, all the CRUD/editor DOM
  wiring the architecture plan deliberately kept hand-written throughout Phases
  0–5) — this is the real rewrite. It becomes JSX/Svelte templates driven by the
  above state, not a mechanical port.
- Event wiring currently done via manual `addEventListener` calls throughout —
  becomes framework-idiomatic event handlers (`onClick`, Svelte's `on:click`,
  etc.).
- The Firestore/IndexedDB/localStorage I/O in `src/state/*` that's *not* pure
  (queueSync/flushSyncQueue, push*ToCloud, the onSnapshot listener wiring) — the
  actual I/O logic ports largely as-is, but where/how it's invoked (currently ad
  hoc function calls; in React, likely `useEffect` or a dedicated data layer)
  needs redesigning around the framework's lifecycle model.
- draw.io embed integration (Diagrams, Whiteboard, Mind Map), rich-text editing
  in Note/Pad, and any other third-party-widget wiring — each needs its own
  framework-appropriate wrapper; these are the highest-effort, highest-risk
  individual pieces since they're not pure logic and not simple to test.

**A useful side effect:** `docs/history/architecture-plan.md`'s own "Open items" list
(hub.html sync duplication, revision-snapshot debounce duplication) becomes
largely moot post-migration — a proper component/store architecture makes that
kind of duplication structurally harder to reintroduce, rather than something to
fix twice.

## Phased plan

**Phase 0 — Repo scaffolding + validation spike (both complete).** Repo
scaffolding: the `legacy/` + `web/` npm-workspaces split (see "Interim repo
structure" below) landed without touching production at all — `deploy.yml`
builds the exact same `legacy/` files it always did, just from a moved path,
verified via a full gauntlet re-run post-move.

**Validation spike:** a real outline tree (`web/src/components/OutlineTree.tsx`
+ `web/src/store/outlineStore.ts`) — render, click-to-select,
`Tab`/`Shift+Tab` indent/outdent, native-HTML5-drag-and-drop reorder — wired
to the genuinely-ported `nodeMutations`/`nodeQueries`/`nodeSelection` core
logic from Phase 1, not a mockup. This is a validation spike, not a framework
comparison (that decision was already made) — its purpose was surfacing real
friction in the React+Zustand+tree-editing combination early, and it did,
twice, both fixed:

1. **The legacy splice model's `declare function` ambient-global pattern
   doesn't work as real ES modules — at all.** 15 of the 41 files ported in
   Phase 1 used `declare function foo(...): T;` to reference another
   already-spliced generated block's function as a same-scope ambient global
   (a real, deliberate, well-documented pattern for the classic-script splice
   pipeline — see `docs/history/architecture-plan.md`'s own critical-lessons section).
   In a real module system that function is simply `undefined` at runtime; the
   spike's very first render threw `ReferenceError: getParentIndex is not
   defined`. Fixed by converting every `declare function` stub across all 15
   files into a real `import` from wherever the function is actually defined
   (mapped by grepping every ported file's real `export function` — a fully
   mechanical, zero-logic-change fix once the mapping was built). This is
   necessary follow-up work for **any** Phase 1 module to actually function
   as a real ES module, not spike-specific — it was always going to be needed
   before Phase 2 could wire any of this in; the spike just surfaced it
   immediately instead of thirty files into Phase 2.
2. **Real imports let TypeScript cross-check types across module boundaries
   for the first time — and it found a real latent bug.**
   `diagramGenFinishGenerate.ts` called `diagramGenLegendEntriesCore` with a
   nullable `nodeMeta` against a signature requiring non-null. Invisible
   before, because the old ambient `declare function` stub declared its
   *own*, more permissive parameter type rather than the real function's —
   TypeScript never actually checked the call against the true signature.
   Fixed with `nodeMeta ?? new Map()`, behaviorally identical to the
   `?.get(...)` pattern every other use of `nodeMeta` in that same function
   already uses (an empty map's `.get()` also returns `undefined`) — a
   zero-behavior-change fix, not a logic change.

An automated first attempt at fix #1 (a Python script matching
`declare function` blocks by balancing parens to find the statement
terminator) corrupted 3 files whose declared return type was itself an object
literal containing a semicolon (`{ vert: string; conn: string }`) — the
script matched that inner semicolon as the statement end. Caught immediately
by `tsc` (`error TS1128: Declaration or statement expected`), not silently;
those 3 files were restored from the last good commit and fixed by hand.

Also found and removed during this cleanup: 3 now-genuinely-dead local
interfaces (`FGPosition`, `FGBoundsResult`, `FGLegendEntry` in
`diagramGenFinishGenerate.ts`) that existed only to type the old ambient
stubs' return values — orphaned the moment those stubs became real imports
carrying their own real types, caught by ESLint's `no-unused-vars` (0 → 3
new warnings, confirmed via a side-by-side lint of the same file in
`legacy/`, which has zero) rather than left as silent clutter.

Fully verified: `npm run typecheck -w sakura-web` clean; `test:unit` 744/744
(738 ported + 6 new `outlineStore` tests exercising the real wired
indent/outdent/move calls, replacing the Phase 0 `counterStore` scaffold
which is now redundant and was removed); `lint` 0 errors, 1 warning
(pre-existing, identical to `legacy/`'s own); `build` clean. `legacy/`
completely unaffected throughout (`git status --short legacy/` empty,
re-verified fully green).

**Phase 1 — Port the pure logic layer (complete).** All of `legacy/src/core/`,
`legacy/src/state/`, `legacy/src/utils/` copied into the equivalent `web/`
paths, largely unchanged (per "What ports directly" above) — wrapping any of
it in a thin framework-idiomatic store/hook is deferred to Phase 2, when
there's real UI to wire it into; this phase's own completion bar was purely
"the logic and its test coverage exist in `web/`," not "the logic is wired
up." The existing Vitest suite came over unchanged — framework-agnostic
already, giving immediate regression coverage for the layer least likely to
have bugs introduced by the rewrite.

**Landed across two slices, both PR-sized:**

1. All 10 `legacy/src/utils/*.ts` files, plus `legacy/src/core/nodeQueries.ts`
   (pulled in early — three of the ten utils depend on its `buildPrefix`
   function and `QueryableNode` type at runtime/compile-time respectively, a
   genuine shared dependency rather than something worth artificially
   splitting across two separate slices).
2. The rest of `core/` (`nodeMutations`, `nodeSearch`, `nodeSelection`,
   `templatesApply`, `diagramGenDims`) and all 25 files of `state/`.
   Dependency-checked first (`grep -n "^import"` across every remaining file)
   before copying anything — confirmed the whole remaining `core/` set only
   depends on the already-ported `nodeQueries`, and every single `state/`
   file has zero cross-module imports at all — so this landed as one clean
   sweep with no ordering constraints to work around.

Tests moved to `web/`'s colocated convention (`Module.test.ts` next to
`Module.ts`, matching Phase 0's `counterStore.ts`/`counterStore.test.ts`
scaffold) rather than `legacy/`'s separate `tests/unit/` directory — only
import paths changed, never a single assertion or test case. Six state test
files (`admin`, `aiProviders`, `notifications`, `presence`, `templatesIndex`,
`vault`) used a `*State.test.ts` naming convention in `legacy/`'s flat
`tests/unit/` directory to avoid ambiguity there; renamed to match their
source module directly now that colocation makes the disambiguating suffix
redundant.

Verified test-count-identical against `legacy/`, file by file across the
entire suite (a full diff of every file's own test count, not just an
aggregate total that could hide a dropped test) — the only differences were
the six intentional filename normalizations above; every count itself
matched exactly. Tally at Phase 1's own completion: 740 tests in `web/` (738
ported + 2 from the then-current `counterStore` scaffold), across 42 files.
`legacy/` itself untouched by either slice (`git status --short legacy/`
empty both times) and re-verified fully green after each. At the time Phase
1 itself completed, `web/`'s `App.tsx` didn't yet import any of this —
that changed immediately after, during Phase 0's own validation spike (see
above), which wired `nodeMutations`/`nodeQueries`/`nodeSelection` into a
real rendered tree and, in doing so, found and fixed the `declare function`
ambient-global issue affecting all 15 non-trivially-dependent Phase 1 files.
Test count as of the spike: 744 (738 ported + 6 new `outlineStore` tests,
`counterStore`'s 2 removed as redundant).


**Phase 2 — Core outline UI (in progress).** Build the tree editor itself:
render, select, edit, indent/outdent, drag-and-drop, fold/unfold — the
features documented under "Core Editing" in the README. This is the
highest-risk phase (see spike above) and deliberately comes right after the
logic layer, before any of the panels or Hub features, so the hardest part
is de-risked early rather than left for last.

**First slice landed:** real node create/edit/delete and fold/collapse, on
top of the validation spike's existing select/indent/outdent/drag-reorder,
still wired to the same ported core logic
(`insertParsedNodesCore`/`deleteRootIndexes` for create/delete,
`getVisibleNodeIndexes`/`nodeHasChildren` for fold-aware rendering) —
`Enter` for a new sibling, `Ctrl/Cmd+Enter` for a new child (inserted after
the *whole* subtree when the source node has children, not wedged
immediately after it — verified with a dedicated test, since that's an easy
detail to get wrong), `Backspace` on empty text to delete a node (refusing
to delete the last remaining node), double-click or `Enter` to start
editing, `Escape`/blur to commit or cancel. Node id generation deliberately
does *not* reuse `generateId()` from the ported `utils/` — that produces
string ids for documents/templates/meeting notes, a different namespace
entirely. Outline node ids are numeric, generated via a simple incrementing
counter in the store — the same role legacy's hand-written `makeNode()`
(`id: nextId++`) plays, per `templatesApply.ts`'s own header comment
explaining why `makeNode` itself was never extracted as core logic (it's
construction/orchestration, not a pure query or mutation) — this store's own
counter is the correct, expected place for that responsibility to live in
the new app too, not a gap in the Phase 1 port.

**Deliberately deferred, not oversights** (each is its own future slice):
multi-select (the ported `computeSelectedIds`/`computeSelectionRootIndexes`
support it; the UI for range/multi-select doesn't exist yet), `Shift+Enter`
split-at-cursor (needs real cursor-position tracking, more involved than a
plain `<input>` currently used for inline editing supports), sort children,
and checkboxes.

**Third slice landed: drag-to-nest.** The ported `moveNodeBlockCore` already
supported `'child'` mode from the start (insert right after the target as
its first child, depth+1) — this slice was purely a UI affordance, not new
core logic. Extended the existing above/below drop-zone detection from a
simple top-half/bottom-half split to thirds: top third = above, bottom third
= below, middle third = nest as child, with its own distinct visual
treatment (an inset highlight rather than a border line, so it reads as
"drop inside" rather than "drop between"). Nesting under a collapsed target
un-collapses it, matching `newChild`'s existing behavior — a node you just
dropped somewhere shouldn't immediately vanish from view.

Verified: `web` typecheck clean; `test:unit` 770/770 (768 prior + 2 new,
covering the nest-and-reparent case and the un-collapse-on-nest case);
`lint` 0 errors, 1 pre-existing warning; `build` clean. `legacy/` completely
unaffected.

**Second slice landed: semantic markup styling** (`[Section]`, `(note)`,
`!alert`, `` `code` ``). Investigated legacy's real rendering path before
writing anything — the already-ported `utils/parseInlineSegments.ts` turned
out to be the *wrong* source to reuse here despite the tempting name match:
it was extracted for canvas image-export measurement
(`measureTreeImage`/`renderTreeImageBlob`), a genuinely different consumer
with different needs (delimiters kept visible, for width measurement). The
real live editor uses a separate, hand-written, never-extracted function
(`parseStyledText` in `index.html`) that *hides* delimiters and applies real
theme-aware CSS classes (`.sem-chip`, `.sem-meta`, `.sem-alert-inline`,
`.sem-code-inline`). Writing `web/src/utils/parseSemanticMarkup.ts` — a
fresh, faithful match of `parseStyledText`'s core 4-marker subset, with its
own real CSS-value-matched styling in a new `NodeText.tsx` component — is
correctly scoped as new hand-written work here, not a missed Phase 1 port:
`parseStyledText` was never core/state/utils logic in the first place, same
category as `makeNode` (see the create/delete slice above).

Deliberately scoped down from `parseStyledText`'s full behavior, each
investigated and explicitly excluded rather than silently dropped:
`[[wiki links]]` (a real cross-document backlinks feature, not just inline
styling — and confirmed this parser doesn't garble text containing one, by
design: a `[[` is left untouched as plain text rather than mis-parsed as two
single brackets, caught by a dedicated test during development), `Decision
Log:`/`Context:`/etc. label coloring (decision-log-specific), `Key:` prefix
bolding (`sem-key`), `SAP Note 12345` auto-linking (narrow, product-specific),
and `>quote` (investigated and confirmed `parseStyledText` itself doesn't
handle it either, despite a `.sem-quote` CSS class existing — that class
belongs to three unrelated call sites: Pad's blockquotes, Preview/Presenter's
remark text, and the tree's own separate whole-line-quote treatment, not this
inline-marker parser).

One real bug caught immediately by the test suite during development: the
first `[[` guard only prevented the *first* bracket from starting a false
section match, but left the *second* bracket free to start its own — `see
[[Some Page]] for more` parsed as text + a bogus `Some Page` section + a
trailing `]` fragment, rather than staying untouched. Fixed by skipping both
brackets of a `[[` pair together rather than just gating the first one.

Verified: `web` typecheck clean; `test:unit` 768/768 (757 prior + 11 new for
`parseSemanticMarkup`, including the `[[` regression case above); `lint` 0
errors, 1 pre-existing warning; `build` clean; dev server manually confirmed.
`legacy/` completely unaffected throughout.

Verified: `web` typecheck clean; `test:unit` 757/757 (744 prior + 13 new,
covering editing, both subtree-boundary cases of node creation, delete
(including the whole-subtree-not-just-the-node case and the
refuse-to-delete-the-last-node guard), collapse, and the ported
`getVisibleNodeIndexes`/`nodeHasChildren` wiring); `lint` 0 errors, 1
pre-existing warning; `build` clean; dev server manually confirmed serving
the updated `App.tsx`. `legacy/` completely unaffected throughout.

**Phase 3 — Panels and secondary features.** Note, Code block, Pad (all seven
tabs), Preview/Presenter Mode, exports (Word/PDF/PowerPoint/Markdown/OPML),
theming, PWA install — the bulk of the README's feature surface, each panel a
largely independent component once Phase 2's core tree exists to attach to.
No routing to wire up here (decision #3, resolved: none) — documents keep the
current tab-switching model.

**Phase 4 — Hub (To-Dos, Meeting Notes, Journal, Library, Recap) and account/sync
features.** Deliberately last among feature work — these are the most
sync/Firebase-dependent surfaces and benefit most from the core app (and its
data layer patterns) already being proven out.

**Phase 5 — Parity audit.** ✅ Complete. Full feature-by-feature check against the current
README as the source of truth for what "done" means — not a guess, an explicit checklist walk
(`docs/history/phase5-parity-checklist.md`). Deliberately scoped as an audit only, not a cutover
milestone: cutover can't honestly happen until the gap that audit surfaced is closed, which is
exactly Phase 6's job. Two feature slices also landed while this phase was underway (Documents &
Tabs, Tags & Focus) — real, merged work, not blocked on Phase 6 either.

**Phase 6 — Full parity build-out, cutover & legacy retirement.** Full plan:
`docs/phase6-full-parity-plan.md`. Owns everything Phase 5's audit found still missing, plus the
cutover itself — `www.sakura-notes.com` stays on `legacy/` until that plan's own pre-cutover gate
is explicitly satisfied (see that document's own opening section for why this rule exists; the
short version: it's the "prove it before the production cutover" discipline Stage 1/Stage 2 of
the deployment work established, applied a second time — a real person opening the actual built
app, not a passing build alone). Once `web/` reaches full feature and pixel-close visual parity
with `legacy/` and the gate is cleared: cut over — the second "the mechanism itself changes"
moment in this project, same explicit-and-separate rule as Stage 2 — run a deliberate soak
period in production, then remove `index.html`/`hub.html`, `scripts/generate-index-blocks.mjs`,
and the whole splice-based build pipeline. Retirement itself remains its own explicit decision
once confidence is actually earned, not scheduled in advance.

Each phase should land as its own sequence of small, reviewable PRs (same
discipline as the current modularization project), not one giant branch — easier
to review, easier to bisect if something regresses, and it means the app never
sits in a half-migrated, unreleasable state for long stretches.

## Interim repo structure (Phases 0–5, both apps coexist)

The legacy app must keep working and stay deployable throughout the migration —
`www.sakura-notes.com` doesn't go dark while the new app is built. That means a
real coexistence period, not a big-bang swap. Recommended structure using plain
npm workspaces (no need for Nx/Turborepo at this scale — see open decision #5).
**As actually implemented in Phase 0** (this is no longer aspirational):

```
sakura/
├── legacy/                    # today's whole app, moved as-is
│   ├── index.html
│   ├── hub.html
│   ├── public/                # sw.js, both manifests, icons, CNAME — Vite's
│   │                           # own static-passthrough convention (see
│   │                           # "Repo hygiene" below)
│   ├── src/                   # core/, state/, utils/ — unchanged by the move
│   ├── tests/                 # unit/, e2e/ — colocated with the package, not split
│   │                           # out to a root-level tests/ the way an earlier
│   │                           # draft of this diagram sketched
│   ├── scripts/                # generate-index-blocks.mjs, validate_html_structure.py
│   │                           # (setup-git-identity.sh stays at the repo root — see below)
│   ├── package.json           # name: sakura-legacy
│   └── vite.config.js         # legacy's own build config
├── web/                       # the new React app
│   ├── src/
│   │   ├── App.tsx, main.tsx, counterStore.ts   # Phase 0 scaffold only —
│   │   │                                          # proves the toolchain, not real UI
│   │   ├── core/               # Phase 1: ported from legacy/src/core/
│   │   ├── state/              # Phase 1: ported from legacy/src/state/, as Zustand stores
│   │   └── utils/               # Phase 1: ported from legacy/src/utils/, unchanged
│   ├── package.json           # name: sakura-web
│   └── vite.config.ts
├── docs/
│   ├── architecture-plan.md          # legacy modularization history (frozen once Phase 6 lands)
│   └── framework-migration-plan.md   # this doc
├── scripts/setup-git-identity.sh     # shared, repo-root-level — NOT under legacy/scripts/,
│                                       # since it configures the whole repo's git identity
│                                       # and .githooks wiring, not anything legacy-specific
├── package.json               # root: declares the legacy/web npm workspaces
└── .github/workflows/
    ├── ci.yml                 # verify-legacy + verify-web jobs in one workflow file
    │                           # (simpler than two separate files for two jobs sharing
    │                           # the same triggers; revisit if that stops being true)
    └── deploy.yml              # builds+publishes legacy/dist/ today; repointed at
                                  # web/dist/ once Phase 6's cutover gate clears
```

`docs/history/architecture-plan.md` was moved into `docs/history/` (see `docs/README.md`) once
Phase 5 closed and this repo had more than one truly historical/closed doc worth separating from
active ones — its content is otherwise unchanged and keeps being the authoritative record for
`legacy/` until Phase 6 retires it; see that file's own "Path note" for how it handles now-stale
root-relative paths in its historical narration.

## Repo hygiene — root clutter (done)

**Done separately from this plan, ahead of any framework decision** — see
`docs/history/architecture-plan.md`'s "Repo hygiene" section for the full write-up.
`sw.js`, both manifests, every icon, `flower-glyph.svg`, `social-card.png`, and
`CNAME` now live in `public/`; `scripts/copy-static-assets.mjs` is deleted;
Vite's own `publicDir` convention handles the passthrough with zero custom
code. Doing this surfaced and fixed a real, previously-invisible production
bug: `social-card.png` (Open Graph/Twitter preview image, referenced only via
an absolute URL) and `icon-glyph-192.png` (notification icon, referenced only
via a JS string) were both silently 404ing in production since Stage 2's
cutover — neither was ever in the old script's passthrough list, since both
reference patterns share the same "invisible to Vite's HTML scanner" blind
spot `sw.js` originally had. Fixed as a side effect of the reorg, not a
separate change. `web/`'s `public/` folder (once the framework migration
starts) inherits this same structure from day one.

For the eventual `web/` app once the framework migration is underway, `public/`
should be the structure from day one — no retrofitting needed there since it
starts clean.

## Risks and mitigations

- **This is a rewrite, not a refactor.** DOM-manipulation code doesn't port
  mechanically to JSX/reactive templates — budget the plan above as a genuine
  ground-up UI rebuild that reuses the logic layer, not a quick migration.
  Mitigation: Phase 1's logic-layer port plus its existing test suite means the
  riskiest, least-tested part of a rewrite (silently changing business logic)
  is largely de-risked before UI work even starts.
- **Bundle size / initial load time now genuinely matters.** A local file has no
  network cost; a hosted URL does. Mitigation: code-splitting and lazy-loading
  become real design concerns from Phase 2 onward (route- or panel-level
  splitting — Hub panels, Presenter Mode, and each Pad tab are natural split
  points), not an afterthought bolted on later.
- **Long single-branch drift.** A framework rewrite is exactly the kind of
  project that invites one enormous branch. Mitigation: the phase breakdown
  above is designed so each phase ships as its own sequence of small PRs against
  a long-lived `web-migration` integration branch (or trunk, with the new app
  simply unlinked from production until Phase 5), same PR-sized discipline as
  the existing modularization project.
- **Data/schema continuity.** IndexedDB, localStorage keys, and Firestore
  document shapes are all defined by the *current* code, not the framework.
  Mitigation: since Phase 1 ports the state/sync logic largely as-is rather than
  redesigning it, the on-disk/in-cloud data format doesn't need to change at
  all — a user's existing documents should open correctly in the new app with
  no migration script needed, provided Phase 1 is done faithfully.
- **PWA/offline behavior regression.** Framework builds can accidentally break
  service-worker registration or manifest resolution if not configured
  carefully (this project already hit exactly this class of bug once, in
  Stage 1 — see `docs/history/architecture-plan.md`). Mitigation: carry
  `tests/e2e/dist-static-assets.spec.ts`'s spirit forward into the new app's own
  test suite from Phase 3 onward, when PWA features are built.
