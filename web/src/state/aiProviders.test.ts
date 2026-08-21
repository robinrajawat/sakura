import { describe, it, expect, beforeEach } from 'vitest';
import {
  computeLoadedAiPrefs,
  initAiProvidersState,
  loadAiPrefsCore,
  saveAiPrefsCore,
  type AiPrefsState,
  type AiProvidersDeps
} from './aiProviders';

const VALID_IDS = ['gemini', 'claude', 'openai', 'groq'];

function baseState(overrides: Partial<AiPrefsState> = {}): AiPrefsState {
  return {
    provider: 'gemini',
    model: 'gemini-3.5-flash',
    modelByProvider: {},
    prompt: 'default prompt',
    ...overrides
  };
}

describe('computeLoadedAiPrefs (pure)', () => {
  it('returns current state unchanged when raw is null (nothing stored yet)', () => {
    const current = baseState();
    expect(computeLoadedAiPrefs(null, current, VALID_IDS)).toEqual(current);
  });

  it('returns current state unchanged for corrupt JSON, never throws', () => {
    const current = baseState();
    expect(() => computeLoadedAiPrefs('{not valid json', current, VALID_IDS)).not.toThrow();
    expect(computeLoadedAiPrefs('{not valid json', current, VALID_IDS)).toEqual(current);
  });

  it('adopts a stored provider id when it is in the valid list', () => {
    const current = baseState();
    const result = computeLoadedAiPrefs(JSON.stringify({ provider: 'claude' }), current, VALID_IDS);
    expect(result.provider).toBe('claude');
  });

  it('ignores a stored provider id that is not in the valid list (stale/removed provider)', () => {
    const current = baseState({ provider: 'gemini' });
    const result = computeLoadedAiPrefs(JSON.stringify({ provider: 'no-longer-exists' }), current, VALID_IDS);
    expect(result.provider).toBe('gemini');
  });

  it('adopts a stored modelByProvider map wholesale, replacing (not merging with) the current one', () => {
    const current = baseState({ modelByProvider: { gemini: 'old-model' } });
    const result = computeLoadedAiPrefs(
      JSON.stringify({ modelByProvider: { claude: 'claude-3' } }),
      current,
      VALID_IDS
    );
    expect(result.modelByProvider).toEqual({ claude: 'claude-3' });
  });

  it('ignores a non-object modelByProvider value', () => {
    const current = baseState({ modelByProvider: { gemini: 'kept' } });
    const result = computeLoadedAiPrefs(JSON.stringify({ modelByProvider: 'not-an-object' }), current, VALID_IDS);
    expect(result.modelByProvider).toEqual({ gemini: 'kept' });
  });

  it('adopts a stored model string', () => {
    const current = baseState();
    const result = computeLoadedAiPrefs(JSON.stringify({ model: 'gemini-pro' }), current, VALID_IDS);
    expect(result.model).toBe('gemini-pro');
  });

  it('ignores an empty-string stored model', () => {
    const current = baseState({ model: 'kept-model' });
    const result = computeLoadedAiPrefs(JSON.stringify({ model: '' }), current, VALID_IDS);
    expect(result.model).toBe('kept-model');
  });

  it('modelByProvider[resolved provider] overrides a plain stored model, matching load order', () => {
    // Oracle: original does modelByProvider override AFTER the plain `d.model` assignment,
    // so a per-provider entry always wins over the flat `model` field when both are present.
    const current = baseState();
    const result = computeLoadedAiPrefs(
      JSON.stringify({ provider: 'claude', model: 'flat-model', modelByProvider: { claude: 'per-provider-model' } }),
      current,
      VALID_IDS
    );
    expect(result.provider).toBe('claude');
    expect(result.model).toBe('per-provider-model');
  });

  it('adopts a stored prompt string', () => {
    const current = baseState();
    const result = computeLoadedAiPrefs(JSON.stringify({ prompt: 'custom prompt' }), current, VALID_IDS);
    expect(result.prompt).toBe('custom prompt');
  });

  it('ignores an empty-string stored prompt', () => {
    const current = baseState({ prompt: 'kept prompt' });
    const result = computeLoadedAiPrefs(JSON.stringify({ prompt: '' }), current, VALID_IDS);
    expect(result.prompt).toBe('kept prompt');
  });

  it('does not mutate the current state object passed in', () => {
    const current = baseState({ modelByProvider: { gemini: 'x' } });
    const snapshot = JSON.parse(JSON.stringify(current));
    computeLoadedAiPrefs(JSON.stringify({ provider: 'claude', modelByProvider: { claude: 'y' } }), current, VALID_IDS);
    expect(current).toEqual(snapshot);
  });
});

interface LocalStorageLike {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
}

describe('stateful aiProviders prefs (initAiProvidersState + load/save core)', () => {
  let storageData: Record<string, string>;

  const fakeStorage: LocalStorageLike = {
    getItem: (key) => (key in storageData ? storageData[key] : null),
    setItem: (key, value) => {
      storageData[key] = value;
    }
  };

  function makeDeps(overrides: Partial<AiProvidersDeps> = {}): AiProvidersDeps {
    return {
      getLocalStorage: () => fakeStorage as unknown as Storage,
      ...overrides
    };
  }

  beforeEach(() => {
    storageData = {};
    initAiProvidersState(makeDeps());
  });

  it('loadAiPrefsCore returns current state unchanged when nothing is stored', () => {
    const current = baseState();
    expect(loadAiPrefsCore(current, VALID_IDS)).toEqual(current);
  });

  it('loadAiPrefsCore reads and resolves a stored prefs blob', () => {
    storageData['sakura_ai_prefs_v1'] = JSON.stringify({ provider: 'openai', model: 'gpt-4.1', prompt: 'p' });
    const result = loadAiPrefsCore(baseState(), VALID_IDS);
    expect(result.provider).toBe('openai');
    expect(result.model).toBe('gpt-4.1');
    expect(result.prompt).toBe('p');
  });

  it('loadAiPrefsCore returns current state unchanged when getLocalStorage() returns null', () => {
    initAiProvidersState(makeDeps({ getLocalStorage: () => null }));
    const current = baseState();
    expect(loadAiPrefsCore(current, VALID_IDS)).toEqual(current);
  });

  it('loadAiPrefsCore never throws even if getLocalStorage() itself throws', () => {
    initAiProvidersState(
      makeDeps({
        getLocalStorage: () => {
          throw new Error('boom');
        }
      })
    );
    const current = baseState();
    expect(() => loadAiPrefsCore(current, VALID_IDS)).not.toThrow();
    expect(loadAiPrefsCore(current, VALID_IDS)).toEqual(current);
  });

  it('saveAiPrefsCore persists provider/model/prompt and stamps modelByProvider', () => {
    const modelByProvider: Record<string, string> = {};
    saveAiPrefsCore('claude', 'claude-sonnet', modelByProvider, 'my prompt');
    const stored = JSON.parse(storageData['sakura_ai_prefs_v1']);
    expect(stored.provider).toBe('claude');
    expect(stored.model).toBe('claude-sonnet');
    expect(stored.prompt).toBe('my prompt');
    expect(stored.modelByProvider).toEqual({ claude: 'claude-sonnet' });
  });

  it('saveAiPrefsCore mutates the passed-in modelByProvider object in place (matches original global mutation)', () => {
    const modelByProvider: Record<string, string> = { gemini: 'old' };
    saveAiPrefsCore('gemini', 'new-model', modelByProvider, 'p');
    expect(modelByProvider).toEqual({ gemini: 'new-model' });
  });

  it('saveAiPrefsCore preserves unrelated fields already present in storage (read-modify-write)', () => {
    storageData['sakura_ai_prefs_v1'] = JSON.stringify({ someOtherField: 'keep-me', provider: 'gemini' });
    saveAiPrefsCore('claude', 'claude-model', {}, 'p');
    const stored = JSON.parse(storageData['sakura_ai_prefs_v1']);
    expect(stored.someOtherField).toBe('keep-me');
    expect(stored.provider).toBe('claude');
  });

  it('saveAiPrefsCore silently no-ops on a storage write failure, matching the original try/catch', () => {
    const throwingStorage: LocalStorageLike = {
      getItem: () => null,
      setItem: () => {
        throw new Error('QuotaExceededError');
      }
    };
    initAiProvidersState(makeDeps({ getLocalStorage: () => throwingStorage as unknown as Storage }));
    expect(() => saveAiPrefsCore('gemini', 'm', {}, 'p')).not.toThrow();
  });

  it('saveAiPrefsCore silently no-ops on corrupt existing JSON rather than throwing', () => {
    storageData['sakura_ai_prefs_v1'] = '{not valid json';
    expect(() => saveAiPrefsCore('gemini', 'm', {}, 'p')).not.toThrow();
  });
});
