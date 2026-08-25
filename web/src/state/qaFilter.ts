import type { QaItem } from '../store/padStore';

/**
 * Phase 6.3 slice, Pad Q&A tab: search/filter. Legacy's real Q&A tab (legacy/index.html's
 * `qaVisibleItems`/`qaMatchesSearch`/`qaIsUnanswered`) also groups by section headers and
 * filters on `qaUnlinkedOnly`/`qaFollowUpOnly` -- section headers and the follow-up flag still
 * don't exist on this app's `QaItem`. This slice ports only the two checks that map cleanly onto
 * the flat-list shape: substring search over question+answer (`qaMatchesSearch`), and the
 * Unanswered quick-filter (`qaIsUnanswered` -- an empty/whitespace-only answer). Unlinked
 * filtering (needs `anchorNodeId`, added in §6.7 -- see `padStore.ts`'s own header) and
 * Follow-up filtering are each a later slice.
 */
export function qaMatchesSearch(item: QaItem, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return `${item.question || ''} ${item.answer || ''}`.toLowerCase().includes(q);
}

export function qaIsUnanswered(item: QaItem): boolean {
  return !(item.answer || '').trim();
}

export function qaVisibleItems(items: QaItem[], query: string, unansweredOnly: boolean): QaItem[] {
  return items.filter((it) => (!unansweredOnly || qaIsUnanswered(it)) && qaMatchesSearch(it, query));
}
