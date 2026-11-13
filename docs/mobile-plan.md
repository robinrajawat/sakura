# Mobile plan: one app, a limited phone layout

**Status:** approved (2026-11-13), not started. Owner direction: follow standard practice. One
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
   `@media (max-width: 767.98px)`, in their own file (`src/styles/index/phone.css`). All
   phone-only behaviour is gated on one flag, `isPhoneLayout()` (a `matchMedia` on the same
   query, also set as `html.phone`). No desktop rule, handler or default changes. If a phase
   needs to touch shared code, the desktop behaviour must be the same, and its tests prove it.
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

### Phase 0: safety net (no visible change)

- Add desktop **screenshot baselines** at 1280×800 for the main screens: editor with a rich
  document, sidebar, settings, To-Dos panel, share menu. They must not change in any later
  phase. Store them in `web/tests/e2e/` like the existing visual checks.
- Add a Playwright **`phone` project** (iPhone 13 and Pixel 7 profiles) that runs only
  `*.phone.spec.ts`. The existing suite stays as it is and keeps running at desktop size.
- Add `isPhoneLayout()`, `html.phone` and an empty `phone.css` wired through
  `generate-index-blocks.mjs`. Add `?layout=phone` as a way to skip the redirect for testing.
- Measure the full page's load on a throttled mid-range phone profile (4× CPU, fast 3G). That
  sets the performance budget for later phases. The main page is about 35k lines, against
  hub.html's 5k.

### Phase 1: layout shell

- The sidebar becomes a drawer: hidden by default, opened by a menu button on a compact top
  bar (back, title, sync state, Share, ⋯). Opening a document closes it.
- The editor goes full width, with 16px side padding and no horizontal page scroll.
- Settings, Help, version history and the share menu open as full-screen sheets.
- Phone-hidden features (see the table) are removed in `phone.css`.
- Tests: no horizontal scroll at 360px, the drawer opens and closes, and the desktop baselines
  are unchanged.

### Phase 2: reading

- Tap targets of at least 44px. Fold by tapping the row dot, as the hub reader does.
- Tables and charts scroll sideways inside their own box, never the page.
- Diagrams open full screen with pinch zoom (reuse the hub reader's viewer).
- Ready-made snapshots aren't needed any more: the phone runs the real renderer.

### Phase 3: light editing by touch

- A **keyboard toolbar** above the on-screen keyboard: outdent, indent, checkbox, move up,
  move down, Done. It is positioned with `visualViewport` so it sits on top of the iOS and
  Android keyboards.
- **Long-press a row** for a short menu: add a note, make it a heading, copy a link, delete.
  This replaces right-click and hover controls.
- Row editing uses the existing `contenteditable` rows and the same `saveToStorage` path.
  Test on real iOS Safari and Android Chrome, because their `contenteditable` and IME
  behaviour differs from desktop (Enter, Backspace at the start of a row, autocorrect).
- Conflicts behave exactly as on desktop: the other device's copy wins, and this one's edits
  go to Version history.

### Phase 4: To-Dos

- Make the existing To-Dos panel full screen on a phone, and bring over what the hub has that
  the panel doesn't: the swipe gestures, the detail sheet and the open-count heading. The
  logic is already shared (`todoModel.ts`, `hubTodos.ts`, `hubSubtasks.ts`).
- The phone opens on Documents or To-Dos, whichever was used last.

### Phase 5: switch over and retire hub.html

- Remove the `<768px` redirect from `index.html`.
- `hub.html` becomes a one-line redirect to `index.html` (keeping the query string), so
  bookmarks and installed home-screen icons keep working. It is deleted one release later.
- Move the **share target** (sharing a link or text to Sakura creates a to-do) from
  `hub-manifest.json` into the main `manifest.json`. Anyone who installed the hub app needs to
  reinstall it once. Help text will say so.
- Delete the phone-only code: the reader, the table snapshot and diagram preview uploads
  (`previews/` in Firestore, `sakura_table_preview_sync_v1`, `sakura_preview_sync_v1`), and
  `hub*` blocks. A cleanup removes leftover `previews/` documents.
- Update `feature-reference.md`, Help/About, the README and the handoff prompt.

## Risks

1. **Phone performance.** The full page is about 7 times the size of hub.html. If phase 0's
   measurement is poor (more than 3s to an interactive editor on the throttled profile), we
   load AI, the diagram editor, the chart editor and the templates on demand before phase 5,
   rather than shipping a slow phone experience. This is the biggest unknown and is measured
   first.
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
