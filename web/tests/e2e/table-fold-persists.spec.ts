import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

// Owner bug report 2026-10-19: a table folded away on a top-level row opened again on every reload.
// The fold is saved with the document now, like a folded branch.

test('a folded table stays folded after a reload', async ({ page }) => {
  await page.addInitScript(() => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    localStorage.setItem('sakura_welcome_seen', '1');
    sessionStorage.setItem('sakura_landing_dismissed', 'true');
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
  await page.goto('file://' + indexPath);
  await expect(page.locator('.node-table-line')).toHaveCount(1);
  await page.locator('.node-row[data-id="1"] .node-table-dot').click();
  await expect(page.locator('.node-table-line')).toHaveCount(0);
  await page.waitForFunction(() => (JSON.parse(localStorage.getItem('sakura_doc_v1_tfdoc') || '{}').collapsedTables || []).includes(1));
  await page.reload();
  await expect(page.locator('.node-row[data-id="1"]')).toBeVisible();
  await expect(page.locator('.node-table-line')).toHaveCount(0);
});
