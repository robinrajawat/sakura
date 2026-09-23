import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

async function dismissOverlays(page: import('@playwright/test').Page) {
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
}

// The status-bar "Locked" chip used to appear any time Secure Storage was set up and locked,
// regardless of whether unlocking it would actually do anything. On Sakura Hosted AI (which
// never touches the vault for AI calls -- see requireAiKey()'s hosted branch), that meant the
// chip nagged to unlock even when nothing vault-gated was in use at all: no Gist token saved,
// no BYOK fallback key saved. It now only shows itself while locked AND unlocking would
// unblock something real (a saved Gist token, or a saved BYOK key for the active/an enabled
// fallback provider).
test.describe('The Secure Storage status-bar chip only nags when unlocking would actually help', () => {
  async function setLocked(page: import('@playwright/test').Page) {
    await page.evaluate(() => {
      localStorage.setItem('sakura_vault_meta_v1', JSON.stringify({ salt: 'x', verifier: 'y' }));
      // @ts-expect-error -- bare global from index.html
      vaultCryptoKey = null;
    });
  }

  test('stays hidden on Sakura Hosted AI with no Gist token and no fallback keys saved', async ({ page }) => {
    await page.goto('file://' + indexPath);
    await dismissOverlays(page);
    await setLocked(page);

    await page.evaluate(() => {
      // @ts-expect-error
      aiProvider = AI_HOSTED_PROVIDER_ID;
      // @ts-expect-error
      aiFallbackEnabled = false;
      // @ts-expect-error
      updateVaultChip();
    });

    const chip = page.locator('#sb-vault-chip');
    await expect(chip).toBeHidden();
  });

  test('shows, mentioning only Gist sync, when Hosted AI is active but a Gist token is saved', async ({ page }) => {
    await page.goto('file://' + indexPath);
    await dismissOverlays(page);
    await setLocked(page);

    await page.evaluate(() => {
      localStorage.setItem('sakura_cloud_backup_v1', JSON.stringify({ gistToken: 'ciphertext' }));
      // @ts-expect-error
      aiProvider = AI_HOSTED_PROVIDER_ID;
      // @ts-expect-error
      aiFallbackEnabled = false;
      // @ts-expect-error
      updateVaultChip();
    });

    const chip = page.locator('#sb-vault-chip');
    await expect(chip).toBeVisible();
    await expect(chip).toHaveAttribute('data-tip', 'Secure Storage is locked — click to unlock and use Gist sync');
  });

  test('shows, mentioning AI Rewrite and Gist sync, when a BYOK key is saved for the active provider', async ({ page }) => {
    await page.goto('file://' + indexPath);
    await dismissOverlays(page);
    await setLocked(page);

    await page.evaluate(() => {
      localStorage.setItem('sakura_ai_prefs_v1', JSON.stringify({ key_openai: 'ciphertext' }));
      // @ts-expect-error
      aiProvider = 'openai';
      // @ts-expect-error
      aiFallbackEnabled = false;
      // @ts-expect-error
      updateVaultChip();
    });

    const chip = page.locator('#sb-vault-chip');
    await expect(chip).toBeVisible();
    await expect(chip).toHaveAttribute('data-tip', 'Secure Storage is locked — click to unlock and use AI Rewrite / Gist sync');
  });

  test('shows on Hosted AI when an enabled fallback provider has a saved BYOK key', async ({ page }) => {
    await page.goto('file://' + indexPath);
    await dismissOverlays(page);
    await setLocked(page);

    await page.evaluate(() => {
      localStorage.setItem('sakura_ai_prefs_v1', JSON.stringify({ key_openai: 'ciphertext' }));
      // @ts-expect-error
      aiProvider = AI_HOSTED_PROVIDER_ID;
      // @ts-expect-error
      aiFallbackEnabled = true;
      // @ts-expect-error
      aiFallbackOrder = [{ id: 'openai', enabled: true }];
      // @ts-expect-error
      updateVaultChip();
    });

    const chip = page.locator('#sb-vault-chip');
    await expect(chip).toBeVisible();
  });

  test('stays hidden once unlocked, regardless of what is saved', async ({ page }) => {
    await page.goto('file://' + indexPath);
    await dismissOverlays(page);

    await page.evaluate(() => {
      localStorage.setItem('sakura_vault_meta_v1', JSON.stringify({ salt: 'x', verifier: 'y' }));
      localStorage.setItem('sakura_cloud_backup_v1', JSON.stringify({ gistToken: 'ciphertext' }));
      // @ts-expect-error
      vaultCryptoKey = {};
      // @ts-expect-error
      aiProvider = AI_HOSTED_PROVIDER_ID;
      // @ts-expect-error
      updateVaultChip();
    });

    const chip = page.locator('#sb-vault-chip');
    await expect(chip).toBeHidden();
  });
});
