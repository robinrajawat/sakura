# Sakura — Outliner-Centered Personal Productivity Workspace

Sakura is a single-file, browser-based outliner that's grown into a full personal productivity workspace: notes, plans, and documents live as a nested tree at the center, with meetings, tasks, decisions, and Q&A woven directly into it via backlinks and cross-references rather than bolted on as separate disconnected tools. It runs entirely client-side and stores its data locally in the browser by default — no install, no build step, no account required. Signing in (optional) syncs everything to your own account so it follows you across devices, and lets you share individual documents with other Sakura accounts. Optional AI features (rewrite, outline generation, and similar) work the same way: opt-in, and call out to an AI provider using a key you supply yourself.

## Contents

- [Overview](#overview)
- [Core Editing](#core-editing)
- [Documents & Tabs](#documents--tabs)
- [Panels](#panels)
- [Hub — To-Dos, Meeting Notes, Journal, Library & Recap](#hub--to-dos-meeting-notes-journal-library--recap)
- [Tags, Focus & Backlinks](#tags-focus--backlinks)
- [AI Features](#ai-features)
- [Quick Assist & Quick Insert](#quick-assist--quick-insert)
- [Preview, Presenter Mode & Export](#preview-presenter-mode--export)
- [Theming & Appearance](#theming--appearance)
- [Installing as an App (PWA)](#installing-as-an-app-pwa)
- [Account, Sync & Sharing](#account-sync--sharing)
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
- Companion panels per node or per document: rich-text Notes, Code blocks, a Decision Log, a whole-document Pad (with Notepad, Q&A, Diagrams, Mind Map, Files, and Remarks tabs)
- **Hub** — five app-level panels shared across your whole workspace, independent of any single document, all reachable from one button in the app bar: **To-Dos**, **Meeting Notes** (with action items promotable directly into a linked to-do), a daily **Journal**, a **Library** of quick-reference notes and links (with favorites and tag filtering), and **Recap** — a curated, document-grouped look back at what actually got done (Today / This Week / Last Week) across every document, To-Dos, Meeting Notes, and Journal at once, with click-to-jump navigation and an optional AI bullet-summary for standups/status updates
- Diagrams — link a draw.io diagram (Pad → Diagrams tab) to any node; embeds as a real picture in Word, PowerPoint, and PDF exports
- Optional AI features — rewrite, generate an outline from a topic, restructure pasted text, expand a label into a subtree, suggest tags/icons, summarise a selection, plus dedicated AI actions inside To-Dos and Q&A — using your own API key with any of six built-in providers or a custom one
- Quick Assist: a combined command bar and search box (plain-English toggles like "hide file explorer," plus search across documents, notes, tags, to-dos, meetings, journal, and settings)
- In-document search and a global header search across settings, help, documents, and templates
- Folders and templates in the file explorer (including built-in packs like Meeting Notes, 1:1, Kickoff, Retrospective), with drag-and-drop filing and nesting
- **Presenter Mode** — a fullscreen, slide-by-slide presentation of any document, with a laser pointer, blackout, an all-slides grid, a running timer, a floating notes panel, a persistent Whiteboard (a real draw.io canvas for sketching mid-talk), and an optional closing slide
- Export to **Word (.docx)**, **PDF**, **PowerPoint (.pptx)**, **Markdown**, plain text, **OPML**, Excel (Decision Log), or clipboard; print support; import from Word, OPML, or pasted unstructured text. Word/PDF/PowerPoint exports carry a real table of contents, an optional cover page, and your chosen accent color (independently toggleable for consistent branding when sharing)
- Multiple documents open as independent tabs
- Deep theming: Light/Dark/System/Schedule auto-theme, seven accent colors, five Chrome background presets, and node-text color presets
- Installable as a desktop/mobile app (PWA) in supporting browsers
- Two-tier automatic backup (live file backup + a local safety copy), in addition to manual export/import
- Optional account sign-in (Google or email) syncs documents, folders, templates, and settings across devices, and lets you share individual documents with other Sakura accounts as viewer or editor
- Version History for documents, the To-Dos list, Meeting Notes, and Journal — periodic snapshots you can restore from independently of the undo stack

## Core Editing

- **Enter** — new sibling node below; **Shift+Enter** — split the node at the cursor (text after the cursor becomes a new sibling below) — or, if Inline note/remark previews is on (Settings → Layout), adds/focuses an inline note for the node instead; **Ctrl/Cmd+Enter** — new child node
- **Tab / Shift+Tab** — indent / outdent the selected node
- **Drag a row** — drop above/below to reorder, or onto the middle of another row to nest it as a child
- **Right-click a node with children** — sort children A→Z, Z→A, or by depth
- Click the fold arrow to collapse or expand a subtree; when collapsed, the "+N" badge is itself clickable to expand
- Use `[Text]`, `(Text)`, `!Text`, and `` `Text` `` inline for section labels, muted notes, alerts, and inline code
- Hover any node (Settings → Editing → "Node hover toolbar") to reveal quick Menu and Zoom-in buttons next to its bullet, without needing to select it first
- **Checkboxes** — toolbar button (Insert group) or type `[ ] `/`[x] ` at the start of a node while editing (auto-converts on commit). Click the box to check/uncheck; checked nodes show struck-through, dimmed text. A checkbox parent with checkbox children shows a live progress badge (e.g. `2/5`) and auto-checks itself once every child is checked
- `Ctrl/Cmd+Space` opens **Quick Insert** — a small menu for inserting an em dash, en dash, arrow, checkmark, cross mark, middle dot, or date/time without leaving the keyboard. Same menu, same shortcut, in every editable area of the app (nodes, Pad, Notes, Meeting Notes, To-Dos, Journal, the title field) — not just while editing a node

## Documents & Tabs

Sakura supports multiple open documents at once, shown as tabs above the toolbar — similar to browser tabs.

- Clicking a document in the file explorer, or the **+** at the end of the tab strip, opens it as a tab
- **Each tab keeps its own undo/redo history, scroll position, and selection independently.** Switching tabs does not reset undo history the way switching documents used to
- **Double-click a tab** to rename it
- The **X icon** on a tab closes the tab only — the document itself is not deleted and remains in the file explorer
- The **dropdown arrow** at the right of the tab strip opens a searchable list of all open tabs (arrow keys + Enter to jump, or click a result) — useful once you have more tabs open than fit on screen
- **"Reopen tabs on launch"** (toggle via Quick Assist — no Settings UI control for this yet) controls whether your previously open tabs come back automatically, or whether each session starts with just one

## Panels

Beyond the outline itself, several floating or docked panels attach richer content to a node or a document. All are individually toggleable in Settings → Features (or that panel's own Settings section), and turning one off only hides it — existing content is preserved and comes back when re-enabled.

- **Note** — every node can hold a rich-text note (bold/italic/underline/strike, bullet/numbered lists, links, tables, pasted images, AI Rewrite/Summarise). Floating and draggable, with a compact popover view and a full-screen mode. Shows a Backlinks section for any node that `@mentions` it, plus created/last-modified timestamps. Open via toolbar, right-click → More → Note, or `Ctrl/Cmd+Shift+N`.
- **Code Block** — every node can hold one plain-text code block (language picker: Plain text, ABAP, SQL, JavaScript, Python, JSON, XML/HTML, Markdown), in the same kind of floating, resizable window as Note. Open via toolbar, right-click → More → Code block, or `Ctrl/Cmd+Shift+K`.
- **Pad** — a whole-document workspace, separate from per-node Notes, with seven tabs:
  - **Notepad** — a rich-text scratchpad with the same toolbar Note uses (minus subtree-summarise, since there's no subtree at the document level), plus its own **Quote** button for citation-style blocks (select text to wrap it, or insert blank) that Note's toolbar doesn't have.
  - **Q&A** — a running list of question/answer pairs for the document, with AI-assisted answering, bulk answer/group actions, search, and its own PDF export. Individual questions can be linked to a specific node — right-click a node → "Add question…" (or `Ctrl/Cmd+K` → "add question"), or the tab's own + button for an unlinked one. Answerable directly from Presenter Mode too, not just the Pad.
  - **Decision Log** — a structured record, linked to a node rather than inserted into it: a timestamped header (with optional author) plus configurable fields for Context, Decision, Rationale, Alternatives, Impact, and Status. Create one from the Decision Log tab's own + button (the currently-selected node gets it automatically if it's free); a small accent-colored dot appears on a node once it has one, click it to jump straight there. Renders as a bordered, status-colored card in Preview/Word/PDF/PowerPoint exports and is separately exportable as its own Excel sheet across a document.
  - **Diagrams** — link a draw.io diagram to any node; it embeds as a real picture in Word, PowerPoint, and PDF exports, and shows inline in Preview. One diagram per document can instead be a persistent, deliberately unlinked **Whiteboard** — same real draw.io editor, opened directly from Presenter Mode's bar or right-click menu for sketching or brainstorming on the fly; pinned to the top of this list, badged rather than flagged as "Unlinked". The tab's **Generate** button builds a rough flowchart straight from the outline — a selected node's subtree, or the whole document if nothing's selected (capped at 30 nodes / 5 levels; select a smaller section if it's over that) — as a real, editable draw.io diagram added directly to this list. Layout, structure, and color are entirely deterministic (no AI involved in any of that): boxes tile top-down by outline hierarchy, a flat run of childless sibling nodes renders as a vertical sequence instead of fanning out sideways, and color follows top-level branch position, with an explicit node marker (Confirmed/Issue/Parked/Follow-up/N-A) or a node's first tag overriding that — a tag deterministically hashes to one of 8 reserved hues, so the same tag always recolors the same way without any keyword list to maintain. AI is only ever used, optionally, to shorten a node's text if it's too long to fit even wrapped across two lines in its box — never to reinterpret structure or meaning — and silently falls back to plain truncation with no AI configured. Generating again for the same scope offers to regenerate that same diagram in place (confirms first, since it discards any changes made since inside draw.io) rather than adding a duplicate. It's meant as a rough first draft to refine by hand in draw.io afterward, not a finished diagram.
  - **Mind Map** — freeform brainstorming canvases, any number per document, each opening full-screen from the tab's list. Double-click empty canvas to drop an idea; any idea with no parent is its own root, so a map can hold several independent trees at once, not just one center everything must connect to. Drag to reposition (with alignment guides), double-click or `Tab`/`Enter` to branch, and each root's subtree gets its own auto-cycled color. Ideas can carry a short note, one of the outline's own Confirmed/Issue/Parked/Follow-up markers, and a link to a specific node in the document; two unrelated ideas can also be cross-linked with a labeled dashed connector. **Expand with AI…** turns one idea into 3–8 new branches, and the connections icon scans the whole map for relationships between ideas in different branches that aren't already linked. Export as a PNG image, convert into a real draw.io diagram (Diagrams tab), or **Generate Outline** — walk the whole map depth-first into a brand-new outline document. Presenter Mode's `M` key opens a persistent Scratchpad map for on-the-fly brainstorming mid-talk, separate from any map already in the document.
  - **Files** — the document's attachments, as their own list rather than living inside the Notepad's text. Attach a file via the tab's + button, drag-and-drop (onto the list or anywhere on the Pad while this tab's active), 5 MB cap per file; click a row's name to download it again. Each attachment can optionally link to a specific node — new ones auto-link to whatever's currently selected, same convention Diagrams uses — with a small accent-colored dot appearing on a linked node (click it to jump to that file; several files on one node open a picker instead of guessing which). Deleting a node that has a file linked to it warns about the orphaned link first, same as it already does for Diagrams/Decision Log. Each attachment also carries an optional Added-by and a short note field. Stored as part of the document itself (same as everything else in this list), so it's covered by every existing backup path automatically — not uploaded anywhere. Not included in Word/PDF/PowerPoint exports (there's no way to represent an arbitrary file inside those formats) — Sakura Document export is the one that carries it across.
  - **Remarks** — a record of things people said, worth keeping separately from the document's own content: each entry is a card with who said it, the remark itself, a date (defaults to today, freely editable — useful for logging something after the fact), an optional short context line, and the same optional node-link convention Files/Diagrams use, complete with its own node dot and orphan-link warning on delete. Newest first, unlike Files/Diagrams' insertion order — a remarks log reads naturally that way. Included in Word, PDF, and PowerPoint exports (Settings → Export → "Include Remarks in exports"): a remark linked to a node appears right after it, same placement Decision Log uses; an unlinked one lands in an end-of-document "Remarks" section instead (a trailing slide, in PowerPoint's case).

  Open the Pad via its floating panel icon or `Ctrl/Cmd+Shift+P`.

## Hub — To-Dos, Meeting Notes, Journal, Library & Recap

Five panels live at the app level rather than inside any single document — one shared instance across your whole workspace, all reachable from the single **Hub** button in the app bar rather than per-document.

- **Meeting Notes** (`Ctrl/Cmd+Shift+M`) — an app-level meeting log. Add a blank note or start from a built-in template (Meeting Notes, 1:1, Daily Standup, Weekly Status, Project Kickoff, Retrospective), each pre-filling title/Agenda/Notes and a starter action item where relevant. Each note has a title, date, optional time, attendee chips, rich-text Agenda and Notes fields, action items, and links to specific documents or nodes. An action item's **Promote** button turns it into a real To-Do — the new task's due date comes from the meeting's own date, and a small "from meeting" chip links back to the source note. Export a single note as a PDF; Version History keeps the last 20 snapshots of the whole list. The Share icon exports the whole list as a `.sakura.json` file for another Sakura user to import (their own Import button, next to Share) — adds to their list without touching anything already there; links to specific documents/nodes don't carry over, since those would point at documents the recipient doesn't have.
- **To-Dos** (`Ctrl/Cmd+Shift+T`) — one shared task list across your whole workspace, not tied to any document or node. Supports priority, status, and due dates (with a Today/Tomorrow/Next week quick-pick popover), links, drag-to-reorder, quick-find, and an overdue-count badge. Filter by priority, status, and due date at once (Overdue/Today/Due later/No due date), and sort by priority, due date, or manual order. Select multiple open tasks to bulk-set priority/status/due date or bulk-complete/delete, each with its own Undo. Three optional AI capabilities (Settings → AI → To-Dos AI, each independently toggleable): extract action items from the current document or selection, break a task into subtasks, and generate a status summary of open tasks — all add directly to the list with Undo. Typing `#tag` or `@name`/`@date`/`@status` directly in a task's text renders it as a colored chip with autocomplete. A task can either **repeat** (daily, weekdays, or weekly — completing it advances the due date instead of marking it done for good) or hold **sub-tasks** (a nested checklist with an n/m progress badge; the parent completes automatically once every sub-task is checked) — the two are mutually exclusive on the same task. Export the whole list as a PDF; Version History keeps the last 20 snapshots. Same Share/Import pair as Meeting Notes — exports the whole list as a `.sakura.json` file, imports add to the recipient's list rather than replacing it, and any link to a specific document/node is dropped on import for the same reason.
- **Journal** (`Ctrl/Cmd+Shift+J`) — a daily journal, one entry per calendar date rather than any number of freely-dated items like Meeting Notes. Writing anything into a date's entry is what creates it — opening a date and navigating away without typing leaves nothing behind. Each entry has an optional mood (five presets, click again to clear), free-form tags, and a rich-text body with the same AI Rewrite as Note/Meeting Notes/Pad (a toolbar button rewrites the whole entry; highlighting text surfaces the shared selection-formatting popover to rewrite just that phrase instead). A calendar popover jumps to any date, marking days that already have an entry. Export a single entry or the whole journal as a PDF; Version History keeps the last 20 snapshots of the whole journal. Searchable from Quick Assist and the global header search, same as Meeting Notes and To-Dos. Unlike Meeting Notes/To-Dos, Journal doesn't yet support node/document links, Share/Import, or in-panel search.
- **Library** — an app-level repository for quick-reference notes: saved links, snippets, short how-tos, screenshots with context — things you want to find again later rather than a log of what happened. Each entry has a title, an optional URL with its own optional label (shown in place of the raw URL everywhere it appears once set, and clickable directly from the list without opening the entry), free-form tags, and a rich-text note supporting pasted images (auto-scaled to fit) and the same AI Rewrite/selection-formatting popover as Journal. **Favorites** — star an entry to pin it to the top of the list; a toolbar toggle filters to favorites only. Tags in the list are clickable to filter by that tag. Favorites, tag filter, and the search box all combine rather than replacing each other, and a filter combination matching nothing explains which filters are active instead of just showing empty. Searchable from Quick Assist (`library:`/`lib:` prefix) and the global header search. Version History currently restores only the single most recent snapshot rather than a full browsable history like Meeting Notes/Journal have.
- **Recap** — a curated recap rather than a stats dashboard: no counts up front, just what actually happened, grouped by document (then Meeting Notes, then Journal), most recently active group first. Three tabs — **Today**, **This Week**, **Last Week** (weeks run Monday–Sunday) — with the exact date range and ISO week number shown underneath (e.g. "Jul 14 – Jul 20 · Week 29"). Each group shows a handful of short lines marked done / added / edited (green check / blue plus / muted pencil), capped with a quiet "+N more" rather than listing everything; editing a node's Note counts as activity here the same as editing its text, and so does Decision Log, Diagram, Q&A, and Mind Map activity, each labeled by type ("Decision: …", "Diagram: …", etc.) within its document's group. Click any line to jump straight to its source — a document node, a to-do, a meeting note, a journal entry, or a Decision Log/Diagram/Q&A/Mind Map item (opens the Pad to the right tab) — or click a document group's title to just open that document. **Summarize with AI** condenses whichever tab is showing into status-meeting-ready bullets, grouped by document the same way the panel itself is — a bullet (or a couple, for a genuinely busy group) with enough specifics to say out loud in a meeting, not a maximally-compressed one-liner; needs AI configured the same as the other AI features. Reads across every document, not just the one currently open.

On a narrow screen (below 768px), opening this file redirects once, on load, to **hub.html** — a separate, purpose-built mobile page rather than a cut-down view of this one. It currently covers **To-Dos and Journal** (Meeting Notes, Library, Recap, AI features, PDF export, and version history all stay desktop-only for now). There's no app-bar header, bottom navigation, or floating compose pill — the only persistent chrome is a single sticky bar at the top with an inline "Add a task" affordance (tap it, type, Enter to add and keep typing the next one) and account access. The list itself is grouped by urgency — Overdue, Today, Upcoming, No Date, each section only appearing if it has anything in it — so individual rows can stay down to just a checkbox and the task text; due date and status live in a tap-to-open detail sheet instead of crowding every row. Swipe right to complete, swipe left to delete (instant, with a few seconds to Undo via the toast that appears, rather than a confirmation dialog interrupting every delete up front) — the same two-directions-one-gesture swipe Things 3 popularized. **Signing in is required there** — a phone is almost always a different browser from whatever device you last used, and local storage never crosses devices on its own; hub.html reads and writes the same `users/{uid}/meta/todos` and `users/{uid}/meta/journal` documents this file's own cloud sync already uses (Google or email sign-in, same account system as here), which is what actually bridges the two. It pulls once on sign-in (newer of cloud/local wins) and pushes after every change — no realtime listener, by design, for a page meant for short sessions rather than being left open for hours. There is no link back to this full editor from hub.html — its sign-in screen says outright that Meeting Notes, Library, Recap, and everything else need a computer, rather than offering an escape hatch to a desktop UI that doesn't actually work well on a phone. The redirect check only runs on initial load, not on resize, so narrowing a desktop window mid-session never yanks the editor away from you.

hub.html has its own web app manifest (`hub-manifest.json`, `display: "standalone"`) separate from the root one this file uses — installing "Add to Home screen" from a phone launches straight into hub.html rather than bouncing through this file's redirect first. That manifest also registers hub.html as a **share target**: on Android (and any OS that honors PWA share targets — not currently iOS Safari), Sakura shows up in the system share sheet from other apps, and sharing a link or selected text creates a new to-do from it. It's GET-based, so it's link/text only, no shared files or images. Anyone who installed the Hub before this was added needs to reinstall it for the share-target registration to take effect. The account menu also has a **due-date reminders** toggle — once granted Notification permission, it fires a local notification the moment a task becomes due or overdue (checked on sign-in, on foregrounding, and every 5 minutes while the tab stays open). There's no push server behind this static site, so it's a "while Sakura is open" reminder, not true background push, and iOS Safari's foreground Notification support is inconsistent even then.

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

- **Quick Assist** (`Ctrl/Cmd+K` from anywhere, or click the search box in the header/status bar) is a combined command bar and search box. Plain-English commands work directly — "hide file explorer," "toggle dark mode," "get rid of pad" — and toggle/search behavior is rule-based (a fixed phrase list), not AI, so it never improvises and needs no API key. Typing a bare word like "show," "hide," "toggle," or "run" lists everything of that kind; a category prefix ("notes: budget," "settings: dark," "journal: coffee," "library: onboarding") narrows a search to one area — including Pad's individual sub-tabs (`qa:`, `diagram:`, `remark:`), separate from plain `pad:` which stays scoped to just the Notepad text. Below commands, a separate **Run** row type covers one-off actions (new document, duplicate node, insert decision log, apply Editor's Choice preset, and the AI actions above) — always undoable, and never anything destructive. Below that, matching documents, node text, notes, tags, the Pad (including Q&A, Diagrams, and Remarks individually), to-dos, meetings, journal entries, library entries, and settings/help topics show up as **Go to** results.
- **Quick Insert** (`Ctrl/Cmd+Space` while actively editing text — anywhere: a node, the title field, the Pad, a Note, a Code block, a To-Do, a Meeting Notes field, a Journal entry) opens a small character-insert menu — em dash, en dash, arrow, checkmark, cross mark, middle dot, date/time — configurable in Settings → Editing. Same menu, same shortcut, everywhere; it's deliberately just characters, not a second command bar, so it's never in competition with Quick Assist for the same key. Node-specific actions (Note, Tags, Add question, Rewrite, Version history) live on the right-click menu instead.

## Preview, Presenter Mode & Export

- **Preview** — a read-only, formatted render of the current document, reachable from the floating eye-icon button next to zen/Pad/toolbar. Includes a table of contents (headings, section markers, Decision Log entries, and — when present — Notepad and Q&A as their own entries), scroll-spy highlighting, and a progress bar.
- **Presenter Mode** — opens fullscreen straight from Preview: a decorated title slide, then one section per slide, navigated with arrow keys/space/click, each fading in briefly on an actual slide change. A thin progress bar tracks position across the top of the screen, and headings/sub-bullets get a presenting-only size and weight bump for legibility from across a room. A laser pointer, a full all-slides grid (`G`) for jumping around, a blackout toggle (`B`) to pull attention back to you mid-discussion, a running elapsed timer, and a floating Notepad/Q&A panel (`N`/`Q`, with clickable tabs once it's open) that's the same Pad the document already has. A pencil icon (`W`) opens the **Whiteboard** — one persistent, real draw.io canvas per document for sketching or brainstorming without tying it to any slide. Right-clicking (anywhere that isn't a line's own text) opens a menu with all of the above plus Reset zoom and Exit. An optional closing slide — "Thank you" by default, or your own text and subtitle — bookends the opening title slide at the end of the deck. "Presenter slide breaks at" (Settings → Presets & Modes → Preview) controls which tree depth starts a new slide.
- **Word export** (`.docx`) — real heading styles, a proper Table of Contents (headings and section markers, with page references — press Ctrl/Cmd+A then F9 after opening to load real page numbers, since Word only caches "1" until fields are recalculated), and Decision Log entries as bordered, status-colored cards. Notes carry their actual formatting (bold/italic/underline/strike/links); images marked "Feature as diagram" and Diagrams-tab pictures embed as real, correctly-scaled pictures.
- **PDF export** — renders from the same Preview output, so anything visible in Preview (fold state, notes, code blocks, decision cards, the table of contents) carries through as-is. Optional cover page, configurable page margins, and an optional running footer (export date + page number).
- **PowerPoint export** (`.pptx`) — a genuine, editable slide deck using the same slide breakdown as Presenter Mode: title slide, then one slide per node at that depth with its subtree as nested bullets, plus dedicated Q&A and Notepad slides at the end. A slide whose bullets overflow automatically continues onto a "(cont'd)" slide rather than clipping. Everything — text, bullets, pictures — is a normal native shape, fully editable in PowerPoint, Keynote, or Google Slides.
- **Branding** (Settings → Presets & Modes → Preview → "Branding") adds a small, consistent attribution mark to the bottom-right of every slide/page across the Presenter bar, PDF, Word, and PowerPoint exports — off by default, with your own company/team name as an optional override for the default "SAKURA" wordmark.
- Word, PDF, and PowerPoint exports all use your current accent color by default; **Settings → Export & print → "Use accent color in exports"** turns that off in favor of one fixed color across every format, for consistent branding when the document is going to someone else rather than staying on your own screen.
- Other export formats: Markdown, plain text, OPML, Decision Log as its own Excel sheet, or copy as text/image to the clipboard. Import from Word (heading/list structure converts directly; a heading-less document falls back to AI restructuring), OPML, or pasted unstructured text.
- **Sakura Document** (Export ▾ → Send a copy → Sakura Document, `.sakura.json`) — the one full-fidelity export: everything a document holds, including notes, Decision Logs, Diagrams (real editable draw.io XML, not just the picture), Q&A, Mind Maps, Files, and Remarks. Every other format is lossy by design (OPML/Markdown/plain text keep structure and text only; Word/PDF/PowerPoint flatten into a document that's no longer editable in Sakura) — this one exists specifically to hand a complete, still-fully-editable document to someone else running Sakura as a file, without needing an account on either end. If they do have a Sakura account, the account-based **Share** chip under the title (see [Account, Sync & Sharing](#account-sync--sharing)) grants direct access instead. **Import ▾ → Sakura Document** brings a received file in as a new document; it never touches anything else already in your workspace, unlike the whole-app Export/Import described under Data & Backup below.

## Theming & Appearance

- **Light/Dark theme** with an **Auto theme** mode: Off (manual only), System (follows the OS/browser's dark-mode setting live), or Schedule (switches at hours you set). Manually overriding the theme while in System/Schedule mode holds as a temporary override until the automatic value naturally catches up and matches it again.
- **Accent color** — seven presets plus an intensity slider, used for buttons, borders, and highlights (not node text itself). Optionally recolors the mouse cursor itself too (Settings → Appearance → "Accent-colored cursor"), off by default.
- **Chrome background** — five presets (Default, Slate, Sand, Ink, Rose) that recolor the toolbar, file explorer, status bar, app bar, and menus, independent of both the accent color and the Light/Dark theme. The editor/canvas writing surface is untouched by this.
- **Node text color** — four presets (Default, Black, Charcoal, Slate) for node text specifically, separate from both the accent color and Chrome background.
- **Editor's Choice preset** (Settings → Appearance, or Quick Assist → "editor's choice") — one click reconfigures the toolbar, file explorer, Pad, hover toolbar, status bar, and app bar into a curated, leaner, writing-focused layout. Doesn't touch accent or node text color. Applying it from Quick Assist gives a one-click Undo that restores every setting it touched.
- Further layout controls: hide tree lines, depth guide lines (faint vertical line per indent level, only visible when tree lines are hidden), row selection style (Fill/Outline/Left bar/Dot), compact rows, text size (85–140%), branch indent width, and collapse depth.
- **Inline note/remark previews** (Settings → Layout, off by default) — shows a node's Note, and any Remarks anchored to it, as their own lines directly underneath the node in the editor tree — clamped to 2 lines when collapsed, expanding while you're actively editing one. Editable right there (including a remark's person/date), so quick text changes don't need the Pad open; the note dot still opens the full Note panel for anything inline editing can't do, like images. With this on, `Shift+Enter` while editing a node's text adds/focuses an inline note for it instead of splitting the node (unchanged when the setting is off). Backspace on an empty inline note or remark deletes it and returns you to the node's own text — same as backspacing an empty node. Right-click a note or remark for a small menu (Rewrite with AI, Delete) — deliberately separate from the row's own right-click menu, since node-structure actions like tags don't apply to an annotation. Select text within either one and the same floating Bold/Italic/Link/Highlight popover the Pad and Note editors use appears — real rich-text formatting, not just the semantic auto-formatting the outline itself uses.
- **Inline Q&A previews** (Settings → Layout, off by default) — same idea, applied to Q&A: any question linked to a node shows underneath it as an editable Question/Answer pair, right in the outline. An unanswered question shows a muted "No answer yet…" placeholder rather than nothing. Right-click for AI Answer (if the AI feature and the panel's own AI-answer setting are both on) and Delete. Adding a new question via the node's context menu creates it inline and focuses the Question field directly, instead of the older prompt dialog — unchanged when the setting is off.

## Installing as an App (PWA)

Sakura can be installed as a standalone app (its own window, taskbar/dock icon, no browser chrome) via a bundled web app manifest (`display: "standalone"`) and service worker. Look for an install icon in the address bar (desktop Chrome/Edge) or "Add to Home screen" (mobile Chrome). Once installed and open, the app window's title bar color follows your in-app Light/Dark theme (and any active Chrome background preset) live.

The manifest's own `background_color`/`theme_color` (used for the brief install splash screen, and on Android the task-switcher card color) are a fixed warm off-white (`#f8f8f6`) matching the light theme — read by the OS/browser shell before any of the app's own code runs, so it can't follow a Dark-theme preference the way the live title bar does; the actual app window corrects to your real theme immediately after the splash.

The install icon itself is genuinely transparent (real alpha, not a flattened opaque square) so it renders correctly on any OS background — a dark taskbar, a colored tile — rather than showing as a flat square with wasted padding. A separate maskable variant is included for platforms (Android, some Windows contexts) that apply their own adaptive-icon crop shape on top.

## Account, Sync & Sharing

Signing in (Google or email, from the account button top-right) is entirely optional — everything above keeps working fully offline and locally without it. Signing in does two things:

- **Sync** — your documents, folders, templates, and settings sync to your account and follow you to another browser or device (newer-wins per item, not a field-level merge). A status-bar dot shows sync health; a "no backup taken this session" warning elsewhere in Settings stays quiet whenever sync is signed in and healthy, since that already is a continuous, live off-device backup.
- **Sharing** — share an individual document with another Sakura account as **Can view** or **Can edit**. A "Share" chip appears under a document's title once you're signed in; type a name or email to search (only accounts with **Profile visibility** set to Public, Settings → Account, Private by default, show up in results), pick a role, and click a result to share immediately. Documents shared with you appear in a **Shared** section in the file explorer, alongside who shared them and your access level. A bell icon next to the account button notifies you when someone shares something with you.

Sharing is deliberately simple in this version: access is per-document, not per-folder; a shared document opens as a normal tab but doesn't persist across a page reload the way your own documents do (reopen it from the Shared section); and there's no live co-editing — two people editing the same shared document at once still follow the same newer-wins sync model as your own devices do, not real-time collaboration.

## Data & Backup

Everything is stored locally in the browser, scoped to this exact file. Opening a different copy or a newer version of the file starts with empty storage — this is a browser limitation (local storage is partitioned per file URL), not a bug.

Sakura offers four layers of protection, from lightest to most durable:

0. **Account sync** (see [Account, Sync & Sharing](#account-sync--sharing) above) — signing in is itself a live, continuous, off-device backup, on top of whatever it's also used for. Everything below still matters even signed in — an account can't help if it's ever deleted or unreachable — but the "Warn if this session isn't backed up" prompt below stays quiet while sync is healthy, since there's nothing extra to warn about on top of it.
1. **Local safety copy** (Settings → Data) — a copy of your data is automatically mirrored into a separate browser storage area (IndexedDB) on every save. If the primary storage is ever cleared, "Restore" can recover from this copy. This is still inside the same browser, not an external backup.
2. **Auto-backup to file** (Settings → Data) — connects a real file on disk and writes a live backup to it as you work, using the File System Access API. Available in Chrome and Edge only. If the browser's file permission lapses (it can, by design, after a reload or restart), the status bar shows a chip to reconnect in one click. If you disconnect it yourself, that same chip stays visible with a plain "Connect" prompt rather than disappearing. Since the live file always overwrites itself, a **Backup history** list underneath keeps up to 5 timestamped snapshots (at least 15 minutes apart) as an independent way back to an earlier point.
3. **Export / Import** (Settings → Data & Backup) — saves everything (documents, folders, templates) to a single downloadable JSON file, and restores from one. This is the only option that produces a file outside the browser, and the only reliable way to move *all* your data between different files, browsers, or computers. Importing **replaces the entire app's contents** with the file's — for sending just one document to someone else, use either **Sakura Document** (Export ▾ → Send a copy → Sakura Document — a file they import themselves) or, if they also have a Sakura account, the account-based **Share** chip under the title (see [Account, Sync & Sharing](#account-sync--sharing)) instead. Deliberately only reachable from Settings, not duplicated as a one-click shortcut elsewhere — Restore replaces everything currently in the app, so it's worth the extra couple of clicks to get there. Restoring a backup file while signed in is specifically guarded against overwriting newer synced work: the next sync pull reconciles against your account before anything local gets pushed back up.

Every Restore action — from a backup file, the Local safety copy, or a Backup history entry — first snapshots whatever's currently in the app. **Undo last restore** (Settings → Data, appears only once a snapshot exists) reverses that most recent restore if the file you picked turns out to have been the wrong one.

**Recommended workflow when moving to a new copy of this file:** Export from the old copy, open the new copy, then Import immediately.

## Feedback & Crash Reports

**Send Feedback** (Account menu, or Settings → Data) opens a small form — a message and an optional email — that goes straight to a write-only mailbox only Robin can read; nobody, including you, can read it back through the app. This is a deliberate, one-time exception to the no-network-call-to-Firebase-unless-you-sign-in principle above: sending it is its own explicit consent, the same as clicking Sign in with Google is.

**Automatic crash reports** (Settings → Data, off by default) does the same thing without asking each time: if something throws an uncaught error, it silently files a short report — the error message, the last few console errors leading up to it, and basic environment info (browser, URL) — capped at 10 reports per session with duplicates skipped. It's off by default specifically because it's the one thing in this app that would otherwise phone home without you asking; turning it on is that ask. Either path never includes document, note, or task content — only the error itself and where it happened.

## Settings Reference

Selected settings worth knowing about (Settings panel, organized by section):

| Setting | Section | Default | Notes |
|---|---|---|---|
| Search bar | Bars & Menus | **Off** | Global header search; Quick Assist (`Ctrl/Cmd+K`) folds this in regardless of this setting |
| Reopen tabs on launch | *(Quick Assist only)* | On | No Settings UI control yet — toggle via Quick Assist ("reopen tabs"); turn off to always start with a single tab |
| Start each session blank | *(Quick Assist only)* | Off | No Settings UI control yet — new blank document every launch instead of restoring the last state |
| Confirm before delete | General | On | Adds a confirmation dialog before deleting nodes or documents |
| Auto theme | Appearance | Off | Off / System / Schedule — see Theming & Appearance above |
| Chrome background | Appearance | Default | Five presets; independent of theme and accent color |
| Expanded toolbar | Bars & Menus | Off | Shows "Extras" actions as buttons instead of a dropdown menu |
| Format buttons | Bars & Menus | All shown | Hide individual Bold/Italic/Underline/Strike/Highlight/Text color/Heading buttons independently, without affecting the shortcuts |
| AI Capabilities | Features | On | Master switch for all AI features; each still needs its own provider key |
| Auto-rewrite on commit | AI | Off | See AI Features above; needs a configured API key |
| Provider fallback | AI | Off | Auto-retries with the next configured provider on failure (except a bad key) |
| To-Dos | Features | On | App-level task list; independent of any single document |
| Node hover toolbar | Editing | Off | Menu + Zoom-in buttons on hover, without selecting the node first |
| Focus | Editing | On | Zoom into a branch; can be turned off entirely |
| Auto-backup to file | Data & Backup | Off (not connected) | Chrome/Edge only; see Data & Backup above |
| Local safety copy | Data & Backup | Always on | Automatic; "Restore" button is the only manual action |
| Debug logging | Data & Backup | Off | Rolling in-memory log (last 500 entries) of app events — save, restore, panel, import/export, AI, and more. Uncaught errors are recorded regardless of this setting; the toggle controls the more detailed breadcrumb trail and whether the log viewer is shown. Never includes your note/task/document text, only metadata (node IDs, lengths, which action ran) — useful to turn on when troubleshooting a specific issue, then use "Copy log" to share it |
| Skip folded nodes in exports | Data & Backup | On | Collapsed subtrees are omitted from exports unless expanded first |
| Use accent color in exports | Data & Backup | On | Off: Word, PDF, PowerPoint, and the Q&A/To-Dos/Meeting Notes/Journal exports all use one fixed color instead of your live accent, for consistent branding when sharing |
| Meeting Notes | Features | On | App-level meeting log; independent of any single document |
| Journal | Features | On | App-level daily journal, one entry per calendar date; independent of any single document |
| Library | Features | On | App-level quick-reference notes (links, snippets, favorites, tags); independent of any single document |
| Recap | Features | On | Curated Today/This Week/Last Week recap across every document, To-Dos, Meeting Notes, and Journal; includes the optional AI bullet-summary |

## Keyboard Shortcuts

| Action | Shortcut |
|---|---|
| Edit node | Enter / F2 |
| New sibling below | Enter |
| Split node at cursor | Shift+Enter (adds/focuses an inline note instead, if Inline note/remark previews is on) |
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
| Open/close To-Dos | Ctrl/Cmd+Shift+T |
| Open/close Meeting Notes | Ctrl/Cmd+Shift+M |
| Open/close Journal | Ctrl/Cmd+Shift+J |
| Generate outline (AI) | Ctrl/Cmd+Shift+O |
| Restructure text (AI) | Ctrl/Cmd+Shift+R |
| Show/hide toolbar | Ctrl/Cmd+Shift+X |
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
- Account sync (see [Account, Sync & Sharing](#account-sync--sharing)) is optional, newer-item-wins, and per-document — there is no real-time/live co-editing. Two people (or two of your own devices) editing the same document at the same moment still resolve by whichever save lands last, the same as any other sync conflict here, not a merge. Sharing itself is per-document, not per-folder, and a document shared with you doesn't stay open across a page reload — reopen it from the Shared section in the file explorer.
- AI features send node/selection text to whichever third-party provider you configure, using an API key you supply and manage yourself — review that provider's own data-handling terms if that matters for your use case. The in-app "Usage today" counter is a local approximation, not an authoritative quota reading.
- Below 768px, this file redirects to hub.html, which requires signing in (no local-only mode there — see Mobile Hub above for why) and currently covers To-Dos and Journal only — Meeting Notes, Library, Recap, and the outliner itself aren't reachable from a phone-sized screen at all. hub.html's sign-in screen points to a computer for all of that instead of offering a non-working link back here. This is an intentional, staged rollout, not a bug, but someone who's never signed in has no mobile Hub access until they do.

## Contributing

After cloning, run `sh scripts/setup-git-identity.sh` once — it sets the correct commit author and enables a pre-commit guard (`.githooks/pre-commit`) that blocks any commit made under a different email. This exists because a placeholder email used in an earlier session turned out to belong to someone else's real GitHub account and got silently listed as a contributor; the guard catches that before it happens again.

### Deployment

This section covers how the maintainer's copy is built and published — it doesn't change anything about running Sakura yourself (see [Overview](#overview): still just an `.html` file you open in a browser, no build step required).

`www.sakura-notes.com` is published by `.github/workflows/deploy.yml`: every push to `main` runs `npm run build` (Vite plus a static-asset passthrough step for `sw.js`, the PWA manifests, and icons — see `scripts/copy-static-assets.mjs`) and publishes the result via GitHub Actions' native Pages deployment. There's no separate `dist/` branch or manual publish step; `index.html`/`hub.html` in the repo are the real source, and CI builds and serves them on every merge. See `docs/architecture-plan.md`'s "Deployment mechanism" section for the full history of how this was verified before being switched on.

## License

All rights reserved — see [LICENSE](LICENSE). Public visibility of this repository does not grant permission to reuse, redistribute, or incorporate any part of it into another work.

Sakura loads three open-source libraries from CDN for optional import/export features — SheetJS (Apache 2.0), mammoth.js (BSD-2-Clause), and PptxGenJS (MIT) — and embeds draw.io/diagrams.net (Apache 2.0) for diagram editing. See [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md) for full attribution.
