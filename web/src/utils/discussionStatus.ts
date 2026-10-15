/**
 * A row's thread: the conversation about one node, and the row status it drives.
 *
 * Owner design (2026-10-14): each node has at most one thread, a flat list of entries in time
 * order. An entry has an author, a time and text; it is a comment, or a question
 * (`type: 'question'`). An answer is an entry that answers a question (`answerTo`), with a Yes/No
 * (`verdict`) and/or text. A status (`status`) sits on the entry it was set on, so its author and
 * time say who set it and when; the thread's status is the latest one.
 *
 * Owner decision (2026-10-15): the row marker *is* the thread's status — the same five values
 * (Confirmed, Issue, Follow-up, Parked, N/A) under the same names, stored only in the thread and
 * shown on the row. Clicking a marker adds it to the thread. Older 'resolved' and 'decision'
 * statuses read as Confirmed. An unanswered question shows as Open on its own (derived, never stored).
 *
 * Entries are stored in the document's `remarks` array (the key older documents already use);
 * `migrateDiscussionToThread` converts the older remark / Q&A / discussion-item shapes.
 *
 * Wired into index.html via scripts/generate-index-blocks.mjs's `discussionStatus` block.
 */

export type ThreadStatus = 'confirmed' | 'issue' | 'followup' | 'parked' | 'na';

export const THREAD_STATUSES: readonly ThreadStatus[] = ['confirmed', 'issue', 'followup', 'parked', 'na'];

/** A stored status in today's terms: older 'resolved' / 'decision' read as Confirmed; anything unknown as none. */
export function normalizeThreadStatus(s: unknown): ThreadStatus | null {
  if (s === 'resolved' || s === 'decision') return 'confirmed';
  return (THREAD_STATUSES as readonly unknown[]).includes(s) ? (s as ThreadStatus) : null;
}

export interface ThreadEntry {
  id?: string;
  anchorNodeId?: number | null;
  /** The author: who said it (the document owner often types on someone's behalf). */
  person?: string;
  text?: string;
  /** yyyy-mm-dd, editable to log something after the fact. */
  date?: string;
  /** Epoch ms when the entry was added: its time, and the thread's order. */
  createdAt?: number;
  type?: 'question';
  /** For an answer: the id of the question it answers. */
  answerTo?: string;
  verdict?: 'yes' | 'no';
  /** Older documents may still hold 'resolved' or 'decision' until migrated (read as Confirmed). */
  status?: ThreadStatus | 'resolved' | 'decision';
  /** A question closed without an answer. */
  wontAnswer?: boolean;
  context?: string;
  // Older shapes, read only by the migration.
  followUp?: boolean;
  resolvedAt?: number | null;
  kind?: string;
  answer?: string;
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
    .replace(/&nbsp;|&#160;| /gi, ' ');
  return text.trim().length > 0;
}

/** A Q&A entry's state (unlinked Q&A, which stays in the Q&A list). */
export function qaState(item: StatusQaItem): QaState {
  if (htmlHasVisibleText(item.answer)) return 'answered';
  if (item.wontAnswer) return 'wont';
  return 'open';
}

/** A Q&A entry that is a real question (not a section heading) with question text. */
export function isCountableQuestion(item: StatusQaItem): boolean {
  return item.type !== 'section' && htmlHasVisibleText(item.question);
}

// ── One thread ───────────────────────────────────────────────────────────────────────────────

/** A node's entries in time order (stable for equal times). */
export function threadEntries<T extends ThreadEntry>(entries: T[], nodeId: number): T[] {
  return (entries || []).filter((e) => e && e.anchorNodeId === nodeId)
    .map((e, i) => [e, i] as [T, number])
    .sort((a, b) => (a[0].createdAt || 0) - (b[0].createdAt || 0) || a[1] - b[1])
    .map(([e]) => e);
}

export function isQuestion(e: ThreadEntry): boolean {
  return e.type === 'question';
}

/** An entry that counts as an answer: it says Yes/No or has text. */
function isRealAnswer(e: ThreadEntry): boolean {
  return e.verdict === 'yes' || e.verdict === 'no' || htmlHasVisibleText(e.text);
}

/** A question's state in its thread: answered once an answer to it exists, else won't answer if
 * closed that way, else open. */
export function questionState(q: ThreadEntry, thread: ThreadEntry[]): QaState {
  if ((thread || []).some((e) => e.answerTo != null && e.answerTo === q.id && isRealAnswer(e))) return 'answered';
  return q.wontAnswer ? 'wont' : 'open';
}

/** Open questions (with question text) in a thread, oldest first. */
export function openQuestions<T extends ThreadEntry>(thread: T[]): T[] {
  return (thread || []).filter((e) => isQuestion(e) && htmlHasVisibleText(e.text) && questionState(e, thread) === 'open');
}

/** The question an answer added now (or marked at `before`) answers: the latest open question
 * before that point, or null. */
export function questionToAnswer<T extends ThreadEntry>(thread: T[], before?: T): T | null {
  const end = before ? thread.indexOf(before) : thread.length;
  const open = openQuestions(thread.slice(0, end < 0 ? thread.length : end));
  return open.length ? open[open.length - 1] : null;
}

/** The thread's status: the latest status chip in it, or null. */
export function threadStatus(thread: ThreadEntry[]): ThreadStatus | null {
  for (let i = (thread || []).length - 1; i >= 0; i--) if (thread[i].status) return normalizeThreadStatus(thread[i].status);
  return null;
}

/** The entry holding the thread's status. */
export function threadStatusEntry<T extends ThreadEntry>(thread: T[]): T | null {
  for (let i = (thread || []).length - 1; i >= 0; i--) if (thread[i].status) return thread[i];
  return null;
}

/** The row marker a thread status shows as: the same value. */
export function markerForThreadStatus(s: ThreadStatus | string | null | undefined): ThreadStatus | null {
  return normalizeThreadStatus(s);
}

/** The status a row marker sets on its thread: the same value. */
export function threadStatusForMarker(m: string | null | undefined): ThreadStatus | null {
  return normalizeThreadStatus(m);
}

/** Every marker is the thread's status. */
export function isThreadMarker(m: string | null | undefined): boolean {
  return normalizeThreadStatus(m) != null;
}

/**
 * The marker a row should show after its thread changed: the thread's status when it has one;
 * otherwise a thread-driven marker is cleared and a row-only one kept.
 */
export function syncedMarker(current: string | null | undefined, thread: ThreadEntry[]): string {
  const fromThread = markerForThreadStatus(threadStatus(thread));
  if (fromThread) return fromThread;
  return isThreadMarker(current) ? '' : (current || '');
}

// ── Migration ────────────────────────────────────────────────────────────────────────────────

function localDateStr(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}

/** True when any entry still has an older shape (remark follow-up, discussion kind, inline answer). */
export function needsThreadMigration(entries: ThreadEntry[]): boolean {
  return (entries || []).some((r) => r && (r.followUp != null || r.resolvedAt != null || r.kind != null || r.answer != null || r.status === 'resolved' || r.status === 'decision'));
}

/**
 * Converts older remarks and discussion items to thread entries: a follow-up remark becomes a
 * Follow-up (or Resolved) status chip, a decision item a Decision chip, and a question item's
 * inline answer / Yes-No becomes its own answer entry right after it (no author: the old shape
 * didn't store one). Idempotent: converted entries carry none of the old fields.
 */
export function migrateDiscussionToThread<R extends ThreadEntry>(entries: R[]): { entries: R[]; changed: boolean } {
  if (!needsThreadMigration(entries)) return { entries, changed: false };
  const out: R[] = [];
  const ids = new Set((entries || []).map((r) => r && r.id));
  for (const src of entries || []) {
    if (!src) continue;
    const r = { ...src } as R;
    const kind = r.kind;
    const answer = r.answer;
    const verdict = r.verdict;
    if (r.followUp) r.status = r.resolvedAt ? 'confirmed' : 'followup';
    if (kind === 'decision') r.status = 'confirmed';
    if (r.status) r.status = normalizeThreadStatus(r.status) || undefined;
    if (!r.status) delete r.status;
    if (kind === 'question') r.type = 'question';
    delete r.followUp; delete r.resolvedAt; delete r.kind; delete r.answer;
    if (kind === 'question') delete r.verdict;
    out.push(r);
    if (kind === 'question' && (htmlHasVisibleText(answer) || verdict === 'yes' || verdict === 'no')) {
      let id = (r.id || 'r') + '-a';
      while (ids.has(id)) id += 'a';
      ids.add(id);
      const a = { id, anchorNodeId: r.anchorNodeId, person: '', text: answer || '', date: r.date || '', context: '', createdAt: (r.createdAt || 0) + 1, answerTo: r.id } as R;
      if (verdict === 'yes' || verdict === 'no') a.verdict = verdict;
      out.push(a);
      delete r.wontAnswer;
    }
  }
  return { entries: out, changed: true };
}

/**
 * Moves every Q&A entry linked to a row into the row's thread: the question (no author, since Q&A
 * never stored one; dated from when it was asked) and, when answered, an answer entry after it.
 * Section headings and unlinked entries stay in `qaItems`. Idempotent: a question whose entry
 * already exists (id `r` + its id) is just dropped from `qaItems`.
 */
export function migrateQaToRemarks<Q extends StatusQaItem & { createdAt?: number }, R extends ThreadEntry>(
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
      const date = created ? localDateStr(created) : '';
      const item: ThreadEntry = { id, type: 'question', person: '', text: q.question || '', date, context: '', anchorNodeId: q.sourceNodeId, createdAt: created };
      const verdict = (q as { verdict?: unknown }).verdict;
      const yesNo = verdict === 'yes' || verdict === 'no' ? verdict : undefined;
      const answered = htmlHasVisibleText(q.answer) || !!yesNo;
      if (q.wontAnswer && !answered) item.wontAnswer = true;
      out.push(item as R);
      ids.add(id);
      if (answered) {
        const answer: ThreadEntry = { id: id + '-a', person: '', text: q.answer || '', date, context: '', anchorNodeId: q.sourceNodeId, createdAt: created + 1, answerTo: id };
        if (yesNo) answer.verdict = yesNo;
        out.push(answer as R);
        ids.add(id + '-a');
      }
    }
    moved++;
  }
  return { qaItems: kept, remarks: out, moved };
}

/**
 * Links row markers and threads once, for documents from before they were linked: a row with a
 * thread status but no marker gets the matching marker; a marked row whose thread has no status
 * puts the marker on the thread's latest entry. Returns the marker changes
 * (node id → marker); entries are updated in place.
 */
export function linkMarkersToThreads(nodes: { id: number; marker?: string | null }[], entries: ThreadEntry[]): Map<number, string> {
  const changes = new Map<number, string>();
  const byNode = new Map<number, ThreadEntry[]>();
  for (const e of entries || []) {
    if (!e || e.anchorNodeId == null) continue;
    const list = byNode.get(e.anchorNodeId) || [];
    list.push(e);
    byNode.set(e.anchorNodeId, list);
  }
  for (const n of nodes || []) {
    const list = byNode.get(n.id);
    if (!list || !list.length) continue;
    const thread = threadEntries(list, n.id);
    const st = threadStatus(thread);
    const last = thread[thread.length - 1];
    if (st && !n.marker) changes.set(n.id, markerForThreadStatus(st) as string);
    else if (!st && isThreadMarker(n.marker)) last.status = threadStatusForMarker(n.marker) as ThreadStatus;
    else if (st && (n.marker === 'parked' || n.marker === 'na') && st !== n.marker) {
      // Parked and N/A used to be row-only, so an older row can show one over a thread with another
      // status. The row keeps what it shows: the marker goes into the thread after its latest entry
      // (no author or time of its own: the old marker never stored them).
      if (!last.status) last.status = n.marker;
      else {
        const at = (last.createdAt || 0) + 1;
        (entries as ThreadEntry[]).push({ id: 'm' + n.id + '-' + at, anchorNodeId: n.id, person: '', text: '', date: last.date || '', context: '', createdAt: at, status: n.marker });
      }
    }
    else if (st && isThreadMarker(n.marker) && markerForThreadStatus(st) !== n.marker) {
      // Issue used to be row-only, so an older row can be marked Issue over a thread with another
      // status: the Issue goes on the latest entry when that one has no chip yet; otherwise the
      // thread's status wins.
      if (n.marker === 'issue' && !last.status) last.status = 'issue';
      else changes.set(n.id, markerForThreadStatus(st) as string);
    }
  }
  return changes;
}

// ── Open items ───────────────────────────────────────────────────────────────────────────────

function groupByNode(entries: ThreadEntry[], ids?: Set<number>): Map<number, ThreadEntry[]> {
  const m = new Map<number, ThreadEntry[]>();
  for (const e of entries || []) {
    if (!e || e.anchorNodeId == null || (ids && !ids.has(e.anchorNodeId))) continue;
    const list = m.get(e.anchorNodeId) || [];
    list.push(e);
    m.set(e.anchorNodeId, list);
  }
  return m;
}

/** Every open question of the document's threads (rows in `nodeIds` only, when given). */
export function allOpenQuestions(entries: ThreadEntry[], nodeIds?: Set<number>): ThreadEntry[] {
  const out: ThreadEntry[] = [];
  groupByNode(entries, nodeIds).forEach((list, id) => out.push(...openQuestions(threadEntries(list, id))));
  return out;
}

/** Every answered or won't-answer question (rows in `nodeIds` only, when given). */
export function allSettledQuestions(entries: ThreadEntry[], nodeIds?: Set<number>): ThreadEntry[] {
  const out: ThreadEntry[] = [];
  groupByNode(entries, nodeIds).forEach((list, id) => {
    const thread = threadEntries(list, id);
    out.push(...thread.filter((e) => isQuestion(e) && htmlHasVisibleText(e.text) && questionState(e, thread) !== 'open'));
  });
  return out;
}

/** openItems = everything that needs attention: Issue/Follow-up rows and open questions. */
export type DiscussionFilter = 'openQa' | 'openItems';

export function normalizeDiscussionFilter(v: unknown): DiscussionFilter | null {
  return v === 'openQa' || v === 'openItems' ? v : null;
}

/** Ids of the nodes with an open question; for openItems also rows marked Issue or Follow-up. */
export function nodesWithOpenItems(filter: DiscussionFilter, entries: ThreadEntry[], nodes: ProgressNode[] = []): Set<number> {
  const ids = new Set<number>();
  for (const q of allOpenQuestions(entries)) ids.add(q.anchorNodeId as number);
  if (filter === 'openItems') for (const n of nodes || []) if (n.marker === 'issue' || n.marker === 'followup') ids.add(n.id);
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
  /** Confirmed + N/A rows, answered or won't-answer questions. */
  settled: number;
  /** Everything tracked: needs attention + parked + settled. */
  total: number;
}

/**
 * The toolbar summary's counts. Row markers (which threads drive): Issue and Follow-up need
 * attention, Parked is set aside, Confirmed and N/A are settled. Questions count once each, open
 * or settled, when on a row of this document; unlinked Q&A entries count too.
 */
export function documentProgress(nodes: ProgressNode[], qaItems: StatusQaItem[], entries: ThreadEntry[]): DocumentProgress {
  const p: DocumentProgress = { issues: 0, followups: 0, parked: 0, questions: 0, settled: 0, total: 0 };
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
  p.questions += allOpenQuestions(entries, ids).length;
  p.settled += allSettledQuestions(entries, ids).length;
  p.total = p.issues + p.followups + p.parked + p.questions + p.settled;
  return p;
}

export type AttentionKey = 'issue' | 'followup' | 'question';

export interface AttentionPart {
  key: AttentionKey;
  n: number;
  /** Short label for the toolbar: "1 issue", "6 follow-ups", "2 questions". */
  label: string;
}

const ATTENTION_WORDS: Record<AttentionKey, [string, string]> = {
  issue: ['issue', 'issues'],
  followup: ['follow-up', 'follow-ups'],
  question: ['question', 'questions']
};

/** What still needs attention, most urgent first, leaving out kinds with nothing open. */
export function attentionParts(p: DocumentProgress): AttentionPart[] {
  const counts: [AttentionKey, number][] = [['issue', p.issues], ['followup', p.followups], ['question', p.questions]];
  return counts.filter(([, n]) => n > 0).map(([key, n]) => ({ key, n, label: n + ' ' + ATTENTION_WORDS[key][n === 1 ? 0 : 1] }));
}

/** The summary's tooltip / accessible name: "Needs attention: 1 issue, 2 open questions. 8 of 15 settled." */
export function progressSummaryText(p: DocumentProgress): string {
  const parts = attentionParts(p).map((a) => (a.key === 'question' ? openCountLabel(a.n, 'question') : a.label));
  const head = parts.length ? 'Needs attention: ' + parts.join(', ') + '.' : 'Nothing needs attention.';
  return head + ' ' + p.settled + ' of ' + p.total + ' settled' + (p.parked ? ', ' + p.parked + ' parked' : '') + '.';
}
