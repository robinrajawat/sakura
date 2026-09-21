/**
 * Sync subsystem — Phase 4, first slice. The three `applyIncoming*Data` functions
 * (`applyIncomingDocData`, `applyIncomingTemplateData`, `applyIncomingMetaData` in `index.html`)
 * each independently inline the same "should this incoming cloud update actually be applied"
 * decision: is it our own write echoing back (guarded via `_lastPushedTs`), and if not, is it
 * actually newer than what's stored locally. Real duplication — three near-identical
 * three-line blocks — genuinely worth sharing, unlike the systemic-but-far-larger sync pattern
 * (storage-layer writes, cross-tab banners, collaborator notifications, IndexedDB-vs-localStorage
 * branching) that surrounds each one, which stays hand-written orchestration.
 *
 * Investigated the three blocks closely before assuming they were interchangeable — they
 * weren't quite. `applyIncomingDocData`/`applyIncomingTemplateData` both special-case "no local
 * record exists yet" as an unconditional bypass of the staleness check (`if(localEntry&&...)` —
 * short-circuits to false, so a genuinely new item always gets applied regardless of its cloud
 * timestamp). `applyIncomingMetaData` has no such bypass — it always compares against a
 * default-zero local timestamp even when the key was never set before, so a cloud update with a
 * falsy/zero `updatedAt` for a brand-new key would actually be REJECTED, not applied — a real,
 * preserved behavioral difference between the three, not a bug to fix. `localUpdatedAt: null`
 * expresses the first two functions' bypass case explicitly; passing a real number (including
 * `0`) expresses the third's "always compare, no bypass" case — the caller chooses per its own
 * original semantics, this module doesn't collapse the distinction.
 */

/** Pure: matches the shared decision fragment inside `applyIncomingDocData`/
 * `applyIncomingTemplateData`/`applyIncomingMetaData` exactly. `cloudUpdatedAt` is coerced the
 * same way the originals do (`Number(x)||0`, so a missing/non-numeric value reads as `0`).
 * Returns `false` (don't apply) when `lastPushedTsForKey` exactly equals the coerced cloud
 * timestamp — our own write echoing back, not a genuinely external change — or when
 * `localUpdatedAt` is a real number and the cloud timestamp isn't strictly newer than it.
 * `localUpdatedAt: null` means "no local record exists for this key" and unconditionally
 * bypasses the staleness comparison (matches `applyIncomingDocData`/`applyIncomingTemplateData`'s
 * own "new item" bypass); a real number — including `0` — always compares (matches
 * `applyIncomingMetaData`'s own no-bypass behavior). */
export function shouldApplyIncomingSyncCore(
  cloudUpdatedAt: unknown,
  localUpdatedAt: number | null,
  lastPushedTsForKey: number | undefined
): boolean {
  const cloudTs = Number(cloudUpdatedAt) || 0;
  if (lastPushedTsForKey === cloudTs) return false;
  if (localUpdatedAt !== null && cloudTs <= localUpdatedAt) return false;
  return true;
}
