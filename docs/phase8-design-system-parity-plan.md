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
area: app-bar/header, sidebar, document header + toolbar, dropdown menus + modals) → 8.5 (real
verification fixture document). 8.1-8.3 build the layer; 8.4 is the bulk of the visible fix and
can be split further/resequenced by whoever picks up each slice; 8.5 can run in parallel with 8.4
once the fixture itself is ready, and should land early enough that later 8.4 slices already use
it for their own verification.

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

**Not started.** This document is the first output of Phase 8 — written from a real investigation
of legacy's actual CSS (cited by exact line above), not from re-reading the prose of prior phase
docs' own "closed" claims. Next: 8.1.
