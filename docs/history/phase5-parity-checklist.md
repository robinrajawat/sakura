# Phase 5 — Parity Checklist (web/ vs README.md)

An explicit, section-by-section walk of README.md (the source of truth for what "done" means)
against `web/`'s actual current state — not a guess, a checklist. Written at the start of Phase
5 (docs/framework-migration-plan.md), as that phase's own audit deliverable.

Status key: ✅ Done · ⚠️ Partial (a real, deliberately scoped-down slice exists) · ❌ Not started

This is a large gap by design — Phases 2–4 each explicitly scoped every slice down from
legacy's real feature set, documenting every deferral inline as it happened (see each
component's own header comment for specifics). This checklist is where those many small,
scattered deferrals get seen all together for the first time, which is the actual point of a
parity pass: Phase 1–4 optimized for "land a real, honest, working slice fast," not for tracking
the aggregate gap as it grew. Nothing here is a surprise regression; it's the sum of choices
already made and already documented at the time.

## Overview / Key capabilities

| Capability | Status | Note |
|---|---|---|
| Nested outline editing (indent/outdent, drag reorder/nest, multi-select) | ✅ | Phase 2, full fidelity to ported core logic |
| Duplication | ❌ | `duplicateSelected` not ported/built |
| Bold/italic/underline/strike/highlight/color per node | ❌ | Rich per-node formatting not built; only semantic markup (below) exists |
| Heading 1–6 per node | ❌ | Not built |
| Semantic styling `[Section]`/`(note)`/`!alert`/`` `code` `` | ✅ | Phase 2, matches legacy exactly |
| Fold/unfold, "+N hidden" badge | ⚠️ | Fold/unfold works; no "+N" badge UI |
| `#tags` | ✅ | Phase 5 (PRs #118–#119) — toggle, filter, chips |
| `[[@mention]]` backlinks | ✅ | §6.4 complete (#159-#161, #163: pure query layer, wikilink render/click-navigate, `@`-mention insert, cleanup/rename-on-edit wiring) plus §6.3 item 7 (#164: the Note panel's own Backlinks section display) |
| Focus mode | ✅ | Phase 5 (PRs #118–#119) — zoom-in, breadcrumb, exit |
| Note panel | ⚠️ | Rich text (bold/italic/underline/strike/lists), links, images, tables, and the Backlinks section all built (Phase 6.3-6.4) — no AI (Rewrite/summarise) yet |
| Code block panel | ⚠️ | Lang + code only (Phase 3) — no resizable window, matches legacy's lang list |
| Decision Log | ⚠️ | Rebuilt to its real node-anchored schema (one per node, 5 structured fields, status, author, §6.7 #224) with live-editor own-node + collapsed-subtree badge dots (§6.7 #225); still no anchor-picker UI, no card rendering in exports, no Excel export |
| Pad (Notepad/Q&A/Diagrams/Mind Map/Files/Remarks) | ⚠️ | All 7 tabs functional (Diagrams and Mind Map both gained real editors, §6.3 item 11, #172/#174) — depth still varies per tab, see the Panels section below |
| Hub (To-Dos, Meeting Notes, Journal, Library, Recap) | ⚠️ | All 5 exist (Phase 4) at basic CRUD/derived-summary level — see Hub section below |
| Diagrams embedding in exports | ❌ | No diagram editor exists at all |
| AI features | ⚠️ | §6.9 started: provider configuration UI (7 built-in providers, curated + custom model select, API key entry/save/test, Secure-Storage-vault-aware key read/write) landed — see AI Features section below. Still none of Rewrite/auto-rewrite/Generate outline/Restructure text/Expand node/Suggest tags/Suggest icon/Summarise selection/provider fallback/usage tracking, and the Secure Storage vault itself has no setup/unlock UI yet (its crypto primitives are wired, just not exposed) |
| Quick Assist / global search | ❌ | Not built |
| Folders/templates/file explorer | ❌ | Not built — web/ has no document-management shell yet, only a single in-memory outline |
| Presenter Mode | ⚠️ | Slide grouping, Prev/Next/arrow-keys (Phase 3), plus timer, blackout, laser pointer, overview grid, closing slide, a floating Notes/Q&A panel, and now a real, working **Audience View/dual-screen** (§6.6): an "Open Audience View" button opens a second real browser window (`?sakuraAudience=1`, same-origin, no routing needed) showing a passive, driven presenting surface (`PresenterSlideView.tsx`) that live-mirrors slide navigation, blackout, and the laser pointer via a `window`-exposed cross-window bridge (`state/audienceBridge.ts`) pushing `usePresenterStore` state through — direct architectural analog of legacy's own real mechanism, verified end-to-end with two real coordinated browser windows. Only Whiteboard mirroring remains, blocked on Diagrams gaining a real `isWhiteboard` concept. See phase6-full-parity-plan.md's §6.6 section for the full mechanism |
| Export: Word/PDF/PowerPoint/Markdown/OPML/plain text/clipboard/Sakura Document | ⚠️ | Word/PDF/PowerPoint/Markdown/OPML exist (Phase 3) at a genuinely functional but heavily scoped-down level; plain text (.txt), clipboard ("Copy as Text"), and Sakura Document (.sakura.json, outline only — see Sakura Document row below) are now full-parity (§6.6) — see Export section below. No Excel export (blocked on Decision Log not existing as a real feature yet) |
| Multiple document tabs | ⚠️ | Phase 5 — real tab strip, document index, persistence, debounced autosave; no per-tab undo/redo, no folders/templates |
| Deep theming | ⚠️ | Light/Dark toggle (Phase 3), accent color, System auto-theme, and node-text color presets, all persisted across sessions (§6.7) — no Chrome background presets (investigated (§6.7): confirmed unreachable in legacy's own UI, not a gap in this port) |
| PWA install | ⚠️ | Manifest + service worker exist (Phase 3) — runtime cache-first, not legacy's precache strategy; single icon set, no maskable-variant distinction beyond the one icon already reused |
| Two-tier automatic backup | ❌ | No local safety copy (IndexedDB mirror), no auto-backup-to-file |
| Account sign-in + sync | ⚠️ | Google sign-in + bidirectional Firestore doc sync exist (Phase 4), wired to the real production project — no email/password, no sharing/collaboration, manual push not autosave |
| Version History | ❌ | Not built for any surface |

## Core Editing

| Feature | Status | Note |
|---|---|---|
| Enter / Shift+Enter (split) / Ctrl+Enter | ✅ | Phase 2 |
| Tab / Shift+Tab | ✅ | Phase 2 |
| Drag reorder/nest | ✅ | Phase 2 |
| Right-click sort children | ⚠️ | Sort exists (Phase 2) but as a toolbar button, not a context menu — web/ has no context menu system at all yet |
| Fold arrow + "+N" badge | ⚠️ | Fold works; no badge |
| Inline semantic markup | ✅ | Phase 2 |
| Node hover toolbar | ❌ | Not built |
| Checkboxes (toolbar + `[ ]`/`[x]` auto-convert, progress badge) | ⚠️ | Auto-convert + toggle + cascade/propagate exist (Phase 2); no toolbar button, no progress badge on parent |
| Quick Insert | ❌ | Not built |

## Documents & Tabs

✅ **Closed** (Phase 5, PRs #115–#116). A real multi-document model exists: `documentsStore.ts`
manages a document index, an open-tab strip, and the active document, persisted to
`localStorage` under a distinct `sakura_web_*` namespace. `DocumentTabs.tsx` provides the tab
strip (rename via double-click, close-preserves-content vs. delete-removes-it, matching
README's own distinction) plus a picker to reopen any existing document. Debounced autosave
(800ms) and first-launch content adoption were both caught and fixed before shipping.

Still gaps from the README's fuller description: no per-tab independent undo/redo (outlineStore
itself has no undo/redo at all yet, tabbed or not — broader than this slice), no per-tab
independent scroll position/selection (switching tabs resets selection), no folders/templates,
no searchable tab-switcher dropdown for overflow, no drag-to-reorder tabs. Each a real,
separately-scoped follow-up building on this foundation.

## Panels

| Feature | Status | Note |
|---|---|---|
| Note (rich text, images, tables, AI, backlinks) | ⚠️ | Rich text, images, tables, links, and backlinks all built — no AI yet |
| Code Block (lang picker, resizable window) | ⚠️ | Lang picker + textarea exist; not resizable/floating |
| Pad — Notepad | ⚠️ | Plain textarea (Phase 3); no rich text toolbar, no Quote button |
| Pad — Q&A | ⚠️ | Question/answer + search/filter (§6.3) + real node-anchoring and live-editor inline previews (§6.7, `anchorNodeId`) now built; no AI-assisted answering, bulk actions, PDF export, section headers |
| Pad — Decision Log | ⚠️ | Real node-linking + structured fields (context/decision/rationale/alternatives/impact) + author/status built (§6.7 #224), plus outline badge dots (§6.7 #225); no anchor-picker UI yet (`setDecisionAnchor` exists on the store, no UI), no card rendering, no Excel export |
| Pad — Diagrams | ⚠️ | Real draw.io embed + Generate-from-outline built (§6.3 item 11, #172); no node-linking/status/thumbnails/Whiteboard/multi-page badge |
| Pad — Mind Map | ⚠️ | A real freeform canvas built (§6.3 item 11, #174): pan/zoom/drag/connect/edit; no node-linking, Scratchpad, or Presenter-mode integration |
| Pad — Files | ⚠️ | Real upload/storage + download built (§6.3 item 11, #168); no node-linking |
| Pad — Remarks | ⚠️ | Person/text/date (§6.3) + real node-anchoring and live-editor inline previews (§6.7, `anchorNodeId`) now built; no export inclusion |

## Hub

| Feature | Status | Note |
|---|---|---|
| Meeting Notes | ⚠️ | Real persistence (IndexedDB-backed, matching legacy's own `loadMeetingNotes`/`saveMeetingNotes`), time/attendees/agenda/notes fields, action items, and Promote-to-To-Do all built (§6.5, #181); no PDF export/Version History/Share (deferred to §6.6/§6.8 — cross-cutting infra, not Hub-specific), no cross-document node links (separately-scoped, same category as Files/Diagrams/Mind Map's own deferred node-linking in §6.3). "Templates", previously listed as a gap here, is corrected: legacy itself ships zero prebuilt meeting-note templates (`MEETING_TEMPLATES=[]`, a deliberate documented removal, not an oversight) — the create-new-meeting entry point this gap actually pointed at is built |
| To-Dos | ⚠️ | Priority/status/due-dates/repeat/subtasks (§6.5, #176), search filtering/urgency-sectioned grouping/completed-section/due-date reminder notifications (§6.5, #179) all built; no PDF export/Version History/Share (deferred to §6.6/§6.8 — cross-cutting infra, not Hub-specific). "Bulk-actions" and "tags", previously listed here, were removed after checking legacy/hub.html and legacy/index.html directly: neither exists anywhere in legacy's real To-Dos implementation, so they were never a real parity gap |
| Journal | ⚠️ | One-entry-per-date editing, mood, rich text (bullet/numbered list + Ctrl/Cmd+B/I), and a calendar-popover date picker all built (§6.5, #185); no AI rewrite, PDF export, Version History, or search (legacy's own Journal search lives only in the shared Quick Assist / hub-wide search bar, which doesn't exist in web/ yet). Tags UI is correctly NOT a gap: legacy itself has no tags UI for Journal despite README.md referencing them -- a pre-existing doc/code mismatch |
| Library | ⚠️ | Persistence, title/url/urlLabel/tags/favorites, search, tag filtering, and rich text (bullet/numbered list + Ctrl/Cmd+B/I, matching Journal's own narrower toolset) all built (§6.5, #187); no AI rewrite, images, Version History, PDF export, or Quick Assist/Global Search visibility (Quick Assist doesn't exist in web/ yet) |
| Recap | ⚠️ | Real Today/This Week/Last Week period grouping and click-to-jump for To-Dos/Meeting Notes/Journal all built (§6.5, #189); no AI summarize (§6.9 not started), no outline-node/document-level activity grouping (blocked on `OutlineNode` having no per-node `createdAt`/`modifiedAt`/`completedAt` fields yet -- a separately-scoped data-model change), no Decision Log/Diagrams/Q&A/Mind Map activity (same blocker). Library was never part of legacy's own Recap scan, so its absence here is correct, not a gap |
| Mobile Hub (hub.html equivalent) | ⚠️ | A real responsive breakpoint (`useIsMobileViewport.ts`) swaps in `MobileHub.tsx` -- swipe-to-act rows (direct port of legacy's own `initSwipeList` gesture engine) and bottom-sheet To-Dos/Journal editing, reusing every existing store action (§6.5, #191); no sign-in gate (a real, honest simplification -- this SPA has no separate-device-storage problem to bridge, since Hub cloud sync doesn't exist anywhere in web/ yet, §6.8 not started), no account menu/search bar/theme toggle from within this view (bypasses `AppShell` entirely) |

## Tags, Focus & Backlinks

✅ **Tags and Focus mode closed** (Phase 5, PRs #118–#119) — see the Overview table above and
`web/src/store/outlineStore.ts`'s `toggleTag`/`setTagFilter`/`zoomIntoNode`/`focusPath` for the
real implementation. Deliberately flat tag-filter scoping (no ancestor-context restoration),
same "honest first pass" convention as every other slice in this project.

✅ `[[@mention]]` backlinks complete — see the Overview table above and
`docs/phase6-full-parity-plan.md` §6.3 (item 7, #164) and §6.4 (#159-#161, #163) for the full
breakdown.

## AI Features

⚠️ §6.9 (docs/phase6-full-parity-plan.md) started, first slice landed (this PR, following #227):
provider configuration UI — direct port of legacy's real seven-provider catalog
(`AI_BUILTIN_PROVIDERS`/`AI_CURATED_MODELS`, now `state/aiProviderCatalog.ts`), the core
`callAiByShape` network primitive covering all four real request/response shapes (`gemini`/
`openai`/`anthropic`/`cerebras`, now `state/aiCall.ts`), and provider/model selection + API key
entry/save/test wired into a new "AI" section of Settings (`AiProviderSettings.tsx` +
`store/aiSettingsStore.ts`). Key storage is vault-aware from the start (branches on
`vaultActive()`/`vaultUnlocked()` exactly like legacy's real `getAiKeyForProvider`/`saveAiKey`,
now extended into `state/aiProviders.ts`), reusing the AES-GCM/PBKDF2 crypto primitives already
sitting unwired in `state/vault.ts` since an earlier phase — but the vault's own setup/unlock UI
(passphrase dialogs, a status chip, migrating existing plaintext keys) is a real, separately-scoped
follow-up, not built yet, so every key today takes the plain-localStorage path. Still not built:
Rewrite (incl. auto-rewrite on commit), Generate Outline, Restructure Text, Expand node, Suggest
tags, Suggest icon, Summarise selection, provider fallback chain UI, usage tracking. See
phase6-full-parity-plan.md's §6.9 section for the full remaining slice sequence.

## Quick Assist & Quick Insert

❌ Entirely not built.

## Preview, Presenter Mode & Export

| Feature | Status | Note |
|---|---|---|
| Preview (TOC, scroll-spy, progress bar) | ⚠️ | Real TOC (section/heading entries), scroll-spy, and a scroll progress bar all built (§6.6, #194); no Decision Log detection/TOC entries, no TOC collapse/resize, no word-count/author/updated-at meta header |
| Presenter Mode | ⚠️ | See Overview table above |
| Word export | ⚠️ | Real .docx via the `docx` library (Phase 3); heading styles, a real TOC field, a branding footer, note-image embedding, and Notepad/Q&A sections now built (§6.6); no Decision Log cards, rich formatting, tables |
| PDF export | ⚠️ | Browser print-to-PDF (Phase 3); cover page, per-page branding, page margins (20mm), a date/page-count footer, and per-node note/code-block rendering now built (§6.6, real CSS `@page` margin-box rules); still not rendered from a real Preview-equivalent with decision cards |
| PowerPoint export | ⚠️ | Real .pptx via `pptxgenjs` (Phase 3), same slide breakdown as Presenter Mode; Notepad slide, Q&A slide, closing slide, per-slide branding, real overflow "(cont'd)" pagination (canvas-measured wrapped-line height, covering per-node slides AND Notepad/Q&A sections), and per-node note-image embedding (aspect-ratio-scaled image row, legacy's own `pptxLayoutImageRow` ported) now built (§6.6); still no decision cards (blocked -- no Decision Log feature in `web/` yet) |
| Branding | ✅ | Built (§6.6): wordmark in the Word page footer, PowerPoint slide corners, PDF cover page + every printed page (CSS `@page{@bottom-right{...}}`), and the live Presenter Mode bar — always on, no Settings toggle/custom text yet |
| Accent-color-in-exports toggle | ❌ | Not applicable yet — no accent color system exists |
| Markdown / OPML export | ✅ | Phase 3, wraps already-ported (Phase 1) serializeMarkdown/serializeOpmlCore exactly |
| Plain text (.txt) / clipboard export | ✅ | §6.6, wraps already-ported (Phase 1) serializeTreeTextCore/serializeClipboardHtmlCore exactly; clipboard writes both text/plain and text/html via ClipboardItem, execCommand fallback |
| Excel (Decision Log .xlsx) export | ❌ | Blocked on Decision Log not existing as a real feature (store/panel) in web/ yet — legacy's real Excel export is Decision-Log-specific, not a general outline export |
| Import (Word/OPML/pasted text) | ⚠️ | OPML and Word (.docx, via mammoth) import now built (§6.6, both always land in a new document); no AI-restructure fallback for a flat Word doc (no AI in web/ yet) or tree-connector-notation detection (smart-paste not ported); pasted-text import not built |
| Sakura Document (.sakura.json) | ⚠️ | Outline export/import built full-fidelity (§6.6, styles/tags/codeBlock all round-trip, unlike OPML's lossy text encoding); Pad content (Notepad/Q&A/Diagrams/Mind Maps/Decision Log/Remarks/Attachments) NOT included — none of it is document-scoped or even persisted in web/ yet (padStore.ts is a single flat app-wide in-memory store), a real architectural gap, not a small omission |

## Theming & Appearance

| Feature | Status | Note |
|---|---|---|
| Light/Dark theme | ✅ | Phase 3, persisted across sessions (§6.7) |
| Auto theme | ✅ | System mode built (§6.7): follows `prefers-color-scheme` live via a real `matchMedia` listener, with a temporary-override mechanic for manual clicks matching legacy's own real UX exactly; no "Schedule" mode -- confirmed that mode doesn't actually exist in legacy's own current code (its `setThemeMode` whitelist is `['manual','system']` only, despite a leftover comment mentioning a third mode) |
| Accent color | ✅ | All 7 real presets, a swatch-row picker UI, and persistence across sessions (§6.7); no custom-color picker |
| Chrome background presets | N/A | Investigated (§6.7): legacy has the real `CHROME_PRESETS`/`applyChromeColors`/`setChromePreset` data and logic, but its own trigger markup (`#chrome-swatch-row`) doesn't exist anywhere in legacy/index.html -- no real legacy user can ever reach this feature. Porting a picker for it would invent UI legacy itself doesn't expose, not port parity |
| Node text color presets | ✅ | All 4 real presets, a swatch-row picker UI, and persistence across sessions, independent of the accent-color axis (§6.7) |
| Editor's Choice preset | N/A | Investigated (§6.7): NOT a layout preset -- legacy's real `applyEditorsChoicePreset` is a ~40-setting personal configuration snapshot (toolbar-group visibility, hover-toolbar, context-menu ordering, Presenter auto-behaviors, AI thresholds, even a hardcoded personal name), most of which `web/` has no settings for at all. Marked N/A by explicit user decision rather than building an entire toolbar-customization subsystem first |
| Layout controls (tree lines, depth guides, row style, compact rows, text size, indent width, limit reading width) | ⚠️ | Compact rows, text size, limit reading width, row style, and depth guide lines (a faint per-ancestor-depth vertical line in the live tree, `.node-vguide` equivalent) are all real, persisted, adjustable prefs, verified end-to-end in real headless Chrome; indent width/hide-tree-lines/outline-numbering remain export-only. Still not built: the monospace ASCII-connector alternate live-tree rendering mode (`hideTreeLines=false` -- a real but non-default legacy toggle; the DEFAULT live-tree mode is CSS-padding-based, the same family `web/` already uses, not a fundamentally different architecture as earlier noted here) |
| Inline note/remark previews | ✅ | §6.7: real per-node toggle dots + a document-wide "Always expand" default, matching legacy's own deviation-from-default mechanism exactly (`inlineExpandStore.ts`/`state/inlineExpand.ts`). Read-only previews (click the note preview to edit in the Note panel) rather than legacy's inline `contentEditable` -- a deliberate, documented scoping choice, not a gap |
| Inline Q&A previews | ✅ | §6.7, same mechanism as above. Needed real node-anchoring added to Q&A first (`padStore.ts`'s `anchorNodeId`) |

## Installing as an App (PWA)

| Feature | Status | Note |
|---|---|---|
| Manifest + service worker | ✅ | Phase 3 — runtime cache-first strategy, not legacy's static precache (Vite's hashed build filenames explain the difference, see that PR's own commit message) |
| Install icon transparency / maskable variant | ⚠️ | Icons reused directly from legacy/public/ (already correct); no independent verification of transparency/maskable behavior specifically for web/'s manifest |
| Title bar color follows live theme | ❌ | Not verified/built |

## Account, Sync & Sharing

| Feature | Status | Note |
|---|---|---|
| Google sign-in | ✅ | Phase 4, wired to the real production Firebase project |
| Email/password sign-in | ❌ | Not built |
| Document sync | ⚠️ | Phase 4 — bidirectional, real production Firestore collection, built to preserve legacy-only per-node fields on round-trip; manual push (not autosave), no folders/templates/settings sync, single-document only (no multi-doc concept in web/ yet) |
| Sharing (Can view/Can edit, Share chip, Shared section, notifications) | ❌ | Not built |
| Sync health status-bar dot | ❌ | Not built |

## Data & Backup

| Layer | Status | Note |
|---|---|---|
| 0. Account sync | ⚠️ | See above |
| 1. Local safety copy (IndexedDB mirror) | ❌ | Not built |
| 2. Auto-backup to file (File System Access API) | ❌ | Not built |
| 3. Export/Import (whole-app JSON) | ❌ | Not built |
| Undo last restore | ❌ | Not applicable — no restore mechanism exists |

## Feedback & Crash Reports

❌ Entirely not built.

## Settings Reference

⚠️ `web/` now has a first, minimal Settings panel (§6.7/§6.10: a "⚙ Settings" header button
opening a dropdown), holding only three export-formatting prefs (tree indent width, hide tree
lines, outline numbering) -- the only settings with a real existing consumer so far. Legacy's
own real panel has a multi-category rail with dozens more; every other setting in the README's
reference table is still either not applicable yet (the feature it configures doesn't exist) or
hardcoded to a single behavior with no toggle.

## Keyboard Shortcuts

| Shortcut | Status |
|---|---|
| Enter / new sibling | ✅ |
| Shift+Enter / split | ✅ |
| Ctrl/Cmd+Enter / new child | ✅ |
| Tab / Shift+Tab | ✅ |
| Delete (multi-select aware) | ✅ (not in README's table by this exact name, but functionally covers "delete selected") |
| Everything else in the README's table (F2 edit, Alt+↑/↓ move, formatting shortcuts, heading shortcuts, collapse/expand-all, hide tree lines, Focus, search, Quick Assist/Insert, panel-open shortcuts, AI shortcuts, save/new-doc/copy/select-all/undo-redo) | ❌ | Not built |

## Browser Support / Known Limitations

Not separately verified for `web/` — inherits whatever Vite/React's own baseline browser
support is, not independently tested against the same matrix legacy documents.

## Contributing / Deployment

`web/` is not deployed anywhere yet (confirmed current as of this checklist — see
docs/framework-migration-plan.md's own "Where the React rewrite actually stands" section and
README.md's own Deployment section, both of which explicitly say so).

---

## Phase 5 status: closed

Phase 5 was scoped as an audit, not a cutover milestone (see `docs/framework-migration-plan.md`'s
Phase 5 entry) — this checklist is that audit, and it's done. Two feature slices also landed
while Phase 5 was underway: Documents & Tabs (PRs #115–#116) and Tags & Focus (PRs #118–#119),
both real, merged, closed.

Everything else this checklist found still missing is tracked as its own sequenced plan:
**`docs/phase6-full-parity-plan.md`**. That plan owns the remaining feature work and the cutover
itself, and states the rule this checklist's audit exists to support: `www.sakura-notes.com`
stays on `legacy/` until Phase 6's own pre-cutover gate is explicitly cleared — a real person
using the actual built app, not a passing build alone.
