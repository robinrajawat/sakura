/**
 * AI provider fallback chain — §6.9 slice 9 (docs/phase6-full-parity-plan.md). Direct port of
 * legacy's real `aiFallbackEnabled`/`aiFallbackOrder`/`ensureFallbackOrder`/
 * `loadAiFallbackPrefs`/`saveAiFallbackPrefs`/`getEffectiveFallbackChain` (legacy/index.html:
 * 8900-8978): when a call to the primary provider fails with a rate-limit or other fallbackable
 * error, this is the ordered, per-row-enable list of other providers `aiCall.ts`'s
 * `callAiByShapeWithFallback` tries next.
 *
 * Uses the SAME storage key as legacy (`sakura_ai_fallback_v1`, not a `_web_`-namespaced variant)
 * — same "AI settings are literal shared state with legacy" precedent `aiUsage.ts`/
 * `aiProviders.ts`/`vault.ts` already establish.
 *
 * Deliberately pure/store-agnostic (no `useAiSettingsStore` import): `aiSettingsStore.ts` already
 * imports `aiCall.ts` (for `testKeyForProvider`), and `aiCall.ts` needs this module's
 * `getEffectiveFallbackChainCore` for its own `callAiByShapeWithFallback` — importing
 * `aiSettingsStore.ts` from here would complete a cycle. Key/model lookup is injected instead
 * (`getKey`/`modelByProvider` params), matching `templatesIndex.ts`'s own established
 * dependency-injection convention for a leaf module that still needs caller-owned state.
 */

import { getAllAiProviders, defaultModelForProvider, extraHeadersForProvider, type AiProviderShape } from './aiProviderCatalog';

export interface AiFallbackEntry {
  id: string;
  enabled: boolean;
}

export interface AiFallbackPrefs {
  enabled: boolean;
  order: AiFallbackEntry[];
}

const AI_FALLBACK_STORAGE_KEY = 'sakura_ai_fallback_v1';

/** Matches legacy's real default-enabled set (index.html:8906) verbatim. */
const DEFAULT_ENABLED_PROVIDER_IDS = new Set(['groq', 'gemini', 'seed_cerebras', 'seed_openrouter']);

/** Matches legacy's real recommended priority order for fresh installs (index.html:8909)
 * verbatim. */
const FALLBACK_PRIORITY_ORDER = ['groq', 'gemini', 'seed_cerebras', 'seed_openrouter', 'claude', 'openai', 'seed_github_models'];

function ls(): Storage | null {
  return typeof localStorage !== 'undefined' ? localStorage : null;
}

/** Pure: matches legacy's real `ensureFallbackOrder` exactly — any built-in provider not already
 * in `order` (a fresh install, or a provider added to the catalog after the person's prefs were
 * last saved) gets appended, in `FALLBACK_PRIORITY_ORDER` order, defaulting to enabled only for
 * the providers legacy's own real default set names. Returns `order` unchanged (same reference)
 * when nothing needs adding. */
export function ensureFallbackOrderCore(order: AiFallbackEntry[], allProviderIds: string[]): AiFallbackEntry[] {
  const inOrder = new Set(order.map((e) => e.id));
  const toAdd = allProviderIds.filter((id) => !inOrder.has(id));
  if (!toAdd.length) return order;
  toAdd.sort((a, b) => {
    const ai = FALLBACK_PRIORITY_ORDER.indexOf(a);
    const bi = FALLBACK_PRIORITY_ORDER.indexOf(b);
    return (ai < 0 ? 999 : ai) - (bi < 0 ? 999 : bi);
  });
  return [...order, ...toAdd.map((id) => ({ id, enabled: DEFAULT_ENABLED_PROVIDER_IDS.has(id) }))];
}

/** Pure: matches legacy's real `loadAiFallbackPrefs` parse — never throws, a corrupt/missing
 * value behaves the same as fallback being off with an empty order (before `ensureFallbackOrderCore`
 * fills it in). */
export function parseAiFallbackPrefsCore(raw: string | null, allProviderIds: string[]): AiFallbackPrefs {
  let enabled = false;
  let order: AiFallbackEntry[] = [];
  try {
    const d: unknown = raw ? JSON.parse(raw) : {};
    if (d && typeof d === 'object') {
      enabled = !!(d as { enabled?: unknown }).enabled;
      const rawOrder = (d as { order?: unknown }).order;
      order = Array.isArray(rawOrder) ? (rawOrder as AiFallbackEntry[]) : [];
    }
  } catch {
    enabled = false;
    order = [];
  }
  return { enabled, order: ensureFallbackOrderCore(order, allProviderIds) };
}

export function loadAiFallbackPrefs(): AiFallbackPrefs {
  const raw = ls()?.getItem(AI_FALLBACK_STORAGE_KEY) ?? null;
  return parseAiFallbackPrefsCore(
    raw,
    getAllAiProviders().map((p) => p.id)
  );
}

export function saveAiFallbackPrefs(prefs: AiFallbackPrefs): void {
  try {
    ls()?.setItem(AI_FALLBACK_STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // Storage full/unavailable -- best-effort, matches legacy's own silent-swallow behavior.
  }
}

/** A fallback candidate, fully self-sufficient for a `callAiByShape` call — resolved once here
 * (provider shape/baseUrl/extraHeaders) rather than re-derived inside `aiCall.ts`'s fallback loop,
 * keeping that loop free of any per-provider-quirk knowledge. */
export interface FallbackCandidate {
  providerId: string;
  label: string;
  shape: AiProviderShape;
  baseUrl: string;
  model: string;
  apiKey: string;
  extraHeaders?: Record<string, string>;
}

/** Pure: matches legacy's real `getEffectiveFallbackChain` exactly — empty when fallback is off;
 * otherwise every enabled, non-primary entry that resolves to a real provider with a saved key
 * and an available model, in order, skipping (not erroring on) any entry that doesn't. `getKey`
 * and `modelByProvider` are injected (see this file's own header for why). */
export function getEffectiveFallbackChainCore(
  prefs: AiFallbackPrefs,
  currentProviderId: string,
  getKey: (providerId: string) => string,
  modelByProvider: Record<string, string>
): FallbackCandidate[] {
  if (!prefs.enabled) return [];
  const all = getAllAiProviders();
  const chain: FallbackCandidate[] = [];
  for (const entry of prefs.order) {
    if (!entry.enabled || entry.id === currentProviderId) continue;
    const provider = all.find((p) => p.id === entry.id);
    if (!provider) continue;
    const apiKey = getKey(entry.id);
    if (!apiKey) continue;
    const model = modelByProvider[entry.id] || defaultModelForProvider(entry.id);
    if (!model) continue;
    chain.push({
      providerId: provider.id,
      label: provider.label,
      shape: provider.shape,
      baseUrl: provider.baseUrl,
      model,
      apiKey,
      extraHeaders: extraHeadersForProvider(provider.id)
    });
  }
  return chain;
}

/** Pure: matches legacy's real drag-and-drop reorder (`aiFallbackOrder.splice`, index.html:
 * 29584-29586) exactly, including its own real quirk: `targetId`'s index is captured ONCE before
 * either splice, then reused directly as the insert index on the already-shortened array — so
 * dragging an entry forward (past `targetId`) lands it immediately AFTER `targetId`, not before
 * (removing the dragged entry shifts every later index down by one first). A no-op (returns
 * `order` unchanged) for an unknown id on either side. */
export function reorderFallbackEntryCore(order: AiFallbackEntry[], draggedId: string, targetId: string): AiFallbackEntry[] {
  const si = order.findIndex((e) => e.id === draggedId);
  const ti = order.findIndex((e) => e.id === targetId);
  if (si < 0 || ti < 0) return order;
  const next = [...order];
  const [moved] = next.splice(si, 1);
  next.splice(ti, 0, moved);
  return next;
}
