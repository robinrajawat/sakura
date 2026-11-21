import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

// Owner 2026-11-21: Version history said "Auto · 28 rows" for every entry, too little to choose by.
// Each entry now says what changed since the one before and on which device; tapping one shows it,
// compared with the document now, before restoring.
test('each version says what changed and where, and can be viewed before restoring', async ({ page }) => {
  await page.addInitScript(() => { localStorage.setItem('sakura_welcome_seen', '1'); sessionStorage.setItem('sakura_landing_dismissed', 'true'); });
  await page.setViewportSize({ width: 1200, height: 900 });
  await page.goto('file://' + indexPath);
  await page.waitForFunction(() => (window as unknown as { __sakuraMainDone?: boolean }).__sakuraMainDone === true);
  await page.evaluate(`(async () => {
    createDoc(); setDocTitleField('Plan');
    const n = (id, t) => normalizeNode({ id, depth: 0, text: t, parentId: null, isCheckbox: false, checked: false, note: '', tables: [], images: [], tags: [], styles: {} });
    const now = Date.now();
    const v = (ago, reason, device, rows) => ({ ts: now - ago, reason, device, nodes: rows, title: 'Plan', author: '', docStatus: '', diagrams: [], qa: [], remarks: [] });
    await saveDocRevisions(currentDocId, [
      v(3600e3, 'Auto', 'Chrome on Mac', [n(1, 'Goal'), n(2, 'Scope')]),
      v(600e3, 'Your changes on this device', 'iPhone app', [n(1, 'Goal'), n(2, 'Scope, revised'), n(3, 'Risks')])
    ]);
    nodes = [n(1, 'Goal'), n(2, 'Scope')]; rebuildParentIds(); render();
    openVersionHistory(currentDocId);
  })()`);
  const rows = page.locator('#history-modal-body .history-row');
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0).locator('.history-row-time')).toContainText('iPhone app');
  await expect(rows.nth(0).locator('.history-row-meta')).toHaveText('1 row added · 1 row edited');
  await expect(rows.nth(0).locator('.history-row-reason')).toContainText('set aside');
  await expect(rows.nth(1).locator('.history-row-meta')).toHaveText('Oldest kept · 2 rows');
  await expect(rows.nth(1).locator('.history-row-reason')).toHaveCount(0);

  // Viewing the newer one: compared with the document now.
  await rows.nth(0).locator('.history-row-open').click();
  await expect(page.locator('.history-preview-vsnow')).toHaveText('If you restore it: 1 row you don’t have now would come back, 1 row reads differently.');
  await expect(page.locator('.history-preview-row.is-added')).toHaveText(['Risks']);
  await expect(page.locator('.history-preview-row.is-edited')).toHaveText(['Scope, revised']);
  await expect(page.locator('#history-save-now-btn')).toBeHidden(); // only Restore while viewing a version
  // Back to the list, and Restore from the view restores that version.
  await page.locator('.history-preview-back').click();
  await expect(rows).toHaveCount(2);
  await expect(page.locator('#history-save-now-btn')).toBeVisible();
  await rows.nth(0).locator('.history-row-open').click();
  await page.locator('.history-preview-restore').click();
  await expect.poll(() => page.evaluate('nodes.map((n) => n.text)')).toEqual(['Goal', 'Scope, revised', 'Risks']);
});
