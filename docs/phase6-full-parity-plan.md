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

**Status: complete.** All 11 top-level items landed; item 11 was itself three sub-features,
scoped and sequenced together (see that item's own breakdown below) — all 3 landed:
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
    - ✅ **Mind Map** (#174) — a genuinely freeform canvas (`components/MindMapCanvas.tsx`:
      pan/zoom/drag/connect/edit nodes, all hand-rolled mouse events, no canvas library in this
      project's deps), backed by its own dedicated `store/mindMapStore.ts` rather than folded
      into `padStore.ts` -- same reasoning the Hub panels each get their own store. Deliberately
      a simpler data model than legacy's real one: no parentId tree, no branch colors, no
      auto-layout modes -- links are the sole connection mechanism, an honest self-consistent
      simplification rather than a partial port. Deliberately not built: undo/redo, multi-select,
      node collapse, per-node color, snapping guides, and the Scratchpad/Presenter-mode/
      Audience-View integration legacy's own Mind Map has (this project's Presenter mode has none
      of that infrastructure yet either). Thorough real headless-Chrome verification across two
      sessions caught and fixed two real bugs before merge (not just confirmed the build): an
      Enter-to-commit-text keystroke was also re-triggering the window-level "Enter starts
      editing" shortcut on the same keypress (React 18 event-bubbling/passive-effect timing),
      and the connect-via-handle-drag interaction read a stale closure and (on the first fix
      attempt) called a store mutation as a side effect inside a `setState` updater -- both fixed
      properly, full interaction pass confirmed clean afterward with zero console
      errors/warnings.

This closes out §6.3.

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

*(This paragraph is the original scoping list, kept as-is for history — see each item's own
`Status:` bullet below for corrections found once actually checked against legacy: To-Dos'
"bulk-actions"/"tags" and Meeting Notes' "templates" turned out not to be real gaps.)*

**Status: complete.**
- ✅ **To-Dos, first piece** (#176) — priority/status/due-dates/repeat/subtasks, all wired to
  fields that were already real on the ported `Todo` type (`state/hubTodos.ts`) but had no UI
  until now, plus the already-ported `nextRepeatDate` (`hubTodos.ts`) and subtask CRUD
  (`addSubtaskCore`/`toggleSubtaskCore`/`removeSubtaskCore`, `state/hubSubtasks.ts`). Cycle
  order matches legacy's own real chip cycles exactly; repeat and subtasks stay mutually
  exclusive; checking a repeating task advances its due date instead of marking it done,
  matching legacy's real `completeTaskAnimated` exactly (minus the undo toast -- no toast system
  in this project yet). Each row gets an inline "Details" toggle rather than legacy's own modal
  task-detail sheet, same first-pass "simpler chrome" convention as every other Pad/Hub slice.
  Real headless-Chrome testing caught and fixed a genuine crash before merge (not just confirmed
  the build): the subtask-draft input's `onChange` read `e.currentTarget.value` inside a
  `setState` functional updater, which React 18 StrictMode's double-invocation-for-purity turns
  into a null-reference throw that unmounts the whole panel -- fixed by capturing the value
  synchronously outside the updater closure.
- ✅ **To-Dos, second piece** (#179) — search filtering, urgency-based sectioning (Overdue/
  Today/Upcoming/No Date, each sorted by due date), a collapsible sorted Completed section, and
  due-date reminder notifications (real `Notification` API, 5-minute standing check + on-mount
  check, click-to-focus around the already-ported `computeDueRemindersCore` in
  `state/hubReminders.ts`), all direct ports of legacy's own `renderTodos()`/`checkDueReminders()`
  (`state/hubTodoSections.ts` holds the pure sectioning/date-label logic). The reminders toggle
  lives directly in this panel's own header, since no Account/Settings panel exists anywhere in
  web/'s Hub yet for it to live in instead -- a documented placement decision, not a deferral.
  **Scoping correction**: this row's remaining named gaps in
  `docs/history/phase5-parity-checklist.md` -- "bulk-actions" and "tags" -- were checked directly
  against legacy/hub.html and legacy/index.html and don't exist anywhere in legacy's real To-Dos
  implementation (no todo has ever had a `tags` field; the only real bulk-select UI in legacy is
  on Diagrams/Q&A/sidebar/trash, not To-Dos). They're dropped from this plan's scope rather than
  built as invented capability, the checklist row corrected accordingly. Verified end-to-end in
  real headless Chrome: sections group correctly by due date, search narrows to open matches
  only, completed section sorts/collapses, no console/page errors.
- ✅ **Meeting Notes** (#181) — replaces the Phase 4 in-memory-only placeholder with real
  IndexedDB-backed persistence (`state/hubMeetings.ts`, direct port of legacy's own
  `normalizeMeetingNote`/`loadMeetingNotes`/`saveMeetingNotes`, including the same one-time
  localStorage-to-IndexedDB migration path Journal's own loader uses), time/attendees/agenda/
  body fields, action-item CRUD, and Promote-to-To-Do (`store/hubMeetingsStore.ts`'s
  `promoteActionItem`, calling a new `addTodoFromMeeting` on `hubTodosStore.ts` directly --
  matches legacy's real `addTodoExternal` exactly: the meeting's date becomes the new todo's
  due date, the meeting id+title become a `meetingRef`, and a second promote click on an
  already-promoted item is a no-op). `links` (cross-document node references),
  `outlookEventId`/`icsUid` (calendar-sync identity with no real sync mechanism built anywhere
  yet), and rich-text agenda/body (no rich-text infra exists for Hub panels) stay deliberately
  out of scope, same category as Files/Diagrams/Mind Map's own deferred node-linking in §6.3.
  **Scoping corrections**: legacy's own Meeting Notes lives entirely in index.html (desktop),
  not hub.html -- hub.html's own header (legacy/hub.html:38) explicitly scopes the mobile
  companion to To-Dos and Journal only, naming Meeting Notes as one of the desktop-only
  features it excludes. And "templates" in this row's checklist gap turned out to mean the
  create-new-meeting entry point, not real template content: legacy ships zero prebuilt
  meeting-note templates (`MEETING_TEMPLATES=[]`, a deliberate documented removal from a prior
  cleanup pass, not an oversight) -- `createMeeting()` provides the actual entry point, the
  checklist row corrected accordingly. Verified end-to-end in real headless Chrome: create →
  edit fields → attendees → action item → promote (real todo created with correct due
  date/meetingRef, button disables, second click is a no-op) → reload confirms persistence, no
  console/page errors.
- ✅ **Journal** (#185) -- replaces the Phase 4 placeholder (freeform create/delete,
  plain textarea) with legacy's real one-entry-per-date model (`hubJournalStore.ts`): a list of
  existing entries, each opening a single-entry card (direct port of legacy's own
  `openJournalEntry`/`showJournalCardView`, index.html:49188 area) to edit mood (click-again-to-
  clear) and body, plus a calendar popover (`JournalCalendarPopover` in `HubJournalPanel.tsx`) --
  a custom month-grid with Today/Yesterday/Tomorrow presets and has-entry dots, direct port of
  legacy's `#journal-date-popover` (index.html:49850-49898) -- to jump to or create any date's
  entry. Rich text matches legacy's own actual (narrower-than-Note-panel) toolset exactly:
  bullet/numbered-list toolbar buttons plus Ctrl/Cmd+B/I keyboard-shortcut-only bold/italic, no
  underline/strike/link/image/table (legacy's own Journal editor doesn't have those either,
  unlike NotePanel.tsx's fuller set). Also fixed a real data-compat bug found during
  investigation: web/'s `VALID_MOODS` had `'okay'` where legacy has `'neutral'` -- any entry
  synced from legacy with `mood:'neutral'` was silently normalizing to `''`.
  **Scoping corrections**: legacy itself has no tags UI for Journal anywhere (despite
  README.md:99 referencing "free-form tags" and the data model supporting them) -- a pre-existing
  doc/code mismatch, not built here as invented capability. Search is also out of scope: legacy's
  own Journal search lives only in the shared Quick Assist / hub-wide search bar, neither of
  which exists in web/ yet -- a real, separately-scoped follow-up, not a gap unique to this
  panel. Verified end-to-end in real headless Chrome: create/edit today's entry (rich text +
  mood), calendar popover navigation to another date, delete-with-confirm, and reload-persistence
  all confirmed with zero console/page errors. One real layout bug caught and fixed before merge:
  the calendar popover's first draft anchored `right: 0` off its trigger button, which sits close
  to the left sidebar -- on a real page load this rendered the popover partly underneath the
  sidebar's stacking region, made Playwright's own hit-testing fail a real click. Fixed by
  anchoring `left: 0` instead, growing into the open content area. Also confirmed (not fixed,
  correctly): a caret-jumps-to-start quirk when clicking the bullet-list button after typing
  existing text is an inherited, pre-existing `execCommand('insertUnorderedList')` browser
  quirk already present identically in NotePanel.tsx's own bullet-list button -- reproduced there
  independently to confirm it's shared behavior, not a regression introduced by this slice.
- ✅ **Library** (#187) -- replaces the
  Phase 4 placeholder (freeform title/url/description CRUD, in-memory only) with legacy's real
  model (`hubLibrary.ts`): real persistence, a `urlLabel` field, tags (add/remove, click-to-
  filter, toggle-active-filter-clears-it exactly matching legacy's own `setLibraryTagFilter`),
  favorites (per-item toggle plus a favorites-only view filter), search across title/url/
  urlLabel/tags/body text, and rich text matching Journal's own narrower toolset exactly
  (bullet/numbered list toolbar buttons + Ctrl/Cmd+B/I only -- legacy's own
  `#library-body-field` genuinely has the identical narrower toolset, not Note panel's fuller
  one). Sort order matches legacy's own real render sort: favorites first, then most-recently-
  modified within each group (`sortLibraryItemsCore`). One real, deliberate divergence pinned
  rather than unified: `normalizeLibraryItemCore`'s `createdAt`/`modifiedAt` validation uses the
  strict `Number.isFinite`, matching index.html's own real `normalizeLibraryItem` exactly --
  unlike Journal's hub.html counterpart, which genuinely uses the coercive global `isFinite`;
  the two originals really do differ, so this project preserves both instead of quietly
  standardizing on one.
  **Deliberately out of scope, each named in `hubLibrary.ts`'s own header:** AI rewrite (§6.9 not
  started), Version History browsable overlay/PDF export/the Settings-panel feature toggle
  (deferred to §6.6/§6.8/§6.10, same cross-cutting-infra category as To-Dos'/Meeting Notes' own
  deferred PDF export/Version History), Quick Assist/Global Search visibility (§6.10 not
  started), and pasted-image-only clipboard handling in the body editor (kept consistent with
  Journal's own already-narrower editor rather than giving Library a richer one). Verified
  end-to-end in real headless Chrome: create → fill title/url/urlLabel → rich-text body
  (bullet list + Ctrl+B) → add two tags → favorite → back to list (sorted correctly, favorite
  first) → create a second unfavorited entry → search narrows to a text match → tag-filter chip
  and favorites-only combine as an AND filter, matching legacy exactly → reload confirms
  persistence, zero console/page errors in both light and dark theme.
- ✅ **Recap** (#189) -- replaces the Phase 4
  placeholder (static counts + a "most recent N" list per Hub store) with legacy's real
  Today/This Week/Last Week period model (`hubRecap.ts`): `getRecapRange` ports `getReportRange`
  exactly (Monday-start weeks), and per-item created/completed/updated classification
  (`collectRecapTodoItems`/`collectRecapMeetingItems`/`collectRecapJournalItems`) covers the
  three Hub domains this project already tracks real `createdAt`/`modifiedAt`/`completedAt` on.
  Click-to-jump expands the matching row in its own panel below (`setFocusTodoId`/
  `setFocusMeetingId`, the latter a new field added to `hubMeetingsStore.ts` mirroring
  `hubTodosStore.ts`'s own pre-existing `focusTodoId` pattern from the due-reminder slice;
  Journal reused its already-existing `openEntry(date)`).
  **Real, deliberate scope reduction, each documented in `hubRecap.ts`'s own header:** no
  outline-node activity (items created/edited/completed inside documents) and no document-level
  grouping (legacy's `reportGetAllDocNodeSets`/`reportGroupByDoc`) -- `web/`'s own `OutlineNode`
  has no `createdAt`/`modifiedAt`/`completedAt` fields on individual nodes at all yet, a genuine
  cross-cutting change to the node shape and the doc round-trip/sync format, not something this
  slice can honestly do as a side effect; no Decision Log/Diagrams/Q&A/Mind Map activity (same
  blocker); no AI bullet-summary (§6.9 not started). **Scoping correction**: Library was never
  part of legacy's own Recap scan (`buildActivityReport` never reads `libraryItems`, checked
  directly against legacy/index.html:51964-52036) -- the Phase 4 placeholder's "Library items"
  stat was never a real parity target, dropped rather than carried forward. Verified end-to-end
  in real headless Chrome: Today/This Week/Last Week tabs filter correctly (a todo/meeting/
  journal entry created today shows under Today and This Week, not Last Week, which correctly
  reads all-zero/"Nothing here yet"), and clicking a Recap row for both a to-do and a meeting
  note expands that exact item in its own panel below, zero console/page errors.
- ✅ **Mobile Hub** (#191) -- the last
  §6.5 item. Legacy's real `hub.html` (legacy/hub.html) is a wholly separate mobile-native page,
  required-account-sign-in-gated, built specifically to bridge a phone's otherwise-empty local
  storage with a desktop's data via Firestore sync. `web/` has neither piece of infra that
  premise depends on: no client-side routing at all (decision #3,
  docs/framework-migration-plan.md) and no Hub-domain Firestore sync (§6.8, not started). A real
  scope reduction was agreed with the user before building anything (a genuine architectural
  blocker, same category as Recap's `OutlineNode`-timestamps gap): **responsive layout only** --
  a live viewport-width breakpoint (`useIsMobileViewport.ts`, 640px) swaps in a dedicated
  `MobileHub.tsx` in place of the entire desktop layout, reading the exact same local
  `hubTodosStore.ts`/`hubJournalStore.ts` data desktop does (nothing to bridge, so no sign-in
  gate -- a real, honest simplification, not a deferral). Everything legacy's real mobile page
  actually does once past its sign-in wall is built faithfully: `SwipeRow.tsx` is a direct port
  of legacy's own `initSwipeList`/`swipeRowShell` gesture engine (legacy/hub.html:903-1016) --
  same pointer-event state machine, same tuning constants, same tap-vs-swipe-vs-scroll
  disambiguation; `BottomSheet.tsx` ports legacy's own reusable bottom-sheet shell
  (legacy/hub.html:256-291); `MobileHubTodos.tsx`/`MobileHubJournal.tsx` reuse every existing
  store action (priority/status/repeat chips, due date, subtasks, mood, rich text) with zero new
  business logic, only a new UI shell -- plus one new real capability, `updateTodoText` on
  `hubTodosStore.ts`, matching legacy's own editable `#task-detail-text` field
  (legacy/hub.html:297-298), which `HubTodosPanel.tsx`'s desktop "Details" section never had a
  field for. Deliberately not ported: the one-time swipe-gesture nudge animation, haptic
  feedback on long-press, the account menu/search bar/offline banner/personalized greeting
  header (this view bypasses `AppShell` entirely, so there is currently no way to toggle theme
  from within it either -- a real, honest gap, not silently dropped). A real bug caught and
  fixed before merge, not just confirmed the build: an initial `data-no-swipe` guard on
  `SwipeRow.tsx`'s pointer-down handler unconditionally blocked tap-to-open on every row's own
  content (the exact area meant to be tappable), caught by real mobile-emulated headless-Chrome
  testing (a synthetic click produced no bottom sheet) before it ever reached a device. Verified
  end-to-end in real headless Chrome with iPhone 13 emulation + touch: tap-to-open a task/journal
  entry, a real pointer-drag swipe-left reveals and triggers delete, priority-chip cycling and
  subtask add both persist and re-render correctly, dark theme propagates correctly when set at
  desktop width before resizing into the mobile breakpoint (same session, no reload) -- zero
  console/page errors throughout.

This closes out §6.5 -- all six items (To-Dos, Meeting Notes, Journal, Library, Recap, Mobile
Hub) now landed.

### 6.6 — Preview, Presenter & Export
Preview: TOC, scroll-spy, progress bar. Presenter mode: laser pointer, blackout, grid, timer,
floating notes, Whiteboard, Audience View, closing slide. Word/PDF/PowerPoint exports up to
their full documented fidelity (heading styles, TOC, Decision Log cards, rich formatting, image
embedding, branding). Plain text/Excel/clipboard export, Sakura Document (`.sakura.json`)
format, Word/OPML import.

**Status: in progress.**
- ✅ **Preview: TOC, scroll-spy, progress bar** (#194) -- direct
  port of legacy's real `renderPreviewToc`/`setupPreviewScrollSpy`/`updatePreviewProgress`
  (legacy/index.html:37957+, 38426-38449). `state/previewToc.ts`'s `buildTocEntries` is a pure
  function matching legacy's exact TOC-entry logic: a `[Section]`-marked node always contributes
  a level-1 entry, a node with `styles.heading` (1-6, already real since §6.2's rich-formatting
  slice) contributes an entry at its own level, every other node contributes nothing. Scroll-spy
  in `PreviewPane.tsx` matches legacy's real `IntersectionObserver` setup exactly -- same
  `root`/`rootMargin:'0px 0px -70% 0px'`/`threshold:0` -- including a real, deliberately
  preserved quirk: the active entry comes from the current observer callback batch's own
  `entries` list, not a persistent "currently intersecting" set accumulated across calls,
  matching legacy's own actual logic (not "fixed" during this port, same practice as this
  project's other pinned legacy quirks, e.g. `diagramAnchor.ts`'s forward/backward drag
  asymmetry). Click-to-scroll (`PreviewToc.tsx`) matches legacy's real `previewScrollToNode`:
  `scrollIntoView({block:'start'})` respecting `prefers-reduced-motion`, plus a brief background
  flash on the target row. Deliberately not ported: `sectionMarkersDepthZero` (no Settings panel
  exists anywhere in `web/` yet to hold that preference, §6.10 not started -- uses the narrower,
  always-correct `isSectionNodeText` check instead of guessing a default), TOC collapse/resize,
  Decision Log TOC entries (Decision Log detection isn't ported to Preview at all yet), slide-
  divider TOC entries (a Presenter Mode navigation aid, not something Preview's read-through TOC
  needs -- Presenter Mode itself is still this section's own unscoped remaining item).
  **Real finding, deliberately not fixed here (out of scope, unrelated to this slice):**
  real headless-Chrome testing under rapid programmatic node creation (many `Enter`-chained
  `newSiblingBelow` calls in quick succession) reproducibly produced two nodes sharing the same
  `id` (a React "duplicate key" warning in both `OutlineTree.tsx` and this slice's own
  `PreviewPane.tsx`/`PreviewToc.tsx`, confirmed via `node.id`-keyed `.map()` calls in both, not a
  React-key-usage mistake -- the underlying `nodes` array itself has the duplicate). This lives
  entirely in `outlineStore.ts`'s pre-existing `newSiblingBelow`/`nextId` node-creation path
  (§6.2, untouched by this slice, which only reads `nodes`) -- a real bug worth a dedicated
  investigation, but pulling it into a Preview-scoped PR would be real scope creep. Not
  reproduced via normal-paced human typing in this session's own testing; flagged here as a
  known open item for whoever picks it up next.
- ✅ **Plain text (Tree .txt) + Copy as Text (clipboard)** -- direct port of legacy's real
  `exportTreeFormat`/`exportToClipboard(forceFull=true)` (legacy/index.html:21964-21966).
  `ExportButtons.tsx` wires up two Phase-1-ported-but-previously-unwired pure functions:
  `serializeTreeTextCore` (the ASCII tree, `├──`/`└──`/`│` connectors from `buildPrefix`) for
  both the `.txt` download and the clipboard's `text/plain` payload, and
  `serializeClipboardHtmlCore` (colored, styled HTML matching the editor's own semantic-marker
  rendering) for the clipboard's `text/html` payload -- written together via a single
  `ClipboardItem`, with an `execCommand('copy')` plain-text fallback when the Clipboard API/
  `ClipboardItem` isn't available, matching legacy exactly. `treeIndentWidth=3`/
  `hideTreeLines=true`/`outlineNumbering=false` are hardcoded to legacy's own real first-run
  defaults, same "no silent default for a live user-preference toggle that doesn't exist here
  yet" deferral already used for `exportMarkdown`'s `outlineNumbering`. Deliberately scoped down
  from legacy's own `exportToClipboard`: no subset/selection support (always the whole tree --
  web/ has no multi-node export-selection concept yet) and no Sakura-specific decision-log/
  diagram clip-payload comment embedded in the HTML (Decision Log has no panel/store in web/
  yet -- see the Excel item below). Verified end-to-end in real headless Chrome: `.txt` downloads
  the correct ASCII tree, "Copy as Text" clipboard-writes both a matching `text/plain` and a
  correctly-styled `text/html` payload, zero console/page errors.
- ✅ **Excel (Decision Log .xlsx) landed (§6.7).** Decision Log now being a real feature
  (`padStore.ts`'s `decisions`, the Pad's own tab), this is no longer blocked -- see the §6.7
  section below for the full slice (`exportDecisionLogXlsx`, direct port of legacy's real
  function of the same name, legacy/index.html:33107). Scoped specifically to Decision Log data
  (timestamp, author, linked node's text, the 5 structured fields, status) via `xlsx` (SheetJS)
  `XLSX.writeFile` -- it is *not* a general outline-to-spreadsheet export, matching legacy's own
  real scope exactly.
- ✅ **Presenter Mode depth (timer, blackout, laser pointer, overview grid, closing slide)** --
  direct port of legacy's real `startPresenterTimer`/`setPresenterBlank`/`previewSetLaser`/
  `openPresenterOverview`/closing-slide logic (legacy/index.html:38514-38689,37921-37936). Timer
  is a plain running clock from mount (`useEffect`, matching legacy's h:mm:ss/m:ss format
  exactly). Blackout (`B` key or button) is a pure screen-level overlay -- the slide underneath
  is untouched, matching legacy's own comment on the feature. Laser pointer is a
  `position:fixed` dot tracking the mouse while active (native cursor hidden), same size/color/
  glow as legacy's `#preview-laser-dot`. Overview grid (`G` key or button) is label-based, not
  live thumbnails, matching `openPresenterOverview`'s own stated reasoning (a screenshot per
  slide is a lot of machinery for what's really just a faster way to jump around during Q&A) --
  `slideLabel` is a pure function matching legacy's exact per-slide label logic. Closing slide is
  a real extra slide appended after the last content slide, included in slide count/navigation/
  overview exactly like legacy's own `previewSlideList.push({nodeId:null,...})`; text/subtitle
  hardcoded to legacy's own real defaults ("Thank you"/"Questions?") since no Settings panel
  exists yet. Deliberately still not ported: Audience View/dual-screen and Whiteboard mirroring
  (see the corrected scoping bullet directly below -- an earlier draft of this comment wrongly
  blamed "no client-side routing," which turned out not to be the real blocker once actually
  investigated); floating Notes/Q&A during presenting
  (legacy relocates the real Pad DOM nodes into a floating panel -- porting this well wants its
  own design pass on how `PadPanel.tsx`'s store-backed content should share itself between the
  normal Pad dock and a floating-during-Presenter view). Verified end-to-end in real headless
  Chrome: timer ticks, `G` opens the overview grid (closing-slide card included), `End` jumps to
  the closing slide showing "Thank you"/"Questions?", `Home` returns, `B` toggles the blackout
  overlay, the laser toggle button + mousemove renders the tracking dot -- zero console/page
  errors throughout.
- **Audience View/dual-screen + Whiteboard mirroring, re-investigated and re-scoped -- the real
  blocker is NOT client-side routing.** Read legacy's actual real implementation end to end
  (legacy/index.html:38691-39096, 4489-4497, 38969-39003) rather than trusting this plan's own
  prior "no client-side routing" framing (a real, corrected mislabel -- flagged rather than
  quietly fixed, same discipline as the 'schedule' theme-mode and Chrome-preset corrections
  elsewhere in this doc). What legacy actually does: `openAudienceWindow()` calls
  `window.open(url, 'sakura-audience-view', 'width=1280,height=720,...')` where `url` is THIS
  SAME `index.html`, with `?sakuraAudience=1` appended as a query param -- not a path, so it
  needs zero path-based routing infrastructure to serve (a static host or dev server already
  returns the same `index.html`/bundle for any query string on `/`, since query strings never
  participate in routing/rewrite rules at all). A synchronous inline `<script>` very early in
  `<head>` (before the body's markup exists) checks that param via regex on `location.search`
  and adds a `visibility:hidden` class to `<html>` so the normal editor UI never flashes visible
  in the second window before it's ready. Once that window's own boot finishes
  (`SAKURA_AUDIENCE_MODE` block, a `window.load` listener plus a 300ms settle delay for
  IndexedDB/tab-restore to finish), it un-hides, skips the welcome/tour overlays, shows a
  click-or-`F`-to-fullscreen hint (a cross-window `requestFullscreen()` call has no real user
  gesture behind it and gets silently blocked), and calls `window.opener.audienceWindowReady
  (window)` to hand control back to the opener. From there the opener drives it directly --
  same-origin `window.open()` returns a real handle to the child window's own global scope, so
  the opener calls functions that already exist in ITS loaded copy of the app
  (`win.switchDoc(id)`, `win.openPreview()`, `win.enterPresenterMode()`, etc.) rather than
  cloning or diffing DOM -- no `postMessage` anywhere in this mechanism. State reads go through
  a small function (`win.sakuraGetAudienceState()`) rather than direct property access, since
  legacy's own comment explains why: top-level `let`/`const` bindings never become `window`
  properties (unlike `var` or function declarations), so a bare `win.previewSlideIndex` always
  reads back `undefined` -- only a function call executing in the target window's own scope and
  returning a value by copy works. Ongoing content sync (`syncAudienceWindow`) re-clones the
  relevant container's real HTML into the child window on navigation/toggle/content-change (not
  per-frame -- mousemove for the laser pointer is the one exception); Whiteboard mirroring layers
  on top of this same connection, syncing the draw.io iframe's XML via `syncAudienceWhiteboard`/
  a poll loop that starts once presenting+Audience+Whiteboard are all simultaneously live.
  **Concrete translation to `web/`'s actual architecture, for whoever picks this up next:** (1)
  the query-param boot check translates directly and cheaply -- a single
  `new URLSearchParams(location.search).get('sakuraAudience') === '1'` read at the app root, no
  router library, no path route, nothing Phase 0's actual no-client-side-routing decision
  (docs/framework-migration-plan.md decision #3) was ever about; (2) the REAL blocker is that
  `PresenterMode.tsx`'s slide index/blanked/laser/overview/notes state is all local
  `useState` inside that one component, not a Zustand store -- legacy's whole cross-window
  design depends on being able to call a function in the OTHER window's own scope to change
  its state and trigger ITS OWN re-render; `web/`'s equivalent needs that presenting state
  lifted into a real store (a new `usePresenterStore.ts`) before a second window's own React
  tree has anything external to be driven by; (3) the direct-global-function-call mechanism
  itself translates naturally once that store exists -- expose a small stable bridge object on
  `window` at app boot (e.g. `window.__sakuraAudience = { getState, switchDoc, enterPresenterMode,
  ... }`, populated once from the store's own actions), and the opener calls it through the
  `Window` handle `window.open()` already returns, exactly like legacy calls `win.switchDoc`;
  (4) unlike legacy's manual DOM-cloning, the second window can just run its OWN full React app
  instance (same bundle, same file, exactly like legacy's "real second navigation" of the same
  `index.html`) and have it re-render itself off ITS OWN store, which the opener's bridge calls
  update directly -- store-driven re-render is a more natural fit for this project's actual
  architecture than legacy's own HTML-clone approach, not a compromise; (5) Whiteboard mirroring
  is a separate, later layer on top of all of the above, and additionally needs `web/`'s Diagrams
  panel to have a real Whiteboard concept at all (`isWhiteboard`-flagged diagram, matching
  legacy's own `openOrCreateWhiteboard`) before there is anything to mirror -- confirmed NOT
  built yet: `padStore.ts`'s own `Diagram` type explicitly excludes `isWhiteboard`, listed
  alongside `anchorNodeId`/`status`/`previewSvg`/`pageCount` as deliberately-deferred fields from
  its original §6.3 item 11 slice (#172). Multi-window popup coordination is also meaningfully
  harder to verify than every other slice's real-headless-Chrome-in-one-window testing this
  project has relied on throughout, so the actual multi-window build is flagged as a real,
  scoped, buildable plan rather than attempted in the same pass as this investigation.
- ✅ **Step (2) of the plan above landed: presenting state lifted into a real store.**
  `PresenterMode.tsx`'s slide index/blanked/laser/overview/notes/elapsed-timer state -- all
  local `useState` before this slice -- now lives in a new `usePresenterStore.ts` (a plain
  Zustand store, deliberately NOT persisted to `localStorage`, matching the exact ephemeral
  per-session behavior the local state it replaces already had). A pure refactor with no
  behavior change of its own: `enterPresenting()` resets every field on mount (replacing the
  old mount effect's `setElapsedSec(0)`/`startedAtRef.current=Date.now()` pair),
  `tickElapsed()` recomputes `elapsedSec` from a stored `startedAt` each second (replacing the
  old `setInterval` closure over a ref), and every setter/keyboard-shortcut/button handler now
  reads and writes the store instead of local state (React's `setX((v) => !v)` updater-function
  style doesn't exist on a plain Zustand setter, so each toggle site was rewritten as
  `setX(!x)`, reading the current value from the store the same render already has). This alone
  changes nothing about how Presenter Mode behaves -- it only makes that state reachable from
  outside the component, which is the real prerequisite item (2) needed: a future
  audience-window bridge (item 3 of the plan above) has a real store to read/drive once it
  exists. Verified end-to-end in real headless Chrome against a 3-real-slide-plus-closing-slide
  deck: Arrow-key/Next-button navigation, End/Home jumping to the closing and first slide,
  `B` blackout toggle, `G` overview grid (including click-to-jump), `N` Notes panel
  (open/Escape-close), the laser pointer (toggle + a real tracked mousemove rendering the dot),
  and the running elapsed timer -- all identical to pre-refactor behavior, zero console/page
  errors.
- ✅ **Step (1) of the plan above landed too (out of listed order -- (2) had to land first, (1)
  itself has no real dependency on it): the query-param boot check + a chromeless audience
  shell.** `state/audienceMode.ts`'s `isAudienceWindow(search)` is a direct, pure port of
  legacy's real `SAKURA_AUDIENCE_MODE=/[?&]sakuraAudience=1(&|$)/.test(location.search)`
  (legacy/index.html:38969), expressed via `URLSearchParams` instead of a regex (same match
  semantics -- only the literal `'1'`, no `=true`/`=yes` variant, matching legacy's own real
  behavior). `App.tsx` checks it before every other early-return branch (including the Mobile
  Hub breakpoint check), matching legacy's own real boot-time priority -- its detection runs
  synchronously before any other markup even paints. When true, `App.tsx` renders a new
  `AudienceWindow.tsx` instead of the entire normal editor shell: no sidebar, no toolbar, no
  document tabs, no Settings panel -- originally just `PresenterMode.tsx` reused as-is; the next
  bullet below explains why that later changed to a dedicated passive view. Since
  `DocumentTabs.tsx` (the component that normally calls
  `useDocumentsStore.getState().init()` on mount) never mounts in this branch,
  `AudienceWindow.tsx` calls `init()` itself, so this window still loads the real active
  document's persisted nodes from `localStorage` rather than staying on `outlineStore`'s own
  bare in-memory seed. Deliberately NOT yet the full mechanism: this is a standalone chromeless
  view, reachable only by navigating directly to the query param -- nothing opens it yet (step
  3 below), and nothing drives its state from another window yet (step 4 below); until the
  bridge exists, this window only ever shows whatever's already sitting in ITS OWN local
  storage. Verified end-to-end in real headless Chrome: the normal boot path is completely
  unaffected (Settings button, document tabs, editable outline all still present with no query
  param); with `?sakuraAudience=1`, none of that chrome renders, the same real persisted
  document's content shows through `PresenterMode` instead (confirmed against both the fresh
  seed document and a real multi-node document edited and autosaved in a prior normal-boot
  visit to the same origin) -- zero console/page errors across both paths.
- ✅ **Steps (3) and (4) landed: the real cross-window bridge, the "Open Audience View" trigger,
  and a passive driven display.** Audience View is now a genuinely working feature end to end,
  not just a boot path. `state/audienceBridge.ts`'s `installAudienceBridge()` (called once from
  `main.tsx`, unconditionally, on every window regardless of role) exposes
  `window.__sakuraAudience.setSyncState` -- the direct equivalent of legacy's own pattern of
  always defining cross-window functions like `switchDoc` on every window. `openAudienceWindow()`
  is a direct port of legacy's real `openAudienceWindow` (legacy/index.html:38718-38734, same
  popup feature string), returning a real handle into the new window's own scope since it's the
  same origin. `AudienceWindow.tsx` signals readiness via
  `window.opener.__sakuraAudienceChildReady(window)` on mount -- the direct equivalent of
  legacy's own `window.opener.audienceWindowReady(window)` (legacy/index.html:39000), waiting for
  an explicit signal rather than guessing a fixed delay, same reasoning legacy's own comment
  gives. Once ready, the opener pushes the current presenting state immediately, then keeps
  pushing on every subsequent `usePresenterStore` change via Zustand's own `subscribe` API --
  simpler than legacy's manual poll/DOM-clone approach, since a subscription callback already
  fires exactly on every real state change. A new `audienceWindowOpen` field on
  `usePresenterStore` (deliberately excluded from the synced subset -- a driven window never
  opens a further audience window of its own) drives a real "Open Audience View"/"Close Audience
  View" toggle button in `PresenterMode.tsx`'s own toolbar, reactive to the popup actually
  closing (detected via a 1s poll, matching legacy's own `startAudienceWinPoll`, since there's no
  DOM event to subscribe to for that). The click-or-`F`-to-fullscreen hint is a direct port of
  legacy's own real one (legacy/index.html:38985-38993) -- a cross-window `requestFullscreen()`
  call has no genuine user gesture behind it and is silently blocked, so this needs a real click
  or keypress inside the audience window itself. **A real architectural correction made in the
  same slice:** `AudienceWindow.tsx` no longer renders the full `PresenterMode.tsx` (which it did
  in step (2), since nothing was driving it yet) -- it now renders a new
  `PresenterSlideView.tsx`, the passive slide-content block extracted out of `PresenterMode.tsx`
  (which still renders it internally via a new `interactive` prop, unchanged in its own
  behavior). Legacy's real Audience window has none of its own interactive Prev/Next buttons or
  keyboard shortcuts -- only the plain presenting surface -- and `web/`'s should not either: a
  second window with its own live controls would fight the state the bridge pushes into it. The
  pure slide-deck helpers (`groupIntoSlides`/`slideLabel`/`formatElapsed`) and shared constants
  moved to a new `state/presenterSlides.ts` in the same slice, purely to break the resulting
  circular import between `PresenterMode.tsx` (which now needs to import `PresenterSlideView.tsx`
  to render it) and `PresenterSlideView.tsx` (which needs those same helpers) -- still re-exported
  from `PresenterMode.tsx` unchanged, so nothing importing them from there needed to change.
  Verified end-to-end in real headless Chrome with two real coordinated browser windows/pages
  (Playwright's own popup-capture, `context.waitForEvent('page')`, catching the real
  `window.open()` call): the popup opens with the correct query param and no editor chrome,
  shows the fullscreen hint, correctly mirrors the opener's slide navigation, blackout toggle,
  and a real tracked laser-pointer position live, and closes cleanly via the opener's own button
  (with the button's own label reverting correctly) -- zero console/page errors on either window
  throughout.
- Step (5) (Whiteboard mirroring, blocked on Diagrams getting a real `isWhiteboard` concept)
  remains not started -- the only piece of this plan still open.
- ✅ **Word export: heading styles + TOC field.** A node with `styles.heading` set (1-6,
  already a real field since §6.2) now renders as a genuine Word heading paragraph
  (`docx`'s `HeadingLevel.HEADING_1`..`HEADING_6`) instead of a flat indented line, and the
  export opens with a real Word TOC field (`TableOfContents`, `headingStyleRange: '1-6'`) --
  the same field-based mechanism Word's own "Insert > Table of Contents" produces. Like any
  Word TOC field, it shows placeholder text until the reader updates it in Word (F9, or
  Word's own "Update Table" prompt) -- a real, documented Word behavior, not a bug in this
  export. A heading node's checkbox prefix/depth-indent are dropped for that paragraph (a
  Word heading style already carries its own visual weight; combining it with a manual
  indent would fight the style). Verified end-to-end in real headless Chrome: typed a
  markdown-style `# heading` prefix (outlineStore.ts's existing auto-convert-to-heading
  logic), exported .docx, unzipped the result and confirmed `word/document.xml` contains a
  real `Heading1` style reference, a TOC field code, and the heading's own text -- a
  well-formed OOXML package, zero console/page errors.
- ✅ **PDF export: cover page.** Direct port of legacy's real `printHtmlAsPdf` cover-page block
  (legacy/index.html:39681-39702) -- a wordmark, the document's own title, an accent rule, and a
  meta line (word count, estimated read time, last-modified date), all on their own page via
  `page-break-after: always` before the outline content, matching legacy's own `.has-cover-page`
  CSS approach. Scoped down: no author line (`web/`'s `DocSummary` has no author field yet, a
  document-model gap, not a small omission) and no decision-count in the meta line (Decision Log
  is now a real feature in `web/`, §6.7, but wiring its count into this specific meta line hasn't
  been done -- a small, separately-scoped follow-up, not blocked on anything). The
  wordmark text ("S A K U R A") is legacy's own real default (`getBrandingDisplayText`'s
  fallback), hardcoded since no Settings panel exists yet to hold the branding-toggle/custom-text
  preferences. Verified end-to-end in real headless Chrome: exported PDF, inspected the print
  popup's own DOM directly (word count/read time/last-modified all computed and rendered
  correctly, document `<title>` set to the doc's real title), zero console/page errors.
- ✅ **PowerPoint export: Notepad slide, Q&A slide(s), closing slide.** A Notepad slide (Pad's
  plain-text `notesText`, if non-empty) and Q&A slide (Pad's `qaItems` -- question bold, answer
  below, "No answer provided" for an unanswered one, matching legacy's own real wording) now
  follow the per-node slides, and a real closing slide (reusing `PresenterMode.tsx`'s own
  exported `CLOSING_SLIDE_TEXT`/`CLOSING_SLIDE_SUBTITLE` constants -- the same defaults Presenter
  Mode's own closing slide uses, so the two features share one source of truth instead of a
  second hardcoded "Thank you"/"Questions?") is always the genuine last slide in the deck,
  matching legacy's own real ordering (per-node slides, then Notepad, then Q&A, then closing).
  Scoped down from legacy's real Notepad/Q&A slides: no pagination/overflow onto a "(cont'd)"
  slide when content doesn't fit the box (legacy measures real wrapped-line heights against the
  actual font to decide where to split -- a lot of machinery for a real, separately-scoped
  follow-up; unusually long content here just overflows its text box visually in the viewer,
  still fully present and editable in the underlying shape), no table/chart promotion (`web/`'s
  Notepad is a plain `<textarea>`, not a rich editor with an embeddable table yet), no Q&A
  section headers (`web/`'s own `QaItem` has no section/title concept, a simpler model than
  legacy's). Verified end-to-end in real headless Chrome: filled Notepad text and added a Q&A
  item via the Pad panel, exported .pptx, unzipped the result and confirmed all four expected
  slides (per-node, Notepad with its real text, Q&A with the real question+answer, closing with
  "Thank you"/"Questions?") -- a well-formed OOXML package, zero console/page errors.
- ✅ **OPML import.** Direct port of legacy's real `parseOpmlToTreeNodes`/`importOpmlText`
  (legacy/index.html:24560-24601) -- the read side of the already-ported `serializeOpmlCore`. A
  new pure function, `parseOpmlToTreeNodesCore` (`utils/parseOpml.ts`), walks an
  `<opml><body>`'s `<outline>` elements depth-first via `DOMParser`, reads each one's `text`
  attribute (falling back to `title`, matching legacy's own OPML-spec leniency) and its
  Sakura-specific `_note` attribute, and parses a leading `[ ]`/`[x]` in the text back out as a
  checkbox state (OPML has no native checkbox concept, so `serializeOpmlCore` already encodes it
  as a plain text prefix -- this is that encoding's exact inverse). Wired into a new "Import
  .opml" button + hidden file input in `ExportButtons.tsx` (no Import menu exists yet in `web/`
  to house it properly, same "simpler chrome" convention every export button here already uses).
  Always lands in a brand-new document (`newDocument()`), matching legacy's own real guarantee
  that an import can never silently merge into whatever document happens to be open already;
  node ids are assigned from the outline store's own `nextId` counter (the same convention every
  other node-creation path in this store uses, e.g. `duplicateRootIndexesCore`), and
  `rebuildParentIdsCore` derives each node's real `parentId` from the parsed depth values
  afterward. Verified end-to-end in real headless Chrome: imported a hand-written OPML file with
  nested outlines, a `_note` attribute, and both an unchecked and a checked checkbox node --
  confirmed the new document renders the full correct tree (all 5 nodes, correct nesting,
  correct checkbox states), and confirmed via the actual persisted `localStorage` doc record
  (after the 800ms debounced autosave) that `parentId` linking, `note`, and every field landed
  correctly -- zero console/page errors.
- ✅ **Sakura Document (`.sakura.json`) export/import.** Direct port of legacy's real
  `exportSakuraDocumentFile`/`importSakuraDocumentFile` (legacy/index.html:22038-22136), scoped
  to what's genuinely real and document-scoped in `web/` today: the outline itself,
  full-fidelity -- unlike OPML (which loses `styles`/`tags`/`codeBlock` through OPML's own
  text-only format), this payload IS the store's own real `OutlineNode[]` shape, not a lossy
  encoding of it. **Real, deliberate scope reduction, worth flagging clearly:** legacy's own
  real payload also bundles Pad content (`pad`/`qa`/`diagrams`/`mindMaps`/`decisionLogs`/
  `attachments`/`remarks`), because in legacy every one of those is genuinely per-document data.
  Investigated directly before scoping (checked `documentsStore.ts`'s own `StoredDoc` shape and
  `padStore.ts` in full): in `web/` today, `usePadStore` is a single flat, in-memory-only,
  APP-WIDE store -- not scoped to any document, and not persisted anywhere at all (zero
  `localStorage`/`writeJson` calls in the entire file). There is no per-document Pad state in
  `web/` yet to export or import -- a real, separately-scoped architectural gap (Pad's own real
  persistence and doc-scoping was never built, a materially bigger item than "add export
  support" alone), not a small omission quietly bundled into this slice. Import always lands in
  a brand-new document (`newDocument()`), matching legacy's own real guarantee; unlike OPML
  import, node ids are kept exactly as exported rather than remapped (matching legacy's own real
  behavior: "no collision risk to remap away" since it's always a brand-new document), with the
  outline store's own `nextId` counter bumped past the highest imported id afterward.
  `parseSakuraDocumentCore` (`utils/parseSakuraDocument.ts`) normalizes each imported node
  defensively (safe defaults for a missing/malformed field, matching this project's other
  normalizers like `normalizeDecisionLogCore`) rather than trusting raw JSON directly, since --
  unlike OPML, which legacy itself only lightly validates -- a hand-edited or corrupted
  `.sakura.json` file is a more plausible real-world case worth guarding against. Verified
  end-to-end in real headless Chrome: set a node to a real heading level, exported
  `.sakura.json`, re-imported the same file, and confirmed full round-trip fidelity via the
  actual persisted `localStorage` doc record -- `styles.heading` preserved, node ids preserved
  exactly (not remapped), `parentId` correctly rebuilt -- zero console/page errors.
- ✅ **Word (.docx) import.** Direct port of legacy's real `importDocxFile`/
  `parseDocxHtmlToTreeNodes` (legacy/index.html:24604-24731). `mammoth` (npm, MIT/BSD-2-Clause,
  pinned to the same 1.11.0 version legacy loads from its CDN -- already listed in
  `THIRD-PARTY-NOTICES.md` at that exact version) converts the real `.docx` bytes to HTML the
  same way legacy's own browser build does; `parseDocxHtmlToTreeNodesCore`
  (`utils/parseDocxHtml.ts`) then walks that HTML into `{text,depth}` nodes via real
  heading/list/table structure, matching legacy's stack-based nesting logic exactly (headings
  push/pop a depth stack by relative level, list items nest under their own `<ul>`/`<ol>`,
  tables become one row per first-cell text with extra cells one level deeper, an image-only
  paragraph becomes a `[image]` placeholder leaf). Wired into a new "Import .docx" button next to
  the OPML/Sakura Document import buttons; always lands in a brand-new document, matching every
  other import path built this session. Deliberately NOT ported: the AI-restructure fallback for
  a flat wall of text with no heading styles (§6.9 not started -- `web/` has no AI capability to
  fall back to at all; legacy's own real behavior for an AI-off user is to import the flat list
  anyway with an explanatory toast, which is the one behavior this port matches, rather than
  inventing a new one) and the tree-connector-character (`│ ├─ └─`) detection fallback (hands off
  to legacy's own `parseTextToTreeNodes`/smart-paste, neither of which is ported to `web/` at all
  yet -- checked directly, zero hits anywhere in `web/src`). Verified end-to-end in real headless
  Chrome with an actual `.docx` file (built via the already-installed `docx` export library, so
  the test exercises a real OOXML round-trip, not synthetic HTML): imported a two-level heading
  document, confirmed the new document renders all four nodes with the correct text, and
  confirmed via the actual persisted `localStorage` doc record that depths (`[0,1,1,2]`) and
  `parentId` linking are both exactly correct -- zero console/page errors.
- ✅ **Branding wordmark (Word footer, PowerPoint corner, PDF per-page + cover, Presenter bar).**
  Direct port of legacy's real branding mechanism across every surface it appears on:
  `buildDocxPackage`'s footer (legacy/index.html:25247-25248), `pptxApplyBranding`
  (legacy/index.html:25554-25566), the PDF print stylesheet's `@page{@bottom-right{...}}` rule
  (legacy/index.html:39517-39532), and the always-visible `#presenter-branding` presenter-bar
  element. `BRANDING_TEXT` (`PresenterMode.tsx`, alongside the closing-slide constants) is now
  the one shared source of truth for the wordmark text ("S A K U R A", legacy's own real
  `getBrandingDisplayText()` fallback) across all four surfaces, rather than four separate
  hardcoded copies. Word gets a real page footer (`docx`'s own `Footer`/`AlignmentType.RIGHT`
  API) shown on every page; PowerPoint gets a small corner text box on every slide (per-node,
  Notepad, Q&A, and closing alike) positioned against this export's own real default slide size
  (10in x 5.625in -- this export has never matched legacy's custom 13.333in x 7.5in sizing, a
  separate pre-existing gap outside this slice); PDF gets both the cover-page wordmark (already
  built) and a genuine CSS Paged Media `@bottom-right` margin-box rule so it shows on every
  printed page, not just the cover; the live Presenter Mode bar gets the same small
  letter-spaced mark legacy's own bar shows. Always on (matches legacy's real code default --
  `previewPresenterBranding` is `true` in both the top-level global and `loadPrefs`'s own
  fallback; the Settings panel's own description text claims "off by default," a real,
  pre-existing doc/code mismatch in legacy itself that this port doesn't inherit, trusting the
  actual behavior over the stale description). No Settings panel exists in `web/` yet to make
  this toggleable or hold a custom wordmark override. Verified end-to-end in real headless
  Chrome: unzipped the exported `.docx` and confirmed the footer XML contains the branding text;
  unzipped the exported `.pptx` and confirmed every slide's XML carries it; inspected the PDF
  print popup's own stylesheet and confirmed the `@bottom-right` rule plus the cover-page
  wordmark; confirmed the mark renders live in the Presenter Mode bar -- zero console/page
  errors across all four.
- ✅ **PDF: page margins + footer (date, page count).** Direct port of legacy's real
  `printHtmlAsPdf` `@page` block (legacy/index.html:39518-39533). Margin hardcoded to
  `PDF_MARGIN_MM.normal` (20mm) -- legacy's own real default, no Settings panel exists yet to
  hold the narrow/wide alternatives. Footer is a real CSS Paged Media margin-box pair: today's
  date bottom-left, "Page X of Y" bottom-center via genuine `counter(page)`/`counter(pages)` (not
  a guess -- the browser's own print pagination engine computes these), always on matching
  legacy's own real `previewPdfFooterEnabled` default. A new `cssStr` helper matches legacy's own
  CSS-string-literal escaping exactly (backslash, the quote that would end the string early, no
  raw newlines). Verified end-to-end in real headless Chrome: inspected the print popup's own
  stylesheet and confirmed the full `@page` block -- `margin:20mm`, a real formatted date string,
  the literal `counter(page)`/`counter(pages)` CSS, and the branding rule all present and
  correctly escaped -- zero console/page errors.
- ✅ **Word: note image embedding.** Investigated before scoping (per this project's own
  "investigate before assuming" convention): checked `NotePanel.tsx`'s real "Insert image from
  file" action in full and confirmed a genuine image-in-note pathway already exists in `web/` --
  a node's `note` field can hold a real `data:` URI `<img>` tag, inserted via
  `execCommand('insertImage', ...)`, the same mechanism legacy's own `ntb-image` handler uses.
  `extractFirstImageDataUrl` (`utils/extractNoteImage.ts`) pulls that image back out; the
  `docx` library's own `ImageRun` API handles the real OOXML media-part/relationship plumbing
  internally (no hand-rolled XML needed, unlike legacy's own from-scratch implementation) --
  `decodeImageDataUrl` maps the four MIME types `ImageRun` accepts (png/jpg/gif/bmp; svg/webp are
  silently skipped, a real but narrow gap) to real bytes, and `loadImageDimensions` reads the
  image's true pixel size by actually loading it in the browser (simpler and more reliable than
  legacy's own hand-rolled PNG/JPEG/GIF header parser), scaled to a 400px max width. The image
  rides along as its own paragraph immediately after its node's own paragraph. First-image-only
  (matches legacy's own real one-picture-per-note model, not a new scope reduction). PowerPoint
  image embedding deliberately NOT included in this slice: PPTX slides are fixed-size canvases
  already mostly filled by bullet text, so naively placing images risks real visual overlap --
  legacy's own PPTX image placement relies on real text measurement to avoid this, a genuinely
  separate, bigger follow-up (Word's own paragraph-flow layout has no such collision risk, which
  is why it was safe to build now). Verified end-to-end in real headless Chrome: inserted a real
  PNG into a node's note via the actual "Insert image from file" UI, exported `.docx`, unzipped
  the result and confirmed a real image media part (`word/media/<hash>.png`, exact byte size
  matching the source image), a genuine `<w:drawing>` element in `document.xml`, and a real image
  relationship in `document.xml.rels` -- zero console/page errors.
- ✅ **Word: Notepad + Q&A sections.** Direct port of legacy's real `docxBuildNotepadSection`/
  `docxBuildQaSection` (legacy/index.html:24765-24824), mirroring the same content/wording
  already built for the PowerPoint export (§6.6, #200): a "Notepad" heading followed by Pad's
  plain-text `notesText` as its own paragraphs (if non-empty), and a "Q&A" heading followed by
  one question(bold)/answer(muted, indented) pair per `qaItem` -- "No answer provided" in italic
  muted for an unanswered one. Both use `docx`'s own `heading` paragraph option, so they show up
  in the TOC field and Word's Navigation Pane automatically (the TOC already built has
  `headingStyleRange:'1-6'`) without any extra bookmark plumbing, unlike legacy's own hand-rolled
  bookmark-and-TOC-entry wiring. Scoped down: no left-border accent rule on Q&A answers (`docx`'s
  current paragraph-border API doesn't expose a plain single-side border the way legacy's own
  hand-rolled OOXML does -- color and indent alone still distinguish an answer from its
  question). Verified end-to-end in real headless Chrome: filled Notepad text and added a Q&A
  item via the Pad panel, exported `.docx`, unzipped the result and confirmed both section
  headings and their real content are present in `document.xml` -- zero console/page errors.
- ✅ **PowerPoint: overflow "(cont'd)" slides.** Direct port of legacy's real per-slide
  pagination (legacy's own `pptxMeasureWrappedLines`/`pptxLineHeightIn`, both ported to
  `utils/wrapLineCount.ts`): when a node's bullets don't fit the box, the rest spill onto a new
  slide titled `<Title> (cont'd)` rather than getting visually clipped. `wrapLineCount`
  (`utils/wrapLineCount.ts`) is the pure greedy-wrap algorithm, DI'd against an injected
  `measureTextWidth` function so it's testable with a deterministic fake width function --
  `ExportButtons.tsx` supplies the real one, a canvas 2D context measuring against Calibri
  (Office's own default body font, not this app's UI font `Inter` -- same reasoning legacy's own
  comment gives: a web font won't actually be installed wherever the file is opened), with the
  same deliberately-oversized ~24% width buffer legacy's own comment documents so the
  measurement stays an under-estimate of available width across whatever font a reader's copy of
  PowerPoint/Keynote/Google Slides actually substitutes. Box width/available height are measured
  against THIS export's own real default slide size (10in x 5.625in, not legacy's 13.333x7.5 --
  same pre-existing sizing gap the branding-wordmark slice already documented). Notepad/Q&A
  slides do NOT get the same pagination in this slice -- porting the real-measurement approach to
  those too is a real, separately-scoped follow-up. Verified end-to-end in real headless Chrome:
  imported a 30-bullet test document via Sakura Document import, exported `.pptx`, unzipped the
  result and confirmed 5 real content slides (1 original + 4 genuine `(cont'd)` slides, apostrophe
  correctly OOXML-entity-escaped as `&apos;`) plus the closing slide, with all 30 bullets present
  exactly once across the deck -- zero console/page errors.
- ✅ **Presenter Mode: floating Notes/Q&A panel.** A read-only floating panel (bottom-right,
  toggled by a new "Notes (N)" button or the `n`/`N` key, closable via the same button, the key
  again, or Escape -- inserted into the existing Escape priority chain between `overviewOpen` and
  `blanked`) showing the document's real Pad-panel Notepad text and Q&A items live from
  `usePadStore`, so presenters can glance at their notes without leaving Presenter Mode. Scoped
  down from legacy's version: legacy has distinct shortcuts for Notes vs Q&A vs Remarks and no
  drag-to-reposition is ported -- this single combined panel and fixed position are a deliberate
  simplification, not an oversight. Verified end-to-end in real headless Chrome: filled Notepad
  text and added a Q&A item via the Pad panel, entered Presenter Mode, confirmed the panel is
  hidden by default, becomes visible on button click (notes text and the Q&A question/answer
  both present), closes on Escape, and toggles open/closed correctly via repeated `n` key
  presses -- zero console/page errors.
- ✅ **PowerPoint: Notepad/Q&A section pagination.** Extends the per-node overflow pagination
  from the slice above to the Notepad and Q&A slides too, reusing the same `measureWrappedLines`/
  `AVAIL_H`/`BOX_WIDTH_IN` machinery: a Notepad line or a Q&A question+answer pair that would
  overflow the current slide starts a new `<Title> (cont'd)` slide instead of silently clipping
  in the viewer. A Q&A question and its own answer are always measured and packed as one
  combined unit so a page break never separates them, unless that pair alone is taller than a
  full page. Verified end-to-end in real headless Chrome: filled Notepad with 12 long lines and
  added 8 long Q&A pairs (enough to force overflow on both), exported `.pptx`, unzipped the
  result and confirmed Notepad spans 3 slides (titled "Notepad"/"Notepad (cont'd)" x2) and Q&A
  spans 4 slides (titled "Q&A"/"Q&A (cont'd)" x3), with every notepad line and every Q&A
  question/answer pair present exactly once and no question ever separated from its answer --
  zero console/page errors.
- ✅ **PDF: note and code-block rendering.** A node's note (sanitized rich HTML, muted italic)
  and code block (a `<pre>`) now render beneath its own row, direct ports of
  `PreviewPane.tsx`'s own note-row/code-row styling -- the same content `PreviewPane.tsx`
  already shows on screen, previously silently dropped from the PDF entirely.
  `sanitizeRichHtml` runs again at render time (the same belt-and-suspenders pattern
  `PreviewPane.tsx` itself already uses) since this is a second real place `node.note` gets
  embedded as raw HTML, this time via `printWindow.document.write` -- verified this actually
  matters, not just defensive boilerplate: importing a `.sakura.json` document with a note field
  carrying a raw, unsanitized `<script>`/`onerror=` payload (`parseSakuraDocument.ts`'s own
  import path coerces `note` to a string but does NOT sanitize it, unlike the UI's
  sanitize-on-write in `NotePanel.tsx`) still produces a clean printed page with the script
  tag/handler stripped and never executed. Every node still renders regardless of fold state,
  matching `PreviewPane.tsx`'s own deliberate choice (a folded subtree still belongs in the
  printed document, per that file's own header comment) -- not a gap to close, unlike the
  note/code omission this fixes. Verified end-to-end in real headless Chrome: added a note and a
  code block to a node via the Note panel UI, exported PDF, confirmed both render in the print
  window's DOM (note as an italic muted div, code in a `<pre>`); separately imported the
  malicious `.sakura.json` above and confirmed the exported print window's HTML has no
  `<script>` tag and no `onerror` attribute, and that neither payload actually executed -- zero
  console/page errors across both checks.
- ✅ **PowerPoint image embedding.** Direct port of legacy's real per-slide image row (legacy's
  own `pptxLayoutImageRow`, ported to `utils/pptxLayoutImageRow.ts`) -- one image per node
  (`extractFirstImageDataUrl`, the same "first image in the note" helper Word export already
  uses), gathered across every node in a slide's group, laid out as an aspect-ratio-scaled row
  filling whatever vertical space is left below the bullets. `loadImageDimensions` (already
  built for Word export) reads each image's real pixel size. This used to be scoped out as a
  "separate, bigger follow-up" specifically because PPTX's fixed-canvas layout risked visual
  overlap without real text measurement -- that blocker no longer applies now that
  `measureWrappedLines` (from the overflow-pagination slice above) exists to size the bullets
  the image row has to share space with. A slide group with images renders as a single slide --
  no per-node overflow pagination -- matching legacy's own real, deliberate scope-down
  (legacy/index.html:26256-26271's own comment: "images onto multiple slides is a more tangled
  layout problem left alone here"), not a limitation invented for this port. `pptxLayoutImageRow`
  itself (the aspect-ratio-scaling/centering/floor math) is pure and unit-tested (6 cases:
  single image, side-by-side row, proportional shrink when a row overflows its area, a
  non-square aspect ratio, the 0.33in width floor, and the zero-height divide-by-zero guard).
  Verified end-to-end in real headless Chrome: added a 200x100 (2:1) note image to a leaf-ish
  node (one with 2 real bullet lines above it), exported `.pptx`, unzipped the result and
  confirmed a real embedded media part byte-for-byte identical to the source PNG, positioned by
  hand-checking the OOXML's `<a:off>`/`<a:ext>` against the exact expected math (bullets' real
  measured height reserving the correct vertical offset, then the image aspect-ratio-scaled and
  horizontally centered in the remaining space) -- every dimension matched to 4 decimal places --
  with the title, both bullets, the image, and the branding wordmark all present together on one
  slide -- zero console/page errors.
- Still not started: Word tables/decision-log cards; PDF's remaining fidelity gap (decision-card
  rendering, and the bigger "render from a real Preview-equivalent" architecture legacy's own PDF
  export uses -- see the note/code-rendering slice above for why fold-state itself isn't actually
  part of this gap); PowerPoint's remaining fidelity gap (decision cards). Word
  tables/decision-log cards and PDF/PowerPoint decision cards are blocked on the same missing
  feature: `web/` has no table concept and no Decision Log store/panel at all yet (confirmed by
  investigation -- `state/decisionLog.ts` is a pure validate/normalize function with one real
  call site in node-import normalization, not a real feature), so these aren't buildable as
  export-side slices until that feature exists earlier in the roadmap.

### 6.7 — Theming & Appearance
Auto theme (System/Schedule), accent color (all seven), Chrome background presets, node text
color presets, Editor's Choice / Documentation Mode presets, full layout controls (tree lines,
depth guides, row style, compact rows, text size, indent width, collapse depth), inline
note/remark/Q&A previews.

Status: **in progress.**
- ✅ **Accent-color picker + theme/accent persistence.** `themeStore.ts`'s own `setAccentPreset`
  action and all 7 real accent presets (`ACCENT_PRESETS`) have existed since Phase 6.1, but no UI
  anywhere ever called `setAccentPreset` -- confirmed by grepping every component for the
  action/type before scoping this slice. This slice adds the missing picker: a 7-swatch
  radiogroup (`App.tsx`'s header actions, next to the existing theme toggle), direct port of
  legacy's real `#accent-swatch-row` (same 7 presets, same order, same labels, same
  `role="radiogroup"`/`role="radio"`/`aria-checked` semantics) -- no dedicated Settings panel
  needed for this, since `web/` has no Settings surface at all yet (a real, separately-scoped
  follow-up covering every other toggle this phase and later ones reference). Also adds
  theme/accent-preset persistence across sessions (`sakura_web_theme_prefs_v1` in
  `localStorage`, direct port of legacy's real `savePrefs`/`loadPrefs` for these two fields),
  defensively validated on read (a corrupted/hand-edited value falls back to the real default
  rather than poisoning the store). No `'custom'` color option (`web/`'s own `AccentPreset` type
  has no `'custom'` variant, matching legacy's own swatch-row markup, which also has no visible
  custom swatch) -- a separate, bigger follow-up (a real color-picker UI). Verified end-to-end in
  real headless Chrome: confirmed the default `--accent` resolves to terracotta, clicking the
  Moss swatch updates `--accent` live and marks it `aria-checked`, toggling dark mode swaps to
  Moss's own dark-mode hex (not back to a default), the choice persists to `localStorage`, and a
  full page reload restores both the dark theme and the Moss accent exactly -- zero
  console/page errors.
- ✅ **System auto-theme.** Direct port of legacy's real two-mode `setThemeMode`/`applyAutoTheme`
  (legacy/index.html:18954-18969) -- `'manual'` (Light/Dark switch only) or `'system'` (follows
  the OS/browser `prefers-color-scheme` live, via a real `matchMedia` change listener, plus a
  `visibilitychange` listener covering the case where the OS theme flipped while the tab was
  backgrounded/asleep, which a bare change-event listener alone would miss). A manual theme
  click still works while in System mode -- it starts a *temporary* override
  (`_themeOverrideActive`, a plain module-scope flag, deliberately never persisted, matching
  legacy's own real reasoning) that the next natural preference change quietly supersedes once
  it catches up and agrees with the override again. Correcting the plan doc's own wording here:
  legacy has a leftover comment mentioning a third `'schedule'` mode, but its own `setThemeMode`
  whitelist (`['manual','system'].includes(mode)`) proves that mode doesn't actually exist in
  the real, current legacy code -- a genuine stale-comment/dead-feature mismatch, not a real gap
  this port needs to fill, so only System is built here. A small "🖥️" toggle button (`App.tsx`'s
  header actions, next to the theme toggle) switches modes -- no Settings panel needed, same
  approach the accent-picker slice above used. `themeMode` now persists alongside
  theme/accentPreset. Verified end-to-end in REAL headless Chrome using Chromium's own
  `prefers-color-scheme` emulation (not a mock) -- confirmed the OS preference is ignored until
  System mode is enabled, enabling it applies the real current OS preference immediately, a real
  live OS preference change updates the theme while in System mode, a manual toggle click starts
  a real override that a disagreeing OS event doesn't disturb, the override clears once the OS
  value catches up to agree with it (resuming auto-following on the next real change),
  disabling System mode stops all of this, and the mode/theme choice survives a full page
  reload with the OS preference still emulated the same way -- zero console/page errors.
- ✅ **Node-text-color presets.** Direct port of legacy's real `NODE_FONT_COLOR_PRESETS`/
  `applyNodeFontColor`/`setNodeFontColorPreset` (legacy/index.html:18781-18797) -- a second,
  independent color axis from accent: 4 presets (Default/Black/Charcoal/Slate) recoloring node
  text itself via `--node-fg`, each with its own light/dark hex. Unlike the accent picker, this
  slice builds the store logic AND the UI both (no existing `setAccentPreset`-style action to
  wire up -- `web/` had no node-text-color axis at all before this). A 4-swatch radiogroup
  (`App.tsx`'s header actions, next to the accent picker), same UI pattern as the accent picker.
  Required one supporting fix to `applyCssVariables` itself: that function's bulk CSS_VAR_MAP
  loop unconditionally sets `--node-fg` from `THEME_TOKENS[theme].nodeText` (the theme's own
  default), which would silently clobber a non-default node-font-color preset on every theme
  swap -- `applyCssVariables` now takes the resolved node-font color as an explicit third
  argument and overrides `--node-fg` with it after the loop, the same "explicit override after
  the bulk pass" pattern `--accent` already used. `nodeFontColorPreset` now persists alongside
  theme/accentPreset/themeMode. Verified end-to-end in real headless Chrome: confirmed the
  default `--node-fg` resolves to the default preset, clicking the Slate swatch updates
  `--node-fg` live and marks it `aria-checked` (leaving `--accent` untouched), toggling dark mode
  resolves Slate's own dark hex rather than resetting to the theme's default (proving the
  `applyCssVariables` fix works), a non-default accent and a non-default node-font-color preset
  coexist independently, and both choices survive a full page reload exactly -- zero
  console/page errors.
- **Chrome background presets investigated and NOT built -- confirmed unreachable in legacy
  itself, not a gap in this port.** legacy has real `CHROME_PRESETS`/`applyChromeColors`/
  `setChromePreset` data and logic (legacy/index.html:18763-18771), and `chromePreset` is a real
  persisted pref -- but `setChromePreset` looks for its own trigger markup at
  `#chrome-swatch-row .accent-swatch`, and that id does not exist ANYWHERE in legacy/index.html
  (confirmed by grep across the whole file) -- unlike `#accent-swatch-row`/`#node-font-swatch-
  row`, which both have real rendered markup. No real legacy user can ever reach this feature
  through its UI; the only way `chromePreset` changes is a value already sitting in a restored
  prefs blob (e.g. from a much older version, or hand-edited). Porting a picker for this would be
  inventing UI legacy itself doesn't expose, not porting parity -- so it's being marked N/A here
  rather than silently skipped, the same "trust the real code" call already made for the
  'schedule' theme-mode comment above.
- ✅ **First Settings-panel slice (§6.7/§6.10): outline export-formatting prefs.** `web/`'s
  first real Settings surface -- a dropdown anchored under a new "⚙ Settings" header button
  (`App.tsx`, `position:relative`/`position:absolute`, matching legacy's real
  `.settings-wrap{position:relative}` button-anchored-dropdown UX), rendered by the new
  `SettingsPanel.tsx`. Deliberately minimal: legacy's own real panel has a multi-category rail
  (Appearance/Presets & modes/Bars & menus/Panels/Hub/Editing/Data & backup,
  legacy/index.html:4622-4650); this first slice is a single flat section holding only the
  three prefs that already had a real, existing consumer before this slice --
  `treeIndentWidth`/`hideTreeLines`/`outlineNumbering` -- which previously lived as hardcoded
  constants directly inside `ExportButtons.tsx` (with a comment literally noting `web/` had no
  Settings panel yet to source them from). New `outlinePrefsStore.ts` gives them real,
  persisted, adjustable state (`sakura_web_outline_prefs_v1`), matching legacy's own real
  `setTreeIndentWidth` clamp (`legacy/index.html:18991`, 2-6) and defaults exactly.
  Deliberately does NOT consolidate the already-shipped accent/node-font-color/theme-mode
  header controls into this panel yet (a real, separately-scoped follow-up, matching legacy's
  own layout where they DO live inside `#settings-panel`) and does NOT attempt the rest of
  §6.7's "layout controls" list (tree lines, depth guides, row style, compact rows, text size,
  collapse depth) -- confirmed via grep that `OutlineTree.tsx`, `web/`'s live editor, has zero
  tree-line/connector rendering, row-density CSS, text-size, or depth-guide-line mechanism at
  all (a fundamentally simpler CSS-padding-only rendering model than legacy's ASCII-connector
  grid); those items need real new rendering infrastructure built first, not just a toggle
  wired to existing state, and are out of scope for this slice. Verified end-to-end in real
  headless Chrome: the panel opens/closes correctly, the indent-width slider and both checkboxes
  take live effect on `.txt`/clipboard exports, and all three persist correctly across a full
  page reload -- zero console/page errors. (While building this slice's verification document,
  real headless-Chrome testing also surfaced and led to fixing an unrelated, more severe
  pre-existing bug -- `outlineStore`'s `nextId` never advancing when a document's nodes loaded
  in, causing node-id collisions on the very first "Add child" of a fresh session -- shipped
  separately as its own PR, not bundled into this feature slice.)
- ✅ **The real legacy "Layout" settings section landed: compact rows, text size, limit
  reading width, and row style.** Re-investigated §6.7's remaining-items list directly against
  legacy's own code rather than the plan doc's original description, and found two corrections:
  "row style" IS a real legacy feature (`rowHighlightStyle`, legacy/index.html:13543 -- just
  named differently than the plan doc assumed; controls how the selected row is visually
  indicated: a background tint / a small dot / an inset left bar / a full inset outline), while
  "collapse depth" is NOT a real legacy feature under any name (confirmed by grep across the
  whole file) -- same "trust the real code" correction pattern as the Chrome-preset and
  'schedule'-theme-mode corrections elsewhere in this project. A real legacy Layout setting
  neither the plan doc nor `outlinePrefsStore.ts` had listed at all, "Limit reading width"
  (legacy/index.html:18972-18990, `editorReadingWidthEnabled`/`editorReadingWidth`, 600-1400px),
  is added here too. `outlinePrefsStore.ts` gains `compactRows`/`editorScale`/
  `editorReadingWidthEnabled`/`editorReadingWidth`/`rowHighlightStyle` (plus `depthGuideLines`,
  wired into rendering in a later slice), matching legacy's own real defaults and clamp ranges
  exactly (legacy/index.html:8276-8277's own top-level `let` declarations; `setEditorScale`'s
  real [0.85,1.4] clamp at legacy/index.html:18971; `setEditorReadingWidth`'s real [600,1400]
  clamp at legacy/index.html:18984). Applied as plain JS-computed inline-style values in
  `OutlineTree.tsx` (a row-density multiplier on row padding, a text-scale multiplier on the
  tree's base font-size, a `maxWidth`/`margin:auto` wrapper for reading width) rather than CSS
  custom properties consumed by `calc()` in a stylesheet -- `web/`'s row rendering has always
  been 100% inline-style-driven, not a stylesheet with `var()`-based rules, so this keeps the
  same pattern the rest of this component already uses instead of introducing a new one for
  just these two prefs. Row style's `dot`/`bar`/`outline` variants are a new pure function,
  `state/rowHighlight.ts`'s `resolveRowHighlightStyle`, reproducing legacy's own exact
  `color-mix(in srgb, var(--accent) N%, transparent)` CSS values as literal strings (native
  browser support, no JS color-blending library needed) -- `web/` has no separate "anchor within
  a multi-select" concept distinct from "the single selected node," so a multi-selected node
  always renders at the weaker of legacy's two levels (`.selected`, never `.primary-selection`),
  a real, deliberate simplification. Verified end-to-end in real headless Chrome: compact rows
  toggling measurably changes row height, the text-size slider measurably changes row height at
  140%, limiting reading width measurably narrows the tree container to the chosen pixel value,
  each row style renders its own real visual marker (a dot element, an inset box-shadow bar) on
  the selected row, and every setting survives a full page reload -- zero console/page errors.
- **"Editor's Choice"/"Documentation Mode" presets are marked N/A, not attempted.** Investigated
  the real `applyEditorsChoicePreset` (legacy/index.html:41054-41103+) rather than trusting the
  plan doc's original "layout controls" framing, and found it is NOT a layout preset at all --
  it's a ~40-setting personal configuration snapshot spanning toolbar-group visibility (History/
  Structure/Move/Extras hidden entirely; Format/Fold/Insert/AI trimmed to specific buttons),
  hover-toolbar on/off, sidebar/Pad open state, context-menu quick-action ordering, status-bar
  item visibility, app-bar decluttering, Presenter auto-behaviors (auto-laser, auto-presenter,
  branding, timer/overview/notes enablement), AI rewrite thresholds, typewriter mode, and even a
  hardcoded `lastDecisionAuthor='Robin Rajawat'` -- a literal personal value, not a generic
  template. Most of these settings have no equivalent anywhere in `web/` yet; building this
  preset faithfully would mean building most of an entire toolbar-customization subsystem first,
  arguably bigger than §6.10 itself. Put to the user directly given the scope; their call: mark
  N/A and keep moving on §6.7's real, buildable items rather than block on it, the same category
  of call as the Chrome-preset N/A.
- **Both live-tree indentation modes are now built, including the `hideTreeLines=false`
  monospace-connector mode and its real fold-control split.** Legacy's live tree has TWO
  rendering modes gated by `hideTreeLines` (default `true`, real code at legacy/index.html:
  20293). Default mode: plain CSS `paddingLeft: depth*18+8*editorScale` indentation, the same
  family as `web/`'s existing `depth*24+8` padding (18px vs. 24px is a pre-existing, unrelated
  step-size difference), optionally decorated with `.node-vguide` lines (a faint 1px vertical
  line per ancestor depth, §6.7's own earlier depth-guide-lines slice) when `depthGuideLines` is
  also on. `hideTreeLines=false` switches to
  literal monospace ASCII-connector row-prefix text via `buildPrefix` (legacy/index.html:17876,
  already ported to `core/nodeQueries.ts`) instead of CSS padding at all -- `OutlineTree.tsx` now
  renders this directly (a `whiteSpace:'pre'`, monospace-font `<span>` holding `buildPrefix`'s
  `vert`+`conn` strings) rather than a CSS-based approximation; the row's own `paddingLeft`
  becomes a small fixed value (`8*editorScale`, matching legacy's real base `.node-row` padding)
  instead of a depth-scaled one, since the prefix text itself now carries the indentation.
  Depth-guide lines are correctly gated off in this mode (they'd be redundant with the prefix's
  own `│` characters). Per explicit user request, the fold control now matches legacy's own real
  two-control split too, not just the indentation: `hideTreeLines=true` gets a Dynalist-style dot
  (plain circle at rest, a ring added when folded, swaps to a +/- text glyph on hover) for nodes
  with children and a plain non-interactive dot placeholder for leaf nodes; `hideTreeLines=false`
  keeps `web/`'s existing ▸/▾ arrow (which previously stayed static) but now ALSO swaps to +/- on
  hover, matching legacy exactly, and leaf nodes get no dot at all in this mode. Rendered via real
  nested `<span>`s rather than legacy's own CSS `::before`/`::after` pseudo-elements -- a
  reasonable, idiomatic React substitute for the same visual result, not a pixel-exact port of
  the CSS technique. Verified end-to-end in real headless Chrome: padding/guide-line counts at
  multiple depths in both modes, fold-dot ring+hover-glyph behavior, collapsing via the dot,
  arrow hover-glyph swap, and real connector characters appearing in the row text.
- **Inline note/remark/Q&A previews remain not started, and are a bigger, separate feature than
  originally scoped.** Legacy's real mechanism (`alwaysExpandInlineEnabled`,
  legacy/index.html:8276) is a document-wide default (off by default) for whether every node's
  note/remark/Q&A content shows inline under its row automatically, with a per-node dot
  (`.node-note-dot`, legacy/index.html:20326) letting a reader override that default node-by-
  node -- real per-node expand/collapse state (`inlineExpandNoteNodeIds`/
  `inlineExpandRemarksNodeIds`/`inlineExpandQaNodeIds`, three separate `Set`s), not just a
  single global toggle. **Now built.** `outlinePrefsStore.ts` gained the real, persisted
  `alwaysExpandInlineEnabled` default; a new session-only `store/inlineExpandStore.ts` holds the
  three per-node deviation Sets (`noteExpandIds`/`remarkExpandIds`/`qaExpandIds`, matching
  legacy's own real `inlineExpand*NodeIds` -- never persisted, exactly like legacy's own comment
  says they shouldn't be); a new pure `state/inlineExpand.ts`'s `isInlineExpanded` resolves the
  XOR (deviation-from-default) the same way legacy's real render logic does. `OutlineTree.tsx`'s
  note preview is now correctly gated on this (previously unconditional whenever `node.note` was
  truthy); real remark/Q&A dots + inline preview blocks were added alongside it. Two real,
  documented divergences from a pixel-exact port: (1) previews are READ-ONLY (click the note
  preview to open the full Note panel for editing; remarks/Q&A have no equivalent dedicated
  panel yet) rather than legacy's own inline `contentEditable` editing surfaces -- consistent
  with this project's existing "preview, not a second editing surface" pattern (the note preview
  already worked this way before this slice); (2) remarks/Q&A needed real node-anchoring added
  first (`padStore.ts`'s `anchorNodeId`, the prerequisite for "does this belong under this
  node" at all) -- Q&A's own generic "+ New" now also auto-anchors to the selected node, a
  deliberate divergence from legacy (whose generic Q&A "+ New" never auto-anchors; only a
  separate right-click entry point this project hasn't built does), documented in
  `PadPanel.tsx`'s own header. Verified end-to-end in real headless Chrome including the
  XOR-against-the-live-default behavior itself (toggling the global default correctly flips
  every node NOT individually overridden while leaving overridden nodes exactly as left).
  One known, pre-existing, separately-scoped gap surfaced during verification (not caused by
  this slice, not fixed here): `padStore.ts`'s entire content -- all 7 Pad tabs, not just
  Remarks/Q&A -- still isn't wired into `documentsStore.ts`'s save/load cycle at all, so newly
  added remarks/Q&A items (like every other Pad item) don't survive a page reload; `node.note`
  itself is unaffected since it lives directly on the outline node, which does persist normally.
- **Decision Log rebuilt to its real legacy schema (node-anchored, 5 structured fields, status,
  author), plus live-editor badges.** `web/`'s Decision Log was a flat title/description list
  with numeric ids -- investigation found legacy's real Decision Log is node-anchored (one per
  node, the same anchoring pattern already ported for Diagrams via `diagramAnchor.ts`) with 5
  rich-text fields (context/decision/rationale/alternatives/impact), a status (proposed/approved/
  rejected), an author, and string ids in legacy's own `'dl'+timestamp+random` format (matching
  the already-existing `generateId('dl')` helper exactly). `padStore.ts`'s `Decision` type and
  actions were rebuilt to match (#224); `PadPanel.tsx`'s `DecisionTab` now has a status-cycle
  button, anchor label, and 5-field expand/collapse editor. Then the outline tree's own two
  legacy decision-log dots were ported (#225): a dot on a node's own row when a decision log is
  anchored to it, and a separate rolled-up dot on a folded node showing a descendant has one
  (`decisionLogQueries.ts`'s new `subtreeHasDecisionCore`, direct port of legacy's
  `subtreeHasDecisionLog`). Both dots are deliberately non-interactive for now -- legacy's own
  dots open the Pad panel to the Decision Log tab and expand the specific entry, but `web/`'s Pad
  panel tab state is still local `useState` inside `PadPanel.tsx`, not lifted into a shared store
  the tree can reach yet; every other Pad-domain dot (files/remarks/diagrams/Q&A/meetings/
  to-dos/mind map) has the same gap.
- **Decision Log anchor-picker UI landed.** A new generic `components/AnchorPicker.tsx` popover
  (search input, "Not linked to a node", a depth-indented candidate list with taken nodes greyed
  and disabled) drives the already-existing `setDecisionAnchor` store action -- direct port of
  legacy's real `#decision-anchor-suggest` (legacy/index.html:35111-35163), reusing the
  already-ported `getDecisionAnchorCandidatesCore` for both the filtered-search list AND the
  empty-query "every node" case. One deliberate, documented scoping choice: legacy's own popover
  shows a full collapsible node TREE when the search is empty, switching to the flat candidate
  list only once there's a query (`buildAnchorTree`, a separate, more complex renderer this
  project hasn't ported); this component always uses the flat, depth-indented list, which the
  same pure function already provides for the empty-query case too -- fully usable, just without
  expand/collapse branches for very large documents. `AnchorPicker` itself is domain-agnostic
  (takes a plain `DecisionAnchorCandidate[]`), matching this project's precedent of reusing
  anchor-domain helpers directly (`diagramAnchor.ts`'s `computeDiagramAnchorLabel`/
  `reorderDiagramsCore`) rather than writing per-domain duplicates -- ready to reuse for Diagrams'
  own still-missing anchor-picker if that's ever picked up. Verified end-to-end in real headless
  Chrome: search/filter, selecting a candidate, taken-node disabled state (click is a no-op),
  unlinking via "Not linked to a node", and click-outside-to-close.
- **Decision Log's Preview and PDF export card rendering landed.** Direct port of legacy's real
  `previewRenderDecisionCard` (legacy/index.html:37355-37388): a bordered card with a
  status-colored left accent and uppercase status badge, showing every non-empty field
  (context/decision/rationale/alternatives/impact) plus an "— author · date" meta line. A new
  pure `decisionStatusColorKeyCore` (`decisionLogQueries.ts`) maps a status to a semantic color
  key (`'green'|'red'|'gray'`) matching legacy's own real `docxStatusColor` mapping exactly,
  collapsed to this project's 3 real statuses; screen/PDF rendering resolves that key against
  `ThemeTokens.fcGreen`/`fcRed`/`fcGray` (already the exact same hex values legacy's function
  returns) or PDF's own fixed hex constants (exports are always light-themed regardless of the
  app's live theme, same reasoning every other PDF color is fixed). Implemented twice --
  `PreviewPane.tsx` (JSX) and `ExportButtons.tsx`'s `exportPdf` (a raw HTML string for a separate
  print window) -- matching this project's own established "two parallel renderers, same visual
  content" pattern its note/code rendering already uses, rather than a shared React component;
  legacy's own comment on `previewRenderDecisionCard` says PDF and Preview share ONE renderer
  because PDF is literally a print of the Preview DOM -- `web/`'s PDF export was never built that
  way (a separate raw-HTML print window from the start), so keeping its own established
  two-renderer pattern is the more idiomatic choice here than introducing a new shared-component
  refactor mid-slice. Verified end-to-end in real headless Chrome: both Preview and the PDF popup
  window show the "Decision Log" header, the correct status badge, and all filled field content.
- **Decision Log's Word (.docx) card rendering landed.** Direct port of legacy's real
  `docxBuildDecisionCard` (legacy/index.html:25037-25067), using the `docx` library's own real
  `border`/`shading` paragraph options (`IBordersOptions` confirmed to support an independent
  `left` border, contrary to this file's own PRIOR comment claiming otherwise for the Q&A
  section -- that comment was wrong, not a real API limitation; not revisited here since fixing
  Q&A's own left-accent gap is out of this slice's scope) rather than legacy's raw hand-written
  OOXML XML strings -- same "port the effect via an idiomatic library API" reasoning used
  throughout. `DL_STATUS_HEX_OOXML`/`DECISION_FIELD_META` are shared module-level constants
  (`DL_STATUS_HEX_OOXML` renamed from an initial `DL_STATUS_HEX_DOCX` -- caught via self-review
  before it shipped, since `exportPdf`'s own local, differently-formatted `DL_STATUS_HEX`
  constant further down the same file would otherwise have collided in name, not behavior),
  reused by the PDF card (§6.7's own prior slice) to remove what would otherwise be a second
  duplicate field-list literal. One real, deliberate simplification: legacy's own version runs
  each field's raw HTML through `docxNoteBlocks` to split rich paragraphs/lists into separate
  bordered blocks; `web/`'s own Decision fields are plain `<textarea>` text (no rich HTML at all,
  unlike Note/Remark), so this only needs to split on literal newlines into `TextRun`s joined by
  `break: 1` within one paragraph -- a real simplification given the two projects' different
  field schemas, not a corner cut. Verified end-to-end in real headless Chrome: downloaded the
  real generated `.docx`, unzipped it (a `.docx` is a plain ZIP archive), and grepped
  `word/document.xml` directly for the header text, the uppercase status badge, all 5 field
  labels/content, and the real status-accent hex color (`27824f`) and shading fill
  (`FAF8F3`) -- confirming actual OOXML output, not just that the export function ran without
  throwing.
- **Decision Log's PowerPoint (.pptx) card rendering landed.** Direct-effect port of legacy's
  real two-pass auto-scaling `addDecisionLogCard` (legacy/index.html:26124), simplified the same
  way as the Word/PDF/Preview cards above: no auto-scale-to-fit (an oversized card can overflow
  its slide, matching the *existing* images-branch comment's own accepted images+bullets overflow
  trade-off, not a new one invented for this port) and no rich-list field parsing (plain-text
  fields only, matching `web/`'s own plain-textarea Decision schema). A card renders as one more
  packable item in the same per-node bullet-pagination loop, placed immediately after the bullet
  for the node it's anchored to (same per-node placement the PDF/Word cards already use), so an
  oversized card paginates onto a "(cont'd)" slide exactly like an overlong bullet list already
  does -- this required a genuine prerequisite fix to that pagination loop, which used to size its
  bullet text box with a fixed `h:'75%'` placeholder instead of a real measured height (now the
  same `reduce`+`measureWrappedLines`+`pptxLineHeightIn` pattern the neighboring "slide with
  images" branch already used). `DL_STATUS_HEX_OOXML`/`DECISION_FIELD_META`/
  `decisionStatusColorKeyCore`/`decisionStatusLabelCore` are all reused from the Word card above,
  no new duplicate constants. Decision cards render on non-image slides ONLY: a slide with images
  already `continue`s past this per-node loop entirely (a real, pre-existing scope-down, not
  something newly cut for this slice), so a node with both a note image and a decision only gets
  the image on its slide -- documented in the code, not silently dropped. Verified end-to-end in
  real headless Chrome: downloaded the real generated `.pptx`, unzipped it (also a plain
  ZIP/OOXML archive), and grepped `ppt/slides/*.xml` directly for the header text, the uppercase
  status badge, all 5 field labels/content (including a multi-line Alternatives field), and the
  real status-accent hex color (`27824F`) and card fill shade (`FAF8F3`) -- confirming actual
  OOXML slide output, not just that the export function ran without throwing.
- **Decision Log's Excel (.xlsx) export landed -- the last of the four export surfaces.**
  Direct port of legacy's real `exportDecisionLogXlsx` (legacy/index.html:33107-33157), using
  `xlsx` (SheetJS, npm, MIT), pinned to the exact same `0.18.5` version legacy itself loads from
  a CDN -- same "genuinely the same library, not a substitute" reasoning `pptxgenjs`'s own header
  comment gives. Legacy iterates every outline node checking for an attached decision; `web/`
  iterates `decisions` directly instead (its own array of records, the more natural shape here,
  covering the same set of rows). One real, deliberate simplification vs. legacy: `web/`'s
  Decision fields are plain `<textarea>` text (no rich HTML, unlike Note/Remark), so no
  `stripHtmlToText` pass is needed -- the raw field value already IS the row's plain-text cell
  content. One real, *discovered* (not assumed) library-behavior gap vs. legacy's own comment:
  legacy's comment claims "SheetJS community edition supports basic cell props" and sets
  `ws[addr].s` directly (bold header font, wrapped-text body cells). Verified in a real Node
  script that the community `xlsx` npm package accepts that `.s` assignment without throwing but
  does NOT actually serialize any style information into the written `.xlsx` file's real
  `xl/styles.xml` -- cell style *writing* has been a Pro-only SheetJS feature since long before
  0.18.5, the community build only ever kept style *reading* on the way in. So `ws['!cols']`
  (column width, a plain worksheet property, not a style) is set and does get written, but the
  `.s` assignments are skipped here rather than shipped as dead code that looks like it does
  something it doesn't. Verified end-to-end in real headless Chrome: created two decisions (one
  with all 5 fields, a multi-line Alternatives value, an author, and status approved; one
  minimal), downloaded the actual generated `.xlsx`, unzipped it (also a plain ZIP/OOXML
  archive, using inline strings rather than a shared-strings table), and grepped
  `xl/worksheets/sheet1.xml` directly for the header row's 9 columns, both rows' real field
  content (including both lines of the multi-line field), the author, and the status label --
  confirming actual OOXML spreadsheet output, not just that the export function ran without
  throwing.
  **All four Decision Log export surfaces (Preview/PDF, Word, PowerPoint, Excel) are now
  complete.**

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

**Research pass (this PR's own predecessor step) read legacy's real implementation end to end**
(`AI_BUILTIN_PROVIDERS`/`AI_CURATED_MODELS`, `callAiByShape`/`callAiByShapeWithFallback`, the
Secure Storage vault, all seven per-capability prompts/parsers, auto-rewrite's real
trigger/debounce logic, provider fallback, usage tracking — legacy/index.html:8580-8994,
28181-29706 and scattered call sites) before any code was written, confirming/correcting two
assumptions this doc previously carried: (1) custom/self-hosted AI providers are a real REMOVED
legacy feature (dead storage key, zero reachable UI) — do not build a "manage providers" UI, the
seven built-in providers are a closed list by design (a fixed `connect-src` CSP allowlist depends
on it); (2) `web/src/state/aiProviders.ts` and `vault.ts` are not partial ports needing
re-implementation — they're the literal, already-tested source modules legacy's own generator
splices into index.html verbatim, just never wired into a React store/component before now.
Two related pieces of `web/`'s own state, both already ported in earlier phases but unused until
this section: `aiProviders.ts` (prefs blob load/save) and `vault.ts` (the AES-GCM/PBKDF2 vault
crypto primitives) — see the Status line below for what's landed.

Planned slice sequence (each its own PR, later ones may reorder/combine based on what's learned
building the earlier ones):
1. **Provider configuration UI** — provider/model select + API key entry/save/test, the core
   `callAiByShape` network primitive, vault-aware key read/write (landed, see Status).
2. **Secure Storage vault setup/unlock/lock/disable UI** (landed, see Status) — real passphrase
   setup + existing-key migration, unlock via the verifier-ciphertext pattern, lock, and disable
   (flush every decrypted key back to plaintext). Inline passphrase forms rather than legacy's own
   modal dialogs (`web/` has no generic modal system yet). NOT ported: legacy's status-bar
   `sb-vault-chip` (`web/` has no status bar surface yet, §6.1's own unbuilt item) and Cloud
   Backup/Gist-token vault protection (`web/` has no Cloud Backup feature at all).
3. **Rewrite** (landed, see Status) — manual rewrite (toolbar button + two right-click entries:
   single/multi-select and whole-document) via new `state/aiCapabilities.ts`
   (`callAiApi`/`callAiApiBatchChunk`/`callAiApiBatch`, built on `callAiByShape`) and
   `state/aiRewrite.ts` (`rewriteNode`/`rewriteNodes`/`rewriteDocument`, the in-flight-edit-guard
   pattern via `aiSnapshotChanged`, matching legacy's real `aiRewriteInFlight`/
   `aiSnapshotChanged`). `outlineStore.ts` gained a new `applyAiTextResult` action for applying an
   AI result without disturbing a *different* node's active edit session (unlike reusing
   `commitEdit`, which unconditionally clears `editingId`). NOT built in this slice: sub-text-
   selection rewrite (needs live textarea selection-range access `OutlineTree.tsx`'s uncontrolled-
   input editing model doesn't expose yet) and Quick Assist triggers (Quick Assist itself doesn't
   exist in `web/` yet, §6.10). No provider fallback yet either (`aiCapabilities.ts`'s own header)
   — slice 9.
4. **Auto-rewrite on commit** (landed, see Status) — `state/autoRewrite.ts`'s
   `shouldAutoRewriteNode` exclusion filter (checkbox/heading/decisionlog/syntax, all real
   ported thresholds/regexes) plus `store/autoRewriteStore.ts`'s real queue/flush engine
   (idle-timer/batch-cap dual trigger, paused-on-no-key, `MAX_CONSECUTIVE_FAILS`-disables), wired
   into `OutlineTree.tsx`'s two real commit call sites (Enter, blur) with paste-taint detection.
   Status chip in `AppShell`'s status bar. Deliberate simplification: no auto-resume-on-key-saved
   (a real circular-import risk between `autoRewriteStore.ts` and `aiSettingsStore.ts` for a
   background convenience) — a paused queue needs an explicit "Retry now" click instead, see that
   store's own header for the full reasoning.
5. Generate Outline + Restructure Text — share `parseTextToTreeNodes` (a new port, also needed
   by OPML/paste/Word-import fallbacks elsewhere), each with its own system prompt/insertion
   behavior (nest-into-current-doc vs. always-new-doc).
6. Expand node, Suggest tags — both simple single-node single-shot capabilities.
7. Suggest icon — batched, with the keyword/historical-index tiers ahead of any AI call, plus the
   single-node picker-popover variant.
8. Summarise selection — multi-node-selection-specific.
9. Provider fallback chain UI (drag-to-reorder, per-row enable checkbox) + usage tracking
   display — both real, user-configurable, and every capability slice above already needs
   `callAiByShapeWithFallback`'s usage-recording call sites in place, so this slice mostly
   surfaces UI for state the earlier slices already produce.

Full reference for every prompt/trigger/parser/quirk above (with legacy line numbers) is not
duplicated here — see the research findings folded into each landed slice's own PR description
and the relevant source file's header comment (`aiCall.ts`, `aiProviderCatalog.ts`,
`aiSettingsStore.ts`, `AiProviderSettings.tsx`).

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

**§6.1 complete** (#129–#130, #132–#138), **§6.2 complete** (#140–#148), **§6.3 complete**
(#150–#158, #164, #172, #174), **§6.4
complete** (#159–#161, #163 — the mention infrastructure §6.3 item 7 depended on), **§6.5
complete** (#176, #179, #181, #185, #187, #189, #191) — all
six Hub items now landed, and **§6.6 in progress** (#194, #196, #197, #198, #199, #200, #201,
#202, #203, #204, #205, #206, #207, #208, #209, #210, #211, #212, #219 Audience View/
Whiteboard-mirroring re-scoping, #220 presenting state into `usePresenterStore.ts`, #221 the
query-param boot check, and this PR — the real cross-window bridge, closing out Audience View
end to end except Whiteboard mirroring itself, still blocked on Diagrams getting a real
`isWhiteboard` concept), **§6.7 in progress** (#213,
#214, #215, #216 Chrome-background-preset investigation, #217 a real outline `nextId`
node-id-collision bug fix, #218 the first minimal Settings-panel slice, #223 the real
legacy "Layout" settings section (compact rows/text size/limit reading width/row style),
plus marking Editor's Choice/Documentation Mode N/A after investigating the real scope, #224
rebuilding Decision Log to its real node-anchored schema, #225 Decision Log's live-editor
badges, #226 depth guide lines in the live tree, plus the correction that legacy's
default live-tree mode is CSS-padding-based (much closer to `web/`'s existing approach than
previously documented; only a non-default toggle switches to the monospace-connector mode), and
#227 real inline note/remark/Q&A previews (per-node deviation-from-default toggle state,
matching legacy's own `alwaysExpandInlineEnabled`/`inlineExpand*NodeIds` mechanism), plus
node-anchoring for Remarks/Q&A (`padStore.ts`'s `anchorNodeId`), the prerequisite for their own
previews to have anything real to show, and #228 — the `hideTreeLines=false` monospace-
connector live-tree mode plus its real dot/arrow fold-control split (per explicit user request
to match legacy's fold control exactly, not just the indentation mechanism) — see each section's
own `Status:` line for the full breakdown. §6.8 not started. **§6.9 (AI Features) in progress**
(developed concurrently with the §6.7 work above in a separate session) — slices 1-4 of the
planned sequence above landed. **#230** (following #228): provider configuration UI
(`aiProviderCatalog.ts`, `aiCall.ts`, `aiSettingsStore.ts`, `AiProviderSettings.tsx`, plus
vault-aware key read/write extending `aiProviders.ts`), verified end-to-end in real headless
Chrome (provider switch, curated + custom model selection, key save/status/persistence across
reload, show/hide toggle, Test button's graceful failure handling against an unreachable
endpoint). **#233**: the Secure Storage vault's real setup/unlock/lock/disable UI
(`vaultStore.ts`, `SecureStorageSettings.tsx`, plus `vault.ts` gaining a real production
`setVaultCryptoKey` setter and bulk `getAllVaultDecryptedKeys`/`clearVaultDecryptedKeys`
accessors) — verified end-to-end in real headless Chrome (setup with existing-key migration,
lock/unlock including a rejected wrong passphrase, save-while-locked correctly refused,
disable flushing back to plaintext, a real reload confirming the session-only key never
persists). A real bug was caught and fixed during that verification: the AI section's key-status
line could show a stale pre-lock message after the vault's lock state changed elsewhere, fixed by
clearing that transient message whenever the resolved lock state itself flips. **#235**:
Rewrite — `state/aiCapabilities.ts` (`callAiApi`/batched `callAiApiBatchChunk`/`callAiApiBatch`
with the real sentinel-marker chunking protocol) and `state/aiRewrite.ts`
(`rewriteNode`/`rewriteNodes`/`rewriteDocument`, the in-flight-edit-guard pattern via
`aiSnapshotChanged`), a new `outlineStore.ts` `applyAiTextResult` action, and three real UI
trigger points (a toolbar "✦ Rewrite" button, plus "✦ Rewrite"/"✦ Rewrite document" context-menu
entries) — verified end-to-end in real headless Chrome with the AI endpoint mocked via
`page.route` (single-node rewrite + undo, multi-select batch rewrite, context-menu single/
whole-document rewrite, the in-flight-edit-guard actually discarding a stale result, and a
no-key configured failure surfacing a clear alert rather than hanging or throwing) — zero
console/page errors across every check. **This PR**: auto-rewrite on commit —
`state/autoRewrite.ts`'s `shouldAutoRewriteNode` exclusion filter and `store/autoRewriteStore.ts`'s
real queue/flush engine (idle-timer/batch-cap dual trigger, paused-on-no-key, consecutive-fail
auto-disable), wired into `OutlineTree.tsx`'s two real commit call sites with paste-taint
detection, plus a status chip in the app's status bar and a new "Auto-rewrite" Settings section
(`AutoRewriteSettings.tsx`) — verified end-to-end in real headless Chrome (idle-timer flush
applying the AI result and updating the chip, batch-cap flushing immediately without waiting for
the idle delay, the checkbox exclusion correctly skipping a checkbox node's commit, and a
simulated paste-sourced commit correctly NOT queuing while still committing the text) — zero
console/page errors across every check. Slices 5-9 (Generate Outline/Restructure Text,
Expand/Tags, Suggest icon, Summarise selection, fallback+usage UI) not yet started. §6.10 onward
not started. Update each phase's own
section above with a `Status:` line and PR numbers as work lands, the same way
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
