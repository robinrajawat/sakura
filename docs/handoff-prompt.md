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

**PR discipline:** Every change, however small (including docs-only), goes
through: feature branch → commit (`git commit -F <tempfile>`, never `-m` with
backticks) → push → open PR via GitHub API → poll check-runs until CI
(`verify-legacy` + `verify-web`) is green → merge via API (squash) →
`git checkout main && git pull` → confirm fast-forward → delete the local
and remote branch (verify both actually happened, per the note above). One
logical change per PR.

**Full gauntlet before every merge** — for whichever workspace(s) a change
touches:
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

As of this writing: `main` is at commit `71dfd6e` ("feat(web): real file
upload/storage for Pad Files tab (Phase 6.3, item 11 part 1)", #168). Phase 6
(full parity build-out — see docs/phase6-full-parity-plan.md) is underway:
§6.1 (design tokens & app shell) complete, §6.2 (undo/redo & core editing
parity) complete, §6.4 (backlinks/mention infrastructure) complete, and
§6.3 (Note/Code/Pad panels) is 10 of 11 items landed — item 11 (Diagrams,
Mind Map, Files) is itself three sub-features, scoped and sequenced as
Files → Diagrams → Mind Map. Files landed in #168 (real upload/storage via
FileReader.readAsDataURL, base64 data: URI inline in the doc's own state,
5MB cap — no backend needed, matching legacy's own approach exactly).
Diagrams is next: full draw.io embed + Generate-from-outline (reusing the
already-ported `diagramGen*.ts` core logic from Phase 1, never yet wired to
any UI). Mind Map after that: a full canvas editor (pan/zoom/drag/connect).
§6.5 onward not started. An AI key vault (Cloudflare Worker) proposal is
recorded as an unscheduled appendix at the end of that same plan doc,
connected to §6.9 but not committed to a slot yet.

No feature branches are currently open. No PR is mid-review. Production
(`www.sakura-notes.com`) is on `legacy/`, confirmed working — a Phase 5
cutover attempt was made and reverted the same day after a real production
issue (`web/`'s outline store booted every visitor into Phase 0 dev/spike
placeholder text instead of a real document; fixed in #122, but `deploy.yml`
was deliberately left pointed at `legacy/` rather than re-attempting cutover,
since the fix alone doesn't clear Phase 6's actual gate).
```
