// @ts-nocheck -- the page's own globals (let bindings, not window properties) are used bare.
import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

// A version that differed only in formatting, order or a diagram said "No changes" and "Same content
// as the document now", and the preview showed only row words (owner 2026-11-25).
test('version history names formatting, moves, diagrams and what each row holds', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('sakura_welcome_seen', '1');
    sessionStorage.setItem('sakura_landing_dismissed', 'true');
  });
  await page.goto('file://' + indexPath);
  await page.waitForFunction('typeof render === "function" && typeof nodes !== "undefined"');
  await page.evaluate(async () => {
    document.getElementById('welcome-overlay')?.classList.remove('open');
    ensureDocumentForEditing();
    nodes = [1, 2, 3].map((i) => normalizeNode({ id: i, text: 'Row ' + i, depth: 0 }));
    nodes[0].note = '<p>Why</p>'; nodes[0].tables = ['<table><tr><td>a</td></tr></table>'];
    diagrams = [{ id: 'dg1', title: 'Flow', xml: '<mxfile>a</mxfile>', anchorNodeId: 2, _hydrated: true, createdAt: 1, modifiedAt: 1 }];
    markDirty(); saveToStorage(); render();
    await recordDocRevision(currentDocId, currentDocRevisionContent(), 'Manual checkpoint', { name: 'Before' });
    // Now: row 1 bold, row 3 dragged above row 2, the diagram redrawn. Same words everywhere.
    setRowMarksOn(nodes[0], [{ s: 0, e: 5, k: 'b' }]);
    nodes = [nodes[0], nodes[2], nodes[1]];
    diagrams[0].xml = '<mxfile>b</mxfile>';
    markDirty(); saveToStorage(); render();
    openVersionHistory(currentDocId);
  });
  const item = page.locator('#history-modal-body .history-row').first();
  await expect(item).toBeVisible();
  await item.click();
  const vsNow = page.locator('.history-preview-vsnow');
  await expect(vsNow).toContainText('1 row reads differently');
  await expect(vsNow).toContainText('1 row would move back');
  await expect(vsNow).toContainText('diagrams differ');
  await expect(vsNow).not.toContainText('Same content');
  await expect(page.locator('.history-preview-row', { hasText: 'Row 1' }).locator('.history-row-extras')).toHaveText('note · table');
  await expect(page.locator('.history-preview-row', { hasText: 'Row 2' }).locator('.history-row-extras')).toHaveText('diagram');
  await expect(page.locator('.history-preview-row.is-edited', { hasText: 'Row 1' })).toHaveAttribute('data-tip', /formatting/);
  await page.locator('#history-modal-overlay .app-modal, #history-modal-overlay').first().screenshot({ path: test.info().outputPath('preview.png') });
});
