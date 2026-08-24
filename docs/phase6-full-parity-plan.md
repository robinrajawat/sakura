# Phase 6 — Full Parity Migration Plan

## The rule this plan exists to enforce

**`www.sakura-notes.com` stays on `legacy/` until this plan's final gate (Section 9) is
explicitly signed off — not before.** This plan exists because that rule was broken once
already: `web/` was cut over to production on the strength of a passing build and a green test
suite, without anyone actually opening the deployed app first. It showed Phase 0 developer
placeholder text to real colleagues within minutes. The revert and root-cause fix are on `main`
(see git history around `deploy.yml` and `documentsStore.ts` from this date). This plan is the
honest alternative to repeating that mistake: finish the real thing, verify it like a real user
would, then cut over — not the other way around.

## Goal

Full feature and visual parity with `legacy/` as it exists today, not a prioritized subset.
`docs/history/phase5-parity-checklist.md` is the authoritative, row-by-row record of every gap; this
document is the sequencing plan for closing all of them. Visual parity means **pixel-close**,
not "same spirit" — legacy's actual colors, typography, spacing, and layout chrome, not a
React-flavored reinterpretation of them.

## Why sequenced this way

`web/` today has zero design system — every screen is ad hoc inline styles with no shared
color tokens, typography scale, or layout chrome (see any component's `style={{...}}` props).
Feature work done against that foundation would all need re-skinning later, so the design
system and app shell come first, once, rather than N times. After that, feature phases are
sequenced by dependency (a panel needs the shell to dock into; Quick Assist needs the settings
it toggles to exist) rather than by usage frequency, since the goal here is completeness, not a
prioritized MVP.

Every phase below lands as its own sequence of small, reviewable PRs — same store-PR-then-UI-PR
discipline as every phase before this one. Nothing in this plan authorizes touching `deploy.yml`
or `legacy/` itself; those stay exactly as the revert left them until Section 9.

## Phases

### 6.1 — Design tokens & app shell
Extract legacy's actual design values (colors incl. all 5 accent options and Chrome background
presets, typography scale for both content fonts, spacing/indent constants, the icon set) into a
real token system `web/` components read from, replacing every inline hex/px value currently
scattered across `OutlineTree.tsx` and friends. Build the real app shell around it: header/app
bar, left sidebar, status bar, tab bar — currently entirely absent; `App.tsx` is presently a
vertically-stacked panel dump with a plain `<h1>`, not an app shell at all. This is the
prerequisite every other phase in this plan re-skins into.

The sidebar and tab bar built here should close their own remaining checklist gaps as part of
this phase, not leave them for later: a real file explorer (folders/templates — currently `web/`
has no document-management shell at all beyond the flat tab strip from Phase 5), a searchable
tab-switcher dropdown for overflow, drag-to-reorder tabs, and per-tab independent scroll
position/selection (switching tabs currently resets selection). All four are explicitly named as
deferred in `docs/history/phase5-parity-checklist.md`'s "Documents & Tabs" section and have no other
natural home in this plan — building the real shell without them would just recreate the same
gap one level up.

**Status: complete.** All eight items landed:
- Part 1 (#129) — real design tokens (24-field `ThemeTokens`, 7 accent presets) extracted from
  `legacy/index.html`'s actual CSS into `themeStore.ts`, replacing the placeholder Google-blue-ish
  values.
- Part 2 (#130) — the real app shell itself (`AppShell.tsx`): header/app bar, left sidebar,
  tab-bar dock, status bar, dimensions copied directly from `legacy/index.html`'s own CSS.
- Per-tab independent scroll/selection (#132) — session-scoped view-state cache in
  `documentsStore.ts`, restoring selection/collapse/scroll on return to a previously-visited tab
  instead of always resetting.
- Drag-to-reorder tabs (#133) — native HTML5 DnD wired to `tabOrder.ts`'s pre-existing
  `reorderTabsCore`.
- Sidebar resize/collapse (#134) — `sidebarStore.ts`, matching legacy's real default/min/max
  width and open-state numbers.
- Searchable tab-switcher dropdown (#135) — live-filtered "▾" dropdown over open tabs, matching
  legacy's own "search open tabs" overview.
- CSS custom properties (#136) — real `var(--bg)`/`var(--accent)`/etc on `<body>`, matching
  legacy's own mechanism; `AppShell.tsx`/`DocumentTabs.tsx` consume them directly and no longer
  re-render on theme/accent changes for styling purposes.
- Real file explorer (#137 store, #138 UI) — nested document folders (`DocFolder`, unbounded
  depth, matching legacy's real shape), full CRUD, a real sidebar tree in
  `SidebarFileExplorer.tsx`. Deliberately smaller than legacy in ways documented in that file's
  own header (no drag-to-file, a "move to folder" select instead; no templates -- a separate
  system entirely, out of scope for this phase).

### 6.2 — Undo/redo (foundational) & core editing parity
`outlineStore.ts` has no undo/redo at all yet — not a per-tab gap, a store-level absence
(`docs/history/phase5-parity-checklist.md`'s Documents & Tabs section and its Keyboard Shortcuts table
both name this). Build it first in this phase, before the other core-editing items below, since
several of them (Duplication, checkbox toggling, sort) should push onto the same undo stack
rather than each growing its own ad hoc history later. Once it exists, per-tab independent
undo/redo (named in the Documents & Tabs gap list) falls out of it naturally rather than needing
separate design.

Then the remaining `⚠`/`❌` rows in the checklist's "Core Editing" and "Overview" tables:
Duplication, rich per-node formatting (bold/italic/underline/strike/highlight/color, Heading
1–6), fold "+N hidden" badge, node hover toolbar, checkbox toolbar button + progress badge,
right-click context-menu system (sort-children currently only reachable via toolbar), Quick
Insert.

**Status: complete.** All nine items landed:
- Foundational undo/redo (#140) — real store-level `undoStack`/`redoStack` in `outlineStore.ts`,
  matching legacy's own snapshot mechanics and two real optimizations (no checkpoint on a no-op
  edit; `nextId` never moves backward on restore). Wired to keyboard (Ctrl/Cmd+Z,
  Ctrl/Cmd+Shift+Z, Ctrl+Y) and real toolbar buttons.
- Per-tab independent undo/redo (#141) — extended `documentsStore.ts`'s existing `TabViewState`
  cache (the same mechanism already handling selection/scroll/collapse) to also capture/restore
  each tab's own undo/redo stacks.
- Duplication (#142) — `duplicateRootIndexesCore`, matching legacy's real (and, on inspection,
  likely accidental) behavior: text/depth/note/styles carry over, checkbox/code/tags don't.
- Rich per-node formatting (#143) — bold/italic/underline/strike + heading levels 1–6 via a new
  `NodeStyles` field on every node, `toggleNodeStyle`/`applyHeadingOption` actions, `#`-prefix
  auto-convert to heading, real toolbar buttons + keyboard shortcuts. `highlight`/`color` are in
  the type for full parity but not wired to any UI yet (need a color-palette UI — a real,
  separately-scoped follow-up).
- Fold badge & checkbox progress badge (#144) — purely wiring already-ported, already-tested
  pure logic (`countDescendants`/`getCheckboxChildStats` in `nodeQueries.ts`) into the UI.
- Checkbox toolbar button (#145) — `toggleCheckboxType`, matching legacy's real any-selected-
  is-a-checkbox-removes-from-all / none-selected-adds-to-all semantics.
- Node hover toolbar (#146) — matches legacy's own default `hoverToolbarActions` exactly
  (insert above/child/below only); the fuller, user-configurable action set is a real,
  separately-scoped follow-up.
- Right-click context menu (#147) — a single flat action list (10 actions this project has real
  store actions for) rather than legacy's own top-row-plus-"More"-panel split, which exists to
  manage legacy's own much larger ~20-action registry. AI-dependent and subsystem-dependent
  actions (rewrite, note/QA/remark/where-used/version-history, slide-divider) are named as
  explicitly deferred, not silently dropped, in the menu's own render comment.
- Quick Insert (#148) — Ctrl/Cmd+Space while editing opens legacy's real 7-action character-
  insert menu (em dash, en dash, arrow, check/cross mark, middle dot, date/time), inserting at
  the actual cursor position via direct `<input>` DOM manipulation (the inline-edit input is
  deliberately uncontrolled).

### 6.3 — Panels: Note, Code, Pad
Note panel: rich text, images, tables, backlinks section. Code panel: resizable/floating window.
Pad's remaining tabs to real depth: Q&A (AI-assisted answering, bulk actions, search, PDF
export, node-linking), Decision Log (node-linking, structured fields, card rendering, Excel
export), Diagrams (draw.io integration), Mind Map, Files (real upload/storage, node-linking,
download), Remarks (date field, node-linking, export inclusion).

**Status: in progress.** 10 of 11 top-level items landed; item 11 is itself three sub-features,
scoped and sequenced together (see that item's own breakdown below) — 2 of those 3 landed:
1. ✅ Note/Code floating panel shell (#150)
2. ✅ Note rich-text editor (#151)
3. ✅ Note editor link insert/edit (#152)
4. ✅ Note editor image insert from file (#153)
5. ✅ Note editor table insert (#154)
6. ✅ Code panel drag-resize handle (#155)
7. ✅ Note panel backlinks (#164) — deferred mid-session pending the mention infrastructure
   itself, which turned out to be substantial enough to track as its own phase (§6.4 below,
   #159-#161/#163); once that infrastructure existed, closing this item out was a single
   focused slice: direct port of legacy's own `renderBacklinkPanel` (legacy/index.html:20160-
   20181) — renders at the bottom of the Note tab only, hidden entirely when there are no
   referrers, each entry an 80-char truncated preview with any `[[mention]]` italicized (via a
   new pure `formatBacklinkPreview` helper in `core/backlinks.ts`), click navigates to the
   referrer and closes the panel. Deliberately not ported: legacy's collapsed-by-default
   badge/toggle system, since this project's Note panel has no other collapsed-by-default
   section to be consistent with — the section just always shows when non-empty.
8. ✅ Pad Q&A search/filter (#156)
9. ✅ Pad Decision Log status + Open filter (#157)
10. ✅ Pad Remarks date field + newest-first order (#158)
11. ⚠️ Diagrams, Mind Map, Files — scoped as three separate sub-slices, sequenced Files →
    Diagrams → Mind Map (that order chosen for size: Files was small and well-defined, Diagrams
    and Mind Map are each substantial features of their own). Sub-status:
    - ✅ **Files real upload/storage** (#168) — turned out not to need a backend at all: legacy's
      own implementation has never had one either, reading the selected `File` via
      `FileReader.readAsDataURL` and storing the base64 data: URI inline in the document's own
      persisted state, same tier as every other Pad list. 5MB-per-file cap matching legacy
      exactly. Deliberately not ported, same "flat, document-level list first pass" convention
      this store already uses for Decision Log/Remarks/Q&A: node-linking (`anchorNodeId` + an
      anchor-picker UI), `addedBy`, `note`, per-mime-type icons.
    - ✅ **Diagrams** (#172) — a real draw.io editor embedded via its official `postMessage`
      protocol (`components/DiagramEditor.tsx`, direct port of legacy's `openDiagramEditor`
      init/load/save/exit handshake), plus Generate-from-outline
      (`state/diagramGenScope.ts` + tests, wiring the already-ported Phase 1 `diagramGen*.ts`
      layout/color/XML engine into a real UI for the first time). `Diagram` (`padStore.ts`) is a
      flat document-level list, same first-pass convention as every other Pad tab -- no
      node-linking, status, or thumbnail yet. Generate always runs in "plain tree mode" (no AI
      classification pass or review screen -- this project has no AI features yet, §6.9 not
      started), matching legacy's own documented AI-unavailable fallback exactly rather than a
      lesser imitation of it; `genKey`-based regenerate-in-place also deliberately not ported.
      Verified end-to-end in a real headless Chrome browser (Generate picks scope/builds
      XML/opens the editor, the iframe requests the real `embed.diagrams.net` embed URL, Close's
      confirm dialog works both ways, rename persists) -- except the actual draw.io load/save
      postMessage handshake itself, which that session's sandbox couldn't reach over the network
      to verify directly; implemented faithfully from the documented protocol and legacy's own
      working code, but wants a real check with network access before being fully trusted.
    - ❌ **Mind Map** — not started. Scoped as a full canvas editor (pan/zoom/drag/connect/edit
      nodes), not a minimal list-based stand-in.

### 6.4 — Backlinks & `#tags` mentions
`[[@mention]]` backlinks: not built at all yet (Tags themselves shipped in the previous PRs
(#118/#119) — this phase is the remaining "Backlinks" half of that checklist section).

**Status: complete.** Four slices landed, the general mention infrastructure used throughout the
outline (§6.3 item 7's own Note-panel-specific display of it, #164, is tracked under §6.3 above
since that's its actual scope per this phase's own listing there):
- Pure query/mutation layer (#159) — `getBacklinkRefs`/`getBacklinksTo`/`cleanupBacklinksFor`/
  `renameBacklinksFor`/`findNodeByText` in `core/backlinks.ts`, direct ports of legacy's own
  functions (legacy/index.html:20087-20142). No UI wired to any of it yet at this point — this
  slice is the tested logic layer the next three build on.
- `[[wikilink]]` rendering as a clickable link, with click-to-navigate (#160).
- `@`-mention autocomplete for inserting a reference while editing (#161) — direct port of
  legacy's own `_atState`/`openAtSuggest`/`handleAtInput`/`commitAtSuggest`
  (legacy/index.html:20185-20289, 26956-26959), adapted for this project's uncontrolled inline-
  edit `<input>`: typing `@` opens a substring-filtered dropdown, ArrowUp/Down/Enter/Tab/Escape
  navigate and commit, commits by splicing `[[Target Text]]` into the input's DOM value at the
  `@query` span. Verified end-to-end in a real headless-Chrome browser (dropdown renders,
  candidate highlights, commit produces the right text, rendered pill is clickable and navigates)
  before merging, not just typecheck/lint/test/build.
- Cleanup/rename wiring (#163) — `commitEdit` now rewrites every `[[mention]]` of a renamed node
  via `renameBacklinksFor`; `deleteNode`/`deleteSelected` now strip `[[mentions]]` of every
  deleted node (including whole-subtree deletes) via `cleanupBacklinksFor`. Direct port of
  legacy's own commit-time/delete-time call sites (legacy/index.html:19315, 20856-20859,
  20871-20876). Verified end-to-end in a real browser: renaming a mentioned node live-updates
  the pill elsewhere; deleting it cleanly strips the mention while the referencing node's own
  text stays intact.

### 6.5 — Hub full depth
To-Dos (priority/status/due-dates/subtasks/repeat/filtering/sorting/bulk-actions/tags/PDF
export), Meeting Notes (templates, action items, Promote-to-To-Do, PDF export, Share/Import),
Journal (editing, tags, rich text, calendar popover, PDF export, search), Library (favorites,
tag filtering, rich text, images), Recap (Today/This Week/Last Week grouping, click-to-jump,
document-level activity grouping now that Documents & Tabs exists), Mobile Hub.

### 6.6 — Preview, Presenter & Export
Preview: TOC, scroll-spy, progress bar. Presenter mode: laser pointer, blackout, grid, timer,
floating notes, Whiteboard, Audience View, closing slide. Word/PDF/PowerPoint exports up to
their full documented fidelity (heading styles, TOC, Decision Log cards, rich formatting, image
embedding, branding). Plain text/Excel/clipboard export, Sakura Document (`.sakura.json`)
format, Word/OPML import.

### 6.7 — Theming & Appearance
Auto theme (System/Schedule), accent color (all seven), Chrome background presets, node text
color presets, Editor's Choice / Documentation Mode presets, full layout controls (tree lines,
depth guides, row style, compact rows, text size, indent width, collapse depth), inline
note/remark/Q&A previews.

### 6.8 — Account, Sync, Sharing & Data
Email/password sign-in, autosave on doc sync (currently manual push), sharing
(view/edit/notifications), sync health indicator, two-tier automatic backup (IndexedDB mirror +
auto-backup-to-file), full Export/Import (whole-app JSON), Version History.

### 6.9 — AI Features
Provider configuration UI, API key storage (with Secure Storage encryption), all seven
providers, Rewrite (incl. auto-rewrite on commit), Generate Outline, Restructure Text, Expand
node, Suggest tags, Suggest icon, Summarise selection, provider fallback, usage tracking. This
is the single largest unbuilt section in the checklist — budget accordingly, and expect it to be
its own multi-PR sub-sequence.

### 6.10 — Quick Assist, Quick Insert & Settings
Quick Assist (Ctrl/Cmd+K command box: toggles, search, Run actions, AI Run actions) and Quick
Insert (Ctrl/Cmd+Space character menu) — both entirely unbuilt. The Settings panel itself:
`web/` currently has no Settings surface at all; every toggle referenced by earlier phases
(feature on/off switches, per-panel settings, right-click menu customization, etc.) needs a real
home, so this phase's Settings-panel work runs partly in parallel with whichever earlier phase
introduces each toggle, not strictly after all of them.

### 6.11 — PWA & polish pass
Static precache strategy to match legacy's (`web/public/sw.js`'s current runtime cache-first is
a deliberate, documented simplification — revisit once Vite's hashed-filename asset manifest
can be precached at build time), maskable-icon verification, title-bar theme-color sync, a full
visual pass against Section 6.1's tokens now that every screen exists, to catch any component
that drifted from the shared system during individual feature phases.

## 9 — Pre-cutover gate (do this before touching `deploy.yml`)

Every item below, checked in that order, before any cutover PR is even opened:

1. `docs/history/phase5-parity-checklist.md` shows no remaining `❌` or `⚠` rows against this plan's scope.
2. A person — not a build log — opens the actual built `web/dist/` output (locally or on a
   preview URL) and uses it end-to-end: create a document, edit, sign in, sync, export, and
   exercise Hub/Pad/Presenter, watching for anything that doesn't look or behave like `legacy/`.
3. The same real-production-data caution `docSyncStore.ts` was built with from the start
   (Phase 4) is re-verified: sign in as a real account with real synced documents already in the
   production Firestore project, confirm they load correctly and round-trip without data loss.
4. Only then: a `deploy.yml` cutover PR, following the exact same explicit-and-separate
   discipline as the reverted attempt — except this time gated on the above, not on green CI
   alone.

## Status

**§6.1 complete** (#129–#130, #132–#138), **§6.2 complete** (#140–#148), **§6.3 in progress**
(#150–#158, #164, #172 — Diagrams landed, only Mind Map remains) and **§6.4
complete** (#159–#161, #163 — the mention infrastructure §6.3 item 7 depended on) — see each
section's own `Status:` line for the full breakdown. §6.5 onward not started. Update each
phase's own section above with a `Status:` line and PR numbers as work lands, the same way
`docs/history/phase5-parity-checklist.md`'s own "Update" notes track progress.

## Appendix — AI key vault (Cloudflare Worker), proposed

A separate proposal, not yet started, not yet scheduled against a specific phase: a Cloudflare
Worker exposing `POST /vault/key` (Firebase ID token auth, encrypts a pasted AI provider key at
rest via a Worker secret, stores it in KV keyed by Firebase UID) and `POST /ai/complete`
(same auth, decrypts in-memory only, forwards to the existing Groq → Gemini → Cerebras →
OpenRouter fallback chain, never returns the decrypted key). Goal: paste an AI key once, it
follows every device, and after that first paste the key never touches the browser again.

**This is new capability beyond parity, not a parity item.** Legacy's current BYOK story is
client-side only (per-device key entry, optionally synced via Secure Storage + Cloud Backup to
Gist/Drive) — there's no server-side proxy in legacy at all. Scoping this into the "look exactly
like today" goal would be a category error; it belongs here as an explicit addition on top of
parity, not folded into any phase's definition of "done."

**A simpler alternative exists using infrastructure already in place**: sync the (client-side
encrypted) key through Firestore the same way documents already sync, skipping a new
Cloudflare project/KV/secret-management surface entirely. The Worker's genuine differentiator
over that is that the key never touches the browser again after first entry (server-side decrypt
+ forward, vs. client-side decrypt each use) — worth it if that stronger guarantee is the actual
goal; not worth the added operational surface if "follows me across devices" is all that's
needed.

**Risk to flag if built as proposed**: a single Worker secret encrypting every user's stored key
is a single point of failure — acceptable at this project's current scale (a handful of users),
just don't let it read as more hardened than it is.

**Natural connection point**: this overlaps directly with §6.9 (AI Features, where `web/` first
gets any client-side AI provider calls to route through such a proxy) and the Firestore
debounce/`onSnapshot` concerns already named in §6.8. Building the vault meaningfully earlier
than §6.9 means it has nothing real to validate end-to-end against until then. Revisit and
decide final sequencing at that point, rather than committing to a slot now.
