# Sakura — Outliner-Centered Personal Productivity Workspace

Sakura is a single-file, browser-based outliner that's grown into a full personal productivity workspace: notes, plans, and documents live as a nested tree at the center, with meetings, tasks, decisions, and Q&A woven directly into it via backlinks and cross-references rather than bolted on as separate disconnected tools. It runs entirely client-side — there's no server and no account — and stores its data locally in the browser. Optional AI features (rewrite, outline generation, and similar) are the one exception: those call out to an AI provider using a key you supply yourself.

## Contents

- [Overview](#overview)
- [Core Editing](#core-editing)
- [Documents & Tabs](#documents--tabs)
- [Panels](#panels)
- [Meeting Notes & To-Dos](#meeting-notes--to-dos)
- [Tags, Focus & Backlinks](#tags-focus--backlinks)
- [AI Features](#ai-features)
- [Quick Assist & Quick Insert](#quick-assist--quick-insert)
- [Preview, Presenter Mode & Export](#preview-presenter-mode--export)
- [Theming & Appearance](#theming--appearance)
- [Installing as an App (PWA)](#installing-as-an-app-pwa)
- [Data & Backup](#data--backup)
- [Settings Reference](#settings-reference)
- [Keyboard Shortcuts](#keyboard-shortcuts)
- [Browser Support](#browser-support)
- [Known Limitations](#known-limitations)

## Overview

Sakura is a single `.html` file. Open it in a browser and it runs — no install, no build step, no network dependency for core functionality. All documents, folders, templates, and settings are stored in the browser's local storage, scoped to that exact file.

Key capabilities:

- Nested outline editing with indent/outdent, drag-and-drop reordering and nesting, duplication, and multi-select
- Bold, italic, underline, strike, highlight, and text color formatting per node
- Heading 1–6 per node, applied independent of tree depth, with its own color gradient and Preview support
- Lightweight semantic styling via plain-text conventions: `[Section]`, `(note)`, `!alert`, and `` `code` ``
- Fold/unfold subtrees, with a "+N hidden" badge that's clickable to expand
- `#tags` on nodes, `[[@mention]]` backlinks between nodes, and a "Focus" mode to zoom into one branch
- Companion panels per node or per document: rich-text Notes, Code blocks, a Decision Log, a whole-document Pad (with Notepad, Q&A, and Diagrams tabs)
- App-level panels shared across your whole workspace, independent of any single document: **Meeting Notes** and **To-Dos** — with action items promotable directly from a meeting into a linked to-do
- Diagrams — link a draw.io diagram (Pad → Diagrams tab) to any node; embeds as a real picture in Word, PowerPoint, and PDF exports
- Optional AI features — rewrite, generate an outline from a topic, restructure pasted text, expand a label into a subtree, suggest tags/icons, summarise a selection, plus dedicated AI actions inside To-Dos and Q&A — using your own API key with any of six built-in providers or a custom one
- Quick Assist: a combined command bar and search box (plain-English toggles like "hide sidebar," plus search across documents, notes, tags, to-dos, meetings, and settings)
- In-document search and a global header search across settings, help, documents, and templates
- Folders and templates in the sidebar (including built-in packs like Meeting Notes, 1:1, Kickoff, Retrospective), with drag-and-drop filing and nesting
- **Presenter Mode** — a fullscreen, slide-by-slide presentation of any document, with a laser pointer, blackout, an all-slides grid, a running timer, a floating notes panel, a persistent Whiteboard (a real draw.io canvas for sketching mid-talk), and an optional closing slide
- Export to **Word (.docx)**, **PDF**, **PowerPoint (.pptx)**, **Markdown**, plain text, **OPML**, Excel (Decision Log), or clipboard; print support; import from Word, OPML, or pasted unstructured text. Word/PDF/PowerPoint exports carry a real table of contents, an optional cover page, and your chosen accent color (independently toggleable for consistent branding when sharing)
- Multiple documents open as independent tabs
- Deep theming: Light/Dark/System/Schedule auto-theme, seven accent colors, five Chrome background presets, and node-text color presets
- Installable as a desktop/mobile app (PWA) in supporting browsers
- Two-tier automatic backup (live file backup + a local safety copy), in addition to manual export/import
- Version History for documents, the To-Dos list, and Meeting Notes — periodic snapshots you can restore from independently of the undo stack

## Core Editing

- **Enter** — new sibling node below; **Shift+Enter** — split the node at the cursor (text after the cursor becomes a new sibling below); **Ctrl/Cmd+Enter** — new child node
- **Tab / Shift+Tab** — indent / outdent the selected node
- **Drag a row** — drop above/below to reorder, or onto the middle of another row to nest it as a child
- **Right-click a node with children** — sort children A→Z, Z→A, or by depth
- Click the fold arrow to collapse or expand a subtree; when collapsed, the "+N" badge is itself clickable to expand
- Use `[Text]`, `(Text)`, `!Text`, and `` `Text` `` inline for section labels, muted notes, alerts, and inline code
- Hover any node (Settings → Editing → "Node hover toolbar") to reveal quick Menu and Zoom-in buttons next to its bullet, without needing to select it first
- `Ctrl/Cmd+Space` opens **Quick Insert** — a small menu for inserting an em dash, en dash, arrow, checkmark, cross mark, middle dot, or date/time without leaving the keyboard. Same menu, same shortcut, in every editable area of the app (nodes, Pad, Notes, Meeting Notes, To-Dos, the title field) — not just while editing a node

## Documents & Tabs

Sakura supports multiple open documents at once, shown as tabs above the toolbar — similar to browser tabs.

- Clicking a document in the sidebar, or the **+** at the end of the tab strip, opens it as a tab
- **Each tab keeps its own undo/redo history, scroll position, and selection independently.** Switching tabs does not reset undo history the way switching documents used to
- **Double-click a tab** to rename it
- The **X icon** on a tab closes the tab only — the document itself is not deleted and remains in the sidebar
- The **dropdown arrow** at the right of the tab strip opens a searchable list of all open tabs (arrow keys + Enter to jump, or click a result) — useful once you have more tabs open than fit on screen
- **Settings → General → "Reopen tabs on launch"** controls whether your previously open tabs come back automatically, or whether each session starts with just one

## Panels

Beyond the outline itself, several floating or docked panels attach richer content to a node or a document. All are individually toggleable in Settings → Features (or that panel's own Settings section), and turning one off only hides it — existing content is preserved and comes back when re-enabled.

- **Note** — every node can hold a rich-text note (bold/italic/underline/strike, bullet/numbered lists, links, tables, pasted images, AI Rewrite/Summarise). Floating and draggable, with a compact popover view and a full-screen mode. Shows a Backlinks section for any node that `@mentions` it, plus created/last-modified timestamps. Open via toolbar, right-click → More → Note, or `Ctrl/Cmd+Shift+N`.
- **Code Block** — every node can hold one plain-text code block (language picker: Plain text, ABAP, SQL, JavaScript, Python, JSON, XML/HTML, Markdown), in the same kind of floating, resizable window as Note. Open via toolbar, right-click → More → Code block, or `Ctrl/Cmd+Shift+K`.
- **Pad** — a whole-document workspace, separate from per-node Notes, with four tabs:
  - **Notepad** — a rich-text scratchpad with the same toolbar Note uses (minus subtree-summarise, since there's no subtree at the document level). File attachments (button, drag-and-drop, or paste — 5 MB cap per file) insert as a downloadable chip, stored inline so they're covered by every existing backup path automatically.
  - **Q&A** — a running list of question/answer pairs for the document, with AI-assisted answering, bulk answer/group actions, search, and its own PDF export. Individual questions can be linked to a specific node — right-click a node → "Add question…" (or `Ctrl/Cmd+K` → "add question"), or the tab's own + button for an unlinked one. Answerable directly from Presenter Mode too, not just the Pad.
  - **Decision Log** — a structured record, linked to a node rather than inserted into it: a timestamped header (with optional author) plus configurable fields for Context, Decision, Rationale, Alternatives, Impact, and Status. Create one from the Decision Log tab's own + button (the currently-selected node gets it automatically if it's free); a small accent-colored dot appears on a node once it has one, click it to jump straight there. Renders as a bordered, status-colored card in Preview/Word/PDF/PowerPoint exports and is separately exportable as its own Excel sheet across a document.
  - **Diagrams** — link a draw.io diagram to any node; it embeds as a real picture in Word, PowerPoint, and PDF exports, and shows inline in Preview. One diagram per document can instead be a persistent, deliberately unlinked **Whiteboard** — same real draw.io editor, opened directly from Presenter Mode's bar or right-click menu for sketching or brainstorming on the fly; pinned to the top of this list, badged rather than flagged as "Unlinked".

  Open the Pad via its floating panel icon or `Ctrl/Cmd+Shift+P`.

## Meeting Notes & To-Dos

Two panels live at the app level rather than inside any single document — one shared instance across your whole workspace, opened from the app bar or status bar rather than per-document.

- **Meeting Notes** (`Ctrl/Cmd+Shift+E`) — an app-level meeting log. Add a blank note or start from a built-in template (Meeting Notes, 1:1, Daily Standup, Weekly Status, Project Kickoff, Retrospective), each pre-filling title/Agenda/Notes and a starter action item where relevant. Each note has a title, date, optional time, attendee chips, rich-text Agenda and Notes fields, action items, and links to specific documents or nodes. An action item's **Promote** button turns it into a real To-Do — the new task's due date comes from the meeting's own date, and a small "from meeting" chip links back to the source note. Export a single note as a PDF; Version History keeps the last 20 snapshots of the whole list. The Share icon exports the whole list as a `.sakura.json` file for another Sakura user to import (their own Import button, next to Share) — adds to their list without touching anything already there; links to specific documents/nodes don't carry over, since those would point at documents the recipient doesn't have.
- **To-Dos** (`Ctrl/Cmd+Shift+U`) — one shared task list across your whole workspace, not tied to any document or node. Supports priority, status, and due dates (with a Today/Tomorrow/Next week quick-pick popover), links, drag-to-reorder, quick-find, and an overdue-count badge. Filter by priority, status, and due date at once (Overdue/Today/Due later/No due date), and sort by priority, due date, or manual order. Select multiple open tasks to bulk-set priority/status/due date or bulk-complete/delete, each with its own Undo. Three optional AI capabilities (Settings → AI → To-Dos AI, each independently toggleable): extract action items from the current document or selection, break a task into subtasks, and generate a status summary of open tasks — all add directly to the list with Undo. Typing `#tag` or `@name`/`@date`/`@status` directly in a task's text renders it as a colored chip with autocomplete. A task can either **repeat** (daily, weekdays, or weekly — completing it advances the due date instead of marking it done for good) or hold **sub-tasks** (a nested checklist with an n/m progress badge; the parent completes automatically once every sub-task is checked) — the two are mutually exclusive on the same task. Export the whole list as a PDF; Version History keeps the last 20 snapshots. Same Share/Import pair as Meeting Notes — exports the whole list as a `.sakura.json` file, imports add to the recipient's list rather than replacing it, and any link to a specific document/node is dropped on import for the same reason.

## Tags, Focus & Backlinks

- **Tags** — select a node and click the tag icon, or right-click → Tags, to open a popover of existing document tags as toggleable chips (type a new name + Enter to add one). Tags render as `#chips` directly on the node row; clicking one filters the whole tree to that tag.
- **Backlinks** — while editing a node, type `@` to reference another node by name from a filtering dropdown. The reference saves as `[[Node name]]`, renders as a clickable link, and shows up in the target node's Note panel under Backlinks. Deleting a referenced node removes its `[[mentions]]` elsewhere automatically.
- **Focus** — right-click a node → Zoom in (or `Ctrl/Cmd+.`, or the toolbar's zoom icon) to show only that node and its descendants, with a breadcrumb trail back to the root. Exit with `Ctrl/Cmd+,` or by clicking the root crumb. Focus state is saved with the document (like fold state) and comes back when you reopen it, including across sessions.

## AI Features

AI features are entirely optional and require your own API key for one of the built-in providers (Gemini, Groq, Claude API, OpenRouter, Cerebras, GitHub Models — all free-tier friendly) or a custom OpenAI-compatible/Gemini-style/Anthropic-style endpoint. Configure this at Settings → AI → Provider.

- **Rewrite** — the ✦ toolbar button rewrites the selected node (or a batch, if multiple are selected, or just a highlighted portion of text). The rewrite prompt itself is fully customizable in Settings, with a one-click reset to the default grammar-and-spelling-only wording.
- **Auto-rewrite on commit** (off by default) — automatically runs Rewrite on a node as soon as you finish typing it (pastes/drops are excluded). Batches multiple nodes into a single request after a configurable idle pause or queue size, rather than firing one request per node, to avoid burning through rate limits. A status-bar chip shows the live queued/countdown/rewriting state and doubles as its own on/off toggle.
- **Generate outline** (`Ctrl/Cmd+Shift+O`) — describe a topic and get an AI-generated nested outline inserted into the current document (or a new blank one).
- **Restructure text** (`Ctrl/Cmd+Shift+R`, or Import ▾) — paste messy or unstructured text (notes, an email, a transcript) and it's organized into a proper outline in a new document, without inventing facts not present in the source.
- **Word import** (Import ▾ → Word) — a `.docx` file's own heading/list structure converts directly to nodes with no AI involved when that structure already exists; only a heading-less wall of text falls back to AI restructuring. Legacy binary `.doc` isn't supported, only `.docx`.
- **Expand node**, **Suggest tags**, **Suggest icon**, and **Summarise selection into parent** — additional one-click AI actions available from the toolbar's AI group or right-click menu, for breaking a dense label into a subtree, tagging a node from its content, picking a fitting emoji prefix, and rolling up a multi-node selection under a new AI-written parent label, respectively.
- **Provider fallback** — an optional toggle that automatically retries with the next configured provider (in your chosen order) if the active one fails for any reason other than a bad key, which always surfaces directly instead of silently falling back.
- **Usage today** — a local, best-effort request counter per provider, shown in Settings; it's a rough gauge only, not fetched from the provider, and can drift slightly from that provider's own reset clock.

## Quick Assist & Quick Insert

- **Quick Assist** (`Ctrl/Cmd+K` from anywhere, or click the search box in the header/status bar) is a combined command bar and search box. Plain-English commands work directly — "hide sidebar," "toggle dark mode," "get rid of pad" — and toggle/search behavior is rule-based (a fixed phrase list), not AI, so it never improvises and needs no API key. Typing a bare word like "show," "hide," "toggle," or "run" lists everything of that kind; a category prefix ("notes: budget," "settings: dark") narrows a search to one area. Below commands, a separate **Run** row type covers one-off actions (new document, duplicate node, insert decision log, apply Editor's Choice preset, and the AI actions above) — always undoable, and never anything destructive. Below that, matching documents, node text, notes, tags, the Pad, and settings/help topics show up as **Go to** results.
- **Quick Insert** (`Ctrl/Cmd+Space` while actively editing text — anywhere: a node, the title field, the Pad, a Note, a Code block, a To-Do, a Meeting Notes field) opens a small character-insert menu — em dash, en dash, arrow, checkmark, cross mark, middle dot, date/time — configurable in Settings → Editing. Same menu, same shortcut, everywhere; it's deliberately just characters, not a second command bar, so it's never in competition with Quick Assist for the same key. Node-specific actions (Note, Tags, Add question, Rewrite, Version history) live on the right-click menu instead.

## Preview, Presenter Mode & Export

- **Preview** — a read-only, formatted render of the current document, reachable from the floating eye-icon button next to zen/Pad/toolbar. Includes a table of contents (headings, section markers, Decision Log entries, and — when present — Notepad and Q&A as their own entries), scroll-spy highlighting, and a progress bar.
- **Presenter Mode** — opens fullscreen straight from Preview: a decorated title slide, then one section per slide, navigated with arrow keys/space/click, each fading in briefly on an actual slide change. A thin progress bar tracks position across the top of the screen, and headings/sub-bullets get a presenting-only size and weight bump for legibility from across a room. A laser pointer, a full all-slides grid (`G`) for jumping around, a blackout toggle (`B`) to pull attention back to you mid-discussion, a running elapsed timer, and a floating Notepad/Q&A panel (`N`/`Q`, with clickable tabs once it's open) that's the same Pad the document already has. A pencil icon (`W`) opens the **Whiteboard** — one persistent, real draw.io canvas per document for sketching or brainstorming without tying it to any slide. Right-clicking (anywhere that isn't a line's own text) opens a menu with all of the above plus Reset zoom and Exit. An optional closing slide — "Thank you" by default, or your own text and subtitle — bookends the opening title slide at the end of the deck. "Presenter slide breaks at" (Settings → Preview) controls which tree depth starts a new slide.
- **Word export** (`.docx`) — real heading styles, a proper Table of Contents (headings and section markers, with page references — press Ctrl/Cmd+A then F9 after opening to load real page numbers, since Word only caches "1" until fields are recalculated), and Decision Log entries as bordered, status-colored cards. Notes carry their actual formatting (bold/italic/underline/strike/links); images marked "Feature as diagram" and Diagrams-tab pictures embed as real, correctly-scaled pictures.
- **PDF export** — renders from the same Preview output, so anything visible in Preview (fold state, notes, code blocks, decision cards, the table of contents) carries through as-is. Optional cover page, configurable page margins, and an optional running footer (export date + page number).
- **PowerPoint export** (`.pptx`) — a genuine, editable slide deck using the same slide breakdown as Presenter Mode: title slide, then one slide per node at that depth with its subtree as nested bullets, plus dedicated Q&A and Notepad slides at the end. A slide whose bullets overflow automatically continues onto a "(cont'd)" slide rather than clipping. Everything — text, bullets, pictures — is a normal native shape, fully editable in PowerPoint, Keynote, or Google Slides.
- **Branding** (Settings → Preview → Presenter Mode → "Branding") adds a small, consistent attribution mark to the bottom-right of every slide/page across the Presenter bar, PDF, Word, and PowerPoint exports — off by default, with your own company/team name as an optional override for the default "SAKURA" wordmark.
- Word, PDF, and PowerPoint exports all use your current accent color by default; **Settings → Export & print → "Use accent color in exports"** turns that off in favor of one fixed color across every format, for consistent branding when the document is going to someone else rather than staying on your own screen.
- Other export formats: Markdown, plain text, OPML, Decision Log as its own Excel sheet, or copy as text/image to the clipboard. Import from Word (heading/list structure converts directly; a heading-less document falls back to AI restructuring), OPML, or pasted unstructured text.
- **Sakura Document** (Export ▾ → Share → Sakura Document, `.sakura.json`) — the one full-fidelity export: everything a document holds, including notes, Decision Logs, Diagrams (real editable draw.io XML, not just the picture), Q&A, and Mind Maps. Every other format is lossy by design (OPML/Markdown/plain text keep structure and text only; Word/PDF/PowerPoint flatten into a document that's no longer editable in Sakura) — this one exists specifically to hand a complete, still-fully-editable document to someone else running Sakura. **Import ▾ → Sakura Document** brings a received file in as a new document; it never touches anything else already in your workspace, unlike the whole-app Export/Import described under Data & Backup below.

## Theming & Appearance

- **Light/Dark theme** with an **Auto theme** mode: Off (manual only), System (follows the OS/browser's dark-mode setting live), or Schedule (switches at hours you set). Manually overriding the theme while in System/Schedule mode holds as a temporary override until the automatic value naturally catches up and matches it again.
- **Accent color** — seven presets plus an intensity slider, used for buttons, borders, and highlights (not node text itself). Optionally recolors the mouse cursor itself too (Settings → Appearance → "Accent-colored cursor"), off by default.
- **Chrome background** — five presets (Default, Slate, Sand, Ink, Rose) that recolor the toolbar, sidebar, status bar, app bar, and menus, independent of both the accent color and the Light/Dark theme. The editor/canvas writing surface is untouched by this.
- **Node text color** — four presets (Default, Black, Charcoal, Slate) for node text specifically, separate from both the accent color and Chrome background.
- **Editor's Choice preset** (Settings → Appearance, or Quick Assist → "editor's choice") — one click reconfigures the toolbar, sidebar, Pad, hover toolbar, status bar, and app bar into a curated, leaner, writing-focused layout. Doesn't touch accent or node text color. Applying it from Quick Assist gives a one-click Undo that restores every setting it touched.
- Further layout controls: hide tree lines, row selection style (Fill/Outline/Left bar/Dot), compact rows, text size (85–140%), branch indent width, and collapse depth.

## Installing as an App (PWA)

Sakura can be installed as a standalone app (its own window, taskbar/dock icon, no browser chrome) via a bundled web app manifest (`display: "standalone"`) and service worker. Look for an install icon in the address bar (desktop Chrome/Edge) or "Add to Home screen" (mobile Chrome). Once installed and open, the app window's title bar color follows your in-app Light/Dark theme (and any active Chrome background preset) live.

One asymmetry worth knowing rather than being surprised by: the manifest's own `background_color` and `theme_color` are a fixed neutral gray (`#8a8886`), used for the brief install splash screen and, on Android, the task-switcher card color. Unlike the open window's title bar, this is read by the OS/browser shell before any of the app's own code runs, so it can't follow your Light/Dark preference the way the live title bar does — it's a platform constraint, not an oversight. The neutral gray is a deliberate compromise: it won't exactly match either theme, but it won't look jarringly wrong in either one either. The actual app window still corrects to your real theme immediately after the splash.

## Data & Backup

Everything is stored locally in the browser, scoped to this exact file. Opening a different copy or a newer version of the file starts with empty storage — this is a browser limitation (local storage is partitioned per file URL), not a bug.

Sakura offers three layers of protection, from lightest to most durable:

1. **Local safety copy** (Settings → Data) — a copy of your data is automatically mirrored into a separate browser storage area (IndexedDB) on every save. If the primary storage is ever cleared, "Restore" can recover from this copy. This is still inside the same browser, not an external backup.
2. **Auto-backup to file** (Settings → Data) — connects a real file on disk and writes a live backup to it as you work, using the File System Access API. Available in Chrome and Edge only. If the browser's file permission lapses (it can, by design, after a reload or restart), the status bar shows a chip to reconnect in one click. If you disconnect it yourself, that same chip stays visible with a plain "Connect" prompt rather than disappearing. Since the live file always overwrites itself, a **Backup history** list underneath keeps up to 5 timestamped snapshots (at least 15 minutes apart) as an independent way back to an earlier point.
3. **Export / Import** (Settings → Data) — saves everything (documents, folders, templates) to a single downloadable JSON file, and restores from one. This is the only option that produces a file outside the browser, and the only reliable way to move *all* your data between different files, browsers, or computers. Importing **replaces the entire app's contents** with the file's — for sharing just one document with someone else (a colleague also using Sakura, for instance), use **Sakura Document** instead (Export ▾ → Share), which adds as a new document without touching anything else already in their workspace.

Every Restore action — from a backup file, the Local safety copy, or a Backup history entry — first snapshots whatever's currently in the app. **Undo last restore** (Settings → Data, appears only once a snapshot exists) reverses that most recent restore if the file you picked turns out to have been the wrong one.

**Recommended workflow when moving to a new copy of this file:** Export from the old copy, open the new copy, then Import immediately.

## Settings Reference

Selected settings worth knowing about (Settings panel, organized by section):

| Setting | Section | Default | Notes |
|---|---|---|---|
| Search bar | Header | **Off** | Global header search; Quick Assist (`Ctrl/Cmd+K`) folds this in regardless of this setting |
| Reopen tabs on launch | General | On | Turn off to always start with a single tab |
| Start each session blank | General | Off | New blank document every launch, instead of restoring the last state |
| Confirm before delete | General | On | Adds a confirmation dialog before deleting nodes or documents |
| Auto theme | Appearance | Off | Off / System / Schedule — see Theming & Appearance above |
| Chrome background | Appearance | Default | Five presets; independent of theme and accent color |
| Expanded toolbar | Toolbar | Off | Shows "Extras" actions as buttons instead of a dropdown menu |
| Format buttons | Toolbar | All shown | Hide individual Bold/Italic/Underline/Strike/Highlight/Text color/Heading buttons independently, without affecting the shortcuts |
| AI Capabilities | Features | On | Master switch for all AI features; each still needs its own provider key |
| Auto-rewrite on commit | AI | Off | See AI Features above; needs a configured API key |
| Provider fallback | AI | Off | Auto-retries with the next configured provider on failure (except a bad key) |
| To-Dos | Features | On | App-level task list; independent of any single document |
| Node hover toolbar | Editing | Off | Menu + Zoom-in buttons on hover, without selecting the node first |
| Focus | Editing | On | Zoom into a branch; can be turned off entirely |
| Auto-backup to file | Data | Off (not connected) | Chrome/Edge only; see Data & Backup above |
| Local safety copy | Data | Always on | Automatic; "Restore" button is the only manual action |
| Debug logging | Data | Off | Rolling in-memory log (last 500 entries) of app events — save, restore, panel, import/export, AI, and more. Uncaught errors are recorded regardless of this setting; the toggle controls the more detailed breadcrumb trail and whether the log viewer is shown. Never includes your note/task/document text, only metadata (node IDs, lengths, which action ran) — useful to turn on when troubleshooting a specific issue, then use "Copy log" to share it |
| Skip folded nodes in exports | Data/Export | On | Collapsed subtrees are omitted from exports unless expanded first |
| Use accent color in exports | Export & print | On | Off: Word, PDF, PowerPoint, and the Q&A/To-Dos/Meeting Notes exports all use one fixed color instead of your live accent, for consistent branding when sharing |
| Meeting Notes | Features | On | App-level meeting log; independent of any single document |

## Keyboard Shortcuts

| Action | Shortcut |
|---|---|
| Edit node | Enter / F2 |
| New sibling below | Enter |
| Split node at cursor | Shift+Enter |
| New child | Ctrl/Cmd+Enter |
| Indent / Outdent | Tab / Shift+Tab |
| Move node up/down | Alt+↑ / Alt+↓ |
| Bold / Italic / Underline | Ctrl/Cmd+B / I / U |
| Strike | Ctrl/Cmd+Shift+S |
| Highlight | Ctrl/Cmd+Shift+H |
| Text color | Ctrl/Cmd+Shift+F |
| Heading 1–6 / Body text | Ctrl/Cmd+Alt+1–6 / Ctrl/Cmd+Alt+0 |
| Collapse / expand selected | ← / → |
| Collapse all / Expand all | Ctrl/Cmd+Shift+[ / Ctrl/Cmd+Shift+] |
| Hide tree lines | Ctrl/Cmd+Shift+L |
| Zoom into branch (Focus) / Exit | Ctrl/Cmd+. / Ctrl/Cmd+, |
| Search this document | Ctrl/Cmd+F |
| Quick Assist (command + search) | Ctrl/Cmd+K |
| Quick Insert (character insert, while editing text) | Ctrl/Cmd+Space |
| Open/close Pad | Ctrl/Cmd+Shift+P |
| Open/close Note | Ctrl/Cmd+Shift+N |
| Open/close Code block | Ctrl/Cmd+Shift+K |
| Open/close To-Dos | Ctrl/Cmd+Shift+U |
| Open/close Meeting Notes | Ctrl/Cmd+Shift+E |
| Generate outline (AI) | Ctrl/Cmd+Shift+O |
| Restructure text (AI) | Ctrl/Cmd+Shift+R |
| Show/hide toolbar | Ctrl/Cmd+Shift+T |
| Save now | Ctrl/Cmd+S |
| New document | Ctrl/Cmd+Alt+N |
| Copy selection | Ctrl/Cmd+Shift+C |
| Select all | Ctrl/Cmd+A |
| Undo / Redo | Ctrl/Cmd+Z / Ctrl/Cmd+Shift+Z |

If a shortcut is intercepted by the OS or browser before it reaches the page (notably `Ctrl/Cmd+Space` for Quick Insert, which can conflict with macOS Spotlight), the equivalent toolbar button or menu item always works as a fallback, and conflicting shortcuts can be remapped in Settings → Keyboard Shortcuts.

## Browser Support

Sakura works in any modern browser. Two features are the exception:

- **Auto-backup to file** requires the File System Access API, supported in Chrome and Edge. In Safari and Firefox, the control is disabled with an explanation, and the **Local safety copy** and manual **Export** remain available as alternatives.
- **Installing as an app (PWA)** depends on the browser's own install support — Chrome and Edge on desktop, and Chrome on mobile ("Add to Home screen"), are the most consistently supported. Safari and Firefox have more limited or absent PWA install support; the app still works normally as a regular browser tab either way.

## Known Limitations

- Storage is scoped per file URL. A renamed, moved, or re-downloaded copy of this file starts with empty storage — export/import is the way to carry data across.
- The local safety copy and auto-backup both protect against accidental data loss within normal use, but neither replaces taking an occasional Export as a true external backup.
- There is no real-time multi-device sync; this is a single-browser, local-first tool. The To-Dos list, like everything else, is local to one browser/file and isn't shared across devices.
- AI features send node/selection text to whichever third-party provider you configure, using an API key you supply and manage yourself — review that provider's own data-handling terms if that matters for your use case. The in-app "Usage today" counter is a local approximation, not an authoritative quota reading.

## Contributing

After cloning, run `sh scripts/setup-git-identity.sh` once — it sets the correct commit author and enables a pre-commit guard (`.githooks/pre-commit`) that blocks any commit made under a different email. This exists because a placeholder email used in an earlier session turned out to belong to someone else's real GitHub account and got silently listed as a contributor; the guard catches that before it happens again.

## License

All rights reserved — see [LICENSE](LICENSE). Public visibility of this repository does not grant permission to reuse, redistribute, or incorporate any part of it into another work.

Sakura loads three open-source libraries from CDN for optional import/export features — SheetJS (Apache 2.0), mammoth.js (BSD-2-Clause), and PptxGenJS (MIT). See [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md) for full attribution.
