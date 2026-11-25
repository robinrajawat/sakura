/**
 * Connecting an AI assistant to a person's Sakura account (docs/mcp-plan.md).
 *
 *   GET  /authorize   an assistant asks for access. The request is checked and held by the OAuth
 *                     library (a browser-bound handle, ten minutes); the person is sent to
 *                     www.sakura-notes.com/connect.html, where they are already signed in, to allow
 *                     or decline it.
 *   POST /authorize   that page's answer, as a top-level form post (same site, so the library's
 *                     browser-binding cookie comes with it). On Allow it carries the person's Firebase
 *                     ID token (who they are) and refresh token (how the server reads as them later).
 *   GET  /connections the person's connected assistants, for Settings (Firebase ID token).
 *   DELETE /connections?id=…  disconnects one at once: its tokens and stored sign-in are deleted.
 *
 * The refresh token is kept only inside the connection's props, which the library stores encrypted
 * with a key only the assistant's token can unwrap.
 */

import { AuthorizationError, CimdFetchError, type OAuthHelpers } from '@cloudflare/workers-oauth-provider';
import type { JWTVerifyGetKey } from 'jose';
import { verifyFirebaseIdToken } from './auth';
import { idTokenFor, forgetIdToken, SignInExpiredError, type FetchLike } from './firestoreRest';
import { INBOX_SCOPE } from './mcpSend';
import { lastUsed, forgetUsed, type LastUsedKV } from './lastUsed';

export const CONNECT_PAGE = 'https://www.sakura-notes.com/connect.html';
export const MCP_SCOPE = 'notes:read';

export interface ConnectionProps {
  uid: string;
  refreshToken: string;
}

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

function plainPage(message: string, status = 400): Response {
  return new Response(
    `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Sakura Notes</title><body style="font:16px system-ui;max-width:32em;margin:3em auto;padding:0 16px"><h1 style="font-size:1.2em">Sakura Notes</h1><p>${escapeHtml(message)}</p></body>`,
    { status, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'" } }
  );
}

function handleAuthError(error: unknown): Response {
  if (error instanceof AuthorizationError && error.redirectTo) return Response.redirect(error.redirectTo, 302);
  if (error instanceof AuthorizationError) return plainPage(error.description + ' Start connecting again from your assistant.');
  if (error instanceof CimdFetchError) return plainPage('This assistant could not be verified. Start connecting again from your assistant.');
  throw error;
}

/** GET /authorize: holds the request and sends the person to the consent page with what it shows. */
export async function handleAuthorizeGet(request: Request, oauth: OAuthHelpers): Promise<Response> {
  try {
    const authRequest = await oauth.parseAuthRequest(request);
    const details = await oauth.describeConsent(authRequest);
    const consent = await oauth.beginConsent(authRequest);
    // In the fragment: never sent to a server, never in a log.
    const q = new URLSearchParams({
      handle: consent.handle,
      client: details.clientName,
      domain: details.clientDomain || '',
      to: details.redirectHost,
      local: details.redirectIsLoopback ? '1' : ''
    });
    consent.headers.set('Location', CONNECT_PAGE + '#' + q.toString());
    return new Response(null, { status: 302, headers: consent.headers });
  } catch (error) {
    return handleAuthError(error);
  }
}

export interface AuthorizeDeps {
  oauth: OAuthHelpers;
  projectId: string;
  apiKey: string;
  getKey: JWTVerifyGetKey;
  fetchImpl: FetchLike;
}

/** POST /authorize: the consent page's Allow or Decline. */
export async function handleAuthorizePost(request: Request, deps: AuthorizeDeps): Promise<Response> {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return plainPage('Something went wrong. Start connecting again from your assistant.');
  }
  const handle = String(form.get('handle') || '');
  try {
    if (form.get('decision') !== 'allow') {
      const denied = await deps.oauth.denyConsent(request, handle);
      denied.headers.set('Location', denied.redirectTo);
      return new Response(null, { status: 302, headers: denied.headers });
    }
    const idToken = String(form.get('idToken') || '');
    const refreshToken = String(form.get('refreshToken') || '');
    const notConfirmed = () => plainPage('Your Sakura sign-in could not be confirmed. Sign in to Sakura again, then connect again from your assistant.', 401);
    let uid: string;
    try {
      uid = (await verifyFirebaseIdToken(idToken, deps.projectId, deps.getKey)).uid;
    } catch {
      return notConfirmed();
    }
    try {
      // The refresh token must be this same person's: the token service says whose it is.
      forgetIdToken(uid);
      await idTokenFor(uid, refreshToken, deps.apiKey, deps.fetchImpl);
    } catch (e) {
      if (e instanceof SignInExpiredError) return notConfirmed();
      throw e;
    }
    // Reading is always granted; sending drafts to the inbox only when the person ticked it.
    const scope = form.get('send') === '1' ? [MCP_SCOPE, INBOX_SCOPE] : [MCP_SCOPE];
    const approved = await deps.oauth.approveConsent(request, handle, { scope });
    const client = await deps.oauth.lookupClient(approved.request.clientId);
    const props: ConnectionProps = { uid, refreshToken };
    const { redirectTo } = await deps.oauth.completeAuthorization({
      request: approved.request,
      userId: uid,
      metadata: { name: client?.clientName || 'AI assistant', connectedAt: Date.now() },
      scope,
      props
    });
    approved.headers.set('Location', redirectTo);
    return new Response(null, { status: 302, headers: approved.headers });
  } catch (error) {
    return handleAuthError(error);
  }
}

/** GET /connections: this person's connected assistants (no tokens, nothing secret). */
export async function handleConnectionsGet(uid: string, oauth: OAuthHelpers, kv: LastUsedKV): Promise<Response> {
  const items: Array<{ id: string; name: string; connectedAt: number; canSend: boolean; lastUsedAt: number | null; clientId: string }> = [];
  let cursor: string | undefined;
  do {
    const page = await oauth.listUserGrants(uid, { limit: 100, cursor });
    for (const g of page.items) {
      const meta = (g.metadata && typeof g.metadata === 'object' ? g.metadata : {}) as Record<string, unknown>;
      items.push({ id: g.id, name: typeof meta.name === 'string' ? meta.name : 'AI assistant', connectedAt: Number(meta.connectedAt) || g.createdAt, canSend: Array.isArray(g.scope) && g.scope.includes(INBOX_SCOPE), lastUsedAt: null, clientId: g.clientId });
    }
    cursor = page.cursor;
  } while (cursor);
  await Promise.all(items.map(async (it) => { it.lastUsedAt = await lastUsed(kv, uid, it.clientId); }));
  items.sort((a, b) => b.connectedAt - a.connectedAt);
  return Response.json({ connections: items.map(({ clientId: _c, ...rest }) => rest) });
}

/** DELETE /connections?id=…: disconnects one assistant at once. */
export async function handleConnectionsDelete(uid: string, oauth: OAuthHelpers, id: string | null, kv: LastUsedKV): Promise<Response> {
  if (!id) return Response.json({ error: 'Missing id query parameter' }, { status: 400 });
  // Its last-use record goes with it (found by the assistant it was for).
  let clientId = '';
  let cursor: string | undefined;
  do {
    const page = await oauth.listUserGrants(uid, { limit: 100, cursor });
    clientId = page.items.find((g) => g.id === id)?.clientId || clientId;
    cursor = clientId ? undefined : page.cursor;
  } while (cursor);
  await oauth.revokeGrant(id, uid);
  if (clientId) await forgetUsed(kv, uid, clientId);
  forgetIdToken(uid);
  return Response.json({ ok: true });
}
