/**
 * The MCP endpoint (docs/mcp-plan.md): POST /mcp, Streamable HTTP answered with plain JSON (no
 * sessions, no server-sent events: every call stands alone). Reached only with a valid access token;
 * the OAuth library checks it and hands over the connection's props.
 *
 * Read-only: three tools, each reading the person's own account (src/mcpNotes.ts).
 */

import { toolListDocuments, toolGetDocument, toolSearch } from './mcpNotes';
import { toolOpenItems, toolCurrentDocument, toolWhatChanged, toolTodos } from './mcpMore';
import type { FirestoreReader, FirestoreWriter } from './firestoreRest';
import { toolSendDocument, INBOX_SCOPE } from './mcpSend';
import { SignInExpiredError } from './firestoreRest';

export const SUPPORTED_PROTOCOL_VERSIONS = ['2026-07-28', '2025-11-25', '2025-06-18', '2025-03-26'];

const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };

export const TOOLS = [
  {
    name: 'list_documents',
    title: 'List documents',
    description: 'Lists the Sakura documents in the signed-in person\'s account: id, title, folder and when each was last changed, newest first. Documents in Trash are left out.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: READ_ONLY
  },
  {
    name: 'get_document',
    title: 'Read a document',
    description: 'Returns one Sakura document as Markdown: its outline rows with notes and tables, each row\'s status (Agreed, Follow-up, Out of scope) and its thread entries. Pictures and diagrams are named, not included. The person keeps editing in Sakura while you talk: call this again before answering about the document\'s content, rather than relying on an earlier read.',
    inputSchema: { type: 'object', properties: { id: { type: 'string', description: 'The document id, from list_documents or search.' }, section: { type: 'string', description: 'Optional: words from a row or heading. Returns only that row and the rows under it, for long documents.' } }, required: ['id'], additionalProperties: false },
    annotations: READ_ONLY
  },
  {
    name: 'search',
    title: 'Search documents',
    description: 'Finds Sakura documents containing all the given words, in titles, rows, notes or thread entries. Returns each document\'s id and title with the matching rows (and the rows above them). Use get_document to read one in full.',
    inputSchema: { type: 'object', properties: { query: { type: 'string', description: 'Words to look for.' } }, required: ['query'], additionalProperties: false },
    annotations: READ_ONLY
  },
  {
    name: 'open_items',
    title: 'What is still open',
    description: 'Lists what is still open: rows marked Follow-up (with how long) and questions in threads without an answer, each with the rows above it. For one document (id) or across all documents (newest first). Good for an agenda or a status check.',
    inputSchema: { type: 'object', properties: { id: { type: 'string', description: 'Optional: one document\'s id. Leave out to look across all documents.' } }, additionalProperties: false },
    annotations: READ_ONLY
  },
  {
    name: 'current_document',
    title: 'The document being worked on',
    description: 'Returns the document the person changed most recently (the one they are working on), in full as Markdown, with its title and id. Use it when they say "this document" or "what I\'m working on" without naming one.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: READ_ONLY
  },
  {
    name: 'what_changed',
    title: 'What changed',
    description: 'What changed in a document since a date (default: the last 7 days), from its Version history: a one-line summary, and the rows added, removed and reworded.',
    inputSchema: { type: 'object', properties: { id: { type: 'string', description: 'The document id.' }, since: { type: 'string', description: 'Optional: a date like 2026-11-20. Default: 7 days ago.' } }, required: ['id'], additionalProperties: false },
    annotations: READ_ONLY
  },
  {
    name: 'todos',
    title: 'To-Dos',
    description: 'The person\'s Sakura To-Do list in its sections (Pinned, Today, Upcoming, Anytime, Waiting), with due dates, repeats, subtasks and who each task is waiting for. Done tasks only when asked.',
    inputSchema: { type: 'object', properties: { include_done: { type: 'boolean', description: 'Also list done tasks.' } }, additionalProperties: false },
    annotations: READ_ONLY
  },
  {
    name: 'send_document',
    title: 'Send a new draft to Sakura',
    description: 'Creates a NEW Sakura document from Markdown and puts it in the person\'s Sakura inbox as a draft. It never changes an existing document: the person previews it in Sakura and decides to Add or Decline it, and it starts with status Draft. Use # headings and - list items (nesting = outline depth), a paragraph after a blank line, indented under an item, becomes its note, Markdown tables become tables, "- [ ]" a checkbox, "1." items a numbered list (use them for steps in order; Sakura shows the numbers, so do not type them into the words). Put [follow-up], [agreed] or [out of scope] in a list item to set its status. Optional draw.io diagrams (XML) are placed under the row whose words contain "under". To revise a draft still waiting in the inbox, pass its id as "replaces". Needs the person\'s permission to send drafts (asked when connecting).',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'The document\'s title.' },
        markdown: { type: 'string', description: 'The content as Markdown (see the description for how it maps to Sakura).' },
        diagrams: { type: 'array', description: 'Optional draw.io diagrams.', items: { type: 'object', properties: { title: { type: 'string' }, xml: { type: 'string', description: 'draw.io XML (<mxfile> or <mxGraphModel>), at most 200 KB.' }, under: { type: 'string', description: 'Words of the row it belongs under.' } }, required: ['xml'] } },
        replaces: { type: 'string', description: 'Optional: the id of a draft sent before and still waiting in the inbox; this one replaces it.' }
      },
      required: ['title', 'markdown'],
      additionalProperties: false
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false }
  }
];

/** The installed app's icon: the flower on a rounded tile with transparent corners. Claude shows an
 * icon's own pixels as they are (a square image shows as a sharp square in its approval dialog), and a
 * bare glyph all but disappears in dark mode, so the tile carries its own rounded shape (owner
 * 2026-11-25: the flat glyph on a white square looked cheap). */
export const SERVER_ICON = 'https://www.sakura-notes.com/icon-512-pwa.png';
const SERVER_INFO = {
  name: 'sakura-notes',
  title: 'Sakura Notes',
  version: '1.0.0',
  websiteUrl: 'https://www.sakura-notes.com',
  icons: [{ src: SERVER_ICON, mimeType: 'image/png', sizes: ['512x512'] }]
};
// What every connection is told; the parts about sending drafts only when it may (scope inbox:write).
const ABOUT = 'Access to one person\'s Sakura Notes: outlines of their own thinking (designs, analyses, decisions). Use search to find where something was worked out, then get_document to read it. Existing documents can never be changed through this server.';
const ABOUT_SENDING = 'With the person\'s permission, send_document puts a NEW draft in their Sakura inbox for them to review and add. When they give you material (notes, an email, requirements) and want it in Sakura, structure it as an outline and use send_document; tell them it is waiting in their Sakura inbox. To refine it before they add it, send it again with replaces.';
const FRESH = 'The person keeps editing their documents in Sakura while you talk. Before answering about a document\'s content, read it again with get_document; an earlier read may be out of date. When they say "this document" or "what I am working on" without naming one, use current_document. For a long document, read one part with get_document and section.';
const offer = (canSend: boolean) => 'If the person just mentions Sakura or asks what you can do with it, list their five most recently changed documents (list_documents) and offer to: work on one of them with them, summarise it, find what is still open (open_items), say what changed lately (what_changed), go through their To-Dos (todos), ' + (canSend ? 'search across their notes, or turn something they paste into a new Sakura draft (send_document).' : 'or search across their notes.') + ' Keep the offer short.';
const INSTRUCTIONS = [ABOUT, ABOUT_SENDING, FRESH, offer(true)].join(' ');
const READ_ONLY_INSTRUCTIONS = [ABOUT, FRESH, offer(false)].join(' ');

/** Ready-made starters (MCP prompts): assistants that support them list them under the connector, so
 * nobody has to remember wording (owner 2026-11-25). */
export const PROMPTS = [
  {
    name: 'work_on_document',
    title: 'Work on a document',
    description: 'Be my assistant for one Sakura document, re-reading it as I edit.',
    arguments: [{ name: 'document', description: 'The document\'s title (or part of it)', required: true }]
  },
  {
    name: 'whats_open',
    title: 'What is still open',
    description: 'Find what is still open in a Sakura document: follow-ups and unanswered questions.',
    arguments: [{ name: 'document', description: 'The document\'s title (or part of it)', required: true }]
  },
  {
    name: 'search_notes',
    title: 'Search my notes',
    description: 'Find where something was worked out across my Sakura notes.',
    arguments: [{ name: 'topic', description: 'What to look for', required: true }]
  }
];

export function promptMessage(name: string, args: Record<string, unknown>): string | null {
  const a = (k: string) => String(args[k] ?? '').trim().slice(0, 200);
  if (name === 'work_on_document') return `Be my assistant for my Sakura document "${a('document')}". Find it (search, or list_documents), read it with get_document, and give me a two-line summary and the three things most worth my attention. I'll keep editing it in Sakura while we talk: re-read it with get_document before each answer about its content.`;
  if (name === 'whats_open') return `In my Sakura document "${a('document')}", what is still open? Read it with get_document and list rows marked Follow-up, questions without an answer, and anything else unresolved, each with the row above it for context.`;
  if (name === 'search_notes') return `Search my Sakura notes for "${a('topic')}". Show which documents and rows mention it, then summarise what I worked out there, reading the most relevant document with get_document.`;
  return null;
}

type Json = Record<string, unknown>;
const rpcResult = (id: unknown, result: unknown) => ({ jsonrpc: '2.0', id, result });
const rpcError = (id: unknown, code: number, message: string) => ({ jsonrpc: '2.0', id: id ?? null, error: { code, message } });

/** Calls per person per minute, in this isolate: a guard against a runaway client, not billing. */
const RATE_PER_MINUTE = 60;
const recentCalls = new Map<string, number[]>();
export function allowCall(uid: string, now = Date.now()): boolean {
  const list = (recentCalls.get(uid) || []).filter((t) => now - t < 60_000);
  if (list.length >= RATE_PER_MINUTE) { recentCalls.set(uid, list); return false; }
  list.push(now);
  recentCalls.set(uid, list);
  return true;
}

interface McpExtras { write?: FirestoreWriter; scopes?: string[] }

async function callTool(name: string, args: Json, uid: string, db: FirestoreReader, extras: McpExtras = {}): Promise<{ text: string; isError: boolean }> {
  try {
    if (!allowCall(uid)) return { text: 'Too many requests; try again in a minute.', isError: true };
    if (name === 'list_documents') return { text: await toolListDocuments(db, uid), isError: false };
    if (name === 'get_document') return { text: await toolGetDocument(db, uid, String(args.id ?? ''), String(args.section ?? '')), isError: false };
    if (name === 'open_items') return { text: await toolOpenItems(db, uid, String(args.id ?? '')), isError: false };
    if (name === 'current_document') return { text: await toolCurrentDocument(db, uid), isError: false };
    if (name === 'what_changed') return { text: await toolWhatChanged(db, uid, String(args.id ?? ''), String(args.since ?? '')), isError: false };
    if (name === 'todos') return { text: await toolTodos(db, uid, args.include_done === true), isError: false };
    if (name === 'send_document') {
      if (!extras.write) return { text: 'Sending drafts isn\'t available here.', isError: true };
      return await toolSendDocument(db, extras.write, uid, args, extras.scopes || []);
    }
    if (name === 'search') return { text: await toolSearch(db, uid, String(args.query ?? '')), isError: false };
    return { text: 'Unknown tool: ' + name, isError: true };
  } catch (e) {
    // Never the content: only what went wrong.
    if (e instanceof SignInExpiredError) return { text: e.message, isError: true };
    return { text: 'Sakura could not be read just now. Try again shortly.', isError: true };
  }
}

async function handleMessage(msg: unknown, uid: string, db: FirestoreReader, extras: McpExtras = {}): Promise<Json | null> {
  if (!msg || typeof msg !== 'object' || (msg as Json).jsonrpc !== '2.0') return rpcError(null, -32600, 'Invalid request');
  const m = msg as Json;
  const isNotification = !('id' in m);
  const method = String(m.method || '');
  const params = (m.params && typeof m.params === 'object' ? m.params : {}) as Json;
  if (isNotification) return null;
  switch (method) {
    case 'initialize': {
      const canSend = (extras.scopes || []).includes(INBOX_SCOPE);
      const asked = String(params.protocolVersion || '');
      const protocolVersion = SUPPORTED_PROTOCOL_VERSIONS.includes(asked) ? asked : SUPPORTED_PROTOCOL_VERSIONS[2];
      return rpcResult(m.id, { protocolVersion, capabilities: { tools: { listChanged: false }, prompts: { listChanged: false } }, serverInfo: SERVER_INFO, instructions: canSend ? INSTRUCTIONS : READ_ONLY_INSTRUCTIONS });
    }
    case 'ping':
      return rpcResult(m.id, {});
    case 'tools/list':
      // A connection without permission to send drafts isn't offered send_document at all (calling it
      // anyway still says how to allow it).
      return rpcResult(m.id, { tools: (extras.scopes || []).includes(INBOX_SCOPE) ? TOOLS : TOOLS.filter((t) => t.name !== 'send_document') });
    case 'prompts/list':
      return rpcResult(m.id, { prompts: PROMPTS });
    case 'prompts/get': {
      const name = String(params.name || '');
      const args = (params.arguments && typeof params.arguments === 'object' ? params.arguments : {}) as Json;
      const text = promptMessage(name, args);
      if (text === null) return rpcError(m.id, -32602, 'Unknown prompt: ' + name);
      const p = PROMPTS.find((x) => x.name === name);
      return rpcResult(m.id, { description: p?.description, messages: [{ role: 'user', content: { type: 'text', text } }] });
    }
    case 'tools/call': {
      const name = String(params.name || '');
      if (!TOOLS.some((t) => t.name === name)) return rpcError(m.id, -32602, 'Unknown tool: ' + name);
      const args = (params.arguments && typeof params.arguments === 'object' ? params.arguments : {}) as Json;
      const r = await callTool(name, args, uid, db, extras);
      return rpcResult(m.id, { content: [{ type: 'text', text: r.text }], isError: r.isError });
    }
    default:
      return rpcError(m.id, -32601, 'Method not found: ' + method);
  }
}

/** POST /mcp. `db` reads as the connection's person; `uid` is theirs. */
export async function handleMcpRequest(request: Request, uid: string, db: FirestoreReader, extras: McpExtras = {}): Promise<Response> {
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: { Allow: 'POST' } });
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json(rpcError(null, -32700, 'Parse error'), { status: 400 });
  }
  if (Array.isArray(body)) {
    const out = (await Promise.all(body.map((b) => handleMessage(b, uid, db, extras)))).filter(Boolean);
    return out.length ? Response.json(out) : new Response(null, { status: 202 });
  }
  const out = await handleMessage(body, uid, db, extras);
  return out ? Response.json(out) : new Response(null, { status: 202 });
}
