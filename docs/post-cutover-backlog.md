# Post-Cutover Backlog

## Note: moot as of 2026-08-31 — the `web/` migration is discontinued

There is no longer a planned cutover for these items to follow — see
`docs/framework-migration-plan.md`'s top section. Kept for reference only, not an active backlog.

Every item below is a real, confirmed gap between `web/` and `legacy/` as of the cutover decision
— not a guess, and not stale (each was directly re-verified against the current code as part of
the same pass that corrected `docs/history/phase5-parity-checklist.md`'s stale rows). None of
them block cutover: none risks data loss, a security regression, or breaks a core editing/sync
workflow. They're deliberately deferred to **after** `web/` goes live, tracked here so they don't
get silently forgotten once `docs/phase6-full-parity-plan.md` itself is done.

This is the actionable list. For the full reasoning behind each item (why it's scoped this way,
which PR touched it, what legacy's own real behavior is), see the detailed section in
`docs/history/phase5-parity-checklist.md` that each bullet below points to — this doc doesn't
repeat that narrative.

Adding to this list later is normal; anything found post-cutover that isn't a bug belongs here,
not as a surprise re-opening of Phase 6.

## Core Editing
- Highlight/color per node — `outlineStore.ts` reserves the fields, no UI sets them. *(Overview table)*
- "Sort children" as a right-click context-menu entry (toolbar-only today). *(Core Editing table)*
- Heading-level keyboard shortcut (toolbar dropdown only — bold/italic/underline/strike already have real key bindings). *(Keyboard Shortcuts)*
- F2 edit, Alt+↑/↓ move, collapse/expand-all, hide-tree-lines toggle, Focus-mode shortcut, save/new-doc/copy/select-all keyboard shortcuts. *(Keyboard Shortcuts)*

## Documents & Tabs
- Templates (folders and the file explorer are built; templates never got a system at all). *(Overview table, Documents & Tabs section)*

## Panels
- Note panel: AI (Rewrite/summarise).
- Code block: resizable/floating window.
- Pad — Notepad: rich text toolbar, Quote button.
- Pad — Q&A: AI-assisted answering, bulk actions, PDF export, section headers.
- Pad — Diagrams: node-linking, status, thumbnails, Whiteboard, multi-page badge.
- Pad — Mind Map: node-linking, Scratchpad, Presenter-mode integration.
- Pad — Files: node-linking.
- Pad — Remarks: export inclusion.

## Hub
- Meeting Notes / To-Dos: PDF export, Version History, Share, cross-document node links.
- Journal: AI rewrite, PDF export, Version History, search.
- Library: AI rewrite, images, Version History, PDF export, Quick Assist/Global Search visibility.
- Recap: AI summarize; outline-node/document-level activity grouping (blocked on `OutlineNode` having no per-node `createdAt`/`modifiedAt`/`completedAt` yet — a data-model change); Decision Log/Diagrams/Q&A/Mind Map activity (same blocker).
- Mobile Hub: sign-in gate, account menu/search bar/theme toggle from within the mobile view.

## Quick Assist & Global Search
§6.10 is closed as complete within its own real scope; these remaining search categories are each blocked on a different subsystem, not on Quick Assist itself:
- Pad/Q&A/Diagrams/Remarks search — blocked on `padStore.ts` having no per-document persistence at all yet.
- Templates search — blocked on templates not existing (see Documents & Tabs above).
- Settings/Features search — no searchable settings-label index or feature-flags system exists.
- Help search — no help/cheatsheet/shortcuts-registry content exists to index.
- Fuzzy matching / trash-document scanning — no trash concept exists; fuzzy matching is low value at this corpus size.

## Preview, Presenter Mode & Export
- Preview: Decision Log TOC entries, TOC collapse/resize, word-count/author/updated-at meta header.
- Presenter Mode: Whiteboard mirroring in Audience View (blocked on Diagrams gaining a real `isWhiteboard` concept).
- Word export: rich formatting, tables.
- PDF export: not rendered from a real Preview-equivalent (a separate parallel HTML-string renderer).
- PowerPoint export: rich-list field parsing, auto-scale-to-fit.
- Accent-color-in-exports toggle — export code uses fixed colors throughout; no toggle exists.
- Import: AI-restructure fallback for a flat Word doc, tree-connector-notation detection, pasted-text import.
- Sakura Document (.sakura.json): Pad content (Notepad/Q&A/Diagrams/Mind Maps/Decision Log/Remarks/Attachments) not included — `padStore.ts` isn't document-scoped at all yet, a real architectural gap.

## Account, Sync & Sharing
- Document sync: no folders/templates/settings sync (folders exist in the file explorer but aren't part of the sync payload yet).
- Real-time presence (`state/presence.ts` exists but is unwired).

## Data & Backup
- Backup-history rotation (5 timestamped snapshots).
- "Haven't backed up in N days" reminder nag.

## Feedback & Crash Reports
- Entirely not built. (Some access-control scaffolding exists in `state/admin.ts` for a future feedback inbox, but nothing is wired into the UI — no submission form, no inbox.)

## Settings Reference
- Legacy's real Settings panel has a multi-category rail with dozens of settings; `web/`'s Settings panel only covers the ones with a real existing consumer today. Every other README-referenced setting is either not applicable yet (its feature doesn't exist) or hardcoded with no toggle.

## Browser Support
- Not separately verified against legacy's own documented browser support matrix — `web/` inherits whatever Vite/React's baseline support is.
