import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

// See tests/e2e/generated-presence-smoke.spec.ts for why these are expected/benign here.
const KNOWN_NOISE = /ServiceWorker|cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net|CORS policy|Failed to load resource/i;

test.describe('generated vault block (src/state/vault.ts spliced into index.html)', () => {
  test('vaultEncrypt/vaultDecrypt round-trip correctly, and an untouched external reader (getAiKeyForProvider) sees the effect', async ({ page }) => {
    const unexpectedErrors: string[] = [];
    page.on('pageerror', (err) => {
      if (!KNOWN_NOISE.test(err.message)) unexpectedErrors.push('pageerror: ' + err.message);
    });
    page.on('console', (msg) => {
      if (msg.type() === 'error' && !KNOWN_NOISE.test(msg.text())) {
        unexpectedErrors.push('console.error: ' + msg.text());
      }
    });

    await page.goto('file://' + indexPath);

    const landing = page.locator('#sakura-landing-overlay');
    if (await landing.isVisible().catch(() => false)) {
      await page.evaluate(() => {
        const el = document.getElementById('sakura-landing-overlay');
        if (el) el.style.display = 'none';
      });
    }
    const welcome = page.locator('#welcome-overlay');
    if (await welcome.isVisible().catch(() => false)) {
      await page.evaluate(() => document.getElementById('welcome-overlay')?.classList.remove('open'));
    }

    // 1. Confirm the generated functions exist, plus the hand-written orchestration functions
    // left behind in index.html (setupVaultPassphrase/unlockVault) and the external reader
    // (getAiKeyForProvider, defined far away in the AI-settings section) all still exist.
    const fnTypes = await page.evaluate(() => ({
      // @ts-expect-error — global app state from index.html, not a module export
      vaultActive: typeof vaultActive,
      // @ts-expect-error
      vaultEncrypt: typeof vaultEncrypt,
      // @ts-expect-error
      vaultDecrypt: typeof vaultDecrypt,
      // @ts-expect-error
      deriveVaultKey: typeof deriveVaultKey,
      // @ts-expect-error
      setupVaultPassphrase: typeof setupVaultPassphrase,
      // @ts-expect-error
      unlockVault: typeof unlockVault,
      // @ts-expect-error
      lockVault: typeof lockVault,
      // @ts-expect-error
      getAiKeyForProvider: typeof getAiKeyForProvider,
    }));
    expect(fnTypes).toEqual({
      vaultActive: 'function',
      vaultEncrypt: 'function',
      vaultDecrypt: 'function',
      deriveVaultKey: 'function',
      setupVaultPassphrase: 'function',
      unlockVault: 'function',
      lockVault: 'function',
      getAiKeyForProvider: 'function',
    });

    // 2. Real crypto round-trip against the actual generated primitives, deriving a key the
    // same way setupVaultPassphrase/unlockVault do (passphrase + random salt), then setting the
    // session key via the test hook (bypassing the passphrase dialog UI, which needs real
    // interaction) — this exercises the SAME code path setupVaultPassphrase/unlockVault use.
    const roundTrip = await page.evaluate(async () => {
      // @ts-expect-error
      const salt = crypto.getRandomValues(new Uint8Array(16));
      // @ts-expect-error
      const key = await deriveVaultKey('e2e-test-passphrase', salt);
      // @ts-expect-error
      setVaultCryptoKeyForTest(key);
      // @ts-expect-error
      const ciphertext = await vaultEncrypt('sk-example-provider-key-abc123');
      // @ts-expect-error
      const decrypted = await vaultDecrypt(ciphertext);
      return { decrypted, ciphertextLooksEncrypted: !ciphertext.includes('sk-example-provider-key-abc123') };
    });
    expect(roundTrip).toEqual({ decrypted: 'sk-example-provider-key-abc123', ciphertextLooksEncrypted: true });

    // 3. Prove the external reader (getAiKeyForProvider, hand-written, physically far away in
    // the AI-settings section, untouched by this extraction) correctly sees vault state through
    // the bare `decryptedKeyCache`/`vaultActive`/`vaultUnlocked` identifiers this module
    // declares — the actual compatibility guarantee this extraction's design depends on.
    // Simulates what setupVaultPassphrase's migration step does: populate decryptedKeyCache and
    // mark the vault active (via real localStorage, since vaultActive reads it directly), then
    // confirm the untouched getAiKeyForProvider() picks it up with zero changes on its end.
    const externalReaderSeesIt = await page.evaluate(() => {
      // @ts-expect-error — simulate vault-active metadata already existing in storage
      localStorage.setItem('sakura_vault_meta_v1', JSON.stringify({ salt: 'x', verifier: 'y' }));
      // @ts-expect-error — bare identifier: decryptedKeyCache is a top-level `let`, not on window
      decryptedKeyCache['key_groq'] = 'unlocked-plaintext-groq-key';
      // @ts-expect-error
      return getAiKeyForProvider('groq');
    });
    expect(externalReaderSeesIt).toBe('unlocked-plaintext-groq-key');

    // 4. Zero unexpected page/console errors.
    expect(unexpectedErrors).toEqual([]);
  });
});
