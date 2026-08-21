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

**Framework choice is a genuinely open decision requiring sign-off before Phase 1
starts** — see "Open decisions" below. Everything after that section assumes React
as a working default so the plan has something concrete to describe, but the same
phase structure applies almost unchanged if Svelte or Vue is chosen instead.

## Open decisions (need explicit sign-off before starting)

1. **Framework: React vs. Svelte vs. Vue.**
   - **React** — largest ecosystem (component libraries, state managers like
     Zustand/Redux, easiest to hire for or get outside help with later), most
     AI-tooling familiarity, but the most boilerplate and the heaviest runtime of
     the three.
   - **Svelte/SvelteKit** — compiles away at build time, smallest bundles, least
     boilerplate, and arguably the best philosophical fit given Sakura's own
     performance-consciousness (the single-file era was partly a performance
     discipline, not just a distribution one). Smaller ecosystem, fewer
     off-the-shelf component libraries.
   - **Vue** — a middle point on both axes. Not recommended unless there's a
     specific reason to prefer it; listed for completeness.
   - **Recommendation if a default is needed:** Svelte, on the reasoning above,
     but React is a perfectly reasonable choice if ecosystem breadth or future
     hiring matters more than bundle size. This is Robin's call, not a technical
     dead heat resolvable from first principles alone.
2. **State management approach.** React: Zustand (simplest, closest analogue to
   the existing hand-rolled `state/` modules) vs. Redux Toolkit (more structure,
   more ceremony) vs. plain Context+useReducer (no new dependency, more manual
   wiring). Svelte's own stores largely make this moot. Recommendation: Zustand
   (or Svelte stores) — the existing `src/state/*.ts` modules are already small,
   focused, mostly-pure state containers; that maps onto a lightweight store
   library far more directly than onto a heavier framework-prescribed pattern.
3. **Routing.** Sakura currently has no client-side routing at all — `index.html`
   and `hub.html` are two entirely separate pages, and "documents" are switched
   via in-app tab state, not URLs. Introducing a router (React Router /
   SvelteKit's file-based routing) raises a real product question: should
   individual documents get their own URLs (`/doc/:id`), enabling direct links
   and browser back/forward through document switches? This is a genuine
   opportunity the current architecture doesn't offer, worth deciding
   deliberately rather than defaulting to "no routes, same tab-switching model
   as today."
4. **Hosting.** Recommendation: **stay on GitHub Pages via the existing
   `deploy.yml`** — nothing about a React/Svelte build output changes the
   hosting story (see "Hosting stays the same" below). Vercel/Netlify would add
   preview-deploy-per-PR convenience but also a second platform account and a
   dependency outside GitHub; not recommended unless that convenience turns out
   to matter in practice.
5. **Monorepo tooling during the transition.** See "Interim repo structure"
   below — plain npm workspaces are almost certainly enough; Nx/Turborepo would
   be overkill for a two-package repo.

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

One real technical wrinkle, not a blocker: if routing is introduced (open
decision #3 above) and it uses real paths rather than hash-based routing, GitHub
Pages needs a `404.html` fallback trick (or hash routing, which sidesteps this
entirely) since Pages has no server-side rewrite rules for SPA deep links. Small,
well-documented, standard for GitHub-Pages-hosted SPAs — not a reason to avoid
path-based routing, just a step to include in Phase 3.

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

**Phase 0 — Decisions + spike.** Resolve the "Open decisions" above. Before
committing the whole project to a framework, spend a short, timeboxed spike
building one genuinely representative slice end-to-end in the two top framework
candidates — recommend the outline tree itself (render, indent/outdent, drag
reorder) since it's the single most DOM-manipulation-heavy, highest-risk piece in
the whole app, wired to the *already-ported* `nodeMutations`/`nodeQueries` core
modules from Phase 1 below. If that slice feels right in one framework and
awkward in the other, that's a far better signal than a decision made on paper
alone.

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
largely independent component once Phase 2's core tree exists to attach to. If
routing was chosen in Phase 0, wire it up here.

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
npm workspaces (no need for Nx/Turborepo at this scale — see open decision #5):

```
sakura/
├── legacy/                    # today's whole app, moved as-is
│   ├── index.html
│   ├── hub.html
│   ├── sw.js, manifest.json, hub-manifest.json, icon-*.png, flower-glyph.svg
│   ├── scripts/generate-index-blocks.mjs
│   └── vite.config.js         # legacy's own build config
├── web/                       # the new framework app
│   ├── src/
│   │   ├── core/              # ported from src/core/, unwrapped logic
│   │   ├── state/              # ported from src/state/, as stores/hooks
│   │   ├── utils/               # ported from src/utils/, unchanged
│   │   ├── components/         # new — tree, panels, Hub, etc.
│   │   └── main.tsx            # or main.ts for Svelte
│   ├── public/                 # sw.js, manifests, icons — see "repo hygiene" below
│   └── vite.config.ts
├── docs/
│   ├── architecture-plan.md          # legacy modularization history (frozen once Phase 6 lands)
│   └── framework-migration-plan.md   # this doc
├── tests/                     # split legacy/ vs web/ subfolders, or colocate per-package
├── scripts/setup-git-identity.sh     # shared, repo-root-level
├── package.json               # root: npm workspaces, points at legacy/ and web/
└── .github/workflows/
    ├── verify-legacy.yml      # today's verify.yml, scoped to legacy/
    ├── verify-web.yml         # same shape, scoped to web/
    └── deploy.yml             # publishes legacy/ today; repointed at web/ in Phase 5's cutover
```

`docs/architecture-plan.md` stays exactly where it is and keeps being the
authoritative record for `legacy/` until Phase 6 retires it — no need to move or
rewrite that history mid-migration.

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
