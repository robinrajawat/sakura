/**
 * Sakura hosted AI Worker (docs/ai-hosted-vault-design.md). Two real routes:
 *
 *   GET/POST/DELETE /admin/providers — the admin manages the provider fallback chain
 *   POST /ai/complete                — a signed-in user gets an AI completion, quota-gated
 *
 * Route handlers are exported individually and tested directly with injected dependencies
 * (getKey, fetchImpl) rather than through the router — the router itself (the default export's
 * fetch) is thin dispatch logic, matching this project's core-vs-orchestration split
 * everywhere else. CORS is deliberately not handled yet: no client calls this Worker
 * cross-origin until the legacy/ wiring (a separate, later piece) exists to need it.
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

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
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
    if (url.pathname === '/health') {
      return new Response('ok', { status: 200 });
    }

    const getKey = firebaseJwks();

    if (url.pathname === '/admin/providers') {
      if (request.method === 'POST') return handleAdminProvidersPost(request, env, getKey);
      if (request.method === 'GET') return handleAdminProvidersGet(request, env, getKey);
      if (request.method === 'DELETE') return handleAdminProvidersDelete(request, env, getKey, url);
    }
    if (url.pathname === '/ai/complete' && request.method === 'POST') {
      return handleAiComplete(request, env, getKey, fetch);
    }

    return new Response('not found', { status: 404 });
  }
};
