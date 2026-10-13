/**
 * Open / closed status for remarks and Q&A (owner request: triage what still needs attention).
 *
 * Data (both stored on the existing objects, absent on anything older):
 * - remark.resolvedAt: epoch ms when someone resolved it. Absent = open, so every remark from
 *   before this existed starts open (owner decision).
 * - qa.wontAnswer: true when a question was closed without an answer.
 *
 * A question's state is derived, never stored: it is answered as soon as its answer has visible
 * text (an answer wins over wontAnswer), closed as "won't answer" when flagged, otherwise open.
 *
 * Wired into index.html via scripts/generate-index-blocks.mjs's `discussionStatus` block.
 */

export interface StatusRemark {
  id?: string;
  text?: string;
  anchorNodeId?: number | null;
  resolvedAt?: number | null;
}

export interface StatusQaItem {
  id?: string;
  type?: string;
  question?: string;
  answer?: string;
  sourceNodeId?: number | null;
  wontAnswer?: boolean;
}

export type QaState = 'open' | 'answered' | 'wont';

/** True when an HTML fragment has any visible text (tags, &nbsp; and whitespace don't count). */
export function htmlHasVisibleText(html: string | null | undefined): boolean {
  const text = String(html ?? '')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;|&#160;| /gi, ' ');
  return text.trim().length > 0;
}

export function qaState(item: StatusQaItem): QaState {
  if (htmlHasVisibleText(item.answer)) return 'answered';
  if (item.wontAnswer) return 'wont';
  return 'open';
}

export function remarkIsOpen(r: StatusRemark): boolean {
  return !r.resolvedAt;
}

/** An open remark with text — a blank remark (added, never typed into) has nothing to triage. */
function isOpenRemarkWithText(r: StatusRemark): boolean {
  return remarkIsOpen(r) && htmlHasVisibleText(r.text);
}

/** A Q&A entry that is a real question (not a section heading) with question text. */
export function isCountableQuestion(item: StatusQaItem): boolean {
  return item.type !== 'section' && htmlHasVisibleText(item.question);
}

export interface OpenCounts {
  openQuestions: number;
  openRemarks: number;
}

/**
 * Open questions and remarks anchored to a node in `nodeIds`. Items not attached to any node of
 * the document can't be reached in the outline, so they are left out of the counts.
 */
export function countOpenItems(
  qaItems: StatusQaItem[],
  remarks: StatusRemark[],
  nodeIds: Set<number>
): OpenCounts {
  let openQuestions = 0;
  let openRemarks = 0;
  for (const q of qaItems || []) {
    if (q.sourceNodeId == null || !nodeIds.has(q.sourceNodeId)) continue;
    if (isCountableQuestion(q) && qaState(q) === 'open') openQuestions++;
  }
  for (const r of remarks || []) {
    if (r.anchorNodeId == null || !nodeIds.has(r.anchorNodeId)) continue;
    if (isOpenRemarkWithText(r)) openRemarks++;
  }
  return { openQuestions, openRemarks };
}

export type DiscussionFilter = 'openQa' | 'openRemarks';

export function normalizeDiscussionFilter(v: unknown): DiscussionFilter | null {
  return v === 'openQa' || v === 'openRemarks' ? v : null;
}

/** Ids of the nodes that hold at least one open item of the filter's kind. */
export function nodesWithOpenItems(
  filter: DiscussionFilter,
  qaItems: StatusQaItem[],
  remarks: StatusRemark[]
): Set<number> {
  const ids = new Set<number>();
  if (filter === 'openQa') {
    for (const q of qaItems || []) {
      if (q.sourceNodeId != null && isCountableQuestion(q) && qaState(q) === 'open') ids.add(q.sourceNodeId);
    }
  } else {
    for (const r of remarks || []) {
      if (r.anchorNodeId != null && isOpenRemarkWithText(r)) ids.add(r.anchorNodeId);
    }
  }
  return ids;
}

export interface OpenItemEntry<Q, R> {
  nodeId: number;
  questions: Q[];
  remarks: R[];
}

/**
 * The PDF's "Open items" summary: every node (in document order) with open questions or open
 * remarks, each with its open items. Remarks newest first, questions in stored order.
 */
export function openItemsByNode<Q extends StatusQaItem, R extends StatusRemark & { createdAt?: number }>(
  nodeIdsInOrder: number[],
  qaItems: Q[],
  remarks: R[]
): OpenItemEntry<Q, R>[] {
  const out: OpenItemEntry<Q, R>[] = [];
  for (const nodeId of nodeIdsInOrder) {
    const qs = (qaItems || []).filter(
      q => q.sourceNodeId === nodeId && isCountableQuestion(q) && qaState(q) === 'open'
    );
    const rs = (remarks || [])
      .filter(r => r.anchorNodeId === nodeId && isOpenRemarkWithText(r))
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    if (qs.length || rs.length) out.push({ nodeId, questions: qs, remarks: rs });
  }
  return out;
}

/** "1 open question", "2 open remarks" — the label for a count. */
export function openCountLabel(n: number, kind: 'question' | 'remark'): string {
  return n + ' open ' + kind + (n === 1 ? '' : 's');
}
