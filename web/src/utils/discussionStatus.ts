/**
 * A row's thread, the conversation about one node, and the row's own status.
 *
 * Owner design (2026-10-14): each node has at most one thread, a flat list of entries in time
 * order. An entry has an author, a time (`createdAt`) and text; it is a comment, a question
 * (`type: 'question'`) or a decision (`decision: true`). Any entry takes replies (`answerTo`), one
 * level deep; a reply to a question is its answer.
 *
 * Owner decision (2026-10-27, "simpler"): a question is open or answered, nothing else. No Yes/No
 * on answers (the answer's text says it), no "won't answer" (a reply saying so answers it), and the
 * time is stored once (`createdAt`; the older `date` string is folded into it).
 * `migrateThreadSimplify` converts older entries.
 *
 * Owner decision (2026-10-27): rows say what, threads say why. A row has at most one status,
 * stored on the row: Agreed ('confirmed'), Follow-up ('followup') or Out of scope ('parked'), with
 * when it was set (`markerAt`, showing how old a follow-up is). No names (owner, 2026-10-27): a
 * follow-up is always your own. Setting a status adds nothing to the thread. A decision is
 * no status: it marks the entry where something was decided and leaves the row alone. Older values
 * read as their successor: Resolved / Decision → Agreed, Issue → Follow-up, N/A → Out of scope.
 *
 * Entries are stored in the document's `remarks` array (the key older documents already use);
 * `migrateDiscussionToThread` converts the older remark / Q&A / discussion-item shapes, and
 * `migrateStatusToRows` moves statuses that older threads held on their entries onto the row.
 *
 * Wired into index.html via scripts/generate-index-blocks.mjs's `discussionStatus` block.
 */

export type ThreadStatus = 'confirmed' | 'followup' | 'parked';

/** The row markers, in menu order: Agreed, Follow-up, Out of scope. */
export const THREAD_STATUSES: readonly ThreadStatus[] = ['confirmed', 'followup', 'parked'];

/** A stored status or marker in today's terms (older values read as their successor); unknown → none. */
export function normalizeThreadStatus(s: unknown): ThreadStatus | null {
  if (s === 'resolved' || s === 'decision') return 'confirmed';
  if (s === 'issue') return 'followup';
  if (s === 'na') return 'parked';
  return (THREAD_STATUSES as readonly unknown[]).includes(s) ? (s as ThreadStatus) : null;
}

export interface ThreadEntry {
  id?: string;
  anchorNodeId?: number | null;
  /** The author: who said it (the document owner often types on someone's behalf). */
  person?: string;
  text?: string;
  /** Epoch ms: the entry's day and time (editable to log something after the fact), and the thread's order. */
  createdAt?: number;
  type?: 'question';
  /** For a reply: the id of the entry it replies to (for a question, the one it answers). */
  answerTo?: string;
  /** The entry where something was decided (a chip on the entry; it doesn't change the row). */
  decision?: boolean;
  context?: string;
  // Older shapes, read only by the migrations: the day as yyyy-mm-dd, a Yes/No answer, a question
  // closed without an answer, a status on the entry that set it (with a follow-up's owner and done
  // mark), and the remark / discussion-item fields before that.
  date?: string;
  verdict?: 'yes' | 'no';
  wontAnswer?: boolean;
  status?: ThreadStatus | 'resolved' | 'decision' | 'issue' | 'na';
  owner?: string;
  done?: boolean;
  doneAt?: number;
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

/** A question's state in its thread: answered once a reply with text exists, else open. */
export function questionState(q: ThreadEntry, thread: ThreadEntry[]): 'open' | 'answered' {
  return (thread || []).some((e) => e.answerTo != null && e.answerTo === q.id && htmlHasVisibleText(e.text)) ? 'answered' : 'open';
}

/** Open questions (with question text) in a thread, oldest first. */
export function openQuestions<T extends ThreadEntry>(thread: T[]): T[] {
  return (thread || []).filter((e) => isQuestion(e) && htmlHasVisibleText(e.text) && questionState(e, thread) === 'open');
}

/**
 * The entry a reply sits under (owner decision 2026-10-27: any entry can take replies, one level
 * deep, as in Slack or Google Docs). `answerTo` holds the link (the key older answers already use);
 * a reply to a reply sits under that reply's own entry. Null for an entry that is no reply, or whose
 * entry isn't in the thread.
 */
export function threadReplyParent<T extends ThreadEntry>(r: T, thread: T[]): T | null {
  if (r.answerTo == null) return null;
  const byId = new Map(thread.map((e) => [e.id, e]));
  let p = byId.get(r.answerTo);
  for (let hops = 0; p && p.answerTo != null && byId.has(p.answerTo) && hops < 8; hops++) p = byId.get(p.answerTo);
  return p && p !== r ? p : null;
}

/**
 * A thread in reading order: entries by time, each followed by its replies (oldest first,
 * `nested`), which keep their own dates.
 */
export function threadReadingOrder<T extends ThreadEntry>(thread: T[]): { entry: T; nested: boolean }[] {
  const replies = new Map<T, T[]>();
  const isReply = new Set<T>();
  thread.forEach((e) => { const p = threadReplyParent(e, thread); if (p) { isReply.add(e); const l = replies.get(p) || []; l.push(e); replies.set(p, l); } });
  const out: { entry: T; nested: boolean }[] = [];
  thread.forEach((e) => {
    if (isReply.has(e)) return;
    out.push({ entry: e, nested: false });
    (replies.get(e) || []).forEach((a) => out.push({ entry: a, nested: true }));
  });
  return out;
}

/** The question an answer added now (or marked at `before`) answers: the latest open question
 * before that point, or null. */
export function questionToAnswer<T extends ThreadEntry>(thread: T[], before?: T): T | null {
  const end = before ? thread.indexOf(before) : thread.length;
  const open = openQuestions(thread.slice(0, end < 0 ? thread.length : end));
  return open.length ? open[open.length - 1] : null;
}

// ── Migration ────────────────────────────────────────────────────────────────────────────────

/** True when any entry still has a field the simpler model dropped (`date`, `verdict`, `wontAnswer`). */
export function needsThreadSimplify(entries: ThreadEntry[]): boolean {
  return (entries || []).some((e) => e && (e.date != null || e.verdict != null || e.wontAnswer != null || (e.type === 'question' && !!e.decision)));
}

function localMidnight(day: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day || '');
  if (!m) return null;
  const t = new Date(+m[1], +m[2] - 1, +m[3]).getTime();
  return Number.isFinite(t) ? t : null;
}

/**
 * The simpler thread (owner decision 2026-10-27). The day (`date`) folds into `createdAt` (same
 * time of day on that day). A Yes / No answer says it in its text: "Yes" alone, or "Yes. " before
 * text that doesn't already start with it. A question closed without an answer gets a reply
 * "Won't answer" by its author, so it reads as answered. An entry is one kind: one that was both a
 * question and a decision stays a decision. Idempotent.
 */
export function migrateThreadSimplify<R extends ThreadEntry>(entries: R[]): { entries: R[]; changed: boolean } {
  if (!needsThreadSimplify(entries)) return { entries, changed: false };
  const ids = new Set((entries || []).map((e) => e && e.id));
  const out: R[] = [];
  for (const src of entries || []) {
    if (!src) continue;
    const e = { ...src };
    if (e.date != null) {
      const mid = localMidnight(e.date);
      if (mid != null) {
        const ofDay = e.createdAt ? e.createdAt - localMidnight(localDateStr(e.createdAt))! : 12 * 3600000;
        if (!e.createdAt || localDateStr(e.createdAt) !== e.date) e.createdAt = mid + ofDay;
      }
      delete e.date;
    }
    if (e.verdict === 'yes' || e.verdict === 'no') {
      const word = e.verdict === 'yes' ? 'Yes' : 'No';
      const text = String(e.text || '');
      const plain = text.replace(/<[^>]*>/g, '').trim();
      if (!htmlHasVisibleText(text)) e.text = word;
      else if (!new RegExp('^' + word + '\\b', 'i').test(plain)) e.text = word + '. ' + text;
    }
    delete e.verdict;
    // One kind per entry: an entry that was both a question and a decision reads as the decision.
    if (e.type === 'question' && e.decision) delete e.type;
    const wont = e.wontAnswer;
    delete e.wontAnswer;
    out.push(e);
    if (wont && isQuestion(e) && !(entries || []).some((x) => x && x.answerTo === e.id && htmlHasVisibleText(x.text))) {
      let id = (e.id || 'r') + '-w';
      while (ids.has(id)) id += 'w';
      ids.add(id);
      out.push({ id, anchorNodeId: e.anchorNodeId, person: e.person || '', text: 'Won\u2019t answer', context: '', createdAt: (e.createdAt || 0) + 1, answerTo: e.id } as R);
    }
  }
  return { entries: out, changed: true };
}

function localDateStr(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}

/** True when any entry still has an older shape (remark follow-up, discussion kind, inline answer). */
export function needsThreadMigration(entries: ThreadEntry[]): boolean {
  return (entries || []).some((r) => r && (r.followUp != null || r.resolvedAt != null || r.kind != null || r.answer != null || (r.status != null && r.status !== normalizeThreadStatus(r.status))));
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
    if (kind === 'decision' || r.status === 'decision') { r.status = 'confirmed'; r.decision = true; }
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

/** A row's status as stored on the row. */
export interface RowStatus {
  marker: ThreadStatus | '';
  /** When it was set (epoch ms); unknown for a status set before it was recorded. */
  markerAt?: number;
}

/** True when any entry still holds a status (from before statuses moved onto the row). */
export function needsStatusMigration(entries: ThreadEntry[]): boolean {
  return (entries || []).some((e) => e && (e.status != null || e.owner != null || e.done != null || e.doneAt != null));
}

/**
 * Moves statuses off thread entries onto their rows (owner decision 2026-10-27). The row takes the
 * status its thread showed -- the latest open Follow-up (one not marked done and not settled by a
 * later Agreed / Out of scope), else the latest Agreed / Out of scope -- with that entry's author,
 * time and, for a Follow-up, owner. A thread with no status leaves the row's marker as it is.
 * Entries lose their status fields; one that said nothing else (no text, Yes/No, question, answer
 * or decision) is removed. Returns the new entries and the row changes (node id → status).
 */
export function migrateStatusToRows<R extends ThreadEntry>(
  nodes: { id: number; marker?: string | null }[],
  entries: R[]
): { entries: R[]; rows: Map<number, RowStatus>; changed: boolean } {
  const rows = new Map<number, RowStatus>();
  if (!needsStatusMigration(entries)) return { entries, rows, changed: false };
  const ids = new Set((nodes || []).map((n) => n.id));
  const byNode = new Map<number, R[]>();
  for (const e of entries || []) {
    if (!e || e.anchorNodeId == null || !ids.has(e.anchorNodeId)) continue;
    const list = byNode.get(e.anchorNodeId) || [];
    list.push(e);
    byNode.set(e.anchorNodeId, list);
  }
  byNode.forEach((list, id) => {
    const thread = threadEntries(list, id);
    const st = (e: ThreadEntry) => normalizeThreadStatus(e.status);
    let holder: ThreadEntry | null = null;
    thread.forEach((e, i) => {
      if (st(e) !== 'followup' || e.done) return;
      if (thread.some((x, k) => k > i && st(x) && st(x) !== 'followup')) return;
      holder = e;
    });
    if (!holder) for (let i = thread.length - 1; i >= 0 && !holder; i--) if (st(thread[i]) && st(thread[i]) !== 'followup') holder = thread[i];
    if (!holder) return;
    const h = holder as ThreadEntry;
    const row: RowStatus = { marker: st(h) as ThreadStatus };
    if (h.createdAt) row.markerAt = h.createdAt;
    rows.set(id, row);
  });
  const out: R[] = [];
  for (const src of entries || []) {
    if (!src) continue;
    if (src.status == null && src.owner == null && src.done == null && src.doneAt == null) { out.push(src); continue; }
    const e = { ...src };
    delete e.status; delete e.owner; delete e.done; delete e.doneAt;
    if (htmlHasVisibleText(e.text) || e.verdict || isQuestion(e) || e.answerTo != null || e.decision) out.push(e);
  }
  return { entries: out, rows, changed: true };
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

/** Every answered question (rows in `nodeIds` only, when given). */
export function allSettledQuestions(entries: ThreadEntry[], nodeIds?: Set<number>): ThreadEntry[] {
  const out: ThreadEntry[] = [];
  groupByNode(entries, nodeIds).forEach((list, id) => {
    const thread = threadEntries(list, id);
    out.push(...thread.filter((e) => isQuestion(e) && htmlHasVisibleText(e.text) && questionState(e, thread) !== 'open'));
  });
  return out;
}

/** openItems = everything that needs attention: Follow-up rows and open questions. */
export type DiscussionFilter = 'openQa' | 'openItems';

export function normalizeDiscussionFilter(v: unknown): DiscussionFilter | null {
  return v === 'openQa' || v === 'openItems' ? v : null;
}

/** Ids of the nodes with an open question; for openItems also the Follow-up rows. */
export function nodesWithOpenItems(filter: DiscussionFilter, entries: ThreadEntry[], nodes: ProgressNode[] = []): Set<number> {
  const ids = new Set<number>();
  for (const q of allOpenQuestions(entries)) ids.add(q.anchorNodeId as number);
  if (filter === 'openItems') for (const n of nodes || []) if (isFollowupRow(n)) ids.add(n.id);
  return ids;
}

/** A row marked Follow-up: one open item. */
export function isFollowupRow(n: ProgressNode | null | undefined): boolean {
  return !!n && normalizeThreadStatus(n.marker) === 'followup';
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
  followups: number;
  /** Out of scope rows. */
  parked: number;
  questions: number;
  /** Agreed rows and answered questions. */
  settled: number;
  /** What can be settled: needs attention + settled. Out of scope is set aside, so it stays out of
   *  "N of M settled" -- otherwise one out-of-scope row kept the bar from ever filling. */
  total: number;
}

/**
 * The toolbar summary's counts. Row statuses: Follow-up needs attention, Out of scope is set
 * aside, Agreed is settled; questions count open or settled, when on a row of this document;
 * unlinked Q&A entries count too.
 */
export function documentProgress(nodes: ProgressNode[], qaItems: StatusQaItem[], entries: ThreadEntry[]): DocumentProgress {
  const p: DocumentProgress = { followups: 0, parked: 0, questions: 0, settled: 0, total: 0 };
  const ids = new Set<number>();
  for (const n of nodes || []) {
    ids.add(n.id);
    const m = normalizeThreadStatus(n.marker);
    if (m === 'followup') p.followups++;
    else if (m === 'parked') p.parked++;
    else if (m === 'confirmed') p.settled++;
  }
  for (const q of qaItems || []) {
    if (q.sourceNodeId == null || !ids.has(q.sourceNodeId) || !isCountableQuestion(q)) continue;
    if (qaState(q) === 'open') p.questions++;
    else p.settled++;
  }
  p.questions += allOpenQuestions(entries, ids).length;
  p.settled += allSettledQuestions(entries, ids).length;
  p.total = p.followups + p.questions + p.settled;
  return p;
}

export type AttentionKey = 'followup' | 'question';

export interface AttentionPart {
  key: AttentionKey;
  n: number;
  /** Short label for the toolbar: "6 follow-ups", "2 questions". */
  label: string;
}

const ATTENTION_WORDS: Record<AttentionKey, [string, string]> = {
  followup: ['follow-up', 'follow-ups'],
  question: ['question', 'questions']
};

/** What still needs attention, most urgent first, leaving out kinds with nothing open. */
export function attentionParts(p: DocumentProgress): AttentionPart[] {
  const counts: [AttentionKey, number][] = [['followup', p.followups], ['question', p.questions]];
  return counts.filter(([, n]) => n > 0).map(([key, n]) => ({ key, n, label: n + ' ' + ATTENTION_WORDS[key][n === 1 ? 0 : 1] }));
}

/** The summary's tooltip / accessible name: "Needs attention: 1 follow-up, 2 open questions." */
export function progressSummaryText(p: DocumentProgress): string {
  const parts = attentionParts(p).map((a) => (a.key === 'question' ? openCountLabel(a.n, 'question') : a.label));
  // No "N of M settled" (owner, 2026-10-15): a follow-up closed by removing its marker drops out of
  // the count instead of counting as settled, so the ratio didn't measure progress.
  return parts.length ? 'Needs attention: ' + parts.join(', ') + '.' : 'Nothing needs attention.';
}

/**
 * How long an open item has been open, short enough for the Open items list: "today", "3d" (under
 * two weeks), "5w" (under two months), then "4mo". Empty when the time is unknown.
 */
export function openItemAge(createdAt: number | undefined | null, now: number): string {
  if (!createdAt || !Number.isFinite(createdAt)) return '';
  const days = Math.floor(Math.max(0, now - createdAt) / 86400000);
  if (days < 1) return 'today';
  if (days < 14) return days + 'd';
  if (days < 60) return Math.floor(days / 7) + 'w';
  return Math.floor(days / 30) + 'mo';
}
