import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { SignJWT, generateKeyPair, exportJWK } from 'jose';
import worker, { type Env } from '../src/index';

// The whole connection, through the real OAuth library: an assistant registers, the person allows it
// on the consent page, the assistant swaps the code for a token and reads through /mcp; Disconnect
// ends it. Google's endpoints (signing keys, token service, Firestore) are faked at fetch.

const PROJECT_ID = 'sakura-4cdae';
const BASE = 'https://ai.sakura-notes.com';
const REDIRECT = 'https://claude.ai/api/mcp/auth_callback';
const UID = 'user-1';

function fakeKv() {
  const store = new Map<string, { value: string; metadata?: unknown }>();
  return {
    store,
    async get(key: string, opts?: unknown) {
      const hit = store.get(key);
      if (!hit) return null;
      const type = typeof opts === 'string' ? opts : (opts as { type?: string } | undefined)?.type;
      return type === 'json' ? JSON.parse(hit.value) : hit.value;
    },
    async getWithMetadata(key: string, opts?: unknown) {
      const hit = store.get(key);
      const type = typeof opts === 'string' ? opts : (opts as { type?: string } | undefined)?.type;
      return { value: hit ? (type === 'json' ? JSON.parse(hit.value) : hit.value) : null, metadata: hit?.metadata ?? null };
    },
    async put(key: string, value: string, opts?: { metadata?: unknown }) {
      store.set(key, { value: typeof value === 'string' ? value : JSON.stringify(value), metadata: opts?.metadata });
    },
    async delete(key: string) {
      store.delete(key);
    },
    async list(opts?: { prefix?: string; limit?: number; cursor?: string }) {
      const keys = [...store.keys()].filter((k) => k.startsWith(opts?.prefix ?? '')).sort();
      const start = opts?.cursor ? Number(opts.cursor) : 0;
      const limit = opts?.limit ?? 1000;
      const page = keys.slice(start, start + limit);
      const done = start + limit >= keys.length;
      return { keys: page.map((name) => ({ name, metadata: store.get(name)?.metadata })), list_complete: done, cursor: done ? undefined : String(start + limit) };
    }
  };
}

let idToken = '';
const realFetch = globalThis.fetch;
const ctx = { waitUntil() {}, passThroughOnException() {}, props: {} } as unknown as ExecutionContext;
let env: Env;
let cookieJar = '';

const b64url = (buf: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const call = async (req: Request) => {
  const res = await worker.fetch(req, env, ctx);
  const set = res.headers.get('Set-Cookie');
  if (set) cookieJar = set.split(';')[0];
  return res;
};

beforeAll(async () => {
  const { publicKey, privateKey } = await generateKeyPair('RS256', { extractable: true });
  const jwk = { ...(await exportJWK(publicKey)), kid: 'k1', alg: 'RS256', use: 'sig' };
  const now = Math.floor(Date.now() / 1000);
  idToken = await new SignJWT({ sub: UID }).setProtectedHeader({ alg: 'RS256', kid: 'k1' }).setIssuer('https://securetoken.google.com/' + PROJECT_ID)
    .setAudience(PROJECT_ID).setIssuedAt(now).setExpirationTime(now + 3600).sign(privateKey);
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.includes('/service_accounts/v1/jwk/')) return Response.json({ keys: [jwk] });
    if (url.startsWith('https://securetoken.googleapis.com/v1/token')) {
      const ok = String(init?.body || '').includes('refresh_token=good-refresh');
      return ok ? Response.json({ id_token: 'fs-id-token', user_id: UID, expires_in: '3600' }) : Response.json({ error: { message: 'INVALID_REFRESH_TOKEN' } }, { status: 400 });
    }
    if (url.startsWith('https://firestore.googleapis.com/')) {
      const h = new Headers(init?.headers);
      if (h.get('Authorization') !== 'Bearer fs-id-token') return new Response('denied', { status: 403 });
      if (url.includes('/users/' + UID + '/meta/docsIndex')) return Response.json({ fields: { value: { arrayValue: { values: [{ mapValue: { fields: { id: { stringValue: 'd1' }, title: { stringValue: 'Plan' }, updatedAt: { integerValue: '1000' } } } }] } } } });
      if (url.includes('/users/' + UID + '/deletedDocs')) return Response.json({});
      return new Response('{}', { status: 404 });
    }
    return realFetch(input, init);
  }) as typeof fetch;
  const kv = fakeKv() as unknown as KVNamespace;
  env = { SAKURA_VAULT_KV: kv, OAUTH_KV: kv, FIREBASE_PROJECT_ID: PROJECT_ID, FIREBASE_API_KEY: 'k', VAULT_KEK: '', ADMIN_UID: '', BROWSER: {} as Fetcher } as unknown as Env;
});
afterAll(() => { globalThis.fetch = realFetch; });

describe('MCP connection flow', () => {
  let clientId = '';
  let accessToken = '';
  const verifier = 'v'.repeat(64);

  it('an unauthenticated /mcp call is challenged and points to the resource metadata', async () => {
    const res = await call(new Request(BASE + '/mcp', { method: 'POST', body: '{}' }));
    expect(res.status).toBe(401);
    expect(res.headers.get('WWW-Authenticate') || '').toContain('resource_metadata');
    const meta = await call(new Request(BASE + '/.well-known/oauth-protected-resource/mcp'));
    expect(meta.status).toBe(200);
    expect(((await meta.json()) as { resource: string }).resource).toBe(BASE + '/mcp');
  });

  it('a client registers, the person allows it, and the code becomes a token', async () => {
    const reg = await call(new Request(BASE + '/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ client_name: 'Claude', redirect_uris: [REDIRECT], token_endpoint_auth_method: 'none', grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'] }) }));
    expect(reg.status).toBe(201);
    clientId = ((await reg.json()) as { client_id: string }).client_id;

    const challenge = b64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
    const q = new URLSearchParams({ response_type: 'code', client_id: clientId, redirect_uri: REDIRECT, code_challenge: challenge, code_challenge_method: 'S256', state: 's1', scope: 'notes:read', resource: BASE + '/mcp' });
    const auth = await call(new Request(BASE + '/authorize?' + q));
    expect(auth.status).toBe(302);
    const loc = auth.headers.get('Location') || '';
    expect(loc.startsWith('https://www.sakura-notes.com/connect.html#')).toBe(true);
    const frag = new URLSearchParams(loc.split('#')[1]);
    expect(frag.get('client')).toBe('Claude');
    expect(frag.get('to')).toBe('claude.ai');

    // A wrong refresh token (someone else's, or a stale one) is refused.
    const bad = new FormData();
    bad.set('handle', frag.get('handle') || ''); bad.set('decision', 'allow'); bad.set('idToken', idToken); bad.set('refreshToken', 'stolen');
    expect((await call(new Request(BASE + '/authorize', { method: 'POST', body: bad, headers: { Cookie: cookieJar } }))).status).toBe(401);

    const form = new FormData();
    form.set('handle', frag.get('handle') || ''); form.set('decision', 'allow'); form.set('idToken', idToken); form.set('refreshToken', 'good-refresh');
    const done = await call(new Request(BASE + '/authorize', { method: 'POST', body: form, headers: { Cookie: cookieJar } }));
    expect(done.status).toBe(302);
    const back = new URL(done.headers.get('Location') || '');
    expect(back.origin + back.pathname).toBe(REDIRECT);
    expect(back.searchParams.get('state')).toBe('s1');

    const tok = await call(new Request(BASE + '/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'authorization_code', code: back.searchParams.get('code') || '', redirect_uri: REDIRECT, client_id: clientId, code_verifier: verifier, resource: BASE + '/mcp' }) }));
    expect(tok.status).toBe(200);
    accessToken = ((await tok.json()) as { access_token: string }).access_token;
    expect(accessToken).toBeTruthy();
  });

  it('the assistant reads through /mcp: initialize, tools, list_documents', async () => {
    const rpc = (body: unknown) => call(new Request(BASE + '/mcp', { method: 'POST', headers: { Authorization: 'Bearer ' + accessToken, 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' }, body: JSON.stringify(body) }));
    const init = (await (await rpc({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '1' } } })).json()) as { result: { protocolVersion: string; serverInfo: { name: string } } };
    expect(init.result.protocolVersion).toBe('2025-06-18');
    expect((await rpc({ jsonrpc: '2.0', method: 'notifications/initialized' })).status).toBe(202);
    const tools = (await (await rpc({ jsonrpc: '2.0', id: 2, method: 'tools/list' })).json()) as { result: { tools: Array<{ name: string }> } };
    expect(tools.result.tools.map((t) => t.name)).toEqual(['list_documents', 'get_document', 'search', 'open_items', 'current_document', 'what_changed', 'todos']);
    const listed = (await (await rpc({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'list_documents', arguments: {} } })).json()) as { result: { content: Array<{ text: string }>; isError: boolean } };
    expect(listed.result.isError).toBe(false);
    expect(JSON.parse(listed.result.content[0].text)[0]).toMatchObject({ id: 'd1', title: 'Plan' });
  });

  it('Settings lists the connection, and Disconnect ends it at once', async () => {
    const authz = { Authorization: 'Bearer ' + idToken };
    const list = (await (await call(new Request(BASE + '/connections', { headers: authz }))).json()) as { connections: Array<{ id: string; name: string }> };
    expect(list.connections.map((c) => c.name)).toEqual(['Claude']);
    expect(JSON.stringify(list)).not.toContain('good-refresh');
    const del = await call(new Request(BASE + '/connections?id=' + encodeURIComponent(list.connections[0].id), { method: 'DELETE', headers: authz }));
    expect(del.status).toBe(200);
    const after = await call(new Request(BASE + '/mcp', { method: 'POST', headers: { Authorization: 'Bearer ' + accessToken }, body: JSON.stringify({ jsonrpc: '2.0', id: 9, method: 'ping' }) }));
    expect(after.status).toBe(401);
  });

  it('the stored refresh token is never in plain text in the store', async () => {
    const kv = env.OAUTH_KV as unknown as ReturnType<typeof fakeKv>;
    for (const { value } of kv.store.values()) expect(value).not.toContain('good-refresh');
  });
});
