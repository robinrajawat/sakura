# Mobile plan: one app, a limited phone layout

**Status:** approved (2026-11-13). Phases 0 and 1 done; phase 2 next. Owner direction: follow standard practice. One
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

1. **Phone performance.** Measured in phase 0: the page is about 9 times the size of hub.html
   (700 KB against 81 KB compressed). Repeat visits are fine (about 1 s, cached), but a first
   visit on a slow connection takes about 4.5 s. Loading the phone-hidden parts on demand is
   required before phase 5. It also speeds up the desktop's first visit.
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
