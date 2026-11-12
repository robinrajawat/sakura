import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

// Cloud-first plan, Phase 5b: signed in, the account holds the documents, so Data & backup is
// one "Download all data"; the whole-workspace Restore (and its Undo) are for guests only.
test('signed in, Data & backup is Download all data and Reset; signed out, Backup and Restore come back', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('sakura_welcome_seen', '1');
    sessionStorage.setItem('sakura_landing_dismissed', 'true');
  });
  await page.goto('file://' + indexPath);
  await page.evaluate(async () => {
    // @ts-expect-error -- bare globals from index.html
    await idbSet('preRestoreSnapshot', { payload: {}, savedAt: Date.now(), reason: 'restore from backup file' });
    // @ts-expect-error -- bare global from index.html
    await updatePreRestoreSnapshotStatus();
  });
  // Same as backup-simplified.spec.ts: the Settings button can sit under the account control's hit area.
  await page.evaluate(() => {
    document.getElementById('settings-toggle')?.click();
    // @ts-expect-error -- bare global from index.html
    applySettingsCategory('data');
  });
  const rows = page.locator('#settings-panel .settings-section[data-cat="data"] .settings-list-row:visible .settings-switch-text');
  await expect(rows).toHaveText(['Backup all data', 'Restore from backup', 'Undo last restore', 'Reset to default settings']);

  await page.evaluate(async () => {
    // @ts-expect-error -- bare globals from index.html
    firestoreMods = { mod: { doc: () => ({}), getDoc: async () => ({ exists: () => true, data: () => ({}) }), setDoc: async () => {}, collection: () => ({}), query: () => ({}), where: () => ({}), orderBy: () => ({}), limit: () => ({}), onSnapshot: () => () => {} }, db: {} };
    // @ts-expect-error -- bare global from index.html
    updateAccountUI({ uid: 'u1', email: 'a@example.com' });
    // @ts-expect-error -- bare global from index.html
    await updatePreRestoreSnapshotStatus();
  });
  await expect(rows).toHaveText(['Download all data', 'Reset to default settings']);
  await expect(page.locator('#sb-export-all-btn')).toHaveText('Download');

  await page.evaluate(async () => {
    // @ts-expect-error -- bare global from index.html
    updateAccountUI(null);
    // @ts-expect-error -- bare global from index.html
    await updatePreRestoreSnapshotStatus();
  });
  await expect(rows).toHaveText(['Backup all data', 'Restore from backup', 'Undo last restore', 'Reset to default settings']);
});

test('the sign-in screen leads with the account and offers a try without one', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('sakura_welcome_seen', '1'));
  await page.goto('file://' + indexPath);
  await expect(page.locator('#sakura-landing-sub')).toHaveText('Sign in to keep your documents in your account and on every device.');
  await expect(page.locator('#sakura-landing-continue-btn')).toHaveText('Try it without an account');
});
