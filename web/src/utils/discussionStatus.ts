/**
 * Open / closed status for remarks and Q&A (owner request: triage what still needs attention).
 *
 * Data (stored on the existing objects, absent on anything older):
 * - remark.followUp: true when someone marked the remark as needing follow-up (right-click).
 *   Owner decision: not every remark needs a resolution — a remark is a plain comment unless
 *   flagged, so older remarks are plain comments and never counted.
 * - remark.resolvedAt: epoch ms when a follow-up was resolved.
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
  followUp?: boolean;
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

/** A remark marked as needing follow-up (resolved or not). Anything else is a plain comment. */
export function remarkIsFollowUp(r: StatusRemark): boolean {
  return !!r.followUp;
}

/** An open follow-up: flagged and not yet resolved. Plain comments are never open. */
export function remarkIsOpen(r: StatusRemark): boolean {
  return !!r.followUp && !r.resolvedAt;
}

/** The status a remark shows: none for a plain comment, else open or resolved. */
export function remarkState(r: StatusRemark): 'comment' | 'open' | 'resolved' {
  if (!r.followUp) return 'comment';
  return r.resolvedAt ? 'resolved' : 'open';
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

/** openItems = everything that needs attention: Issue/Follow-up rows, open questions, open follow-up remarks. */
export type DiscussionFilter = 'openQa' | 'openRemarks' | 'openItems';

export function normalizeDiscussionFilter(v: unknown): DiscussionFilter | null {
  return v === 'openQa' || v === 'openRemarks' || v === 'openItems' ? v : null;
}

/**
 * Ids of the nodes that hold at least one open item of the filter's kind. For openItems that is
 * open questions, open follow-up remarks, and (from `nodes`) rows marked Issue or Follow-up.
 */
export function nodesWithOpenItems(
  filter: DiscussionFilter,
  qaItems: StatusQaItem[],
  remarks: StatusRemark[],
  nodes: ProgressNode[] = []
): Set<number> {
  if (filter === 'openItems') {
    const ids = new Set<number>([...nodesWithOpenItems('openQa', qaItems, remarks), ...nodesWithOpenItems('openRemarks', qaItems, remarks)]);
    for (const n of nodes || []) if (n.marker === 'issue' || n.marker === 'followup') ids.add(n.id);
    return ids;
  }
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

/** "1 open question", "2 open follow-ups" — the label for a count. */
export function openCountLabel(n: number, kind: 'question' | 'follow-up'): string {
  return n + ' open ' + kind + (n === 1 ? '' : 's');
}

// ── Document summary (toolbar "open items") ────────────────────────────────────────────────

export interface ProgressNode {
  id: number;
  marker?: string | null;
}

/** Everything the toolbar summary counts, for the rows of one document. */
export interface DocumentProgress {
  issues: number;
  followups: number;
  parked: number;
  questions: number;
  remarks: number;
  /** Confirmed + N/A rows, answered or won't-answer questions, resolved follow-up remarks. */
  settled: number;
  /** Everything tracked: needs attention + parked + settled. */
  total: number;
}

/**
 * The toolbar summary's counts. Markers on rows: Issue and Follow-up need attention, Parked is
 * deliberately set aside, Confirmed and N/A are settled. Questions and follow-up remarks count only
 * when attached to a row of this document (same rule as countOpenItems); a plain remark (not marked
 * for follow-up) is a comment and is never counted.
 */
export function documentProgress(nodes: ProgressNode[], qaItems: StatusQaItem[], remarks: StatusRemark[]): DocumentProgress {
  const p: DocumentProgress = { issues: 0, followups: 0, parked: 0, questions: 0, remarks: 0, settled: 0, total: 0 };
  const ids = new Set<number>();
  for (const n of nodes || []) {
    ids.add(n.id);
    if (n.marker === 'issue') p.issues++;
    else if (n.marker === 'followup') p.followups++;
    else if (n.marker === 'parked') p.parked++;
    else if (n.marker === 'confirmed' || n.marker === 'na') p.settled++;
  }
  for (const q of qaItems || []) {
    if (q.sourceNodeId == null || !ids.has(q.sourceNodeId) || !isCountableQuestion(q)) continue;
    if (qaState(q) === 'open') p.questions++;
    else p.settled++;
  }
  for (const r of remarks || []) {
    if (r.anchorNodeId == null || !ids.has(r.anchorNodeId) || !remarkIsFollowUp(r) || !htmlHasVisibleText(r.text)) continue;
    if (remarkIsOpen(r)) p.remarks++;
    else p.settled++;
  }
  p.total = p.issues + p.followups + p.parked + p.questions + p.remarks + p.settled;
  return p;
}

export type AttentionKey = 'issue' | 'followup' | 'question' | 'remark';

export interface AttentionPart {
  key: AttentionKey;
  n: number;
  /** Short label for the toolbar: "1 issue", "6 follow-ups", "2 questions", "1 remark". */
  label: string;
}

const ATTENTION_WORDS: Record<AttentionKey, [string, string]> = {
  issue: ['issue', 'issues'],
  followup: ['follow-up', 'follow-ups'],
  question: ['question', 'questions'],
  remark: ['remark', 'remarks']
};

/** What still needs attention, most urgent first, leaving out kinds with nothing open. */
export function attentionParts(p: DocumentProgress): AttentionPart[] {
  const counts: [AttentionKey, number][] = [['issue', p.issues], ['followup', p.followups], ['question', p.questions], ['remark', p.remarks]];
  return counts.filter(([, n]) => n > 0).map(([key, n]) => ({ key, n, label: n + ' ' + ATTENTION_WORDS[key][n === 1 ? 0 : 1] }));
}

/** The summary's tooltip / accessible name: "Needs attention: 1 issue, 2 open questions. 8 of 15 settled." */
export function progressSummaryText(p: DocumentProgress): string {
  const parts = attentionParts(p).map((a) =>
    a.key === 'question' ? openCountLabel(a.n, 'question') : a.key === 'remark' ? a.n + ' open follow-up remark' + (a.n === 1 ? '' : 's') : a.label
  );
  const head = parts.length ? 'Needs attention: ' + parts.join(', ') + '.' : 'Nothing needs attention.';
  return head + ' ' + p.settled + ' of ' + p.total + ' settled' + (p.parked ? ', ' + p.parked + ' parked' : '') + '.';
}
