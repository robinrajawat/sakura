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
    nodes = [n(1, 'Goal'), n(2, 'Scope'), n(4, 'Budget')]; rebuildParentIds(); render();
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
  await expect(page.locator('.history-preview-vsnow')).toHaveText('If you restore it: 1 row you don’t have now would come back, 1 row you have now would go, 1 row reads differently.');
  await expect(page.locator('.history-preview-row.is-added')).toHaveText(['Risks']);
  await expect(page.locator('.history-preview-row.is-edited')).toHaveCount(1);
  // Inside the row, the words that differ (owner 2026-11-21: as Google Docs shows them).
  await expect(page.locator('.history-preview-row.is-edited .hv-word-add')).toHaveText(['Scope, revised']);
  await expect(page.locator('.history-preview-row.is-edited .hv-word-del')).toHaveText(['Scope']);
  // A row you have now that the version doesn't: shown in place, struck through.
  await expect(page.locator('.history-preview-row.is-removed')).toHaveText(['Budget']);
  await expect(page.locator('#history-save-now-btn')).toBeHidden(); // only Restore while viewing a version
  // Naming it: kept until the name is removed, and shown first in the list.
  await page.locator('.history-preview-namebtn').click();
  await page.locator('#sakura-modal-input').fill('Sent to client');
  await page.keyboard.press('Enter');
  await expect(page.locator('.history-preview-name .history-row-name')).toHaveText('Sent to client');
  await expect(page.locator('.history-preview-namebtn')).toHaveText('Rename');
  expect(await page.evaluate('loadDocRevisions(currentDocId).then((l) => l.map((v) => v.name || null))')).toEqual([null, 'Sent to client']);
  // Back to the list, and Restore from the view restores that version.
  await page.locator('.history-preview-back').click();
  await expect(rows).toHaveCount(2);
  await expect(page.locator('#history-save-now-btn')).toBeVisible();
  await expect(rows.nth(0).locator('.history-row-name')).toHaveText('Sent to client');
  await rows.nth(0).locator('.history-row-open').click();
  await page.locator('.history-preview-restore').click();
  await expect.poll(() => page.evaluate('nodes.map((n) => n.text)')).toEqual(['Goal', 'Scope, revised', 'Risks']);
});

test('Save a version now asks for an optional name', async ({ page }) => {
  await page.addInitScript(() => { localStorage.setItem('sakura_welcome_seen', '1'); sessionStorage.setItem('sakura_landing_dismissed', 'true'); });
  await page.goto('file://' + indexPath);
  await page.waitForFunction(() => (window as unknown as { __sakuraMainDone?: boolean }).__sakuraMainDone === true);
  await page.evaluate(`createDoc(); setDocTitleField('Plan'); openVersionHistory(currentDocId);`);
  await page.locator('#history-save-now-btn').click();
  await page.locator('#sakura-modal-input').fill('Before the review');
  await page.keyboard.press('Enter');
  await expect(page.locator('#history-modal-body .history-row-name')).toHaveText(['Before the review']);
  // Saved with no name: still saved, just unnamed.
  await page.locator('#history-save-now-btn').click();
  await page.keyboard.press('Enter');
  await expect.poll(() => page.evaluate('loadDocRevisions(currentDocId).then((l) => l.length)')).toBeGreaterThanOrEqual(1);
});
