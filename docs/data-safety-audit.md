# Data safety audit (2026-11-16)

Owner: "Do a thorough check, we can not afford the data losses. No one would use the app if the
basics are not in place." This audit came after a real loss: a document's title disappeared after
Download PDF in iPhone Safari. Each item below says how it was checked. "Tested" means a browser
test drives it, and it fails when the protection is taken out.

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
- **Signing out:** nothing on the device is removed. Edits not yet uploaded go up at the next
  sign-in.
- **A document opened before its content has loaded from the account:** typing is locked until it
  arrives, so an empty placeholder never saves over the real copy (`doc-content-pending.spec.ts`).
- **Download PDF:** reads the document and never writes it. Checked with an export, an export then
  hide and reload, and an export signed in followed by a catch-up.

## Still open

- **The iPhone itself.** Safari behaviour is checked with Chrome's phone emulation; Safari isn't
  available in this environment. The title fix is aimed at the most likely cause. If a field ever
  changes without you, the app logs `[sakura] title changed without the app or you`.
- **Unsent thread reply text** is kept in memory while the app runs, not on the device.
