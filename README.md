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

Sakura is a single `.html` file. Open it in a browser and it runs — no install, no build step, no network dependency for core functionality. All documents, folders, To-Dos, and settings are stored in the browser's local storage, scoped to that exact file.

Key capabilities:

- Nested outline editing with indent/outdent, drag-and-drop reordering and nesting, duplication, and multi-select
- Bold, italic, underline, strike, highlight, and text color formatting per node
- Heading 1–6 per node, applied independent of tree depth, carried through to PDF export
- Lightweight semantic styling via plain-text conventions: `[Section]`, `(note)`, `!alert`, `` `code` ``, a leading `Label: ` (bolds the label), and `SAP Note 12345`/`OSS Note 12345` (auto-links to me.sap.com)
- Fold/unfold subtrees, with a "+N hidden" badge that's clickable to expand
- `#tags` on nodes, `[[@mention]]` backlinks between nodes, and a "Focus" mode to zoom into one branch
- Inline objects per node — Notes, Q&A, Remarks, tables, Images (screenshots, with a built-in markup editor for rectangles, arrows, highlights, and text labels), and draw.io Diagrams — kept directly under the node they belong to
- **To-Dos** — one app-level task list (with subtasks, due dates, priorities, and repeats) shared across your whole workspace, independent of any single document, reachable from one button in the app bar
- Diagrams — add a draw.io diagram to any node (right-click → Add diagram…, or Generate diagram for a rough first draft from that branch); embeds as a real picture in PDF exports
- Optional AI features — generate an outline from a topic, and rewrite nodes, selections, note/remark lines, and To-Do tasks/subtasks (manually or automatically as you type) — either zero-setup via **Sakura Hosted AI** (sign in, no key needed, daily quota) or bring your own key with any of seven built-in providers
- Quick Assist: a combined command bar and search box (plain-English toggles like "hide file explorer," plus search across documents, notes, tags, to-dos, and settings)
- In-document search and a global header search across settings, help, documents, and To-Dos
- Folders in the file explorer, with drag-and-drop filing and nesting
- Export to **PDF** — always the whole document (folded sections, notes, Q&A, and remarks included), with a table of contents, an optional cover page, and your chosen accent color (independently toggleable for consistent branding when sharing) — or to **OPML**; import from OPML. Copy nodes with Ctrl/Cmd+C and paste them into another document or app
- Multiple documents open as independent tabs
- Theming: Light/Dark theme with an optional System auto-theme, and six accent colors
- Zen mode: a fullscreen, distraction-reduced editor that keeps the app bar and status bar in view
- Installable as a desktop/mobile app (PWA) in supporting browsers
- Manual full-data backup to a file (and restore, with one-step undo); signed in, your data also syncs to your account automatically
- Optional account sign-in (Google or email) syncs documents, folders, To-Dos, and settings across devices, and lets you share individual documents with other Sakura accounts as viewer or editor
- Version History for documents and the To-Dos list — periodic snapshots you can restore from independently of the undo stack

## Core Editing

- **Enter** — new sibling node below; **Shift+Enter** — split the node at the cursor (text after the cursor becomes a new sibling below); **Ctrl/Cmd+Enter** — new child node
- **Tab / Shift+Tab** — indent / outdent the selected node
- **Backspace** at the start of a row merges it into the row above; **Delete** at the end of a row pulls the next row up into it. The merged-away row's note, tables, images and tags move onto the row that stays, and any Q&A, remarks, diagrams or to-dos linked to it follow along (one **Undo** splits them apart again)
- **Drag a row** — drop above/below to reorder, or onto the middle of another row to nest it as a child
- **Right-click a node with children** — sort children A→Z, Z→A, or by depth. To sort the whole document's top-level nodes the same three ways, right-click the open document's **tab** — the same tab menu has **Version history** and **Clear all nodes** (asks first; Undo brings everything back)
- **Toolbar** — one fixed bar above the editor, always shown (zen mode hides it), in unlabeled groups: **Undo, Redo · Outdent, Indent · Bold, Italic, Highlight (with its colour picker), Text colour (with its picker), Heading style · Insert ▾ · AI ▾**, where **Insert ▾** holds everything you add to the selected node under four headings — **Basics** (Note, Checkbox, Tags, Date/time), **Marker** (one row of the five marker icons; click the active one to clear it), **Discussion** (Question, Remark) and **Visuals** (Table, Image, Diagram, Generate diagram), with the right-click menu's More section using the same headings, groups and order — and **AI ▾** holds Rewrite node and Generate outline, with **Collapse all + Zoom** as a small pair at the right end. It wraps onto a second row on a narrow window. There's nothing to customise
- **Right-click a node** — marker icons, a quick row (by default Rewrite, Note, Add remark, Add question, Add diagram, Add table), and **More** for everything else. Below the quick row, **More** is kept short: **Add** (child / above / below) and **Move** (up / down) are one row of icons each, like **Sort children**; Duplicate, Zoom in and Collapse/expand follow; anything you can add to a node that isn't already in the quick row sits behind one **Insert ›** flyout (with the toolbar's Basics / Discussion / Visuals headings); then Where used, Tags, Version history and Delete. The quick row is yours to arrange: drag an icon onto another to reorder, right-click an icon to move it, remove it or **Reset quick row**, and hover any More item for its pin button to add it (up to six icons). Your order is saved with your preferences — Insert above/below, Add child, Duplicate, Zoom in, Move up/down, Collapse/expand, Sort children (one compact row of three icons, shown only when the node has children), then things you add (Generate diagram, Add image, Insert date/time), then things you look up (Where used, Tags, Version history), Delete
- **Marker summary** — the editor toolbar's right side shows how many nodes carry each marker (Issue, Follow-up, Parked, Confirmed, N/A) across the whole document, folded branches included; markers nobody used are left out, and the group hides when there are none. Click a count to unfold the branches holding those nodes and filter to them; click it again to clear the filter.
- Click the fold arrow to collapse or expand a subtree; when collapsed, the "+N" badge is itself clickable to expand
- Use `[Text]`, `(Text)`, `!Text`, and `` `Text` `` inline for section labels, muted notes, alerts, and inline code
- A node or note starting with `Label: ` (any short word/phrase before the colon) bolds the label — e.g. `Customer: Acme Corp` bolds "Customer:". `SAP Note 12345` or `OSS Note 12345` (a 5–10 digit number) auto-links to that note on me.sap.com
- Hover a row's tree connector or dot to see when the node was created and last modified
- **Checkboxes** — toolbar Insert ▾ → Checkbox, or type `[ ] `/`[x] ` at the start of a node while editing (auto-converts on commit). Click the box to check/uncheck; checked nodes show struck-through, dimmed text. A checkbox parent with checkbox children shows a live progress badge (e.g. `2/5`) and auto-checks itself once every child is checked
- `Ctrl/Cmd+Space` opens **Quick Insert** — a small menu for inserting an em dash, en dash, arrow, checkmark, cross mark, middle dot, or date/time without leaving the keyboard. Same menu, same shortcut, in every editable area of the app (nodes, inline notes, remarks, Q&A, To-Dos, the title field) — not just while editing a node

## Documents & Tabs

Sakura supports multiple open documents at once, shown as tabs above the toolbar — similar to browser tabs.

- Clicking a document in the file explorer, or the **+** at the end of the tab strip, opens it as a tab
- **Each tab keeps its own undo/redo history, scroll position, and selection independently.** Switching tabs does not reset undo history the way switching documents used to
- **Double-click a tab** to rename it
- The **X icon** on a tab closes the tab only — the document itself is not deleted and remains in the file explorer
- The **dropdown arrow** at the right of the tab strip opens a searchable list of all open tabs (arrow keys + Enter to jump, or click a result) — useful once you have more tabs open than fit on screen
- **"Reopen tabs on launch"** (toggle via Quick Assist — no Settings UI control for this yet) controls whether your previously open tabs come back automatically, or whether each session starts with just one

## Panels

Beyond the text itself, richer content attaches to a node as inline objects shown directly under it in the outline — there are no separate floating or docked panels for them (earlier versions had a side Pad panel, a floating Note/Code panel, Decision Log, Notepad, Mind Map, Files, and Preview/Presenter mode; all were removed to keep the app focused on its core outline workflow).

- **Note** — every node can hold a note, shown inline directly under the node (a small dot marks a node that has one; click it to expand or collapse). Add or edit it via right-click → Note…, the toolbar, or `Ctrl/Cmd+Shift+N`; edit it in place, and right-click a note line to Rewrite it with AI or delete it.
- **Inline Q&A, Remarks, and Diagrams** — three kinds of object that live directly under the node they're about, in the outline itself (there's no separate side panel or list view for them). Each node shows a small dot when it has any; click the dot to show or hide them inline.
  - **Q&A** — right-click a node → "Add question…" adds a question/answer pair under it, edited in place. Right-click the Q&A line to Delete it.
  - **Remarks** — a record of things people said: right-click a node → "Add remark…" adds a line with who said it (initials avatar + name), the date (defaults to today, click it for a calendar to backdate), and the remark itself, all edited in place. A node's remarks list newest first; right-click one to rewrite it with AI or delete it. Deleting a node with a remark linked to it warns about the orphaned link first.
  - **Diagrams** — right-click a node → "Add diagram…" creates a real draw.io diagram linked to that node and opens it full-screen; it then shows as a preview card (thumbnail + editable title) under the node, which reopens the editor. The editor's header holds the diagram's title, node link, status (Draft/In Progress/Review/Final), a private note, page count, Duplicate, and Delete. Diagrams embed as a real picture in PDF exports. Right-click a node → **Generate diagram** (under "More" by default) builds a rough flowchart from that node's subtree as an editable draw.io diagram linked under it: a review screen first lets you confirm each node's shape/container/sequence classification (Settings → Panels → Diagrams → "Skip review before generating" makes it one click). Layout, structure, and color are deterministic; labels too long to fit two lines are truncated at a word boundary with an ellipsis. Generating again for the same node offers to regenerate that diagram in place. It's a rough first draft to refine by hand in draw.io, not a finished diagram.
  - Notes, Q&A, Remarks, diagrams, and images are always included in PDF exports, and in Version History. Older documents may still contain unlinked Q&A rows, remarks, or diagrams (from the since-removed Pad panel's list tabs); they're kept in the document's data, untouched, but have no node to appear under.
- **Tables, charts & Cards** — a node can hold tables directly under it. Right-click a node → **Add table…** opens a small size picker: hover (or use the arrow keys) to choose up to 8 columns × 8 rows — the readout shows "columns × rows" — then click or press **Enter** (**Esc** cancels). The new table has a header row and opens for editing with its first header cell selected, so you can just start typing. Click a table to edit its cells in place; the columns keep their widths while you edit, and **Esc** or a click outside returns to the normal display. Each editing session is a single **Undo** step.
  - **Cell menu** (right-click a cell while editing): Add row above / below, Add column left / right; Move row up / down, Move column left / right; **Sort A → Z / Z → A** by that column — numbers sort by value ("10" after "9", including `%`, currency like `$1,200`, negatives and `(1,234)`), dates by date (`Oct 14`, `14 Oct 2026`, `2026-10-14`), other text naturally, and empty cells always last; **Turn header row on / off** (the first row becomes or stops being the table's header — sorting and moving rows never move a row into or out of the header); **Align column left / center / right** (and back to automatic); Delete row / column / table (undo brings a deleted table back).
  - **Keyboard while editing:** **Tab / Shift+Tab** go to the next / previous cell (wrapping across rows; Tab in the last cell adds a row), **Enter** goes to the cell below (in the last row it adds a row), **Shift+Enter** starts a new line inside the cell, **↑ / ↓** move to the cell above / below when the caret is on the cell's first / last line, **Esc** finishes. Tab never leaves the table while you're editing it.
  - **Paste from a spreadsheet:** copy a range in Excel or Google Sheets and paste it into a table you're editing — it fills the cells starting at the caret and adds rows and columns as needed (one Undo step). Plain text pastes into the cell as usual. Pasting a copied table while a node is selected (not editing a table) adds it to that node as a new table.
  - **Alignment:** a column whose cells are all numbers (amounts, percentages, currency) is right-aligned automatically; set a column's alignment yourself from the cell menu. Alignment looks the same in the outline, while editing, and in the PDF.
  - **Charts & Cards:** right-click a table to feature it as a chart (bar, stacked bar, line, pie, doughnut) or as **Cards** (one stat card per row). A single click leaves a chart or Cards figure as it is; **double-click** it, or use **Edit data** on its right-click menu, to show its underlying table for editing — cells, plus the full cell menu — and it goes back to the chart/Cards, redrawn with the new values, on **Esc** or a click outside.
  - **Chart details:** values can be written the way spreadsheets show them (`$12,400`, `12%`, `1.2k`, `(300)`); the value axis uses round steps with thousands separators (`10,000`, or `1.2M` above a million) and handles negative values. The chart's right-click menu adds **Add title…** (shown above the chart or Cards, also in the PDF) and, for charts, **Chart size ›** — Auto, Small, Medium or Full; Small and Medium keep their text at normal size.
  - **Cards details:** a three-column table can show as Cards with the third column as each card's **change** — `+5`, `-0.4%` or `▲ 8%` shows as a green ▲ or red ▼ (`0` stays neutral; other text shows as written). Cards fill rows evenly (5 cards are 3 + 2, never 4 + 1) and print slightly tighter in the PDF.
  - **Card icons & accents:** right-click a single card → **Card icon ›** (a grid of 25 icons in three groups — General: Time, Date, People, Goal, Done, Risk, Total, Growth, Cost; Systems: System, Architecture, ERP, Webshop, Integrations, API, Cloud, Security, Mobile, Code, Configuration; Logistics: Delivery, Warehouse, Location, Label, Report — names show on hover; or **No icon**) or **Accent colour ›** (Accent, Blue, Green, Orange, Purple, Red, Gray, or **Default** for the automatic colour). Both are picked by hand per card and stay with the card's label when rows are reordered. Chart shapes are grouped the same way under **Chart type ›**.
  - **Chips:** right-click any two-column table → **Show as chips** to show each row as one pill — the first column as a short bold key, the second as its description (e.g. `ZN · Night Distribution`). Works on text-only tables that can't be charted, and carries through to the PDF; **Show as table** switches back. Chips and charts are mutually exclusive.
- **Images** — screenshots and pictures belong to a node as their own objects (`node.images`), not inside its note; a node can hold any number. They show as a compact, wrapping row of thumbnails directly under the node, each with its caption (truncated) beneath, and a small picture dot on the row folds or unfolds them (a folded branch's "+N hidden" badge mentions images inside it).
  - **Adding:** paste a screenshot (`Ctrl/Cmd+V`) while the node is selected, being edited, or its note line has the cursor; drop image files onto the node; or right-click → **Add image…** (under "More" by default; several files at once). Pasting never puts a picture into the note text any more.
  - **Compression:** every newly added image is downscaled to at most 1600px on its long side and saved as WebP at quality 0.8 (JPEG on a white background where the browser can't encode WebP); the original is kept instead only when it needed no downscale and is already smaller. SVGs and animated GIFs are kept byte-for-byte. This keeps documents under the cloud sync's 1MB-per-document limit — a typical retina screenshot drops from several hundred KB to a few tens of KB.
  - **Viewer:** click a thumbnail for the enlarged viewer — the full picture, its caption editable right under it, **←/→** (or the side arrows) to step through that node's images, **Esc** or a click outside to close. Its **Auto / Small / Medium / Full** control sets the image's display size (natural size up to full width, or 35% / 60% / 100% of the available width), used in the viewer and in PDF exports. Delete from the viewer or from a thumbnail's right-click menu (Open, Edit caption…, Move left/right, Delete image); drag a thumbnail onto another to reorder. Every change is undoable.
  - **Carried everywhere a node goes:** undo/redo, autosave, Version History, cloud sync, backup/restore, Duplicate, Backspace/Delete-merging two rows (the absorbed row's images move onto the surviving one, along with its note and tables), and Ctrl/Cmd+C → paste into any Sakura document. PDF exports show each image as a captioned figure under its node at its chosen size; OPML has no place for images, so they're left out of it.
  - **Older documents:** pictures that earlier versions kept inside a note move into the node's images automatically the first time the document is opened, in their original order (the note's text stays exactly as it was; an image's alt text becomes its caption unless it's just a file name). They're moved as-is, never re-compressed. An `<img>` whose source can't be kept (a temporary `blob:` URL, a relative path) is left in the note untouched.
  - **Marking up:** in the viewer, **Mark up** (or `M`) opens a second toolbar for marking up a screenshot without changing the picture itself: **rectangle** outlines, **arrows**, a translucent **highlighter** (a marker-style box at about 35% opacity), and **text labels** (drawn with a contrasting outline so they read on any background). Drag on the picture to draw (mouse, pen, or touch); with the text tool, click where the label goes, type, **Enter** to place it or **Esc** to cancel; double-click a label to edit it (empty it to delete it). The **select** tool picks a mark to drag it elsewhere, nudge it with the arrow keys (Shift for bigger steps), recolour it from the palette, or delete it (**Delete**/**Backspace** or the toolbar's bin). Six fixed colours — red, yellow, green, blue, black, white — chosen to show up on light and dark screenshots. The editor has its own **undo/redo** (`Ctrl/Cmd+Z`, `Ctrl/Cmd+Shift+Z` or `Ctrl/Cmd+Y`, or the toolbar arrows) and **Clear markings** (asks first). Tool keys while marking: `V` select, `R` rectangle, `A` arrow, `H` highlighter, `T` text. **Esc** steps back one level at a time — cancels a drag, drops the selection, leaves marking mode, then closes the viewer — and the arrow keys never jump to another image while you're marking. Once you're done, the whole marking session on an image is a single step in the document's own undo (`Ctrl/Cmd+Z` in the outline).
  - Marks are stored as shapes alongside the image (`annotations`), with positions relative to the picture's own size, so they stay exactly in place at any display size (Auto/Small/Medium/Full, any window width). They show in the viewer, scaled down on the thumbnails, and over the picture in PDF exports; they travel with the image through undo, Version History, sync, backup, Duplicate, and copy/paste. In a document shared with you as view-only, marks are shown but can't be changed.
  - Images are stored in the document itself (no external storage).

## Hub — To-Dos

To-Dos lives at the app level rather than inside any single document — one shared list across your whole workspace, reachable from its single button in the app bar rather than per-document. (Earlier versions also had Meeting Notes, Journal, Library, and Recap panels here; all four were removed to keep the app focused on its core outline workflow — any data they left in browser storage is ignored, not deleted.)

- **To-Dos** (`Ctrl/Cmd+Shift+T`) — one shared task list across your whole workspace, not tied to any document or node. Supports priority, status, and due dates (with a Today/Tomorrow/Next week quick-pick popover), links, drag-to-reorder, quick-find, and an overdue-count badge. Filter by priority, status, and due date at once (Overdue/Today/Due later/No due date), and sort by priority, due date, or manual order. Select multiple open tasks to bulk-set priority/status/due date or bulk-complete/delete, each with its own Undo. Each task and sub-task has a Rewrite with AI button (when AI Capabilities is on). Typing `#tag` or `@name`/`@date`/`@status` directly in a task's text renders it as a colored chip with autocomplete. A task can either **repeat** (daily, weekdays, or weekly — completing it advances the due date instead of marking it done for good) or hold **sub-tasks** (a nested checklist with an n/m progress badge; the parent completes automatically once every sub-task is checked) — the two are mutually exclusive on the same task. Export the whole list as a PDF; Version History keeps the last 20 snapshots.
  - **Panel layout:** the header shows the title and open count, then **Search**, **Sort and filter** (one menu: sort order plus priority/status/due filters) and **⋯** (Version history, Export as PDF, Select or reorder tasks), then Maximize/Close. **Add a task** is a quiet row just below the header — click it, or press **N** while the panel has focus (outside a text field). Open tasks show as light cards with priority, status, due date and subtask progress as one row of pills; open subtasks are listed first and completed ones fold behind **N completed ›** (shown muted, not struck through, when unfolded).

On a narrow screen (below 768px), opening this file redirects once, on load, to **hub.html** — a separate, purpose-built mobile page rather than a cut-down view of this one. It covers **To-Dos** (with subtasks) only (AI features, PDF export, and version history all stay desktop-only). There's no app-bar header, bottom navigation, or floating compose pill — the only persistent chrome is a single sticky bar at the top with an inline "Add a task" affordance (tap it, type, Enter to add and keep typing the next one) and account access. The list itself is grouped by urgency — Overdue, Today, Upcoming, No Date, each section only appearing if it has anything in it — so individual rows can stay down to just a checkbox and the task text; due date and status live in a tap-to-open detail sheet instead of crowding every row. Swipe right to complete, swipe left to delete (instant, with a few seconds to Undo via the toast that appears, rather than a confirmation dialog interrupting every delete up front) — the same two-directions-one-gesture swipe Things 3 popularized. **Signing in is required there** — a phone is almost always a different browser from whatever device you last used, and local storage never crosses devices on its own; hub.html reads and writes the same `users/{uid}/meta/todos` document this file's own cloud sync already uses (Google or email sign-in, same account system as here), which is what actually bridges the two. It pulls once on sign-in (newer of cloud/local wins) and pushes after every change — no realtime listener, by design, for a page meant for short sessions rather than being left open for hours. There is no link back to this full editor from hub.html — its sign-in screen says outright that everything else needs a computer, rather than offering an escape hatch to a desktop UI that doesn't actually work well on a phone. The redirect check only runs on initial load, not on resize, so narrowing a desktop window mid-session never yanks the editor away from you.

hub.html has its own web app manifest (`hub-manifest.json`, `display: "standalone"`) separate from the root one this file uses — installing "Add to Home screen" from a phone launches straight into hub.html rather than bouncing through this file's redirect first. That manifest also registers hub.html as a **share target**: on Android (and any OS that honors PWA share targets — not currently iOS Safari), Sakura shows up in the system share sheet from other apps, and sharing a link or selected text creates a new to-do from it. It's GET-based, so it's link/text only, no shared files or images. Anyone who installed the Hub before this was added needs to reinstall it for the share-target registration to take effect.

## Tags, Focus & Backlinks

- **Tags** — select a node and click the tag icon, or right-click → Tags, to open a popover of existing document tags as toggleable chips (type a new name + Enter to add one). Tags render as `#chips` directly on the node row; clicking one filters the whole tree to that tag.
- **Backlinks** — while editing a node, type `@` to reference another node by name from a filtering dropdown. The reference saves as `[[Node name]]`, renders as a clickable link, and the target node's right-click → "Where used…" lists every node that mentions it. Deleting a referenced node removes its `[[mentions]]` elsewhere automatically.
- **Focus** — right-click a node → Zoom in (or `Ctrl/Cmd+.`, or the toolbar's zoom icon) to show only that node and its descendants, with a breadcrumb trail back to the root. The zoomed node itself stays visible as the first row, so its own dots and inline objects (notes, tables, diagrams, images) can still be opened and closed. Exit with `Ctrl/Cmd+,` or by clicking the root crumb. Focus state is saved with the document (like fold state) and comes back when you reopen it, including across sessions.

## AI Features

AI features are entirely optional. Pick a mode at Settings → AI → Provider:

- **Sakura Hosted AI (beta)** — sign in (Google or email) and use it immediately, no key to find or paste. Requests go through a small Cloudflare Worker running Sakura's own credentials, capped by a daily per-account quota; the request text passes through that Worker to a third-party provider Sakura selects and isn't stored on either side. See "Data & privacy" below for the full breakdown against the BYOK path.
- **Bring your own key** — one of seven built-in providers (Gemini, Groq, Claude API, ChatGPT, OpenRouter, Cerebras, GitHub Models). Gemini, Groq, OpenRouter, and GitHub Models are free-tier friendly; Claude and ChatGPT require a paid account; Cerebras varies by account and model (its own "free trial" tier is time/credit-limited, not an ongoing free tier the way the others are — expect a payment-required error on some accounts). This is a fixed list; Sakura doesn't support a custom/self-hosted endpoint, since an open-ended one would defeat the point of the Content-Security-Policy allowlist that only these seven origins are on.

Both modes are available side by side in the same dropdown, and every AI feature below shares whichever one is currently active.

- **Rewrite** — toolbar AI ▾ → Rewrite node rewrites the selected node (or a batch, if multiple are selected, or just a highlighted portion of text). There's no whole-document rewrite. Right-click a note or remark line for its own Rewrite with AI, and each To-Do task/sub-task has one too. The rewrite prompt itself is fully customizable in Settings, with a one-click reset to the default grammar-and-spelling-only wording.
- **Auto-rewrite on commit** (off by default) — automatically runs Rewrite on a node as soon as you finish typing it (pastes/drops are excluded). Batches nodes into a single request after two minutes without further edits or once five are queued, rather than firing one request per node, to avoid burning through rate limits. Nodes under five words, checkbox items, headings, and text with `[[backlinks]]` or `` `code` `` are left alone. The only setting is the on/off switch. A status-bar chip shows the live queued/countdown/rewriting state and doubles as its own on/off toggle.
- **Generate outline** (`Ctrl/Cmd+Shift+O`) — describe a topic and get an AI-generated nested outline inserted into the current document (or a new blank one).
- **Provider fallback** — an optional toggle that automatically retries with the next configured provider (in your chosen order) if the active one fails for any reason other than a bad key, which always surfaces directly instead of silently falling back.
- **Usage today** — a local, best-effort request counter per provider, shown in Settings; it's a rough gauge only, not fetched from the provider, and can drift slightly from that provider's own reset clock.

## Quick Assist & Quick Insert

- **Quick Assist** (`Ctrl/Cmd+K` from anywhere, or click the search box in the header/status bar) is a combined command bar and search box. Plain-English commands work directly — "hide file explorer," "toggle dark mode," "toggle zen mode" — and toggle/search behavior is rule-based (a fixed phrase list), not AI, so it never improvises and needs no API key. Typing a bare word like "show," "hide," "toggle," or "run" lists everything of that kind; a category prefix ("notes: budget," "settings: dark," "todo: milk") narrows a search to one area — including Q&A, Diagrams, and Remarks individually (`qa:`, `diagram:`, `remark:`). Below commands, a separate **Run** row type covers one-off actions (new document, duplicate node, and the AI actions above: rewrite this node, generate outline) — always undoable, and never anything destructive. Below that, matching documents, node text, notes, tags, Q&A, Diagrams, and Remarks, to-dos, and settings/help topics show up as **Go to** results.
- **Quick Insert** (`Ctrl/Cmd+Space` while actively editing text — anywhere: a node, the title field, a note, a remark, a To-Do) opens a small labeled list of characters to insert — em dash, en dash, arrow, checkmark, cross mark, middle dot, date/time — which of them appear is configurable in Settings → Editing. Same menu, same shortcut, everywhere; it's deliberately just characters, not a second command bar, so it's never in competition with Quick Assist for the same key. Node-specific actions (Note, Tags, Add question, Rewrite, Version history) live on the right-click menu instead.

## Export & Import (PDF, OPML)

Export ▾ offers two formats, **PDF** and **OPML**; Import ▾ offers **OPML** only. (Earlier versions also exported Word, PowerPoint, Markdown, plain text, and Sakura Document `.sakura.json` files, copied the tree as text or an image from the Export menu, had a separate Print button, and imported Word `.docx` files, Sakura Document files, and pasted text from the Import menu; all of these were removed to keep the app focused on its core outline workflow. Whole-workspace backup/restore under Data & Backup is unaffected.)

- **Export ▾ → PDF** renders the current document headlessly and opens the browser's print dialog — choose "Save as PDF" there. It always renders the full document: folded sections, notes, linked Q&A and remarks, diagrams, images (with captions, at each image's chosen display size), and featured tables/charts all carry through (a table that runs over several pages repeats its header row on each one and never splits a row), with a Contents page (headings up to level 2 and section markers — a section like `[Release 2.4] Plan` shows as "Release 2.4 · Plan", each entry with a dotted leader and its page number, and clickable in the saved PDF) and a footer with the export date and page numbers on every page. Paper size is A4, or US Letter where that is the local default (US, Canada, Mexico, Philippines). A document with fewer than two sections or headings gets no Contents page. Optional cover page (Settings → Data & backup → Export & copy → "Cover page"); it carries no footer and isn't counted, so numbering starts at 1 on the Contents page.
- **PDF branding** (Settings → Data & backup → Export & copy) adds a small attribution mark to the cover page and the bottom-right of every PDF page — on by default, with your own company/team name as an optional override for the default "SAKURA" wordmark ("PDF branding text").
- PDF exports (documents and the To-Dos list) use your current accent color by default; **Settings → Export & copy → "Use accent color in exports"** turns that off in favor of one fixed color, for consistent branding when the document is going to someone else rather than staying on your own screen.
- **Status stamp on PDFs:** when the document has a status (Draft, Review, Approved, Rejected), the exported PDF carries it as a coloured rubber-stamp mark on the cover page — or on the title block when the cover page is turned off. The in-app status pill never reaches someone reading the PDF. No status, no stamp.
- **PDF markers and footer:** markers print as their icon plus name (Follow-up, Issue, Parked, Confirmed, N/A), since a printed page has no hover tip. Every page after the cover shows in its footer the document title and status on the left, the page number in the centre, and the export date on the right; the branding wordmark appears on the cover page only.
- **Export ▾ → OPML** saves the outline's structure, text, and each node's note (as an `_note` attribute) as an `.opml` file — always including folded sections. Images aren't part of OPML and are left out.
- The To-Dos panel exports to PDF only (⋯ → Export as PDF).
- **Copying nodes** (Ctrl/Cmd+C on selected nodes) puts them on the clipboard as both plain text and rich text — paste back into any Sakura document (the copied nodes' images and linked diagrams come along) or into another app. Folded children are always included in the copy.
- **Import ▾ → OPML** brings in an `.opml` outline file as a new document. Pasting a tree or text straight into the outline editor still works as ordinary editing.

## Theming & Appearance

- **Light/Dark theme** with an **Auto theme** mode: Off (manual only) or System (follows the OS/browser's dark-mode setting live). Manually overriding the theme while in System mode holds as a temporary override until the automatic value naturally catches up and matches it again.
- **Accent color** — six presets (Terracotta, the default, plus Teal, Indigo, Violet, Moss, and Amber), used for buttons, borders, and highlights (not node text itself).
- **Zen mode** (`Ctrl/Cmd+Shift+E`, or the maximize button by the editor) gives the outline the whole screen and always switches the browser to fullscreen; exiting fullscreen (Esc, F11, the browser's control) exits Zen too. Zen hides the toolbar, the tab bar and the file explorer (the file explorer's own toggle still works while in Zen); the app bar and status bar always stay visible.
- **Status bar, app bar and tab bar** are always shown (outside Zen, for the tab bar). The status bar shows word count and current depth, saved status, the Secure Storage lock chip while locked, the auto-rewrite chip while auto-rewrite is on, and Quick Assist when docked there. None of them are customisable.
- **Text size** (Settings → Appearance, 85–140%). Hovering a row's dot always shows its created/modified times, long lines always wrap, and notes/remarks/Q&A always start collapsed under their dot.
- Notes, remarks, and Q&A each show as a small dot next to their node; click a dot to expand that item as its own editable line(s) directly underneath the node. Right-click a note or remark line for a small menu (Rewrite with AI, Delete).

## Installing as an App (PWA)

Sakura can be installed as a standalone app (its own window, taskbar/dock icon, no browser chrome) via a bundled web app manifest (`display: "standalone"`) and service worker. Look for an install icon in the address bar (desktop Chrome/Edge) or "Add to Home screen" (mobile Chrome). Once installed and open, the app window's title bar color follows your in-app Light/Dark theme live.

The manifest's own `background_color`/`theme_color` (used for the brief install splash screen, and on Android the task-switcher card color) are a fixed warm off-white (`#f8f8f6`) matching the light theme — read by the OS/browser shell before any of the app's own code runs, so it can't follow a Dark-theme preference the way the live title bar does; the actual app window corrects to your real theme immediately after the splash.

The install icon itself is genuinely transparent (real alpha, not a flattened opaque square) so it renders correctly on any OS background — a dark taskbar, a colored tile — rather than showing as a flat square with wasted padding. A separate maskable variant is included for platforms (Android, some Windows contexts) that apply their own adaptive-icon crop shape on top.

## Account, Sync & Sharing

Signing in (Google or email, from the account button top-right) is entirely optional — everything above keeps working fully offline and locally without it. Signing in does two things:

- **Sync** — your documents, folders, To-Dos, and settings sync to your account and follow you to another browser or device (newer-wins per item, not a field-level merge). A status-bar dot shows sync health. While signed in, this sync is your live, continuous off-device copy — there's nothing extra to set up.
- **Sharing** — share an individual document with another Sakura account as **Can view** or **Can edit**. A "Share" chip appears under a document's title once you're signed in; type a name or email to search (only accounts with **Profile visibility** set to Public, Settings → Account, Private by default, show up in results), pick a role, and click a result to share immediately. Documents shared with you appear in a **Shared** section in the file explorer, alongside who shared them and your access level. A bell icon next to the account button notifies you when someone shares something with you.

Sharing is deliberately simple in this version: access is per-document, not per-folder; a shared document opens as a normal tab but doesn't persist across a page reload the way your own documents do (reopen it from the Shared section); and there's no live co-editing — two people editing the same shared document at once still follow the same newer-wins sync model as your own devices do, not real-time collaboration.

## Data & Backup

Everything is stored locally in the browser, scoped to this exact file. Opening a different copy or a newer version of the file starts with empty storage — this is a browser limitation (local storage is partitioned per file URL), not a bug.

How your data is protected depends on whether you're signed in:

- **Signed in — automatic.** Your documents, folders, To-Dos, and settings sync to your account continuously (see [Account, Sync & Sharing](#account-sync--sharing) above). That is a live, off-device copy with nothing to configure.
- **Signed out — manual.** Everything lives only in this browser until you back it up yourself:
  - **Backup all data** (Settings → Data) saves everything — documents, folders, To-Dos, settings, and AI provider keys (encrypted if Secure Storage is on, plain text otherwise; handle the file like a password) — to a single downloadable JSON file. It's the only copy outside the browser, and the only reliable way to move *all* your data between different files, browsers, or computers.
  - **Restore from backup** (Settings → Data) reads one back and **replaces the entire app's contents** with the file's. For handing a single document to someone else, use the account-based **Share** chip under the title instead. Both live only in Settings, not as one-click shortcuts — Restore replaces everything, so it's worth the extra clicks. Restoring while signed in is guarded against overwriting newer synced work: the next sync pull reconciles against your account before anything local gets pushed back up. Backup files from older versions restore fine; settings for features that no longer exist are simply ignored.
  - **Undo last restore** (Settings → Data, appears only once you've restored) — every Restore first snapshots whatever's currently in the app, so this reverses the most recent restore if the file you picked turns out to have been the wrong one.

**Secure Storage** (Settings → Data) optionally encrypts your AI provider keys at rest with a passphrase only you know — in this browser and in backup files. Once set up, a status-bar chip appears while it's locked and a saved key for your active BYOK provider needs it; click to unlock. On Sakura Hosted AI the chip stays hidden — saved fallback keys only matter if a hosted call fails, so Sakura asks for the passphrase at that moment instead.

(Earlier versions also offered Cloud Backup to GitHub Gist / Google Drive, Auto-backup to a file on disk with Backup history, an automatic Local safety copy, a "Remind me to back up" status-bar chip, and a "Warn if this session isn't backed up" close-tab prompt. These were removed to keep backup simple: sign in for automatic sync, or back up manually.)

**Recommended workflow when moving to a new copy of this file:** Backup all data from the old copy, open the new copy, then Restore immediately.

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
| Auto theme | Appearance | Off | Off / System — see Theming & Appearance above |
| AI Capabilities | AI | On | Master switch for all AI features; each still needs Sakura Hosted AI (sign in) or a BYOK provider key active |
| Auto-rewrite on commit | AI | Off | See AI Features above; needs a configured API key |
| Provider fallback | AI | Off | Auto-retries with the next configured provider on failure (except a bad key) |
| Focus | Editing | On | Zoom into a branch; can be turned off entirely |
| PDF branding | Data & Backup → Export & copy | On | Small mark on the PDF cover page and every page's corner; optional custom text |
| Use accent color in exports | Data & Backup | On | Off: PDF exports (documents and To-Dos) use one fixed color instead of your live accent, for consistent branding when sharing |

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
| Collapse all / Expand all | Ctrl/Cmd+Alt+C |
| Zoom into branch (Focus) / Exit | Ctrl/Cmd+. / Ctrl/Cmd+, |
| Search this document / Search & replace | Ctrl/Cmd+F / Ctrl/Cmd+H |
| Quick Assist (command + search) | Ctrl/Cmd+K |
| Quick Insert (character insert, while editing text) | Ctrl/Cmd+Space |
| Add/edit note | Ctrl/Cmd+Shift+N |
| Insert date/time | Ctrl/Cmd+Shift+D |
| Open/close To-Dos | Ctrl/Cmd+Shift+T |
| Generate outline (AI) | Ctrl/Cmd+Shift+O |
| Zen mode | Ctrl/Cmd+Shift+E |
| Save now | Ctrl/Cmd+S |
| New document / Close tab | Ctrl/Cmd+Alt+N / Ctrl/Cmd+Alt+W |
| Copy selected nodes | Ctrl/Cmd+C |
| Select all | Ctrl/Cmd+A |
| Undo / Redo | Ctrl/Cmd+Z / Ctrl/Cmd+Y |

If a shortcut is intercepted by the OS or browser before it reaches the page (notably `Ctrl/Cmd+Space` for Quick Insert, which can conflict with macOS Spotlight), the equivalent toolbar button or menu item works as a fallback, and conflicting shortcuts can be remapped in Settings → Keyboard Shortcuts.

## Browser Support

Sakura works in any modern browser. One feature is the exception:

- **Installing as an app (PWA)** depends on the browser's own install support — Chrome and Edge on desktop, and Chrome on mobile ("Add to Home screen"), are the most consistently supported. Safari and Firefox have more limited or absent PWA install support; the app still works normally as a regular browser tab either way.

## Known Limitations

- Storage is scoped per file URL. A renamed, moved, or re-downloaded copy of this file starts with empty storage — Backup all data / Restore is the way to carry data across.
- Signed out, nothing backs your data up automatically: take an occasional Backup all data, since browser storage alone can be cleared.
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
