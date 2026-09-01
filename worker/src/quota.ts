/**
 * Per-UID daily request quota for hosted mode (docs/ai-hosted-vault-design.md's "Cost and
 * abuse control" section) — every request bills the admin's own provider account, so this is
 * the one thing standing between "any signed-in Sakura user" and unmetered spend.
 *
 * Split the same way this project splits everything else: evaluateQuota is the pure
 * allow/deny decision (given a count and a limit), consumeQuota is the thin KV-touching
 * wrapper around it.
 *
 * Concurrency note, stated plainly rather than glossed over: Cloudflare KV has no atomic
 * increment, so consumeQuota's read-then-write has a real (if narrow) race — two requests
 * landing in the same instant could both read the same currentCount and both write count+1,
 * undercounting by one. For a single admin's abuse-mitigation quota (not a financial ledger)
 * that's an acceptable trade against the real complexity of a Durable Object just to close a
 * one-request race under concurrent load this project doesn't expect.
 */

export function quotaKeyFor(uid: string, now: Date = new Date()): string {
  const day = now.toISOString().slice(0, 10); // YYYY-MM-DD, UTC
  return `quota:${uid}:${day}`;
}

export interface QuotaResult {
  allowed: boolean;
  /** Count after this request if allowed; the current (unchanged) count if denied. */
  count: number;
  /** How many requests remain today, clamped to 0. */
  remaining: number;
}

export function evaluateQuota(currentCount: number, limit: number): QuotaResult {
  if (currentCount >= limit) {
    return { allowed: false, count: currentCount, remaining: 0 };
  }
  const count = currentCount + 1;
  return { allowed: true, count, remaining: Math.max(0, limit - count) };
}

/** Minimal subset of Cloudflare's KVNamespace this module needs — real KVNamespace satisfies
 * this structurally, and a plain in-memory object satisfies it in tests without pulling in
 * Miniflare. */
export interface QuotaKV {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
}

// 48h — a safety margin past the UTC day boundary, not load-bearing for correctness (each day
// already gets its own key), just storage hygiene so old entries don't accumulate forever.
const QUOTA_TTL_SECONDS = 172800;

export async function consumeQuota(
  kv: QuotaKV,
  uid: string,
  limit: number,
  now: Date = new Date()
): Promise<QuotaResult> {
  const key = quotaKeyFor(uid, now);
  const raw = await kv.get(key);
  const currentCount = raw ? parseInt(raw, 10) || 0 : 0;
  const result = evaluateQuota(currentCount, limit);
  if (result.allowed) {
    await kv.put(key, String(result.count), { expirationTtl: QUOTA_TTL_SECONDS });
  }
  return result;
}
