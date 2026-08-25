/**
 * AI usage tracking — §6.9 slice 9 (docs/phase6-full-parity-plan.md). Direct port of legacy's
 * real usage counters (legacy/index.html:8919-8968): a local, best-effort per-provider count of
 * today's requests and failures. Resets on the local calendar day — a deliberate simplification
 * matching legacy's own real behavior exactly (legacy's own comment: providers reset RPD at
 * their own clock, e.g. Gemini at midnight Pacific, so this can be briefly out of sync with the
 * provider's own quota window near a day boundary — it exists to answer "roughly how much have I
 * used today", not to be an authoritative quota meter).
 *
 * Uses the SAME storage key as legacy (`sakura_ai_usage_v1`, not a `_web_`-namespaced variant) —
 * matches `aiProviders.ts`/`vault.ts`'s own precedent of AI settings being literal shared state
 * between legacy and `web/`, unlike documents/templates/folders, which are deliberately
 * namespaced separately since those are fundamentally different data models between the two apps.
 */

export interface AiUsageEntry {
  date: string;
  count: number;
  fails: number;
  lastTs?: number;
  lastOk?: boolean;
  lastNote?: string;
}

export type AiUsageMap = Record<string, AiUsageEntry>;

const AI_USAGE_STORAGE_KEY = 'sakura_ai_usage_v1';

function ls(): Storage | null {
  return typeof localStorage !== 'undefined' ? localStorage : null;
}

/** Pure: matches legacy's real `todayStr` exactly — local calendar date, not UTC. */
export function todayStrCore(now: Date): string {
  return now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
}

/** Pure: matches legacy's real `loadAiUsage` parse — never throws, an empty/corrupt/non-object
 * value behaves the same as no usage recorded at all. */
export function parseAiUsageCore(raw: string | null): AiUsageMap {
  try {
    const d: unknown = raw ? JSON.parse(raw) : {};
    return d && typeof d === 'object' ? (d as AiUsageMap) : {};
  } catch {
    return {};
  }
}

/** Pure: matches legacy's real `recordAiUsage` exactly — a same-day entry increments in place, a
 * stale (or missing) entry resets to a fresh `{date, count:0, fails:0}` first. Returns a new map
 * (doesn't mutate `usage`), matching this project's own established pure-core convention. */
export function recordAiUsageCore(usage: AiUsageMap, providerId: string, ok: boolean, note: string | undefined, now: Date): AiUsageMap {
  const today = todayStrCore(now);
  const existing = usage[providerId];
  const base: AiUsageEntry = existing && existing.date === today ? existing : { date: today, count: 0, fails: 0 };
  const next: AiUsageEntry = {
    ...base,
    count: base.count + 1,
    fails: ok ? base.fails : (base.fails || 0) + 1,
    lastTs: now.getTime(),
    lastOk: ok,
    lastNote: (note || '').slice(0, 200)
  };
  return { ...usage, [providerId]: next };
}

/** Pure: matches legacy's real `getAiUsageForProvider` exactly — a stale (different-day) or
 * missing entry reads back as all-zero/empty, never a leftover count from a previous day. */
export function getAiUsageForProviderCore(usage: AiUsageMap, providerId: string, now: Date): AiUsageEntry {
  const e = usage[providerId];
  if (!e || e.date !== todayStrCore(now)) return { date: todayStrCore(now), count: 0, fails: 0 };
  return e;
}

/** Pure: matches legacy's real `formatAgo` exactly — coarse relative time, rounding up through
 * seconds/minutes/hours/days. */
export function formatAgoCore(ts: number | null | undefined, now: number): string {
  if (!ts) return '';
  const s = Math.max(0, Math.round((now - ts) / 1000));
  if (s < 60) return s + 's ago';
  const m = Math.round(s / 60);
  if (m < 60) return m + 'm ago';
  const h = Math.round(m / 60);
  if (h < 24) return h + 'h ago';
  return Math.round(h / 24) + 'd ago';
}

function loadAiUsage(): AiUsageMap {
  return parseAiUsageCore(ls()?.getItem(AI_USAGE_STORAGE_KEY) ?? null);
}

function saveAiUsage(usage: AiUsageMap): void {
  try {
    ls()?.setItem(AI_USAGE_STORAGE_KEY, JSON.stringify(usage));
  } catch {
    // Storage full/unavailable -- best-effort, matches legacy's own silent-swallow behavior.
  }
}

/** Matches legacy's real `recordAiUsage` storage wrapper — every real AI call (primary and every
 * fallback attempt) records here via `aiCall.ts`'s `callAiByShapeWithFallback`. */
export function recordAiUsage(providerId: string, ok: boolean, note?: string): void {
  if (!providerId) return;
  saveAiUsage(recordAiUsageCore(loadAiUsage(), providerId, ok, note, new Date()));
}

/** Matches legacy's real `getAiUsageForProvider` storage wrapper. */
export function getAiUsageForProvider(providerId: string): AiUsageEntry {
  return getAiUsageForProviderCore(loadAiUsage(), providerId, new Date());
}
