/**
 * send_document (owner 2026-11-25): an assistant turns what you gave it into a new Sakura draft and
 * puts it in your own inbox, the place copies others send you arrive. Nothing else is touched: never
 * an existing document, the documents list, folders or versions. You preview it in the app, then
 * Add it (it becomes a document, status Draft) or Decline it. A pending draft can be revised: the
 * new one replaces it in the inbox.
 *
 * Safety:
 * - The assistant sends Markdown, never HTML. Rows, notes and tables are built here by Sakura's own
 *   Markdown import (web/src/utils/markdownImport.ts), which escapes every word.
 * - Diagrams are draw.io XML, checked to be a draw.io file, capped in size, and stripped of scripts,
 *   event handlers and javascript: links (they render inside diagrams.net's own frame anyway).
 * - The whole draft is capped below the inbox record's size (900 KB, as Send a copy).
 * - It needs its own permission (scope inbox:write), ticked on the consent page.
 * - The inbox record says it came from you (fromUid = your account), which no one else can set
 *   (firestore.rules), so the app can mark it "From your AI assistant" truthfully.
 */

import { parseMarkdown } from '../../web/src/utils/markdownImport';
import type { FirestoreReader, FirestoreWriter } from './firestoreRest';

export const INBOX_SCOPE = 'inbox:write';
const DRAFT_MAX_BYTES = 900_000;
const DIAGRAM_MAX_BYTES = 200_000;
const MAX_DIAGRAMS = 10;
export const ASSISTANT_NAME = 'Your AI assistant';

type Rec = Record<string, unknown>;

/** A row status written at the end of a list item: "Fix SSO [follow-up]". */
const STATUS_TAGS: Record<string, string> = { 'follow-up': 'followup', followup: 'followup', agreed: 'confirmed', 'out of scope': 'parked' };
const STATUS_RE = /\s*\[(follow-up|followup|agreed|out of scope)\]/i;

/** draw.io XML made safe to store: a draw.io file, no scripts, handlers or javascript: links. Null when it isn't one. */
export function cleanDrawioXml(xml: string): string | null {
  const x = String(xml || '').trim();
  if (!x || x.length > DIAGRAM_MAX_BYTES) return null;
  if (!/^(<\?xml[^>]*>\s*)?<(mxfile|mxGraphModel)\b/.test(x)) return null;
  if (/<!DOCTYPE|<!ENTITY/i.test(x)) return null;
  return x
    .replace(/<script\b[\s\S]*?<\/script\s*>/gi, '')
    .replace(/<script\b[^>]*\/?>/gi, '')
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/(href|src|link)\s*=\s*("|')\s*(javascript|data|vbscript):[^"']*\2/gi, '$1=$2#$2')
    .replace(/(javascript|vbscript):/gi, 'blocked:');
}

export interface DraftInput {
  title: string;
  markdown: string;
  diagrams?: Array<{ title?: unknown; xml?: unknown; under?: unknown }>;
}

export interface DraftBuilt {
  doc: Rec;
  title: string;
  stats: { rows: number; tables: number; diagrams: number; followUps: number };
  notes: string[];
}

/** The draft as a Sakura document: rows from the Markdown, statuses from [tags], diagrams under rows. */
export function buildDraft(input: DraftInput, now: number): DraftBuilt | string {
  const md = String(input.markdown || '');
  if (!md.trim()) return 'Give the document\'s content as Markdown in "markdown".';
  const parsed = parseMarkdown(md);
  const title = (String(input.title || '').trim() || parsed.title || 'Untitled').slice(0, 200);
  const notes: string[] = [];
  if (parsed.simplified) notes.push('Some formatting (raw HTML, maths or footnotes) came in as plain text.');
  let followUps = 0;
  const nodes = parsed.rows.map((r, i) => {
    let text = r.text;
    let marker = '';
    const m = STATUS_RE.exec(text);
    let marks = r.marks;
    if (m) {
      marker = STATUS_TAGS[m[1].toLowerCase()];
      if (marker === 'followup') followUps++;
      const cut = m.index, len = m[0].length;
      text = (text.slice(0, cut) + text.slice(cut + len)).trim();
      // Formatting after the tag moves back with the words; formatting over the tag is dropped.
      marks = marks.filter((k) => k.e <= cut || k.s >= cut + len).map((k) => (k.s >= cut + len ? { ...k, s: k.s - len, e: k.e - len } : k));
    }
    marks = marks.filter((k) => k.e <= text.length && k.s < k.e);
    return {
      id: i + 1,
      text,
      depth: r.depth,
      parentId: null as number | null,
      styles: r.heading ? { heading: r.heading } : {},
      note: r.note,
      tables: r.tables,
      images: [],
      tags: [],
      isCheckbox: r.isCheckbox,
      checked: r.checked,
      ...(r.numbered ? { numbered: true } : {}),
      ...(marks.length ? { marks, marksText: text } : {}),
      ...(marker ? { marker, markerAt: now } : {}),
      createdAt: now,
      modifiedAt: now
    };
  });
  const stack: number[] = [];
  for (const n of nodes) { stack.length = n.depth; n.parentId = n.depth > 0 ? stack[n.depth - 1] ?? null : null; stack[n.depth] = n.id; }
  if (!nodes.length) return 'The Markdown had no content to turn into rows.';

  const diagrams: Rec[] = [];
  for (const [i, d] of (Array.isArray(input.diagrams) ? input.diagrams : []).slice(0, MAX_DIAGRAMS).entries()) {
    const xml = cleanDrawioXml(String(d?.xml ?? ''));
    const dTitle = String(d?.title ?? '').trim().slice(0, 120);
    if (!xml) { notes.push(`Diagram ${i + 1}${dTitle ? ' ("' + dTitle + '")' : ''} was left out: it isn't draw.io XML or is over 200 KB.`); continue; }
    const under = String(d?.under ?? '').trim().toLowerCase();
    const row = under ? nodes.find((n) => n.text.toLowerCase().includes(under)) : nodes[0];
    diagrams.push({ id: 'dg' + now + '-' + i, title: dTitle, xml, note: '', anchorNodeId: (row || nodes[0]).id, pageCount: 1, createdAt: now, modifiedAt: now });
  }

  const doc = { rowFormat: 2, title, docStatus: 'draft', author: '', nodes, nextId: nodes.length + 1, diagrams, remarks: [], qa: [] };
  return {
    doc, title, notes,
    stats: { rows: nodes.length, tables: nodes.reduce((a, n) => a + n.tables.length, 0), diagrams: diagrams.length, followUps }
  };
}

/** Sends a draft to the person's inbox (or replaces a pending one they sent before). */
export async function toolSendDocument(read: FirestoreReader, write: FirestoreWriter, uid: string, args: Rec, scopes: string[], now: () => number = Date.now): Promise<{ text: string; isError: boolean }> {
  if (!scopes.includes(INBOX_SCOPE)) {
    return { isError: true, text: 'This connection can only read. To let it send drafts, disconnect it in Sakura (Settings → Account → AI assistants), connect again, and tick "Also let it send new drafts to your inbox".' };
  }
  const t = now();
  const built = buildDraft({ title: String(args.title ?? ''), markdown: String(args.markdown ?? ''), diagrams: args.diagrams as DraftInput['diagrams'] }, t);
  if (typeof built === 'string') return { isError: true, text: built };
  const json = JSON.stringify(built.doc);
  if (new TextEncoder().encode(json).length > DRAFT_MAX_BYTES) return { isError: true, text: 'This draft is over 900 KB. Split it into smaller documents.' };

  // Revising a pending draft: only one this person's assistant sent, still in the inbox.
  const replaces = String(args.replaces ?? '').trim();
  if (replaces) {
    if (replaces.includes('/')) return { isError: true, text: 'Give "replaces" as the id send_document returned.' };
    // Only the sender is needed: the draft itself (up to 900 KB) isn't downloaded.
    const [hit] = await read.batchGet([`copies/${uid}/items/${replaces}`], ['fromUid']);
    if (!hit || hit[1].fromUid !== uid) return { isError: true, text: 'That draft is no longer waiting in the inbox (added or declined). Send it as a new draft instead.' };
  }
  // Exactly the fields firestore.rules allows for an inbox item and its notice.
  const from = { fromUid: uid, fromEmail: '', fromDisplayName: ASSISTANT_NAME };
  const copyId = await write.create(`copies/${uid}/items`, { ...from, title: built.title, doc: json, createdAt: t });
  await write.create(`notifications/${uid}/items`, { type: 'doc_copy', ...from, docId: copyId, docTitle: built.title, createdAt: t, read: false });
  if (replaces) {
    const [notices] = await Promise.all([write.findIds(`notifications/${uid}/items`, 'docId', replaces), write.remove(`copies/${uid}/items/${replaces}`)]);
    await Promise.all(notices.map((id) => write.remove(`notifications/${uid}/items/${id}`)));
  }
  const s = built.stats;
  const count = (k: number, one: string) => k + ' ' + one + (k === 1 ? '' : 's');
  const what = [count(s.rows, 'row'), s.tables && count(s.tables, 'table'), s.diagrams && count(s.diagrams, 'diagram'), s.followUps && count(s.followUps, 'follow-up')].filter(Boolean).join(', ');
  return {
    isError: false,
    text: `Sent "${built.title}" (${what}) to the person's Sakura inbox${replaces ? ', replacing the earlier draft' : ''}. Nothing is added to their documents until they preview it and tap Add; it then starts as a Draft. To revise it before then, call send_document again with replaces: "${copyId}".` + (built.notes.length ? ' Note: ' + built.notes.join(' ') : '')
  };
}
