# Phase 6 — Full Parity Migration Plan

## The rule this plan exists to enforce

**`www.sakura-notes.com` stays on `legacy/` until this plan's final gate (Section 9) is
explicitly signed off — not before.** This plan exists because that rule was broken once
already: `web/` was cut over to production on the strength of a passing build and a green test
suite, without anyone actually opening the deployed app first. It showed Phase 0 developer
placeholder text to real colleagues within minutes. The revert and root-cause fix are on `main`
(see git history around `deploy.yml` and `documentsStore.ts` from this date). This plan is the
honest alternative to repeating that mistake: finish the real thing, verify it like a real user
would, then cut over — not the other way around.

## Goal

Full feature and visual parity with `legacy/` as it exists today, not a prioritized subset.
`docs/phase5-parity-checklist.md` is the authoritative, row-by-row record of every gap; this
document is the sequencing plan for closing all of them. Visual parity means **pixel-close**,
not "same spirit" — legacy's actual colors, typography, spacing, and layout chrome, not a
React-flavored reinterpretation of them.

## Why sequenced this way

`web/` today has zero design system — every screen is ad hoc inline styles with no shared
color tokens, typography scale, or layout chrome (see any component's `style={{...}}` props).
Feature work done against that foundation would all need re-skinning later, so the design
system and app shell come first, once, rather than N times. After that, feature phases are
sequenced by dependency (a panel needs the shell to dock into; Quick Assist needs the settings
it toggles to exist) rather than by usage frequency, since the goal here is completeness, not a
prioritized MVP.

Every phase below lands as its own sequence of small, reviewable PRs — same store-PR-then-UI-PR
discipline as every phase before this one. Nothing in this plan authorizes touching `deploy.yml`
or `legacy/` itself; those stay exactly as the revert left them until Section 9.

## Phases

### 6.1 — Design tokens & app shell
Extract legacy's actual design values (colors incl. all 5 accent options and Chrome background
presets, typography scale for both content fonts, spacing/indent constants, the icon set) into a
real token system `web/` components read from, replacing every inline hex/px value currently
scattered across `OutlineTree.tsx` and friends. Build the real app shell around it: header/app
bar, left sidebar (file explorer), status bar, tab bar — currently entirely absent; `App.tsx` is
presently a vertically-stacked panel dump with a plain `<h1>`, not an app shell at all. This is
the prerequisite every other phase in this plan re-skins into.

### 6.2 — Core editing parity
Close the remaining `⚠`/`❌` rows in the checklist's "Core Editing" and "Overview" tables:
Duplication, rich per-node formatting (bold/italic/underline/strike/highlight/color, Heading
1–6), fold "+N hidden" badge, node hover toolbar, checkbox toolbar button + progress badge,
right-click context-menu system (sort-children currently only reachable via toolbar), Quick
Insert.

### 6.3 — Panels: Note, Code, Pad
Note panel: rich text, images, tables, backlinks section. Code panel: resizable/floating window.
Pad's remaining tabs to real depth: Q&A (AI-assisted answering, bulk actions, search, PDF
export, node-linking), Decision Log (node-linking, structured fields, card rendering, Excel
export), Diagrams (draw.io integration), Mind Map, Files (real upload/storage, node-linking,
download), Remarks (date field, node-linking, export inclusion).

### 6.4 — Backlinks & `#tags` mentions
`[[@mention]]` backlinks: not built at all yet (Tags themselves shipped in the previous PRs
(#118/#119) — this phase is the remaining "Backlinks" half of that checklist section).

### 6.5 — Hub full depth
To-Dos (priority/status/due-dates/subtasks/repeat/filtering/sorting/bulk-actions/tags/PDF
export), Meeting Notes (templates, action items, Promote-to-To-Do, PDF export, Share/Import),
Journal (editing, tags, rich text, calendar popover, PDF export, search), Library (favorites,
tag filtering, rich text, images), Recap (Today/This Week/Last Week grouping, click-to-jump,
document-level activity grouping now that Documents & Tabs exists), Mobile Hub.

### 6.6 — Preview, Presenter & Export
Preview: TOC, scroll-spy, progress bar. Presenter mode: laser pointer, blackout, grid, timer,
floating notes, Whiteboard, Audience View, closing slide. Word/PDF/PowerPoint exports up to
their full documented fidelity (heading styles, TOC, Decision Log cards, rich formatting, image
embedding, branding). Plain text/Excel/clipboard export, Sakura Document (`.sakura.json`)
format, Word/OPML import.

### 6.7 — Theming & Appearance
Auto theme (System/Schedule), accent color (all seven), Chrome background presets, node text
color presets, Editor's Choice / Documentation Mode presets, full layout controls (tree lines,
depth guides, row style, compact rows, text size, indent width, collapse depth), inline
note/remark/Q&A previews.

### 6.8 — Account, Sync, Sharing & Data
Email/password sign-in, autosave on doc sync (currently manual push), sharing
(view/edit/notifications), sync health indicator, two-tier automatic backup (IndexedDB mirror +
auto-backup-to-file), full Export/Import (whole-app JSON), Version History.

### 6.9 — AI Features
Provider configuration UI, API key storage (with Secure Storage encryption), all seven
providers, Rewrite (incl. auto-rewrite on commit), Generate Outline, Restructure Text, Expand
node, Suggest tags, Suggest icon, Summarise selection, provider fallback, usage tracking. This
is the single largest unbuilt section in the checklist — budget accordingly, and expect it to be
its own multi-PR sub-sequence.

### 6.10 — Quick Assist, Quick Insert & Settings
Quick Assist (Ctrl/Cmd+K command box: toggles, search, Run actions, AI Run actions) and Quick
Insert (Ctrl/Cmd+Space character menu) — both entirely unbuilt. The Settings panel itself:
`web/` currently has no Settings surface at all; every toggle referenced by earlier phases
(feature on/off switches, per-panel settings, right-click menu customization, etc.) needs a real
home, so this phase's Settings-panel work runs partly in parallel with whichever earlier phase
introduces each toggle, not strictly after all of them.

### 6.11 — PWA & polish pass
Static precache strategy to match legacy's (`web/public/sw.js`'s current runtime cache-first is
a deliberate, documented simplification — revisit once Vite's hashed-filename asset manifest
can be precached at build time), maskable-icon verification, title-bar theme-color sync, a full
visual pass against Section 6.1's tokens now that every screen exists, to catch any component
that drifted from the shared system during individual feature phases.

## 9 — Pre-cutover gate (do this before touching `deploy.yml`)

Every item below, checked in that order, before any cutover PR is even opened:

1. `docs/phase5-parity-checklist.md` shows no remaining `❌` or `⚠` rows against this plan's scope.
2. A person — not a build log — opens the actual built `web/dist/` output (locally or on a
   preview URL) and uses it end-to-end: create a document, edit, sign in, sync, export, and
   exercise Hub/Pad/Presenter, watching for anything that doesn't look or behave like `legacy/`.
3. The same real-production-data caution `docSyncStore.ts` was built with from the start
   (Phase 4) is re-verified: sign in as a real account with real synced documents already in the
   production Firestore project, confirm they load correctly and round-trip without data loss.
4. Only then: a `deploy.yml` cutover PR, following the exact same explicit-and-separate
   discipline as the reverted attempt — except this time gated on the above, not on green CI
   alone.

## Status

Not started. `web/` is currently mid-Phase-5 (Documents & Tabs, Tags & Focus shipped; this plan
is what comes after). Update each phase's own section above with a `Status:` line and PR numbers
as work lands, the same way `docs/phase5-parity-checklist.md`'s own "Update" notes track
progress.

## Appendix — AI key vault (Cloudflare Worker), proposed

A separate proposal, not yet started, not yet scheduled against a specific phase: a Cloudflare
Worker exposing `POST /vault/key` (Firebase ID token auth, encrypts a pasted AI provider key at
rest via a Worker secret, stores it in KV keyed by Firebase UID) and `POST /ai/complete`
(same auth, decrypts in-memory only, forwards to the existing Groq → Gemini → Cerebras →
OpenRouter fallback chain, never returns the decrypted key). Goal: paste an AI key once, it
follows every device, and after that first paste the key never touches the browser again.

**This is new capability beyond parity, not a parity item.** Legacy's current BYOK story is
client-side only (per-device key entry, optionally synced via Secure Storage + Cloud Backup to
Gist/Drive) — there's no server-side proxy in legacy at all. Scoping this into the "look exactly
like today" goal would be a category error; it belongs here as an explicit addition on top of
parity, not folded into any phase's definition of "done."

**A simpler alternative exists using infrastructure already in place**: sync the (client-side
encrypted) key through Firestore the same way documents already sync, skipping a new
Cloudflare project/KV/secret-management surface entirely. The Worker's genuine differentiator
over that is that the key never touches the browser again after first entry (server-side decrypt
+ forward, vs. client-side decrypt each use) — worth it if that stronger guarantee is the actual
goal; not worth the added operational surface if "follows me across devices" is all that's
needed.

**Risk to flag if built as proposed**: a single Worker secret encrypting every user's stored key
is a single point of failure — acceptable at this project's current scale (a handful of users),
just don't let it read as more hardened than it is.

**Natural connection point**: this overlaps directly with §6.9 (AI Features, where `web/` first
gets any client-side AI provider calls to route through such a proxy) and the Firestore
debounce/`onSnapshot` concerns already named in §6.8. Building the vault meaningfully earlier
than §6.9 means it has nothing real to validate end-to-end against until then. Revisit and
decide final sequencing at that point, rather than committing to a slot now.
