/**
 * AI provider preferences storage — the localStorage-backed prefs blob (selected provider,
 * per-provider model choice, custom rewrite prompt) that the AI settings panel reads on
 * startup and writes on every change.
 *
 * Phase 3 (docs/architecture-plan.md) — second feature-domain slice, same
 * dependency-injected generator pipeline as templatesIndex.ts. Scope was narrowed during
 * investigation: getAllAiProviders()/getAiProviderById() (index.html) are trivial one-line
 * ambient lookups over the AI_BUILTIN_PROVIDERS const with no real logic to test, so they
 * stay hand-written — extracting them would add generator overhead for zero bug-surface
 * reduction. This module owns only the genuinely testable part: parsing/validating/merging
 * the stored prefs JSON.
 *
 * Explicitly NOT extracted here, and why:
 * - syncAiProviderOptions/syncAiModelOptions/updateAiKeyStatus — DOM construction and
 *   `el(...)` reads, stays hand-written, same reasoning as renderNotifList staying out of
 *   notifications.ts.
 * - getAllAiProviders/getAiProviderById — trivial ambient one-liners, not worth the
 *   generator/test overhead (see header above).
 * - AI_CURATED_MODELS-driven model-list rendering — pure DOM building, no storage involved.
 *
 * Deliberately no module-level constant for the storage key string (AI_PREFS_KEY):
 * index.html already declares this as a top-level `const`, still read directly by sibling AI
 * functions that remain hand-written. Since every generated block shares one script scope
 * with the rest of index.html, redeclaring the same name here would be a duplicate `const` —
 * a hard SyntaxError. The literal value is inlined below instead, with this comment as the
 * single place documenting that it must stay in sync with index.html's own copy if it ever
 * changes.
 */

export interface AiPrefsState {
  provider: string;
  model: string;
  modelByProvider: Record<string, string>;
  prompt: string;
}

export interface AiProvidersDeps {
  getLocalStorage: () => Storage | null;
}

// Private to this module (deliberately NOT the same name as index.html's own top-level
// AI_PREFS_KEY — see this file's header comment for why they can't be shared).
const _AI_PREFS_STORAGE_KEY = 'sakura_ai_prefs_v1';

let aiProvDeps: AiProvidersDeps | null = null;

/** Called once to provide real (or fake, in tests) dependencies before any other function here is used. */
export function initAiProvidersState(injected: AiProvidersDeps): void {
  aiProvDeps = injected;
}

function requireAiProvDeps(): AiProvidersDeps {
  if (!aiProvDeps) throw new Error('aiProviders state used before initAiProvidersState() was called');
  return aiProvDeps;
}

/** Pure: given a raw stored-prefs JSON string (or null), the current in-memory state, and the
 * list of currently-valid provider ids, computes the next state exactly the way the original
 * loadAiPrefs's inline logic did — an unknown/stale stored provider id is ignored (falls back
 * to whatever `current.provider` already was) rather than clamped to a default. */
export function computeLoadedAiPrefs(
  raw: string | null,
  current: AiPrefsState,
  validProviderIds: string[]
): AiPrefsState {
  let d: Record<string, unknown> = {};
  try {
    d = raw ? JSON.parse(raw) : {};
  } catch {
    d = {};
  }

  let provider = current.provider;
  let modelByProvider = current.modelByProvider;
  let model = current.model;
  let prompt = current.prompt;

  if (typeof d.provider === 'string' && validProviderIds.includes(d.provider)) {
    provider = d.provider;
  }
  if (d.modelByProvider && typeof d.modelByProvider === 'object') {
    modelByProvider = { ...(d.modelByProvider as Record<string, string>) };
  }
  if (typeof d.model === 'string' && d.model) {
    model = d.model;
  }
  if (modelByProvider[provider]) {
    model = modelByProvider[provider];
  }
  if (typeof d.prompt === 'string' && d.prompt) {
    prompt = d.prompt;
  }

  return { provider, model, modelByProvider, prompt };
}

/** Reads the stored prefs blob and computes the resolved state, never throwing — a missing or
 * corrupt localStorage entry behaves the same as an empty prefs blob (returns `current`
 * unchanged, mirroring the original's try/catch-everything behavior). */
export function loadAiPrefsCore(current: AiPrefsState, validProviderIds: string[]): AiPrefsState {
  try {
    const ls = requireAiProvDeps().getLocalStorage();
    const raw = ls ? ls.getItem(_AI_PREFS_STORAGE_KEY) : null;
    return computeLoadedAiPrefs(raw, current, validProviderIds);
  } catch {
    return current;
  }
}

/** Writes the prefs blob, preserving any other fields already present in storage (matching
 * the original's read-modify-write). Mutates `modelByProvider` in place by stamping the
 * current provider's model into it — this is the same real side effect the original
 * `saveAiPrefs` had (`aiModelByProvider[aiProvider]=aiModel` against the ambient global
 * object), preserved here deliberately rather than cloned, so the caller's own
 * `aiModelByProvider` object stays in sync without a separate reassignment. Never throws —
 * a failed localStorage write (e.g. quota exceeded, private browsing) is silently a no-op,
 * matching the original. */
export function saveAiPrefsCore(
  provider: string,
  model: string,
  modelByProvider: Record<string, string>,
  prompt: string
): void {
  try {
    const ls = requireAiProvDeps().getLocalStorage();
    const raw = ls ? ls.getItem(_AI_PREFS_STORAGE_KEY) : null;
    const d: Record<string, unknown> = raw ? JSON.parse(raw) : {};
    d.provider = provider;
    d.model = model;
    modelByProvider[provider] = model;
    d.modelByProvider = modelByProvider;
    d.prompt = prompt;
    if (ls) ls.setItem(_AI_PREFS_STORAGE_KEY, JSON.stringify(d));
  } catch {
    // Original swallowed localStorage read/write failures — preserved exactly.
  }
}
