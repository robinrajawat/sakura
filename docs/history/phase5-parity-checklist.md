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
| Decision Log | ✅ | Rebuilt to its real node-anchored schema (one per node, 5 structured fields, status, author, §6.7 #224) with live-editor own-node + collapsed-subtree badge dots (§6.7 #225), a real anchor-picker popover (§6.7), and Preview/PDF/Word/PowerPoint/Excel card/export rendering (§6.7) — all four export surfaces plus the live editor are now built |
| Pad (Notepad/Q&A/Diagrams/Mind Map/Files/Remarks) | ⚠️ | All 7 tabs functional (Diagrams and Mind Map both gained real editors, §6.3 item 11, #172/#174) — depth still varies per tab, see the Panels section below |
| Hub (To-Dos, Meeting Notes, Journal, Library, Recap) | ⚠️ | All 5 exist (Phase 4) at basic CRUD/derived-summary level — see Hub section below |
| Diagrams embedding in exports | ❌ | No diagram editor exists at all |
| AI features | ✅ | §6.9 complete: provider configuration UI, Secure Storage vault setup/unlock/lock/disable UI, manual Rewrite, auto-rewrite on commit, Generate Outline/Restructure Text (real heuristic parser, dedicated restructure dialog, both keyboard shortcuts), Expand node/Suggest tags, Suggest icon (keyword/historical-index free tiers, batch + single-node picker), Summarise selection, and the provider fallback chain + usage tracking — see AI Features section below |
| Quick Assist / global search | ⚠️ | Ctrl/Cmd+K command box with an audited subset of real toggle commands/actions (§6.10 slice 3), plus a first Global Search sub-slice covering Documents/In documents/Notes/Code/Tags/Folders (§6.10 slice 4a) — Pad/Q&A/Diagrams/Remarks/Settings/Features/Help search, category-prefix scoping, and the chip-mode picker not built yet, see the Quick Assist & Quick Insert section below |
| Folders/templates/file explorer | ❌ | Not built — web/ has no document-management shell yet, only a single in-memory outline |
| Presenter Mode | ⚠️ | Slide grouping, Prev/Next/arrow-keys (Phase 3), plus timer, blackout, laser pointer, overview grid, closing slide, a floating Notes/Q&A panel, and now a real, working **Audience View/dual-screen** (§6.6): an "Open Audience View" button opens a second real browser window (`?sakuraAudience=1`, same-origin, no routing needed) showing a passive, driven presenting surface (`PresenterSlideView.tsx`) that live-mirrors slide navigation, blackout, and the laser pointer via a `window`-exposed cross-window bridge (`state/audienceBridge.ts`) pushing `usePresenterStore` state through — direct architectural analog of legacy's own real mechanism, verified end-to-end with two real coordinated browser windows. Only Whiteboard mirroring remains, blocked on Diagrams gaining a real `isWhiteboard` concept. See phase6-full-parity-plan.md's §6.6 section for the full mechanism |
| Export: Word/PDF/PowerPoint/Markdown/OPML/plain text/clipboard/Sakura Document/Excel | ⚠️ | Word/PDF/PowerPoint/Markdown/OPML exist (Phase 3) at a genuinely functional but heavily scoped-down level; plain text (.txt), clipboard ("Copy as Text"), and Sakura Document (.sakura.json, outline only — see Sakura Document row below) are now full-parity (§6.6) — see Export section below. Preview/PDF/Word/PowerPoint decision-log cards, and a new Decision-Log-specific Excel (.xlsx) export, now built too (§6.7) |
| Multiple document tabs | ⚠️ | Phase 5 — real tab strip, document index, persistence, debounced autosave; no per-tab undo/redo, no folders/templates |
| Deep theming | ⚠️ | Light/Dark toggle (Phase 3), accent color, System auto-theme, and node-text color presets, all persisted across sessions (§6.7) — no Chrome background presets (investigated (§6.7): confirmed unreachable in legacy's own UI, not a gap in this port) |
| PWA install | ⚠️ | Manifest + service worker exist (Phase 3) — runtime cache-first, not legacy's precache strategy; single icon set, no maskable-variant distinction beyond the one icon already reused |
| Two-tier automatic backup | ✅ | Tier 1 (local safety copy, an IndexedDB mirror of localStorage) built §6.8 — direct port of legacy's real `mirrorToIndexedDb`, 1200ms debounce on outline edits, a "Restore…" button under Settings → Data & Backup. Tier 2 (auto-backup to file, File System Access API, §6.8) now built too — direct port of legacy's real Connect…/Disconnect…/Reconnect state machine (`store/fsBackupStore.ts`), driven off the SAME 1200ms debounce timer as tier 1 (matching legacy's own `scheduleBackupWrite`, which fires both together). Chrome/Edge only — degrades to a disabled "Connect…" with an explanatory note elsewhere. Not built: backup-history rotation (5 timestamped snapshots) and the "haven't backed up in N days" reminder nag, both real, separately-scoped follow-ups |
| Account sign-in + sync | ⚠️ | Google AND email/password sign-in (§6.8) + bidirectional Firestore doc sync exist (Phase 4), wired to the real production project. Real debounced autosave now built too (§6.8): an outline edit queues a push 1500ms after edits settle, matching legacy's own real `queueSync`/`flushSyncQueue` timer exactly, plus a sync-status indicator (Syncing…/Synced/error text) replacing the old manual "Push to cloud" button. Full sharing/collaboration now built too (§6.8, see the Sharing row below) — still no sync health indicator beyond the text status line, no full JSON export/import, no Version History |
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
| Quick Insert | ✅ | Ctrl/Cmd+Space character-insert menu, real keyboard nav (arrow keys + Enter/Tab to commit), icon-only-row and per-action-enable Settings, all 7 actions (§6.10) — see the Quick Assist & Quick Insert section below |

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
| Pad — Decision Log | ✅ | Real node-linking + structured fields (context/decision/rationale/alternatives/impact) + author/status built (§6.7 #224), outline badge dots (§6.7 #225), a real anchor-picker popover for re-anchoring (§6.7, `components/AnchorPicker.tsx`), and Preview/PDF/Word/PowerPoint card rendering plus a dedicated Excel (.xlsx) export (§6.7) — all four export surfaces now built |
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
| Recap | ⚠️ | Real Today/This Week/Last Week period grouping and click-to-jump for To-Dos/Meeting Notes/Journal all built (§6.5, #189); no AI summarize (a distinct Hub-specific capability, never part of §6.9's own outline-level 9-slice scope, which is now complete), no outline-node/document-level activity grouping (blocked on `OutlineNode` having no per-node `createdAt`/`modifiedAt`/`completedAt` fields yet -- a separately-scoped data-model change), no Decision Log/Diagrams/Q&A/Mind Map activity (same blocker). Library was never part of legacy's own Recap scan, so its absence here is correct, not a gap |
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

✅ §6.9 (docs/phase6-full-parity-plan.md) complete — all 9 planned slices landed. **Slice 1** (#230, following
#228): provider configuration UI — direct port of legacy's real seven-provider catalog
(`AI_BUILTIN_PROVIDERS`/`AI_CURATED_MODELS`, now `state/aiProviderCatalog.ts`), the core
`callAiByShape` network primitive covering all four real request/response shapes (`gemini`/
`openai`/`anthropic`/`cerebras`, now `state/aiCall.ts`), and provider/model selection + API key
entry/save/test wired into a new "AI" section of Settings (`AiProviderSettings.tsx` +
`store/aiSettingsStore.ts`). Key storage was vault-aware from the start (branches on
`vaultActive()`/`vaultUnlocked()` exactly like legacy's real `getAiKeyForProvider`/`saveAiKey`,
extended into `state/aiProviders.ts`), reusing the AES-GCM/PBKDF2 crypto primitives already
sitting unwired in `state/vault.ts` since an earlier phase — but the vault's own setup/unlock UI
wasn't built yet, so every key took the plain-localStorage path.

**Slice 2** (this PR): the Secure Storage vault's real setup/unlock/lock/disable UI —
`store/vaultStore.ts` (real passphrase-based setup with a 6-char minimum and matching-confirm
check, unlock via the verifier-ciphertext pattern legacy itself uses, lock, and disable which
flushes every currently-decrypted key back to plaintext) plus `SecureStorageSettings.tsx` (a new
Settings section, inline passphrase forms rather than legacy's own modal dialogs — `web/` has no
generic modal system yet, matching the project's established `window.confirm`-as-stand-in
convention for anywhere else a dialog would otherwise be needed). Setup migrates every existing
plaintext key to ciphertext in one pass. `vault.ts` gained the small real (not test-only)
`setVaultCryptoKey` setter plus `getAllVaultDecryptedKeys`/`clearVaultDecryptedKeys` bulk
accessors the orchestration layer needs. Not ported: legacy's status-bar `sb-vault-chip` (`web/`
has no status bar surface yet, §6.1's own unbuilt item) and Cloud Backup/Gist-token vault
protection (`web/` has no Cloud Backup feature at all). A real bug was caught and fixed by
headless-Chrome verification before merging: the AI section's key-status line could get stuck
showing a stale "Key saved." message after the vault was locked/unlocked elsewhere, because a
Save/Test result message wasn't being cleared when the vault's lock state changed out from under
it — fixed by clearing that transient message whenever the resolved lock state itself flips.

**Slice 3** (this PR): Rewrite — manual only (no auto-rewrite on commit yet). New
`state/aiCapabilities.ts` (`callAiApi`, plus batched `callAiApiBatchChunk`/`callAiApiBatch` using
legacy's real `<<<SAKURA-ITEM-N>>>` sentinel-marker chunking, falling back to each item's own
original text if its marker doesn't parse cleanly) and `state/aiRewrite.ts`
(`rewriteNode`/`rewriteNodes`/`rewriteDocument`, plus `aiSnapshotChanged`, legacy's real
in-flight-edit-guard check that discards a stale AI result if the node was edited again before
the request finished). `outlineStore.ts` gained a new `applyAiTextResult` action rather than
reusing `commitEdit` directly — `commitEdit` unconditionally clears `editingId`, which would
wrongly close out a *different* node's active edit session if an AI result for another node
happens to land mid-edit, a race `commitEdit` was never designed to guard against. Three real
trigger points: a toolbar "✦ Rewrite" button (single selection → `rewriteNode`, multi-select →
`rewriteNodes`) and two right-click context-menu entries ("✦ Rewrite", selection-aware the same
way; "✦ Rewrite document" → `rewriteDocument`). Not built in this slice: sub-text-selection
rewrite (needs live textarea selection-range access `OutlineTree.tsx`'s uncontrolled-input
editing model doesn't expose anywhere yet) and Quick Assist triggers (Quick Assist itself doesn't
exist in `web/` yet). No provider fallback yet either — deliberately deferred to slice 9,
`aiCapabilities.ts`'s `callAiApi` calls `callAiByShape` directly for now. Verified end-to-end in
real headless Chrome with the Gemini endpoint mocked via Playwright's `page.route` (no real key
needed): single-node rewrite via the toolbar plus a real undo reverting it, multi-select batch
rewrite via the toolbar, both context-menu entries, and two failure paths — the in-flight-edit
guard actually discarding a result for a node edited mid-flight (confirmed the edited text won,
not the stale AI one), and rewriting with no AI key configured surfacing a clear alert rather
than hanging or throwing — zero console/page errors throughout.

**Slice 4** (this PR): auto-rewrite on commit. New `state/autoRewrite.ts`
(`shouldAutoRewriteNode`, the real exclusion filter — checkbox/heading/Decision-Log-field/
backlink-or-code-syntax, all four independently toggleable, plus a minimum-word-count threshold)
and `store/autoRewriteStore.ts` (the real queue/flush engine: a committed node joins a pending
`Set`, flushing on whichever comes first — a `batchCap` node count or an `idleSec` idle timer —
pausing rather than discarding the queue when no AI key is available, and disabling itself after
3 consecutive failed flushes). Wired into `OutlineTree.tsx`'s two real commit call sites (Enter,
blur) with real paste-taint detection (an `insertFromPaste`/`insertFromDrop`/`insertFromYank`
input event marks the session tainted, so a pasted commit still saves but never queues). A status
chip in the app's status bar (click to toggle on/off, live "N queued"/"paused"/"rewriting" text)
and a new "Auto-rewrite" Settings section. Deliberate simplification, documented in
`autoRewriteStore.ts`'s own header: unlike legacy's real auto-resume-the-moment-a-key-exists
behavior, a paused (no-key) queue here needs an explicit "Retry now" click — auto-resuming would
need `autoRewriteStore.ts` and `aiSettingsStore.ts` to import each other, a real circular-import
risk for a background convenience. Verified end-to-end in real headless Chrome: an idle-timer
flush correctly applying the AI result and updating the chip, a batch-cap flush firing
immediately without waiting for the (much longer) idle delay, the checkbox exclusion correctly
skipping a checkbox node's commit, and a simulated paste-sourced commit correctly not queuing
while the text itself still committed — zero console/page errors throughout.

**Slice 5** (this PR): Generate Outline + Restructure Text. New `utils/parseTextToTree.ts`
(`parseTextToTreeNodesCore`/`looksAlreadyStructuredCore`) is a direct port of legacy's real
heuristic text-to-tree parser — differentially tested against the real function itself (extracted
and run standalone from `legacy/index.html`) across 19 representative inputs (bullet/numbered/
lettered/roman lists, tree-connector box-drawing glyphs, checkbox markers, separator lines,
branch-only lines that deepen the next real line, wrapped continuation lines, empty/whitespace
input) to catch any subtle porting mistake a hand-written test suite alone might miss. New
`aiCapabilities.ts` functions (`callAiApiOutline`/`callAiApiRestructure`, real system prompts and
`maxTokens` verbatim from legacy) and `state/aiOutline.ts` orchestrate the two features, each
with its own real insertion behavior matching legacy exactly: Generate Outline nests the result as
children of the current selection in the document already open (via a new `outlineStore.ts`
`insertGeneratedOutline` action with a real undo checkpoint — a genuine addition to content the
user was already looking at); Restructure Text always lands in a brand-new document, matching
legacy's own deliberate "never silently merge into what's open" guarantee, with the same
already-structured free-parse bypass legacy uses to skip the AI call entirely when the pasted
text already carries visible structure. A new `RestructureTextDialog.tsx` provides a real
textarea modal (not `window.prompt`, which can't reliably hold multi-line pasted text) plus
toolbar buttons for both and the real `Ctrl/Cmd+Shift+O` / `Ctrl/Cmd+Shift+R` keyboard shortcuts.
Not built: stashing Restructure's original pasted text into the new document's Pad — a real,
separately-scoped gap (`padStore.ts` has no per-document scoping at all yet, the same
architectural gap already documented for Sakura Document export/import). Verified end-to-end in
real headless Chrome with the AI endpoint mocked via Playwright: Generate Outline via both the
toolbar and the keyboard shortcut, correctly nesting under the selected node and correctly
no-op'ing when the topic prompt is cancelled; Restructure Text via both the toolbar and the
keyboard shortcut, both the already-structured bypass (confirmed zero AI calls made) and the
AI-driven path for flat unstructured text, each correctly landing in a genuine new document; the
dialog's own Cancel button — zero console/page errors throughout.

**Slice 6** (this PR): Expand node + Suggest tags, both simple single-node single-shot
capabilities. A new generic `callAiApiWithPrompt` on `aiCapabilities.ts` (system prompt + user
message + `maxTokens` + call context, no batching — unlike Rewrite, neither of these ever needs
it) backs both. `state/aiExpandTags.ts` holds the two orchestrations (`expandNode`/`suggestTags`)
plus their pure response parsers: `parseExpandResponseCore` strips bullet-prefixes from a flat
list (no indentation parsing, unlike Generate Outline's parser — Expand's response is always
flat by design); `parseTagsResponseCore` parses a JSON array (stripping a ```json fence the model
sometimes adds), falling back to a comma/newline split if that fails, with every resulting tag run
through `normalizeTagCore` (lowercase, spaces to hyphens, strip anything outside `[a-z0-9-]`, cap
40 chars) regardless of which path produced it. `outlineStore.ts` gained two actions:
`expandNodeChildren` splices the new nodes in immediately after the parent (at `idx + 1`, not at
the end of its subtree), so they become the parent's first children even if it already has some —
matching legacy's real behavior; `addSuggestedTags` adds only genuinely new tags and — like
`applyAiTextResult` — pushes no undo checkpoint when nothing actually changes (every suggested tag
already present). Trigger surface is toolbar-only ("✦ Expand"/"✦ Tags" buttons, enabled only with
exactly one node selected) since neither the right-click menu nor Quick Assist exist yet as
surfaces for these two. Verified end-to-end in real headless Chrome with the AI endpoint mocked via
Playwright: the buttons correctly enabling with exactly one selection and disabling with zero or
multiple; Expand inserting the right number of correctly-texted children right after the parent;
Suggest Tags applying only genuinely-new tags (with `#` display) and reporting cleanly, with no
error, when every suggested tag is already present; Undo correctly reverting an Expand — zero
console/page errors throughout. A real bug was found and fixed during that verification: the
toolbar buttons' enabled/disabled state was computed from `selectedId !== null`, which doesn't
change value across a single-select → multi-select transition, so React never re-rendered the
buttons on that transition and they stayed visually enabled during an actual multi-select; fixed
by also subscribing to `multiSelectedIds` (always a fresh array reference on every selection
change) purely to force the re-render.

**Slice 7** (this PR): Suggest icon. New `state/aiIcon.ts` direct-ports legacy's real batched
`suggestIconsForNodeIds` and single-node `suggestIconChoiceForNode`: a local keyword→emoji lookup
(`ICON_KEYWORD_MAP`, ~44 entries) and an exact-label historical match against the live document
plus every saved document (`documentsStore.ts` gained a plain `loadDocNodesById` accessor for this)
both run first and cost nothing — only labels that miss both tiers reach the AI, batched with
identical labels deduped into one lookup. The single-node picker path is a closer, deliberately
faithful port of a real legacy quirk: it always ALSO queries the AI for 4 more emoji options when a
key is configured, even if a free-tier hit already exists, merging everything into one candidate
list — auto-applying only when that adds up to exactly one option, otherwise handing the list to a
new `IconPickerPopover.tsx` (backed by a small `iconPickerStore.ts`, since both the toolbar button
and `OutlineTree.tsx`'s right-click menu need to open it and `OutlineTree.tsx` takes no props) for
the person to choose from — one click applies and closes, Escape or an outside click dismisses with
no change. `outlineStore.ts` gained `applySuggestedIcons` (batch, same in-flight-edit-guard
re-resolve-by-id pattern as `aiRewrite.ts`'s own batch path, one undo checkpoint) and
`applyIconChoice` (single, re-strips any existing leading icon before applying the new one). A new
`utils/iconText.ts` holds the shared `splitLeadingIconCore` — kept out of both `outlineStore.ts` and
`aiIcon.ts` specifically to avoid a circular import between them. One deliberate technique
simplification from legacy: the picker always renders centered rather than anchored pixel-precisely
above the node's own row, since `web/`'s tree rows have no stable selector equivalent to legacy's
`.node-row[data-id]` — this reuses legacy's own real fallback path for when no anchor row is found,
rather than inventing new positioning behavior. Verified end-to-end in real headless Chrome with the
AI endpoint mocked via Playwright: keyword-tier auto-apply with no AI key configured making zero
network calls; Undo reverting it; a multi-select batch correctly mixing a free-tier hit with an
AI-resolved unmatched label in the same call; the single-node picker opening with 4 AI-suggested
candidates and applying whichever one was clicked; the same picker opening from the right-click
"Suggest icon" entry and Escape dismissing it with no change; "Suggest icons for all nodes" running
cleanly across the whole document; the toolbar button staying enabled across a zero/one/multi
selection change (unlike Expand/Tags' own exactly-one requirement) — zero console/page errors
throughout.

**Slice 8** (this PR): Summarise selection. New `state/aiSummarise.ts` direct-ports legacy's real
`summariseSelectionWithAi`: the current selection's TOP-LEVEL roots (via the already-ported
`selectionRootIndexes()`, not every individually-selected node) are sent to the AI as a bulleted
list, and the AI's one-line label becomes a new parent node. A new `outlineStore.ts` action,
`applySummaryParent`, does the actual insert: the new parent lands immediately above the first
(lowest-index) selected root, at that root's own original depth/parentId, and every selected
root's WHOLE SUBTREE (not just the root node itself) is indented one level underneath it. The
in-flight-edit guard here is deliberately all-or-nothing, matching legacy's own real behavior
exactly: if ANY selected root was deleted while the AI request was in flight, the whole operation
aborts with no state change, rather than the per-entry-skip guard `applySuggestedIcons`/Rewrite's
batch path use — a "summary of a different set of nodes than what was actually sent to the AI"
wouldn't be a meaningful result. Toolbar-only trigger ("✦ Summarise" button, enabled only with 2+
nodes selected, matching legacy's own real `qb-ai-summarise` disabled logic) — legacy's own
context-menu AI group never includes this capability either, same as Expand/Tags from the
previous slice. NOT built: legacy's unrelated same-named "Summarise subtree into note" note-panel
capability (appends a prose summary to a node's Note field) — a genuinely different feature that
only shares a name; `web/`'s note panel has no AI actions at all yet. Verified end-to-end in real
headless Chrome with the AI endpoint mocked via Playwright: the toolbar button correctly disabled
with a single selection and enabled once 2+ nodes are selected; a no-key-configured failure
surfacing a clear alert; the new parent correctly inserted above both selected nodes in document
order; Undo correctly reverting the whole insert — zero console/page errors throughout.

**Slice 9** (this PR, final §6.9 slice): provider fallback chain UI + usage tracking. New
`state/aiUsage.ts` is a direct port of legacy's real per-provider usage counters (same
`sakura_ai_usage_v1` storage key as legacy — AI settings are literal shared state between the two
apps, matching `aiProviders.ts`/`vault.ts`'s own established precedent), and new
`state/aiFallback.ts` ports the fallback-chain prefs/resolution logic (`sakura_ai_fallback_v1`,
same precedent), deliberately store-agnostic (key/model lookups are injected rather than imported
directly, since `aiSettingsStore.ts` already imports `aiCall.ts` and importing back would complete
a cycle). `aiCall.ts` gained the real `callAiByShapeWithFallback`: on a fallbackable error
(rate-limit or a generic server error, never a plain 401) it tries each enabled, key-and-model-
resolved fallback candidate in order, recording usage for every attempt. The one integration point
every earlier capability slice already funnels through, `aiCapabilities.ts`'s `callProvider`, is
the single place that needed to change to make Rewrite/Generate Outline/Restructure Text/Expand
node/Suggest tags/Suggest icon/Summarise selection all fallback-aware — each capability's own
`resolveCallContext()` gained one line resolving the chain via a new `aiSettingsStore.ts` method,
`getEffectiveFallbackChain`. New `components/AiFallbackSettings.tsx` is a direct port of legacy's
real drag-to-reorder, per-row-enable-checkbox list (including its own real splice-based reorder
quirk: dragging an entry forward lands it immediately AFTER, not before, the drop target — ported
faithfully rather than "fixed"), plus the "no eligible fallback provider" warning banner and the
locked-vault variant of that same warning; `AiProviderSettings.tsx` gained a per-provider today's-
usage summary line. Deliberately NOT built: legacy's real fallback-success toast (`web/` has no
generic toast system yet — the underlying reliability behavior is fully functional regardless,
just silent on a successful fallback rather than announcing which provider actually served the
request). Verified end-to-end in real headless Chrome with the primary provider's endpoint mocked
to return 429 and the fallback provider's endpoint mocked to succeed: the fallback list correctly
rendering all 7 built-in providers with the primary row shown disabled; the empty-state warning
appearing and clearing correctly as a fallback candidate gains a saved key; a real AI capability
(Expand node) succeeding via the fallback provider despite the primary failing; usage counters
correctly showing 1 failed request for the primary and 1 successful request for the fallback
afterward — zero unexpected console/page errors (one expected browser-logged network entry for the
deliberately-mocked 429 response is not an application error).

§6.9 (AI Features) is now complete — every item named in its original scope has landed:
provider configuration, Secure Storage, manual Rewrite, auto-rewrite on commit, Generate
Outline, Restructure Text, Expand node, Suggest tags, Suggest icon, Summarise selection, provider
fallback, and usage tracking.

## Quick Assist & Quick Insert

⚠️ §6.10 (docs/phase6-full-parity-plan.md) started this session. **Slice 1** (this PR): Quick
Insert completion. The Ctrl/Cmd+Space character-insert popup itself was already real, working
mouse-driven UI in `OutlineTree.tsx` since an earlier Phase 6.2 slice (a fact the plan doc's own
§6.10 section had gone stale on, still describing it as "entirely unbuilt") — this slice closed
the real gaps found on inspection: no keyboard navigation at all (arrow keys did nothing, Enter
fell through to the normal "commit node + create sibling" behavior instead of inserting the
highlighted item, and the popup's own Escape handler could never actually fire since focus never
moved into it), the menu always rendered as a full label list even though legacy's own real
default is a compact icon-only row, and there was no Settings surface for any of it (master
on/off, icon-only toggle, or which of the 7 actions are enabled) at all. `outlinePrefsStore.ts`
gained `quickInsertEnabled`/`quickInsertIconOnly`/`quickInsertActions` (the last already the
correctly-ordered, filtered subsequence of `QUICK_INSERT_ACTION_ORDER` to render — no separate
filtering step needed at render time). `OutlineTree.tsx`'s `handleInputKeyDown` gained a real
port of legacy's own `onEditorKeyDown`'s `if(_nqaState){...}` block: ArrowDown/Up cycle the active
item (wrapping), swapping to Left/Right in icon-row mode (matching legacy's own real `horizNav`
layout swap); Enter/Tab commits the active item; the same Ctrl/Cmd+Space shortcut that opened it
closes it without reopening; any other key closes the popup and falls through to the rest of the
handler / the browser's own default behavior, matching legacy's real "resuming normal typing
dismisses it." New `components/QuickInsertSettings.tsx` provides the master toggle, icon-only
toggle, and 7 per-action checkboxes. Verified end-to-end in real headless Chrome: the popup
opening on Ctrl+Space with the real icon-only default; arrow-key nav plus Enter inserting the
correct highlighted item; Escape closing with no change; typing a regular character closing the
popup and landing that character in the input; toggling icon-only off in Settings switching to
the full label list, with Tab (not just Enter) also committing there; disabling one action in
Settings removing just that one from the popup while the others stay; disabling Quick Insert
entirely making Ctrl+Space do nothing — zero console/page errors throughout.

**Slice 2**: Settings-panel category rail. Direct port of legacy's real `#settings-rail` /
`applySettingsCategory` — a left-hand list of category buttons where clicking one shows only that
category's sections, done via CSS `display:''`/`'none'` toggling rather than conditional
mount/unmount (matching legacy's own real mechanism exactly, and critically preserving each
section's own local component state across a category switch). `SettingsPanel.tsx` gained a
4-category rail (Appearance/Editing/AI/Data & Backup) covering the 4-of-legacy's-real-12
categories that have actual content in `web/` today — Export formatting + Layout under
Appearance, `QuickInsertSettings` under Editing, `AiProviderSettings` + `AiFallbackSettings` +
`AutoRewriteSettings` under AI, `SecureStorageSettings` under Data & Backup. Deliberately not
built: legacy's own cross-category settings-text search box (`#settings-search`), a separately-
scoped follow-up. Verified end-to-end in real headless Chrome: all 4 tabs render and switch
correctly, each showing only its own sections; a value typed into one section's field survives
switching to another tab and back, confirming sections stay mounted rather than remounting;
reopening Settings resets to the default Appearance tab — zero console/page errors throughout.

**Slice 3**: Quick Assist UI shell + audited command subset. New `state/quickAssist.ts` directly
ports legacy's real `QA_COMMANDS`/`QA_ACTIONS` plus their parse/match functions
(`qaPhraseMatch`/`qaBestPhrase`/`qaParse`/`qaSuggestForBareVerb`/`qaParseActionsList`/
`qaSuggestActionsForBareVerb`) — but only the ids with a real, working `web/` equivalent today,
per an explicit per-id audit: 11 of legacy's 39 `QA_COMMANDS` ids (sidebar, dark/light mode,
auto-rewrite, tree lines, compact rows, always-expand-inline, outline numbering, Quick Insert's
icon-only-row and master toggle, plus Quick Assist's own new master toggle) and 9 of legacy's 11
`QA_ACTIONS` ids (new document, duplicate node, all 7 AI capabilities). New
`components/QuickAssistBar.tsx` is the command box: a toolbar button + Ctrl/Cmd+K both open it,
typing filters to matching commands (capped at 6) and actions (capped at 4, disabled-with-reason
rather than hidden when a required selection is missing), Arrow keys cycle the navigable
(non-disabled) rows with wraparound, Enter executes, Escape closes. A new small Undo-toast
(`web/` had no generic toast-with-undo affordance anywhere before this) shows the result, with
one deliberate deviation from legacy: an action failure shows its own real error message (e.g.
"No AI provider key configured…") rather than legacy's generic "cancelled" text, matching how
every other AI entry point in `web/` already surfaces real errors. New
`components/QuickAssistSettings.tsx` adds the master enable toggle under Settings → Editing.
Verified end-to-end in real headless Chrome: Ctrl/Cmd+K opens and focuses the box; hint phrases
show on an empty query; typing a phrase filters correctly; Enter executes and shows the right
toast with a working Undo button; Escape closes with no change; running an action with a node
selected shows a "Done:" toast; an unmatched query shows "No matching command"; the Settings
toggle hides the button and makes Ctrl/Cmd+K inert when off — zero console/page errors throughout.

**Slice 4a**: Quick Assist search integration, first sub-slice. New `state/quickAssistSearch.ts`
directly ports legacy's real `collectSearchGroups` and its per-category collectors, scoped to the
6 of legacy's real 18 search categories with both a real legacy collector and a real, already-
existing `web/` data source: Documents, In documents (node text), Notes, Code, Tags, Folders. A
significant finding, not just a scoping choice: legacy's own real `collectSearchGroups` also
lists To-Dos/Meetings/Journal/Library, each guarded by
`typeof collectXMatches==='function'?collectXMatches(q):[]` — but none of those four collector
functions are ever actually defined anywhere in legacy/index.html or hub.html (confirmed by grep
across both files), so legacy's own real behavior for those four is an unconditional empty array,
always. Porting real Hub search would have invented behavior legacy itself never had, not
completed a gap, so they're excluded on principle. `quickAssist.ts`'s `buildQaEntries` now
appends search-hit rows below command/action matches, draining a single shared budget of 8 across
every category combined, matching legacy's own real budget drain in `qaRender` exactly.
`QuickAssistBar.tsx` renders a group header per category and navigates on click (switch document
if needed, select the target node, open the note panel on the right tab for Notes/Code, or reveal
a folder in the sidebar by expanding every closed ancestor). Deliberately simplified vs. legacy:
plain-text snippets (no HTML highlighting), no trash-document scanning (`web/` has no trash
concept yet), no fuzzy-match fallback, no category-prefix scoping or chip-mode picker — all
deferred alongside the remaining search categories. New "Search results" sub-toggle in
`components/QuickAssistSettings.tsx` (`outlinePrefsStore.ts` gained `quickAssistSearchEnabled`),
separate from Quick Assist's own master toggle. Verified end-to-end in real headless Chrome:
Documents/In documents groups render for the seed document's own title/node text; adding a tag,
note, and folder through the real UI and searching for each surfaces the right group, and
clicking a Notes hit opens the note panel on the correct node; disabling the search-results
toggle removes every content-hit row, leaving the "No matching command or content" empty state —
zero console/page errors throughout.

Still unbuilt: Pad/Q&A/Diagrams/Remarks search (real legacy collectors, but `padStore.ts` isn't
persisted per-document yet — only the currently-open document's Pad content is searchable);
Templates (no live UI at all); Settings/Features/Help search (no searchable index, and no
underlying system for Features at all); category-prefix scoping, the chip-mode category picker,
and fuzzy matching. See phase6-full-parity-plan.md's §6.10 section for the planned slice sequence.

## Preview, Presenter Mode & Export

| Feature | Status | Note |
|---|---|---|
| Preview (TOC, scroll-spy, progress bar) | ⚠️ | Real TOC (section/heading entries), scroll-spy, a scroll progress bar (§6.6, #194), and a real decision-log card render under an anchored node (§6.7) all built; no Decision Log TOC entries, no TOC collapse/resize, no word-count/author/updated-at meta header |
| Presenter Mode | ⚠️ | See Overview table above |
| Word export | ⚠️ | Real .docx via the `docx` library (Phase 3); heading styles, a real TOC field, a branding footer, note-image embedding, Notepad/Q&A sections (§6.6), and decision-log cards (§6.7, bordered/shaded via `docx`'s own real per-side border/shading paragraph options) now built; no rich formatting, tables |
| PDF export | ⚠️ | Browser print-to-PDF (Phase 3); cover page, per-page branding, page margins (20mm), a date/page-count footer, per-node note/code-block rendering (§6.6, real CSS `@page` margin-box rules), and decision-log cards (§6.7) now built; still not rendered from a real Preview-equivalent (a separate parallel HTML-string renderer, matching this project's own established pattern) |
| PowerPoint export | ⚠️ | Real .pptx via `pptxgenjs` (Phase 3), same slide breakdown as Presenter Mode; Notepad slide, Q&A slide, closing slide, per-slide branding, real overflow "(cont'd)" pagination (canvas-measured wrapped-line height, covering per-node slides AND Notepad/Q&A sections), per-node note-image embedding (aspect-ratio-scaled image row, legacy's own `pptxLayoutImageRow` ported, §6.6), and decision-log cards (§6.7, packed as one more item in the same per-node pagination loop so an oversized card can overflow onto a "(cont'd)" slide; non-image slides only) now built; no rich-list field parsing, no auto-scale-to-fit (matches the Word/PDF cards' own simplifications) |
| Branding | ✅ | Built (§6.6): wordmark in the Word page footer, PowerPoint slide corners, PDF cover page + every printed page (CSS `@page{@bottom-right{...}}`), and the live Presenter Mode bar — always on, no Settings toggle/custom text yet |
| Accent-color-in-exports toggle | ❌ | Not applicable yet — no accent color system exists |
| Markdown / OPML export | ✅ | Phase 3, wraps already-ported (Phase 1) serializeMarkdown/serializeOpmlCore exactly |
| Plain text (.txt) / clipboard export | ✅ | §6.6, wraps already-ported (Phase 1) serializeTreeTextCore/serializeClipboardHtmlCore exactly; clipboard writes both text/plain and text/html via ClipboardItem, execCommand fallback |
| Excel (Decision Log .xlsx) export | ✅ | Built (§6.7): direct port of legacy's real `exportDecisionLogXlsx` via `xlsx` (SheetJS, pinned to the same 0.18.5 version legacy loads), one row per decision, 9 columns matching legacy's own real schema (timestamp, author, linked node text, 5 structured fields, status). Legacy's own comment claims community-edition cell styling (bold header, wrapped body cells) works; verified in a real Node script that it does not (style *writing* is Pro-only in SheetJS CE) -- column widths (a plain worksheet property) are set, the no-op `.s` style assignments are not |
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
| Layout controls (tree lines, depth guides, row style, compact rows, text size, indent width, limit reading width) | ✅ | Compact rows, text size, limit reading width, row style, and depth guide lines are all real, persisted, adjustable prefs. Both live-tree indentation modes now built too: default CSS-padding (with `.node-vguide` depth guides) and `hideTreeLines=false`'s real monospace ASCII-connector prefix (`buildPrefix`, indent width now live-affecting, not export-only), including its real dot/arrow fold-control split matching legacy exactly. Verified end-to-end in real headless Chrome across both modes |
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
| Email/password sign-in | ✅ | Built §6.8: direct port of legacy's real `wireEmailAuthForm` (`AuthPanel.tsx`'s "Or use email" toggle) -- sign-in/create-account mode switch, "Forgot password?" via `sendPasswordResetEmail`, and legacy's real per-error-code message table (`state/authErrors.ts`). Safe regardless of whether the Email/Password provider is actually enabled in the production Firebase project (a project-level setting outside this app's control, same as legacy) -- a disabled provider surfaces a real, honest message rather than failing silently |
| Document sync | ⚠️ | Phase 4 — bidirectional, real production Firestore collection, built to preserve legacy-only per-node fields on round-trip. Debounced autosave landed §6.8 (direct port of legacy's real `queueSync`/`flushSyncQueue`, 1500ms debounce, an `isApplyingRemoteUpdate` guard so a realtime pull never queues its own echo push) — replaced the old manual "Push to cloud" button, matching legacy's own primary sync path (which has never had a manual button either). Still: no folders/templates/settings sync, single-document only (no multi-doc concept in web/ yet) |
| Sharing (Can view/Can edit, Share chip, Shared section, notifications) | ✅ | Built §6.8, the full feature in one PR per an explicit user decision: profile discoverability (`store/profileStore.ts`, `profiles/{uid}`, private by default, a visibility toggle in a new "Account" Settings category), grant/revoke/role-change with notifications (`store/sharingStore.ts`), name-prefix + exact-email search, the share dialog/collaborator list/"Shared with me" list (`DocSyncPanel.tsx` -- a deliberate simplification vs. legacy's own sidebar placement), a `SharedDocBanner` for a non-owned document, and a notification bell (`store/notificationsStore.ts`, wrapping the already-ported-but-previously-unwired `state/notifications.ts`). `docSyncStore.ts` gained `role`/`ownerUid` so the existing load/autosave/realtime machinery serves a shared document too; a viewer's edits are never pushed (client-side deterrent, matching legacy's `isViewerOnCurrentDoc` -- Firestore rules are the real enforcement). Deliberately not built: real-time presence (`state/presence.ts`, unwired, separately-scoped). Verified via 61 new tests across four suites plus real headless-Chrome verification of the signed-out state (the signed-in flow relies on the unit suites -- Firestore's gRPC-Web protocol isn't practically fakeable via `page.route` the way the email-auth REST calls were). One real, unverifiable risk carried over from before this slice: `loadSharedWithMe`'s collection-group query needs a Firestore Console index (`sharedWithUids`, array-contains) this project can't confirm is provisioned in production -- fails safe to an empty list either way |
| Sync health status-bar dot | ⚠️ | A text-based sync-status line landed §6.8 in `DocSyncPanel.tsx` (Syncing…/Synced/error, matching legacy's real `updateSyncStatusUI` text states) — not yet in the persistent top-bar status-dot location legacy uses (`account-toggle-status-dot`), which needs its own real top toolbar/status-bar location in `web/`'s shell first |

## Data & Backup

| Layer | Status | Note |
|---|---|---|
| 0. Account sync | ⚠️ | See above |
| 1. Local safety copy (IndexedDB mirror) | ✅ | Built §6.8: direct port of legacy's real `mirrorToIndexedDb`/`updateSafetyCopyStatus`/`restoreFromIndexedDbMirror`, same real IndexedDB database/store/key names and 1200ms debounce (`store/backupStore.ts`). "Restore…" button under Settings → Data & Backup. Debounce is wired to outline edits only (the highest-value, highest-frequency edit surface — `web/`'s multi-store architecture has no single "anything changed" event the way legacy's one script does), and doesn't yet snapshot a `preRestoreSnapshot` (needs "Undo last restore" itself to be worth writing) |
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
