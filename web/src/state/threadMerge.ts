/**
 * Thread entries when two devices' copies of a document collide (owner 2026-11-20: a thread added
 * on the phone vanished on the Mac and the other way round; each time, that device's whole copy went
 * to Version history as "Your changes on this device"). The account's copy is still the one kept,
 * as the sync rules say, but thread entries are merged into it by id, as offline-first apps do,
 * instead of being lost with the rest of this device's copy.
 *
 * - Every entry in the kept copy stays (an entry both copies have keeps the kept copy's version).
 * - An entry only this device has is added, unless the kept copy records it as deleted
 *   (`remarkTombstones`: entry id → time deleted) or its row isn't in the kept copy.
 * - Deletion records from both copies are kept, and dropped after TOMBSTONE_MAX_AGE_MS.
 *
 * A deletion made only on this device doesn't win over the kept copy: when in doubt nothing is
 * deleted (docs/data-safety-audit.md, Sync rules). Pure; called from resolveDocPushConflict and
 * applyIncomingDocData in index.html.
 */

export type ThreadEntry = { id: string | number; anchorNodeId?: unknown; answerTo?: unknown; createdAt?: number; [k: string]: unknown };
export type Tombstones = Record<string, number>;

export const TOMBSTONE_MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000;

/** Records an entry as deleted, at `now`. Returns a new map. */
export function addTombstone(t: Tombstones | null | undefined, id: string | number, now: number): Tombstones {
  return { ...(t || {}), [String(id)]: now };
}

/** Deletion records younger than TOMBSTONE_MAX_AGE_MS, from both maps (the later time when both have one). */
export function mergeTombstones(a: Tombstones | null | undefined, b: Tombstones | null | undefined, now: number): Tombstones {
  const out: Tombstones = {};
  for (const m of [a, b]) {
    if (!m || typeof m !== 'object') continue;
    for (const [id, at] of Object.entries(m)) {
      const t = Number(at);
      if (!Number.isFinite(t) || now - t > TOMBSTONE_MAX_AGE_MS) continue;
      if (!(id in out) || out[id] < t) out[id] = t;
    }
  }
  return out;
}

export type ThreadMergeResult = { remarks: ThreadEntry[]; remarkTombstones: Tombstones; added: number };

/**
 * Merges this device's thread entries into the kept copy's.
 * @param keptRemarks the kept (account's) copy's entries
 * @param keptTombstones the kept copy's deletion records
 * @param mineRemarks this device's entries
 * @param mineTombstones this device's deletion records
 * @param keptRowIds ids of the rows in the kept copy
 */
export function mergeThreadEntries(
  keptRemarks: ThreadEntry[] | null | undefined,
  keptTombstones: Tombstones | null | undefined,
  mineRemarks: ThreadEntry[] | null | undefined,
  mineTombstones: Tombstones | null | undefined,
  keptRowIds: Iterable<unknown>,
  now: number
): ThreadMergeResult {
  const kept = Array.isArray(keptRemarks) ? keptRemarks.filter((r) => r && r.id != null) : [];
  const mine = Array.isArray(mineRemarks) ? mineRemarks.filter((r) => r && r.id != null) : [];
  const rows = new Set([...keptRowIds].map((x) => String(x)));
  const deletedInKept = keptTombstones && typeof keptTombstones === 'object' ? keptTombstones : {};
  const have = new Set(kept.map((r) => String(r.id)));
  const extra = mine.filter((r) => !have.has(String(r.id)) && !(String(r.id) in deletedInKept) && rows.has(String(r.anchorNodeId)));
  const all = [...kept, ...extra.map((r) => ({ ...r }))];
  // A reply whose entry isn't there any more stops pointing at it (as deleting an entry does).
  const ids = new Set(all.map((r) => String(r.id)));
  for (const r of all) if (r.answerTo != null && !ids.has(String(r.answerTo))) delete r.answerTo;
  if (extra.length) all.sort((a, b) => (Number(a.createdAt) || 0) - (Number(b.createdAt) || 0));
  return { remarks: all, remarkTombstones: mergeTombstones(keptTombstones, mineTombstones, now), added: extra.length };
}
