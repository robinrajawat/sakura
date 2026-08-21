/**
 * Sync subsystem — Phase 4, third slice. `startSharedDocRealtimeSyncIfNeeded`'s own `onSnapshot`
 * callback (in `index.html`) inlines a "should this incoming update to a document shared TO this
 * account actually be applied" decision across four separate checks: is this Firestore's own
 * catch-up first snapshot (not a real change), does the snapshot exist at all, is it our own
 * write echoing back, and has the tab switched away from this document since the listener was
 * attached. Same "should apply" shape as `syncApply.ts`'s `shouldApplyIncomingSyncCore`, but a
 * genuinely distinct, simpler variant worth its own function rather than trying to unify with
 * it: a shared document has no local index entry to compare a staleness timestamp against (only
 * the owner's docs/templates have that), so there's no staleness check here at all — only echo
 * suppression, existence, first-snapshot, and open-tab checks. Everything else in the callback —
 * the actual `localStorage.setItem`, the cross-tab banner — stays hand-written.
 */

/** Pure: matches the shared decision fragment inside `startSharedDocRealtimeSyncIfNeeded`'s
 * `onSnapshot` callback exactly. `cloudUpdatedAt` is coerced the same way the original does
 * (`Number(x)||0`). Returns `false` (don't apply) when: this is Firestore's own first, catch-up
 * snapshot (`isFirstSnapshot`); the document no longer exists in Firestore (`snapshotExists` is
 * `false`); `lastPushedTsForDoc` exactly equals the coerced cloud timestamp (this account has
 * editor access and just pushed this exact write, so it's an echo, not a genuinely external
 * change); or the person has switched to a different tab since the listener was attached
 * (`docId !== currentDocId`). Returns `true` only when none of those hold. */
export function shouldApplySharedDocRealtimeUpdate(
  isFirstSnapshot: boolean,
  snapshotExists: boolean,
  cloudUpdatedAt: unknown,
  lastPushedTsForDoc: number | undefined,
  docId: string,
  currentDocId: string | null
): boolean {
  if (isFirstSnapshot || !snapshotExists) return false;
  const cloudTs = Number(cloudUpdatedAt) || 0;
  if (lastPushedTsForDoc === cloudTs) return false;
  if (docId !== currentDocId) return false;
  return true;
}
