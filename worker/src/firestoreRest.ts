/**
 * Reading a person's own Sakura data from Firestore for the MCP server (docs/mcp-plan.md), through
 * the REST API with that person's own Firebase sign-in, never admin credentials: the project's
 * owner-only rules (firebase/firestore.rules) decide what can be read, exactly as in the browser.
 *
 * The connection keeps the person's Firebase refresh token (encrypted by the OAuth library inside
 * the grant's props); a short-lived ID token is made from it when needed.
 */

export type FetchLike = typeof fetch;

export class SignInExpiredError extends Error {
  constructor() {
    super('The Sakura sign-in behind this connection has ended. Disconnect it in Sakura (Settings → Account) and connect again.');
  }
}

/** Firestore's typed JSON value → plain JSON. */
export function decodeValue(v: unknown): unknown {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  if ('stringValue' in o) return o.stringValue;
  if ('integerValue' in o) return Number(o.integerValue);
  if ('doubleValue' in o) return Number(o.doubleValue);
  if ('booleanValue' in o) return !!o.booleanValue;
  if ('nullValue' in o) return null;
  if ('timestampValue' in o) return o.timestampValue;
  if ('referenceValue' in o) return o.referenceValue;
  if ('bytesValue' in o) return o.bytesValue;
  if ('geoPointValue' in o) return o.geoPointValue;
  if ('arrayValue' in o) {
    const vals = (o.arrayValue as { values?: unknown[] })?.values;
    return Array.isArray(vals) ? vals.map(decodeValue) : [];
  }
  if ('mapValue' in o) return decodeFields((o.mapValue as { fields?: Record<string, unknown> })?.fields);
  return null;
}

export function decodeFields(fields: Record<string, unknown> | undefined): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fields || {})) out[k] = decodeValue(v);
  return out;
}

interface CachedIdToken { token: string; exp: number; refresh: string }
const idTokenCache = new Map<string, CachedIdToken>();

/**
 * A fresh Firebase ID token for `uid`, made from its refresh token. Checks that the refresh token
 * really is that person's (the token service names its user). Cached in this isolate until shortly
 * before it expires.
 */
export async function idTokenFor(uid: string, refreshToken: string, apiKey: string, fetchImpl: FetchLike, now = Date.now()): Promise<string> {
  const hit = idTokenCache.get(uid);
  if (hit && hit.refresh === refreshToken && hit.exp - 60_000 > now) return hit.token;
  const res = await fetchImpl('https://securetoken.googleapis.com/v1/token?key=' + encodeURIComponent(apiKey), {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Referer: 'https://www.sakura-notes.com/' },
    body: 'grant_type=refresh_token&refresh_token=' + encodeURIComponent(refreshToken)
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const msg = String((data.error as { message?: string } | undefined)?.message || '');
    if (/TOKEN_EXPIRED|USER_DISABLED|USER_NOT_FOUND|INVALID_REFRESH_TOKEN|INVALID_GRANT_TYPE/.test(msg) || res.status === 400) throw new SignInExpiredError();
    throw new Error('Sakura sign-in service unavailable (' + res.status + ')');
  }
  if (data.user_id !== uid || typeof data.id_token !== 'string') throw new SignInExpiredError();
  const exp = now + (Number(data.expires_in) || 3600) * 1000;
  idTokenCache.set(uid, { token: data.id_token, exp, refresh: refreshToken });
  return data.id_token;
}

/** Plain JSON → Firestore's typed JSON value (the inverse of decodeValue). */
export function encodeValue(v: unknown): unknown {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === 'string') return { stringValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(encodeValue) } };
  if (typeof v === 'object') return { mapValue: { fields: encodeFields(v as Record<string, unknown>) } };
  return { nullValue: null };
}
export function encodeFields(o: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) if (v !== undefined) out[k] = encodeValue(v);
  return out;
}

/** Forgets a cached ID token (after a refusal, or when a connection is removed). */
export function forgetIdToken(uid: string): void {
  idTokenCache.delete(uid);
}

export interface FirestoreReader {
  /** One record's fields, or null when it doesn't exist. `path` is under documents/. */
  get(path: string): Promise<Record<string, unknown> | null>;
  /** Every record of a collection, as [id, fields]. Stops after `max`. */
  list(path: string, max: number): Promise<Array<[string, Record<string, unknown>]>>;
  /** Several records at once (one request), only the named top-level fields; missing ones are left out. */
  batchGet(paths: string[], fields: string[]): Promise<Array<[string, Record<string, unknown>]>>;
}

/** Writing, for send_document only: new records in the person's own inbox, and removing them. The
 * project's rules decide what is allowed (copies and notifications sent by oneself, nothing else). */
export interface FirestoreWriter {
  /** A new record in a collection; resolves its id. */
  create(collectionPath: string, fields: Record<string, unknown>): Promise<string>;
  remove(path: string): Promise<void>;
  /** Ids of the records in a collection whose field equals a string. */
  findIds(collectionPath: string, field: string, value: string): Promise<string[]>;
}

export function firestoreReader(projectId: string, idToken: () => Promise<string>, fetchImpl: FetchLike): FirestoreReader {
  const base = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/(default)/documents/`;
  const call = async (url: string) => {
    const res = await fetchImpl(url, { headers: { Authorization: 'Bearer ' + (await idToken()) } });
    if (res.status === 404) return null;
    if (res.status === 401 || res.status === 403) throw new SignInExpiredError();
    if (!res.ok) throw new Error('Sakura storage unavailable (' + res.status + ')');
    return (await res.json()) as Record<string, unknown>;
  };
  const enc = (path: string) => path.split('/').map(encodeURIComponent).join('/');
  const root = `projects/${projectId}/databases/(default)/documents/`;
  return {
    async get(path) {
      const data = await call(base + enc(path));
      return data ? decodeFields(data.fields as Record<string, unknown>) : null;
    },
    async list(path, max) {
      const out: Array<[string, Record<string, unknown>]> = [];
      let pageToken = '';
      do {
        const data = await call(base + enc(path) + '?pageSize=100' + (pageToken ? '&pageToken=' + encodeURIComponent(pageToken) : ''));
        if (!data) break;
        for (const d of (data.documents as Array<{ name: string; fields?: Record<string, unknown> }>) || []) {
          out.push([d.name.slice(d.name.lastIndexOf('/') + 1), decodeFields(d.fields)]);
          if (out.length >= max) return out;
        }
        pageToken = typeof data.nextPageToken === 'string' ? data.nextPageToken : '';
      } while (pageToken);
      return out;
    },
    async batchGet(paths, fields) {
      if (!paths.length) return [];
      const res = await fetchImpl(base.slice(0, -1) + ':batchGet', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + (await idToken()), 'Content-Type': 'application/json' },
        body: JSON.stringify({ documents: paths.map((p) => root + p), mask: { fieldPaths: fields } })
      });
      if (res.status === 401 || res.status === 403) throw new SignInExpiredError();
      if (!res.ok) throw new Error('Sakura storage unavailable (' + res.status + ')');
      const out: Array<[string, Record<string, unknown>]> = [];
      for (const item of (await res.json()) as Array<{ found?: { name: string; fields?: Record<string, unknown> } }>) {
        if (item.found) out.push([item.found.name.slice(item.found.name.lastIndexOf('/') + 1), decodeFields(item.found.fields)]);
      }
      return out;
    }
  };
}

export function firestoreWriter(projectId: string, idToken: () => Promise<string>, fetchImpl: FetchLike): FirestoreWriter {
  const base = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/(default)/documents/`;
  const enc = (path: string) => path.split('/').map(encodeURIComponent).join('/');
  const call = async (url: string, init: RequestInit) => {
    const res = await fetchImpl(url, { ...init, headers: { Authorization: 'Bearer ' + (await idToken()), 'Content-Type': 'application/json' } });
    if (res.status === 401) throw new SignInExpiredError();
    if (!res.ok && res.status !== 404) throw new Error('Sakura storage refused the write (' + res.status + ')');
    return res;
  };
  return {
    async create(collectionPath, fields) {
      const res = await call(base + enc(collectionPath), { method: 'POST', body: JSON.stringify({ fields: encodeFields(fields) }) });
      const data = (await res.json()) as { name?: string };
      return String(data.name || '').split('/').pop() || '';
    },
    async remove(path) {
      await call(base + enc(path), { method: 'DELETE' });
    },
    async findIds(collectionPath, field, value) {
      const i = collectionPath.lastIndexOf('/');
      const parent = collectionPath.slice(0, i), collectionId = collectionPath.slice(i + 1);
      const res = await call(base + enc(parent) + ':runQuery', {
        method: 'POST',
        body: JSON.stringify({ structuredQuery: { from: [{ collectionId }], where: { fieldFilter: { field: { fieldPath: field }, op: 'EQUAL', value: { stringValue: value } } }, limit: 20 } })
      });
      const rows = (await res.json()) as Array<{ document?: { name: string } }>;
      return rows.filter((r) => r.document).map((r) => r.document!.name.split('/').pop() as string);
    }
  };
}
