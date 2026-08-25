/**
 * Secure Storage vault — the pure crypto primitives and session state only.
 *
 * Phase 2 (docs/architecture-plan.md) — fourth state-consolidation slice, same generator
 * pipeline as presence/notifications/admin. Optional, opt-in passphrase-based encryption for
 * API keys/tokens at rest (AES-GCM 256, key derived via PBKDF2). Off by default — everything
 * here is a no-op until the user sets a passphrase in Settings.
 *
 * Scope decision, narrower than the other three slices: this module holds ONLY the session
 * state (vaultCryptoKey/decryptedKeyCache/decryptedGistTokenCache) and the pure Web Crypto
 * primitives (b64FromBytes/bytesFromB64/deriveVaultKey/vaultEncrypt/vaultDecrypt) plus the two
 * small status checks (vaultActive/vaultUnlocked). Deliberately NOT extracted:
 * setupVaultPassphrase/unlockVault/lockVault/disableVaultEncryption/updateVaultStatusUI/
 * updateVaultChip, which stay hand-written in index.html exactly where they were. Those
 * functions orchestrate passphrase dialogs (sakuraPasswordPrompt/sakuraConfirm), localStorage
 * migration across two other subsystems' storage keys (AI_PREFS_KEY, CLOUD_BACKUP_KEY), and
 * several DOM updates — real value in isolating them would require dependency-injecting all of
 * that, and getting any of it wrong risks the one thing this subsystem exists to protect
 * (someone's API keys/tokens). The actual security-critical, error-prone logic — the
 * cryptographic operations themselves — is what benefits most from real tests and gets them
 * here; the orchestration around it stays as already-battle-tested code.
 *
 * Compatibility note: vaultCryptoKey/decryptedKeyCache/decryptedGistTokenCache keep their exact
 * original names and are NOT exported (matching admin.ts's isAdmin precedent) specifically so
 * every external call site that reads/writes them directly as bare identifiers — saveAiKey,
 * resetAiSettingsToDefault, loadCloudBackupPrefs, the Gist-token-save click handler, all
 * unchanged elsewhere in index.html — keeps working with zero edits. Same for
 * vaultActive/vaultUnlocked/vaultEncrypt/vaultDecrypt/deriveVaultKey: every hand-written
 * function left behind (and every one of those external call sites) calls them as bare
 * identifiers exactly as before extraction.
 *
 * §6.9 addition (docs/phase6-full-parity-plan.md): `web/`'s AI-key wiring lives in a real
 * separate module (`store/aiSettingsStore.ts`), not spliced into this same script scope the way
 * legacy's hand-written `getAiKeyForProvider`/`saveAiKey` are — so unlike those, it genuinely
 * cannot read/write `decryptedKeyCache` as a bare identifier. `getVaultDecryptedKey`/
 * `setVaultDecryptedKey` below are the narrow, provider-key-scoped accessors that close that gap
 * (matching legacy's own `decryptedKeyCache['key_'+pid]` indexing exactly) without exporting the
 * whole cache object.
 */

export interface LocalStorageLike {
  getItem: (key: string) => string | null;
}

export interface VaultDeps {
  getLocalStorage: () => LocalStorageLike | null;
}

// Also read directly by hand-written code left in index.html (setupVaultPassphrase,
// unlockVault, disableVaultEncryption) — see the file header for why these three specifically
// were not worth pulling those functions in just to keep the constants "inside" too.
const SAKURA_VAULT_META_KEY = 'sakura_vault_meta_v1';
const VAULT_PBKDF2_ITERATIONS = 250000;

let vaultDeps: VaultDeps | null = null;
let vaultCryptoKey: CryptoKey | null = null; // in-memory CryptoKey; null = locked (or vault not set up)
// Reset here for session-start consistency, but never read/written from *inside* this module:
// the hand-written code left in index.html (saveAiKey, resetAiSettingsToDefault,
// loadCloudBackupPrefs, the Gist-token-save click handler — see the file header) reads/writes
// these directly as bare identifiers. That's real, load-bearing usage at runtime; ESLint just
// can't see across the splice boundary.
let decryptedKeyCache: Record<string, string> = {}; // {'key_groq': 'plaintext', ...} populated on unlock
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- same as decryptedKeyCache above.
let decryptedGistTokenCache = '';

/** Called once to provide real (or fake, in tests) dependencies before any other function here is used. */
export function initVaultState(injected: VaultDeps): void {
  vaultDeps = injected;
  vaultCryptoKey = null;
  decryptedKeyCache = {};
  decryptedGistTokenCache = '';
}

function requireVaultDeps(): VaultDeps {
  if (!vaultDeps) throw new Error('vault state used before initVaultState() was called');
  return vaultDeps;
}

/**
 * Test-only hook: sets the in-memory session key directly. Production wiring never calls this —
 * setupVaultPassphrase/unlockVault/lockVault/disableVaultEncryption (hand-written, left in
 * index.html) assign the bare `vaultCryptoKey` variable directly, exactly as before this
 * extraction. This exists so tests can exercise vaultEncrypt/vaultDecrypt/vaultUnlocked without
 * needing to reimplement passphrase setup.
 */
export function setVaultCryptoKeyForTest(key: CryptoKey | null): void {
  vaultCryptoKey = key;
}

export function vaultActive(): boolean {
  try {
    return !!requireVaultDeps().getLocalStorage()?.getItem(SAKURA_VAULT_META_KEY);
  } catch {
    return false;
  }
}

export function vaultUnlocked(): boolean {
  return !!vaultCryptoKey;
}

/** Reads a provider's decrypted key out of the in-memory session cache — `''` if the vault has
 * never been unlocked this session, or was never populated for that provider. Matches legacy's
 * own `decryptedKeyCache['key_'+pid]||''` indexing exactly. */
export function getVaultDecryptedKey(providerId: string): string {
  return decryptedKeyCache['key_' + providerId] || '';
}

/** Populates the in-memory session cache for one provider — called after a successful vault
 * unlock (bulk-decrypting every stored `key_*` field) or right after saving a new key while the
 * vault is unlocked, so the freshly-saved plaintext is immediately readable without a re-decrypt
 * round trip. */
export function setVaultDecryptedKey(providerId: string, value: string): void {
  decryptedKeyCache['key_' + providerId] = value;
}

export function b64FromBytes(bytes: Uint8Array): string {
  let s = '';
  bytes.forEach((b) => (s += String.fromCharCode(b)));
  return btoa(s);
}

export function bytesFromB64(b64: string): Uint8Array {
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

export async function deriveVaultKey(passphrase: string, saltBytes: Uint8Array): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const baseKey = await crypto.subtle.importKey('raw', enc.encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: saltBytes as BufferSource, iterations: VAULT_PBKDF2_ITERATIONS, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function vaultEncrypt(plainText: string): Promise<string> {
  if (!vaultCryptoKey) throw new Error('Vault is locked');
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ctBuf = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, vaultCryptoKey, new TextEncoder().encode(plainText));
  const combined = new Uint8Array(iv.length + ctBuf.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(ctBuf), iv.length);
  return b64FromBytes(combined);
}

export async function vaultDecrypt(b64: string): Promise<string> {
  if (!vaultCryptoKey) throw new Error('Vault is locked');
  const combined = bytesFromB64(b64);
  const iv = combined.slice(0, 12),
    ct = combined.slice(12);
  const ptBuf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, vaultCryptoKey, ct);
  return new TextDecoder().decode(ptBuf);
}
