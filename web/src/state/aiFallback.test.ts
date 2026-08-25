import { describe, expect, it, beforeEach } from 'vitest';
import {
  ensureFallbackOrderCore,
  parseAiFallbackPrefsCore,
  getEffectiveFallbackChainCore,
  reorderFallbackEntryCore,
  loadAiFallbackPrefs,
  saveAiFallbackPrefs,
  type AiFallbackPrefs
} from './aiFallback';
import { getAllAiProviders, defaultModelForProvider } from './aiProviderCatalog';

const ALL_IDS = getAllAiProviders().map((p) => p.id);

describe('ensureFallbackOrderCore (pure)', () => {
  it('appends every missing provider, defaulting enabled per the real default set', () => {
    const order = ensureFallbackOrderCore([], ALL_IDS);
    expect(order.map((e) => e.id).sort()).toEqual([...ALL_IDS].sort());
    const byId = Object.fromEntries(order.map((e) => [e.id, e.enabled]));
    expect(byId.groq).toBe(true);
    expect(byId.gemini).toBe(true);
    expect(byId.seed_cerebras).toBe(true);
    expect(byId.seed_openrouter).toBe(true);
    expect(byId.claude).toBe(false);
    expect(byId.openai).toBe(false);
    expect(byId.seed_github_models).toBe(false);
  });

  it('orders newly-added entries by the real priority order', () => {
    const order = ensureFallbackOrderCore([], ALL_IDS);
    expect(order.map((e) => e.id)).toEqual(['groq', 'gemini', 'seed_cerebras', 'seed_openrouter', 'claude', 'openai', 'seed_github_models']);
  });

  it('returns the same reference when nothing needs adding', () => {
    const order = ensureFallbackOrderCore([], ALL_IDS);
    expect(ensureFallbackOrderCore(order, ALL_IDS)).toBe(order);
  });

  it('preserves existing entries and only appends what is missing', () => {
    const existing = [{ id: 'gemini', enabled: true }];
    const order = ensureFallbackOrderCore(existing, ALL_IDS);
    expect(order[0]).toEqual({ id: 'gemini', enabled: true });
    expect(order.length).toBe(ALL_IDS.length);
  });
});

describe('parseAiFallbackPrefsCore (pure)', () => {
  it('parses a valid prefs blob', () => {
    const prefs = parseAiFallbackPrefsCore('{"enabled":true,"order":[{"id":"gemini","enabled":true}]}', ['gemini']);
    expect(prefs.enabled).toBe(true);
    expect(prefs.order).toEqual([{ id: 'gemini', enabled: true }]);
  });
  it('defaults to disabled with an ensured order for null input', () => {
    const prefs = parseAiFallbackPrefsCore(null, ['gemini', 'groq']);
    expect(prefs.enabled).toBe(false);
    expect(prefs.order.map((e) => e.id).sort()).toEqual(['gemini', 'groq']);
  });
  it('defaults cleanly for corrupt JSON', () => {
    const prefs = parseAiFallbackPrefsCore('{not json', ['gemini']);
    expect(prefs.enabled).toBe(false);
    expect(prefs.order.map((e) => e.id)).toEqual(['gemini']);
  });
});

describe('getEffectiveFallbackChainCore (pure)', () => {
  const prefsEnabled: AiFallbackPrefs = {
    enabled: true,
    order: [
      { id: 'gemini', enabled: true },
      { id: 'groq', enabled: true },
      { id: 'claude', enabled: false },
      { id: 'openai', enabled: true }
    ]
  };

  it('returns [] when fallback is disabled', () => {
    const chain = getEffectiveFallbackChainCore({ enabled: false, order: prefsEnabled.order }, 'gemini', () => 'key', {});
    expect(chain).toEqual([]);
  });

  it('excludes the current/primary provider even if enabled in the order', () => {
    const chain = getEffectiveFallbackChainCore(prefsEnabled, 'gemini', () => 'key', {});
    expect(chain.map((c) => c.providerId)).not.toContain('gemini');
  });

  it('excludes disabled entries', () => {
    const chain = getEffectiveFallbackChainCore(prefsEnabled, 'gemini', () => 'key', {});
    expect(chain.map((c) => c.providerId)).not.toContain('claude');
  });

  it('excludes an entry with no saved key', () => {
    const chain = getEffectiveFallbackChainCore(prefsEnabled, 'gemini', (id) => (id === 'groq' ? '' : 'key'), {});
    expect(chain.map((c) => c.providerId)).not.toContain('groq');
    expect(chain.map((c) => c.providerId)).toContain('openai');
  });

  it('preserves order and uses the per-provider model, falling back to the curated default', () => {
    const chain = getEffectiveFallbackChainCore(prefsEnabled, 'gemini', () => 'key', { groq: 'custom-model' });
    expect(chain.map((c) => c.providerId)).toEqual(['groq', 'openai']);
    expect(chain[0].model).toBe('custom-model');
    expect(chain[1].model).toBe(defaultModelForProvider('openai'));
  });

  it('skips an unknown provider id gracefully', () => {
    const chain = getEffectiveFallbackChainCore({ enabled: true, order: [{ id: 'not-a-real-provider', enabled: true }] }, 'gemini', () => 'key', {});
    expect(chain).toEqual([]);
  });
});

describe('reorderFallbackEntryCore (pure)', () => {
  const order = [{ id: 'a', enabled: true }, { id: 'b', enabled: true }, { id: 'c', enabled: true }, { id: 'd', enabled: true }];

  it('moving forward lands the dragged entry immediately AFTER the target (matches legacy\'s real splice quirk)', () => {
    const next = reorderFallbackEntryCore(order, 'a', 'c');
    expect(next.map((e) => e.id)).toEqual(['b', 'c', 'a', 'd']);
  });

  it('moving backward lands the dragged entry immediately BEFORE the target', () => {
    const next = reorderFallbackEntryCore(order, 'd', 'b');
    expect(next.map((e) => e.id)).toEqual(['a', 'd', 'b', 'c']);
  });

  it('is a no-op for an unknown dragged id', () => {
    expect(reorderFallbackEntryCore(order, 'nope', 'b')).toBe(order);
  });

  it('is a no-op for an unknown target id', () => {
    expect(reorderFallbackEntryCore(order, 'a', 'nope')).toBe(order);
  });
});

describe('loadAiFallbackPrefs / saveAiFallbackPrefs (storage wrappers)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('round-trips through localStorage', () => {
    const prefs = loadAiFallbackPrefs();
    saveAiFallbackPrefs({ enabled: true, order: prefs.order });
    const reloaded = loadAiFallbackPrefs();
    expect(reloaded.enabled).toBe(true);
    expect(reloaded.order.length).toBe(ALL_IDS.length);
  });
});
