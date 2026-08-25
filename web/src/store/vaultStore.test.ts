import { describe, expect, it, beforeEach } from 'vitest';
import { useVaultStore } from './vaultStore';
import { vaultActive, vaultUnlocked, getVaultDecryptedKey } from '../state/vault';
import { saveAiKeyForProviderStorage, loadAiKeyForProvider } from '../state/aiProviders';

describe('vaultStore', () => {
  beforeEach(() => {
    localStorage.clear();
    useVaultStore.getState().lock();
    useVaultStore.setState({ active: false, unlocked: false });
  });

  it('starts inactive/locked with nothing set up', () => {
    const s = useVaultStore.getState();
    expect(s.active).toBe(false);
    expect(s.unlocked).toBe(false);
  });

  describe('setup', () => {
    it('rejects a passphrase shorter than 6 characters', async () => {
      const result = await useVaultStore.getState().setup('ab', 'ab');
      expect(result.ok).toBe(false);
      expect(result.message).toContain('at least 6');
      expect(vaultActive()).toBe(false);
    });

    it('rejects mismatched passphrases', async () => {
      const result = await useVaultStore.getState().setup('correct horse', 'battery staple');
      expect(result.ok).toBe(false);
      expect(result.message).toContain("don't match");
    });

    it('succeeds with a valid matching passphrase, activating and unlocking', async () => {
      const result = await useVaultStore.getState().setup('correct horse battery staple', 'correct horse battery staple');
      expect(result.ok).toBe(true);
      expect(useVaultStore.getState().active).toBe(true);
      expect(useVaultStore.getState().unlocked).toBe(true);
      expect(vaultActive()).toBe(true);
      expect(vaultUnlocked()).toBe(true);
    });

    it('refuses to set up twice', async () => {
      await useVaultStore.getState().setup('correct horse battery staple', 'correct horse battery staple');
      const second = await useVaultStore.getState().setup('another passphrase', 'another passphrase');
      expect(second.ok).toBe(false);
      expect(second.message).toContain('already set up');
    });

    it('migrates every existing plaintext key to ciphertext and into the session cache', async () => {
      saveAiKeyForProviderStorage('gemini', 'sk-gemini-plain');
      saveAiKeyForProviderStorage('claude', 'sk-claude-plain');

      const result = await useVaultStore.getState().setup('correct horse battery staple', 'correct horse battery staple');
      expect(result.ok).toBe(true);
      expect(result.message).toContain('2 existing key(s) migrated');

      const raw = JSON.parse(localStorage.getItem('sakura_ai_prefs_v1')!);
      expect(raw.key_gemini).not.toBe('sk-gemini-plain');
      expect(raw.key_claude).not.toBe('sk-claude-plain');

      expect(getVaultDecryptedKey('gemini')).toBe('sk-gemini-plain');
      expect(getVaultDecryptedKey('claude')).toBe('sk-claude-plain');
    });

    it('reports no migration when there was nothing to migrate', async () => {
      const result = await useVaultStore.getState().setup('correct horse battery staple', 'correct horse battery staple');
      expect(result.message).not.toContain('migrated');
    });
  });

  describe('unlock / lock', () => {
    it('fails when the vault was never set up', async () => {
      const result = await useVaultStore.getState().unlock('anything');
      expect(result.ok).toBe(false);
      expect(result.message).toContain('has not been set up');
    });

    it('locking clears unlocked state and the session key, keeping active true', async () => {
      await useVaultStore.getState().setup('correct horse battery staple', 'correct horse battery staple');
      useVaultStore.getState().lock();
      expect(useVaultStore.getState().active).toBe(true);
      expect(useVaultStore.getState().unlocked).toBe(false);
      expect(vaultUnlocked()).toBe(false);
    });

    it('unlocking with the correct passphrase restores unlocked state and decrypts every stored key', async () => {
      saveAiKeyForProviderStorage('gemini', 'sk-gemini-plain');
      await useVaultStore.getState().setup('correct horse battery staple', 'correct horse battery staple');
      useVaultStore.getState().lock();
      expect(getVaultDecryptedKey('gemini')).toBe('');

      const result = await useVaultStore.getState().unlock('correct horse battery staple');
      expect(result.ok).toBe(true);
      expect(useVaultStore.getState().unlocked).toBe(true);
      expect(getVaultDecryptedKey('gemini')).toBe('sk-gemini-plain');
    });

    it('unlocking with the wrong passphrase fails and leaves state locked', async () => {
      await useVaultStore.getState().setup('correct horse battery staple', 'correct horse battery staple');
      useVaultStore.getState().lock();

      const result = await useVaultStore.getState().unlock('totally wrong passphrase');
      expect(result.ok).toBe(false);
      expect(result.message).toContain('Incorrect passphrase');
      expect(useVaultStore.getState().unlocked).toBe(false);
      expect(vaultUnlocked()).toBe(false);
    });
  });

  describe('disable', () => {
    it('fails when the vault is not set up', async () => {
      const result = await useVaultStore.getState().disable();
      expect(result.ok).toBe(false);
      expect(result.message).toContain('not set up');
    });

    it('fails while locked', async () => {
      await useVaultStore.getState().setup('correct horse battery staple', 'correct horse battery staple');
      useVaultStore.getState().lock();
      const result = await useVaultStore.getState().disable();
      expect(result.ok).toBe(false);
      expect(result.message).toContain('Unlock Secure Storage first');
    });

    it('flushes every decrypted key back to plaintext and removes the vault meta', async () => {
      saveAiKeyForProviderStorage('gemini', 'sk-gemini-plain');
      await useVaultStore.getState().setup('correct horse battery staple', 'correct horse battery staple');

      const result = await useVaultStore.getState().disable();
      expect(result.ok).toBe(true);
      expect(useVaultStore.getState().active).toBe(false);
      expect(useVaultStore.getState().unlocked).toBe(false);
      expect(vaultActive()).toBe(false);
      expect(localStorage.getItem('sakura_vault_meta_v1')).toBeNull();

      // Plain-path read now works again, matching the pre-vault plaintext.
      expect(loadAiKeyForProvider('gemini')).toBe('sk-gemini-plain');
    });
  });

  it('refresh re-syncs active/unlocked from the underlying vault.ts checks', async () => {
    await useVaultStore.getState().setup('correct horse battery staple', 'correct horse battery staple');
    useVaultStore.setState({ active: false, unlocked: false }); // simulate drift
    useVaultStore.getState().refresh();
    expect(useVaultStore.getState().active).toBe(true);
    expect(useVaultStore.getState().unlocked).toBe(true);
  });
});
