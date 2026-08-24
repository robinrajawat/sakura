import type { QaItem } from '../store/padStore';

/**
 * Phase 6.3 slice, Pad Q&A tab: search/filter. Legacy's real Q&A tab (legacy/index.html's
 * `qaVisibleItems`/`qaMatchesSearch`/`qaIsUnanswered`) also groups by section headers and
 * filters on `qaUnlinkedOnly`/`qaFollowUpOnly` -- neither is possible yet against this app's
 * flat `QaItem` (no section-header items, no `sourceNodeId`, no follow-up flag; see
 * `padStore.ts`'s own header comment on why the Phase 3 schema deliberately differs from
 * legacy's node-anchored one). This slice ports only the two checks that map cleanly onto that
 * flat shape: substring search over question+answer (`qaMatchesSearch`), and the Unanswered
 * quick-filter (`qaIsUnanswered` -- an empty/whitespace-only answer). Unlinked/Follow-up
 * filtering is a later slice, once Q&A items can actually carry a linked node or a follow-up
 * flag.
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
