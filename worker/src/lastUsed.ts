/**
 * When each assistant connection was last used (owner 2026-11-25): Settings shows "last used 3 days
 * ago", so a connection whose connector was deleted in the assistant stands out. Assistants seldom
 * tell the server they removed a connector (OAuth token revocation is optional), so the connection
 * stays listed until it is disconnected in Sakura or ends after 30 days unused.
 *
 * Kept per person and assistant (`mcpused:{uid}:{clientId}`) in the Worker's KV, written at most once
 * an hour per connection and isolate, so it stays far inside the free plan's daily KV writes; each
 * record expires after 31 days, past the 30-day unused limit. Only a time is stored, never content.
 */

export interface LastUsedKV {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
  delete(key: string): Promise<void>;
}

const HOUR = 60 * 60 * 1000;
const KEEP_SECONDS = 31 * 24 * 60 * 60;
const recentlyWritten = new Map<string, number>();

export const lastUsedKey = (uid: string, clientId: string) => `mcpused:${uid}:${clientId}`;

/** Notes a use, unless this isolate noted one for the same connection within the hour. */
export async function noteUsed(kv: LastUsedKV, uid: string, clientId: string, now = Date.now()): Promise<void> {
  const key = lastUsedKey(uid, clientId);
  const last = recentlyWritten.get(key);
  if (last !== undefined && now - last < HOUR) return;
  recentlyWritten.set(key, now);
  await kv.put(key, String(now), { expirationTtl: KEEP_SECONDS });
}

/** When a connection was last used, or null when not yet (or more than 31 days ago). */
export async function lastUsed(kv: LastUsedKV, uid: string, clientId: string): Promise<number | null> {
  const v = Number(await kv.get(lastUsedKey(uid, clientId)));
  return Number.isFinite(v) && v > 0 ? v : null;
}

export async function forgetUsed(kv: LastUsedKV, uid: string, clientId: string): Promise<void> {
  recentlyWritten.delete(lastUsedKey(uid, clientId));
  await kv.delete(lastUsedKey(uid, clientId));
}
