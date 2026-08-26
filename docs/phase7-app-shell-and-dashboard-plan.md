# Phase 7 — Sign-in, Onboarding, Document Chrome & Toolbar Realignment Plan

## The rule this plan exists to enforce

**This entire phase exists because Phase 6 was marked complete without anyone ever looking at
the deployed `web/` build in a real browser as a brand-new visitor would.** Every phase 6 slice
was built and verified against an already-open document — the sign-in gate, the first-run
onboarding modal, the persistent per-document header (status/author/link/presence/share), and
legacy's real toolbar-visibility defaults were never scoped anywhere, because nothing in Phase 6
ever needed to render what's above/before an open document. This was only discovered when the
person running this migration published a real `/web-preview/` build and clicked through it
before it had ever opened a document — the exact same category of gap Phase 6's own Section 9
gate item 2 exists to catch. This plan is the fix: scope the real gap, from real interactive
verification of `legacy/`, before building anything.

## Goal

Full parity for the layer of `legacy/` that sits above and around an open document: the sign-in
gate, first-run onboarding, the always-present per-document header (title + status/author/link/
presence/share chips), the empty-document state, and legacy's real toolbar-visibility defaults
(hidden by default, revealed by a floating toggle, not the dense always-on bar `web/` currently
renders). Same standard as `docs/phase6-full-parity-plan.md`: pixel-close, not "same spirit."

## Why sequenced this way

Every gap in this plan was found via a real click-through of a fresh `legacy/dist` build in
headless Chrome (fresh profile, empty `localStorage`), not by reading markup and guessing —
several of the task's own starting assumptions turned out to be wrong once actually driven, and
those corrections are called out inline below because they change scope:

- **There is no separate "document-browser/dashboard" screen.** Legacy never shows a screen with
  no document open. The moment the sign-in gate and welcome modal are dismissed, legacy has
  already created (and shows) an empty `Untitled` document — sidebar, tab strip, and the full
  per-document header (title + status/author/link chips) all render simultaneously with the
  empty-state placeholder in the content pane. "The dashboard" and "the per-document header" are
  the same screen, not two. This plan's 7.2 and 7.3 slices are sequenced together for that reason
  — building one without the other produces a screen that doesn't match anything legacy ever
  actually shows.
- **The app bar's grid icon, hamburger icon, and search box are not unscoped gaps.** Real clicks
  confirmed: the grid icon (`#dock-panel-appbar-toggle`) opens the Hub dock (To-Dos/Meetings/
  Journal/Library/Recap — `web/` already has all five as `HubTodosPanel.tsx` etc., just stacked
  vertically instead of docked); the hamburger (`#appbar-more-toggle`) opens an Import/Export/
  Print menu (`web/`'s `ExportButtons.tsx` already exists); the search box is legacy's real Quick
  Assist command box (`#qa-input`), and `web/`'s `QuickAssistBar.tsx` (§6.10 slice 3) is already
  a direct port of it, already mounted in `App.tsx`'s `headerActions`. None of these need new
  logic — they need **docking/layout**, not building from scratch, and are scoped as a single
  smaller slice (7.6) rather than treated as equal-weight new features.
- **The account/notification/settings entry points already have real components.** `AuthPanel.tsx`,
  `NotificationBell.tsx`, `SettingsPanel.tsx`, and `SyncStatusIndicator.tsx` all exist and are
  already mounted in `App.tsx` — `AuthPanel.tsx` just renders as a plain inline block at the
  bottom of a long vertical panel dump today, not as the appbar's real dropdown-anchored button +
  menu legacy uses (`#account-toggle`/`#account-menu`, confirmed by a real click: it opens a
  dropdown with Sign in / Settings / Help / Send Feedback / About / a support link — not a
  full-page redirect back to the landing gate).
- **The toolbar is off, not on, by default — and legacy's real default state is closer to `web/`'s
  goal than the task's own framing suggested, once actually measured.** A real fresh-profile
  click-through confirmed `document.body` carries a `toolbar-hidden` class at first paint
  (`legacy/index.html:13240`'s `loadPrefs()` — `toolbarVisible=d.toolbarVisible===undefined?
  false:...`, i.e. false whenever no prefs exist yet), and separately `feature-off-hovertoolbar`
  (`hoverToolbarEnabled` top-level default is `false`, legacy/index.html:8276 area) — so on a
  genuinely first-run document, **no toolbar and no hover-rail render at all**, matching neither
  `web/`'s current always-on dense bar nor a hypothetical "conditional on selection" reading. A
  small floating icon (`#editor-toolbar-toggle`, bottom-right of the editor pane,
  legacy/index.html:2259-2264,6572) reveals it on demand; once shown it renders as **labeled
  icon-groups** (History / Structure / Move / Format / Insert / AI / Delete — legacy/index.html:
  6356-6485), not a flat bar, and two of those groups (Fold, Extras) are hidden by default too
  via `toolbarHiddenGroups`. This is a real, sequenced-last slice (7.5) since it's a behavior
  *change* to an already-built surface, not a from-scratch build, and touches `App.tsx`'s existing
  toolbar block directly.

Given those corrections, this plan sequences from "nothing renders at all without this" (the
sign-in gate blocks everything) down to "an existing surface needs its default state and layout
corrected" (toolbar), so each slice either unblocks the next or stands alone:

## Phases

### 7.1 — Sign-in gate overlay
The full-screen, pre-app modal every real visitor sees first: `#sakura-landing-overlay`
(legacy/index.html:4498-4526), a centered card with the Sakura mark, "Your outline, wherever you
go" heading, a subtitle explaining sign-in is optional, a real "Sign in with Google" button
(`#sakura-landing-google-signin-btn`), an "or" divider, a "Sign in with email" toggle
(`#sakura-landing-email-toggle-btn`) that reveals an inline email/password form (`#sakura-landing-
email-form`, `-email-input`, `-password-input`, mode-toggle "New here? Create an account", "Forgot
password?"), and "Continue without signing in" (`#sakura-landing-continue-btn`) as an
underlined text link, not a button. Reuses `authStore.ts`'s existing `signInWithGoogle`/
`signUpWithEmail`/`signInWithEmail`/`sendPasswordReset` actions directly — this slice is a new
gating shell around those, not new auth logic. "Continue without signing in" and a successful sign
-in both dismiss the overlay into 7.2. Deliberately not scoped here: legacy's own conditional
skip logic for a returning user with a real session already established (`web/`'s `authStore.ts`
`init()` already resolves this — the gate should simply not render while that resolution is
pending/positive, matching legacy's own real "don't flash the gate at a signed-in user" behavior,
verified against `legacy/index.html`'s own boot sequencing before this slice ships).

### 7.2 — First-run onboarding modal
`#welcome-overlay`/`#welcome-modal` (legacy/index.html:7639-7661): "Welcome — where would you
like to start?", two choice cards ("Guided tour" / "Watch the demo", each with an icon, label,
and description — `#welcome-pick-tour`/`#welcome-pick-demo`), two text links ("Why an outliner
instead of plain notes? →" opening a second `#why-sakura-overlay` modal, legacy/index.html:7663+;
"Prefer a leaner writing view? Apply Editor's Choice →"), and "Skip for now, I'll explore on my
own" (`#welcome-skip`). Shown once, immediately after the sign-in gate is dismissed on a genuinely
first-run profile.

**Scoped for this slice:** the modal shell itself, all four dismiss paths (tour/demo/skip/outside
click matching legacy's real dismiss behavior), and the "Why an outliner" secondary modal (static
content, no logic). **Explicitly deferred, not silently dropped:** the actual "Guided tour"
interactive walkthrough and "Watch the demo" scripted animation (legacy/index.html:34368+'s "===
Guided tour ===" section — substantial standalone features, each large enough to be their own
follow-up phase once this shell exists to launch them from) and "Apply Editor's Choice" (an entire
alternate default-preferences profile — legacy/index.html:41235+ area — out of scope until a real
Settings/preferences surface exists to house the toggle it flips). Both choice cards and both
links render and are clickable in this slice; clicking "Guided tour" or "Watch the demo" can
close the modal and show a real "not built yet" placeholder rather than a broken dead click,
same honesty convention as every other deliberately-deferred item in `docs/phase6-full-parity-
plan.md`.

### 7.3 — Document data model: status, author, link
Before any header UI can render real per-document state, `DocSummary` (`web/src/store/
documentsStore.ts:7-12`) needs the fields legacy's real document object carries and this header
reads/writes — today it has only `id`/`title`/`createdAt`/`modifiedAt`, a complete gap, not a
partial one. Add `status: '' | 'draft' | 'review' | 'approved' | 'rejected'`, `author: string`,
and `link: { label: string; url: string } | null`, each matching legacy's real per-document
fields the header chips below read (legacy/index.html:6506-6530), persisted the same way title
already is. This slice is store-and-migration only — no new UI — same "store PR before UI PR"
discipline `docs/phase6-full-parity-plan.md`'s own header names throughout.

### 7.4 — Per-document header: status, author, link, presence, share chips
The header row that sits directly under the (already-existing) title input, always present for
any open document including the empty-state one — direct port of legacy's real
`#editor-meta-row` (legacy/index.html:6505-6534):
- **Status chip** (`#doc-status-wrap`/`#doc-status-chip`/`#doc-status-menu`,
  legacy/index.html:6506-6515): a `todo-dd-menu`-style popover, 5 options (No status/Draft/
  Review/Approved/Rejected) each a `role="menuitemradio"` row with a checkmark on the active
  value — same interaction pattern `HubTodosPanel.tsx`'s own status chip already established for
  To-Dos, reusable here rather than invented fresh.
- **Author chip** (`#sb-author`, legacy/index.html:6516): a plain inline text input styled as a
  chip, placeholder "+ Add author", committing on blur/Enter.
- **Link chip** (`#doc-link-wrap`/`#doc-link-chip`/`#doc-link-menu`, legacy/index.html:6517-6530):
  a button reading "Add link" (or the link's label once set) that opens a small popover with two
  fields (display-text, URL) and three actions (Remove/Open/Save) — `#doc-link-label-input`/
  `#doc-link-input`/`#doc-link-remove-btn`/`#doc-link-open-btn`/`#doc-link-save-btn`.
- **Presence chip** (`#doc-presence-chip`, legacy/index.html:6531) and **share chip**
  (`#doc-share-wrap`/`#doc-share-chip`/`#share-dd-menu`, legacy/index.html:6532+): both real
  legacy elements, both `style="display:none"` in legacy's own markup by default — real,
  observed confirmation that neither renders for a signed-out/unsynced document. **Scoped down
  accordingly**: this slice ports the status/author/link chips only (the three that render for
  every document regardless of sign-in state, i.e. real parity for what `web/` needs today,
  §6.8's Account/Sync work being still not started per that plan's own Status section); presence
  (live-viewer avatars) and share (cross-account document sharing) are real, separately-scoped
  follow-ups that depend on `docSyncStore.ts`/`sharingStore.ts` reaching a document-open UI at
  all, not just existing as stores — noted here as a real gap, not dropped silently.

Also in this slice: the **empty-document state** itself (legacy's real `.empty-state.doc-empty`
block, legacy/index.html's `renderPane`-adjacent code near the `es-new-doc-btn`/`es-ai-outline-
btn` ids) — the Sakura mark illustration, "Nothing here yet" / a personalized greeting variant,
"New document" and "Generate with AI ✦" buttons — confirmed via real click-through to be what
`OutlineTree.tsx` shows in place of any node rows when a document has zero nodes; `web/`'s
`OutlineTree.tsx` has no such branch today (grepped directly, zero matches for any empty-state
condition).

### 7.5 — Toolbar default-visibility & grouped layout realignment
A real behavior correction to `App.tsx`'s existing always-visible toolbar block (the dense B/I/U/
S/heading-select/checkbox/Rewrite/Outline/Restructure/Expand/Tags/Icon/Icons-all/Summarise row
built across §6.2/§6.9), not a new build:
1. **Hidden by default.** Match legacy's real first-run `toolbarVisible=false` default
   (legacy/index.html:13240's `loadPrefs()`) — the toolbar renders nothing until toggled on.
2. **A floating reveal toggle**, matching legacy's real `#editor-toolbar-toggle` (legacy/
   index.html:2259-2264, 6572, wired at :27093 via `setToolbarVisible(!toolbarVisible)`):
   bottom-right of the editor pane, alongside three sibling floating buttons this slice should
   also add for the same real row (`#editor-preview-toggle`, `#editor-pad-toggle`, `#editor-zen-
   toggle` — legacy/index.html:2246-2264) since `web/` already has real equivalents for all three
   (the Preview/Present mode toggle, `PadPanel.tsx`, and a maximize/zen concept it doesn't yet
   have) that currently live only as separate always-visible buttons elsewhere in `App.tsx`'s
   status row.
3. **Grouped layout once shown**: History / Structure / Move / Format / Insert / AI / Delete,
   each its own labeled cluster (legacy/index.html:6356-6485) rather than one flat row — `web/`'s
   existing individual buttons map directly onto these groups (most already exist; Structure's
   outdent/indent/insert-above/insert-child are new, matching `outlineStore.ts` actions that
   already exist but have no toolbar button yet).
4. **Two groups hidden by default even when the bar is shown** (Fold, Extras — legacy's own
   default `toolbarHiddenGroups`), and within-group per-button hiding for AI (only Outline +
   Rewrite show by default; Expand/Summarise/Tags/Icon start hidden) and Insert (Smart-paste
   starts hidden) — confirmed via a real toggled-on screenshot showing exactly 2 AI buttons and 4
   Insert buttons, matching legacy's own documented default `aiHiddenButtons`/`insertHiddenButtons`
   arrays.
5. **Hover-toolbar default-off correction**: `web/`'s existing node hover toolbar (§6.2 item,
   `docs/phase6-full-parity-plan.md`'s own text: "matches legacy's own default `hoverToolbarActions`
   exactly") ported the *action list* correctly but never gated *whether the rail renders at all*
   — legacy's real `hoverToolbarEnabled` defaults to `false` (confirmed: `feature-off-hovertoolbar`
   present on `document.body` on a fresh profile), so the rail should not appear until a real
   Settings toggle turns it on. No Settings surface exists yet for that toggle specifically (same
   category of gap as several §6.6/§6.7 items already deferred for the same reason) — this slice
   should default the rail off in code even without a UI toggle to flip it back on, rather than
   leave it silently always-on, and name the missing toggle as a real follow-up.

Sequenced last because it's a correction to an already-shipped, already-tested surface — every
other slice in this plan builds something that doesn't exist in `web/` at all yet.

### 7.6 — App-bar chrome docking (smaller slice)
Not new features — wiring/relocating four already-real `web/` components into legacy's real
app-bar layout and interaction pattern, confirmed via real clicks (see "Why sequenced this way"
above for what each already is):
- `AuthPanel.tsx`'s sign-in/out UI moved out of the bottom-of-page vertical dump into a real
  `#account-toggle`/`#account-menu`-style anchored dropdown in the header (avatar + status dot
  when signed in, "Sign in" label when not — legacy/index.html:4558-4569's real markup shape),
  alongside Settings/Help/Send Feedback/About entries the dropdown also needs (Settings already
  exists as `SettingsPanel.tsx`; Help/Feedback/About are small, mostly-static additions).
- The Hub panels (`HubTodosPanel.tsx`/`HubMeetingsPanel.tsx`/`HubJournalPanel.tsx`/
  `HubLibraryPanel.tsx`/`HubRecapPanel.tsx`) re-docked as a slide-in right-side panel triggered by
  a real grid-icon button, tabbed (To-Dos/Meetings/Journal/Library/Recap), instead of stacked
  vertically in the main content column — a real layout change, not new panel logic.
- `ExportButtons.tsx` moved into a real `#appbar-more-toggle`-style menu (Export/Import/Print)
  instead of an inline block.
- `NotificationBell.tsx` and `SyncStatusIndicator.tsx` already render in the header
  (`App.tsx`'s `headerActions`) — confirm their visual treatment matches legacy's real
  `#notif-toggle`/badge styling once the token/CSS work from this phase settles, no logic change
  expected.

### 7.7 — Sidebar completeness: Templates & Trash sections
`SidebarFileExplorer.tsx` (§6.1, still current) already covers the real "Documents" section
(folders + docs, CRUD, move-to-folder) but its own header explicitly names Templates and Trash
as out of scope. Real legacy markup for both now located precisely:
- **Templates** (`#sb-templates-section`, legacy/index.html:6314-6328): its own section header
  ("TEMPLATES" label + collapse-all/new-template-folder/"⋯" manage-templates icon buttons) and
  list, matching the Documents section's own structural pattern one level down — a real,
  separately-scoped system per `docs/phase6-full-parity-plan.md`'s own 6.1 note ("templates -- a
  separate system entirely, out of scope for this phase"), still true here: this slice is the
  empty-state shell + section chrome, not the full save-as-template flow (a real follow-up).
- **Trash** (`#sb-trash-list`, legacy/index.html:6329, and the collapsible row shown in every
  real screenshot this investigation took: "▶ Trash" + a live count), matching the Documents
  section's own collapse pattern with a count badge on the header row.
- Two remaining Documents-section icon buttons `SidebarFileExplorer.tsx` doesn't have yet but
  legacy does (legacy/index.html:6294-6299): `#sb-locate-doc-btn` ("Locate the open document" —
  scrolls/expands the sidebar tree to reveal the active doc, target/crosshair icon) and
  `#sb-toggle-search-btn` ("Show filter box" — reveals `#sidebar-search`, already a real element
  at legacy/index.html:6262-6268 that `web/`'s sidebar has no equivalent for at all: no
  filter-docs-by-name input anywhere in `SidebarFileExplorer.tsx` today).

## Sequencing summary

7.1 (sign-in gate) → 7.2 (onboarding) → 7.3 (doc data model) → 7.4 (per-doc header + empty state)
→ 7.5 (toolbar realignment) → 7.6 (app-bar docking) → 7.7 (sidebar Templates/Trash). 7.1 and 7.2
block everything else purely by being the first two screens a real user hits. 7.3 must land
before 7.4 (store before UI, same discipline as every Phase 6 slice). 7.5, 7.6, and 7.7 are
independent of each other and of 7.1-7.4 — they can run in parallel with each other or be
resequenced by whoever picks this up, listed last only because each corrects/extends an
already-shipped surface rather than building a blocking new one.

## Existing scaffolding found (the one real exception to "none of this exists yet")

`AuthPanel.tsx` + `authStore.ts` already implement real Google and email/password sign-in/up/
reset, and are already mounted in `App.tsx` — but as a plain inline block at the bottom of the
vertical panel dump, not as either the 7.1 full-screen gate or the 7.6 header dropdown. Its own
header comment already flags this exact gap: *"legacy wires this exact form into TWO separate DOM
surfaces (a landing-page overlay and this account panel) ... `web/` has no landing/onboarding
overlay at all yet (a real, separately-scoped gap, not attempted here)."* 7.1 and 7.6 are that
follow-up, reusing `authStore.ts`'s actions as-is rather than duplicating them. `QuickAssistBar.tsx`
(§6.10) and the five Hub panels (§6.5) are the other real prior art this plan reuses rather than
rebuilds (see "Why sequenced this way" above) — everything else named in this plan (`DocSummary`'s
status/author/link fields, the sign-in gate shell, the welcome modal, the empty-document state,
the toolbar's default-hidden behavior, sidebar Templates/Trash) has no existing code anywhere in
`web/src` today, confirmed by direct grep/read, not assumption.

## Status

**In progress.** This document itself was the first output of Phase 7 — written from a real
interactive investigation (build `legacy/dist`, serve it locally, drive it with headless-Chrome
Playwright through the sign-in gate → onboarding → empty dashboard → document creation → toolbar
reveal → header chips → app-bar icons, screenshotting each real state), not from reading markup
alone, matching the verification standard every Phase 6 slice was held to.

- ✅ **7.1 — Sign-in gate overlay landed.** New `components/SignInGate.tsx`, a direct port of
  legacy's real `#sakura-landing-overlay` (legacy/index.html:4498-4526) and its
  `shouldShowLandingOverlay`/`dismissLandingOverlay` logic (legacy/index.html:13848-13872): the
  Sakura mark, "Your outline, wherever you go" heading, subtitle, "Sign in with Google" button, an
  "or" divider, a "Sign in with email" toggle revealing the sign-in/create-account form (reusing
  `authStore.ts`'s existing actions directly, no new auth logic), and "Continue without signing
  in" as an underlined text link. Dismissal (the continue link, Escape, or a successful sign-in)
  is scoped to the current tab session via `sessionStorage` under a distinct
  `sakura_web_landing_dismissed` key (not legacy's bare `sakura_landing_dismissed`, so the two
  apps' dismissal state can't leak across each other on a shared origin like `/web-preview/`).
  Renders as a fixed-position overlay (`position:fixed;inset:0`) on top of `App.tsx`'s existing
  tree rather than replacing it, matching legacy's own real behavior of the app continuing to boot
  underneath. Gated on `authStore`'s `loading`/`user` so it never flashes at an already-signed-in
  visitor, matching legacy's own real "decide only once the async auth restore has resolved"
  behavior; `authStore.ts`'s own `init()` gained an idempotency guard (matching
  `notificationsStore.ts`'s established pattern) since both `AuthPanel.tsx` and this new component
  now call it. One real, deliberate simplification vs. legacy, named in the component's own
  header: legacy's own version skips its async Firebase wait entirely for a device that has never
  signed in before (a `localStorage` fast-path check) -- not replicated here, so a brand-new
  visitor may see a brief flash of the un-gated app before the gate appears; a real,
  separately-scoped follow-up if that's ever visibly bothersome in practice. Verified end-to-end in
  real headless Chrome against a real `vite preview` build in both light and dark theme (the gate's
  CSS custom properties track the live theme correctly): the gate renders on first load, the email
  form and signup-mode toggle both work, Escape dismisses it, the dismissal persists across a
  reload in the same tab (matching legacy's real per-tab-session `sessionStorage` semantics), and
  the full existing app underneath renders correctly once dismissed -- zero console/page errors
  (only expected network failures from Firebase/Google endpoints being unreachable in this
  environment, not application errors).
- Remaining: 7.2 (first-run onboarding modal) → 7.3 (doc data model) → 7.4 (per-doc header + empty
  state) → 7.5 (toolbar realignment) → 7.6 (app-bar docking) → 7.7 (sidebar Templates/Trash), per
  this doc's own sequencing summary above.
