# Framework migration plan — from single-file to a hosted SPA

## Why this doc exists, and why it's separate from architecture-plan.md

`docs/architecture-plan.md` covers the TypeScript modularization of the *existing*
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
(`docs/architecture-plan.md`). GitHub Pages doesn't care what produced those
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

The modularization project (Phases 0–5, `docs/architecture-plan.md`) turns out to
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

**A useful side effect:** `docs/architecture-plan.md`'s own "Open items" list
(hub.html sync duplication, revision-snapshot debounce duplication) becomes
largely moot post-migration — a proper component/store architecture makes that
kind of duplication structurally harder to reintroduce, rather than something to
fix twice.

## Phased plan

**Phase 0 — Repo scaffolding (done) + validation spike (next).** Repo
scaffolding: the `legacy/` + `web/` npm-workspaces split (see "Interim repo
structure" below) landed without touching production at all — `deploy.yml`
builds the exact same `legacy/` files it always did, just from a moved path,
verified via a full gauntlet re-run post-move. `web/` has a minimal
React + Vite + TypeScript + Zustand scaffold (a placeholder component and
store, one passing unit test) proving the toolchain, not real UI. **Still to
do:** the validation spike itself — before committing further effort, a
short, timeboxed build of one genuinely representative slice end-to-end in
React: the outline tree (render, indent/outdent, drag reorder), the single
most DOM-manipulation-heavy, highest-risk piece in the whole app, wired to
the *already-ported* `nodeMutations`/`nodeQueries` core modules from Phase 1
below. This is a validation spike, not a framework comparison (that decision
is made) — its purpose is surfacing any real friction in the
React+Zustand+tree-editing combination early, while it's still cheap to
adjust course, rather than discovering it deep into Phase 2.

**Phase 1 — Port the pure logic layer.** Copy `src/core/`, `src/state/`,
`src/utils/` into the new app largely unchanged (per "What ports directly"
above), each wrapped in a thin framework-idiomatic store/hook. Bring the
existing Vitest suite over unchanged — it's already framework-agnostic and gives
immediate regression coverage for the layer least likely to have bugs introduced
by the rewrite. No UI yet; this phase is done when `npm run test:unit` passes in
the new app with (nearly) the same test count as today.

**Phase 2 — Core outline UI.** Build the tree editor itself: render, select,
edit, indent/outdent, drag-and-drop, fold/unfold — the features documented under
"Core Editing" in the README. This is the highest-risk phase (see spike above)
and deliberately comes right after the logic layer, before any of the panels or
Hub features, so the hardest part is de-risked early rather than left for last.

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

**Phase 5 — Parity verification and cutover.** Full feature-by-feature check
against the current README as the source of truth for what "done" means — not a
guess, an explicit checklist walk. Deploy the new app to a **separate preview
URL** (e.g. a `deploy-preview` GitHub Pages environment, or a subdomain) run in
parallel with the live legacy site for a real-world soak period before touching
`www.sakura-notes.com` — the same "prove it before the production cutover"
discipline Stage 1/Stage 2 of the deployment work followed, applied to a much
larger change. Cutover itself (pointing the custom domain at the new build) is
the second "the mechanism itself changes" moment in this project, same rule as
Stage 2: explicit, separate sign-off, not bundled into a routine merge.

**Phase 6 — Retire the legacy single-file app.** Once the new app has run
successfully in production for a deliberate soak period, remove
`index.html`/`hub.html`, `scripts/generate-index-blocks.mjs`, and the whole
splice-based build pipeline. Not automatic — a explicit decision once confidence
is actually earned, not scheduled in advance.

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
                                  # web/dist/ in Phase 5's cutover
```

`docs/architecture-plan.md` stays exactly where it is and keeps being the
authoritative record for `legacy/` until Phase 6 retires it — no need to move or
rewrite that history mid-migration; see that file's own "Path note" for how it
handles now-stale root-relative paths in its historical narration.

## Repo hygiene — root clutter (done)

**Done separately from this plan, ahead of any framework decision** — see
`docs/architecture-plan.md`'s "Repo hygiene" section for the full write-up.
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
  Stage 1 — see `docs/architecture-plan.md`). Mitigation: carry
  `tests/e2e/dist-static-assets.spec.ts`'s spirit forward into the new app's own
  test suite from Phase 3 onward, when PWA features are built.
