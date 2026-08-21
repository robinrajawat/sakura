import { describe, it, expect, beforeEach } from 'vitest';
import {
  vaultActive,
  vaultUnlocked,
  b64FromBytes,
  bytesFromB64,
  deriveVaultKey,
  vaultEncrypt,
  vaultDecrypt,
  initVaultState,
  setVaultCryptoKeyForTest,
  type VaultDeps,
  type LocalStorageLike
} from './vault';

describe('b64FromBytes / bytesFromB64 (pure, round-trip)', () => {
  it('round-trips arbitrary byte sequences', () => {
    const original = new Uint8Array([0, 1, 2, 255, 128, 64, 17, 300 % 256]);
    const encoded = b64FromBytes(original);
    const decoded = bytesFromB64(encoded);
    expect(Array.from(decoded)).toEqual(Array.from(original));
  });

  it('round-trips an empty byte array', () => {
    expect(Array.from(bytesFromB64(b64FromBytes(new Uint8Array([]))))).toEqual([]);
  });
});

describe('stateful vault (initVaultState + vaultActive/vaultUnlocked)', () => {
  let storageData: Record<string, string>;

  const fakeStorage: LocalStorageLike = {
    getItem: (key) => (key in storageData ? storageData[key] : null)
  };

  function makeDeps(): VaultDeps {
    return { getLocalStorage: () => fakeStorage };
  }

  beforeEach(() => {
    storageData = {};
    initVaultState(makeDeps());
  });

  it('vaultActive is false when no vault metadata is stored', () => {
    expect(vaultActive()).toBe(false);
  });

  it('vaultActive is true once vault metadata exists in storage', () => {
    storageData['sakura_vault_meta_v1'] = JSON.stringify({ salt: 'x', verifier: 'y' });
    expect(vaultActive()).toBe(true);
  });

  it('vaultActive tolerates a storage getter that throws', () => {
    initVaultState({
      getLocalStorage: () => {
        throw new Error('storage unavailable');
      }
    });
    expect(vaultActive()).toBe(false);
  });

  it('vaultActive tolerates a null localStorage (e.g. unavailable context)', () => {
    initVaultState({ getLocalStorage: () => null });
    expect(vaultActive()).toBe(false);
  });

  it('vaultUnlocked is false until a session key is set, true after', () => {
    expect(vaultUnlocked()).toBe(false);
    setVaultCryptoKeyForTest({} as CryptoKey); // any truthy value stands in for a real CryptoKey here
    expect(vaultUnlocked()).toBe(true);
  });

  it('initVaultState resets the session key back to locked', () => {
    setVaultCryptoKeyForTest({} as CryptoKey);
    expect(vaultUnlocked()).toBe(true);
    initVaultState(makeDeps());
    expect(vaultUnlocked()).toBe(false);
  });
});

describe('vaultEncrypt / vaultDecrypt (real Web Crypto, no mocking)', () => {
  beforeEach(() => {
    initVaultState({ getLocalStorage: () => null });
  });

  it('throws "Vault is locked" when encrypting with no session key', async () => {
    await expect(vaultEncrypt('secret')).rejects.toThrow('Vault is locked');
  });

  it('throws "Vault is locked" when decrypting with no session key', async () => {
    await expect(vaultDecrypt('irrelevant')).rejects.toThrow('Vault is locked');
  });

  it('round-trips a plaintext value through a real derived AES-GCM key', async () => {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const key = await deriveVaultKey('correct horse battery staple', salt);
    setVaultCryptoKeyForTest(key);

    const plaintext = 'sk-example-provider-api-key-1234567890';
    const ciphertext = await vaultEncrypt(plaintext);
    expect(ciphertext).not.toContain(plaintext); // sanity: it's actually encrypted, not passthrough
    const decrypted = await vaultDecrypt(ciphertext);
    expect(decrypted).toBe(plaintext);
  });

  it('round-trips an empty string and unicode content', async () => {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const key = await deriveVaultKey('pw', salt);
    setVaultCryptoKeyForTest(key);

    expect(await vaultDecrypt(await vaultEncrypt(''))).toBe('');
    expect(await vaultDecrypt(await vaultEncrypt('héllo wörld 🔒'))).toBe('héllo wörld 🔒');
  });

  it('produces different ciphertext for the same plaintext each time (random IV)', async () => {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const key = await deriveVaultKey('pw', salt);
    setVaultCryptoKeyForTest(key);

    const a = await vaultEncrypt('same plaintext');
    const b = await vaultEncrypt('same plaintext');
    expect(a).not.toBe(b);
    expect(await vaultDecrypt(a)).toBe('same plaintext');
    expect(await vaultDecrypt(b)).toBe('same plaintext');
  });

  it('fails to decrypt with the wrong passphrase-derived key (same salt)', async () => {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const keyA = await deriveVaultKey('correct passphrase', salt);
    const keyB = await deriveVaultKey('wrong passphrase', salt);

    setVaultCryptoKeyForTest(keyA);
    const ciphertext = await vaultEncrypt('protected value');

    setVaultCryptoKeyForTest(keyB);
    await expect(vaultDecrypt(ciphertext)).rejects.toThrow();
  });

  it('deriveVaultKey is deterministic for the same passphrase and salt', async () => {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const keyA = await deriveVaultKey('same passphrase', salt);
    const keyB = await deriveVaultKey('same passphrase', salt);

    setVaultCryptoKeyForTest(keyA);
    const ciphertext = await vaultEncrypt('cross-key value');
    setVaultCryptoKeyForTest(keyB);
    // If derivation is deterministic, keyB can decrypt what keyA encrypted.
    expect(await vaultDecrypt(ciphertext)).toBe('cross-key value');
  });

  it('deriveVaultKey produces a different key for a different salt, even with the same passphrase', async () => {
    const saltA = crypto.getRandomValues(new Uint8Array(16));
    const saltB = crypto.getRandomValues(new Uint8Array(16));
    const keyA = await deriveVaultKey('same passphrase', saltA);
    const keyB = await deriveVaultKey('same passphrase', saltB);

    setVaultCryptoKeyForTest(keyA);
    const ciphertext = await vaultEncrypt('salt-sensitive value');
    setVaultCryptoKeyForTest(keyB);
    await expect(vaultDecrypt(ciphertext)).rejects.toThrow();
  });
});
