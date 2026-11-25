/**
 * More read-only tools for the MCP server (owner 2026-11-25: "1-5"): open items, the document being
 * worked on, what changed, and To-Dos. They use the app's own rules (web/src/utils: discussionStatus
 * for what is open, todoModel for To-Do sections, versionChunks and versionSummary for versions), so
 * an assistant and Sakura agree on what "open", "due" and "changed" mean. Nothing here writes.
 */

import { allOpenQuestions, normalizeThreadStatus } from '../../web/src/utils/discussionStatus';
import { normalizeTodo, groupTodos, waitingLabel, type TodoItem } from '../../web/src/utils/todoModel';
import { versionsFromCloudRecords } from '../../web/src/utils/versionChunks';
import { summarizeVersionChange, formatVersionSummary } from '../../web/src/utils/versionSummary';
import { htmlToText } from './htmlTree';
import { loadDocList, loadDocument, documentToMarkdown, arr, str, MAX_DOCS, type Rec, type DocListEntry } from './mcpNotes';
import type { FirestoreReader } from './firestoreRest';

const DAY = 24 * 60 * 60 * 1000;
const iso = (t: unknown) => { const n = Number(t); return Number.isFinite(n) && n > 0 ? new Date(n).toISOString().slice(0, 10) : ''; };
const ago = (t: unknown, now: number) => { const n = Number(t); if (!Number.isFinite(n) || n <= 0) return ''; const d = Math.floor((now - n) / DAY); return d <= 0 ? 'today' : d === 1 ? '1 day' : d + ' days'; };

// ---------------------------------------------------------------------------------------------
// Open items

export interface DocOpenItems {
  id: string;
  title: string;
  followUps: Array<{ row: string; since: string }>;
  openQuestions: Array<{ row: string; question: string; asked: string; by: string }>;
}

/** Rows marked Follow-up and questions without an answer, each with the rows above it for context. */
export function openItemsOf(entry: { id: string; title: string }, doc: Rec, now: number): DocOpenItems {
  const nodes = arr(doc.nodes);
  const trail = new Map<string, string>();
  const path: string[] = [];
  for (const n of nodes) {
    const depth = Math.max(0, Number(n.depth) || 0);
    path.length = depth;
    path[depth] = str(n.text).trim() || '(empty row)';
    trail.set(String(n.id), path.slice(0, depth + 1).join(' › '));
  }
  const followUps = nodes
    .filter((n) => normalizeThreadStatus(n.marker) === 'followup')
    .map((n) => ({ row: trail.get(String(n.id)) || str(n.text), since: ago(n.markerAt, now) }));
  const ids = new Set(nodes.map((n) => Number(n.id)).filter(Number.isFinite));
  const openQuestions = (allOpenQuestions(arr(doc.remarks) as never[], ids) as unknown as Rec[]).map((q) => ({
    row: trail.get(String(q.anchorNodeId)) || '',
    question: htmlToText(str(q.text)),
    asked: ago(q.createdAt, now),
    by: str(q.person)
  }));
  return { id: entry.id, title: entry.title, followUps, openQuestions };
}

const OPEN_BATCH = 20;
export const OPEN_TIME_LIMIT_MS = 20_000;

/** One document's open items, or every document's (newest first, in batches, up to a time limit). */
export async function toolOpenItems(db: FirestoreReader, uid: string, docId: string, now: () => number = Date.now): Promise<string> {
  if (docId) {
    const got = await loadDocument(db, uid, docId);
    if (typeof got === 'string') return got;
    const items = openItemsOf(got.entry, got.doc, now());
    if (!items.followUps.length && !items.openQuestions.length) return 'Nothing open in "' + got.entry.title + '".';
    return JSON.stringify(items, null, 1);
  }
  const started = now();
  const list = (await loadDocList(db, uid)).slice(0, MAX_DOCS);
  const byId = new Map(list.map((d) => [d.id, d]));
  const found: DocOpenItems[] = [];
  let searched = 0;
  for (let i = 0; i < list.length && now() - started <= OPEN_TIME_LIMIT_MS; i += OPEN_BATCH) {
    const ids = list.slice(i, i + OPEN_BATCH).map((d) => d.id);
    for (const [id, doc] of await db.batchGet(ids.map((d) => `users/${uid}/docs/${d}`), ['title', 'nodes', 'remarks'])) {
      const entry = byId.get(id);
      if (!entry) continue;
      const items = openItemsOf(entry, doc, now());
      if (items.followUps.length || items.openQuestions.length) found.push(items);
    }
    searched += ids.length;
  }
  const note = searched < list.length ? `Looked at the ${searched} most recently changed of ${list.length} documents (time limit). ` : '';
  if (!found.length) return note + 'Nothing open in your documents.';
  return note + JSON.stringify(found, null, 1);
}

// ---------------------------------------------------------------------------------------------
// The document being worked on

/** The document changed most recently, read in full: the one being worked on. Sakura doesn't keep
 * which document is open on a device anywhere off it, so "most recently changed" stands in. */
export async function toolCurrentDocument(db: FirestoreReader, uid: string): Promise<string> {
  const [first] = await loadDocList(db, uid);
  if (!first) return 'No documents.';
  const got = await loadDocument(db, uid, first.id);
  if (typeof got === 'string') return got;
  return `Most recently changed document: "${first.title}" (id ${first.id}${first.folder ? ', in ' + first.folder : ''}, changed ${first.updated}).\n\n` + documentToMarkdown(got.doc);
}

// ---------------------------------------------------------------------------------------------
// What changed

const MAX_LISTED = 30;
const rowText = (n: Rec) => str(n.text).trim() || '(empty row)';

/** What changed in a document since a date (default: 7 days ago), against its Version history: the
 * newest version from before then is compared with the document now. */
export async function toolWhatChanged(db: FirestoreReader, uid: string, docId: string, since: string, now: () => number = Date.now): Promise<string> {
  const got = await loadDocument(db, uid, docId);
  if (typeof got === 'string') return got;
  const sinceMs = since.trim() ? Date.parse(since.trim()) : now() - 7 * DAY;
  if (!Number.isFinite(sinceMs)) return 'Give "since" as a date, like 2026-11-20.';
  const records = await db.list(`users/${uid}/docs/${docId}/versions`, 300);
  const versions = versionsFromCloudRecords(records.map(([id, data]) => ({ id, data: data as never })))
    .sort((a, b) => a.ts - b.ts);
  if (!versions.length) return 'This document has no versions in your account yet, so there is nothing to compare with.';
  const before = [...versions].reverse().find((v) => v.ts <= sinceMs) || versions[0];
  const older = before as unknown as Rec, newer = got.doc;
  const change = summarizeVersionChange(older as never, newer as never);
  const a = new Map(arr(older.nodes).map((n) => [String(n.id), n]));
  const b = new Map(arr(newer.nodes).map((n) => [String(n.id), n]));
  const added = [...b].filter(([id]) => !a.has(id)).map(([, n]) => rowText(n));
  const removed = [...a].filter(([id]) => !b.has(id)).map(([, n]) => rowText(n));
  const reworded = [...b].filter(([id, n]) => a.has(id) && rowText(a.get(id) as Rec) !== rowText(n)).map(([id, n]) => ({ was: rowText(a.get(id) as Rec), now: rowText(n) }));
  const cap = <T,>(l: T[]) => (l.length > MAX_LISTED ? [...l.slice(0, MAX_LISTED), `…and ${l.length - MAX_LISTED} more`] : l);
  return JSON.stringify({
    document: got.entry.title,
    comparedWith: new Date(before.ts).toISOString() + (before.ts > sinceMs ? ' (the oldest kept version; none is older than the date asked)' : ''),
    summary: formatVersionSummary(change),
    rowsAdded: cap(added),
    rowsRemoved: cap(removed),
    rowsReworded: cap(reworded)
  }, null, 1);
}

// ---------------------------------------------------------------------------------------------
// To-Dos

/** The To-Do list in the app's sections (Pinned, Today, Upcoming, Anytime, Waiting; Done on request). */
export async function toolTodos(db: FirestoreReader, uid: string, includeDone: boolean, now: () => number = Date.now): Promise<string> {
  const rec = await db.get(`users/${uid}/meta/todos`);
  const t = now();
  const todos = (Array.isArray(rec?.value) ? rec!.value as unknown[] : []).map((x) => normalizeTodo(x, t)).filter(Boolean) as TodoItem[];
  const todayIso = new Date(t).toISOString().slice(0, 10);
  // The app's sections hold open tasks; Done is its own folded list there, added here when asked for.
  const groups: Array<{ label: string; items: TodoItem[] }> = groupTodos(todos, todayIso);
  if (includeDone) groups.push({ label: 'Done', items: todos.filter((x) => x.done).sort((p, q) => (q.completedAt || 0) - (p.completedAt || 0)) });
  const sections = groups
    .filter((g) => g.items.length)
    .map((g) => ({
      section: g.label,
      tasks: g.items.map((x) => ({
        task: x.text,
        ...(x.dueDate ? { due: x.dueDate } : {}),
        ...(x.repeat ? { repeats: x.repeat } : {}),
        ...(x.waitingFor ? { waiting: waitingLabel(x) } : {}),
        ...(x.subtasks.length ? { subtasks: x.subtasks.filter((s) => s.done).length + '/' + x.subtasks.length + ' done' } : {}),
        ...(x.done && x.completedAt ? { done: iso(x.completedAt) } : {})
      }))
    }));
  if (!sections.length) return includeDone ? 'No To-Dos.' : 'Nothing to do: no open To-Dos.';
  return JSON.stringify(sections, null, 1);
}

export type { DocListEntry };
