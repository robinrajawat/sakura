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

### 1. Safe writes (do first, whatever else is decided)

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

### 2. Version history in the account

Versions today live only in this browser (`sakura_doc_rev_v1_<id>`), which is why recovery on a
new computer is limited. Store them in `users/{uid}/docs/{docId}/versions/{ts}` too: the same
moments that record a local version (10-minute gap, "Before changes from another device",
"Before restoring", Phase 1's conflicts), capped per document (10, as now), oldest dropped.
Version history lists both, newest first, and restoring works from any device.

Watch: each version is a full copy, and a Firestore document holds at most 1MB, so very large
documents need the same split the diagrams already use (or versions without diagram XML).

### 3. Open documents from the account

For a signed-in person, opening a document reads the cloud copy first when online (the realtime
listener usually has it already, so this is mostly about not trusting a stale cache), falling back
to the cached copy offline. A small status shows where things stand: "Saving…", "Saved to your
account", "Offline: saved on this device, will sync". The File Explorer only lists documents
whose content is here (cached) or loading (the #842 lock covers the gap).

### 4. Guest mode, said plainly

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

### 6. Docs and privacy wording

README.md ("no account needed", "Everything is stored in your browser") and
docs/feature-reference.md ("stores its data locally in the browser by default") describe
local-first; the in-app privacy text likely does too. Rewrite them when Phases 1–4 are live, not
before.

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

## Order

1 → 2 → 3 → 4 → 5 → 6. Phase 1 protects data on its own and is worth doing even if the rest
waits. Phases 2 and 3 can swap. PDF reliability is independent and can go any time once its
failure is known.
