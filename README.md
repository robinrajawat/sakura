# Sakura — Outliner & Tree Editor

Sakura is a single-file, browser-based outliner for structuring notes, plans, and documents as a nested tree. It runs entirely client-side — there's no server and no account — and stores its data locally in the browser.

## Contents

- [Overview](#overview)
- [Core Editing](#core-editing)
- [Documents & Tabs](#documents--tabs)
- [Data & Backup](#data--backup)
- [Settings Reference](#settings-reference)
- [Keyboard Shortcuts](#keyboard-shortcuts)
- [Browser Support](#browser-support)
- [Known Limitations](#known-limitations)

## Overview

Sakura is a single `.html` file. Open it in a browser and it runs — no install, no build step, no network dependency for core functionality. All documents, folders, templates, and settings are stored in the browser's local storage, scoped to that exact file.

Key capabilities:

- Nested outline editing with indent/outdent, drag-and-drop reordering and nesting, duplication, and multi-select
- Bold, italic, underline, and strike formatting per node
- Lightweight semantic styling via plain-text conventions: `[Section]`, `(note)`, `!alert`, and `` `code` ``
- Fold/unfold subtrees, with a "+N hidden" badge that's clickable to expand
- In-document search and a global header search across settings, help, documents, and templates
- Folders and templates in the sidebar, with drag-and-drop filing and nesting
- Export to Markdown, plain text, DOCX, PNG (tree as image), or clipboard; print support
- Multiple documents open as independent tabs
- Two-tier automatic backup (live file backup + a local safety copy), in addition to manual export/import

## Core Editing

- **Enter** — new sibling node below; **Shift+Enter** — new child node
- **Tab / Shift+Tab** — indent / outdent the selected node
- **Drag a row** — drop above/below to reorder, or onto the middle of another row to nest it as a child
- **Right-click a node with children** — sort children A→Z, Z→A, or by depth
- Click the fold arrow to collapse or expand a subtree; when collapsed, the "+N" badge is itself clickable to expand
- Use `[Text]`, `(Text)`, `!Text`, and `` `Text` `` inline for section labels, muted notes, alerts, and inline code

## Documents & Tabs

Sakura supports multiple open documents at once, shown as tabs above the toolbar — similar to browser tabs.

- Clicking a document in the sidebar, or the **+** at the end of the tab strip, opens it as a tab
- **Each tab keeps its own undo/redo history, scroll position, and selection independently.** Switching tabs does not reset undo history the way switching documents used to
- **Double-click a tab** to rename it
- The **X icon** on a tab closes the tab only — the document itself is not deleted and remains in the sidebar
- The **dropdown arrow** at the right of the tab strip opens a searchable list of all open tabs (arrow keys + Enter to jump, or click a result) — useful once you have more tabs open than fit on screen
- **Settings → General → "Reopen tabs on launch"** controls whether your previously open tabs come back automatically, or whether each session starts with just one

## Data & Backup

Everything is stored locally in the browser, scoped to this exact file. Opening a different copy or a newer version of the file starts with empty storage — this is a browser limitation (local storage is partitioned per file URL), not a bug.

Sakura offers three layers of protection, from lightest to most durable:

1. **Local safety copy** (Settings → Data) — a copy of your data is automatically mirrored into a separate browser storage area (IndexedDB) on every save. If the primary storage is ever cleared, "Restore" can recover from this copy. This is still inside the same browser, not an external backup.
2. **Auto-backup to file** (Settings → Data) — connects a real file on disk and writes a live backup to it as you work, using the File System Access API. Available in Chrome and Edge only. If the browser's file permission lapses (it can, by design, after a reload), the control switches to "Reconnect."
3. **Export / Import** (Settings → Data) — saves everything (documents, folders, templates) to a single downloadable JSON file, and restores from one. This is the only option that produces a file outside the browser, and the only reliable way to move data between different files, browsers, or computers.

**Recommended workflow when moving to a new copy of this file:** Export from the old copy, open the new copy, then Import immediately.

## Settings Reference

Selected settings worth knowing about (Settings panel, organized by section):

| Setting | Section | Default | Notes |
|---|---|---|---|
| Search bar | Header | **Off** | Global header search; Ctrl/Cmd+K toggles it regardless of this setting |
| Reopen tabs on launch | General | On | Turn off to always start with a single tab |
| Start each session blank | General | Off | New blank document every launch, instead of restoring the last state |
| Confirm before delete | General | On | Adds a confirmation dialog before deleting nodes or documents |
| Expanded toolbar | Toolbar | Off | Shows "Extras" actions as buttons instead of a dropdown menu |
| Auto-backup to file | Data | Off (not connected) | Chrome/Edge only; see Data & Backup above |
| Local safety copy | Data | Always on | Automatic; "Restore" button is the only manual action |
| Skip folded nodes in exports | Data/Export | On | Collapsed subtrees are omitted from exports unless expanded first |

## Keyboard Shortcuts

| Action | Shortcut |
|---|---|
| Edit node | Enter / F2 |
| New sibling below | Enter |
| New child | Shift+Enter |
| Indent / Outdent | Tab / Shift+Tab |
| Move node up/down | Alt+↑ / Alt+↓ |
| Bold / Italic / Underline | Ctrl/Cmd+B / I / U |
| Strike | Ctrl/Cmd+Shift+S |
| Collapse / expand selected | ← / → |
| Collapse all / Expand all | Ctrl/Cmd+Shift+[ / Ctrl/Cmd+Shift+] |
| Search this document | Ctrl/Cmd+F |
| Global header search | Ctrl/Cmd+K |
| Save now | Ctrl/Cmd+S |
| New document | Ctrl/Cmd+Alt+N |
| Copy selection | Ctrl/Cmd+Shift+C |
| Select all | Ctrl/Cmd+A |
| Undo / Redo | Ctrl/Cmd+Z / Ctrl/Cmd+Shift+Z |

If a shortcut is intercepted by the OS or browser before it reaches the page, the equivalent toolbar button or menu item always works as a fallback.

## Browser Support

Sakura works in any modern browser. One feature is the exception:

- **Auto-backup to file** requires the File System Access API, supported in Chrome and Edge. In Safari and Firefox, the control is disabled with an explanation, and the **Local safety copy** and manual **Export** remain available as alternatives.

## Known Limitations

- Storage is scoped per file URL. A renamed, moved, or re-downloaded copy of this file starts with empty storage — export/import is the way to carry data across.
- The local safety copy and auto-backup both protect against accidental data loss within normal use, but neither replaces taking an occasional Export as a true external backup.
- There is no real-time multi-device sync; this is a single-browser, local-first tool.
