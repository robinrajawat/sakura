# Mobile plan: one app, a limited phone layout

**Status:** approved (2026-11-13). Phases 0–5 done (phase 3 awaits a real-device check); faster first load step 1 (minified build) done. Owner direction: follow standard practice. One
app serves every screen size; the phone gets a deliberately **limited** set of features; and
**nothing on the desktop changes or breaks**. Each phase below is its own PR, in order.

## Why

Today a screen narrower than 768px is redirected on load to `hub.html`, a separate 5,000-line
page with its own To-Dos and a read-only document reader. That is the old "m-dot site" pattern
that standard apps have dropped (Notion, Google Docs, Linear and Todoist on the web all serve one
app that adapts). Two editors drift apart in features and bugs, every shared feature is built
twice (table snapshots, diagram previews and the reader's sanitizer exist only because the phone
can't run the real renderer), and the phone can't edit at all.

The standard is **one codebase and one URL, with the layout adapting to the screen**. Standard apps
also keep the phone feature set small. "One app" does not mean "every feature on a phone".

## Ground rules (these decide every phase)

1. **The desktop is untouched.** All phone styles live inside one breakpoint,
   `@media screen and (max-width: 767.98px)`, in their own file (`src/styles/index/phone.css`). All
   phone-only behaviour is gated on one flag, `isPhoneLayout()` (a `matchMedia` on the same
   query, also set as `html.phone`). No desktop rule, handler or default changes. If a phase
   needs to touch shared code, the desktop behaviour must be the same, and its tests prove it.
   New phone-only elements (a button, a backdrop) carry the `hidden` attribute and get no
   class that sets `display`, and `phone-layout-switch.spec.ts` checks each one is hidden on the
   desktop: the pixel guard can't see new markup, which shows with or without `phone.css`.
2. **Pick features by width, not by browser.** No user-agent sniffing. A narrow desktop window
   gets the phone layout too, which is the standard behaviour and also makes it easy to test.
3. **Limit features by hiding them, never by forking them.** A feature the phone doesn't offer
   is hidden in `phone.css` or skipped behind `isPhoneLayout()`. There is never a second copy
   of it.
4. **One data path.** The phone uses the same sync, safe writes, conflict handling and version
   history as the desktop. Nothing phone-specific touches Firestore.
5. **Behind a switch until it's ready.** The `hub.html` redirect stays until phase 5. Before
   then the new layout is reached with `?layout=phone` or a narrow desktop window, so nothing
   changes for real phone users mid-build.

## What the phone offers

| Area | Phone | Notes |
|---|---|---|
| Documents list, folders, search | ✅ | The sidebar becomes a slide-in drawer |
| Reading a document | ✅ | Folding, open-items summary, links, pictures |
| Editing rows | ✅ light | Type, Enter for a new row, Backspace to merge or delete, checkbox, indent/outdent, move up/down |
| Row notes | ✅ | Plain text editing. Rich formatting stays desktop-only |
| Tables, charts, cards, timelines | 👁 view | Real renderer, scroll sideways. Editing on desktop |
| Diagrams | 👁 view | Tap for full screen with pinch zoom |
| Threads (questions, decisions) | 👁 view, + reply | Replying is a short text box |
| To-Dos | ✅ | What `hub.html` has today: sections, detail sheet, swipe to complete or delete |
| New document, rename, move to Trash | ✅ | |
| Download PDF, share a copy | ✅ | The server PDF already works on phones |
| Account, theme, sign in/out, feedback | ✅ | Settings shrink to these on a phone |
| Version history | 👁 view and restore | Restore is one button, so it's safe on a phone |
| AI features, auto-rewrite, templates | ❌ | Hidden |
| Drag and drop, multi-select, keyboard shortcuts, right-click menus | ❌ | Long-press opens a short row menu instead |
| Import, export, backup files, data settings | ❌ | Desktop only |
| Table, chart and diagram editors, picture mark-up | ❌ | Desktop only |
| Guided tour, welcome landing | Phone version | A one-screen intro, no tour |

Guests: the phone works without an account like the desktop does (try first, sign in to sync).
`hub.html` required sign-in only because it had no local editor. That reason goes away.

## Phases

### Phase 0: safety net (no visible change). Done 2026-11-13

- **Desktop guard** (`tests/e2e/desktop-unchanged.spec.ts`): five desktop screens (editor with a
  rich document, sidebar closed, Settings, the Share menu, To-Dos) at 1280, 800 and 768px. Each
  is photographed as shipped and again with the phone stylesheet switched off, in the same page
  with its clock paused, and the pixels must be identical. Comparing within one run instead of
  against stored images keeps it exact on any machine. A one-rule leak into the phone
  stylesheet fails it (checked by hand).
- **CSS guard** (`tests/unit/phoneCss.test.ts`): every rule in `src/styles/index/phone.css` must
  sit inside the phone `@media` query.
- **The switch** (`src/ui/phoneLayout.ts`, generated block `phoneLayout`): `PHONE_LAYOUT_QUERY`,
  `isPhoneLayout()` and `html.phone`, set in the first `<head>` script before the first paint
  and kept in step when the window is resized across 768px. `phone.css` is its own
  `<style id="sakura-phone-css">`, last in `<head>`, through the `css-phone` block.
  `tests/e2e/phone-layout-switch.spec.ts` checks 1280, 1024, 800 and 768px are never the phone
  layout, and 767px is.
- **Preview**: `index.html?layout=phone` skips the `hub.html` redirect on a phone. Without it a
  phone still goes to `hub.html`.
- **Phone test project**: `playwright.config.ts` now has `desktop` (everything as before),
  `phone-ios` (iPhone 13) and `phone-android` (Pixel 7). The phone projects run only
  `*.phone.spec.ts`. Both phone projects use Chromium, the one browser CI installs, so real iOS
  Safari still needs a device (phase 3).
- **Measured** (production build, Pixel 7 profile, CPU slowed 4×, our own code only, three runs):

  | | Size (gzip) | Page ready (load event) | First paint |
  |---|---|---|---|
  | `index.html` | 700 KB | 1.0–1.2 s | 0.3–0.4 s |
  | `hub.html` | 81 KB | 0.2–0.3 s | 0.1 s |

  Downloading adds roughly 3.5 s for `index.html` on a slow connection (about 1.6 Mbps)
  against 0.4 s for `hub.html`. The service worker caches the app, so this is a first-visit
  cost. Later visits pay only the ~1 s start-up. **Verdict:** repeat visits are within the 3 s
  budget, but a first visit on a slow phone connection is not. Before phase 5, the heavy,
  phone-hidden parts (the AI code, the diagram, chart and table editors, templates, and the
  vendored libraries only they use) must load on demand rather than with the page.

### Phase 1: layout shell. Done 2026-11-13

- **Drawer.** The side rail and the File Explorer are one drawer, closed by default, opened by
  ☰ at the start of the top line (`#phone-menu-btn`). A tap beside it, Escape, the rail's
  Documents button or opening a document closes it (`src/ui/phoneDrawer.ts`,
  `html.phone-drawer-open`). It is never remembered and never changes the desktop's own
  sidebar setting (`sakura_sidebar_open`). The rail slides with `left`, not a transform,
  because Settings, Help and the account and notification menus live inside it as
  `position: fixed`.
- **Top line:** ☰, where you are and the save state, then Share and Help. **Editor:** full width,
  with 16px sides.
- **Full screen:** Settings, Help and To-Dos. To-Dos gets a back button on a phone
  (`#todos-phone-back`). Opening Settings or To-Dos from the drawer closes the drawer. Search,
  the account menu and notifications sit over the open drawer: the search box runs along the
  top and the menus are sheets along the bottom.
- **Hidden on a phone:** the status bar, the focus-mode button, hover tooltips, Settings → AI,
  Shortcuts and Data & backup (also left out of search results), and Help's tour and shortcut
  sheet. The Share menu and Version history already fit as they are.
- **PDFs unchanged.** The phone query is `screen and (max-width: 767.98px)`, so it never applies
  to a printout or PDF: a page's printable width can be under 768px.
  `phone-pdf-same.spec.ts` exports the same document on a phone and on a computer and requires
  identical print renders at 700px (it fails if `screen` is dropped and a phone rule reaches
  the document).
- Tests: `phone-shell.phone.spec.ts` (no sideways scroll at 360px, drawer, opening a document,
  Settings, search, Help, To-Dos, account sheet) on both phone profiles,
  `phone-layout-switch.spec.ts` (no ☰, backdrop or back button on the desktop; the rail's
  Documents button still toggles the File Explorer), `phoneDrawer.test.ts`, and the desktop
  guard.

### Phase 2: reading. Done 2026-11-13

- **Tap targets.** Fold dots and a row's object icons (note, table, picture, diagram, thread)
  are 40px targets around the same small dot or icon, so rows don't move. Tapping a parent's dot
  folds and unfolds it, as on the computer.
- **Tables.** They already scroll sideways inside their own box (`.pv-table-figure`), never the
  page. A phone adds soft shadows at the edges that have more columns (the usual cue, since
  phones hide scrollbars).
- **Pictures and diagrams** open full screen and view-only. Mark up, Delete, Edit and renaming
  are hidden, and so is the keyboard-and-mouse hint. Both viewers now take a two-finger pinch
  (zoom around the fingers, pan as they move) and a double-tap (closer look, then back to fit).
  The math is in `src/ui/pinchZoom.ts`. It is touch-only, so the desktop's mouse, trackpad and
  double-click are unchanged.
- **Diagram editing.** A diagram is never opened in the editor on a phone. A diagram without a
  picture says to open it on a computer.
- Ready-made table snapshots and diagram previews aren't needed by this page: it runs the real
  renderer. They are removed with hub.html in phase 5.
- Tests: `phone-reading.phone.spec.ts` (40px fold target that folds, table scrolling, both
  viewers full screen and view-only, a real two-finger pinch through Chrome's touch input,
  double-tap, no diagram editor) and `pinchZoom.test.ts`.

### Phase 3: light editing by touch. Built 2026-11-13; real-device check pending

- **Typing.** Tapping a row edits it through the same `contenteditable` row and `saveToStorage`
  path as the desktop, so Enter, Backspace, undo, sync and conflicts all behave as there.
- **Row toolbar** (`#phone-edit-bar`), shown only while a row is being typed in: outdent, indent,
  checkbox, move up, move down, Done. It sits on top of the on-screen keyboard: its bottom
  follows `visualViewport` (`keyboardInset`). A press on it never takes focus from the row, so
  the keyboard stays up, and each action re-opens the same row at the same caret position.
- **Long-press a row** (500ms, still to within 10px; `createLongPress`) for a bottom sheet
  (`#phone-row-menu`): Add a row below, Add or Edit a note, Checkbox, Heading H1/H2/H3, Delete.
  It calls the desktop's own actions (`runQuickAction`, `applyHeadingOption`). Android's
  long-press `contextmenu` is swallowed on a phone, so the desktop menu never opens there. The
  plan's "copy link" was dropped: the desktop has no row-link copy to reuse. Row labels turn off
  the system's own long-press callout and text selection (a row being typed in keeps both).
- Conflicts behave exactly as on desktop: the other device's copy wins, and this one's edits go
  to Version history.
- Tests: `phone-editing.phone.spec.ts` (toolbar shows only while typing and sits at the bottom;
  each action keeps the row in edit with the focus never leaving it; a long-press through
  Chrome's touch input opens the menu without also starting to type; each menu action; a tap
  beside the sheet closes it; no desktop menu), `phoneEditing.test.ts`, and a desktop check that
  neither the toolbar nor the menu ever shows.
- **Still to check on a real iPhone and Android phone** (emulation has no on-screen keyboard or
  real IME): the toolbar riding on the keyboard; Enter and Backspace at the start of a row with
  Gboard and iOS autocorrect (Android keyboards can send key 229 instead of Backspace); and the
  caret staying in view above the toolbar. Anything found is fixed before phase 5 switches
  phones over.

### Phase 4: To-Dos. Done 2026-11-13

- The desktop To-Dos panel, full screen on a phone (phase 1), already had what the old phone page
  showed: Pinned, Today, Upcoming, Anytime and Waiting sections, and the "N open" heading.
- **Swipe**, as on the old phone page: right completes a task, left deletes it with Undo in the
  toast (`toggleTodo`, `deleteTodo`). It needs 30% of the row, at most 96px (`swipeOutcome`). A
  mostly-vertical drag is left to scrolling (`swipeAxis`), and a task's text being typed in
  doesn't swipe. Touch only, so the desktop is unchanged.
- **A task's ⋯** (Pin, Waiting for, Due date, Repeat, Link, Copy, Delete) is always shown on a
  phone, beside the date, since there is no hover. It replaces the old phone page's detail sheet
  with the desktop's own menu. Rewrite (AI) is left out of it, and out of the thread and note
  menus, on a phone.
- **Fixed on the way:** toasts (Undo) and ⋯-style menus opened *behind* the full-screen panels
  on a phone. They now sit above them (toast 1500, menus 1450, panels 1300).
- Opening on Documents or To-Dos, whichever was last used, already works: the panel remembers
  being open (`TODOS_OPEN_KEY`).
- Tests: `phone-todos.phone.spec.ts` (swipes through Chrome's touch input, Undo tapped, a short
  or vertical drag does nothing, ⋯ visible and its menu on top with no Rewrite) and
  `phoneEditing.test.ts` (+2).

### Phase 5: switch over. Done 2026-11-13 (owner: "why am I still seeing hub.html")

- **Phones use this page.** The `<768px` redirect to hub.html is gone, and so is `?layout=phone`
  (no longer needed).
- **hub.html only forwards** to `index.html`, keeping its query string and hash, so bookmarks,
  installed home-screen icons and shares keep working. It is a 20-line page with its own tight
  CSP. Delete it once installs have moved over.
- **Share to Sakura** moved into this page. Both manifests (`manifest.json`, and
  `hub-manifest.json` for older installs) now start at, and share to, `index.html`. A shared
  link or text becomes a to-do (`sharedTodoText` in `src/utils/todoModel.ts`), To-Dos opens and
  the share is cleared from the address. It runs once start-up has finished, because opening
  To-Dos during start-up threw (a helper it uses is defined further down the script).
- **Deleted:** the old page's code and tests. That is its 11 generated blocks, `hubTodos.ts`,
  `hubSubtasks.ts`, `docReader.ts`, `src/styles/hub/hub.css`, their unit tests, and nine hub-only
  browser specs. Shared modules it also used (`todoModel`, `syncApply`…) stay.
- **5b, done 2026-11-13:** saves no longer upload the table and diagram pictures that only the
  old page read. Removed: `pushDiagramPreviews`, `pushTablePreviews`, their backfills on opening a
  document, `tableSnapshotOf` and `src/utils/tableSnapshot.ts`, with the unit test and
  `diagram-pictures-for-phone.spec.ts`. `doc-safe-writes.spec.ts` checks a save writes nothing
  under `previews`. Pictures already uploaded stay until their document is deleted forever,
  which still clears the `previews` folder; their two localStorage signature keys are simply no
  longer read.
- **Still open from phase 3:** a check on a real phone of typing (Enter and Backspace with
  Gboard or iOS autocorrect, the keyboard toolbar, the caret staying in view).
- Docs updated: `feature-reference.md` ("On a phone", the old phone page, Share to Sakura,
  limits) and `README.md`.

### After phase 5: phone safety and polish (2026-11-13, owner: "make sure that the mobile will not corrupt the documents")

- **Keyboards that send no key event.** Some Android keyboards send Enter and Backspace as an
  input with no key event (key 229). Enter put a raw line break inside the row: no new row, and
  later typing ran on in the same row. Backspace at a row's start didn't join it to the row
  above. On a phone, `phoneKeyboardFallback` refuses that input and gives the row's own key
  handling the key instead. On the desktop the key event always comes first, so it never fires.
- **Putting the app away mid-typing** (no blur, no unload, as phones do) keeps what was typed.
  The row already saves as you type, and the existing `visibilitychange` → hidden handler writes
  it to storage. Now tested.
- Everything else goes through the desktop's own save, sync and conflict code: safe writes
  (`rev`), Version history on a conflict, and Undo.
- **First visit on a phone** skips the welcome. Its two choices, the guided tour and the demo,
  walk through the desktop layout. Nothing is marked seen, so a computer still shows it. Help
  hides "Watch a demo", and search no longer offers the tour, the demo or the shortcut sheet on
  a phone.
- Tests: `phone-keyboard-safety.phone.spec.ts` (hidden mid-typing; Enter and Backspace with no key
  event; Backspace inside a row is unchanged), `phone-shell.phone.spec.ts` (+2) and
  `phone-layout-switch.spec.ts` (+1: the desktop still shows the welcome).

### Faster first load: step 1, minify the build. Done 2026-11-13

- Vite left the page's inline code and styles exactly as written, comments and all: the built page
  was 2.48 MB (701 KB compressed) against a 2.55 MB source. The build now minifies them
  (`scripts/minify-inline.mjs`, wired in `vite.config.js`, build only). The result is 1.56 MB
  (403 KB compressed): 43% less to download on a first visit. Later visits are cached anyway.
- The minifier uses esbuild with no output format, so top-level names (the globals the page's
  scripts, inline handlers and tests share) are kept. A small scanner, not a regex, finds the
  blocks: an HTML comment that mentions `<script>` must not be read as one, and only JavaScript
  scripts are touched. Anything it can't parse is left as written.
- Checked by running the whole browser suite against the built, minified page. 1004 passed; of
  the 4 failures, 3 were tests about the source itself (the unbuilt version placeholder, and two
  that read the source text), and 1 didn't recur (104/104 when repeated under load, minified and
  source alike). `built-output-works.spec.ts` now drives the built page in CI: it checks the page
  is minified and under 500 KB compressed, that typing, Enter, Tab and saving work, and that a
  phone gets the phone layout.
- **Step 2 if still needed:** load the phone-hidden parts (AI, the table, chart and diagram editors,
  templates) on demand. That splits the page's single script, so it is a bigger and riskier
  change; measure on a real phone first.

## Risks

1. **Phone performance.** Measured in phase 0: 700 KB compressed, about 4.5 s for a first visit on
   a slow connection (repeat visits about 1 s, cached). Minifying the build (above) brought it to
   403 KB, about 2.5 s. Loading the phone-hidden parts on demand is the next step if real phones
   still feel slow.
2. **Touch editing on iOS.** `contenteditable` on iOS Safari has known quirks (caret jumps,
   the keyboard covering the caret, autocorrect fighting custom Enter handling). Phase 3 is
   the riskiest phase. It needs real-device testing, and it may need to ship as "edit row
   text and checkboxes" first, with structure editing (indent/move) after.
3. **Desktop regressions.** Covered by ground rule 1, the phase 0 baselines and the existing
   suite. Any phase that changes a desktop pixel fails CI.

## Decisions (owner, 2026-11-13)

- Breakpoint: 768px, the same as today's redirect. Tablets in portrait (768–1024px) keep the
  desktop layout.
- Guests on the phone: allowed, as on desktop (try first, sign in to sync).
- Thread replies on the phone: allowed (a short text box).
