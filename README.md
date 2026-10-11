# Sakura — Outliner-Centered Personal Productivity Workspace

Sakura is a single-file, browser-based outliner that's grown into a full personal productivity workspace: notes, plans, and documents live as a nested tree at the center, with tasks, diagrams, remarks, and Q&A woven directly into it via backlinks and cross-references rather than bolted on as separate disconnected tools. It runs entirely client-side and stores its data locally in the browser by default — no install, no build step, no account required. Signing in (optional) syncs everything to your own account so it follows you across devices, and lets you share individual documents with other Sakura accounts. Optional AI features (rewrite, outline generation, and similar) work the same way: opt-in, and call out to an AI provider using a key you supply yourself.

## Contents

- [Overview](#overview)
- [Core Editing](#core-editing)
- [Documents & Tabs](#documents--tabs)
- [Panels](#panels)
- [Hub — To-Dos](#hub--to-dos)
- [Tags, Focus & Backlinks](#tags-focus--backlinks)
- [AI Features](#ai-features)
- [Quick Assist & Quick Insert](#quick-assist--quick-insert)
- [Export & Import (PDF, OPML)](#export--import-pdf-opml)
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
- Lightweight semantic styling via plain-text conventions: `[Section]`, `(note)`, `!alert`, `` `code` ``, a leading `Label: ` (bolds the label), and `SAP Note 12345`/`OSS Note 12345` (auto-links to me.sap.com)
- Fold/unfold subtrees, with a "+N hidden" badge that's clickable to expand
- `#tags` on nodes, `[[@mention]]` backlinks between nodes, and a "Focus" mode to zoom into one branch
- Companion panels per node or per document: rich-text Notes, Code blocks, a Decision Log, plus Q&A, Remarks, and draw.io Diagrams kept inline under the node they belong to
- **To-Dos** — one app-level task list (with subtasks, due dates, priorities, and repeats) shared across your whole workspace, independent of any single document, reachable from one button in the app bar
- Diagrams — add a draw.io diagram to any node (right-click → Add diagram…, or Generate diagram for a rough first draft from that branch); embeds as a real picture in PDF exports
- Optional AI features — rewrite, generate an outline from a topic, restructure pasted text, expand a label into a subtree, suggest tags/icons, summarise a selection, plus dedicated AI actions inside To-Dos and Q&A — either zero-setup via **Sakura Hosted AI** (sign in, no key needed, daily quota) or bring your own key with any of seven built-in providers
- Quick Assist: a combined command bar and search box (plain-English toggles like "hide file explorer," plus search across documents, notes, tags, to-dos, and settings)
- In-document search and a global header search across settings, help, documents, and templates
- Folders and templates in the file explorer, with drag-and-drop filing and nesting
- Export to **PDF** — with a real table of contents, an optional cover page, and your chosen accent color (independently toggleable for consistent branding when sharing) — or to **OPML**; import from OPML. Copy nodes with Ctrl/Cmd+C and paste them into another document or app
- Multiple documents open as independent tabs
- Deep theming: Light/Dark/System/Schedule auto-theme, seven accent colors, five Chrome background presets, and node-text color presets
- Installable as a desktop/mobile app (PWA) in supporting browsers
- Two-tier automatic backup (live file backup + a local safety copy), in addition to manual export/import
- Optional account sign-in (Google or email) syncs documents, folders, templates, and settings across devices, and lets you share individual documents with other Sakura accounts as viewer or editor
- Version History for documents and the To-Dos list — periodic snapshots you can restore from independently of the undo stack

## Core Editing

- **Enter** — new sibling node below; **Shift+Enter** — split the node at the cursor (text after the cursor becomes a new sibling below) — or, if Inline note/remark previews is on (Settings → Layout), adds/focuses an inline note for the node instead; **Ctrl/Cmd+Enter** — new child node
- **Tab / Shift+Tab** — indent / outdent the selected node
- **Drag a row** — drop above/below to reorder, or onto the middle of another row to nest it as a child
- **Right-click a node with children** — sort children A→Z, Z→A, or by depth
- Click the fold arrow to collapse or expand a subtree; when collapsed, the "+N" badge is itself clickable to expand
- Use `[Text]`, `(Text)`, `!Text`, and `` `Text` `` inline for section labels, muted notes, alerts, and inline code
- A node or note starting with `Label: ` (any short word/phrase before the colon) bolds the label — e.g. `Customer: Acme Corp` bolds "Customer:". Starting instead with `Decision Log`, `Context`, `Decision`, `Rationale`, `Alternatives`, `Impact`, or `Status` colors the label to match its Decision Log field, even outside an actual Decision Log entry (toggle via Quick Assist → "Decision log colors", on by default). `SAP Note 12345` or `OSS Note 12345` (a 5–10 digit number) auto-links to that note on me.sap.com
- Hover any node (Settings → Editing → "Node hover toolbar") to reveal quick Menu and Zoom-in buttons next to its bullet, without needing to select it first
- **Checkboxes** — toolbar button (Insert group) or type `[ ] `/`[x] ` at the start of a node while editing (auto-converts on commit). Click the box to check/uncheck; checked nodes show struck-through, dimmed text. A checkbox parent with checkbox children shows a live progress badge (e.g. `2/5`) and auto-checks itself once every child is checked
- `Ctrl/Cmd+Space` opens **Quick Insert** — a small menu for inserting an em dash, en dash, arrow, checkmark, cross mark, middle dot, or date/time without leaving the keyboard. Same menu, same shortcut, in every editable area of the app (nodes, Notes, To-Dos, the title field) — not just while editing a node

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

- **Note** — every node can hold a plain-text note (AI Rewrite/Summarise still work directly on that text — neither needs formatting to operate). A quick, casual place for a comment or aside on a node. Floating and draggable, with a compact popover view and a full-screen mode. Shows a Backlinks section for any node that `@mentions` it, plus created/last-modified timestamps. Open via toolbar, right-click → More → Note, or `Ctrl/Cmd+Shift+N`.
- **Code Block** — every node can hold one plain-text code block (language picker: Plain text, ABAP, SQL, JavaScript, Python, JSON, XML/HTML, Markdown), in the same kind of floating, resizable window as Note. Open via toolbar, right-click → More → Code block, or `Ctrl/Cmd+Shift+K`.
- **Inline Q&A, Remarks, and Diagrams** — three kinds of object that live directly under the node they're about, in the outline itself (there's no separate side panel or list view for them). Each node shows a small dot when it has any; click the dot to show or hide them inline (Settings → Layout → "Always expand inline" flips the default).
  - **Q&A** — right-click a node → "Add question…" adds a question/answer pair under it, edited in place. Right-click the Q&A line for **AI Answer** (drafts an answer for you to review) or Delete.
  - **Remarks** — a record of things people said: right-click a node → "Add remark…" adds a line with who said it (initials avatar + name), the date (defaults to today, click it for a calendar to backdate), and the remark itself, all edited in place. A node's remarks list newest first; right-click one to rewrite it with AI or delete it. Deleting a node with a remark linked to it warns about the orphaned link first.
  - **Diagrams** — right-click a node → "Add diagram…" creates a real draw.io diagram linked to that node and opens it full-screen; it then shows as a preview card (thumbnail + editable title) under the node, which reopens the editor. The editor's header holds the diagram's title, node link, status (Draft/In Progress/Review/Final), a private note, page count, Duplicate, and Delete. Diagrams embed as a real picture in PDF exports. Right-click a node → **Generate diagram** (under "More" by default) builds a rough flowchart from that node's subtree as an editable draw.io diagram linked under it: a review screen first lets you confirm each node's shape/container/sequence classification (Settings → Panels → Diagrams → "Skip review before generating" makes it one click). Layout, structure, and color are deterministic — AI is only optionally used to shorten labels too long to fit. Generating again for the same node offers to regenerate that diagram in place. It's a rough first draft to refine by hand in draw.io, not a finished diagram.
  - Q&A and Remarks are included in PDF exports when their Settings → Export & copy toggles are on (diagrams always are), and in Version History. Older documents may still contain unlinked Q&A rows, remarks, or diagrams (from the since-removed Pad panel's list tabs); they're kept in the document's data, untouched, but have no node to appear under.

## Hub — To-Dos

To-Dos lives at the app level rather than inside any single document — one shared list across your whole workspace, reachable from its single button in the app bar rather than per-document. (Earlier versions also had Meeting Notes, Journal, Library, and Recap panels here; all four were removed to keep the app focused on its core outline workflow — any data they left in browser storage is ignored, not deleted.)

- **To-Dos** (`Ctrl/Cmd+Shift+T`) — one shared task list across your whole workspace, not tied to any document or node. Supports priority, status, and due dates (with a Today/Tomorrow/Next week quick-pick popover), links, drag-to-reorder, quick-find, and an overdue-count badge. Filter by priority, status, and due date at once (Overdue/Today/Due later/No due date), and sort by priority, due date, or manual order. Select multiple open tasks to bulk-set priority/status/due date or bulk-complete/delete, each with its own Undo. Three optional AI capabilities (Settings → AI → To-Dos AI, each independently toggleable): extract action items from the current document or selection, break a task into subtasks, and generate a status summary of open tasks — all add directly to the list with Undo. Typing `#tag` or `@name`/`@date`/`@status` directly in a task's text renders it as a colored chip with autocomplete. A task can either **repeat** (daily, weekdays, or weekly — completing it advances the due date instead of marking it done for good) or hold **sub-tasks** (a nested checklist with an n/m progress badge; the parent completes automatically once every sub-task is checked) — the two are mutually exclusive on the same task. Export the whole list as a PDF; Version History keeps the last 20 snapshots.

On a narrow screen (below 768px), opening this file redirects once, on load, to **hub.html** — a separate, purpose-built mobile page rather than a cut-down view of this one. It covers **To-Dos** (with subtasks) only (AI features, PDF export, and version history all stay desktop-only). There's no app-bar header, bottom navigation, or floating compose pill — the only persistent chrome is a single sticky bar at the top with an inline "Add a task" affordance (tap it, type, Enter to add and keep typing the next one) and account access. The list itself is grouped by urgency — Overdue, Today, Upcoming, No Date, each section only appearing if it has anything in it — so individual rows can stay down to just a checkbox and the task text; due date and status live in a tap-to-open detail sheet instead of crowding every row. Swipe right to complete, swipe left to delete (instant, with a few seconds to Undo via the toast that appears, rather than a confirmation dialog interrupting every delete up front) — the same two-directions-one-gesture swipe Things 3 popularized. **Signing in is required there** — a phone is almost always a different browser from whatever device you last used, and local storage never crosses devices on its own; hub.html reads and writes the same `users/{uid}/meta/todos` document this file's own cloud sync already uses (Google or email sign-in, same account system as here), which is what actually bridges the two. It pulls once on sign-in (newer of cloud/local wins) and pushes after every change — no realtime listener, by design, for a page meant for short sessions rather than being left open for hours. There is no link back to this full editor from hub.html — its sign-in screen says outright that everything else needs a computer, rather than offering an escape hatch to a desktop UI that doesn't actually work well on a phone. The redirect check only runs on initial load, not on resize, so narrowing a desktop window mid-session never yanks the editor away from you.

hub.html has its own web app manifest (`hub-manifest.json`, `display: "standalone"`) separate from the root one this file uses — installing "Add to Home screen" from a phone launches straight into hub.html rather than bouncing through this file's redirect first. That manifest also registers hub.html as a **share target**: on Android (and any OS that honors PWA share targets — not currently iOS Safari), Sakura shows up in the system share sheet from other apps, and sharing a link or selected text creates a new to-do from it. It's GET-based, so it's link/text only, no shared files or images. Anyone who installed the Hub before this was added needs to reinstall it for the share-target registration to take effect.

## Tags, Focus & Backlinks

- **Tags** — select a node and click the tag icon, or right-click → Tags, to open a popover of existing document tags as toggleable chips (type a new name + Enter to add one). Tags render as `#chips` directly on the node row; clicking one filters the whole tree to that tag.
- **Backlinks** — while editing a node, type `@` to reference another node by name from a filtering dropdown. The reference saves as `[[Node name]]`, renders as a clickable link, and shows up in the target node's Note panel under Backlinks. Deleting a referenced node removes its `[[mentions]]` elsewhere automatically.
- **Focus** — right-click a node → Zoom in (or `Ctrl/Cmd+.`, or the toolbar's zoom icon) to show only that node and its descendants, with a breadcrumb trail back to the root. Exit with `Ctrl/Cmd+,` or by clicking the root crumb. Focus state is saved with the document (like fold state) and comes back when you reopen it, including across sessions.

## AI Features

AI features are entirely optional. Pick a mode at Settings → AI → Provider:

- **Sakura Hosted AI (beta)** — sign in (Google or email) and use it immediately, no key to find or paste. Requests go through a small Cloudflare Worker running Sakura's own credentials, capped by a daily per-account quota; the request text passes through that Worker to a third-party provider Sakura selects and isn't stored on either side. See "Data & privacy" below for the full breakdown against the BYOK path.
- **Bring your own key** — one of seven built-in providers (Gemini, Groq, Claude API, ChatGPT, OpenRouter, Cerebras, GitHub Models). Gemini, Groq, OpenRouter, and GitHub Models are free-tier friendly; Claude and ChatGPT require a paid account; Cerebras varies by account and model (its own "free trial" tier is time/credit-limited, not an ongoing free tier the way the others are — expect a payment-required error on some accounts). This is a fixed list; Sakura doesn't support a custom/self-hosted endpoint, since an open-ended one would defeat the point of the Content-Security-Policy allowlist that only these seven origins are on.

Both modes are available side by side in the same dropdown, and every AI feature below shares whichever one is currently active.

- **Rewrite** — the ✦ toolbar button rewrites the selected node (or a batch, if multiple are selected, or just a highlighted portion of text). The rewrite prompt itself is fully customizable in Settings, with a one-click reset to the default grammar-and-spelling-only wording.
- **Auto-rewrite on commit** (off by default) — automatically runs Rewrite on a node as soon as you finish typing it (pastes/drops are excluded). Batches multiple nodes into a single request after a configurable idle pause or queue size, rather than firing one request per node, to avoid burning through rate limits. A status-bar chip shows the live queued/countdown/rewriting state and doubles as its own on/off toggle.
- **Generate outline** (`Ctrl/Cmd+Shift+O`) — describe a topic and get an AI-generated nested outline inserted into the current document (or a new blank one).
- **Restructure text** (`Ctrl/Cmd+Shift+R`) — paste messy or unstructured text (notes, an email, a transcript) and it's organized into a proper outline in a new document, without inventing facts not present in the source.
- **Expand node**, **Suggest tags**, **Suggest icon**, and **Summarise selection into parent** — additional one-click AI actions available from the toolbar's AI group or right-click menu, for breaking a dense label into a subtree, tagging a node from its content, picking a fitting emoji prefix, and rolling up a multi-node selection under a new AI-written parent label, respectively.
- **Provider fallback** — an optional toggle that automatically retries with the next configured provider (in your chosen order) if the active one fails for any reason other than a bad key, which always surfaces directly instead of silently falling back.
- **Usage today** — a local, best-effort request counter per provider, shown in Settings; it's a rough gauge only, not fetched from the provider, and can drift slightly from that provider's own reset clock.

## Quick Assist & Quick Insert

- **Quick Assist** (`Ctrl/Cmd+K` from anywhere, or click the search box in the header/status bar) is a combined command bar and search box. Plain-English commands work directly — "hide file explorer," "toggle dark mode," "hide toolbar" — and toggle/search behavior is rule-based (a fixed phrase list), not AI, so it never improvises and needs no API key. Typing a bare word like "show," "hide," "toggle," or "run" lists everything of that kind; a category prefix ("notes: budget," "settings: dark," "todo: milk") narrows a search to one area — including Q&A, Diagrams, and Remarks individually (`qa:`, `diagram:`, `remark:`). Below commands, a separate **Run** row type covers one-off actions (new document, duplicate node, insert decision log, apply Editor's Choice preset, and the AI actions above) — always undoable, and never anything destructive. Below that, matching documents, node text, notes, tags, Q&A, Diagrams, and Remarks, to-dos, and settings/help topics show up as **Go to** results.
- **Quick Insert** (`Ctrl/Cmd+Space` while actively editing text — anywhere: a node, the title field, a Note, a Code block, a To-Do) opens a small character-insert menu — em dash, en dash, arrow, checkmark, cross mark, middle dot, date/time — configurable in Settings → Editing. Same menu, same shortcut, everywhere; it's deliberately just characters, not a second command bar, so it's never in competition with Quick Assist for the same key. Node-specific actions (Note, Tags, Add question, Rewrite, Version history) live on the right-click menu instead.

## Export & Import (PDF, OPML)

Export ▾ offers two formats, **PDF** and **OPML**; Import ▾ offers **OPML** only. (Earlier versions also exported Word, PowerPoint, Markdown, plain text, and Sakura Document `.sakura.json` files, copied the tree as text or an image from the Export menu, had a separate Print button, and imported Word `.docx` files, Sakura Document files, and pasted text from the Import menu; all of these were removed to keep the app focused on its core outline workflow. Whole-workspace backup/restore under Data & Backup is unaffected.)

- **Export ▾ → PDF** renders the current document headlessly and opens the browser's print dialog — choose "Save as PDF" there. It always renders the full document, regardless of what's folded in the outline editor. Notes, code blocks, linked Q&A and remarks (each toggleable under **Settings → Export & copy**), diagrams, featured tables/charts, and a table of contents (headings and section markers) all carry through. Optional cover page (Settings → Export & copy → "Cover page").
- **Branding** (Settings → Presets & Modes → Preview → "Branding") adds a small attribution mark to the cover page and the bottom-right of every PDF page — off by default, with your own company/team name as an optional override for the default "SAKURA" wordmark.
- PDF exports (documents and the To-Dos list) use your current accent color by default; **Settings → Export & copy → "Use accent color in exports"** turns that off in favor of one fixed color, for consistent branding when the document is going to someone else rather than staying on your own screen.
- **Export ▾ → OPML** saves the outline's structure, text, and (when "Include node Notes & Code in exports" is on) each node's note as an `.opml` file. Unlike PDF it follows **Settings → Export & copy → "Skip folded sections"**, and the Export menu shows a short reminder of that whenever anything is folded.
- The To-Dos panel's own Export menu offers PDF only.
- **Copying nodes** (Ctrl/Cmd+C on selected nodes) puts them on the clipboard as both plain text and rich text — paste back into any Sakura document (diagrams linked to the copied nodes come along) or into another app. The same "Skip folded sections" setting controls whether folded children are included in the copy.
- **Import ▾ → OPML** brings in an `.opml` outline file as a new document. Pasting a tree or text straight into the outline editor still works as ordinary editing.

## Theming & Appearance

- **Light/Dark theme** with an **Auto theme** mode: Off (manual only), System (follows the OS/browser's dark-mode setting live), or Schedule (switches at hours you set). Manually overriding the theme while in System/Schedule mode holds as a temporary override until the automatic value naturally catches up and matches it again.
- **Accent color** — seven presets plus an intensity slider, used for buttons, borders, and highlights (not node text itself). Optionally recolors the mouse cursor itself too (Settings → Appearance → "Accent-colored cursor"), off by default.
- **Chrome background** — five presets (Default, Slate, Sand, Ink, Rose) that recolor the toolbar, file explorer, status bar, app bar, and menus, independent of both the accent color and the Light/Dark theme. The editor/canvas writing surface is untouched by this.
- **Node text color** — four presets (Default, Black, Charcoal, Slate) for node text specifically, separate from both the accent color and Chrome background.
- **Editor's Choice preset** (Settings → Appearance, or Quick Assist → "editor's choice") — one click reconfigures the toolbar, file explorer, hover toolbar, status bar, and app bar into a curated, leaner, writing-focused layout. Doesn't touch accent or node text color. Applying it from Quick Assist gives a one-click Undo that restores every setting it touched.
- Further layout controls: hide tree lines, depth guide lines (faint vertical line per indent level, only visible when tree lines are hidden), row selection style (Fill/Outline/Left bar/Dot), compact rows, text size (85–140%), branch indent width, and collapse depth.
- **Inline note/remark previews** (Settings → Layout, off by default) — shows a node's Note, and any Remarks anchored to it, as their own lines directly underneath the node in the editor tree — clamped to 2 lines when collapsed, expanding while you're actively editing one. Editable right there (including a remark's person/date), so quick text changes are made right there in the outline; the note dot still opens the full Note panel for the Backlinks section, timestamps, and AI Summarise, which inline editing doesn't surface. With this on, `Shift+Enter` while editing a node's text adds/focuses an inline note for it instead of splitting the node (unchanged when the setting is off). Backspace on an empty inline note or remark deletes it and returns you to the node's own text — same as backspacing an empty node. Right-click a note or remark for a small menu (Rewrite with AI, Delete) — deliberately separate from the row's own right-click menu, since node-structure actions like tags don't apply to an annotation. A remark is still rich text, so selecting text inside one brings up the same floating Bold/Italic/Link/Highlight popover rich-text fields use elsewhere; a note is plain text (see Note above), so that popover doesn't apply there.
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
| AI Capabilities | Features | On | Master switch for all AI features; each still needs Sakura Hosted AI (sign in) or a BYOK provider key active |
| Auto-rewrite on commit | AI | Off | See AI Features above; needs a configured API key |
| Provider fallback | AI | Off | Auto-retries with the next configured provider on failure (except a bad key) |
| To-Dos | Features | On | App-level task list; independent of any single document |
| Node hover toolbar | Editing | Off | Menu + Zoom-in buttons on hover, without selecting the node first |
| Focus | Editing | On | Zoom into a branch; can be turned off entirely |
| Auto-backup to file | Data & Backup | Off (not connected) | Chrome/Edge only; see Data & Backup above |
| Local safety copy | Data & Backup | Always on | Automatic; "Restore" button is the only manual action |
| Debug logging | Data & Backup | Off | Rolling in-memory log (last 500 entries) of app events — save, restore, panel, import/export, AI, and more. Uncaught errors are recorded regardless of this setting; the toggle controls the more detailed breadcrumb trail and whether the log viewer is shown. Never includes your note/task/document text, only metadata (node IDs, lengths, which action ran) — useful to turn on when troubleshooting a specific issue, then use "Copy log" to share it |
| Skip folded sections | Data & Backup | On | Collapsed subtrees are left out of OPML export and when copying nodes (Ctrl/Cmd+C); PDF export always renders the full document |
| Use accent color in exports | Data & Backup | On | Off: PDF exports (documents and To-Dos) use one fixed color instead of your live accent, for consistent branding when sharing |

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
| Open/close Note | Ctrl/Cmd+Shift+N |
| Open/close Code block | Ctrl/Cmd+Shift+K |
| Open/close To-Dos | Ctrl/Cmd+Shift+T |
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
- AI features send node/selection text to a third-party provider — with your own key, straight from your browser to the provider you configured (review that provider's own data-handling terms if that matters); with Sakura Hosted AI, through Sakura's own server first, to a provider Sakura selects, using Sakura's credentials (not stored on that server either way — see Settings → About → Privacy & data in-app for the full breakdown). The in-app "Usage today" counter is a local approximation, not an authoritative quota reading, and Sakura Hosted AI is additionally capped by a real daily per-account quota enforced server-side.
- Below 768px, this file redirects to hub.html, which requires signing in (no local-only mode there — see Mobile Hub above for why) and covers To-Dos only — the outliner itself isn't reachable from a phone-sized screen at all. hub.html's sign-in screen points to a computer for all of that instead of offering a non-working link back here. This is an intentional, staged rollout, not a bug, but someone who's never signed in has no mobile Hub access until they do.

## Contributing

After cloning, run `sh scripts/setup-git-identity.sh` once — it sets the correct commit author and enables a pre-commit guard (`.githooks/pre-commit`) that blocks any commit made under a different email. This exists because a placeholder email used in an earlier session turned out to belong to someone else's real GitHub account and got silently listed as a contributor; the guard catches that before it happens again.

Starting a Claude session on this repo (including a fresh session after a usage limit, or from a different Claude account)? Paste `docs/handoff-prompt.md`'s fenced prompt block into the conversation — it has everything needed to pick up work with no other context.

### Deployment

This section covers how the maintainer's copy is built and published — it doesn't change anything about running Sakura yourself (see [Overview](#overview): still just an `.html` file you open in a browser, no build step required).

`www.sakura-notes.com` is published by `.github/workflows/deploy.yml`: every push to `main` runs `npm run build -w sakura-web` (a plain `vite build` — static assets like `sw.js`, both PWA manifests, and icons live in `web/public/`, Vite's own static-passthrough convention, so no custom copy step is needed) and publishes the result via GitHub Actions' native Pages deployment. There's no separate `dist/` branch or manual publish step; `web/index.html`/`web/hub.html` in the repo are the real source, and CI builds and serves them on every merge. See `docs/history/architecture-plan.md`'s "Deployment mechanism" and "Repo hygiene" sections for the full history of how this was verified before being switched on.

## License

All rights reserved — see [LICENSE](LICENSE). Public visibility of this repository does not grant permission to reuse, redistribute, or incorporate any part of it into another work.

Sakura embeds draw.io/diagrams.net (Apache 2.0) for diagram editing. See [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md) for full attribution.
