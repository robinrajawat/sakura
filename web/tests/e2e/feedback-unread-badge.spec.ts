import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

// Owner 2026-11-21: new feedback shows as a count in the app (no email). The Settings button and the
// Feedback inbox row count what was sent in since the inbox was last opened; opening it clears them,
// and that is saved as a (synced) setting.
test('new feedback shows as a count for the admin, and opening the inbox clears it', async ({ page }) => {
  await page.addInitScript(() => { localStorage.setItem('sakura_welcome_seen', '1'); sessionStorage.setItem('sakura_landing_dismissed', 'true'); });
  await page.goto('file://' + indexPath);
  await page.waitForFunction(() => (window as unknown as { __sakuraMainDone?: boolean }).__sakuraMainDone === true);
  await page.evaluate(`
    const items = [1000, 2000, 3000].map((t, i) => ({ id: 'f' + i, data: () => ({ kind: 'feedback', message: 'm' + i, createdAt: t }) }));
    const mod = {
      collection: () => ({}), doc: () => ({}), orderBy: () => null, limit: () => null,
      where: (_f, _op, v) => ({ after: v }),
      query: (_c, ...parts) => ({ after: (parts.find((p) => p && 'after' in p) || { after: -1 }).after }),
      getDocs: async (q) => { const docs = items.filter((d) => d.data().createdAt > q.after); return { docs, empty: !docs.length }; }
    };
    firestoreMods = { mod, db: {} }; currentUser = { uid: 'u1', email: 'admin@example.com' }; isAdmin = true;
    feedbackSeenAt = 1500;
  `);
  await page.evaluate('refreshFeedbackUnread(true)');
  await expect(page.locator('#rail-settings-badge')).toHaveText('2');
  await expect(page.locator('#account-feedback-inbox-btn')).toHaveText('Open (2 new)');
  await page.evaluate('openFeedbackInboxModal()');
  await expect(page.locator('#rail-settings-badge')).toBeHidden();
  await expect(page.locator('#account-feedback-inbox-btn')).toHaveText('Open…');
  expect(JSON.parse(await page.evaluate(`localStorage.getItem('sakura_v001_prefs')`) as string).feedbackSeenAt).toBe(3000);
  // Not an admin: no count.
  await page.evaluate('isAdmin = false; feedbackSeenAt = 0; refreshFeedbackUnread(true)');
  await expect(page.locator('#rail-settings-badge')).toBeHidden();
});
