import { create } from 'zustand';
import {
  initAiProvidersState,
  loadAiPrefsCore,
  saveAiPrefsCore,
  loadAiKeyForProvider,
  saveAiKeyForProviderStorage,
  hasStoredKeyForProvider,
  type AiPrefsState
} from '../state/aiProviders';
import { initVaultState, vaultActive, vaultUnlocked, vaultEncrypt, getVaultDecryptedKey, setVaultDecryptedKey } from '../state/vault';
import { callAiByShape } from '../state/aiCall';
import { AI_BUILTIN_PROVIDERS, getAiProviderById, defaultModelForProvider, extraHeadersForProvider } from '../state/aiProviderCatalog';

/**
 * §6.9 slice (docs/phase6-full-parity-plan.md): AI provider configuration — the first §6.9
 * feature, since every later capability (Rewrite, Generate Outline, ...) needs a configured
 * provider + working key to call. Wires three already-ported-but-previously-unwired pure state
 * modules together for the first time: `aiProviders.ts` (prefs blob load/save, extended this
 * slice with the `key_<providerId>` read/write legacy really stores in that same blob),
 * `vault.ts` (the opt-in Secure Storage AES-GCM vault), and the new `aiProviderCatalog.ts`/
 * `aiCall.ts` (the provider list and the real network call, also new this slice).
 *
 * Deliberately real-vault-aware from the start (`getKeyForProvider`/`saveKeyForProvider` branch
 * on `vaultActive()`/`vaultUnlocked()` exactly like legacy's real `getAiKeyForProvider`/
 * `saveAiKey`) even though this slice does NOT build the vault setup/unlock UI itself (a real,
 * separately-scoped follow-up — passphrase dialogs, a status-bar chip, migrating existing
 * plaintext keys — legacy's own `setupVaultPassphrase`/`unlockVault`/`lockVault`/
 * `disableVaultEncryption`, index.html:8699-8813). Since no vault can be created yet in `web/`,
 * `vaultActive()` always resolves `false` here and every key read/write takes the plain
 * localStorage path — the vault branches are real, tested, and correctly unreachable until that
 * follow-up lands, not dead code.
 *
 * `testKeyForProvider` deliberately calls `callAiByShape` directly rather than going through a
 * fallback-aware wrapper or recording usage — matches legacy's real `testAiKey` (index.html:
 * 29647-29672), whose own comment is explicit: "a connectivity/credentials check, not real
 * feature usage."
 */

function ls(): Storage | null {
  return typeof localStorage !== 'undefined' ? localStorage : null;
}

initAiProvidersState({ getLocalStorage: ls });
initVaultState({ getLocalStorage: ls });

const VALID_PROVIDER_IDS = AI_BUILTIN_PROVIDERS.map((p) => p.id);

const AI_DEFAULT_PROMPT =
  'You are a text correction tool. Your ONLY job is to return the corrected version of the input text. Do NOT explain, do NOT offer alternatives, do NOT add any commentary. Output the corrected text and nothing else.\n\nCorrect any grammar and spelling errors. Preserve the original meaning, tone, and technical terminology exactly. Preserve all formatting exactly as given: bullet markers (-, *, •), numbered list prefixes (1., 2., ...), line breaks, and indentation must remain in the same positions. Never add, remove, renumber, or reformat list markers.';

export interface KeyStatus {
  /** Whether *something* (plaintext or vault ciphertext) is stored for this provider. */
  hasKey: boolean;
  /** True only when the vault is active AND currently locked — the stored key exists but can't
   * be read right now. */
  locked: boolean;
  /** Character count of the readable plaintext, when available (plain-storage path, or vault
   * unlocked) — undefined when locked (nothing to count). */
  length?: number;
}

export interface TestKeyResult {
  ok: boolean;
  message: string;
}

interface AiSettingsState {
  provider: string;
  model: string;
  modelByProvider: Record<string, string>;
  prompt: string;

  setProvider: (providerId: string) => void;
  setModel: (model: string) => void;
  setPrompt: (prompt: string) => void;
  resetPromptToDefault: () => void;

  getKeyForProvider: (providerId: string) => string;
  keyStatusForProvider: (providerId: string) => KeyStatus;
  saveKeyForProvider: (providerId: string, value: string) => Promise<TestKeyResult>;
  testKeyForProvider: (providerId: string, model: string, keyOverride?: string) => Promise<TestKeyResult>;
}

export const useAiSettingsStore = create<AiSettingsState>((set, get) => {
  const initial = loadAiPrefsCore({ provider: 'gemini', model: defaultModelForProvider('gemini'), modelByProvider: {}, prompt: AI_DEFAULT_PROMPT }, VALID_PROVIDER_IDS);

  function persist(next: AiPrefsState): void {
    saveAiPrefsCore(next.provider, next.model, next.modelByProvider, next.prompt);
  }

  return {
    ...initial,

    setProvider: (providerId) => {
      if (!VALID_PROVIDER_IDS.includes(providerId)) return;
      const s = get();
      // Stamp the outgoing provider's current model into modelByProvider before switching,
      // matching legacy's real `#ai-provider-select` change handler exactly.
      const modelByProvider = { ...s.modelByProvider, [s.provider]: s.model };
      const model = modelByProvider[providerId] || defaultModelForProvider(providerId);
      const next = { ...s, provider: providerId, model, modelByProvider };
      set(next);
      persist(next);
    },

    setModel: (model) => {
      const s = get();
      const modelByProvider = { ...s.modelByProvider, [s.provider]: model };
      const next = { ...s, model, modelByProvider };
      set(next);
      persist(next);
    },

    setPrompt: (prompt) => {
      const next = { ...get(), prompt };
      set(next);
      persist(next);
    },

    resetPromptToDefault: () => {
      const next = { ...get(), prompt: AI_DEFAULT_PROMPT };
      set(next);
      persist(next);
    },

    getKeyForProvider: (providerId) => {
      if (vaultActive()) {
        return vaultUnlocked() ? getVaultDecryptedKey(providerId) : '';
      }
      return loadAiKeyForProvider(providerId);
    },

    keyStatusForProvider: (providerId) => {
      const hasKey = hasStoredKeyForProvider(providerId);
      const locked = vaultActive() && !vaultUnlocked();
      if (locked) return { hasKey, locked };
      const plaintext = get().getKeyForProvider(providerId);
      return { hasKey, locked, length: plaintext.length };
    },

    saveKeyForProvider: async (providerId, value) => {
      if (vaultActive()) {
        if (!vaultUnlocked()) {
          return { ok: false, message: 'Unlock Secure Storage first (Settings → Secure Storage)' };
        }
        setVaultDecryptedKey(providerId, value);
        const ciphertext = await vaultEncrypt(value);
        saveAiKeyForProviderStorage(providerId, ciphertext);
        return { ok: true, message: 'Key saved.' };
      }
      saveAiKeyForProviderStorage(providerId, value);
      return { ok: true, message: 'Key saved.' };
    },

    testKeyForProvider: async (providerId, model, keyOverride) => {
      const provider = getAiProviderById(providerId);
      const apiKey = keyOverride || get().getKeyForProvider(providerId);
      if (!apiKey) return { ok: false, message: 'No key to test — enter one first.' };
      try {
        await callAiByShape({
          shape: provider.shape,
          baseUrl: provider.baseUrl,
          apiKey,
          model,
          systemPrompt: '',
          userContent: 'Reply with the single word OK.',
          maxTokens: 8,
          extraHeaders: extraHeadersForProvider(providerId)
        });
        return { ok: true, message: `${provider.label}: key works ✓` };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { ok: false, message: `${provider.label} test failed: ${message}` };
      }
    }
  };
});
