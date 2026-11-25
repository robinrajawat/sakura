/**
 * What the MCP server's tools read (docs/mcp-plan.md): a person's documents, as their Sakura account
 * holds them. Read-only. Pure functions over already-fetched records, plus the three tool bodies
 * that fetch through a FirestoreReader.
 *
 * - list_documents: titles, folders and when each was last changed (one read of the documents list,
 *   folders and folder map).
 * - get_document: one document as Markdown, through the same code as Share → Export as Markdown
 *   (web/src/utils/markdownExport.ts), with each row's status and its thread entries written out
 *   (a person reading "what did we decide" needs them; the file export only names them).
 * - search: words across every document's title, rows, notes and threads.
 *
 * Documents in Trash, or deleted for good, are left out everywhere.
 */

import { mdSerializeDocument, mdFromNoteHtml, mdTableToGrid, type MdExportRow } from '../../web/src/utils/markdownExport';
import { parseHtmlFragment, findFirst, htmlToText } from './htmlTree';
import type { FirestoreReader } from './firestoreRest';

export const MAX_DOCS = 500;
const MAX_SEARCH_RESULTS = 20;
const MAX_HITS_PER_DOC = 5;

export interface DocListEntry {
  id: string;
  title: string;
  folder: string;
  updated: string;
}

export type Rec = Record<string, unknown>;
export const arr = (v: unknown): Rec[] => (Array.isArray(v) ? (v.filter((x) => x && typeof x === 'object') as Rec[]) : []);
export const str = (v: unknown): string => (typeof v === 'string' ? v : '');

const STATUS_LABEL: Record<string, string> = {
  confirmed: 'Agreed', resolved: 'Agreed', decision: 'Agreed',
  followup: 'Follow-up', issue: 'Follow-up',
  parked: 'Out of scope', na: 'Out of scope'
};

const STATUS_DOC: Record<string, string> = { draft: 'Draft', review: 'Review', approved: 'Approved', rejected: 'Rejected' };

/** "Work › Clients" for a folder id, from the folders list (parentId links). */
export function folderPath(folderId: unknown, folders: Rec[]): string {
  const byId = new Map(folders.map((f) => [String(f.id), f]));
  const names: string[] = [];
  let id = folderId == null ? null : String(folderId);
  const seen = new Set<string>();
  while (id && byId.has(id) && !seen.has(id)) {
    seen.add(id);
    const f = byId.get(id) as Rec;
    names.unshift(str(f.name) || 'Folder');
    id = f.parentId == null ? null : String(f.parentId);
  }
  return names.join(' › ');
}

const iso = (t: unknown): string => {
  const n = Number(t);
  return Number.isFinite(n) && n > 0 ? new Date(n).toISOString() : '';
};

/** The documents a person has (not in Trash, not deleted for good), newest first. */
export function buildDocList(index: unknown, folders: unknown, docFolderMap: unknown, deletedIds: Set<string>): DocListEntry[] {
  const map = docFolderMap && typeof docFolderMap === 'object' ? (docFolderMap as Rec) : {};
  const fl = arr(folders);
  return arr(index)
    .filter((d) => d.id != null && !d.trashedAt && !deletedIds.has(String(d.id)))
    .sort((a, b) => (Number(b.updatedAt) || 0) - (Number(a.updatedAt) || 0))
    .map((d) => ({ id: String(d.id), title: str(d.title) || 'Untitled', folder: folderPath(map[String(d.id)], fl), updated: iso(d.updatedAt) }));
}

function threadLines(entries: Rec[]): string[] {
  return entries.map((r) => {
    const who = str(r.person).trim();
    const title = htmlToText(str(r.title));
    const text = htmlToText(str(r.text));
    const answer = htmlToText(str(r.answer) || str(r.decision));
    const words = [title, text].filter(Boolean).join(' — ');
    return 'Thread' + (who ? ' (' + who + ')' : '') + ': ' + (words || '(empty)') + (answer ? ' → ' + answer : '');
  });
}

/** A stored document as Markdown, with row statuses and thread entries spelled out. */
export function documentToMarkdown(doc: Rec): string {
  const remarks = arr(doc.remarks);
  const diagrams = arr(doc.diagrams);
  const rows: MdExportRow[] = arr(doc.nodes)
    .filter((n) => !n.noExport)
    .map((n) => {
      const mentions: string[] = [];
      const status = STATUS_LABEL[str(n.marker)];
      if (status) mentions.push('Status: ' + status);
      for (const im of arr(n.images)) mentions.push('Picture' + (str(im.caption) ? ': ' + str(im.caption) : ''));
      for (const d of diagrams.filter((d) => d.anchorNodeId != null && String(d.anchorNodeId) === String(n.id))) mentions.push('Diagram' + (str(d.title) ? ': ' + str(d.title) : ''));
      mentions.push(...threadLines(remarks.filter((r) => r.anchorNodeId != null && String(r.anchorNodeId) === String(n.id))));
      const tables = (Array.isArray(n.tables) ? n.tables : [])
        .map((t) => { const tb = findFirst(parseHtmlFragment(str(t)), 'TABLE'); return tb ? mdTableToGrid(tb) : []; })
        .filter((g) => g.length);
      const styles = (n.styles && typeof n.styles === 'object' ? n.styles : {}) as Rec;
      return {
        text: str(n.text),
        marks: Array.isArray(n.marks) ? (n.marks as MdExportRow['marks']) : [],
        depth: Number(n.depth) || 0,
        heading: Number(styles.heading) || 0,
        isCheckbox: !!n.isCheckbox,
        checked: !!n.checked,
        noteMd: str(n.note) ? mdFromNoteHtml(parseHtmlFragment(str(n.note))) : '',
        tables,
        mentions
      };
    });
  let md = mdSerializeDocument(str(doc.title).trim() || 'Untitled', rows);
  const meta = [str(doc.author) && 'Author: ' + str(doc.author), STATUS_DOC[str(doc.docStatus)] && 'Status: ' + STATUS_DOC[str(doc.docStatus)], iso(doc.updatedAt) && 'Last changed: ' + iso(doc.updatedAt)].filter(Boolean);
  if (meta.length) md = md.replace(/\n/, '\n\n' + meta.join(' · ') + '\n');
  return md;
}

export interface SearchHit {
  id: string;
  title: string;
  folder: string;
  updated: string;
  matches: string[];
}

/** Where `query`'s words all appear in a document: its title, or a row with its note and threads. */
export function searchDocument(entry: DocListEntry, doc: Rec, query: string): SearchHit | null {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return null;
  const has = (s: string) => { const l = s.toLowerCase(); return words.every((w) => l.includes(w)); };
  const remarks = arr(doc.remarks);
  const nodes = arr(doc.nodes);
  const matches: string[] = [];
  const path: string[] = [];
  for (const n of nodes) {
    const depth = Math.max(0, Number(n.depth) || 0);
    path.length = depth;
    const text = str(n.text).trim();
    path[depth] = text;
    const extra = [htmlToText(str(n.note)), ...threadLines(remarks.filter((r) => r.anchorNodeId != null && String(r.anchorNodeId) === String(n.id)))].filter(Boolean).join('\n');
    if (has(text + '\n' + extra)) {
      const trail = path.slice(0, depth).filter(Boolean).join(' › ');
      const snippet = (text || '(empty row)') + (has(text) ? '' : ' — ' + snippetAround(extra, words[0]));
      matches.push((trail ? trail + ' › ' : '') + snippet);
      if (matches.length >= MAX_HITS_PER_DOC) break;
    }
  }
  if (!matches.length && !has(entry.title)) return null;
  return { ...entry, matches };
}

function snippetAround(text: string, word: string): string {
  const flat = text.replace(/\s+/g, ' ');
  const i = flat.toLowerCase().indexOf(word);
  const start = Math.max(0, i - 60);
  return (start > 0 ? '…' : '') + flat.slice(start, start + 160) + (start + 160 < flat.length ? '…' : '');
}

// ---------------------------------------------------------------------------------------------
// Tool bodies

/** Three reads: the documents list (Delete forever takes a document off it), folders and the folder
 * map. Listing every "deleted forever" marker as well cost one read per marker, ever (owner
 * 2026-11-25: read costs); a single document's marker is checked only when it's read. */
export async function loadDocList(db: FirestoreReader, uid: string): Promise<DocListEntry[]> {
  const [index, folders, docFolder] = await Promise.all([
    db.get(`users/${uid}/meta/docsIndex`),
    db.get(`users/${uid}/meta/folders`),
    db.get(`users/${uid}/meta/docFolderMap`)
  ]);
  return buildDocList(index?.value, folders?.value, docFolder?.value, new Set());
}

export async function toolListDocuments(db: FirestoreReader, uid: string): Promise<string> {
  const list = await loadDocList(db, uid);
  if (!list.length) return 'No documents.';
  return JSON.stringify(list, null, 1);
}

/** A document the person has (listed, not deleted forever), or why it can't be read. */
export async function loadDocument(db: FirestoreReader, uid: string, id: string): Promise<{ entry: DocListEntry; doc: Rec } | string> {
  if (!id || /[/]/.test(id)) return 'Give the id of a document from list_documents or search.';
  const list = await loadDocList(db, uid);
  const entry = list.find((d) => d.id === id);
  if (!entry) return 'No document with that id (it may be in Trash).';
  const [doc, deleted] = await Promise.all([db.get(`users/${uid}/docs/${id}`), db.get(`users/${uid}/deletedDocs/${id}`)]);
  if (deleted) return 'No document with that id (it was deleted).';
  if (!doc) return 'That document has not reached the account yet.';
  return { entry, doc };
}

/** One branch of a document: the first row whose words contain `section` (any case), with the rows
 * under it, raised to the top. Null when no row matches. Keeps a long document within what an
 * assistant takes in one answer (owner 2026-11-25). */
export function sectionOf(doc: Rec, section: string): Rec | null {
  const nodes = arr(doc.nodes);
  const want = section.trim().toLowerCase();
  const at = nodes.findIndex((n) => str(n.text).toLowerCase().includes(want));
  if (!want || at < 0) return null;
  const base = Number(nodes[at].depth) || 0;
  let end = at + 1;
  while (end < nodes.length && (Number(nodes[end].depth) || 0) > base) end++;
  const branch = nodes.slice(at, end).map((n) => ({ ...n, depth: (Number(n.depth) || 0) - base }));
  return { ...doc, title: (str(doc.title).trim() || 'Untitled') + ' › ' + str(nodes[at].text).trim(), nodes: branch };
}

export async function toolGetDocument(db: FirestoreReader, uid: string, id: string, section = ''): Promise<string> {
  const got = await loadDocument(db, uid, id);
  if (typeof got === 'string') return got;
  if (section.trim()) {
    const part = sectionOf(got.doc, section);
    return part ? documentToMarkdown(part) : 'No row in that document contains "' + section.trim() + '". Read it whole, or try other words.';
  }
  return documentToMarkdown(got.doc);
}

/** Search reads documents newest first, a batch at a time, only the fields it needs, and stops at
 * enough results or a time limit (owner 2026-11-25: "faster search"). Nothing is kept between calls:
 * Sakura stores no copy of anyone's notes on its server. */
const SEARCH_BATCH = 20;
const SEARCH_PARALLEL = 3;
const SEARCH_ENOUGH = 40;
export const SEARCH_TIME_LIMIT_MS = 20_000;
const SEARCH_FIELDS = ['title', 'nodes', 'remarks'];

export async function toolSearch(db: FirestoreReader, uid: string, query: string, now: () => number = Date.now): Promise<string> {
  const q = String(query || '').trim();
  if (!q) return 'Give some words to search for.';
  const started = now();
  const list = (await loadDocList(db, uid)).slice(0, MAX_DOCS);
  const byId = new Map(list.map((d) => [d.id, d]));
  const batches: string[][] = [];
  for (let i = 0; i < list.length; i += SEARCH_BATCH) batches.push(list.slice(i, i + SEARCH_BATCH).map((d) => d.id));
  const hits: SearchHit[] = [];
  let searched = 0;
  let next = 0;
  const stop = () => hits.length >= SEARCH_ENOUGH || now() - started > SEARCH_TIME_LIMIT_MS;
  const worker = async () => {
    while (next < batches.length && !stop()) {
      const ids = batches[next++];
      const docs = await db.batchGet(ids.map((id) => `users/${uid}/docs/${id}`), SEARCH_FIELDS);
      for (const [id, doc] of docs) {
        const entry = byId.get(id);
        const hit = entry && searchDocument(entry, doc, q);
        if (hit) hits.push(hit);
      }
      searched += ids.length;
    }
  };
  await Promise.all(Array.from({ length: Math.min(SEARCH_PARALLEL, batches.length) }, worker));
  hits.sort((a, b) => b.matches.length - a.matches.length || b.updated.localeCompare(a.updated));
  const partial = searched < list.length;
  const note = partial ? `Searched the ${searched} most recently changed of ${list.length} documents${hits.length >= SEARCH_ENOUGH ? ' (enough matches found)' : ' (time limit)'}; use more specific words to look further.` : '';
  if (!hits.length) return 'Nothing found for "' + q + '".' + (note ? ' ' + note : '');
  const body = JSON.stringify(hits.slice(0, MAX_SEARCH_RESULTS), null, 1);
  return note ? note + '\n' + body : body;
}
