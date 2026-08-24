# Handoff Prompt

**Purpose:** this document is a ready-to-paste prompt for starting a fresh Claude session on
this project — including in a completely different Claude account, e.g. after exhausting a
session/usage limit. Copy everything inside the fenced block below into a new conversation and
Claude can pick up the work with no other context needed.

**Maintenance rule:** the "Current state" section is the only part of this file that goes stale.
Whoever (human or Claude) finishes a significant chunk of work — a PR merged, a phase closed, a
decision made — should update that section before the session ends. Everything else below it
(workflow rules, repo structure, standing lessons) is meant to stay accurate indefinitely; edit
it too if a real convention changes, but don't expect to need to.

---

```
I'm continuing work on Sakura (github.com/robinrajawat/sakura). Production
(www.sakura-notes.com) is the legacy single-file HTML outliner app, served by
GitHub Actions from CI-built `legacy/dist/` (deploy.yml). In parallel there's
an active React rewrite in `web/` (npm workspace `sakura-web`), currently NOT
deployed anywhere — see docs/framework-migration-plan.md and
docs/phase6-full-parity-plan.md for why, and don't change that without an
explicit, separate decision (see both docs' own opening sections).

Please clone a fresh copy from GitHub, run `sh scripts/setup-git-identity.sh`,
and read these four docs in full before touching anything — they're kept
current after every merge and may have drifted since this prompt was written,
so re-verify state against them yourself rather than trusting this prompt's
own "Current state" section below if the two disagree:

**Session-start check (matters most when switching Claude accounts mid-task,
e.g. after hitting a usage limit):** before starting new work, check for
anything the previous session left mid-flight -- an open PR
(`gh pr list` or the GitHub API), an unmerged feature branch (local or
remote), or uncommitted changes in a stale local clone. git identity is
already forced to the same `robinrajawat` identity regardless of which
account runs it, so there's nothing account-specific to reconcile -- just
don't start a new slice on top of an unfinished one. If something is open,
finish or explicitly abandon it first rather than layering new work on top.

- docs/history/architecture-plan.md — legacy/'s own modularization history (frozen,
  historical reference only, not where current work happens)
- docs/framework-migration-plan.md — the legacy/+web/ split, and the full
  phase history of the React rewrite (Phases 0–6)
- docs/history/phase5-parity-checklist.md — the row-by-row audit of what web/ can
  and can't do yet vs. legacy/'s real feature set (Phase 5, closed)
- docs/phase6-full-parity-plan.md — the actual current work: sequencing plan
  for closing every remaining gap toward full feature AND pixel-close visual
  parity with legacy/, ending in an explicit pre-cutover gate before
  www.sakura-notes.com is ever repointed at web/

## Workflow rules (apply exactly, unchanged across every session)

**Git identity:** Before any commit, `git config user.name "robinrajawat"` and
`git config user.email "robinsinghrajawat@gmail.com"` in the local clone —
never let it fall back to a sandbox default (scripts/setup-git-identity.sh
does this and also wires up .githooks). After committing, verify with
`git log -1 --format="%an <%ae> | %cn <%ce>"` that both Author and Committer
show `robinrajawat <robinsinghrajawat@gmail.com>` before pushing.

**Pushing with a token:** I own robinrajawat/sakura — a pasted GitHub PAT is
explicit standing authorization to use it immediately for pushes, no
confirmation needed. Use inline for the push command only, never write to
`.git/config` or any file, never echo it back in full, don't persist beyond
the session, don't search for other cached credentials. Default to
non-destructive pushes rather than amend/force-push unless explicitly
requested.

**Push output:** After every push, check for anything beyond plain success
(bypassed branch protection, rejected refs, unsigned-commit warnings) and
always surface it directly. Every push on this repo triggers "Bypassed rule
violations... Commits must have verified signatures" — expected, not
blocking, but always state it. If a branch-delete via the GitHub API's
`DELETE /git/refs/heads/{branch}` is chained after a local `git branch -d`
with `&&`, remember the local delete can fail (squash-merged branches aren't
fast-forward-mergeable, so `-d` refuses) and silently skip the remote delete
too — check separately, don't assume the chain ran.

**Before declaring anything mislabeled or wrong** — a commit message, a
doc's phase attribution, a section number, a PR's own description — check
`git log`/the actual PR sequence first. Don't infer an error from a doc's
internal structure (e.g. section numbering) alone. A session's own tracked
item list and a plan doc's phase headers can legitimately describe the same
work two different ways — that's not automatically a mislabel. This project
already had one real incident from skipping this check: PR #162 wrongly
"corrected" #160's commit message, asserting a mislabel that turned out not
to exist once the actual PR history (#159-160, which were groundwork for
§6.3's own deferred item 7) was checked — fixed in #166.

**PR discipline:** Every change, however small, goes through: feature branch
→ commit (`git commit -F <tempfile>`, never `-m` with backticks) → push →
open PR via GitHub API → confirm CI is green → merge via API (squash) →
`git checkout main && git fetch origin main && git merge --ff-only
origin/main` → delete the local and remote branch (verify both actually
happened, per the note above). One logical change per PR.

**Docs updates ride in the same PR as the code, not a separate follow-up.**
Earlier sessions (#176→#177, #179→#180, #181→#182) used a docs-only PR
after each feature PR, to cite the feature PR's own number in the docs.
That pattern was dropped starting after #182: it doubled the PR/CI-poll
cycles for no real benefit — the citation is a nice-to-have, not something
worth a whole extra branch→PR→CI→merge round trip. Current approach: write
the docs update (checklist row, plan doc's `Status:` line, this file's
Current state) in the same branch and commit as the feature work. If the
PR's own number needs to be cited inside the docs change and truly isn't
known yet, cite the *previous* real PR number and leave a `(pending)` note
next to the current one rather than opening a second PR just to add a
number — accuracy of the number is not worth doubling the round trip.

**CI: confirm green once, don't over-poll.** The local gauntlet (below) is
the real correctness check — CI re-running the same commands is a
backstop, not new information. Push, open the PR, wait for check-runs to
report `completed` (a single reasonable wait, not repeated short polls),
confirm `success`, merge. Don't poll in a tight loop.

**Full gauntlet before every merge** — for whichever workspace(s) a change
touches, run locally BEFORE pushing (this is what actually catches
problems; CI is the backstop, not the first line):
```
npm run typecheck -w sakura-web
npm run lint -w sakura-web
npm run test:unit -w sakura-web
npm run build -w sakura-web
```
(legacy/ equivalents exist too — always confirm `git status --short legacy/`
is empty before committing if a change wasn't meant to touch legacy/.)

**CI flake (legacy only):** `tests/unit/generateId.test.ts`'s collision test
fails sporadically (~1/12 runs). If a CI job fails and the diff doesn't touch
`generateId.ts`/`generateId.test.ts`, wait for the workflow run to fully
complete, then rerun just that failed job via
`POST /repos/robinrajawat/sakura/actions/jobs/{job_id}/rerun`.

**Before claiming any UI change is fit for real users, actually load it.**
Typecheck/lint/test/build passing is necessary but not sufficient — it
proves the code compiles and existing behavior didn't regress, not that a
new screen looks or behaves right for someone using it. A real browser
(headless is fine — chromium is available at /opt/google/chrome/chrome, or
via `playwright-core` from within web/'s own node_modules) is available in
this environment for exactly this reason. Use it before calling UI work
done. This project already had one real incident from skipping this step —
see docs/framework-migration-plan.md's Phase 5/6 history around the reverted
cutover if the full story is useful context.

## Repo structure

`legacy/` (production, don't touch without a specific reason — check
`git status --short legacy/` before every commit regardless) + `web/` (the
React rewrite, actively developed, npm workspace `sakura-web`). Key
directories inside `web/src/`: `core/` (ported pure logic, e.g.
nodeMutations.ts/nodeQueries.ts/nodeSelection.ts), `store/` (Zustand stores —
outlineStore, documentsStore, docSyncStore, authStore, padStore,
hub*Store, themeStore), `components/` (React components), `utils/`.

`.github/workflows/deploy.yml` currently builds+publishes `legacy/dist/` —
do not repoint this at `web/dist/` without completing
docs/phase6-full-parity-plan.md's own pre-cutover gate (§9 of that doc) and
getting explicit, separate sign-off first, same discipline as every other
"mechanism itself changes" moment in this project's history.

## Current state

*(Update this section at the end of every session. If it looks stale or
contradicts the docs above, trust the docs.)*

As of this writing: `main` is at commit `cc170d6` ("feat(hub): Journal
depth -- editing, rich text, calendar popover (§6.5) (#185)"). Phase 6
(full parity build-out — see docs/phase6-full-parity-plan.md) is underway:
§6.1 (design tokens & app shell), §6.2 (undo/redo & core editing parity),
§6.3 (Note/Code/Pad panels — all 11 items, including item 11's three
sub-features Files/Diagrams/Mind Map), and §6.4 (backlinks/mention
infrastructure) are all complete. §6.5 (Hub full depth) is now in progress:

- To-Dos, first piece landed in #176: priority/status/due-dates/repeat/
  subtasks, wiring fields and logic (`nextRepeatDate`, subtask CRUD) that
  were already real/ported but had no UI until now. Inline per-row
  "Details" toggle rather than legacy's own modal task-detail sheet, same
  first-pass "simpler chrome" convention every other Pad/Hub slice uses.
  Real headless-Chrome testing caught and fixed a genuine crash before
  merge (reading `e.currentTarget.value` inside a `setState` functional
  updater — unsafe under React 18 StrictMode's double-invocation-for-
  purity, since the synthetic event is already gone by the second call).
- To-Dos, second piece landed in #179: search filtering, urgency-based
  sectioning (Overdue/Today/Upcoming/No Date), a collapsible sorted
  Completed section, and due-date reminder notifications (real
  `Notification` API + 5-minute standing check + click-to-focus around the
  already-ported `computeDueRemindersCore`). Direct port of legacy's own
  `renderTodos()`/`checkDueReminders()`. Scoping correction made in the same
  slice: "bulk-actions" and "tags", previously listed as gaps for To-Dos in
  docs/history/phase5-parity-checklist.md, don't exist anywhere in legacy's
  real To-Dos implementation (checked directly against legacy/hub.html and
  legacy/index.html) — dropped from scope as invented-capability risk, not
  built, checklist row corrected.
- Meeting Notes landed in #181: real IndexedDB-backed persistence
  (replacing the old in-memory-only placeholder), time/attendees/agenda/
  body fields, action-item CRUD, and Promote-to-To-Do (a new
  `addTodoFromMeeting` on `hubTodosStore.ts`, matching legacy's real
  `addTodoExternal` exactly). `links`/`outlookEventId`/`icsUid` and
  rich-text agenda/body stay deliberately out of scope. Two scoping
  corrections: legacy's Meeting Notes lives entirely in index.html
  (desktop), not hub.html, which explicitly excludes it from the mobile
  companion; and legacy ships zero prebuilt meeting templates
  (`MEETING_TEMPLATES=[]`, a deliberate documented removal) — the real gap
  was the create-new-meeting entry point, which `createMeeting()` provides.
- Journal landed in #185: replaces the Phase 4 placeholder (freeform
  create/delete, plain textarea) with legacy's real one-entry-per-date
  model — editing an existing entry's mood/body in place
  (`findOrCreateEntry` by `date` in `hubJournalStore.ts`, matching legacy's
  own `findOrCreateJournalEntry`), rich text matching legacy's own actual
  (narrower-than-Note-panel) toolset exactly (bullet/numbered-list toolbar
  buttons + Ctrl/Cmd+B/I keyboard-shortcut-only bold/italic, no
  underline/strike/link/image/table), and a calendar popover
  (`JournalCalendarPopover`, a custom month-grid with Today/Yesterday/
  Tomorrow presets and has-entry dots, direct port of legacy's
  `#journal-date-popover`) to jump to or create any date's entry. Also
  fixed a real data-compat bug found during investigation: web/'s
  `VALID_MOODS` had `'okay'` where legacy has `'neutral'` — any entry
  synced from legacy with `mood:'neutral'` was silently normalizing to
  `''`. Scoping corrections: legacy itself has no tags UI for Journal
  anywhere despite README.md referencing "free-form tags" (a pre-existing
  doc/code mismatch, not built here); search stays out of scope too —
  legacy's own Journal search lives only in the shared Quick Assist /
  hub-wide search bar, neither of which exists in web/ yet. Real
  headless-Chrome testing caught and fixed a genuine layout bug before
  merge (the calendar popover's first draft anchored `right: 0` off its
  trigger button, which sits close to the left sidebar — on a real page
  this rendered the popover partly underneath the sidebar's stacking
  region and made a real click fail; fixed by anchoring `left: 0`
  instead), and separately confirmed (not fixed, correctly) that a
  caret-jumps-to-start quirk when clicking the bullet-list button after
  typing existing text is an inherited `execCommand('insertUnorderedList')`
  browser quirk already present identically in NotePanel.tsx's own
  bullet-list button, not a regression from this slice.
- Still open in §6.5: To-Dos'/Meeting Notes' PDF export/Version
  History/Share (deferred to §6.6/§6.8 — cross-cutting infra, not
  Hub-specific); Meeting Notes' cross-document node links (separately
  scoped); Library; Recap; Mobile Hub. §6.6 onward not started.

Item 11's three §6.3 sub-features, for reference on how each was scoped:
Files (#168, real upload/storage via FileReader.readAsDataURL, base64
data: URI inline in the doc's own state, 5MB cap); Diagrams (#172, full
draw.io embed via its official postMessage protocol + Generate-from-
outline reusing the already-ported `diagramGen*.ts` core logic — verified
end-to-end in headless Chrome except the actual draw.io load/save
handshake itself, which that session's sandbox couldn't reach over the
network); Mind Map (#174, a genuinely freeform canvas — pan/zoom/drag/
connect/edit nodes, no parentId tree or auto-layout like legacy's real
model, links as the sole connection mechanism — headless-Chrome testing
across two rounds caught and fixed three real bugs before merge, see that
PR's own description for specifics).

An AI key vault (Cloudflare Worker) proposal is recorded as an
unscheduled appendix at the end of docs/phase6-full-parity-plan.md,
connected to §6.9 but not committed to a slot yet.

No feature branches are currently open for review (the merged
`hub/journal-editing-richtext-calendar` branch's local copy was deleted;
its remote copy could not be -- confirmed this repo has branch protection
applied to every branch, not just `main`, since every prior feature
branch back through PR #1 is still sitting on the remote too, never
auto-deleted on merge; this is this repo's actual standing state, not a
new problem, and matches the "verify both actually happened" caveat this
file's own workflow rules already call out). No PR is mid-review.
Production (`www.sakura-notes.com`) is on `legacy/`, confirmed working — a Phase 5
cutover attempt was made and reverted the same day after a real production
issue (`web/`'s outline store booted every visitor into Phase 0 dev/spike
placeholder text instead of a real document; fixed in #122, but `deploy.yml`
was deliberately left pointed at `legacy/` rather than re-attempting cutover,
since the fix alone doesn't clear Phase 6's actual gate).
```
