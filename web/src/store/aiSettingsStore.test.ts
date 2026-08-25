import { describe, expect, it, beforeEach, vi } from 'vitest';
import { setVaultCryptoKey } from '../state/vault';
import * as aiCall from '../state/aiCall';

vi.mock('../state/aiCall', async () => {
  const actual = await vi.importActual<typeof import('../state/aiCall')>('../state/aiCall');
  return { ...actual, callAiByShape: vi.fn() };
});

import { useAiSettingsStore } from './aiSettingsStore';

describe('aiSettingsStore', () => {
  beforeEach(() => {
    localStorage.clear();
    setVaultCryptoKey(null);
    useAiSettingsStore.setState({ provider: 'gemini', model: 'gemini-3.5-flash', modelByProvider: {}, prompt: useAiSettingsStore.getState().prompt });
    vi.mocked(aiCall.callAiByShape).mockReset();
  });

  it('defaults to gemini with its own default model', () => {
    const s = useAiSettingsStore.getState();
    expect(s.provider).toBe('gemini');
    expect(s.model).toBe('gemini-3.5-flash');
  });

  it('setProvider switches provider and resolves that provider default model when none saved yet', () => {
    useAiSettingsStore.getState().setProvider('claude');
    const s = useAiSettingsStore.getState();
    expect(s.provider).toBe('claude');
    expect(s.model).toBe('claude-haiku-4-5-20251001');
  });

  it('setProvider stamps the outgoing provider model into modelByProvider before switching', () => {
    useAiSettingsStore.getState().setModel('custom-gemini-model');
    useAiSettingsStore.getState().setProvider('claude');
    expect(useAiSettingsStore.getState().modelByProvider.gemini).toBe('custom-gemini-model');
  });

  it('setProvider restores a previously-saved model for a provider switched back to', () => {
    useAiSettingsStore.getState().setModel('gemini-2.5-flash-lite');
    useAiSettingsStore.getState().setProvider('claude');
    useAiSettingsStore.getState().setProvider('gemini');
    expect(useAiSettingsStore.getState().model).toBe('gemini-2.5-flash-lite');
  });

  it('setProvider ignores an unknown provider id', () => {
    useAiSettingsStore.getState().setProvider('not-a-real-provider');
    expect(useAiSettingsStore.getState().provider).toBe('gemini');
  });

  it('setModel updates model and persists it into modelByProvider for the current provider', () => {
    useAiSettingsStore.getState().setModel('gemini-2.5-flash-lite');
    const s = useAiSettingsStore.getState();
    expect(s.model).toBe('gemini-2.5-flash-lite');
    expect(s.modelByProvider.gemini).toBe('gemini-2.5-flash-lite');
  });

  it('setModel persists across a simulated reload (reads back via loadAiPrefsCore)', () => {
    useAiSettingsStore.getState().setProvider('claude');
    useAiSettingsStore.getState().setModel('claude-sonnet-4-6');
    const raw = JSON.parse(localStorage.getItem('sakura_ai_prefs_v1')!);
    expect(raw.provider).toBe('claude');
    expect(raw.model).toBe('claude-sonnet-4-6');
  });

  it('setPrompt / resetPromptToDefault round-trip', () => {
    useAiSettingsStore.getState().setPrompt('custom prompt');
    expect(useAiSettingsStore.getState().prompt).toBe('custom prompt');
    useAiSettingsStore.getState().resetPromptToDefault();
    expect(useAiSettingsStore.getState().prompt).toContain('text correction tool');
  });

  describe('key storage — plain path (no vault set up)', () => {
    it('getKeyForProvider returns "" when nothing is saved', () => {
      expect(useAiSettingsStore.getState().getKeyForProvider('gemini')).toBe('');
    });

    it('saveKeyForProvider then getKeyForProvider round-trips', async () => {
      const result = await useAiSettingsStore.getState().saveKeyForProvider('gemini', 'sk-abc123');
      expect(result.ok).toBe(true);
      expect(useAiSettingsStore.getState().getKeyForProvider('gemini')).toBe('sk-abc123');
    });

    it('keys are stored independently per provider', async () => {
      await useAiSettingsStore.getState().saveKeyForProvider('gemini', 'sk-gemini');
      await useAiSettingsStore.getState().saveKeyForProvider('claude', 'sk-claude');
      expect(useAiSettingsStore.getState().getKeyForProvider('gemini')).toBe('sk-gemini');
      expect(useAiSettingsStore.getState().getKeyForProvider('claude')).toBe('sk-claude');
    });

    it('keyStatusForProvider reports hasKey/length correctly before and after saving', async () => {
      expect(useAiSettingsStore.getState().keyStatusForProvider('gemini')).toEqual({ hasKey: false, locked: false, length: 0 });
      await useAiSettingsStore.getState().saveKeyForProvider('gemini', 'sk-12345');
      expect(useAiSettingsStore.getState().keyStatusForProvider('gemini')).toEqual({ hasKey: true, locked: false, length: 8 });
    });
  });

  describe('key storage — vault path', () => {
    function activateVault(): void {
      localStorage.setItem('sakura_vault_meta_v1', JSON.stringify({ salt: 'x', verifier: 'y' }));
    }

    it('saveKeyForProvider refuses to save while the vault is active but locked', async () => {
      activateVault();
      const result = await useAiSettingsStore.getState().saveKeyForProvider('gemini', 'sk-abc');
      expect(result.ok).toBe(false);
      expect(result.message).toContain('Unlock Secure Storage');
    });

    it('getKeyForProvider returns "" while the vault is active but locked, even after a plaintext key existed before vault setup', () => {
      // A key stored while the vault was inactive still sits in AI_PREFS_KEY as plaintext;
      // once the vault is active, the plain-path read is bypassed entirely (matches legacy:
      // real vault setup migrates+encrypts existing keys, but the READ path itself always goes
      // through the vault branch once vaultActive() is true, regardless of migration state).
      localStorage.setItem('sakura_ai_prefs_v1', JSON.stringify({ key_gemini: 'plaintext-leftover' }));
      activateVault();
      expect(useAiSettingsStore.getState().getKeyForProvider('gemini')).toBe('');
    });

    it('keyStatusForProvider reports locked:true and no length while locked', () => {
      localStorage.setItem('sakura_ai_prefs_v1', JSON.stringify({ key_gemini: 'ciphertext' }));
      activateVault();
      expect(useAiSettingsStore.getState().keyStatusForProvider('gemini')).toEqual({ hasKey: true, locked: true });
    });

    it('saveKeyForProvider encrypts and getKeyForProvider decrypts once unlocked (real Web Crypto)', async () => {
      activateVault();
      const salt = crypto.getRandomValues(new Uint8Array(16));
      const { deriveVaultKey } = await import('../state/vault');
      const key = await deriveVaultKey('correct horse battery staple', salt);
      setVaultCryptoKey(key);

      const result = await useAiSettingsStore.getState().saveKeyForProvider('gemini', 'sk-vaulted');
      expect(result.ok).toBe(true);

      const raw = JSON.parse(localStorage.getItem('sakura_ai_prefs_v1')!);
      expect(raw.key_gemini).not.toBe('sk-vaulted'); // actually encrypted at rest, not passthrough

      expect(useAiSettingsStore.getState().getKeyForProvider('gemini')).toBe('sk-vaulted');
    });
  });

  describe('testKeyForProvider', () => {
    it('reports failure immediately when there is no key to test', async () => {
      const result = await useAiSettingsStore.getState().testKeyForProvider('gemini', 'gemini-3.5-flash');
      expect(result.ok).toBe(false);
      expect(aiCall.callAiByShape).not.toHaveBeenCalled();
    });

    it('calls callAiByShape with the fixed test prompt and 8 max tokens, reports success', async () => {
      vi.mocked(aiCall.callAiByShape).mockResolvedValue('OK');
      const result = await useAiSettingsStore.getState().testKeyForProvider('gemini', 'gemini-3.5-flash', 'sk-typed-not-yet-saved');
      expect(result.ok).toBe(true);
      expect(result.message).toContain('key works');
      const call = vi.mocked(aiCall.callAiByShape).mock.calls[0][0];
      expect(call.userContent).toBe('Reply with the single word OK.');
      expect(call.maxTokens).toBe(8);
      expect(call.apiKey).toBe('sk-typed-not-yet-saved');
      expect(call.shape).toBe('gemini');
    });

    it('uses the already-saved key when no override is passed', async () => {
      await useAiSettingsStore.getState().saveKeyForProvider('gemini', 'sk-saved');
      vi.mocked(aiCall.callAiByShape).mockResolvedValue('OK');
      await useAiSettingsStore.getState().testKeyForProvider('gemini', 'gemini-3.5-flash');
      expect(vi.mocked(aiCall.callAiByShape).mock.calls[0][0].apiKey).toBe('sk-saved');
    });

    it('reports failure with the provider label and error message when the call rejects', async () => {
      vi.mocked(aiCall.callAiByShape).mockRejectedValue(new Error('Invalid API key'));
      const result = await useAiSettingsStore.getState().testKeyForProvider('claude', 'claude-haiku-4-5-20251001', 'bad-key');
      expect(result.ok).toBe(false);
      expect(result.message).toBe('Claude API test failed: Invalid API key');
    });
  });
});
