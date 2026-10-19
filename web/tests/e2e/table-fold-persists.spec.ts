import { test, expect, type Page } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');
const probePath = path.resolve(__dirname, 'fixtures/storage-probe.html');

// Owner bug report 2026-10-19: a table folded away on a top-level row opened again on every reload.
// The fold is saved with the document now, like a folded branch.

async function readSharedStorage(page: Page, key: string): Promise<string> {
  const probe = await page.context().newPage();
  try {
    await probe.goto('file://' + probePath);
    return await probe.evaluate((k) => localStorage.getItem(k) || '', key);
  } finally {
    await probe.close();
  }
}

test('a folded table stays folded after a reload', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('sakura_welcome_seen', '1');
    sessionStorage.setItem('sakura_landing_dismissed', 'true');
    if (sessionStorage.getItem('seededFoldDoc')) return;
    sessionStorage.setItem('seededFoldDoc', '1');
    const docId = 'tfdoc';
    const t = '<table><tr><th>A</th><th>B</th></tr><tr><td>1</td><td>2</td></tr></table>';
    localStorage.setItem('sakura_doc_v1_' + docId, JSON.stringify({
      nodes: [{ id: 1, depth: 0, text: 'Top row', parentId: null, isCheckbox: false, checked: false, note: '', tables: [t], tags: [], styles: {} }],
      nextId: 2, selectedId: null, multiSelectedIds: [], selectionAnchorId: null, collapsed: [], title: 'TF', author: ''
    }));
    localStorage.setItem('sakura_docs_index_v1', JSON.stringify([{ id: docId, title: 'TF', updatedAt: Date.now() }]));
    localStorage.setItem('sakura_current_doc_v1', docId);
    localStorage.setItem('sakura_open_tabs_v1', JSON.stringify({ tabs: [docId], pinned: [], active: docId }));
  });
  await page.setViewportSize({ width: 1200, height: 800 });
  // On file:// a page's localStorage isn't always the context's shared store, and a reload would then
  // read different data (same guard as image-markup.spec.ts and backup-simplified.spec.ts).
  for (let attempt = 1; ; attempt++) {
    await page.goto('file://' + indexPath);
    const marker = 'f' + Date.now() + '-' + attempt;
    await page.evaluate((m) => localStorage.setItem('sakura_e2e_storage_probe', m), marker);
    let shared = false;
    for (let i = 0; i < 20 && !shared; i++) {
      shared = (await readSharedStorage(page, 'sakura_e2e_storage_probe')) === marker;
      if (!shared) await page.waitForTimeout(150);
    }
    if (shared || attempt >= 5) { expect(shared).toBe(true); break; }
    await page.evaluate(() => sessionStorage.removeItem('seededFoldDoc'));
  }
  await expect(page.locator('.node-table-line')).toHaveCount(1);
  await page.locator('.node-row[data-id="1"] .node-table-dot').click();
  await expect(page.locator('.node-table-line')).toHaveCount(0);
  await expect.poll(async () => {
    try { return JSON.parse(await readSharedStorage(page, 'sakura_doc_v1_tfdoc')).collapsedTables || []; } catch { return []; }
  }).toEqual([1]);
  await page.reload();
  await expect(page.locator('.node-row[data-id="1"]')).toBeVisible();
  await expect(page.locator('.node-table-line')).toHaveCount(0);
});
