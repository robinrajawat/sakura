/**
 * Reading documents on a phone (owner, 2026-11-03): hub.html lists the account's synced documents
 * and opens one as a read-only outline (fold and unfold, notes and threads read in place). Nothing
 * is written back, so a phone can never overwrite work done on a computer.
 *
 * This module holds the pure decisions: which documents the list shows and in what order, the
 * folder path under each name, which rows are visible under the current folds, what a row carries
 * (note, thread, pictures, tables, diagrams) and a thread in reading order. Fetching, caching and
 * the DOM stay hand-written in hub.html.
 *
 * Wired into hub.html via scripts/generate-index-blocks.mjs's `hubDocReader` block, after the
 * `hubDiscussionStatus` block whose functions the value import below resolves to (the generator
 * strips import lines; every block shares hub.html's one script scope).
 */
import { allOpenQuestions, htmlHasVisibleText, isFollowupRow, isQuestion, questionState, threadEntries, threadReadingOrder, type ThreadEntry } from './discussionStatus';

export interface ReaderIndexEntry {
  id: string;
  title?: string;
  updatedAt?: number;
  trashedAt?: number | null;
}

export interface ReaderFolder {
  id: string;
  name?: string;
  parentId?: string | null;
}

export interface ReaderDocListItem {
  id: string;
  title: string;
  path: string;
  updatedAt: number;
}

/** A folder's path from the top, joined with ' › ' (as on the desktop top line). '' outside any folder. */
export function readerFolderPath(folderId: string | null | undefined, folders: ReaderFolder[]): string {
  if (!folderId) return '';
  const byId = new Map((Array.isArray(folders) ? folders : []).filter((f) => f && f.id).map((f) => [f.id, f]));
  const names: string[] = [];
  let f = byId.get(folderId);
  for (let hops = 0; f && hops < 32; hops++) {
    names.unshift(String(f.name || 'Untitled folder'));
    f = f.parentId ? byId.get(f.parentId) : undefined;
  }
  return names.join(' › ');
}

/**
 * The documents the phone lists: not in Trash, most recently changed first, each with its folder
 * path. A query keeps the ones whose name or folder path contains every typed word.
 */
export function readerDocList(
  index: unknown,
  folders: unknown,
  docFolderMap: unknown,
  query = ''
): ReaderDocListItem[] {
  const list = Array.isArray(index) ? (index as ReaderIndexEntry[]) : [];
  const fl = Array.isArray(folders) ? (folders as ReaderFolder[]) : [];
  const map = docFolderMap && typeof docFolderMap === 'object' ? (docFolderMap as Record<string, string>) : {};
  const words = String(query || '').toLowerCase().split(/\s+/).filter(Boolean);
  return list
    .filter((d) => d && typeof d.id === 'string' && !d.trashedAt)
    .map((d) => ({
      id: d.id,
      title: String(d.title || '').trim() || 'Untitled',
      path: readerFolderPath(map[d.id], fl),
      updatedAt: Number(d.updatedAt) || 0
    }))
    .filter((d) => {
      if (!words.length) return true;
      const hay = (d.title + ' ' + d.path).toLowerCase();
      return words.every((w) => hay.includes(w));
    })
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export interface ReaderNode {
  id: number;
  depth?: number;
  text?: string;
  note?: string;
  noteTitle?: string;
  images?: unknown[];
  tables?: unknown[];
}

export interface ReaderVisibleRow<N extends ReaderNode> {
  node: N;
  index: number;
  depth: number;
  hasChildren: boolean;
  folded: boolean;
  /** Rows hidden under this one while it is folded (the '+N' pill). */
  hiddenCount: number;
}

/** The rows on screen: every row whose ancestors are all unfolded. */
export function readerVisibleRows<N extends ReaderNode>(nodes: N[], collapsed: Set<number>): ReaderVisibleRow<N>[] {
  const list = Array.isArray(nodes) ? nodes : [];
  const out: ReaderVisibleRow<N>[] = [];
  let skipDepth: number | null = null;
  for (let i = 0; i < list.length; i++) {
    const node = list[i];
    const depth = Math.max(0, Number(node.depth) || 0);
    if (skipDepth !== null) {
      if (depth > skipDepth) continue;
      skipDepth = null;
    }
    let end = i + 1;
    while (end < list.length && (Number(list[end].depth) || 0) > depth) end++;
    const hasChildren = end > i + 1;
    const folded = hasChildren && collapsed.has(node.id);
    if (folded) skipDepth = depth;
    out.push({ node, index: i, depth, hasChildren, folded, hiddenCount: folded ? end - i - 1 : 0 });
  }
  return out;
}

/** Ids of the rows above `id` (nearest first), so a row link can unfold the way to its row. */
export function readerAncestorIds(nodes: ReaderNode[], id: number): number[] {
  const list = Array.isArray(nodes) ? nodes : [];
  const idx = list.findIndex((n) => n.id === id);
  if (idx < 0) return [];
  const out: number[] = [];
  let depth = Number(list[idx].depth) || 0;
  for (let i = idx - 1; i >= 0 && depth > 0; i--) {
    const d = Number(list[i].depth) || 0;
    if (d < depth) {
      out.push(list[i].id);
      depth = d;
    }
  }
  return out;
}

/** True when the row has a note worth opening (a title or visible text, or a picture inside it). */
export function readerHasNote(node: ReaderNode): boolean {
  const note = String(node.note || '');
  return !!String(node.noteTitle || '').trim() || htmlHasVisibleText(note) || /<(img|table)\b/i.test(note);
}

export type ReaderEntryKind = 'comment' | 'question' | 'decision' | 'reply';

export interface ReaderThreadEntry<T extends ThreadEntry> {
  entry: T;
  nested: boolean;
  kind: ReaderEntryKind;
  /** For a question: open until a reply with text exists. */
  open: boolean;
}

/** A row's thread in reading order (entries by time, replies under their entry), empty entries left out. */
export function readerThread<T extends ThreadEntry>(entries: unknown, nodeId: number): ReaderThreadEntry<T>[] {
  const thread = threadEntries((Array.isArray(entries) ? entries : []) as T[], nodeId).filter((e) => htmlHasVisibleText(e.text));
  return threadReadingOrder(thread).map(({ entry, nested }) => {
    const kind: ReaderEntryKind = entry.decision ? 'decision' : isQuestion(entry) ? 'question' : nested ? 'reply' : 'comment';
    return { entry, nested, kind, open: kind === 'question' && questionState(entry, thread) === 'open' };
  });
}


export interface ReaderOpenItem {
  nodeId: number;
  /** The thread entry, for a question or a decision. */
  entryId?: string;
  text: string;
  /** Grey second line: the row (for an entry) and who. */
  sub: string;
  /** When it was set or asked (epoch ms), 0 when unknown. */
  since: number;
}

export interface ReaderOpenItems {
  followups: ReaderOpenItem[];
  questions: ReaderOpenItem[];
  decisions: ReaderOpenItem[];
}

function readerPlain(html: unknown): string {
  return String(html ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * The desktop's open-items summary for the phone (owner, 2026-11-03): Follow-up rows, open
 * questions and decisions, in document order, on rows of this document only.
 */
export function readerOpenItems(
  nodes: Array<ReaderNode & { marker?: string | null; markerAt?: number }>,
  entries: unknown
): ReaderOpenItems {
  const list = Array.isArray(nodes) ? nodes : [];
  const order = new Map(list.map((n, i) => [n.id, i]));
  const rowText = (id: unknown) => {
    const n = list.find((x) => x.id === id);
    return n ? String(n.text || '').trim() || 'Untitled row' : '';
  };
  const byDoc = (a: ReaderOpenItem, b: ReaderOpenItem) => (order.get(a.nodeId) ?? 0) - (order.get(b.nodeId) ?? 0) || a.since - b.since;
  const followups = list
    .filter((n) => isFollowupRow(n))
    .map((n) => ({ nodeId: n.id, text: rowText(n.id), sub: '', since: Number(n.markerAt) || 0 }));
  const ids = new Set(list.map((n) => n.id));
  const all = (Array.isArray(entries) ? entries : []) as ThreadEntry[];
  const questions = allOpenQuestions(all, ids).map((q) => ({
    nodeId: q.anchorNodeId as number,
    entryId: q.id,
    text: readerPlain(q.text),
    sub: [rowText(q.anchorNodeId), String(q.person || '').trim()].filter(Boolean).join(' · '),
    since: Number(q.createdAt) || 0
  }));
  const decisions = all
    .filter((e) => e && e.decision && ids.has(e.anchorNodeId as number) && htmlHasVisibleText(e.text))
    .map((e) => ({
      nodeId: e.anchorNodeId as number,
      entryId: e.id,
      text: readerPlain(e.text),
      sub: [rowText(e.anchorNodeId), String(e.person || '').trim()].filter(Boolean).join(' · '),
      since: Number(e.createdAt) || 0
    }));
  return { followups: followups.sort(byDoc), questions: questions.sort(byDoc), decisions: decisions.sort(byDoc) };
}
