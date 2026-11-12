import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

// Cloud-first plan, Phase 3: the top line says where the open document is saved, and a push that
// fails is tried again on its own instead of waiting for the next edit.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('sakura_welcome_seen', '1');
    sessionStorage.setItem('sakura_landing_dismissed', 'true');
  });
  await page.goto('file://' + indexPath);
  // @ts-expect-error -- bare global from index.html
  await page.evaluate(() => createDoc());
});

test('a guest sees "Only on this device", and clicking it opens sign-in', async ({ page }) => {
  const state = page.locator('#doc-save-state');
  await expect(state).toHaveText('Only on this device');
  await state.click();
  await expect(page.locator('#sakura-landing-overlay')).toBeVisible();
});

test('signed in: saving, saved, and a failed push that retries by itself', async ({ page }) => {
  await page.evaluate(() => {
    let fail = true;
    const w = window as unknown as { __pushes: number };
    w.__pushes = 0;
    const mod = {
      doc: (_db: unknown, ...p: string[]) => ({ path: p.join('/') }),
      runTransaction: async (_db: unknown, fn: (tx: unknown) => Promise<unknown>) => {
        w.__pushes++;
        if (fail) { fail = false; throw new Error('network down'); }
        return fn({ get: async () => ({ exists: () => false, data: () => undefined }), set: () => {} });
      },
      collection: () => ({}),
      setDoc: async () => {},
      getDocs: async () => ({ docs: [], empty: true }),
      writeBatch: () => ({ set: () => {}, delete: () => {}, commit: async () => {} })
    };
    // @ts-expect-error -- bare globals from index.html
    firestoreMods = { mod, db: {} }; currentUser = { uid: 'u1' }; updateAccountUI(currentUser);
    // @ts-expect-error -- bare global from index.html
    _syncRetryDelay = 1500;
    // @ts-expect-error -- bare globals from index.html
    nodes = [normalizeNode({ id: 1, depth: 0, text: 'Hello' })]; nextId = 2; dirty = true; saveToStorage();
  });
  const state = page.locator('#doc-save-state');
  await expect(state).toHaveText('Saving…');
  // The first push fails: shown, then retried without another edit.
  await expect(state).toHaveText('Not synced');
  await expect(state).toHaveAttribute('data-tip', 'Saved to your account');
  await expect(state).toHaveText('');
  expect(await page.evaluate(() => (window as unknown as { __pushes: number }).__pushes)).toBe(2);
});
