# Cloud-first plan

**Status:** proposed (2026-11-12), not started. Owner direction: Sakura becomes cloud-first, while
anyone can still try it without an account. Nothing here is built yet; each phase below is meant
to land as its own PR (or small series), in order.

## Why

Today the browser's copy of a document is the real one, and the account is a mirror that
last-write-wins sync keeps roughly in step (`pushDocToCloud` writes with `setDoc`, no check of
what the cloud holds). That design is the root of the 2026-11-12 data loss (#842): a device whose
copy was blank or stale saved over the real document in the cloud, and nothing stopped it. #842
closed that one path; the class of bug stays open while any device can overwrite the cloud
unconditionally.

Cloud-first flips it: **for a signed-in person the account's copy is the truth, and the browser
holds a cache** (for speed and offline use). Server features (PDF files, sharing, hosted AI) then
stop being "extras with a fallback" and become reasons to have an account.

## What stays

- **Try without an account.** A guest can open Sakura and work straight away (the same
  pattern as Excalidraw and tldraw). Guest work lives in the browser only, and moves to the
  account on sign-in; that move already works (`pullAndMergeFromCloud` pushes local-only
  documents up on first sign-in).
- **Offline editing for signed-in people,** as a deliberate cache with a clear "will save when
  you're back online" state, not as the source of truth.
- Sharing stays "Send a copy" (owner, 2026-11-03), and the phone stays read-only.

## Phases

### 1. Safe writes (built 2026-11-12: `src/state/docRev.ts`, `pushDocToCloud`, `resolveDocPushConflict`; Firestore rule in `firebase/firestore.rules`, published 2026-11-13)

Every cloud document gets a version number (`rev`, an integer). A device remembers the `rev` it
last loaded or wrote for each document. A push is a Firestore transaction: read the cloud
`rev`; write only if it equals the remembered one, and store `rev + 1`. If it doesn't match,
someone else saved in between:

- nothing is overwritten;
- the cloud copy comes down, the local edits are kept as a version ("Your changes on this
  device"), and the person sees a calm notice with a way to compare and restore;
- an open document shows the existing "updated on another device" banner.

Also: a device that has never loaded a document from the cloud may not write it at all
(closes the placeholder case at the server boundary, not just in the editor).

Scope: `pushDocToCloud`, `applyIncomingDocData`, the realtime listener, the docs index entry
(which then carries `rev`). Firestore rules can enforce `rev == resource.data.rev + 1` so an old
client can't bypass it. Tests: unit tests for the decision (pure, in `src/state/`), e2e with a
fake Firestore for "two devices edit the same document".

Cost: one extra read per push (inside the transaction). Pushes are already debounced (1.5s).

### 2. Version history in the account (mostly built already)

Correction (2026-11-12): document versions already sync. Each version is also written to
`users/{uid}/docs/{docId}/versions/{ts}`, and Version history joins the cloud's versions with
this device's (docs/feature-reference.md, Version History). What's left: Phase 1's conflict
version ("Your changes on this device") goes through the same path, and a version over
Firestore's 1MB record limit, which today stays on the device that made it, gets the diagram
split so it reaches the account too.

### 3. Open documents from the account (save state and automatic retry built 2026-11-12)

For a signed-in person, opening a document reads the cloud copy first when online (the realtime
listener usually has it already, so this is mostly about not trusting a stale cache), falling back
to the cached copy offline. A small status shows where things stand: "Saving…", "Saved to your
account", "Offline: saved on this device, will sync". The File Explorer only lists documents
whose content is here (cached) or loading (the #842 lock covers the gap).

Built: the save state after the folder path, hidden while saved (`renderDocSaveState`: Saving… / Offline / Not
synced / Only on this device) and automatic retry of failed pushes (15s doubling to 5 min, and on
`online`; before, a failed push waited for the next edit). Loading itself already comes from the
account: the live listener keeps every document current, and #842 locks a document until its
content has arrived.

### 4. Guest mode, said plainly (wording and label built 2026-11-12; the sign-in prompt 2026-11-13)

Signed out, the app says the work is "Only on this device" (a quiet line near the title, not a
nag). It asks to sign in at the moments where the account clearly helps: sharing, downloading a PDF
file, a day after the first document has real content, or when browser storage is getting full.
(A visit from a second device can't be detected, so that moment can't be used.)
The sign-in screen's wording changes from "Optional" to the benefit. Signing in moves the
guest's documents up (exists) and says so.

### 5. Account features

- **PDF file download** for signed-in people (exists; needs to work reliably first, see
  "PDF" below). Guests get the print dialog, labelled "Print / Save as PDF".
- Sharing and hosted AI already need an account.

### 5b. Data & Backup, cut down (built 2026-11-12)

Today Settings → Data & backup has Backup all data, Restore from backup, Undo last restore,
Secure Storage and Reset. With the account as the real copy (synced documents, synced versions),
most of it is a second safety system for signed-in people. Proposal:

- **Signed in:** one **Download all data** button (a full JSON export: data portability, the
  "export your workspace" that Notion and Google offer). **Restore from backup** and **Undo last
  restore** go: a restore replaces the whole workspace and has to be held back from sync
  (`SAKURA_JUST_RESTORED_KEY`, the reconcile-only pull), and per-document Version history covers
  recovery. Bringing work back from an old file can become an import that adds documents rather
  than replacing everything, if anyone asks for it.
- **Guests:** keep Backup and Restore (their only copy outside the browser), with the line
  "Sign in and your documents are kept in your account automatically" above them.
- **Secure Storage** (a passphrase for bring-your-own AI keys) is an AI setting, not a data one:
  move it under AI, or drop it if bring-your-own keys go once Hosted AI is the default. Separate
  decision.
- **Reset** stays.

Do this after Phase 1 (safe writes) is live, so the account copy is trustworthy before the
file-based safety net is narrowed. Owner decision needed before building.

### 6. Docs and privacy wording

README.md and docs/feature-reference.md were reworded on 2026-11-12 to lead with the account
(sign in and your documents are kept in your account; or try it without one and they stay in
this browser), which is already true. Still to update as the phases land: the in-app sign-in
screen ("Optional: sign in…"), Settings → About → Privacy & data, and the Data & Backup section
once 5b ships.

## PDF (decide before Phase 5)

The server PDF currently fails for the owner with "Couldn't make the PDF file" (not the daily
limit). Cause unknown until the `/pdf` request's status and response are seen (browser dev tools
→ Network, or `wrangler tail`). Separately, Cloudflare's Workers Free plan allows about 10
browser-minutes a day for the whole app, and each PDF keeps a browser warm for 60s
(`keep_alive` in `worker/src/pdf.ts`), so it can't carry real use either way. Cloud-first PDF
realistically means the Workers Paid plan (about $5/month plus usage, per Cloudflare's published
pricing; check current numbers). Any change under `worker/` redeploys the live Worker on merge,
so those PRs are merged by the owner on purpose.

## Costs and risks

- **Running cost grows with users:** Firestore reads/writes (Phases 1–3 add some), version
  storage (Phase 2), Browser Rendering (PDF). Free tiers cover testing, not growth.
- **Offline becomes a designed state,** with its own tests, instead of the default.
- **Migration:** existing documents have no `rev`. The first push after Phase 1 ships treats a
  missing `rev` as 0 and starts numbering; old clients still running keep last-write-wins until
  the rules enforce `rev` (ship the rule a little after the client).
- **Privacy promise changes** for anyone who reads the current wording: say it in the release
  note, and keep guest mode genuinely local.

## Follow-ups built 2026-11-13

- **Offline edits reach the account.** Catching up (`pullAndMergeFromCloud`) now also sends a
  document whose copy here was saved after the account's last write (`localCopyIsNewer`);
  before, only documents missing from the account went up, so an edit made offline in a tab
  closed before reconnecting stayed on the device until the next edit. The rev check still decides.
- **Deletes reach every device.** Delete forever writes `users/{uid}/deletedDocs/{id}`
  (`deletedAt`); other devices remove their copy on catch-up or live (`applyIncomingDocDeletion`),
  unless it was saved there after the delete or has unsaved edits (`deletionWins`): then the edit
  wins, the marker is cleared and it goes back up. Documents with a marker are never sent back up
  as "missing". Account deletion clears the markers too.
- Folders, the document list and order, folder membership, settings and To-Dos merge (2026-11-13,
  `src/state/metaMerge.ts` `merge3`): each device keeps the value it last agreed with the account
  (`sakura_sync_meta_base_v1`); taking a change merges in this device's own unsent ones, and sending
  one merges, in a transaction, whatever another device sent since. Same entry changed on both: the
  newer side wins.

## Order

1 → 2 → 3 → 4 → 5 → 5b → 6. Phase 1 protects data on its own and is worth doing even if the rest
waits. Phases 2 and 3 can swap. PDF reliability is independent and can go any time once its
failure is known.
