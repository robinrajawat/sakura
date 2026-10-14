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
  /** Discussion kind beyond comment/follow-up (absent on comments and follow-ups). */
  kind?: 'question' | 'decision';
  /** A question's answer (rich HTML) and its one-click Yes/No. */
  answer?: string;
  verdict?: 'yes' | 'no';
  wontAnswer?: boolean;
  person?: string;
  date?: string;
  context?: string;
  createdAt?: number;
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

// ── Discussion items ─────────────────────────────────────────────────────────────────────────
// Q&A and remarks are one kind of object (owner decision, 2026-10-14): a discussion item under a
// row, stored in `remarks`, with who/date/text and one kind. Comment and follow-up keep their old
// shape (follow-up = `followUp: true`), so older documents read unchanged; a question is
// `kind: 'question'` with `answer` / `verdict` / `wontAnswer`; a decision is `kind: 'decision'`.

export type DiscussionKind = 'comment' | 'question' | 'followup' | 'decision';

export function remarkKind(r: StatusRemark): DiscussionKind {
  if (r.kind === 'question') return 'question';
  if (r.kind === 'decision') return 'decision';
  return r.followUp ? 'followup' : 'comment';
}

/** A question item's state, derived like a Q&A entry's: answered (a Yes/No or answer text wins),
 * closed as "won't answer", otherwise open. */
export function remarkQuestionState(r: StatusRemark): QaState {
  if (r.verdict === 'yes' || r.verdict === 'no') return 'answered';
  return qaState({ answer: r.answer, wontAnswer: r.wontAnswer });
}

/** An open question item with question text. */
export function remarkIsOpenQuestion(r: StatusRemark): boolean {
  return remarkKind(r) === 'question' && htmlHasVisibleText(r.text) && remarkQuestionState(r) === 'open';
}

/** Anything still open in a discussion: an open follow-up or an open question. */
export function discussionItemIsOpen(r: StatusRemark): boolean {
  return remarkIsOpen(r) || remarkIsOpenQuestion(r);
}

/** A remark marked as needing follow-up (resolved or not). Anything else is a plain comment. */
export function remarkIsFollowUp(r: StatusRemark): boolean {
  return remarkKind(r) === 'followup';
}

/** An open follow-up: flagged and not yet resolved. Plain comments are never open. */
export function remarkIsOpen(r: StatusRemark): boolean {
  return remarkIsFollowUp(r) && !r.resolvedAt;
}

/** The follow-up status a remark shows: none unless it's a follow-up, else open or resolved. */
export function remarkState(r: StatusRemark): 'comment' | 'open' | 'resolved' {
  if (!remarkIsFollowUp(r)) return 'comment';
  return r.resolvedAt ? 'resolved' : 'open';
}

/** The remark fields that change with its kind, set for `kind` (others cleared). */
export function applyRemarkKind<T extends StatusRemark>(r: T, kind: DiscussionKind): T {
  delete r.kind;
  delete r.followUp;
  delete r.resolvedAt;
  if (kind === 'question' || kind === 'decision') r.kind = kind;
  else if (kind === 'followup') r.followUp = true;
  return r;
}

function localDateStr(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}

/**
 * Moves every Q&A entry linked to a row into `remarks` as a question item (same text, answer and
 * won't-answer state; no name, since Q&A never stored one; dated from when it was asked). Section
 * headings and unlinked entries stay in `qaItems`. Idempotent: an entry whose question item
 * already exists (id `r` + its id) is just dropped from `qaItems`.
 */
export function migrateQaToRemarks<Q extends StatusQaItem & { createdAt?: number }, R extends StatusRemark>(
  qaItems: Q[],
  remarks: R[]
): { qaItems: Q[]; remarks: R[]; moved: number } {
  const kept: Q[] = [];
  const out = (remarks || []).slice();
  const ids = new Set(out.map((r) => r.id));
  let moved = 0;
  for (const q of qaItems || []) {
    if (!q || q.type === 'section' || q.sourceNodeId == null) { if (q) kept.push(q); continue; }
    const id = 'r' + q.id;
    if (!ids.has(id)) {
      const created = Number.isFinite(q.createdAt) ? (q.createdAt as number) : 0;
      const item: StatusRemark = {
        id, kind: 'question', person: '', text: q.question || '', answer: q.answer || '',
        date: created ? localDateStr(created) : '', context: '', anchorNodeId: q.sourceNodeId, createdAt: created
      };
      if (q.wontAnswer) item.wontAnswer = true;
      out.push(item as R);
      ids.add(id);
    }
    moved++;
  }
  return { qaItems: kept, remarks: out, moved };
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
    else if (remarkIsOpenQuestion(r)) openQuestions++;
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
    for (const r of remarks || []) {
      if (r.anchorNodeId != null && remarkIsOpenQuestion(r)) ids.add(r.anchorNodeId);
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
    if (r.anchorNodeId == null || !ids.has(r.anchorNodeId) || !htmlHasVisibleText(r.text)) continue;
    if (remarkKind(r) === 'question') {
      if (remarkQuestionState(r) === 'open') p.questions++;
      else p.settled++;
      continue;
    }
    if (!remarkIsFollowUp(r)) continue;
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
