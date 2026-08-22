# Phase 5 — Parity Checklist (web/ vs README.md)

An explicit, section-by-section walk of README.md (the source of truth for what "done" means)
against `web/`'s actual current state — not a guess, a checklist. Written at the start of Phase
5 (docs/framework-migration-plan.md), before any preview deployment or cutover work.

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
| `#tags` | ❌ | Not built |
| `[[@mention]]` backlinks | ❌ | Not built |
| Focus mode | ❌ | Not built |
| Note panel | ⚠️ | Plain text only (Phase 3) — no rich text, images, tables, AI, backlinks section |
| Code block panel | ⚠️ | Lang + code only (Phase 3) — no resizable window, matches legacy's lang list |
| Decision Log | ⚠️ | Pad's Decision Log tab exists (Phase 3) as a flat list — not node-linked, no accent dot, no card rendering in exports, no Excel export |
| Pad (Notepad/Q&A/Diagrams/Mind Map/Files/Remarks) | ⚠️ | 5 of 7 tabs functional at a basic level (Phase 3); Diagrams and Mind Map are honest placeholders |
| Hub (To-Dos, Meeting Notes, Journal, Library, Recap) | ⚠️ | All 5 exist (Phase 4) at basic CRUD/derived-summary level — see Hub section below |
| Diagrams embedding in exports | ❌ | No diagram editor exists at all |
| AI features | ❌ | None built — no provider config, no Rewrite/outline-gen/restructure/etc. |
| Quick Assist / global search | ❌ | Not built |
| Folders/templates/file explorer | ❌ | Not built — web/ has no document-management shell yet, only a single in-memory outline |
| Presenter Mode | ⚠️ | Basic slide grouping + Prev/Next/arrow-keys (Phase 3) — no laser pointer, blackout, grid, timer, floating notes, Whiteboard, closing slide |
| Export: Word/PDF/PowerPoint/Markdown/OPML | ⚠️ | All 5 exist (Phase 3) at a genuinely functional but heavily scoped-down level — see Export section below. No plain text, Excel, or clipboard export; no Sakura Document (.sakura.json) format |
| Multiple document tabs | ❌ | web/ edits a single in-memory document; no tab strip, no document switching |
| Deep theming | ⚠️ | Light/Dark toggle only (Phase 3) — no System/Schedule auto-theme, accent colors, Chrome backgrounds, node-text color presets |
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

❌ Entirely not built — web/ has no document-management shell (no file explorer, no tabs, no
per-document undo/redo history, no rename). This is the single largest structural gap: every
other section below implicitly assumes a document container that doesn't exist yet in `web/`.

## Panels

| Feature | Status | Note |
|---|---|---|
| Note (rich text, images, tables, AI, backlinks) | ⚠️ | Plain text only |
| Code Block (lang picker, resizable window) | ⚠️ | Lang picker + textarea exist; not resizable/floating |
| Pad — Notepad | ⚠️ | Plain textarea (Phase 3); no rich text toolbar, no Quote button |
| Pad — Q&A | ⚠️ | Flat list with question/answer (Phase 3); no AI-assisted answering, bulk actions, search, PDF export, node-linking |
| Pad — Decision Log | ⚠️ | Flat list (Phase 3); no node-linking, structured fields (Context/Rationale/etc.), card rendering, Excel export |
| Pad — Diagrams | ❌ | Honest placeholder tab (Phase 3) — no draw.io integration, no Generate |
| Pad — Mind Map | ❌ | Honest placeholder tab (Phase 3) |
| Pad — Files | ⚠️ | Name-only record (Phase 3); no real upload/storage, no node-linking, no download |
| Pad — Remarks | ⚠️ | Flat list with person/text (Phase 3); no date field, no node-linking, no export inclusion |

## Hub

| Feature | Status | Note |
|---|---|---|
| Meeting Notes | ⚠️ | Title/date/attendees/notes CRUD (Phase 4); no templates, action items, Promote-to-To-Do, PDF export, Version History, Share/Import |
| To-Dos | ⚠️ | Create/toggle/delete only (Phase 4, wraps real ported hubTodos.ts); no priority/status/due-dates/subtasks/repeat/filtering/sorting/bulk-actions/AI/tags/PDF export/Version History/Share |
| Journal | ⚠️ | Create/delete + mood (Phase 4, wraps real ported hubJournal.ts); no editing, tags, rich text, AI rewrite, calendar popover, PDF export, Version History, search |
| Library | ⚠️ | Title/URL/description CRUD (Phase 4); no favorites, tag filtering, rich text, images, AI, Version History |
| Recap | ⚠️ | Basic counts + recent-N lists derived from the other 4 stores (Phase 4); no Today/This Week/Last Week grouping, no click-to-jump, no AI summarize, no document-level activity (web/ has no multi-document concept yet) |
| Mobile Hub (hub.html equivalent) | ❌ | Not built — web/ has no responsive breakpoint redirect or mobile-specific UI |

## Tags, Focus & Backlinks

❌ Entirely not built.

## AI Features

❌ Entirely not built — no provider configuration UI, no API key storage, none of Rewrite/
auto-rewrite/Generate outline/Restructure text/Expand node/Suggest tags/Suggest icon/Summarise
selection/provider fallback/usage tracking.

## Quick Assist & Quick Insert

❌ Entirely not built.

## Preview, Presenter Mode & Export

| Feature | Status | Note |
|---|---|---|
| Preview (TOC, scroll-spy, progress bar) | ⚠️ | Basic read-only render (Phase 3); no TOC, scroll-spy, or progress bar |
| Presenter Mode | ⚠️ | See Overview table above |
| Word export | ⚠️ | Real .docx via the `docx` library (Phase 3); no heading styles, TOC, Decision Log cards, rich formatting, image embedding |
| PDF export | ⚠️ | Browser print-to-PDF (Phase 3), not rendered from a Preview-equivalent with fold state/notes/decision cards; no cover page, margins config, footer |
| PowerPoint export | ⚠️ | Real .pptx via `pptxgenjs` (Phase 3), same slide breakdown as Presenter Mode; no dedicated Q&A/Notepad slides, no overflow "(cont'd)" slides, no images |
| Branding | ❌ | Not built |
| Accent-color-in-exports toggle | ❌ | Not applicable yet — no accent color system exists |
| Markdown / OPML export | ✅ | Phase 3, wraps already-ported (Phase 1) serializeMarkdown/serializeOpmlCore exactly |
| Plain text / Excel / clipboard export | ❌ | Not built |
| Import (Word/OPML/pasted text) | ❌ | Not built |
| Sakura Document (.sakura.json) | ❌ | Not built |

## Theming & Appearance

| Feature | Status | Note |
|---|---|---|
| Light/Dark theme | ✅ | Phase 3 |
| Auto theme (System/Schedule) | ❌ | Not built |
| Accent color | ❌ | Not built |
| Chrome background presets | ❌ | Not built |
| Node text color presets | ❌ | Not built |
| Editor's Choice preset | ❌ | Not built |
| Layout controls (tree lines, depth guides, row style, compact rows, text size, indent width, collapse depth) | ❌ | Not built |
| Inline note/remark previews | ❌ | Not built |
| Inline Q&A previews | ❌ | Not built |

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

❌ web/ has no Settings panel at all. Every setting in the README's reference table is
either not applicable yet (the feature it configures doesn't exist) or hardcoded to a
single behavior with no toggle.

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

## What this means for the rest of Phase 5

The gap is large and, per the reasoning at the top of this doc, expected — every slice in
Phases 2–4 was deliberately scoped down and documented as such at the time. This checklist's
job was just to make that accumulated gap visible in one place, not to be surprised by it.

Two honest paths forward from here, worth an explicit decision rather than silently picking one:

1. **Close a meaningful chunk of this gap before any preview deployment** — the biggest
   structural miss is Documents & Tabs (no file explorer, no multi-document concept, no
   folders/templates), which several other sections implicitly depend on (Recap's
   document-grouping, Sharing, multi-doc sync). Building that shell would unblock a lot of
   downstream parity work at once.
2. **Deploy to a preview URL now, with this checklist attached as the honest "here's exactly
   what this build can and can't do yet" note**, and continue closing gaps against a live,
   soakable target rather than only in local dev — matching Stage 1/Stage 2's own "prove it
   before the mechanism changes" discipline from the legacy deployment work.

Either way, actual **cutover** (pointing `www.sakura-notes.com` at this build) remains its own
separate, explicit decision, not something this checklist or a preview deployment authorizes on
its own — same rule Stage 2 established for the legacy deployment mechanism itself.
