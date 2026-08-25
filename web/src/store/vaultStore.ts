import { create } from 'zustand';
import {
  deriveVaultKey,
  vaultEncrypt,
  vaultDecrypt,
  vaultActive,
  vaultUnlocked,
  setVaultCryptoKey,
  setVaultDecryptedKey,
  getAllVaultDecryptedKeys,
  clearVaultDecryptedKeys,
  b64FromBytes,
  bytesFromB64,
  initVaultState,
  SAKURA_VAULT_META_KEY,
  VAULT_VERIFIER_PLAINTEXT
} from '../state/vault';
import { loadAllStoredProviderKeyFields, mergeRawFieldsStorage, initAiProvidersState } from '../state/aiProviders';

/**
 * §6.9 slice 2 (docs/phase6-full-parity-plan.md): the Secure Storage vault's setup/unlock/lock/
 * disable orchestration — direct port of legacy's real `setupVaultPassphrase`/`unlockVault`/
 * `lockVault`/`disableVaultEncryption` (legacy/index.html:8699-8813), which `vault.ts`'s own
 * header deliberately left unextracted (see that file for why: passphrase-dialog orchestration
 * and multi-subsystem migration, not the security-critical crypto itself). This store fills that
 * gap with a real React equivalent, using ambient `localStorage` directly for the vault-meta key
 * (same convention `outlinePrefsStore.ts` already established) rather than extending `vault.ts`'s
 * own narrower dependency-injection surface for a single new caller.
 *
 * **No recovery, by design** — matches legacy's own real setup dialog copy exactly: forgetting
 * the passphrase means re-entering every provider key from scratch. Nothing here can or should
 * change that; it's a genuine security tradeoff (no recovery mechanism means no recovery
 * *backdoor* either), not an oversight.
 *
 * `active`/`unlocked` are mirrored into real Zustand state (not just read live from `vault.ts`'s
 * own `vaultActive()`/`vaultUnlocked()` functions) specifically so components re-render when
 * either changes — those two functions are plain reads with no subscription mechanism of their
 * own, which was fine while nothing could ever really activate the vault (§6.9 slice 1), but
 * isn't once real setup/unlock/lock exist. `aiSettingsStore.ts`'s own key-read/save functions
 * still call `vaultActive()`/`vaultUnlocked()` directly (still correct, just not itself
 * reactive) — `AiProviderSettings.tsx` additionally subscribes to this store's `active`/
 * `unlocked` fields purely to force a re-render when they change elsewhere.
 */

function ls(): Storage | null {
  return typeof localStorage !== 'undefined' ? localStorage : null;
}

interface VaultMeta {
  salt: string;
  verifier: string;
}

function readMeta(): VaultMeta | null {
  try {
    const raw = ls()?.getItem(SAKURA_VAULT_META_KEY);
    if (!raw) return null;
    const d = JSON.parse(raw) as Partial<VaultMeta>;
    return typeof d.salt === 'string' && typeof d.verifier === 'string' ? (d as VaultMeta) : null;
  } catch {
    return null;
  }
}

function writeMeta(meta: VaultMeta): void {
  try {
    ls()?.setItem(SAKURA_VAULT_META_KEY, JSON.stringify(meta));
  } catch {
    // Best-effort, matches every other storage write in this project.
  }
}

function removeMeta(): void {
  try {
    ls()?.removeItem(SAKURA_VAULT_META_KEY);
  } catch {
    // Best-effort.
  }
}

function webCryptoAvailable(): boolean {
  return typeof crypto !== 'undefined' && !!crypto.subtle;
}

// Idempotent, same "each store initializes its own required deps at module load" convention
// hubJournalStore.ts/hubLibraryStore.ts/aiSettingsStore.ts already follow -- both modules keep
// working whichever of them a consumer imports first.
initVaultState({ getLocalStorage: ls });
initAiProvidersState({ getLocalStorage: ls });

export interface VaultActionResult {
  ok: boolean;
  message: string;
}

interface VaultState {
  active: boolean;
  unlocked: boolean;

  /** Re-syncs `active`/`unlocked` from `vault.ts`'s own live checks — call after anything that
   * might change vault state outside this store's own actions (there currently isn't such a
   * path, but this keeps the mirrored state honest rather than assumed). */
  refresh: () => void;
  setup: (passphrase: string, confirmPassphrase: string) => Promise<VaultActionResult>;
  unlock: (passphrase: string) => Promise<VaultActionResult>;
  lock: () => void;
  disable: () => Promise<VaultActionResult>;
}

export const useVaultStore = create<VaultState>((set) => ({
  active: vaultActive(),
  unlocked: vaultUnlocked(),

  refresh: () => set({ active: vaultActive(), unlocked: vaultUnlocked() }),

  setup: async (passphrase, confirmPassphrase) => {
    if (vaultActive()) return { ok: false, message: 'Secure Storage is already set up.' };
    if (passphrase.length < 6) return { ok: false, message: 'Passphrase must be at least 6 characters.' };
    if (passphrase !== confirmPassphrase) return { ok: false, message: "Passphrases don't match." };
    if (!webCryptoAvailable()) return { ok: false, message: 'Web Crypto is unavailable here (try over https instead of file://).' };

    const saltBytes = crypto.getRandomValues(new Uint8Array(16));
    const key = await deriveVaultKey(passphrase, saltBytes);
    setVaultCryptoKey(key);
    const verifierCiphertext = await vaultEncrypt(VAULT_VERIFIER_PLAINTEXT);
    writeMeta({ salt: b64FromBytes(saltBytes), verifier: verifierCiphertext });

    // Migrate every existing plaintext key to ciphertext in one pass, populating the session
    // cache as we go so they're immediately usable without a redundant re-decrypt.
    const existing = loadAllStoredProviderKeyFields();
    const encryptedFields: Record<string, string> = {};
    for (const [field, plaintext] of Object.entries(existing)) {
      const providerId = field.slice('key_'.length);
      setVaultDecryptedKey(providerId, plaintext);
      encryptedFields[field] = await vaultEncrypt(plaintext);
    }
    if (Object.keys(encryptedFields).length) mergeRawFieldsStorage(encryptedFields);

    set({ active: true, unlocked: true });
    const migratedCount = Object.keys(encryptedFields).length;
    return {
      ok: true,
      message: migratedCount ? `Secure Storage set up — ${migratedCount} existing key(s) migrated.` : 'Secure Storage set up.'
    };
  },

  unlock: async (passphrase) => {
    const meta = readMeta();
    if (!meta) return { ok: false, message: 'Secure Storage has not been set up.' };
    if (!webCryptoAvailable()) return { ok: false, message: 'Web Crypto is unavailable here (try over https instead of file://).' };

    try {
      const key = await deriveVaultKey(passphrase, bytesFromB64(meta.salt));
      setVaultCryptoKey(key);
      const decryptedVerifier = await vaultDecrypt(meta.verifier);
      if (decryptedVerifier !== VAULT_VERIFIER_PLAINTEXT) throw new Error('verifier mismatch');

      // Bulk-decrypt every stored key into the session cache. A field that fails to decrypt
      // (corrupt or foreign ciphertext) is skipped rather than aborting the whole unlock.
      const stored = loadAllStoredProviderKeyFields();
      for (const [field, ciphertext] of Object.entries(stored)) {
        const providerId = field.slice('key_'.length);
        try {
          setVaultDecryptedKey(providerId, await vaultDecrypt(ciphertext));
        } catch {
          // Skip this one field, keep unlocking.
        }
      }

      set({ active: true, unlocked: true });
      return { ok: true, message: 'Unlocked.' };
    } catch {
      setVaultCryptoKey(null);
      clearVaultDecryptedKeys();
      set({ unlocked: false });
      return { ok: false, message: 'Incorrect passphrase.' };
    }
  },

  lock: () => {
    setVaultCryptoKey(null);
    clearVaultDecryptedKeys();
    set({ unlocked: false });
  },

  disable: async () => {
    if (!vaultActive()) return { ok: false, message: 'Secure Storage is not set up.' };
    if (!vaultUnlocked()) return { ok: false, message: 'Unlock Secure Storage first.' };

    const decrypted = getAllVaultDecryptedKeys();
    if (Object.keys(decrypted).length) mergeRawFieldsStorage(decrypted);
    removeMeta();
    setVaultCryptoKey(null);
    clearVaultDecryptedKeys();
    set({ active: false, unlocked: false });
    return { ok: true, message: 'Secure Storage disabled — keys are stored as plaintext again.' };
  }
}));
