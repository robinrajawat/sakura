/**
 * Sakura hosted AI Worker (docs/ai-hosted-vault-design.md). Two real routes:
 *
 *   GET/POST/DELETE /admin/providers — the admin manages the provider fallback chain
 *   POST /ai/complete                — a signed-in user gets an AI completion, quota-gated
 *
 * Route handlers are exported individually and tested directly with injected dependencies
 * (getKey, fetchImpl) rather than through the router — the router itself (the default export's
 * fetch) is thin dispatch logic, matching this project's core-vs-orchestration split
 * everywhere else. CORS is handled only in the router (corsHeadersFor/withCors below), wrapped
 * around whatever a handler returns, so the handlers themselves stay CORS-agnostic and directly
 * testable. legacy/index.html's admin panel (docs/ai-hosted-vault-design.md) is the one real
 * cross-origin caller today, from https://www.sakura-notes.com (legacy/public/CNAME) — the
 * allowlist below is closed to that plus local dev, same reasoning as legacy/index.html's own
 * CSP connect-src: a fixed, known set of origins is an actual boundary, a wildcard isn't.
 */

import { verifyFirebaseIdToken, isAdmin, firebaseJwks } from './auth';
import { importKek } from './vault';
import { saveProvider, listProviders, deleteProvider, getProviderKey, type ProviderConfig } from './providers';
import { consumeQuota } from './quota';
import { buildAiRequest, parseAiResponse, parseAiErrorMessage, type AiShape } from './providerShapes';
import type { JWTVerifyGetKey } from 'jose';

export interface Env {
  SAKURA_VAULT_KV: KVNamespace;
  FIREBASE_PROJECT_ID: string;
  VAULT_KEK: string;
  ADMIN_UID: string;
  DAILY_AI_QUOTA?: string;
}

const VALID_SHAPES: readonly AiShape[] = ['gemini', 'openai', 'cerebras', 'anthropic'];
const DEFAULT_DAILY_QUOTA = 20;
const ALLOWED_ORIGINS: readonly string[] = ['https://www.sakura-notes.com', 'http://localhost:5173'];

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

/** CORS headers for a given request Origin — empty (no CORS headers at all) for anything not
 * on the allowlist, which is the correct default-deny: the browser then blocks the response
 * from ever reaching the calling page's JS, same as if this Worker had no CORS support. */
export function corsHeadersFor(origin: string | null): Record<string, string> {
  if (!origin || !ALLOWED_ORIGINS.includes(origin)) return {};
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin'
  };
}

/** Wraps an already-built Response with CORS headers for the given origin, preserving its
 * original status/body/other headers. */
function withCors(response: Response, origin: string | null): Response {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(corsHeadersFor(origin))) headers.set(key, value);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

/** Verifies the Authorization header's bearer token, returning the caller's uid — or a
 * ready-to-return 401 Response if the header is missing or the token doesn't verify. Callers
 * check `instanceof Response` to tell the two apart. */
async function requireUid(request: Request, env: Env, getKey: JWTVerifyGetKey): Promise<string | Response> {
  const authHeader = request.headers.get('Authorization') || '';
  const match = /^Bearer (.+)$/.exec(authHeader);
  if (!match) return jsonResponse({ error: 'Missing Authorization header' }, 401);
  try {
    const verified = await verifyFirebaseIdToken(match[1], env.FIREBASE_PROJECT_ID, getKey);
    return verified.uid;
  } catch {
    return jsonResponse({ error: 'Invalid or expired token' }, 401);
  }
}

async function requireAdminUid(request: Request, env: Env, getKey: JWTVerifyGetKey): Promise<string | Response> {
  const uidOrResponse = await requireUid(request, env, getKey);
  if (uidOrResponse instanceof Response) return uidOrResponse;
  if (!isAdmin(uidOrResponse, env.ADMIN_UID)) return jsonResponse({ error: 'Forbidden' }, 403);
  return uidOrResponse;
}

export async function handleAdminProvidersPost(request: Request, env: Env, getKey: JWTVerifyGetKey): Promise<Response> {
  const uidOrResponse = await requireAdminUid(request, env, getKey);
  if (uidOrResponse instanceof Response) return uidOrResponse;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400);
  }
  const b = (body ?? {}) as Record<string, unknown>;
  const { id, baseUrl, shape, model, apiKey } = b;
  const order = typeof b.order === 'number' ? b.order : 0;
  if (
    typeof id !== 'string' ||
    !id ||
    typeof baseUrl !== 'string' ||
    !baseUrl ||
    typeof shape !== 'string' ||
    !VALID_SHAPES.includes(shape as AiShape) ||
    typeof model !== 'string' ||
    !model ||
    typeof apiKey !== 'string' ||
    !apiKey
  ) {
    return jsonResponse(
      { error: 'id, baseUrl, shape (one of gemini/openai/cerebras/anthropic), model, and apiKey are required' },
      400
    );
  }

  const kek = await importKek(env.VAULT_KEK);
  const config: ProviderConfig = { id, baseUrl, shape, model, order };
  await saveProvider(env.SAKURA_VAULT_KV, kek, config, apiKey);
  return jsonResponse({ ok: true });
}

export async function handleAdminProvidersGet(request: Request, env: Env, getKey: JWTVerifyGetKey): Promise<Response> {
  const uidOrResponse = await requireAdminUid(request, env, getKey);
  if (uidOrResponse instanceof Response) return uidOrResponse;

  const configs = await listProviders(env.SAKURA_VAULT_KV);
  // Never return the encrypted key blob either — admin visibility doesn't need it, and there's
  // no reason to widen the response surface even for the one person allowed to see this.
  const providers = configs.map(({ id, baseUrl, shape, model, order }) => ({ id, baseUrl, shape, model, order }));
  return jsonResponse({ providers });
}

export async function handleAdminProvidersDelete(
  request: Request,
  env: Env,
  getKey: JWTVerifyGetKey,
  url: URL
): Promise<Response> {
  const uidOrResponse = await requireAdminUid(request, env, getKey);
  if (uidOrResponse instanceof Response) return uidOrResponse;

  const id = url.searchParams.get('id');
  if (!id) return jsonResponse({ error: 'Missing id query parameter' }, 400);
  await deleteProvider(env.SAKURA_VAULT_KV, id);
  return jsonResponse({ ok: true });
}

export async function handleAiComplete(
  request: Request,
  env: Env,
  getKey: JWTVerifyGetKey,
  fetchImpl: typeof fetch
): Promise<Response> {
  const uidOrResponse = await requireUid(request, env, getKey);
  if (uidOrResponse instanceof Response) return uidOrResponse;
  const uid = uidOrResponse;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400);
  }
  const b = (body ?? {}) as Record<string, unknown>;
  const userContent = typeof b.userContent === 'string' ? b.userContent : '';
  const systemPrompt = typeof b.systemPrompt === 'string' ? b.systemPrompt : '';
  const maxTokens = typeof b.maxTokens === 'number' && b.maxTokens > 0 ? b.maxTokens : 1024;
  if (!userContent.trim()) return jsonResponse({ error: 'userContent is required' }, 400);

  const limit = env.DAILY_AI_QUOTA ? parseInt(env.DAILY_AI_QUOTA, 10) : DEFAULT_DAILY_QUOTA;
  const quota = await consumeQuota(env.SAKURA_VAULT_KV, uid, limit);
  if (!quota.allowed) return jsonResponse({ error: 'Daily AI quota exceeded' }, 429);

  const providers = await listProviders(env.SAKURA_VAULT_KV);
  if (!providers.length) return jsonResponse({ error: 'No AI provider configured' }, 503);

  const kek = await importKek(env.VAULT_KEK);
  const errors: string[] = [];
  for (const provider of providers) {
    const shape = provider.shape as AiShape;
    try {
      const key = await getProviderKey(kek, provider);
      const req = buildAiRequest(shape, provider.baseUrl, key, provider.model, systemPrompt, userContent, maxTokens);
      const res = await fetchImpl(req.url, { method: 'POST', headers: req.headers, body: req.body });
      const data: unknown = await res.json().catch(() => ({}));
      if (!res.ok) {
        errors.push(`${provider.id}: ${parseAiErrorMessage(shape, res.status, data)}`);
        continue;
      }
      const text = parseAiResponse(shape, data);
      if (!text) {
        errors.push(`${provider.id}: empty response`);
        continue;
      }
      return jsonResponse({ text, provider: provider.id });
    } catch (err) {
      errors.push(`${provider.id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return jsonResponse({ error: 'All providers failed', details: errors }, 502);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin');

    // Preflight: the browser sends this before the real request whenever it carries a custom
    // header (Authorization) or isn't a "simple" method — answered here directly, never reaches
    // a handler.
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeadersFor(origin) });
    }

    if (url.pathname === '/health') {
      return withCors(new Response('ok', { status: 200 }), origin);
    }

    const getKey = firebaseJwks();
    let response: Response;

    if (url.pathname === '/admin/providers' && request.method === 'POST') {
      response = await handleAdminProvidersPost(request, env, getKey);
    } else if (url.pathname === '/admin/providers' && request.method === 'GET') {
      response = await handleAdminProvidersGet(request, env, getKey);
    } else if (url.pathname === '/admin/providers' && request.method === 'DELETE') {
      response = await handleAdminProvidersDelete(request, env, getKey, url);
    } else if (url.pathname === '/ai/complete' && request.method === 'POST') {
      response = await handleAiComplete(request, env, getKey, fetch);
    } else {
      response = new Response('not found', { status: 404 });
    }

    return withCors(response, origin);
  }
};
