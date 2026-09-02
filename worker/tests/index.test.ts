import { describe, it, expect, beforeAll } from 'vitest';
import { SignJWT, generateKeyPair, type JWTVerifyGetKey } from 'jose';
import {
  default as worker,
  handleAdminProvidersPost,
  handleAdminProvidersGet,
  handleAdminProvidersDelete,
  handleAdminConfigGet,
  handleAdminConfigPost,
  handleAiComplete,
  corsHeadersFor,
  type Env
} from '../src/index';
import { b64FromBytes } from '../src/vault';

const PROJECT_ID = 'sakura-4cdae';
const ISSUER = `https://securetoken.google.com/${PROJECT_ID}`;
const ADMIN_UID = 'admin-uid-1';
const USER_UID = 'regular-user-1';

let adminToken: string;
let userToken: string;
let getKey: JWTVerifyGetKey;
let kekBase64: string;

beforeAll(async () => {
  const { publicKey, privateKey } = await generateKeyPair('RS256');
  getKey = async () => publicKey;
  const sign = (sub: string) => {
    const nowSeconds = Math.floor(Date.now() / 1000);
    return new SignJWT({ sub })
      .setProtectedHeader({ alg: 'RS256' })
      .setIssuer(ISSUER)
      .setAudience(PROJECT_ID)
      .setIssuedAt(nowSeconds)
      .setExpirationTime(nowSeconds + 3600)
      .sign(privateKey);
  };
  adminToken = await sign(ADMIN_UID);
  userToken = await sign(USER_UID);
  const rawKek = crypto.getRandomValues(new Uint8Array(32));
  kekBase64 = b64FromBytes(rawKek);
});

interface FakeKv {
  store: Record<string, string>;
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
  list(options?: { prefix?: string }): Promise<{ keys: { name: string }[] }>;
}

function fakeKv(): FakeKv {
  const store: Record<string, string> = {};
  return {
    store,
    async get(key) {
      return key in store ? store[key] : null;
    },
    async put(key, value) {
      store[key] = value;
    },
    async delete(key) {
      delete store[key];
    },
    async list(options) {
      const prefix = options?.prefix ?? '';
      return { keys: Object.keys(store).filter((k) => k.startsWith(prefix)).map((name) => ({ name })) };
    }
  };
}

function makeEnv(kv: FakeKv, overrides: Partial<Env> = {}): Env {
  return {
    // The real Env.SAKURA_VAULT_KV type is Cloudflare's full KVNamespace; this fake only
    // implements the get/put/delete/list subset the code actually uses (see QuotaKV/ProvidersKV
    // in quota.ts/providers.ts) — safe to cast here since nothing calls the methods it lacks.
    SAKURA_VAULT_KV: kv as unknown as KVNamespace,
    FIREBASE_PROJECT_ID: PROJECT_ID,
    VAULT_KEK: kekBase64,
    ADMIN_UID,
    ...overrides
  };
}

function authedRequest(url: string, token: string, init: RequestInit = {}): Request {
  return new Request(url, { ...init, headers: { ...(init.headers as Record<string, string>), Authorization: `Bearer ${token}` } });
}

const validProviderBody = (overrides: Record<string, unknown> = {}) =>
  JSON.stringify({ id: 'groq', baseUrl: 'https://api.groq.com/x', shape: 'openai', model: 'llama', apiKey: 'sk-secret', order: 0, ...overrides });

describe('handleAdminProvidersPost', () => {
  it('rejects a request with no Authorization header', async () => {
    const res = await handleAdminProvidersPost(new Request('https://x/admin/providers', { method: 'POST' }), makeEnv(fakeKv()), getKey);
    expect(res.status).toBe(401);
  });

  it('rejects a non-admin user even with a valid token', async () => {
    const req = authedRequest('https://x/admin/providers', userToken, { method: 'POST', body: validProviderBody() });
    const res = await handleAdminProvidersPost(req, makeEnv(fakeKv()), getKey);
    expect(res.status).toBe(403);
  });

  it('rejects invalid JSON', async () => {
    const req = authedRequest('https://x/admin/providers', adminToken, { method: 'POST', body: 'not json' });
    const res = await handleAdminProvidersPost(req, makeEnv(fakeKv()), getKey);
    expect(res.status).toBe(400);
  });

  it('rejects a missing required field (no apiKey)', async () => {
    const req = authedRequest('https://x/admin/providers', adminToken, {
      method: 'POST',
      body: JSON.stringify({ id: 'groq', baseUrl: 'https://x', shape: 'openai', model: 'm' })
    });
    const res = await handleAdminProvidersPost(req, makeEnv(fakeKv()), getKey);
    expect(res.status).toBe(400);
  });

  it('rejects an invalid shape', async () => {
    const req = authedRequest('https://x/admin/providers', adminToken, { method: 'POST', body: validProviderBody({ shape: 'made-up' }) });
    const res = await handleAdminProvidersPost(req, makeEnv(fakeKv()), getKey);
    expect(res.status).toBe(400);
  });

  it('accepts a valid admin request and stores the provider with the key encrypted', async () => {
    const kv = fakeKv();
    const req = authedRequest('https://x/admin/providers', adminToken, { method: 'POST', body: validProviderBody() });
    const res = await handleAdminProvidersPost(req, makeEnv(kv), getKey);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(kv.store['provider:groq']).toBeDefined();
    expect(kv.store['provider:groq']).not.toContain('sk-secret');
  });
});

describe('handleAdminProvidersGet', () => {
  it('rejects a non-admin', async () => {
    const req = authedRequest('https://x/admin/providers', userToken, { method: 'GET' });
    const res = await handleAdminProvidersGet(req, makeEnv(fakeKv()), getKey);
    expect(res.status).toBe(403);
  });

  it('lists providers without exposing the encrypted key', async () => {
    const kv = fakeKv();
    const env = makeEnv(kv);
    await handleAdminProvidersPost(authedRequest('https://x/admin/providers', adminToken, { method: 'POST', body: validProviderBody() }), env, getKey);

    const res = await handleAdminProvidersGet(authedRequest('https://x/admin/providers', adminToken, { method: 'GET' }), env, getKey);
    expect(res.status).toBe(200);
    const data = (await res.json()) as { providers: unknown[] };
    expect(data.providers).toEqual([{ id: 'groq', baseUrl: 'https://api.groq.com/x', shape: 'openai', model: 'llama', order: 0 }]);
  });

  it('returns an empty list when nothing is configured', async () => {
    const res = await handleAdminProvidersGet(authedRequest('https://x/admin/providers', adminToken, { method: 'GET' }), makeEnv(fakeKv()), getKey);
    expect(await res.json()).toEqual({ providers: [] });
  });
});

describe('handleAdminProvidersDelete', () => {
  it('removes a provider', async () => {
    const kv = fakeKv();
    const env = makeEnv(kv);
    await handleAdminProvidersPost(authedRequest('https://x/admin/providers', adminToken, { method: 'POST', body: validProviderBody() }), env, getKey);
    const res = await handleAdminProvidersDelete(
      authedRequest('https://x/admin/providers?id=groq', adminToken, { method: 'DELETE' }),
      env,
      getKey,
      new URL('https://x/admin/providers?id=groq')
    );
    expect(res.status).toBe(200);
    expect(kv.store['provider:groq']).toBeUndefined();
  });

  it('requires an id query parameter', async () => {
    const res = await handleAdminProvidersDelete(
      authedRequest('https://x/admin/providers', adminToken, { method: 'DELETE' }),
      makeEnv(fakeKv()),
      getKey,
      new URL('https://x/admin/providers')
    );
    expect(res.status).toBe(400);
  });

  it('rejects a non-admin', async () => {
    const res = await handleAdminProvidersDelete(
      authedRequest('https://x/admin/providers?id=groq', userToken, { method: 'DELETE' }),
      makeEnv(fakeKv()),
      getKey,
      new URL('https://x/admin/providers?id=groq')
    );
    expect(res.status).toBe(403);
  });
});

describe('handleAdminConfigGet / handleAdminConfigPost', () => {
  it('GET rejects a non-admin', async () => {
    const res = await handleAdminConfigGet(authedRequest('https://x/admin/config', userToken, { method: 'GET' }), makeEnv(fakeKv()), getKey);
    expect(res.status).toBe(403);
  });

  it('GET returns the env-var default when nothing is set in KV', async () => {
    const res = await handleAdminConfigGet(authedRequest('https://x/admin/config', adminToken, { method: 'GET' }), makeEnv(fakeKv(), { DAILY_AI_QUOTA: '20' }), getKey);
    expect(await res.json()).toEqual({ dailyQuota: 20 });
  });

  it('POST rejects a non-admin', async () => {
    const req = authedRequest('https://x/admin/config', userToken, { method: 'POST', body: JSON.stringify({ dailyQuota: 50 }) });
    const res = await handleAdminConfigPost(req, makeEnv(fakeKv()), getKey);
    expect(res.status).toBe(403);
  });

  it('POST rejects a non-positive-integer dailyQuota', async () => {
    const env = makeEnv(fakeKv());
    for (const bad of [0, -5, 3.5, 'twenty', null]) {
      const req = authedRequest('https://x/admin/config', adminToken, { method: 'POST', body: JSON.stringify({ dailyQuota: bad }) });
      const res = await handleAdminConfigPost(req, env, getKey);
      expect(res.status).toBe(400);
    }
  });

  it('POST sets the quota, and GET reflects it afterward — the admin can tune it without a redeploy', async () => {
    const kv = fakeKv();
    const env = makeEnv(kv, { DAILY_AI_QUOTA: '20' });
    const postRes = await handleAdminConfigPost(
      authedRequest('https://x/admin/config', adminToken, { method: 'POST', body: JSON.stringify({ dailyQuota: 75 }) }),
      env,
      getKey
    );
    expect(postRes.status).toBe(200);

    const getRes = await handleAdminConfigGet(authedRequest('https://x/admin/config', adminToken, { method: 'GET' }), env, getKey);
    expect(await getRes.json()).toEqual({ dailyQuota: 75 });
  });
});

describe('handleAiComplete', () => {
  it('rejects an unauthenticated request', async () => {
    const req = new Request('https://x/ai/complete', { method: 'POST', body: JSON.stringify({ userContent: 'hi' }) });
    const res = await handleAiComplete(req, makeEnv(fakeKv()), getKey, fetch);
    expect(res.status).toBe(401);
  });

  it('requires non-empty userContent', async () => {
    const req = authedRequest('https://x/ai/complete', userToken, { method: 'POST', body: JSON.stringify({ userContent: '  ' }) });
    const res = await handleAiComplete(req, makeEnv(fakeKv()), getKey, fetch);
    expect(res.status).toBe(400);
  });

  it('returns 503 when no provider is configured', async () => {
    const req = authedRequest('https://x/ai/complete', userToken, { method: 'POST', body: JSON.stringify({ userContent: 'hi' }) });
    const res = await handleAiComplete(req, makeEnv(fakeKv()), getKey, fetch);
    expect(res.status).toBe(503);
  });

  it('returns a completion from the configured provider, using the decrypted key', async () => {
    const kv = fakeKv();
    const env = makeEnv(kv);
    await handleAdminProvidersPost(authedRequest('https://x/admin/providers', adminToken, { method: 'POST', body: validProviderBody({ apiKey: 'sk-real' }) }), env, getKey);

    const fakeFetch = (async (_url: string | URL | Request, init?: RequestInit) => {
      expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer sk-real');
      return new Response(JSON.stringify({ choices: [{ message: { content: 'hello back' } }] }), { status: 200 });
    }) as typeof fetch;

    const req = authedRequest('https://x/ai/complete', userToken, { method: 'POST', body: JSON.stringify({ userContent: 'hi' }) });
    const res = await handleAiComplete(req, env, getKey, fakeFetch);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ text: 'hello back', provider: 'groq' });
  });

  it('falls back to the next provider in order when the first fails', async () => {
    const kv = fakeKv();
    const env = makeEnv(kv);
    await handleAdminProvidersPost(
      authedRequest('https://x/admin/providers', adminToken, { method: 'POST', body: validProviderBody({ id: 'first', baseUrl: 'https://first', order: 0 }) }),
      env,
      getKey
    );
    await handleAdminProvidersPost(
      authedRequest('https://x/admin/providers', adminToken, { method: 'POST', body: validProviderBody({ id: 'second', baseUrl: 'https://second', order: 1 }) }),
      env,
      getKey
    );

    const fakeFetch = (async (url: string | URL | Request) => {
      if (String(url) === 'https://first') return new Response(JSON.stringify({ error: { message: 'rate limited' } }), { status: 429 });
      return new Response(JSON.stringify({ choices: [{ message: { content: 'from second' } }] }), { status: 200 });
    }) as typeof fetch;

    const req = authedRequest('https://x/ai/complete', userToken, { method: 'POST', body: JSON.stringify({ userContent: 'hi' }) });
    const res = await handleAiComplete(req, env, getKey, fakeFetch);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ text: 'from second', provider: 'second' });
  });

  it('returns 502 with details when every provider fails', async () => {
    const kv = fakeKv();
    const env = makeEnv(kv);
    await handleAdminProvidersPost(authedRequest('https://x/admin/providers', adminToken, { method: 'POST', body: validProviderBody() }), env, getKey);
    const fakeFetch = (async () => new Response(JSON.stringify({ error: { message: 'down' } }), { status: 500 })) as typeof fetch;
    const req = authedRequest('https://x/ai/complete', userToken, { method: 'POST', body: JSON.stringify({ userContent: 'hi' }) });
    const res = await handleAiComplete(req, env, getKey, fakeFetch);
    expect(res.status).toBe(502);
    const data = (await res.json()) as { details: string[] };
    expect(data.details[0]).toContain('down');
  });

  it('enforces the daily quota, returning 429 once exceeded', async () => {
    const kv = fakeKv();
    const env = makeEnv(kv, { DAILY_AI_QUOTA: '1' });
    await handleAdminProvidersPost(authedRequest('https://x/admin/providers', adminToken, { method: 'POST', body: validProviderBody() }), env, getKey);
    const fakeFetch = (async () => new Response(JSON.stringify({ choices: [{ message: { content: 'ok' } }] }), { status: 200 })) as typeof fetch;

    const makeReq = () => authedRequest('https://x/ai/complete', userToken, { method: 'POST', body: JSON.stringify({ userContent: 'hi' }) });
    const first = await handleAiComplete(makeReq(), env, getKey, fakeFetch);
    expect(first.status).toBe(200);
    const second = await handleAiComplete(makeReq(), env, getKey, fakeFetch);
    expect(second.status).toBe(429);
  });

  it('an admin-set KV quota overrides the env-var default', async () => {
    const kv = fakeKv();
    const env = makeEnv(kv, { DAILY_AI_QUOTA: '20' });
    await handleAdminProvidersPost(authedRequest('https://x/admin/providers', adminToken, { method: 'POST', body: validProviderBody() }), env, getKey);
    await handleAdminConfigPost(authedRequest('https://x/admin/config', adminToken, { method: 'POST', body: JSON.stringify({ dailyQuota: 1 }) }), env, getKey);
    const fakeFetch = (async () => new Response(JSON.stringify({ choices: [{ message: { content: 'ok' } }] }), { status: 200 })) as typeof fetch;

    const makeReq = () => authedRequest('https://x/ai/complete', userToken, { method: 'POST', body: JSON.stringify({ userContent: 'hi' }) });
    const first = await handleAiComplete(makeReq(), env, getKey, fakeFetch);
    expect(first.status).toBe(200);
    // The env var says 20, but the admin just tuned it down to 1 via /admin/config — the
    // second request should already be over quota, not the twentieth.
    const second = await handleAiComplete(makeReq(), env, getKey, fakeFetch);
    expect(second.status).toBe(429);
  });

  it('quota is tracked per uid — a different user is unaffected by another user exhausting theirs', async () => {
    const kv = fakeKv();
    const env = makeEnv(kv, { DAILY_AI_QUOTA: '1' });
    await handleAdminProvidersPost(authedRequest('https://x/admin/providers', adminToken, { method: 'POST', body: validProviderBody() }), env, getKey);
    const fakeFetch = (async () => new Response(JSON.stringify({ choices: [{ message: { content: 'ok' } }] }), { status: 200 })) as typeof fetch;

    await handleAiComplete(authedRequest('https://x/ai/complete', userToken, { method: 'POST', body: JSON.stringify({ userContent: 'hi' }) }), env, getKey, fakeFetch);
    // adminToken's own uid has never used its quota yet, so it should still succeed.
    const res = await handleAiComplete(authedRequest('https://x/ai/complete', adminToken, { method: 'POST', body: JSON.stringify({ userContent: 'hi' }) }), env, getKey, fakeFetch);
    expect(res.status).toBe(200);
  });
});

describe('corsHeadersFor', () => {
  it('returns Access-Control-Allow-Origin echoing the production origin when allowed', () => {
    const headers = corsHeadersFor('https://www.sakura-notes.com');
    expect(headers['Access-Control-Allow-Origin']).toBe('https://www.sakura-notes.com');
    expect(headers['Access-Control-Allow-Methods']).toContain('POST');
    expect(headers['Access-Control-Allow-Headers']).toContain('Authorization');
  });

  it('allows the local dev origin', () => {
    const headers = corsHeadersFor('http://localhost:5173');
    expect(headers['Access-Control-Allow-Origin']).toBe('http://localhost:5173');
  });

  it('returns no CORS headers at all for an origin not on the allowlist', () => {
    expect(corsHeadersFor('https://evil.example.com')).toEqual({});
  });

  it('returns no CORS headers for a null origin (same-origin or non-browser caller)', () => {
    expect(corsHeadersFor(null)).toEqual({});
  });
});

describe('default export (the router) — CORS wrapping', () => {
  it('answers an OPTIONS preflight directly, with CORS headers, without reaching a handler', async () => {
    const req = new Request('https://x/admin/providers', { method: 'OPTIONS', headers: { Origin: 'https://www.sakura-notes.com' } });
    const res = await worker.fetch(req, makeEnv(fakeKv()));
    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://www.sakura-notes.com');
  });

  it('adds CORS headers to a real response when the origin is allowed', async () => {
    const req = new Request('https://x/health', { headers: { Origin: 'https://www.sakura-notes.com' } });
    const res = await worker.fetch(req, makeEnv(fakeKv()));
    expect(res.status).toBe(200);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://www.sakura-notes.com');
  });

  it('adds no CORS headers when the origin is not on the allowlist', async () => {
    const req = new Request('https://x/health', { headers: { Origin: 'https://evil.example.com' } });
    const res = await worker.fetch(req, makeEnv(fakeKv()));
    expect(res.status).toBe(200);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });
});
