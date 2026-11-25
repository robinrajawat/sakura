/**
 * Sakura hosted AI Worker (docs/ai-hosted-vault-design.md). Real routes:
 *
 *   GET/POST/DELETE /admin/providers — the admin manages the provider fallback chain
 *   GET/POST /admin/config           — the admin tunes the daily AI quota at runtime
 *   POST /ai/complete                — a signed-in user gets an AI completion, quota-gated
 *   POST /pdf                        — a signed-in user turns print-ready HTML into a PDF file (src/pdf.ts)
 *   POST /mcp                        — read-only MCP server for AI assistants (docs/mcp-plan.md, src/mcpServer.ts),
 *                                      behind OAuth 2.1 (@cloudflare/workers-oauth-provider: /register, /token,
 *                                      discovery documents); /authorize and /connections in src/connect.ts
 *
 * Route handlers are exported individually and tested directly with injected dependencies
 * (getKey, fetchImpl) rather than through the router — the router itself (the default export's
 * fetch) is thin dispatch logic, matching this project's core-vs-orchestration split
 * everywhere else. CORS is handled only in the router (corsHeadersFor/withCors below), wrapped
 * around whatever a handler returns, so the handlers themselves stay CORS-agnostic and directly
 * testable. web/index.html's admin panel (docs/ai-hosted-vault-design.md) is the one real
 * cross-origin caller today, from https://www.sakura-notes.com (web/public/CNAME) — the
 * allowlist below is closed to that plus local dev, same reasoning as web/index.html's own
 * CSP connect-src: a fixed, known set of origins is an actual boundary, a wildcard isn't.
 */

import { verifyFirebaseIdToken, isAdmin, firebaseJwks } from './auth';
import { importKek } from './vault';
import { saveProvider, listProviders, deleteProvider, getProviderKey, type ProviderConfig } from './providers';
import { getDailyQuota, setDailyQuota } from './config';
import { consumeQuota } from './quota';
import { buildAiRequest, parseAiResponse, parseAiErrorMessage, type AiShape } from './providerShapes';
import type { JWTVerifyGetKey } from 'jose';
import { handlePdf, browserRenderer, DEFAULT_DAILY_PDF_QUOTA } from './pdf';
import { OAuthProvider, type OAuthHelpers } from '@cloudflare/workers-oauth-provider';
import { handleAuthorizeGet, handleAuthorizePost, handleConnectionsGet, handleConnectionsDelete, MCP_SCOPE, type ConnectionProps } from './connect';
import { handleMcpRequest, SERVER_ICON } from './mcpServer';
import { firestoreReader, firestoreWriter, idTokenFor } from './firestoreRest';
import { INBOX_SCOPE } from './mcpSend';

export interface Env {
  SAKURA_VAULT_KV: KVNamespace;
  FIREBASE_PROJECT_ID: string;
  VAULT_KEK: string;
  ADMIN_UID: string;
  DAILY_AI_QUOTA?: string;
  /** Cloudflare Browser Rendering binding ([browser] in wrangler.toml), used by POST /pdf. */
  BROWSER: Fetcher;
  DAILY_PDF_QUOTA?: string;
  /** Firebase's public web API key (not a secret), to turn a connection's refresh token into an ID token. */
  FIREBASE_API_KEY: string;
  /** The OAuth library's store: clients, grants, hashed tokens (same KV namespace, its own key prefixes). */
  OAUTH_KV: KVNamespace;
  /** Set by OAuthProvider for every request it passes on. */
  OAUTH_PROVIDER: OAuthHelpers;
}

export const MCP_ORIGIN = 'https://ai.sakura-notes.com';

const ICON_PATHS = ['/favicon.ico', '/favicon.png', '/apple-touch-icon.png', '/apple-touch-icon-precomposed.png', '/icon.png'];
const SERVER_HOME = `<!doctype html><meta charset="utf-8"><title>Sakura Notes</title><link rel="icon" type="image/png" sizes="512x512" href="${SERVER_ICON}"><link rel="apple-touch-icon" href="${SERVER_ICON}"><meta name="robots" content="noindex"><p>Sakura Notes server. Open <a href="https://www.sakura-notes.com">www.sakura-notes.com</a>.</p>`;

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
    // The PDF route's download name, readable by the page across origins.
    'Access-Control-Expose-Headers': 'Content-Disposition',
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

export async function handleAdminConfigGet(request: Request, env: Env, getKey: JWTVerifyGetKey): Promise<Response> {
  const uidOrResponse = await requireAdminUid(request, env, getKey);
  if (uidOrResponse instanceof Response) return uidOrResponse;

  const envDefault = env.DAILY_AI_QUOTA ? parseInt(env.DAILY_AI_QUOTA, 10) : DEFAULT_DAILY_QUOTA;
  const dailyQuota = await getDailyQuota(env.SAKURA_VAULT_KV, envDefault);
  return jsonResponse({ dailyQuota });
}

export async function handleAdminConfigPost(request: Request, env: Env, getKey: JWTVerifyGetKey): Promise<Response> {
  const uidOrResponse = await requireAdminUid(request, env, getKey);
  if (uidOrResponse instanceof Response) return uidOrResponse;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400);
  }
  const b = (body ?? {}) as Record<string, unknown>;
  const dailyQuota = b.dailyQuota;
  if (typeof dailyQuota !== 'number' || !Number.isFinite(dailyQuota) || dailyQuota <= 0 || !Number.isInteger(dailyQuota)) {
    return jsonResponse({ error: 'dailyQuota must be a positive integer' }, 400);
  }
  await setDailyQuota(env.SAKURA_VAULT_KV, dailyQuota);
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

  const envDefault = env.DAILY_AI_QUOTA ? parseInt(env.DAILY_AI_QUOTA, 10) : DEFAULT_DAILY_QUOTA;
  const limit = await getDailyQuota(env.SAKURA_VAULT_KV, envDefault);
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

/** Everything that isn't OAuth's own or the MCP endpoint. */
export const router = {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin');

    // Preflight: the browser sends this before the real request whenever it carries a custom
    // header (Authorization) or isn't a "simple" method — answered here directly, never reaches
    // a handler.
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeadersFor(origin) });
    }

    // An assistant (or a favicon service) looking up this address's icon finds the app's tile.
    if (request.method === 'GET' && ICON_PATHS.includes(url.pathname)) {
      return new Response(null, { status: 302, headers: { Location: SERVER_ICON, 'Cache-Control': 'public, max-age=86400' } });
    }
    if (request.method === 'GET' && url.pathname === '/') {
      return new Response(SERVER_HOME, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=3600' } });
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
    } else if (url.pathname === '/admin/config' && request.method === 'GET') {
      response = await handleAdminConfigGet(request, env, getKey);
    } else if (url.pathname === '/admin/config' && request.method === 'POST') {
      response = await handleAdminConfigPost(request, env, getKey);
    } else if (url.pathname === '/ai/complete' && request.method === 'POST') {
      response = await handleAiComplete(request, env, getKey, fetch);
    } else if (url.pathname === '/authorize' && request.method === 'GET') {
      return handleAuthorizeGet(request, env.OAUTH_PROVIDER); // a page for the person, not an API: no CORS
    } else if (url.pathname === '/authorize' && request.method === 'POST') {
      return handleAuthorizePost(request, { oauth: env.OAUTH_PROVIDER, projectId: env.FIREBASE_PROJECT_ID, apiKey: env.FIREBASE_API_KEY, getKey, fetchImpl: fetch });
    } else if (url.pathname === '/connections' && (request.method === 'GET' || request.method === 'DELETE')) {
      const uidOrResponse = await requireUid(request, env, getKey);
      if (uidOrResponse instanceof Response) response = uidOrResponse;
      else if (request.method === 'GET') response = await handleConnectionsGet(uidOrResponse, env.OAUTH_PROVIDER);
      else response = await handleConnectionsDelete(uidOrResponse, env.OAUTH_PROVIDER, url.searchParams.get('id'));
    } else if (url.pathname === '/pdf' && request.method === 'POST') {
      const uidOrResponse = await requireUid(request, env, getKey);
      if (uidOrResponse instanceof Response) response = uidOrResponse;
      else {
        const limit = parseInt(env.DAILY_PDF_QUOTA || '', 10) || DEFAULT_DAILY_PDF_QUOTA;
        response = await handlePdf(request, uidOrResponse, env.SAKURA_VAULT_KV, limit, browserRenderer(env.BROWSER));
      }
    } else {
      response = new Response('not found', { status: 404 });
    }

    return withCors(response, origin);
  }
};

/** POST /mcp, reached only with a valid access token; ctx.props is the connection's. */
export const mcpApiHandler = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext & { props?: unknown; auth?: { scope: string[] } }): Promise<Response> {
    const props = ctx.props as ConnectionProps | undefined;
    if (!props || typeof props.uid !== 'string' || typeof props.refreshToken !== 'string') return new Response('Unauthorized', { status: 401 });
    if (ctx.auth && !ctx.auth.scope.includes(MCP_SCOPE)) return new Response('Forbidden', { status: 403 });
    const idToken = () => idTokenFor(props.uid, props.refreshToken, env.FIREBASE_API_KEY, fetch);
    const db = firestoreReader(env.FIREBASE_PROJECT_ID, idToken, fetch);
    const scopes = ctx.auth ? ctx.auth.scope : [MCP_SCOPE];
    // The writer is only used by send_document, which checks the inbox:write scope before writing.
    return handleMcpRequest(request, props.uid, db, { scopes, write: firestoreWriter(env.FIREBASE_PROJECT_ID, idToken, fetch) });
  }
};

const DAY_SECONDS = 24 * 60 * 60;

export default new OAuthProvider<Env>({
  apiRoute: '/mcp',
  apiHandler: mcpApiHandler,
  defaultHandler: router,
  authorizeEndpoint: '/authorize',
  tokenEndpoint: '/token',
  clientRegistrationEndpoint: '/register',
  scopesSupported: [MCP_SCOPE, INBOX_SCOPE],
  requiredScopes: [MCP_SCOPE],
  resourceMetadata: { resource: MCP_ORIGIN + '/mcp', authorization_servers: [MCP_ORIGIN], resource_name: 'Sakura Notes' },
  // A connection lasts while it's used: it ends after 30 days without use, and after 180 days at most.
  refreshTokenTTL: 180 * DAY_SECONDS,
  refreshTokenIdleTTL: 30 * DAY_SECONDS,
  clientIdMetadataDocumentEnabled: true
});
