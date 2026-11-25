/**
 * The MCP endpoint (docs/mcp-plan.md): POST /mcp, Streamable HTTP answered with plain JSON (no
 * sessions, no server-sent events: every call stands alone). Reached only with a valid access token;
 * the OAuth library checks it and hands over the connection's props.
 *
 * Read-only: three tools, each reading the person's own account (src/mcpNotes.ts).
 */

import { toolListDocuments, toolGetDocument, toolSearch } from './mcpNotes';
import type { FirestoreReader } from './firestoreRest';
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
    description: 'Returns one Sakura document as Markdown: its outline rows with notes and tables, each row\'s status (Agreed, Follow-up, Out of scope) and its thread entries. Pictures and diagrams are named, not included.',
    inputSchema: { type: 'object', properties: { id: { type: 'string', description: 'The document id, from list_documents or search.' } }, required: ['id'], additionalProperties: false },
    annotations: READ_ONLY
  },
  {
    name: 'search',
    title: 'Search documents',
    description: 'Finds Sakura documents containing all the given words, in titles, rows, notes or thread entries. Returns each document\'s id and title with the matching rows (and the rows above them). Use get_document to read one in full.',
    inputSchema: { type: 'object', properties: { query: { type: 'string', description: 'Words to look for.' } }, required: ['query'], additionalProperties: false },
    annotations: READ_ONLY
  }
];

const SERVER_INFO = { name: 'sakura-notes', title: 'Sakura Notes', version: '1.0.0' };
const INSTRUCTIONS = 'Read-only access to one person\'s Sakura Notes: outlines of their own thinking (designs, analyses, decisions). Use search to find where something was worked out, then get_document to read it. Nothing can be changed through this server.';

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

async function callTool(name: string, args: Json, uid: string, db: FirestoreReader): Promise<{ text: string; isError: boolean }> {
  try {
    if (!allowCall(uid)) return { text: 'Too many requests; try again in a minute.', isError: true };
    if (name === 'list_documents') return { text: await toolListDocuments(db, uid), isError: false };
    if (name === 'get_document') return { text: await toolGetDocument(db, uid, String(args.id ?? '')), isError: false };
    if (name === 'search') return { text: await toolSearch(db, uid, String(args.query ?? '')), isError: false };
    return { text: 'Unknown tool: ' + name, isError: true };
  } catch (e) {
    // Never the content: only what went wrong.
    if (e instanceof SignInExpiredError) return { text: e.message, isError: true };
    return { text: 'Sakura could not be read just now. Try again shortly.', isError: true };
  }
}

async function handleMessage(msg: unknown, uid: string, db: FirestoreReader): Promise<Json | null> {
  if (!msg || typeof msg !== 'object' || (msg as Json).jsonrpc !== '2.0') return rpcError(null, -32600, 'Invalid request');
  const m = msg as Json;
  const isNotification = !('id' in m);
  const method = String(m.method || '');
  const params = (m.params && typeof m.params === 'object' ? m.params : {}) as Json;
  if (isNotification) return null;
  switch (method) {
    case 'initialize': {
      const asked = String(params.protocolVersion || '');
      const protocolVersion = SUPPORTED_PROTOCOL_VERSIONS.includes(asked) ? asked : SUPPORTED_PROTOCOL_VERSIONS[2];
      return rpcResult(m.id, { protocolVersion, capabilities: { tools: { listChanged: false } }, serverInfo: SERVER_INFO, instructions: INSTRUCTIONS });
    }
    case 'ping':
      return rpcResult(m.id, {});
    case 'tools/list':
      return rpcResult(m.id, { tools: TOOLS });
    case 'tools/call': {
      const name = String(params.name || '');
      if (!TOOLS.some((t) => t.name === name)) return rpcError(m.id, -32602, 'Unknown tool: ' + name);
      const args = (params.arguments && typeof params.arguments === 'object' ? params.arguments : {}) as Json;
      const r = await callTool(name, args, uid, db);
      return rpcResult(m.id, { content: [{ type: 'text', text: r.text }], isError: r.isError });
    }
    default:
      return rpcError(m.id, -32601, 'Method not found: ' + method);
  }
}

/** POST /mcp. `db` reads as the connection's person; `uid` is theirs. */
export async function handleMcpRequest(request: Request, uid: string, db: FirestoreReader): Promise<Response> {
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: { Allow: 'POST' } });
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json(rpcError(null, -32700, 'Parse error'), { status: 400 });
  }
  if (Array.isArray(body)) {
    const out = (await Promise.all(body.map((b) => handleMessage(b, uid, db)))).filter(Boolean);
    return out.length ? Response.json(out) : new Response(null, { status: 202 });
  }
  const out = await handleMessage(body, uid, db);
  return out ? Response.json(out) : new Response(null, { status: 202 });
}
