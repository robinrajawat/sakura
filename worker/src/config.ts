/**
 * Small KV-backed admin config store (docs/ai-hosted-vault-design.md) — currently just the
 * daily AI quota. Lets the admin tune it at runtime via POST /admin/config instead of editing
 * wrangler.toml's DAILY_AI_QUOTA var and redeploying. Not encrypted — nothing sensitive here,
 * unlike providers.ts/userVault.ts's API keys, just a plain KV value.
 */

export interface ConfigKV {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
}

const DAILY_QUOTA_KEY = 'config:dailyAiQuota';

/** The admin-configured daily quota from KV, or `fallback` (the wrangler.toml var, or the
 * hardcoded default beneath that) if nothing's been explicitly set yet. */
export async function getDailyQuota(kv: ConfigKV, fallback: number): Promise<number> {
  const raw = await kv.get(DAILY_QUOTA_KEY);
  const parsed = raw === null ? NaN : parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export async function setDailyQuota(kv: ConfigKV, value: number): Promise<void> {
  await kv.put(DAILY_QUOTA_KEY, String(value));
}
