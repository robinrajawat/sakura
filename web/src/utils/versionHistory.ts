/**
 * Version history rules shared by documents and the To-Dos list (owner, 2026-10-29: "check that
 * our versioning is absolutely robust").
 *
 * - `trimVersions` keeps a fixed number of versions but spreads them over time instead of keeping
 *   only the newest: 10 versions 10 minutes apart used to cover under two hours of work. When the
 *   list is over the limit, the version whose removal leaves the smallest hole *relative to its
 *   age* goes first, so recent versions stay close together and older ones thin out (an hour
 *   apart, then a day apart). The newest version is never dropped, and named versions (anything
 *   but "Auto": a manual save, "Before restoring…", a safety copy) count three times as hard to
 *   drop.
 * - `isLargeRemoval` spots a save that takes away a lot at once (Clear all rows, deleting a big
 *   branch, many thread entries), so the state before it is kept even inside the 10-minute gap.
 *
 * Wired into index.html via scripts/generate-index-blocks.mjs's `versionHistory` block.
 */

export interface VersionEntry {
  ts: number;
  reason?: string;
}

/** Index of the version to drop next, or -1 when there are fewer than two. */
export function pickVersionToDrop(list: VersionEntry[], now: number): number {
  if (list.length < 2) return -1;
  const ts = list.map((v) => Number(v.ts) || 0);
  let best = -1;
  let bestScore = Infinity;
  for (let i = 0; i < list.length - 1; i++) {
    // The hole left behind: from the version before it to the version after it. The oldest has
    // nothing before it, so its hole counts four times its gap: without that the list stops
    // reaching back (five days of work kept only the last day; with it, 4 days, 2, 1, 8 hours…).
    const after = ts[i + 1];
    const before = i > 0 ? ts[i - 1] : ts[i] - (after - ts[i]) * 8;
    const age = Math.max(60000, now - ts[i]);
    // Plain number, not a module constant: index.html can call this before the block's own
    // top-level `const`s have run.
    const weight = (list[i].reason || 'Auto') === 'Auto' ? 1 : 3;
    const score = ((after - before) / age) * weight;
    if (score < bestScore) {
      bestScore = score;
      best = i;
    }
  }
  return best;
}

/** Sorts oldest first and drops versions (see `pickVersionToDrop`) until at most `max` remain. */
export function trimVersions<T extends VersionEntry>(list: T[], max: number, now: number): T[] {
  const out = list.slice().sort((a, b) => (Number(a.ts) || 0) - (Number(b.ts) || 0));
  while (out.length > Math.max(1, max)) out.splice(pickVersionToDrop(out, now), 1);
  return out;
}

/** Joins two version lists (one device's and another's), keeping one copy per timestamp. */
export function mergeVersionLists<T extends VersionEntry>(a: T[], b: T[], max: number, now: number): T[] {
  const byTs = new Map<number, T>();
  for (const v of [...(Array.isArray(a) ? a : []), ...(Array.isArray(b) ? b : [])]) {
    if (v && Number.isFinite(Number(v.ts)) && !byTs.has(Number(v.ts))) byTs.set(Number(v.ts), v);
  }
  return trimVersions([...byTs.values()], max, now);
}

interface WithId {
  id?: unknown;
}

function countRemoved(prev: unknown, next: unknown): { before: number; removed: number } {
  const before = Array.isArray(prev) ? (prev as WithId[]) : [];
  const after = new Set((Array.isArray(next) ? (next as WithId[]) : []).map((x) => x && x.id));
  return { before: before.length, removed: before.filter((x) => x && !after.has(x.id)).length };
}

/** True when going from `prev` to `next` removes 10+ rows, half of a document of 4+ rows, or 5+
 * thread entries. */
export function isLargeRemoval(prevNodes: unknown, nextNodes: unknown, prevRemarks?: unknown, nextRemarks?: unknown): boolean {
  const rows = countRemoved(prevNodes, nextNodes);
  if (rows.removed >= 10) return true;
  if (rows.before >= 4 && rows.removed * 2 >= rows.before) return true;
  return countRemoved(prevRemarks, nextRemarks).removed >= 5;
}
