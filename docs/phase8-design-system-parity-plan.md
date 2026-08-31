# Phase 8 — Design System Parity Plan

## The rule this plan exists to enforce

**§6.1's "generic form controls" fix (docs/phase6-full-parity-plan.md) closed a real gap, but not
the whole gap it looked like it closed.** That fix ported legacy's real `.btn,.select,.meta-input`
base rule (border/color/padding/radius/font) to bare `button`/`select`/`input` element selectors
in a new `web/src/index.css`, and was verified with real screenshots. It was a genuine, correctly-
scoped fix for what it targeted — but re-reading its own write-up next to a real side-by-side
comparison (a `/web-preview/` screenshot against a real, content-bearing legacy screenshot, not the
empty `Welcome` seed doc) shows the base rule was only ever step one of legacy's real button
system, not the whole thing. Legacy's real CSS defines a dozen-plus **named variants and
purpose-built components** on top of that base rule — `.btn.primary`, `.btn.toggle-on`,
`.icon-btn`, `.sb-icon-btn`, `.export-item`/`.export-icon`/`.export-label` (with a `-rich` variant
for icon+label rows), `.status-chip`/`.status-chip-btn`, `.notif-badge`, `.account-visibility-
badge`, `.account-danger-item`, and more — each with its own real, distinct sizing/color/icon
treatment. `web/` never built any of them. Every button across every phase 6 and phase 7 slice
(mine included) instead hand-rolls its own approximate inline `style` object per call site — close
enough to *function*, never close enough to *match*, and each one drifts independently since there
is no shared source of truth (`web/src/index.css`'s own header comment already confirms this:
"zero `className=` usage anywhere in App.tsx/OutlineTree.tsx" — still true today, extended to
every file added since). That's the real, root, cross-cutting cause of the visual gap a real user
flagged from a side-by-side screenshot: not a missing feature any one slice forgot, but a missing
*component layer* underneath all of them. Building individual features on top of it, slice after
slice, was never going to close this — this plan is that missing layer.

## Goal

Pixel-level visual parity for the shared chrome every other slice in this project builds on top
of: buttons (every real variant, not just the base), icon-only buttons (both weights legacy has —
`.icon-btn`/`.sb-icon-btn`), the icon set itself (legacy's real inline-SVG line icons, replacing
every ad hoc emoji glyph `web/` has accumulated as a shortcut), dropdown-menu items (`.export-item`
and its rich icon+label variant), chip/badge patterns (`.status-chip` pill family, the document
header's status/author/link chips, `.notif-badge`, `.account-visibility-badge`), and a real,
repeatable verification practice that would have caught this gap the first time. Same standard as
every prior phase: pixel-close, verified against real legacy source and real screenshots, not
"same spirit."

## Why sequenced this way

- **CSS classes, not React style-prop components** — matching legacy's own real technique exactly,
  and already the established direction in this codebase for exactly this reason: `AppShell.tsx`
  and `DocumentTabs.tsx` (docs/phase6-full-parity-plan.md's own 6.1 section) already moved off
  per-component `THEME_TOKENS` style objects onto real `var(--bg)`/`var(--accent)` CSS custom
  properties specifically so "neither component needs to subscribe to theme/accentPreset at all
  anymore for styling purposes." Extending that same real-CSS-class approach to buttons/icons/chips
  is the same direction, not a new one, and (like the original base-button fix) is purely additive:
  a new class added to `web/src/index.css` cannot break an existing inline `style`, which always
  wins in specificity/precedence over it. This also means the retrofit slices below can land
  incrementally, file by file, without a flag-day rewrite.
- **Real components (`Button`/`IconButton`/`MenuItem`/`Chip`) still needed on the React side** —
  the CSS classes alone don't stop the next slice from hand-rolling another ad hoc button. A small
  set of shared components in `web/src/components/ui/` (thin wrappers applying the right
  `className` + accepting `variant`/`icon` props) is what actually prevents this gap from
  reopening slice by slice, the same way `DropdownMenu.tsx` (§7.6) stopped three different popovers
  from each reinventing click-outside/Escape handling.
- **Icon set is its own slice, not folded into buttons** — a real, separately-scoped body of work
  (auditing every emoji glyph in `web/src`, porting the matching real SVG from legacy for each),
  independent of whether a button uses the old or new CSS class underneath it.
- **Retrofit is the bulk of the real work, and is what actually closes the screenshot gap** — new
  primitives alone don't change what's on screen; every existing call site (the app-bar, sidebar,
  document header, toolbar, every dropdown menu built across §6.x/§7.x) has to actually be switched
  over. Sequenced last, and split by area (not one giant PR) so each slice stays reviewable and
  independently screenshot-verifiable, matching this project's own established PR-per-slice
  discipline.
- **A real verification fixture is the actual fix for "why did this take so many iterations
  already"** — every prior phase's own screenshot verification used the empty `Welcome` seed
  document, which never exercises tags, status chips, decision-log cards, checkboxes, or any of
  the rich inline rendering a real document like the one that surfaced this gap has. A verification
  step that never renders that content can't ever catch a gap in how it's styled. Building a real,
  richly-populated fixture document once and reusing it for every future visual-verification
  screenshot (this phase's own, and every phase after it) is scoped as its own slice specifically
  so it isn't skipped as "obvious" and forgotten again.

## Real findings from this investigation (legacy/index.html, verified by line, not assumed)

- `.btn,.select,.meta-input` (legacy/index.html:372) — the base rule §6.1 already ported correctly;
  confirmed still accurate, not re-touched by this plan.
- `.btn.primary`/`.btn.toggle-on` (legacy/index.html:383) — a solid accent-filled CTA variant and a
  pressed/active-state variant. `web/` has never used either; every "primary" action (Sign in,
  Send feedback, etc.) currently renders identically to every secondary button.
- `.icon-btn` (legacy/index.html:391) — a fixed 32×32 centered icon-only button (the app-bar's own
  icon row). `.sb-icon-btn` (legacy/index.html:1528) — a smaller, borderless, `var(--hint)`-colored
  icon button (the sidebar's own icon row) — a *different*, deliberately lighter-weight variant,
  not the same component at two sizes.
- `.export-item`/`.export-icon`/`.export-label`, plus the `.export-menu-rich .export-item` variant
  (legacy/index.html:476-491) — the real dropdown-menu-row component (icon + label, hover/active/
  focus states) every menu in this project's own new `DropdownMenu.tsx` (§7.6) approximates with
  plain padded buttons today, usually without the icon at all.
- `.status-chip`/`.status-chip-btn` (legacy/index.html:619-623) — the real pill-chip family; the
  status bar's own chips already use this naming, and it's the same real shape `DocumentHeader.tsx`
  (§7.4) approximates with its own local `chipStyle()` helper instead of the real class.
- `.notif-badge` (legacy/index.html:495), `.account-visibility-badge` (legacy/index.html:1439),
  `.account-danger-item` (legacy/index.html:481) — smaller, real, named components with their own
  distinct sizing/color treatment, none built in `web/` yet.
- Icons: every legacy icon confirmed is a literal inline `<svg>`, stroke-based (`fill="none"
  stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"`), no icon
  font, no sprite sheet — a real, copy-portable convention (already the technique every faithfully-
  ported icon in `web/` today uses, e.g. `HubDock.tsx`'s tab icons) but applied inconsistently:
  several `web/` components (mine included, in §7.6/§7.7) used raw emoji glyphs as a shortcut
  instead.

## Sequencing summary

8.1 (CSS primitives) → 8.2 (icon set) → 8.3 (shared React components) → 8.4 (retrofit, split by
area: app-bar/header, sidebar, document header, toolbar, dropdown menus + modals) → 8.5 (real
verification fixture document). 8.1-8.3 build the layer; 8.4 is the bulk of the visible fix and
can be split further/resequenced by whoever picks up each slice; 8.5 can run in parallel with 8.4
once the fixture itself is ready, and should land early enough that later 8.4 slices already use
it for their own verification.

**Correction found during 8.4c**: this plan's own original area split bundled "document header +
toolbar" as one slice -- real investigation of `DocumentHeader.tsx` alone surfaced an entire real
class family (`.editor-title-row`/`.editor-title-input`/`.editor-meta-row`, `.todo-dd-item`,
`.doc-link-menu-*`) big enough to be its own PR, so the two areas split into separate slices
(document header, then toolbar) rather than landing as one oversized PR -- the same "split further
... by whoever picks up each slice" flexibility this section's own text already reserved.

**Correction found during 8.4e**: the last area, "dropdown menus + modals," turned out to already
be fully covered by 8.4a/8.4c's own real `DropdownMenu.tsx` consumers -- there was no dropdown-menu
work left by the time 8.4e was picked up. Real investigation found the actual remaining gaps were
document tabs (`DocumentTabs.tsx`, split out as 8.4e itself), the Settings panel's category rail,
the Hub dock's tab strip, and shared modal/dialog chrome -- renamed and re-split as 8.4f. A second
correction found during 8.4f itself: the modal/dialog chrome piece alone touches 10 separate
`role="dialog"` components, too much surface for one PR alongside the rail/tab-strip work, so it
split out again into its own 8.4g (see that slice's own Status entry for the exact classes/lines
and component list). Same "split further/resequenced" flexibility this section already reserves,
applied three times now.

### 8.1 — CSS primitives
Port the missing real classes into `web/src/index.css` (or a new `web/src/ui.css` if that file is
getting unwieldy), verified 1:1 against the real legacy lines cited above: `.btn.primary`,
`.btn.toggle-on`, `.icon-btn`, `.sb-icon-btn`, `.export-item`/`.export-icon`/`.export-label` (+
rich variant), `.status-chip`/`.status-chip-btn`, `.notif-badge`, `.account-visibility-badge`,
`.account-danger-item`. Purely additive (same reasoning §6.1's own fix already established) — no
existing component changes over.

### 8.2 — Icon set
Audit every emoji/glyph currently used as an icon across `web/src` (a real `grep` pass, not a
guess) and replace each with the matching real inline SVG from legacy, kept as small named
exports (e.g. `web/src/icons.tsx`) rather than re-inlined per call site, so a future component pulls
`<LocateIcon />` instead of re-pasting a `<svg>` block. Independent of 8.1/8.3 — can land before or
after either.

### 8.3 — Shared React components
`web/src/components/ui/Button.tsx` (`variant: 'default' | 'primary' | 'icon' | 'sidebar-icon'`),
`MenuItem.tsx` (icon + label row, matching `.export-item`), `Chip.tsx`/`StatusChip.tsx` (matching
`.status-chip` family). Thin wrappers only — apply the right `className` from 8.1 and accept an
icon from 8.2, no new behavior.

### 8.4 — Retrofit (split by area, each its own PR)
Switch every existing call site over to the new primitives, removing the ad hoc inline `style`
each currently hand-rolls. Real, already-known call sites to cover: `App.tsx`'s `headerActions`
(theme/system-theme/accent-swatch/settings/version-history buttons), `AccountMenu.tsx`'s dropdown
rows and toggle, `HubDock.tsx`'s tab strip, `ExportButtons.tsx`'s more-menu rows, `DocumentHeader.tsx`'s
status/author/link chips, `SidebarFileExplorer.tsx`'s icon-button row and folder-row action
buttons, `SettingsPanel.tsx`'s category rail and section controls, `DocumentTabs.tsx`, every
`DropdownMenu.tsx` consumer. Each slice verified with real before/after screenshots per this plan's
own 8.5 fixture, not the empty seed document.

### 8.5 — Real verification fixture document
A richly-populated test document (real tags, a status chip set to each value, an author, a link, a
decision log card, a checkbox with sub-items, nested folders in the sidebar) seeded once (a fixture
helper, not committed real user content) and reused as the standard screenshot subject for this
phase's own verification and every phase after it — the actual process fix for why the empty seed
doc let this gap through repeated verification passes already.

## Status

**In progress.** All five phases in this plan's own original sequencing (8.1 CSS primitives, 8.2
icon set, 8.3 shared React components, 8.4 retrofit -- 14 sub-slices, 8.4a through 8.4n, plus two
more found post-8.4n: 8.4o `EmptyDocState.tsx` and 8.4p the Quick Assist app-bar restructuring, and
8.4q's own app-wide scrollbar/canvas-background fix -- and 8.5 the verification fixture) have
landed. **A real gap in this plan's own original scope was found once 8.5's fixture was actually
used**: the plan's own Goal section always scoped this work to "shared chrome" -- the app-bar,
sidebar, document header, toolbar wrapper, dropdown menus, and modals -- and never claimed to
cover the tree editor itself (`OutlineTree.tsx`) or the Pad panel's own internals
(`PadPanel.tsx`), the two largest, most-visible remaining surfaces in the whole app. §8.6 (below)
closed the two smallest, highest-confidence pieces of that gap; the rest -- `OutlineTree.tsx`'s
own row-level class family and `PadPanel.tsx`'s 7-tab retrofit -- are real, separately-scoped
follow-ups (§8.7+), each large enough to be its own slice.

- ✅ **8.1 — CSS primitives landed.** Every class named in this plan's own "Real findings" section
  ported into `web/src/index.css`, verified against the exact legacy lines cited there: `.primary`/
  `.toggle-on` (standalone classes, not `.btn.primary` compounds, since `web/`'s base treatment is
  already global via bare element selectors -- see the CSS's own comment for why), `.icon-btn`/
  `.sb-icon-btn`, the `.export-item`/`.export-icon`/`.export-label`/`.export-section-label` menu-row
  system (plain and `.export-menu-rich` variants), `.status-chip`/`.status-chip-btn`/`.status-
  divider`/`.status-passive`/`.status-strong`/`.status-author-empty`, `.notif-badge`,
  `.account-visibility-badge` (+ `.is-private`/`.is-public`), `.account-danger-item`, and
  `.account-status-dot` (+ its four real sync-state variants). `:root` gained the missing third real
  blend constant, `--accent-hint-blend` (legacy/index.html:311 has three; §6.1 only ported two).
  **A real, unplanned but high-value addition found during this slice**: legacy's own `#appbar
  .btn`/`#header-actions .btn` scoped override (legacy/index.html:813-820) -- the app-bar's real
  buttons are borderless/muted/25px-tall, NOT the generic bordered-pill look the base rule alone
  produces, and this is arguably the single highest-impact rule in the whole plan since it's every
  button in the header row a real user sees first. Porting it needed real `id="appbar"`/
  `id="header-actions"` attributes added to `AppShell.tsx` (previously comment-only annotations)
  and an explicit exclusion for any button nested inside a `role="menu"`/`role="dialog"` descendant
  (this project's own established convention for every popover/modal, confirmed by grep across
  `DropdownMenu.tsx`, `SettingsPanel.tsx`, the three new §7.6 modals, `VersionHistoryPanel.tsx`,
  `RestructureTextDialog.tsx`, and `QuickAssistBar.tsx`'s own popover) -- those need their own
  distinct treatment, not the app-bar's flat icon-row look, and are real DOM descendants of
  `#appbar` (React renders them in place, not portaled), so a plain descendant selector would have
  wrongly caught them too. Verified end-to-end in real headless Chrome, both themes: the header row
  is now visibly borderless/muted/flat matching legacy, while the account-menu dropdown and Settings
  panel (both `role`-excluded) render exactly as before -- zero console/page errors, zero test
  regressions (2005 tests still passing; this slice added CSS only, no new logic to unit-test).
  Every other class ported this slice has no visible effect yet -- nothing in `web/` uses them until
  8.3 builds the shared components and 8.4 retrofits existing call sites onto them, matching this
  plan's own sequencing.
- ✅ **8.2 — Icon set landed.** A real `grep` pass across every `.ts`/`.tsx` file in `web/src`
  (not a guess) for emoji/glyph ranges, cross-checked against real legacy markup for each hit
  before touching it -- several hits turned out to be **already correct**, not gaps: legacy's own
  real toolbar quick-buttons literally contain plain Unicode glyphs, not SVG (`↶`/`↷`/`⇤`/`⇥`/`⤴`
  for Undo/Redo/Outdent/Indent/Insert-above, confirmed at legacy/index.html:6359-6369), Quick
  Insert's `➜`/`✓`/`✗`/`📅` are literal insertable document content (not UI chrome) matching
  legacy's own `QUICK_INSERT_ITEMS`, the sidebar's `▸`/`▾` fold-toggles and `✎`/`⋯` glyphs match
  legacy's own real inline `textContent` assignments (legacy/index.html:30779, 30977), and
  `aiIcon.ts`'s whole `ICON_KEYWORD_MAP` (plus `iconText.ts` and every test referencing it) is a
  real, deliberate content feature -- the AI assigns a literal emoji prefix to a node's own text,
  matching legacy's real behavior -- not a UI icon at all, so none of it was touched.
  New `web/src/icons.tsx`: 22 named icon components, each a direct line-cited port of a real
  legacy `<svg>` (`SettingsGearIcon`, `EyeIcon`/`EyeOffIcon`, `LockIcon`, `TargetIcon`,
  `SearchIcon`, `NewFolderIcon`, `LinkIcon`, `ExternalLinkIcon`, `TrashIcon`, `BellIcon`,
  `CloseIcon`, `CalendarIcon`, `ImageIcon`, `StarIcon`, `SparkleIcon`, `ClockIcon`,
  `SidebarToggleIcon`, `KofiIcon`), plus four with **no legacy equivalent at all** and explicitly
  documented as such rather than presented as ports: `UnlockIcon` (legacy only has a locked-state
  icon), and `MoonIcon`/`SunIcon`/`MonitorIcon` (legacy has no header theme-toggle button
  whatsoever -- theme lives only in Settings → Appearance as text-label segmented buttons; these
  four are built in the same stroke-based style for visual consistency with their new SVG
  neighbors, not ported from anything).
  **A real correction found mid-slice**: §7.5's own header comment claimed "✦ -- same glyph
  legacy's own real qb-ai-rewrite button uses" -- checking the actual markup shows that's wrong;
  `#qb-ai-rewrite` (legacy/index.html:6473) renders a real sparkle `<svg>`, and every text-label AI
  entry point (the right-click context menu, the command palette) pairs that same real SVG with
  its own label, never a bare "✦" substitute anywhere. Fixed across `App.tsx`'s 7 AI toolbar
  buttons, `OutlineTree.tsx`'s context-menu AI entries (which needed `label` widened from `string`
  to `ReactNode` plus an explicit `key` field, since the label itself was doing double duty as the
  list key), and `EmptyDocState.tsx`'s "Generate with AI" button.
  Applied across `App.tsx` (sidebar-toggle/theme/system-theme/version-history/settings-gear),
  `SidebarFileExplorer.tsx` (locate/filter/new-folder/delete-folder -- also picked up the real
  `.sb-icon-btn` class from §8.1 on the three header buttons while touching them),
  `SecureStorageSettings.tsx` (lock/unlock status line), `AiProviderSettings.tsx` (show/hide key),
  `DocumentHeader.tsx` (Add link chip), `HubJournalPanel.tsx` (Jump to date),
  `HubLibraryPanel.tsx` (favorite star ×3, external-link), `SwipeRow.tsx` (mobile delete),
  `AccountMenu.tsx` (Ko-fi), `NotificationBell.tsx` (bell icon + the real `.notif-badge` class
  from §8.1, replacing a hand-rolled approximation of it), and six modal/panel close buttons
  (`HelpModal`/`AboutModal`/`FeedbackModal`/`HubDock`/`VersionHistoryPanel`/`SettingsPanel`) plus
  `DocumentTabs.tsx`'s tab-close and `NotePanel.tsx`'s close/link/image toolbar buttons -- all
  confirmed against a real legacy close-button SVG (legacy/index.html:10660's `.doc-tab-close`)
  shown to be identical everywhere legacy uses a close affordance.
  **Deliberately deferred, each named rather than silently skipped**: `OutlineTree.tsx`'s per-node
  note/code dots (legacy/index.html:20319+ shows a much larger real system here -- decision-log,
  diagram, file, remark, meeting, todo, and mind-map dots all sharing the `.node-note-dot` class,
  most backed by features `web/` hasn't built at all yet) -- a real, separately-scoped retrofit,
  not attempted in this pass given the risk of touching this component's hot per-row render path
  without the full real system behind it. `autoRewriteStore.ts`'s `statusText()`/`aiCall.ts`/
  `aiOutline.ts`'s message strings (which also use "✦") are plain data-layer string contracts
  asserted on by exact-equality tests (`autoRewriteStore.test.ts`) -- changing them to carry a real
  icon needs a return-shape change (text + icon flag) and touches test contracts, not just
  presentation, so left alone as a separate, real follow-up.
  Verified end-to-end in real headless Chrome (dark theme): the header row, sidebar icon row, AI
  toolbar group, account-menu Ko-fi button, and the feedback modal's close button all render real
  crisp line icons instead of emoji/glyphs -- zero console/page errors. Full gauntlet: 2005 tests
  still passing (no test changes needed -- pure presentation swap), typecheck/lint/build all clean.
- ✅ **8.3 — Shared React components landed.** All three named in this plan, in new
  `web/src/components/ui/`:
  - `Button.tsx` -- `variant: 'default' | 'primary' | 'icon' | 'sidebar-icon'`, applying the §8.1
    classes (`.primary`/`.icon-btn`/`.sb-icon-btn`); `'default'` applies no class at all since
    that treatment is already global via `index.css`'s own bare `button` selector. `className` is
    merged, not replaced, so a future caller can layer on a class this wrapper doesn't know about
    yet (`.toggle-on`, `.danger`) without needing a new prop added up front.
  - `MenuItem.tsx` -- the real `.export-item` icon+label row (legacy/index.html:476, 480-491).
    Needs its parent `DropdownMenu` (§7.6) to pass the new `rich` prop (this slice's own addition
    to that component) so the icon-column/label styling actually activates -- `DropdownMenu`
    itself gained `rich?: boolean`, applying the real `export-menu-rich` class
    (`index.css` also gained its own missing base `.export-menu-rich{padding:6px}` rule, found
    while wiring this up -- §8.1 had only ported the rules nested *under* that class, not its own).
  - `Chip.tsx` -- **two** real chip components, not one: `Chip` (the status-bar's real
    `.status-chip`/`.status-chip-btn` family, legacy/index.html:619-623, exactly what the plan
    named) and `DocChip`, a second, **genuinely separate** real chip family
    (`.doc-status-chip`, legacy/index.html:3585-3595) discovered while building this component --
    a solid `data-color`-driven colored pill, not `.status-chip`'s transparent bordered one; easy
    to conflate since both are "a pill chip" but confirmed via real CSS to be two different
    classes with different real treatments. This is the family `DocumentHeader.tsx`'s (§7.4) own
    local `chipStyle()` helper actually approximates, not `Chip` -- a correction to this plan's own
    "Real findings" section, which never named `.doc-status-chip` at all.
    `index.css` gained the full real `.doc-status-chip` family this slice (base + `.unset` +
    `[data-color]` variants + `.doc-author-chip`'s input-specific modifier), same additive/
    line-cited discipline as every other CSS addition in this phase.
  Deliberately **not** built: no unit tests (matching this project's established convention --
  UI components are verified via real headless-Chrome screenshots once something actually renders
  them, not component-level rendering tests; this codebase has never had `@testing-library/react`
  or an equivalent installed, confirmed by checking `web/package.json` rather than assuming). No
  real screenshot verification either, for the same honest reason §8.1's own primitives-only slice
  already established as acceptable: nothing in `web/` imports any of these three components yet
  (that's §8.4's job), so there is nothing on screen to verify. Every prop/class mapping was
  instead checked directly against the real legacy CSS/markup cited above, and the full local
  gauntlet (typecheck/lint/test/build) passed clean with zero behavior change to any existing
  screen -- 2005 tests still passing.
- ✅ **8.4a — Retrofit: app-bar/header (`AccountMenu.tsx`/`ExportButtons.tsx`).** First of the
  §8.4 area-scoped retrofit slices (app-bar/header → sidebar → document header + toolbar → dropdown
  menus + modals, per this doc's own sequencing). Header icon buttons themselves (sidebar-toggle,
  theme, hub, settings-gear, version-history) needed **no** retrofit at all -- confirmed against
  legacy/index.html:813-820 that legacy's own app-bar buttons carry no `.icon-btn`/similar class,
  relying solely on the `#appbar button` selector §8.1 already ported; the real remaining gap was
  the two `DropdownMenu` consumers actually anchored in the header row.
  - `AccountMenu.tsx`: retired its own local `MenuItem`/`Divider` helpers for the shared
    `ui/MenuItem.tsx` inside a real `<DropdownMenu rich>`, added real icons per row
    (`IdCardIcon`/`LoginIcon`/`LogoutIcon`/`BookIcon`/`MessageIcon`/`InfoIcon`, all new this slice,
    each a line-cited port of legacy/index.html:4570-4595), and the real `.export-section-label`
    class for "Help"/"Support" (the latter previously missing entirely -- legacy/index.html:4597
    has it, `web/` never did).
    **A real structural duplication found and fixed**: `SyncStatusIndicator.tsx` (§6.8) rendered a
    SECOND avatar next to `AccountMenu`'s own toggle button specifically because that toggle's
    status dot was a hardcoded green circle -- its own header comment said as much ("no click-to-
    open account dropdown menu... a real, separately-scoped gap"). Legacy has exactly one avatar
    doing both jobs (`#account-toggle`). Folded the live sync-status logic (`state/syncStatusDot.ts`
    plus the same 4000ms bright-then-dim fade timer) into `AccountMenu`'s own toggle button and
    deleted `SyncStatusIndicator.tsx` and its `App.tsx` mount point -- one real avatar, matching
    legacy, not two.
  - `ExportButtons.tsx`: same `MenuItem`/`rich` retrofit, plus real section grouping the flat menu
    never had (`Copy`/`Document`/`Send a copy`/`Data` for Export, `From a file` for Import, direct
    port of legacy/index.html:6222-6253's own real structure) and 12 new per-row icons
    (`UploadTrayIcon`/`DownloadTrayIcon`/`PrinterIcon`/`ClipboardIcon`/`MarkdownFileIcon`/
    `TreeLinesIcon`/`DocFileIcon`/`PdfFileIcon`/`PptFileIcon`/`OpmlIcon`/`SakuraDocIcon`/
    `XlsxFileIcon`), plus the real muted `.export-ext` suffix span for each format's extension
    (`Markdown .md`, `Word .docx`, ...). The root two-level "Export ›/Import ›" in-place submenu
    structure itself is unchanged -- already a documented, deliberate simplification vs. legacy's
    own two-panel click-through (§7.6's own header comment), not something this retrofit revisits.
  **Two more real CSS gaps found and fixed while wiring these two up** (both §8.1 misses, same
  "only the nested rules were ported, not everything around them" pattern §8.3 already caught
  twice): `.export-menu-rich .export-divider` (legacy/index.html:515) and `.export-menu-rich
  .export-ext` (legacy/index.html:514) -- neither existed in `index.css` at all before this slice.
  **A real bug found and fixed in `DropdownMenu.tsx` itself**: its own inline `style={{padding:4}}`
  always beat the real `.export-menu-rich{padding:6px}` class regardless of the `rich` prop, since
  inline style outranks a class selector -- invisible until this slice gave it its first real `rich`
  consumers to expose it. Now `padding: rich ? 6 : 4`.
  **A real gap in `ui/MenuItem.tsx` itself found and fixed**: its icon `<span>` never carried the
  real `.export-icon.danger` modifier (legacy/index.html:4587) even when the row's own `danger` prop
  was set -- missed in §8.3 since it had no real consumer yet to expose it.
  Verified end-to-end in real headless Chrome: account-menu (signed-out state, real primary Sign-in
  button, icons/dividers/section-labels), export-menu root/Export/Import all screenshotted and
  visually matching legacy's real structure. Full gauntlet clean: 2005 tests still passing (no test
  changes needed), typecheck/lint/build all clean.
- ✅ **8.4b — Retrofit: sidebar (`SidebarFileExplorer.tsx`).** A real class family §8.1's own
  pass never covered at all -- that pass scoped to the button/menu/chip/badge system, not the
  file explorer's own distinct row/label/hover-reveal-actions visual language
  (legacy/index.html:1524-1563, 1601-1602, 1618) -- only found while retrofitting this file's ad
  hoc inline `style` objects onto real classes. `index.css` gained the full family: `.sb-section-
  hdr`/`.sb-section-label`/`.sb-section-actions`, `.sfolder-row`/`.sfolder-toggle`(+`.open`)/
  `.sfolder-name`/`.sfolder-name-input`/`.sfolder-count`/`.sfolder-actions`/`.sfolder-children`,
  `.sdoc-item`(+`.active`)/`.sdoc-name-btn`/`.sdoc-actions`/`.sdoc-meta`/`.sdoc-action-btn`
  (+`.danger`), `.sb-unfiled-row`/`.sb-unfiled-count`, `.sb-empty` -- scoped down from legacy's
  full real family to what `web/` has real backing for (no `.sfolder-icon`/`.sdoc-icon`, no drag-
  and-drop/context-menu/multi-select variants, none of which exist in `web/`).
  **The header icon buttons themselves also moved onto the real `Button` component** (§8.3,
  `variant="sidebar-icon"`) in place of a bare `className="sb-icon-btn"` on a plain `<button>` --
  same visual result, but now going through the shared primitive like every other retrofit slice.
  **A real, previously-invisible behavior gap closed**: legacy's own `.sfolder-actions`/
  `.sdoc-actions` are `display:none` until `:hover` (revealing Move/Rename/Delete only on hover,
  showing a doc count/relative-time meta the rest of the time) -- `web/`'s old inline-styled
  buttons were always visible, a real, if subtle, visual difference now fixed by the CSS itself
  (no JS hover-state needed). The fold-toggle is now a real `<button className="sfolder-toggle">`
  rendering legacy's own single rotating `▶` glyph (`.open` rotates it via CSS `transform`), not a
  swap between two different `▾`/`▸` characters.
  **Two real functional gaps closed alongside the visual ones, found while comparing this file's
  doc row against legacy's real `makeDocItem` (legacy/index.html:30033-30107)**: `web/` had *no*
  way to delete or rename a document from the sidebar at all -- `documentsStore.ts`'s own
  `deleteDocument`/`renameDocument` actions already existed, fully real and already covered by
  that store's own tests, just with zero UI entry point anywhere in the app (confirmed via grep).
  Added real `.sdoc-action-btn` Rename (`✎`, reusing this file's own already-established inline-
  edit pattern, the folder row's `renamingFolderId`'s new sibling `renamingDocId` -- not a
  `window.prompt`) and "Move to Trash" (`TrashIcon`, `window.confirm`, matching the folder row's
  own already-established delete-confirmation convention) buttons, plus a relative-time
  `.sdoc-meta` badge (`formatRelativeTime`, an already-existing, already-tested util with no
  caller before this). Deliberately **not** added: a Duplicate button (legacy/index.html:30099-
  30100) -- `documentsStore.ts` has no `duplicateDoc` action at all to back it with, so building
  that button now would be dead UI, not a shortcut, matching this project's own established "no
  dead UI" discipline (`App.tsx`'s own toolbar-group comment gives the same reasoning for its own
  deferred buttons) -- a real, separately-scoped follow-up, not silently dropped. The move-to-
  folder `<select>` itself (an already-documented deliberate simplification of legacy's own
  button+popover, §7.7) is unchanged, now gated behind `folders.length > 0` matching legacy's own
  real conditional (`if(allFolders.length>0)`) rather than always rendering.
  Verified end-to-end in real headless Chrome: base state (folder + docs, real section labels/
  counts), doc-row hover (actions revealed, meta hidden, real icons), folder-row hover (actions
  revealed, count hidden) -- all screenshotted and matching legacy's real hover-reveal behavior.
  Full gauntlet clean: 2005 tests still passing (no test changes needed), typecheck/lint/build all
  clean.
- ✅ **8.4c — Retrofit: document header (`DocumentHeader.tsx`).** Split out of the plan's original
  "document header + toolbar" slice (see this doc's own Sequencing summary correction above) once
  investigation showed the document header alone needed a real class family entirely missing from
  `index.css` -- another real §8.1-scope miss (that pass covered buttons/menus/chips/badges, not
  this component's own row/input/popover system), only found while retrofitting this file's local
  `chipStyle()` helper (an ad hoc flat bordered-pill approximation) onto the real classes.
  `index.css` gained: `.editor-title-row`/`.editor-title-input`/`.editor-meta-row`
  (legacy/index.html:790, 797-801 -- the title's real `800 28px` weight/size, not the `700 22px`
  `chipStyle()`'s neighbor inline style used, plus the real canvas-background/padding wrapper
  neither existed at all), `.todo-dd-item`(+`.selected`) (legacy/index.html:3703-3723 -- a real,
  DIFFERENT menu-row family from `.export-item`, backing the status popover's direct-select rows;
  scoped down to what this popover actually uses, no `.todo-dd-item-icon`/`.dd-check` variants
  since nothing in `web/` needs them yet), and `.doc-link-menu-inner`/`.meta-input`/
  `.doc-link-menu-actions`/`.doc-link-menu-btn`(+`.primary`) (legacy/index.html:3704-3711 -- the
  link popover's own real form/button styling, including its real solid-accent primary Save
  button, which this component never had before).
  The status/link chips now render through §8.3's `DocChip` component directly; the author field
  (a real `<input>`, not a `<button>`, per `Chip.tsx`'s own header comment anticipating exactly
  this) applies the same `doc-status-chip`/`.unset`/`.doc-author-chip` classes directly, since
  `DocChip` itself only renders a button. A small `STATUS_COLOR_KEY_TO_DOC_CHIP` map bridges
  `docStatusColorKeyCore`'s pre-existing `ThemeTokens`-preset-key return shape (`'fcOrange'` etc.,
  still used by other callers) to `DocChip`'s own `DocChipColor` (`'orange'` etc.) rather than
  changing that shared function's return type for one caller.
  Verified end-to-end in real headless Chrome: base state (real 28px title on canvas background,
  solid status pill, author chip, dashed "Add link" chip), status popover open (accent-colored
  selected row + checkmark), link popover open (real bordered inputs, solid primary Save button)
  -- all screenshotted and matching legacy's real structure. Full gauntlet clean: 2005 tests still
  passing (no test changes needed), typecheck/lint/build all clean.
- ✅ **8.4d — Retrofit: toolbar (`App.tsx`'s `ToolbarGroup`/quick-bar block).** Ported the real
  `#quick-bar`/`.action-group`/`.ag-buttons`/`.ag-label`/`.quick-btn`/`.quick-sep` family
  (legacy/index.html:1093-1106) into `index.css`, placing `.quick-btn` AFTER `.icon-btn` in file
  order so the cascade produces the same 34x34 sizing win legacy's own source order does (legacy's
  real markup always combines both classes on one button). `ToolbarGroup` itself now renders
  through `.action-group`/`.ag-buttons`/`.ag-label` instead of its original ad hoc inline `style`
  objects, and every icon-only button in the History/Structure/Format/Insert/Delete groups now
  goes through `<Button variant="icon" className="quick-btn">` (the Delete button additionally
  gets `danger-hover`, matching legacy's own real class on that same button). A `.quick-sep`
  divider now sits between every group, and the wrapper itself carries a real `id="quick-bar"`
  for the ported container styling (border-bottom/background/padding), same convention as
  `#appbar`/`#header-actions` from §8.1.
  **Two real scoping decisions made and documented, not silently dropped** (both flagged as open
  questions in this slice's own handoff): (1) legacy hides `.ag-label` by default behind a
  `body.show-toolbar-labels` class flipped by a Settings toggle `web/` doesn't have -- ported as
  unconditionally visible instead (`index.css`'s own `.ag-label` comment), matching
  `ToolbarGroup`'s pre-existing always-visible-label behavior and this project's own established
  "no toggle exists yet to gate this" precedent (e.g. the AI group's own already-visible buttons),
  rather than porting a toggle-gated default that would leave the label permanently invisible with
  no way to ever reveal it. (2) the `@media (max-width:560px)` responsive bump (legacy/index.html:
  1106) was deliberately NOT ported -- confirmed via `App.tsx`'s own `isMobile` check that it
  returns `<MobileHub />` entirely below the mobile breakpoint before ever reaching this toolbar's
  JSX, so the rule would be unreachable dead CSS in `web/`, not a real simplification of behavior
  that exists.
  **The AI group's buttons deliberately do NOT get `.quick-btn`'s fixed 34x34 sizing**, found while
  implementing this slice: legacy's own real AI quick-bar buttons (`#qb-ai-outline` etc.,
  legacy/index.html:6468-6478) are icon-only, same as every other group -- but `web/`'s AI group
  (an already-documented §7.5 simplification) pairs each icon with a real word label
  ("Rewrite"/"Outline"/"Expand"/...) that a fixed-width icon square can't hold without clipping.
  Left on the base default button treatment instead, inside the same real `.action-group`/
  `.ag-buttons`/`.ag-label` wrapper as every other group -- a real, deliberate, documented
  deviation for this one group's buttons specifically, not a gap in the retrofit.
  **A real side-by-side screenshot comparison against legacy's own live toolbar** (both loaded
  fresh, sign-in skipped, onboarding dismissed, toolbar revealed via each app's own real reveal
  control) confirmed the retrofit matches: same grouped-pill tinted backgrounds, same uppercase
  small-caps group labels, same icon-only square buttons with the same rounded-corner hover lift,
  same thin group separators. Legacy's own screenshot also re-confirmed two pre-existing, already-
  documented `web/` scope gaps as real and unrelated to this slice: legacy's real default hides
  4 of its 6 AI actions (Expand/Summarise/Tags/Icon) behind a Settings toggle `web/` doesn't have
  (§7.5's own comment already named this), and legacy has a "Move" group (up/down) `web/` has never
  built (no backing action exists yet, already named as a post-cutover-backlog gap) -- neither
  touched by this retrofit slice. Full gauntlet clean: 2005 tests still passing (no test changes
  needed, pure presentation/structure swap), typecheck/lint/build all clean (lint's one warning is
  the same pre-existing unrelated `diagramGenLegend.test.ts` warning every prior 8.x slice has
  noted).
- ✅ **8.4e — Retrofit: document tabs (`DocumentTabs.tsx`).** Ports legacy's real document-tab-
  strip family (legacy/index.html:1057-1092/6336-6349) into `index.css`: `#doc-tab-strip-row`,
  `#doc-tab-strip`, `.doc-tab`(+`.active`/`.dragging`/`.drag-over-left`/`.drag-over-right`)/
  `.doc-tab-title`/`.doc-tab-close`, `.doc-tab-add`, `.doc-tab-overview-wrap`/`-btn`/`-menu`/
  `-item`(+`.active`/`.kbd-active`)/`-title`/`-empty`. `DocumentTabs.tsx` rendered every tab, the
  "+" button, and the tab-overview dropdown entirely with ad hoc inline `style` objects before
  this slice -- a real gap this phase's own §8.1 pass never covered (it scoped to buttons/menus/
  chips/badges, not the tab strip's own distinct row system, the same kind of miss already found
  for the sidebar in §8.4b and the document header in §8.4c). Deliberately not ported:
  `.doc-tab-dirty`/`.is-dirty`/`.doc-tab-overview-dirty` (`web/` has no dirty-tracking concept --
  autosave is the only save path, per this component's own pre-existing header comment) and
  `.doc-tab.pinned`+`.doc-tab-pin-icon` (no `documentsStore.ts` pinning action to back it).
  **A real, previously-invisible browser bug found and fixed while building this slice, not just
  a missing-CSS gap**: `#doc-tab-strip-row` and `#doc-tab-strip` are TWO distinct real legacy ids,
  not one -- legacy's actual markup (legacy/index.html:6336-6349) nests the scrollable
  `#doc-tab-strip` (tabs only) INSIDE the non-scrolling `#doc-tab-strip-row`, with the "+" button
  and the tab-overview dropdown as its SIBLINGS, never its descendants. An early version of this
  slice (and, separately, `AppShell.tsx`'s own pre-existing Phase 6.1 approximation, which had
  invented a "`#doc-tab-strip-row`" *name* for this container but never actually ported its real,
  separate CSS rule) collapsed both into one `#doc-tab-strip` wrapping everything, which
  reproduced a genuine Chromium layout bug: focusing the dropdown's `autoFocus` search input
  triggered a scroll-into-view on the nearest `overflow-x:auto` ancestor -- `#doc-tab-strip`
  itself -- even with `overflow-y:hidden` on it, silently shifting every tab and the dropdown
  upward by the resulting scroll offset (confirmed via `scrollTop` going from 0 to a nonzero
  value) every single time the dropdown opened, hiding the whole tab row behind it. Verified via
  real bisection (`overflow-x`/`overflow-y`/`align-self` experiments before finding the true
  cause) and a direct legacy-markup read, not guessed. Splitting the two ids apart to match
  legacy's real DOM -- `AppShell.tsx`'s own wrapper now correctly carries `id="doc-tab-strip-row"`
  with only `#doc-tab-strip-row`'s own real CSS (previously it had `#doc-tab-strip`'s properties
  under the wrong name), and `DocumentTabs.tsx` renders its own inner `#doc-tab-strip` around just
  the tab chips -- fixes the bug structurally, the same way legacy avoids it, rather than a JS
  workaround (`preventScroll`, manual scroll-restore, etc.).
  Verified end-to-end in real headless Chrome: base tab-strip state (rounded active/inactive tabs,
  real `+`/`▾` controls) and the tab-overview dropdown open (tabs still visible alongside it, both
  before and after the fix) -- screenshotted and matching legacy's real structure and behavior,
  plus a direct side-by-side against a live legacy screenshot of the same interaction. Full
  gauntlet clean: 2005 tests still passing (no test changes needed), typecheck/lint/build all
  clean.
- ✅ **8.4f — Retrofit: Settings rail + Hub dock tabs (`SettingsPanel.tsx`/`HubDock.tsx`).**
  **Correction found during 8.4e's own investigation**: this plan's original 8.4 area split named
  the last retrofit slice "dropdown menus + modals," but every real `DropdownMenu.tsx` consumer
  (`AccountMenu.tsx`, `ExportButtons.tsx`, `DocumentHeader.tsx`'s two popovers) was already
  retrofitted in 8.4a/8.4c -- there is no dropdown-menu work left. What's actually still missing,
  confirmed by grep against real legacy classes with zero matches in `index.css`: `.settings-rail`/
  `.settings-rail-btn` (the Settings panel's own category sidebar, legacy/index.html:3296-3304),
  `.dock-tab` (`HubDock.tsx`'s own tab strip, legacy/index.html:3653-3657), and the shared modal/
  dialog chrome (header/close/footer button treatment) behind every `role="dialog"` component.
  Renumbered 8.4e (dropdown menus + modals) to 8.4f (settings rail + hub dock tabs), splitting the
  modal/dialog chrome back out again into its own 8.4g once investigation showed it touches 10
  separate `role="dialog"` components (`SignInGate.tsx`, `VersionHistoryPanel.tsx`,
  `WelcomeModal.tsx`, `FeedbackModal.tsx`, `HelpModal.tsx`, `IconPickerPopover.tsx`,
  `NotificationBell.tsx`, `QuickAssistBar.tsx`, `RestructureTextDialog.tsx`, `AboutModal.tsx`) --
  too much surface area for one reviewable PR alongside the rail/tab-strip work, the same "split
  further/resequenced by whoever picks up each slice" flexibility this doc's own Sequencing
  summary already reserved, matching the precedent set when 8.4c split out of the original
  "document header + toolbar" slice.
  **Settings rail** (`SettingsPanel.tsx`): ports `.settings-panel`/`.settings-header`/
  `.settings-body`/`.settings-rail`/`.settings-rail-btn`(+`.active`)/`.settings-content` (legacy/
  index.html:392-397, 3288-3302) -- legacy's real merged base-anchored-popover-plus-rail-layout
  rule, combined into one block here since `web/` only ever renders the "has a rail" shape legacy
  reaches via a later cascade override. Real nested structure ported too (`.settings-header` above
  a bordered-top `.settings-body` holding `.settings-rail` + `.settings-content`), not the single
  flat container this component started with. **A real icon gap found and fixed**: legacy's rail
  buttons have always had real per-category icons (legacy/index.html:4622-4670); `web/`'s rail
  (§6.10 slice 2) never did -- text-only buttons. Three new icons ported to `icons.tsx`
  (`AppearanceIcon`/`EditPencilIcon`/`DatabaseIcon`, each a direct port at legacy's real 14x14/
  `stroke-width:1.8` sizing, different from this file's own 24x24 convention since that's what
  legacy's rail actually ships), plus two reused: `IdCardIcon` (byte-identical path data to
  legacy's own `data-cat="account"` icon) and `SparkleIcon` (legacy's own `data-cat="ai"` icon).
  Deliberately not ported: the `@media (max-width:700px)` responsive collapse (same reasoning as
  §8.4d's toolbar decision -- `SettingsPanel.tsx` is only ever mounted from within `App()`, which
  returns `<MobileHub />` entirely below that breakpoint, making the rule unreachable dead CSS),
  the settings-search box treatment (no real `web/` feature, already named as out of scope in this
  file's own header), and the "features" rail button's unread-dot indicator (no "features"
  category exists in `web/`'s subset).
  **Hub dock tabs** (`HubDock.tsx`): ports `#dock-tabstrip`/`.dock-tab`(+`.active`) (legacy/
  index.html:3650-3659) -- a real horizontal icon+label row with an accent underline on the active
  tab, replacing this component's original vertical icon-over-label stack splitting the row into
  equal-width columns. `#dock-tabstrip`'s own `display:none`/`.active{display:flex}` toggle is
  skipped (a real, documented `web/`-specific simplification): `HubDock.tsx` already returns
  `null` outright when no tab is open, so the conditional render already does what the class
  toggle does in legacy. `#dock-tabstrip-spacer` ported as a real `.dock-tabstrip-spacer` class
  (not inline style, matching this phase's own "no ad hoc styling" standard even for a one-property
  rule); `#dock-tabstrip-maximize` (legacy's "expand to full view" control) deliberately NOT
  ported -- `web/`'s dock has no maximize/full-view concept to back it, so building that button
  now would be dead UI.
  Verified end-to-end in real headless Chrome: Settings panel (rail with all 5 real icons, active-
  category highlight, category switching to a second category) and the Hub dock tab strip (icon+
  label tabs, accent underline on the active tab) -- both screenshotted and matching legacy's real
  structure. Full gauntlet clean: 2005 tests still passing (no test changes needed), typecheck/
  lint/build all clean.
- ✅ **8.4g — Retrofit: generic dialog shell (`FeedbackModal.tsx`/`AboutModal.tsx`/`HelpModal.tsx`).**
  **Correction found during 8.4g's own investigation**: this plan's original 8.4g scope named all
  10 `role="dialog"` components as one slice, but a real per-component investigation (checking each
  one's actual legacy markup, not assuming they share a class) found they map to at least 7
  genuinely DIFFERENT real legacy families -- far too heterogeneous for one PR. Confirmed by line:
  - `.app-modal-overlay`/`.app-modal`/`.app-modal-head`/`.app-modal-close-btn`/`.app-modal-body`
    (legacy/index.html:926-936) -- the generic "simple centered dialog box" shell. `FeedbackModal.tsx`
    is a literal 1:1 port of legacy's own `#feedback-modal-overlay` (legacy/index.html:7077-7092).
    **This slice's actual scope.**
  - `#sakura-landing-overlay`/`#sakura-landing-card`/`#sakura-landing-brand`/etc. (legacy/
    index.html:698-704, markup at 4498-4526) -- `SignInGate.tsx`'s real target, a bespoke full-page
    landing overlay, not a generic modal.
  - `#welcome-overlay`/`#welcome-modal`/`.welcome-choice` (markup at legacy/index.html:7639-7661)
    plus the stacked `#why-sakura-overlay` (7663-7708) -- `WelcomeModal.tsx`'s real target, its own
    bespoke onboarding-card family.
  - `.history-modal-overlay`/`.history-modal` (legacy/index.html:1396-1399) -- `VersionHistoryPanel.tsx`'s
    real target. Same general shape as `.app-modal-*` (centered box, animated open transform) but
    with its own distinct real values (rgba(0,0,0,.38) not .5, z-index 200 not 1100, width 440 not
    640, a translateY/scale open transition `.app-modal` doesn't have) -- a genuinely separate
    class, not reusable as `.app-modal-*` without a real inaccuracy.
  - `.icon-picker-popover` (legacy/index.html:1196-1199, markup at 7344) -- `IconPickerPopover.tsx`'s
    real target, a small inline icon-button row. Legacy's own real markup uses `role="menu"`, not
    `role="dialog"` -- `web/`'s current `role="dialog"` is itself a real a11y mismatch to fix
    alongside the CSS.
  - `.export-menu`/`.export-menu-rich` (already ported in §8.1) plus new `.notif-menu-header`/
    `.notif-menu-title` (legacy/index.html:496-498, markup at 4550-4555) -- `NotificationBell.tsx`'s
    real target. Legacy's own `#notif-menu` is a real `DropdownMenu`-family consumer
    (`class="export-menu export-menu-rich"`), not a standalone popover -- `web/`'s current ad hoc
    implementation should retrofit onto the EXISTING `DropdownMenu.tsx`/`MenuItem.tsx` components
    (§7.6/§8.3), not a new one.
  - `.qa-input-row`/`.qa-dropdown`/`.qa-hint`/`.qa-results` (legacy/index.html:6769-6788) --
    `QuickAssistBar.tsx`'s real target, its own command-palette-specific family.
  - `#sakura-modal-overlay`/`#sakura-modal`/`#sakura-modal-body` (legacy/index.html:635-643, markup
    at 7783) -- the real generic *animated prompt/confirm* dialog every `sakuraTextareaPrompt`/
    `sakuraLinkPrompt` call opens via `_openModal` (legacy/index.html:18434+). `RestructureTextDialog.tsx`'s
    real target. `AboutModal.tsx`/`HelpModal.tsx` have no direct legacy modal at all (legacy's real
    About/Help live inside Settings/`#help-panel`, not a standalone dialog) but render the exact
    same "simple centered dialog" shape `FeedbackModal.tsx` does, so they reuse `.app-modal-*` too,
    for `web/`-internal visual consistency, not presented as literal legacy ports.
  Renumbered: 8.4g is now scoped to just the `.app-modal-*` family (`FeedbackModal.tsx`, a literal
  port, plus `AboutModal.tsx`/`HelpModal.tsx` reusing the same shell for consistency). The other 7
  components move to later slices once picked up, each already scoped above with its real target
  family and line citations so that work doesn't need to re-investigate:
  8.4h (SignInGate.tsx), 8.4i (WelcomeModal.tsx + why-sakura), 8.4j (VersionHistoryPanel.tsx),
  8.4k (IconPickerPopover.tsx -- also fix its `role` mismatch), 8.4l (NotificationBell.tsx, retrofit
  onto `DropdownMenu`/`MenuItem`), 8.4m (QuickAssistBar.tsx), 8.4n (RestructureTextDialog.tsx).
  Same "split further/resequenced by whoever picks up each slice" flexibility this doc's own
  Sequencing summary already reserves.
  **`role="dialog"` moved from the inner box to the overlay element** in all three retrofit
  components, matching legacy's own real markup exactly (`#feedback-modal-overlay` itself carries
  the role, not its inner `.app-modal` box) -- the former backdrop `role="presentation"` is dropped
  since the overlay is now the real dialog root.
  **Two new icons added to each modal's title**, none of which existed before since these
  components only ever rendered a bare text title: `<MessageIcon>` for Feedback (legacy/index.html:
  7080's own real inline `<svg>`, a literal match), `<InfoIcon>`/`<BookIcon>` for About/Help
  (reusing the same icons already used for each entry's own row in `AccountMenu.tsx`'s dropdown,
  for self-consistency since neither has a real legacy modal header to match).
  Verified end-to-end in real headless Chrome: all three modals (Feedback with its textarea/email
  form, About with its four paragraphs of copy, Help with its placeholder copy) screenshotted --
  consistent header/close/body chrome, correct icons, matching the shared shell. Full gauntlet
  clean: 2005 tests still passing (no test changes needed), typecheck/lint/build all clean.
- ✅ **8.4h — Retrofit: `SignInGate.tsx` onto `#sakura-landing-*`.** Real legacy source: CSS at
  legacy/index.html:698-704, markup at 4498-4526 (both already cited by this file's own header
  before this slice). Legacy's own `#sakura-landing-*{...}` CSS block only ever names the
  overlay/card/brand/brand-icon/brand-name/heading/sub shell -- every other element inside (Google
  button, "or" divider, email toggle/form/inputs/error/submit, mode-toggle, forgot-password,
  continue-without-signing-in) is legacy's own real per-element inline `style=""`, not a named
  class, confirmed by reading the real markup line-by-line -- so this slice only added the 7 real
  `#sakura-landing-*` ids/CSS rules to `index.css`, leaving every other element's inline styling in
  place (it was already a close-to-exact match; see the two real mismatches fixed below).
  `#sakura-landing-overlay` omits legacy's own `display:none` toggle since `SignInGate.tsx` only
  ever mounts this element while visible, the same React mount/unmount-replaces-class-toggle
  precedent already used for `#dock-tabstrip`/`.app-modal-overlay`.
  **Two real mismatches found and fixed along the way, beyond the planned CSS-family port**:
  (1) the brand icon was sized with a hardcoded `width={40} height={40}` on the `<svg>`; legacy's
  real technique sizes it via the wrapper's `font-size:56px` with the svg itself at
  `width="1em" height="1em"` -- fixed to match legacy's actual mechanism, not just its rendered
  size. (2) the Google/email-submit buttons and the email/password inputs were missing the plain
  `border`/`background`/`color` inline overrides legacy's own markup gives them on top of `web/`'s
  bare-element-selector base treatment (§6.1) -- without them these rendered with the base
  treatment's accent-tinted border/text color instead of legacy's real plain
  `var(--border)`/`var(--edit-bg)`/`var(--fg)`, a real visual gap a side-by-side would have caught.
  Verified end-to-end in real headless Chrome: initial gate (56px icon, bordered Google button),
  email form expanded (plain-bordered white inputs, bordered Sign In button), and dismissal (gate
  closes, app underneath renders normally) all screenshotted and correct. Full gauntlet clean: 2005
  tests still passing (no test changes needed), typecheck/lint/build all clean.
- ✅ **8.4i — Retrofit: `WelcomeModal.tsx` onto `#welcome-*`/`#why-sakura-*`.** Real legacy source:
  markup at legacy/index.html:7639-7708, CSS at 665-787 (both already cited by this file's own
  header before this slice). Ported the full real class family for both overlays: `#welcome-
  overlay`/`#welcome-modal`(+`-brand`/`-brand-icon`/`-brand-name`/`-sub`)/`#welcome-choices`/
  `.welcome-choice`(+hover/focus)/`.welcome-choice-icon`/`.welcome-choice-text`/`-label`/`-desc`/
  `#welcome-skip`/`#welcome-why-link`/`#welcome-editors-choice-link`, and `#why-sakura-overlay`/
  `#why-sakura-modal`(+`-brand`/`-brand-icon`/`-brand-name`/`-sub`)/`#why-sakura-list`/`.why-row`/
  `.why-row-icon`/`.why-row-text`/`-label`/`-desc`/`#why-sakura-caveat`/`#why-sakura-close`. Both
  overlays skip legacy's own `.open`/`.closing` opacity-fade + transform-scale enter/exit
  transition (legacy/index.html:665-670, 691-697) -- same React mount/unmount-replaces-class-toggle
  precedent as `#dock-tabstrip`/`.app-modal-overlay`/`#sakura-landing-overlay`, rendering directly
  at legacy's own "open" end state.
  **Two real visual gaps found and fixed, beyond the planned CSS-family port**: the choice-row
  icons (`.welcome-choice-icon`/`.why-row-icon`) previously rendered as bare, unstyled spans;
  legacy's real CSS gives each a rounded accent-tinted badge background (36px/30px respectively) --
  now matched. `#why-sakura-close` ("Got it — let's start") previously rendered as a plain
  unstyled button; legacy's real CSS makes it a solid accent-filled primary button (`background:
  var(--accent);color:#fff`) -- now matched, a real, visible mismatch a side-by-side would have
  caught immediately.
  Verified end-to-end in real headless Chrome (dismissing the §8.4h sign-in gate first, then
  waiting out the real 500ms boot delay): the welcome modal's two bordered choice cards with
  accent-badge icons, and the stacked "Why an outliner" modal's five accent-badge rows plus the
  accent-filled close button, both screenshotted and correct. Full gauntlet clean: 2005 tests still
  passing (no test changes needed), typecheck/lint/build all clean.
- ✅ **8.4j — Retrofit: `VersionHistoryPanel.tsx` onto `.history-modal-*`.** Real legacy source:
  markup at legacy/index.html:7794-7799, CSS at 1396-1415 (both already cited by this file's own
  header before this slice). A genuinely distinct shell from `.app-modal-*` despite the similar
  centered-box shape, confirmed by real values: different rgba (`.38` not `.5`)/z-index (200 not
  1100), a real `.open` transform-scale enter transition `.app-modal` doesn't have, and its own
  close-button treatment -- legacy's real `.history-modal-close-x` is a plain "×" text glyph, not
  an svg icon like `.app-modal-close-btn` -- so this slice switched the close button off the
  generic `<CloseIcon>` it previously used, to match. Ported the full real class family:
  `.history-modal-overlay`/`.history-modal`/`-header`/`-title`/`-close-x`/`-body`/`-footer`/
  `-footer-hint`, plus the row family `.history-row`/`-info`/`-time`/`-meta`/`-restore` and
  `.history-empty`. Skips legacy's own `.open` opacity-fade + transform-scale enter transition,
  same React mount/unmount precedent as `.app-modal-overlay`/`#welcome-overlay`.
  `web/`'s own component stays scoped to whole-document history only (its own pre-existing header
  already established this), so legacy's separate per-node history mode (`.history-row-now`, a
  distinct "current text" row with no restore button, part of `renderVersionHistoryList`'s other
  branch) has no `web/` equivalent to match -- not attempted here, consistent with that existing
  scope, not a new gap.
  Verified end-to-end in real headless Chrome: the panel with an existing auto-captured revision
  row, then again after "Save a version now" added a second row -- bordered card, em-dash title,
  "×" close button, and bordered `Restore` buttons all rendering correctly. Full gauntlet clean:
  2005 tests still passing (no test changes needed), typecheck/lint/build all clean.
- ✅ **8.4k — Retrofit: `IconPickerPopover.tsx` onto `.icon-picker-popover`.** Real legacy source:
  markup at legacy/index.html:7344, CSS at 1196-1199 (both already cited by this file's own
  header before this slice). Confirmed the real a11y mismatch this plan's own investigation
  flagged: legacy's real `#icon-picker-popover` carries `role="menu"`, not `role="dialog"` --
  `IconPickerPopover.tsx`'s previous `role="dialog"` was a genuine mismatch, fixed alongside the
  CSS. Ported `.icon-picker-popover`'s own visual chrome (background/border/radius/shadow/padding/
  gap) plus its real borderless-button-with-hover treatment (`.icon-picker-popover button`) --
  legacy's real candidate buttons have no border at all and highlight via `var(--hover)` on hover,
  a real visual difference from `IconPickerPopover.tsx`'s previous bordered-pill buttons.
  `position`/`z-index` deliberately stay on the wrapping backdrop div, not the ported class --
  `IconPickerPopover.tsx`'s own pre-existing header already documents why this renders centered
  behind a transparent click-catcher rather than legacy's real JS-computed anchor-above-the-row
  position (no stable row-anchor selector in `web/`'s tree); that backdrop's own tint also changed
  from an invented `rgba(0,0,0,.15)` dark overlay to fully transparent, since legacy's real popover
  has no dimming behind it at all.
  Verified end-to-end in real headless Chrome (driving `iconPickerStore.ts` directly in dev mode,
  since triggering the real path needs a configured AI provider key): four candidate emoji
  rendering as a compact, undimmed, borderless-button popover matching legacy's real chrome. Full
  gauntlet clean: 2005 tests still passing (no test changes needed), typecheck/lint/build all
  clean.
- ✅ **8.4l — Retrofit: `NotificationBell.tsx` onto the existing `DropdownMenu`.** Real legacy
  source: markup at legacy/index.html:4550-4555, CSS at 496-513 (both already cited by this file's
  own header before this slice). Confirmed legacy's real `#notif-menu` is itself a
  `class="export-menu export-menu-rich"` consumer, not a standalone popover -- so this slice
  retrofits onto the EXISTING `DropdownMenu.tsx`/`rich` prop (§7.6/§8.3) rather than building a new
  overlay, adding only what `.export-menu-rich` doesn't already cover: `.notif-menu-header`/`-title`/
  `.notif-clear-all`, and the row family `.notif-item`(+`.unread`)/`-body`/`-text`/`-meta`/
  `-dismiss`/`.notif-empty`. `DropdownMenu.tsx` gained one small, generic, optional `maxHeight` prop
  (matching legacy's own real `#notif-menu{max-height:380px}`) -- additive, no other consumer
  passes it, so no other `DropdownMenu` usage changes behavior.
  **A real content gap found and fixed, not just styling**: legacy's own `renderNotifList` always
  shows a per-item relative-timestamp line (`.notif-item-meta`); `NotificationBell.tsx` never
  rendered one, even though `NotifItem.createdAt` was already available -- now wired through the
  already-ported `formatRelativeTime` util.
  Verified end-to-end in real headless Chrome: the empty state ("You're all caught up", uppercase
  muted header) confirmed first, then two real local notifications pushed via `pushLocalNotification`
  (the direct Zustand-`setState` approach was tried first and found to be overwritten immediately --
  `setMenuOpen`'s own real `refresh(set)` call recomputes `items` from `combinedNotifItems()` on
  every open, so seeding through the real local-notification path was the only way to see genuine
  data) -- red badge, per-row unread accent dot, "just now" relative time, and "Clear all" button
  all rendering correctly. Full gauntlet clean: 2005 tests still passing (no test changes needed),
  typecheck/lint/build all clean.
- ✅ **8.4m — Retrofit: `QuickAssistBar.tsx` onto the real `.qa-*` family.** Real legacy source:
  CSS at legacy/index.html:1117-1177, markup at 6769-6788 (both already cited by this file's own
  header before this slice). Ported the full real class family: `.qa-input-row`/`.qa-icon-btn`/
  `.qa-dropdown`/`.qa-hint`(+`-label`/`-phrases`/`-phrase`)/`.qa-results`/`.qa-item`(+`.qa-active`/
  `.qa-item-disabled`/`-verb`+`.qa-verb-hide`/`-goto`/`-run`/`-label`/`-state`)/`.qa-chip-row`/
  `.qa-item-chip`/`.gs-group-title` (the last one also shared with the picker's own "Browse by
  action…"/"Search within…" section titles, confirmed real via legacy/index.html:17529,17542).
  **A real structural finding, deliberately NOT acted on**: legacy's own real Quick Assist input is
  a PERMANENTLY-VISIBLE search-style box docked in the status bar or app bar
  (`setQaLocation`/`#appbar-qa-slot`, legacy/index.html:21054-21068) -- there is no click-to-reveal
  toggle at all in legacy. `QuickAssistBar.tsx` predates this slice with its own `web/`-only "⌘K"
  toggle-button-then-popover structure (§6.10) -- this slice does NOT redesign that (a real,
  separately-scoped structural change, not a CSS retrofit), reusing legacy's real classes for their
  cosmetic properties only and keeping `web/`'s own toggle-button mount and the popover's own
  absolute positioning, same "port the effect, not the exact technique" precedent already used for
  `IconPickerPopover.tsx`. `.qa-input-row`'s own real per-context fixed/focus-expanding `width`
  values (meaningless inside a fixed-width popover) are skipped for the same reason.
  Verified end-to-end in real headless Chrome: the hint state (pill-shaped phrase chips), a real
  command result row ("SHOW · Dark mode · currently off" with the active-row accent bar), and the
  category picker (verb/category pill chips with the active chip highlighted) all rendering
  correctly. Full gauntlet clean: 2005 tests still passing (no test changes needed), typecheck/
  lint/build all clean.
- ✅ **8.4n — Retrofit: `RestructureTextDialog.tsx` onto `#sakura-modal-*`/`.smodal-btn`.** Real
  legacy source: CSS at legacy/index.html:635-660, markup at 7783-7791, `sakuraTextareaPrompt` at
  18559-18563 (all already cited by this file's own header before this slice). `#sakura-modal` is
  legacy's own single, dynamically-repurposed dialog instance (icon/title/body/inputs swapped per
  call by `_openModal`); `RestructureTextDialog.tsx` is `web/`'s own single-purpose instance of
  just the textarea-prompt variant, so only that variant's real pieces were ported: overlay/box/
  icon/title/body/textarea-wrap/textarea/actions/`.smodal-btn`(+`.primary`). The
  `#sakura-modal-input`/`-input2` pieces (the single-line-prompt variant `sakuraLinkPrompt` uses)
  are real classes too but have no `web/` consumer yet -- not ported, matching this project's own
  "port what's used" convention. Skips legacy's own `.open`/`.closing` opacity-fade +
  transform-scale enter/exit transition, same React mount/unmount precedent used throughout this
  slice family.
  **Two real content/asset gaps found and fixed, beyond the CSS retrofit**: (1) a new
  `RestructureListIcon` (icons.tsx) ports legacy's own real inline `<svg>` from the
  `restructureTextWithAi` call site (legacy/index.html:29444) -- the dialog previously had no icon
  at all. (2) the body copy now matches legacy's own real text at that same call site close to
  verbatim, with one deliberate omission: legacy's real text promises "your original pasted text
  kept in its Pad" -- `state/aiOutline.ts`'s own `restructureText` doesn't actually do this (a
  real, pre-existing feature gap from an earlier phase), so that sentence was left out rather than
  silently claiming a behavior that isn't there.
  Verified end-to-end in real headless Chrome (revealing the hidden-by-default toolbar first, per
  §7.5): the dialog's disabled (faded) accent-filled button with empty text, then fully solid once
  text is entered, list icon, and full real body copy all rendering correctly. Full gauntlet clean:
  2005 tests still passing (no test changes needed), typecheck/lint/build all clean.
- **§8.4 (all 14 sub-slices, 8.4a through 8.4n) is now complete.** Every `web/` component named in
  this plan's own investigation has been retrofit onto real, line-cited legacy CSS.
- ✅ **8.4o (found post-8.4n) — Retrofit: `EmptyDocState.tsx` onto `.empty-state`/`.doc-empty`.**
  Found via a real side-by-side screenshot comparison against a genuinely empty legacy document
  (not the populated "Welcome" seed doc) -- `EmptyDocState.tsx` is a Phase 7.4 component that
  predates Phase 8's own `role="dialog"` sweep (8.4a-n only ever investigated dialog components),
  so it was never actually retrofit despite already being scoped correctly against legacy CSS at
  the time it was built. Real legacy source: legacy/index.html:544-552 (CSS) and 20292 (the
  `render()`/`!nodes.length` branch's own generated markup/inline styling). Ported
  `.empty-state`/`.empty-state>div`/`.empty-state.doc-empty`/`.empty-state-illustration`/
  `.empty-state-actions` into `index.css`.
  **Two real visual gaps found and fixed**: "New document" now gets legacy's real solid
  accent-filled `.btn.primary` treatment (via the already-ported standalone `.primary` class, §8.1)
  instead of rendering identically to the plain "Generate with AI" button, and the illustration
  gets legacy's real opacity treatment (`.55` default, `.72` on hover) instead of always rendering
  at full opacity -- both real, visible contributors to the "poles apart" look a direct side-by-
  side screenshot surfaced.
  **One real technique deviation, found and fixed via a screenshot regression while building
  this**: legacy's own `.doc-empty` fills its parent via `position:absolute;inset:0`, relying on
  `#editor-pane`'s own fixed-viewport flex layout to already give that parent a real height.
  `web/`'s equivalent wrapper (the plain `position:relative` div around `<OutlineTree>` in
  `App.tsx`) has no such height of its own -- it's a normally-flowing page, not a fixed-viewport
  app -- so porting `position:absolute` literally collapsed the parent to zero height and the
  illustration visibly overlapped the Notes panel rendered below it. Fixed by using `min-height`
  in normal flow instead, reproducing the same "enough room to look centered" effect without the
  collapse -- same "port the effect, not the exact technique" precedent used throughout §8.4.
  Verified end-to-end in real headless Chrome (creating a genuinely new, empty document): the
  illustration, primary "New document" button, and correct block-level layout above the Notes
  panel all rendering correctly, matching legacy's own real chrome. Full gauntlet clean: 2005
  tests still passing (no test changes needed), typecheck/lint/build all clean.
- ✅ **8.4p (found post-8.4o) — Restructure: `QuickAssistBar.tsx` onto legacy's real always-visible
  app-bar-docked input, not just its CSS.** Requested directly by the user after a real side-by-
  side screenshot comparison surfaced legacy's own app-bar header as a permanently-visible search
  box, not the icon-only header §8.4m's own CSS-only retrofit had left in place. Confirmed via
  legacy source: `qaLocation='appbar'` is legacy's own real DEFAULT (legacy/index.html:185, not an
  edge case), and `#appbar-qa-slot` is the FIRST child of `#header-actions`
  (legacy/index.html:4533-4534) -- so this is literally the first thing every legacy user sees in
  the header, not a rare configuration.
  §8.4m's own CSS retrofit had deliberately deferred this exact restructuring as a real, separately
  -scoped structural change (documented in its own plan entry and in `index.css`'s own comment on
  the `.qa-*` family) -- this slice is that follow-up. Removed `QuickAssistBar.tsx`'s own `web/`-
  only "⌘K" toggle-button-then-popover mount entirely: `.qa-input-row` now renders unconditionally,
  first in `header-actions` (`App.tsx`), matching `#appbar-qa-slot`'s own real position.
  `.qa-dropdown` opens below-left of it (matching legacy's real `left:0` anchor for the app-bar-
  docked case, restoring the base rule's real positioning that §8.4m's CSS had deliberately left
  off the class since it didn't apply to the old popover-anchored structure), driven by
  focus/typing/outside-click/Escape/⌘K exactly matching legacy's own real `setQaOpen`/`toggleQa`
  (legacy/index.html:17633-17650) -- opening focuses the input, closing clears the query and blurs.
  `quickAssistStore.ts`'s own pre-existing `open`/`openBox`/`closeBox`/`toggleBox` shape already
  matched legacy's real state model exactly (its own header already said so) -- only the
  component's OWN rendering needed to change, not the store, and the global ⌘K handler in
  `App.tsx` needed no changes either. `.qa-input-row`'s own real per-context `width:200px`/
  `:focus-within{width:320px}` values, dropped in §8.4m as "meaningless inside a fixed-width
  popover," are restored now that the row is genuinely inline in the header.
  Verified end-to-end in real headless Chrome across every real interaction path: default state
  (plain 200px box, no toggle button), focus opening the hint dropdown, typing narrowing to a real
  command result with its active-row highlight, outside-click closing and clearing, ⌘K reopening
  and refocusing, the category picker (opened via the "⋯" icon button) with its verb/category
  chips, a first Escape closing just the picker back to the hint (box stays open), a second Escape
  closing the whole box (clears, blurs), and a hint-phrase click filling the query and immediately
  showing its real matching result row. Full gauntlet clean: 2005 tests still passing (no test
  changes needed), typecheck/lint/build all clean.
- ✅ **8.4q (found post-8.4p) — App-wide scrollbar theming + editor-pane canvas background.**
  Reported directly by the user ("scrollbars across the app... nothing seems aligned with the
  legacy app"). Confirmed real and systemic: `web/` had ZERO scrollbar CSS anywhere in the
  codebase -- every scrollable region rendered the bare OS/browser default scrollbar the entire
  time. This gap had already been NOTICED once before (`#doc-tab-strip-row`'s own §8.4e comment
  explicitly flagged legacy's real per-container scrollbar rules as "a gap real to the whole
  codebase, not this component") but never acted on until now.
  Real legacy source: the 3 true global resets (`::-webkit-scrollbar-button`/`-corner`, number-
  input spinners, legacy/index.html:312-326), the Firefox `scrollbar-width`/`-color` fallback
  (334-341), and the real per-container `::-webkit-scrollbar`/`-thumb` values grouped by which
  background surface each container sits on (`--canvas-bg`/`--bg`/`--tb-bg`/`--edit-bg`,
  legacy/index.html:522, 3308-3346). Ported the 3 global resets and the Firefox fallback verbatim,
  plus the real per-container treatment for every container that has an actual `web/` counterpart:
  `#editor-pane` (canvas-bg), `.settings-content`/`.settings-rail`/`#sakura-modal-body`/
  `#why-sakura-modal`/`.app-modal-body`/`.doc-tab-overview-menu`/`.qa-dropdown`/`.history-modal-body`
  (bg), `#doc-tab-strip`/`#sidebar-scroll`/`#hub-tab-body` (tb-bg), `.sakura-note-editor` (edit-bg).
  Containers with no real `web/` equivalent (`#code-editor`, `#qa-body`, `#meetings-body`, etc. --
  features `web/` hasn't built) are correctly skipped, not fabricated.
  **Three real ids added along the way, each needed as a selector hook and each itself a real,
  previously-missing piece of legacy fidelity**: `#editor-pane` (`AppShell.tsx`'s content pane,
  legacy/index.html:522) -- which also surfaced two more real gaps on the same element while
  adding it: the pane had no `background` at all (inheriting the surrounding `--bg` instead of
  legacy's own real `--canvas-bg`, a distinct near-white/near-black token that was already fully
  wired in `themeStore.ts` since §6.1 but never actually consumed anywhere -- confirmed visible in
  dark mode, where the contrast is clearest), and its padding was an approximated uniform
  `1rem 1.5rem` instead of legacy's real asymmetric `12px 14px 18px 26px`. `#sidebar-scroll`
  (`SidebarFileExplorer.tsx`'s own scroll container). `#hub-tab-body` (`HubDock.tsx`'s shared
  active-tab content wrapper -- legacy splits this identically-styled treatment across 4 separate
  per-tab ids `web/` doesn't need since one wrapper serves every tab).
  Verified via a combination of real headless-Chrome checks: computed-style + CSSOM inspection
  confirmed `#editor-pane`'s real background/padding/overflow and that the `::-webkit-scrollbar`
  rule is registered and targets the right element (a static screenshot alone can't show the
  thumb -- Chromium's overlay scrollbars fade out once a scroll gesture settles, a known
  screenshot-timing limitation, not a rendering gap); a real dark-mode screenshot confirmed the
  canvas-vs-chrome background contrast is visibly present. Full gauntlet clean: 2005 tests still
  passing (no test changes needed), typecheck/lint/build all clean.
- ✅ **8.5 — Real verification fixture document landed.** New `web/src/state/devFixture.ts`:
  navigating to `?seedFixture=1` builds a richly-populated fixture, covering every piece of
  content this plan's own 8.5 scope named -- real tags (four, across three nodes), the status
  chip set to a real non-empty value (`'review'`, exercising all 5 real options when its popover
  is opened, including the checkmark on the active one), an author, a link, a decision log card
  (all 5 structured fields + status + author, anchored to a real outline node), a checkbox parent
  with mixed-checked sub-items (a real "3/4" progress badge), and two levels of nested sidebar
  folders (`Projects` > `Design System`, the fixture document filed in the inner one) -- replacing
  every prior phase's own screenshot subject, the empty "Welcome" seed document, which never
  exercised any of this.
  Built entirely out of already-public store actions (`useDocumentsStore`/`usePadStore`), the same
  way a real user's own actions would build this content, plus one direct
  `useOutlineStore.setState` call for the node list itself -- the same technique
  `documentsStore.ts`'s own `applyTabView`/`restoreDocRevision` already use for bulk content, not
  a new pattern; no changes needed to any store's own internals. Wired into `main.tsx` via a new
  `seedFixtureIfRequested(window.location.search)` call before `ReactDOM.createRoot(...).render`,
  same "run before React renders, before any store's own mount-time `init()`" placement this
  file's own `installAudienceBridge()` call already established -- `devFixture.ts`'s own
  `seedFixtureIfRequested` calls `useDocumentsStore.getState().init()` itself first (the same
  precedent `AudienceWindow.tsx` already set for a caller that, like this one, runs before
  `DocumentTabs.tsx` -- the component that normally calls `init()` -- ever mounts), so any real
  documents already in `localStorage` are preserved, not discarded; the fixture folder/document
  is simply added alongside them. A no-op with no query param, so this has zero effect on the
  normal boot path.
  Verified end-to-end in real headless Chrome against a real `vite preview` build: the base
  document (nested folder tree, status/author/link chips, tags, the checkbox progress badge and
  strikethrough on checked items) and the status popover open (all 5 real options, checkmark on
  "Review") both screenshotted and correct; a third screenshot (reached via the same run) also
  confirmed the decision log card renders correctly in Preview mode with all 5 fields, its status
  badge, and its author/date line. Full gauntlet clean: 2005 tests still passing (no test changes
  needed -- a dev-only seeding helper with no pure logic of its own to unit-test beyond what
  real-browser verification already covers, same precedent as every UI-only §8.4 slice),
  typecheck/lint/build all clean.
- ✅ **8.6 (found via 8.5's own fixture, reported directly by the user) — the floating
  toolbar-toggle button and `OutlineTree.tsx`'s own invented bordered box.** The user flagged
  three areas directly ("the editor, floating buttons, Pad area") after seeing a real screenshot
  of the 8.5 fixture next to legacy. A `grep -c "style={{"` ranking across every component (the
  same signal that already caught `EmptyDocState.tsx`/`QuickAssistBar.tsx`) confirmed
  `PadPanel.tsx` (62) and `OutlineTree.tsx` (59) as the two largest untouched files -- Phase 8's
  own Goal section always scoped this plan to "shared chrome," never the tree itself or the Pad
  panel's own internals, so neither gap is a miss so much as work this plan never claimed to cover.
  This slice closes the two smallest, highest-confidence pieces of that gap; `OutlineTree.tsx`'s
  own row-level class family and `PadPanel.tsx`'s own per-tab retrofit are each real, separately-
  scoped follow-ups (§8.7+), too large and too risky (`OutlineTree.tsx` is this project's single
  hottest per-row render path) to fold into the same pass.
  - **The floating toolbar-reveal toggle** (`App.tsx`): direct port of legacy's real
    `#editor-toolbar-toggle` (legacy/index.html:2259, `:hover`/`.is-active` at 2266-2268) --
    border/background-tint/opacity/hover-active states, previously a bare icon button with no
    chrome at all. `right: 14px` deliberately kept as `web/`'s own value rather than legacy's real
    `right: 90px`, which only makes sense alongside legacy's three sibling floating buttons
    (`#editor-zen-toggle`/`#editor-pad-toggle`/`#editor-preview-toggle`) -- confirmed via a real
    legacy screenshot (a fresh empty document, `/tmp` scratch build) that legacy's own floating
    cluster is genuinely 4 buttons; `web/` still only builds the one (§7.5's own already-documented
    scope reduction, unchanged by this slice).
  - **`OutlineTree.tsx`'s own invented bordered box.** A real, previously-unnoticed structural bug,
    not just missing CSS: the tree's own `<div role="tree">` wrapper drew its OWN
    `border`/`border-radius`/`background`/`padding` -- legacy's real `#editor-pane`
    (legacy/index.html:522) has node rows sitting directly on the canvas, no separate boxed panel
    around them at all, confirmed by the same real legacy screenshot. `AppShell.tsx`'s own
    `#editor-pane` ancestor already provides the real `var(--canvas-bg)` background and real
    padding (§8.4q) -- this wrapper's own box sat directly on top of that, rendering as a visibly
    separate bordered panel legacy never has. Removed the border/radius/background/padding
    entirely; `color: t.text` is kept as the real fallback text color for any child that doesn't
    set its own (no `body`-level `color` rule exists in `web/` to inherit from otherwise).
  Verified with a real side-by-side: built `legacy/dist` and `web/dist` fresh, drove both through
  headless Chrome (dismiss sign-in gate + welcome modal, type a small representative outline into
  a genuinely empty document, screenshot). Confirmed both real gaps above directly against that
  legacy screenshot, then confirmed both fixes visually in a rebuilt `web/dist` screenshot -- the
  outline now sits flush on the canvas with no extra box, and the floating toggle now shows a real
  bordered/tinted square instead of a bare icon. Full gauntlet clean: 2005 tests still passing (no
  test changes needed, pure presentation swap), typecheck/lint/build all clean.
- ✅ **8.7 (`PadPanel.tsx`'s own always-visible chrome: the tab strip + outer panel surface)
  landed.** First piece of the `PadPanel.tsx` retrofit named as open at the end of §8.6 -- scoped
  to just the chrome that's visible regardless of which of the 7 tabs is open, same "highest-
  leverage single change first" precedent §8.1's own `#appbar`/`#header-actions` discovery
  established. Direct port of legacy's real `.pad-mode-tab` (legacy/index.html:1643-1645, markup
  at 6601-6607 -- `role="tab"`/`aria-selected`, matched exactly) replacing the tab strip's
  previous flat row of disabled-when-active buttons with legacy's real underline-style active-tab
  treatment, plus `#pad-panel-header`'s real `background: var(--tb-bg)` (legacy/index.html:1641)
  on the panel's own outer surface. `PadPanel()`'s own root `<div>` had the same invented-box bug
  §8.6 found and fixed in `OutlineTree.tsx` -- an arbitrary `border`/`padding` box with no real
  legacy counterpart -- removed here too (kept `padding: '0.75rem'` as `web/`'s own reasonable
  value, since legacy's real docked panel has no equivalent inline-block padding to port).
  **Real, documented scope note, not a gap**: `web/`'s Pad renders inline below the editor rather
  than legacy's real docked 440px side panel (`#pad-panel`, legacy/index.html:1638) -- an
  existing, already-documented structural simplification (§7.5's own comment) left unchanged by
  this slice; only the real background tone and tab-strip treatment were ported, not the fixed
  width/dock positioning. Verified with a real headless-Chrome screenshot of the 8.5 fixture
  (Decision Log tab active, showing the real underline-accent tab treatment against the fixture's
  own anchored decision). Full gauntlet clean: 2005 tests still passing (no test changes needed),
  typecheck/lint/build all clean.
- ✅ **8.8 (Decision Log tab's own `.decision-row-*` card system) landed.** Direct port of
  legacy's real `.decision-row`/`.decision-row-summary`(+hover/`.expanded`)/`.decision-row-status`
  (+`data-color` green/red/orange/gray)/`.decision-row-content`/`.decision-row-node`(+hover)/
  `.decision-row-delete`(+hover-reveal-on-summary-hover)/`.decision-row-expand-slot`
  (legacy/index.html:1722-1747), plus the toolbar's `#decision-open-chip` (1713-1716, a real
  orange pill, accent-colored when active) and `.note-tb-btn` (1968, a generic muted toolbar
  icon-button -- also a real `NotePanel.tsx` class, that component's own retrofit still a
  separate, open follow-up; only what this slice's "+ New" button needs was ported). The
  collapsed row's status pill now reads real color from `decisionLogQueries.ts`'s own pre-existing
  `decisionStatusColorKeyCore` (already ported, just never wired to any CSS class before this
  slice) instead of rendering as a plain unstyled button.
  **Scoped down from legacy's real row**, each named rather than silently dropped: no drag-handle/
  drag-reorder chrome (`reorderDecision` exists on the store but no UI drives it yet), no
  title-row/snippet/meta sub-rows (this component's collapsed row shows only the anchor label, no
  text preview or timestamp), no `.decision-field-rewrite`/`.decision-field-body` (this
  component's 5 fields are plain `<textarea>`s, an already-documented `DecisionTab` simplification
  -- no contentEditable rich-text styling to port onto them). Verified with real headless-Chrome
  screenshots against the 8.5 fixture's own anchored, approved decision: the collapsed row (solid
  green "APPROVED" pill, orange "0 open" chip, muted "+ New" button) and the row's own real
  hover states (accent-underline on the node label, the delete button fading in) both confirmed.
  Full gauntlet clean: 2005 tests still passing (no test changes needed), typecheck/lint/build all
  clean.
- ✅ **8.9 (Q&A, Remarks, and Files tabs' own row shells) landed.** The three remaining Pad tabs
  with a real, simple, list-of-rows shape (Diagrams/Mind Map are real visual editors, a
  genuinely different category, deliberately left out of this slice). Each ported ONLY the real
  legacy row shell that has a genuine `web/` counterpart, matching the same scoping discipline
  §8.8's Decision Log slice already established -- none of these three components have rich-text
  fields, drag-reorder, multi-select, or node-linking chrome, so none of legacy's own real CSS for
  those was ported:
  - **Q&A**: `.qa-row`/`.qa-row-content`/`.qa-row-delete` (legacy/index.html:1855-1891, a small
    subset of a much larger real system -- drag/select-mode/section-rows/field-icons/follow-up
    chips, none built here, see this slice's own index.css comment for the full list).
  - **Remarks**: `.remark-card` (legacy/index.html:3460-3463), reusing `.note-tb-btn`'s hover-
    reveal treatment for the remove button (no rich-text quote/byline/avatar system to port --
    `web/`'s RemarksTab is plain `<strong>person:</strong> text`).
  - **Files**: `.file-row`/`.file-row-info`/`.file-row-name`/`.file-row-size`/`.file-row-remove`
    (legacy/index.html:3428-3436) -- `.file-row-icon` skipped, no per-mime icon set in `web/` yet.
  **A real, small drive-by fix found while retrofitting `FilesTab`**: its error message
  (`"<file>" is over the 5 MB attachment limit`) used a hardcoded `#b02020` instead of the real
  `var(--sem-alert)` token already used by every other alert-colored element this slice touches --
  fixed, and the now-fully-unused `t: Tokens` prop dropped from that component entirely.
  Verified with real headless-Chrome screenshots (a real Q&A row and Remarks row, each hovered to
  confirm the delete button's real fade-in). Full gauntlet clean: 2005 tests still passing (no
  test changes needed), typecheck/lint/build all clean.
- ✅ **8.10 (`OutlineTree.tsx`'s per-row action-icon cluster: idle/hover opacity) landed.** A real,
  more fundamental finding, not just a missing CSS class: reading legacy's actual real per-row
  render loop (legacy/index.html:20293 area) confirmed legacy NEVER shows an empty-state
  "+tag"/"+note"/"+code" ADD prompt inline in a row at all -- a note/code/decision/etc. dot
  (`.node-note-dot`, legacy/index.html:2125, `opacity:.55` idle / `1` hover) is only ever appended
  to a row when that content ALREADY exists. `web/`'s own always-fully-visible text-button
  versions (`+tag`/🔍/`+note`/`+code`, rendered unconditionally on every single row) are a real,
  useful entry point this project added that legacy has no equivalent for (no separate "Add tag"/
  "Add note" menu action exists yet) -- kept rather than removed, but muted to the same real idle/
  hover opacity legacy uses for its own dots, which closes most of the "every row looks cluttered"
  gap without losing functionality. Implemented via the SAME `hoveredNodeId` JS state the node
  hover toolbar already tracks (not a new CSS `:hover` mechanism), for consistency with this
  component's own established per-row-hover pattern -- no new CSS needed, no `index.css` change.
  Deliberately scoped to just this one add-affordance cluster, not a full `.node-row` port (still
  fully open, see below). Verified via computed-style inspection in real headless Chrome (a
  hovered row's own `+tag` element's `opacity` read `0.55` idle, `1` on hover) -- a screenshot
  alone can't reliably show a 0.55-vs-1 opacity difference this small. Full gauntlet clean: 2005
  tests still passing (no test changes needed), typecheck/lint/build all clean.
- ✅ **8.11 (`MobileHub.tsx`'s missing background/brand/account chrome) landed -- reported directly
  by the user against a real side-by-side of this view and legacy's real `hub.html`.** A real,
  previously-undiscovered gap: this component never set a real background/text color anywhere at
  all (no `AppShell` ancestor to inherit `var(--bg)`/`var(--fg)` from, and no `body`-level rule
  exists in `web/`'s own `index.css` either) -- confirmed by a real screenshot rendering solid
  white regardless of the OS's dark-mode preference -- and had no brand row or account entry point
  at all, unlike legacy's real `#hub-sticky-header`/`#todo-bar` (legacy/hub.html:445-448: a brand
  icon+wordmark; legacy/hub.html:449-471: `#account-menu-wrap`, an avatar button opening a
  dropdown with name/email, a real Auto/Light/Dark theme row, a reminders toggle, and sign-out).
  Fixed: the wrapping div now carries real `background: var(--bg)` / `color: var(--fg)` (matching
  `AppShell.tsx`'s own exact treatment, §6.1) plus `minHeight: '100vh'`; a new header row reuses
  `AppShell.tsx`'s own exact "Sakura" wordmark treatment (bold, `var(--accent)`, no separate brand
  icon -- confirmed desktop's own real `#appbar` has none either, despite legacy's *mobile*-only
  page having one) plus the already-real, already-tested `AccountMenu.tsx` (§7.6) for the account
  button/dropdown, reused as-is rather than rebuilt -- the same "one real account surface, not
  two" precedent §8.4a already established for desktop's own former `SyncStatusIndicator.tsx`
  duplication. **Real, deliberate scope note, not silently dropped**: `AccountMenu.tsx`'s own
  dropdown has Settings/Help/Feedback/About entries legacy's real mobile dropdown doesn't (that
  one has only name/email/theme/reminders/sign-out) -- reused anyway rather than forking a
  mobile-only variant; "Settings" shows an honest `window.alert` placeholder instead of a real
  panel, matching this project's established no-toast-system convention (a real mobile Settings
  surface is a separate, larger follow-up). The search icon (`#hub-search-toggle`) and
  offline-banner/personalized-greeting chrome legacy's real header also has are still deliberately
  not built -- no backing search/offline-detection feature exists in `web/` for either yet.
  Legacy's real *signed-in* mobile Hub chrome (past its own real sign-in gate) couldn't be
  screenshotted directly -- no real Google/email auth reachable in this sandbox -- so this slice
  was verified by reading legacy's real markup/CSS directly (cited above) rather than a live
  side-by-side; confirmed instead via real headless-Chrome iPhone-13-emulated screenshots of the
  fixed `web/` view itself (warm cream background + accent wordmark + "Sign in" button at rest,
  the real `AccountMenu` dropdown opening cleanly within the narrow viewport with no overflow).
  Full gauntlet clean: 2005 tests still passing (no test changes needed), typecheck/lint/build all
  clean.
- ✅ **8.12 (app-bar decluttering: theme/accent controls moved into Settings → Appearance) landed --
  reported directly by the user via a real side-by-side screenshot of legacy's actual app-bar next
  to `web/`'s.** A real, previously-undocumented gap: legacy's real `#appbar` (legacy/index.html:
  4527-4607, read end to end before touching anything) has NO theme or color controls in it at
  all -- just brand, Quick Assist, Hub, More (Export/Import/Print), Notifications, Account, and
  Settings. Every one of the Light/Dark toggle, System auto-theme toggle, 7-swatch accent-color
  picker, and 4-swatch node-text-color picker legacy actually has lives entirely inside
  `#settings-panel`'s own real "Appearance" section (legacy/index.html:4674-4715) -- confirmed by
  reading that markup directly, not assumed. `web/` had all four permanently visible in the header
  instead, because they were built in §6.7 before this project's Settings panel existed --
  `SettingsPanel.tsx`'s own header comment had already named this exact consolidation as "a real,
  separately-scoped follow-up" at the time, never picked up since. Fixed: all four controls
  (`App.tsx`) moved into a new "Theme" section at the top of `SettingsPanel.tsx`'s "general"
  (Appearance) category -- a real Light/Dark segmented pair (via `setTheme`, not the old single
  toggle button, since legacy's own `#theme-segmented` is a two-button pair, not a toggle) and a
  real Off/System segmented pair for auto-theme, both ahead of the existing accent/text-color
  swatch rows (now 20px circles, up from the header's cramped 16px, since Settings has real room).
  `App.tsx`'s header now renders only what legacy's own real app-bar does among what `web/` has
  built so far: Quick Assist, sidebar toggle (a real `web/`-only addition, no legacy counterpart --
  not removed, since it backs a real feature), Version History, notifications, Hub, More (Export/
  Import/Print), Settings, Account. `MonitorIcon` (icons.tsx) is now removed entirely -- its own
  header comment already correctly flagged it as having no legacy equivalent, and its only call
  site was the auto-theme button just removed, so it's genuinely dead code now, not kept "just in
  case." Content font (`#editor-font-segmented`, Sans-serif/Monospace) deliberately NOT ported --
  `web/` has no font-family preference axis at all yet, a real, separately-scoped gap. Verified
  with real headless-Chrome screenshots of the app-bar in both light and dark theme (confirming the
  swatches/toggle buttons are genuinely gone, not just visually hidden) and of the new Settings →
  Appearance section itself (confirming the Theme/Auto-theme segmented controls and both swatch
  rows render and actually work -- clicking the Moss accent swatch live-updates the segmented
  buttons' own background color via the same `var(--accent)` the rest of the app already reads,
  proving the relocation didn't just move markup but kept the real wiring intact). Full gauntlet
  clean: 2005 tests still passing (no test changes needed), typecheck/lint/build all clean.
  Deliberately NOT done in this same slice, each a separate, smaller follow-up: reordering the
  remaining header buttons to match legacy's own exact left-to-right order (Hub/More currently sit
  after Version History/Notifications in `web/`, legacy has Hub/More first) and moving Version
  History's own entry point into the real `ExportButtons.tsx` "More" menu, matching legacy's real
  "More → Version history…" placement (legacy/index.html:6489) now that a real More menu exists --
  `App.tsx`'s own header comment on that button already flags this as stale reasoning ("moved to
  the header toolbar since `web/` has no More menu of its own yet"), a real, confirmed but
  deliberately unfixed gap this slice found and left for whoever picks it up next.
- ✅ **8.13 (Diagrams/Mind Map tabs' own list chrome) landed.** The two remaining Pad tabs with
  their own list-of-items row shells (Diagrams/Mind Map are real visual-editor features -- a
  draw.io embed, a freeform canvas -- but their OWN pre-open list rows are a real, simple row
  shape, same category §8.9 already covered for Q&A/Remarks/Files). Direct port of legacy's real
  `.diagram-row`/`-info`/`-title-input`/`-dup`/`-delete` (legacy/index.html:3522-3554) and
  `.mindmap-row`/`-icon`/`-info`/`-title-input`/`-meta`/`-actions`/`-dup`/`-delete`
  (legacy/index.html:3504-3518), scoped down to what has a real `web/` counterpart today, matching
  §8.9's own established discipline: skipped `.diagram-row-select`/`-drag-handle` (no bulk-select/
  reorder UI, `padStore.ts` has no `reorderDiagram` action, confirmed by grep), `.diagram-row-
  thumb` (no `previewSvg` field), `.diagram-row-status`/`-warn-chip`/`-whiteboard-chip`/`-pages`
  (no `status`/`isWhiteboard`/`pageCount` fields -- every one already named as deliberately
  deferred in `padStore.ts`'s own `Diagram` interface header), `.diagram-row-anchor`/`-note-input`
  (no `anchorNodeId`/`note` fields), and `.mindmap-row-title-row`/`-scratch-chip` (no
  `isScratchpad` field on `web/`'s own `MindMap` type, confirmed in `mindMapStore.ts`'s own
  header). A real, confirmed dead class found along the way: legacy's own `.diagram-row-title` (no
  `-input` suffix) has zero real call sites anywhere in legacy/index.html -- only
  `.diagram-row-title-input` is ever actually applied. New `MindMapIcon` (icons.tsx) is a direct
  port of legacy's real fixed per-row icon (legacy/index.html:50118 -- every row gets the same
  icon, not content-driven); the Mind Map row's meta line combines node count + the already-ported
  `formatRelativeTime`, matching legacy's real `renderMindMapsList` text exactly
  (legacy/index.html:50141). `MonitorIcon` (icons.tsx) removed too -- see §8.12 above for why.
  `.diagram-row-title-input`/`.mindmap-row-title-input`'s dup/delete buttons use the already-
  established `⧉`/`✕` glyphs (`SidebarFileExplorer.tsx`/`App.tsx`'s own precedent for "duplicate"/
  "delete", not new SVG icon work for two small buttons). **A real bug caught and fixed by the
  screenshot verification itself, not assumed correct from the CSS alone**: both new
  `*-title-input` buttons showed an unwanted accent-colored border on hover -- traced to
  `index.css`'s own generic `button:hover{border-color:var(--accent)}` base rule (§6.1) cascading
  through, since neither row's title button had its own more-specific `:hover`/`:focus` override
  the way legacy's real CSS does (legacy/index.html:3535-3536, 3510-3511: `:hover` only changes
  `background`, never `border-color`). Fixed by adding both rows' own real `:hover`/`:focus`
  rules, verified by re-screenshotting before/after. Also fixed a small, real drive-by bug found in
  the same component while retrofitting `DiagramsTab`: its error-alert text used a hardcoded
  `#b02020` instead of `var(--sem-alert)` -- the same fix §8.9 already made for `FilesTab`'s
  identical hardcoded color, now applied here too. Verified with real headless-Chrome screenshots
  of both tabs (rest state with 2 real rows each, hover-revealed dup/delete buttons, and Mind
  Map's own dark-theme rendering) against a real build, not the dev server. Full gauntlet clean:
  2005 tests still passing (no test changes needed), typecheck/lint/build all clean.
- Still open, not yet done: `OutlineTree.tsx`'s own FULL row-level class family
  (`.node-row`/`.node-label`/selection-and-drag states/etc.,
  legacy/index.html:543-2174) -- §8.10 closed one real, concrete finding inside this component,
  but the row's own background/border/selection-highlight CSS is still JS-token-driven
  (`resolveRowHighlightStyle`, a pre-Phase-8 mechanism, not Phase 8's own CSS-class approach) and
  hasn't been directly re-verified against legacy's real `.node-row.selected`/`.primary-selection`
  values since before this phase started. Still this project's riskiest component to touch (its
  hottest per-row render path) -- any further work here should be done carefully, one small piece
  at a time, same discipline §8.10 used. Also still worth a targeted look: whether any other
  non-dialog Phase 6/7 component was similarly missed by 8.4's dialog-only sweep, the same way
  `EmptyDocState.tsx`/`QuickAssistBar.tsx`/§8.6's own two findings were -- now easier to check
  with 8.5's own fixture as a real, richly-populated subject to screenshot against instead of the
  empty seed document.
