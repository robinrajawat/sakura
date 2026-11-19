# Data safety audit (2026-11-16)

Owner: "Do a thorough check, we can not afford the data losses. No one would use the app if the
basics are not in place." This audit came after a real loss: a document's title disappeared after
Download PDF in iPhone Safari. Each item below says how it was checked. "Tested" means a browser
test drives it, and it fails when the protection is taken out.

## The standard (owner, 2026-11-16: "a standard, cloud first application with 0 risk of data loss")

Zero risk can't be promised (a phone that dies mid-keystroke, a browser that wipes its storage).
What Sakura promises instead, and what every change must keep true:

1. **Nothing you typed is lost without a warning.** If something can't be saved, the app says so.
2. **Anything typed more than about 2 seconds ago survives** a reload, a crash, the app being put
   away, and moving to another device (signed in).
3. **When two copies disagree, both are kept.** Nothing is overwritten without a copy to go back to.

**Sync rules** (owner 2026-11-19, after a cleared iPhone unfiled every document): every sync path
keeps these, each pinned by a test in `sync-data-safety.spec.ts` or `first-sync-keeps-account-lists.spec.ts`.
When in doubt, nothing is sent and nothing is deleted: the worst case is a change syncing late.

- A device's **first sync merges** with the account (union, the account winning conflicts); it
  never decides by timestamp, and never writes over the account's copy.
- **Only what this device actually has is sent.** Content it can't read (a diagram in a failing
  store, a list missing here) is left out, never sent as empty.
- **A delete never removes newer content.** A blank document cleared away leaves the account's
  copy if another device wrote it since.
- **A copy is replaced only once it is kept.** Before another device's copy replaces this one, this
  one is confirmed saved as a version (here or in the account); otherwise nothing changes yet.
- **Documents stay with their account.** A device holding another account's documents asks before
  anything syncs; they are never merged into a different account.

How (the pattern Google Docs, Notion and Linear use): **saved on the device first, then synced to
the account**, which is the copy everyone agrees on. A purely cloud copy would lose more: anything
typed offline or on a bad connection would have nowhere to go. Direction for the cloud side:
`docs/cloud-first-plan.md`.

### Where you can type, and how each is kept

Every field is listed, with how it's kept, in `web/tests/unit/textFieldsKept.test.ts`. That test
reads `index.html` and fails when a field appears that isn't listed, so a new field can't ship
without deciding how its text is kept. In short:

| How it's kept | Fields |
|---|---|
| **As you type**, into the document or list (synced, Version history) | Rows, notes, title, author, diagram title |
| **When you leave the field**; the app leaves it for you when it's put away | Thread entries and their author, table cells, renames, image captions and labels, diagram names, To-Do text, "waiting for", subtasks, the link's label |
| **Draft** (shared store: saved as you type, synced, back after a reload, kept from both devices) | Thread reply box, "Add a task…", the feedback message |
| **Written into the document or list when the app is put away** | API request editor (the form stays open), a subtask typed but not added |
| **Kept as you draw** (draw.io's autosave; closing no longer asks) | The diagram editor |
| **Short entries**, applied with Enter or OK | Link addresses, tags, names in dialogs, a pasted cURL |
| Settings, or not content | Settings, search boxes, sign-in, e-mail addresses, typing DELETE to confirm |

**Drafts (2026-11-16).** One store for unsent text (`typedDrafts` in `index.html`;
`fieldDraftSave` / `fieldDraftRestore` for a plain field). Thread replies, as in Slack: saved on the device as you type, synced to the
account a moment after you stop (and at once when the app is put away), back with its thread open
after a reload or on your other devices, removed only when sent or closed, dropped after 30 days
untouched. When two devices changed the same draft, both texts are kept in it, the newer first
(one per line for a plain field) (`src/utils/threadDrafts.ts`, `mergeDrafts`; the generic merge
would let one side win). A field on screen takes the merged text at once, so typing on doesn't save
over the other device's words. "Add a task…" moved here from its device-only key, which is carried
over once. Tests: `thread-drafts.spec.ts`, `threadDrafts.test.ts`, `table-api.spec.ts` (API editor).

## Fixed

| Risk | What happened | Fix | Test |
|---|---|---|---|
| Safari refills a field when coming back to the page (title lost after Download PDF) | Didn't reproduce in Chrome. Safari can put an old value into a text field after the app has loaded the document, and the next save stored it. | The title and author change only through the app or while you're using the field. Anything else is put back before every save, on load/`pageshow` and on return (`src/ui/fieldGuard.ts`). | `doc-title-guard.spec.ts` |
| A task's text edited, then the phone puts the app away | The edit saved only when the field lost focus, which a phone doesn't do. The edit was lost. | Saved when the page is hidden. An empty text is left alone, because saving it would delete the task. | `phone-background-safety.phone.spec.ts` |
| Rename (document, folder), "waiting for" or a thread entry in progress when the app is put away | Same: these saved only on leaving the field. | When the page is hidden, the field is left for you, so its own save runs. | `phone-background-safety.phone.spec.ts` (rename) |
| A task typed in "Add a task…" but not added yet | Lost when the app closed. | Kept as a draft and restored. | `phone-background-safety.phone.spec.ts` |
| Device storage full (iPhone Safari allows about 5 MB) | Each save said "NOT saved", but nothing reached the account either, because the upload read the old stored copy. | Signed in, the newest copy is kept in memory and uploaded to the account; the message says so. | `doc-safe-writes.spec.ts` |
| Safari clearing a site's data after about 7 days without a visit | A guest's only copy is on the device. | The app asks the browser to keep its data (`navigator.storage.persist()`). Safari often declines for sites not added to the home screen, so signing in is the real protection. | (no browser test: the browser decides) |
| Android keyboards sending Enter/Backspace with no key event (key 229) | A raw line break inside a row; typing then ran on in the same row. | Refused, and the row's own key handling gets the key (#870). | `phone-keyboard-safety.phone.spec.ts` |
| Just opening a document, signed in, showed "Saving…" and sent it up again; on the phone, "This document was just updated on another device" with nothing else open | The account hands a copy back with its keys in its own order, and comparing as plain JSON read that as a change. With two uploads close together, the first one's echo was then taken for another device's | Comparisons ignore key order (`stableJson`, also in the To-Dos/settings/draft merges, where an item deleted on another device could come back). Every recent upload is remembered, and a copy at the version this device already has is nothing new | `sync-own-echo.spec.ts`, `metaMerge.test.ts`, `threadDrafts.test.ts` |
| A version over one cloud record (usually large diagrams); a version whose upload failed | Kept only on the device that made it (lost with it); a failed upload was retried only when Version history was next opened there | Stored in the account as a head and parts, sized in bytes; a failed upload is retried after the next successful sync. Only a version past about 17 MB stays on the device | `version-cloud-sync.spec.ts`, `versionChunks.test.ts` |
| Folding a row or a table (on a phone, or anywhere) | Sent the whole document to the account ("Saving…") and moved its version on, so a real edit on another device could be refused as a conflict and kept aside as a version. Every save also re-sent the documents list and the settings | Folds are how the document is looked at (`DOC_VIEW_ONLY_FIELDS`): kept with it here, sent with the next real edit. The list and the settings go only when they changed | `sync-own-echo.spec.ts` |
| A drawing in the diagram editor, not yet Saved inside draw.io | Lost when closing (it asked first) or when the app was closed | draw.io sends the drawing as it changes (`autosave=1`); kept like a Save, only once the real diagram was loaded; closing makes the picture and closes | `diagram-autosave.spec.ts` (draw.io's messages played by the test; check once by hand) |
| Clearing website data on an iPhone, then signing in | Every document showed as Unfiled for every device: the first sync took "newer timestamp wins", and clearing away a blank document had re-saved the empty folder links. | A first sync merges, on pull and push. | `first-sync-keeps-account-lists.spec.ts` |
| A diagram the device can't read (IndexedDB failing, as Safari does after the app sits in the background) | The next edit to its document sent the diagram up empty, blanking it in the account. | Only content the device has is sent; IndexedDB reconnects and retries (#906). | `sync-data-safety.spec.ts`, `diagram-storage-recovery.spec.ts` |
| A blank document cleared away after another device wrote in it | Deleted from the account with the other device's words. | Deleted there only if unchanged since this device's copy. | `sync-data-safety.spec.ts` |
| Two devices edited a document while this device's store was failing | "Your edits are kept in Version history", but the version could fail to save and the edits were replaced. | Replaced only once the version is confirmed kept. | `sync-data-safety.spec.ts` |
| Signing out ("keep them here"), then in to another account | The first account's documents merged into the second. | Kept apart; the person chooses. | `sync-data-safety.spec.ts` |
| Version history on a phone | Unreachable, because it opens by right-clicking. | A ⋯ document menu on the phone's top line. | `phone-shell.phone.spec.ts` |

## Checked and safe

- **Typing in a row, a note or the title, then the app put away:** they save as you type, and the
  hidden handler writes them to storage (`phone-keyboard-safety`, probes).
- **Another device saved the same document:** saves check the account's version (`rev`). A copy
  based on an older version never overwrites, and this device's edits go to Version history
  (`doc-safe-writes.spec.ts`).
- **Edited offline or closed before uploading:** the next catch-up sends anything newer than the
  account's copy (`sync-offline-and-deletes.spec.ts`).
- **To-Dos on two devices at once:** merged task by task, so an add on one device and a delete on
  the other both survive (`metaMerge.test.ts`).
- **Deleted forever on one device:** removed on the others, unless it was edited there afterwards
  (then the edit wins) (`sync-offline-and-deletes.spec.ts`).
- **Signing out (2026-11-17, owner: "Privacy matters"):** everything still on its way is sent to
  the account first (a catch-up, the queue, failed version uploads). Then the account's data is
  removed from this device: on a reload, before anything reads it, so nothing the closing page
  writes survives. If something can't be sent, the person chooses "Stay signed in" (the default)
  or "Sign out, keep them here"; nothing unsent is removed (`sign-out-clears-device.spec.ts`).
  Every open tab signs out together (BroadcastChannel `sakura-account`): the others save what they
  hold before the check, then clear and reload, or just show signed out when the data is kept.
  Deleting the account still keeps this device's copy: then it's the only one left.
- **A document opened before its content has loaded from the account:** typing is locked until it
  arrives, so an empty placeholder never saves over the real copy (`doc-content-pending.spec.ts`).
- **Download PDF:** reads the document and never writes it. Checked with an export, an export then
  hide and reload, and an export signed in followed by a catch-up.

## Still open

- **The iPhone itself.** Safari behaviour is checked with Chrome's phone emulation; Safari isn't
  available in this environment. The title fix is aimed at the most likely cause. If a field ever
  changes without you, the app logs `[sakura] title changed without the app or you`.
- **The diagram editor's autosave** is tested by playing draw.io's messages, since draw.io can't
  load in this environment. Worth one check by hand: draw something, close without Save, reopen.
- **Short entries** (a link address, a tag, a name in a dialog, a pasted cURL) are gone if the app
  closes mid-entry. Accepted: a few words or a paste, and bringing them back would reopen
  half-finished popovers against whatever is selected later. A new subtask isn't one of these any
  more: it's added when the app is put away.
