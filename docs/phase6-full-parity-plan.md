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
- **Excel (Decision Log .xlsx) -- blocked, not started.** Legacy's real Excel export
  (legacy/index.html:33107 `exportDecisionLogXlsx`) is scoped specifically to Decision Log data
  (timestamp, author, linked node's text, decision-log fields) via `XLSX.writeFile` -- it is
  *not* a general outline-to-spreadsheet export, a real scoping correction from an earlier draft
  of this doc. `web/` has only Decision Log's pure normalization/query logic ported
  (`state/decisionLog.ts`, `state/decisionLogQueries.ts`, `state/decisionFilter.ts`) plus
  preserve-on-sync handling in `docSyncStore.ts` -- there is no Decision Log store or panel
  component anywhere in `web/` yet, so there is nothing for an Excel export to read. Needs a real
  Decision Log feature (its own Pad tab, matching legacy's) built first; tracked here as blocked
  on that, not as a small export-fidelity gap.
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
  exists yet. Deliberately still not ported, each a real architectural gap: Audience View /
  dual-screen (legacy's real implementation does a genuine second navigation of the same page
  with a query param -- `web/` has no client-side routing at all, a Phase 0 decision, so there is
  no page for a second window to load); Whiteboard mirroring (its poll loop only starts once
  Audience View is live, inheriting that same blocker); floating Notes/Q&A during presenting
  (legacy relocates the real Pad DOM nodes into a floating panel -- porting this well wants its
  own design pass on how `PadPanel.tsx`'s store-backed content should share itself between the
  normal Pad dock and a floating-during-Presenter view). Verified end-to-end in real headless
  Chrome: timer ticks, `G` opens the overview grid (closing-slide card included), `End` jumps to
  the closing slide showing "Thank you"/"Questions?", `Home` returns, `B` toggles the blackout
  overlay, the laser toggle button + mousemove renders the tracking dot -- zero console/page
  errors throughout.
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
  has no store/panel in `web/` yet, the same blocker already documented for Excel export). The
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
- Still not started: images/tables/decision-log cards/Notepad-Q&A sections/branding in Word;
  PDF's remaining fidelity gaps (margins config, footer, fold-state/notes/decision-card
  rendering -- currently a flat node list, not rendered from a Preview-equivalent); PowerPoint's
  remaining fidelity gaps (overflow "(cont'd)" slides, images, decision cards, branding); Sakura
  Document (`.sakura.json`) format; Word/OPML import.

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

**§6.1 complete** (#129–#130, #132–#138), **§6.2 complete** (#140–#148), **§6.3 complete**
(#150–#158, #164, #172, #174), **§6.4
complete** (#159–#161, #163 — the mention infrastructure §6.3 item 7 depended on), **§6.5
complete** (#176, #179, #181, #185, #187, #189, #191) — all
six Hub items now landed, and **§6.6 in progress** (#194, #196, #197, #198, #199, PowerPoint
Notepad/Q&A/closing slides landing in this PR) — see each section's own `Status:` line for the
full breakdown. §6.7 onward not started. Update each phase's own section above with a `Status:`
line and PR numbers as work lands, the same way `docs/history/phase5-parity-checklist.md`'s own
"Update" notes track progress.

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
