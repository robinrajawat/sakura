/**
 * Safe cloud writes — cloud-first plan Phase 1 (docs/cloud-first-plan.md).
 *
 * Every cloud document carries `rev`, a number that goes up by one on each write. A device
 * remembers, per document, the `rev` its own copy is based on (the one it last loaded from the
 * cloud or last wrote). A push may only replace the cloud copy when the cloud is still at that
 * `rev`: otherwise another device saved in between, and writing would silently throw that work
 * away (the 2026-11-12 data loss was this, through a blank placeholder). The push then stops,
 * and the caller keeps this device's copy as a version and takes the cloud's.
 *
 * Migration: documents written before this existed have no `rev` (read as 0), and a device that
 * has not loaded a document since the update has no remembered `rev` for it. For that one case
 * the old rule still decides (this device's last save is at least as new as the cloud's last
 * write), so updating the app never turns ordinary saves into conflicts. From then on the
 * remembered `rev` decides.
 */

export interface CloudDocState {
  /** Whether the cloud has this document at all. */
  exists: boolean;
  /** The cloud document's `rev` field, as stored (may be missing on older documents). */
  rev?: unknown;
  /** The cloud document's `updatedAt` (ms), as stored. */
  updatedAt?: unknown;
}

export type DocPushDecision = { write: true; nextRev: number } | { write: false };

/** Pure: a stored `rev` value as a whole number (missing or invalid reads as 0). */
export function readDocRev(rev: unknown): number {
  const n = Number(rev);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

/**
 * Pure: may this device write its copy over the cloud's?
 * - No cloud copy: write (a new document, or one deleted elsewhere and still edited here).
 * - A remembered `rev`: write only when the cloud is still at it.
 * - No remembered `rev` (migration): write only when this device's last save is at least as new
 *   as the cloud's last write.
 * `nextRev` is the `rev` to store with the write.
 */
export function decideDocPush(
  cloud: CloudDocState,
  baseRev: number | undefined,
  localUpdatedAt: number
): DocPushDecision {
  if (!cloud.exists) return { write: true, nextRev: (baseRev ?? 0) + 1 };
  const cloudRev = readDocRev(cloud.rev);
  if (baseRev !== undefined) {
    return cloudRev === baseRev ? { write: true, nextRev: cloudRev + 1 } : { write: false };
  }
  const cloudTs = Number(cloud.updatedAt) || 0;
  return cloudTs <= localUpdatedAt ? { write: true, nextRev: cloudRev + 1 } : { write: false };
}

/**
 * Pure: catching up with the account, should this device send up its copy of a document the
 * account already has? Yes when the copy here was saved after the account's last write (an edit
 * made offline whose push never ran, e.g. the tab was closed first). The push itself still goes
 * through decideDocPush, so a copy that is newer here but based on an older rev is kept as a
 * version rather than written over the account's.
 */
export function localCopyIsNewer(localUpdatedAt: unknown, cloudUpdatedAt: unknown): boolean {
  const local = Number(localUpdatedAt) || 0;
  const cloud = Number(cloudUpdatedAt) || 0;
  return local > cloud;
}

/**
 * Pure: a document was permanently deleted on another device (a marker in the account says when).
 * Does that delete win over this device's copy? Yes unless this copy was saved after the delete,
 * or has unsaved edits on screen: then the edit wins and the document stays (and goes back up).
 */
export function deletionWins(localUpdatedAt: unknown, deletedAt: unknown, hasUnsavedEdits: boolean): boolean {
  if (hasUnsavedEdits) return false;
  return (Number(localUpdatedAt) || 0) <= (Number(deletedAt) || 0);
}
