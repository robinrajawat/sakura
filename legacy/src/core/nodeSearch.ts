/**
 * Pure outline-search matching logic — a fourth `core/` slice alongside nodeQueries.ts,
 * nodeMutations.ts, and nodeSelection.ts.
 *
 * Originally set aside in Phase 2 (docs/architecture-plan.md) as "read/write the core `nodes`
 * array... doesn't have a stable module boundary yet" — a fair call at the time, before the
 * `core/` pattern existed. Re-investigated now that boundary exists: `computeSearchMatches()`'s
 * actual matching logic (the three-branch whole-word/case-sensitive/case-insensitive filter
 * over `nodes`) is already pure, read-only, and side-effect-free; it was only ever wrapped in
 * assignments to the ambient `searchMatches`/`searchIndex` globals and a DOM-touching
 * `updateSearchCount()` call. Those wrapper concerns stay hand-written in index.html, exactly
 * the same "extract only the pure, testable core; leave orchestration alone" split used
 * throughout this project.
 *
 * `escapeRegExpLiteral` (a trivial one-line hand-written helper in index.html, not itself a
 * generated block) is inlined here directly rather than referenced via `declare function` —
 * every prior ambient-global reference in `core/` modules has been to another ALREADY-GENERATED
 * block (nodeQueries.ts's `getSubtreeEnd`/`getIndex`/`getParentIndex`), not to hand-written
 * code; introducing that pattern for a one-liner isn't worth it, and duplicating one line keeps
 * this module fully self-contained and testable with zero wiring.
 */

import type { QueryableNode } from './nodeQueries';

interface SearchableNode extends QueryableNode {
  text?: string;
}

/** Pure: escapes regex metacharacters in a literal string, exactly matching index.html's
 * escapeRegExpLiteral — duplicated here deliberately, see this file's header comment. */
function escapeRegExpLiteral(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Pure: the ids of every node whose text matches `query`, honoring the same three-way
 * matching mode the original inline logic used (whole-word regex / case-sensitive substring /
 * case-insensitive substring). An empty (post-trim) query always returns an empty array — the
 * original's early-return-on-blank behavior, preserved here as a normal case rather than a
 * special one since this function has no other state to reset. */
export function computeSearchMatchIds(
  nodes: SearchableNode[],
  query: string,
  matchCase: boolean,
  wholeWord: boolean
): SearchableNode['id'][] {
  const raw = query.trim();
  if (!raw) return [];

  if (wholeWord) {
    // No 'g' flag: .test() on a global-flag regex is stateful across calls (lastIndex), which
    // would silently skip matches when reused across different node strings — same reasoning
    // preserved from the original inline comment.
    const re = new RegExp('\\b' + escapeRegExpLiteral(raw) + '\\b', matchCase ? '' : 'i');
    return nodes.filter((n) => re.test(String(n.text || ''))).map((n) => n.id);
  }
  if (matchCase) {
    return nodes.filter((n) => String(n.text || '').includes(raw)).map((n) => n.id);
  }
  const q = raw.toLowerCase();
  return nodes.filter((n) => String(n.text || '').toLowerCase().includes(q)).map((n) => n.id);
}

/** Pure: the next `searchIndex` value given a (possibly stale) current index and the new match
 * count — matches the original's exact reset rule: -1 when there are no matches, otherwise the
 * current index if it's still in range, otherwise reset to 0 (first match). */
export function resolveSearchIndex(currentIndex: number, matchCount: number): number {
  if (!matchCount) return -1;
  if (currentIndex < 0 || currentIndex >= matchCount) return 0;
  return currentIndex;
}
