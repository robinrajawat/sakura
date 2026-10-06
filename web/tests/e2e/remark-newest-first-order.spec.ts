import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

async function dismissOverlays(page: import('@playwright/test').Page) {
  const landing = page.locator('#sakura-landing-overlay');
  if (await landing.isVisible().catch(() => false)) {
    await page.evaluate(() => { const el = document.getElementById('sakura-landing-overlay'); if (el) el.style.display='none'; });
  }
  const welcome = page.locator('#welcome-overlay');
  if (await welcome.isVisible().catch(() => false)) {
    await page.evaluate(() => document.getElementById('welcome-overlay')?.classList.remove('open'));
  }
}

const threeRemarks = [
  { id: 'r1', anchorNodeId: 1, person: 'First Author', date: '2024-01-01', text: 'The first remark.', createdAt: 1000 },
  { id: 'r2', anchorNodeId: 1, person: 'Second Author', date: '2024-01-02', text: 'The second remark.', createdAt: 2000 },
  { id: 'r3', anchorNodeId: 1, person: 'Third Author', date: '2024-01-03', text: 'The third, most recent remark.', createdAt: 3000 },
];

// remarks.push (both addRemark and the capture-popover's own creation path) always appends, so
// unsorted array order reads oldest-on-top for a node with several remarks -- backwards from
// "what's the latest on this node," the thing you'd actually want to see first when skimming.
test.describe('Several remarks on the same node show newest first', () => {
  test('in the live outline editor\'s own inline remark display', async ({ page }) => {
    await page.goto('file://' + indexPath);
    await dismissOverlays(page);

    await page.evaluate((threeRemarks) => {
      // @ts-expect-error
      nodes = [{ id: 1, depth: 0, text: 'Parent', parentId: null, isCheckbox: false, checked: false, note: '', tags: [], styles: {} }];
      // @ts-expect-error
      collapsedIds = new Set();
      // @ts-expect-error
      selectedId = null; multiSelectedIds = []; selectAllMode = false; focusedId = null; undoStack = []; editingId = null; nextId = 2;
      // @ts-expect-error
      remarks = threeRemarks;
      // @ts-expect-error
      padRemarksTabEnabled = true;
      // @ts-expect-error
      inlineExpandRemarksNodeIds = new Set([1]);
      // @ts-expect-error
      render();
    }, threeRemarks);

    const order = await page.evaluate(() =>
      [...document.querySelectorAll('.node-remark-text-inline')].map(el => (el as HTMLElement).dataset.remarkId)
    );
    expect(order).toEqual(['r3', 'r2', 'r1']);
  });

  test('in Preview/PDF\'s grouped remark card', async ({ page }) => {
    await page.goto('file://' + indexPath);
    await dismissOverlays(page);

    await page.evaluate((threeRemarks) => {
      // @ts-expect-error
      nodes = [{ id: 1, depth: 0, text: 'Parent', parentId: null, isCheckbox: false, checked: false, note: '', noteTitle: '', tags: [], styles: {} }];
      // @ts-expect-error
      collapsedIds = new Set();
      // @ts-expect-error
      selectedId = null; multiSelectedIds = []; selectAllMode = false; focusedId = null; undoStack = []; editingId = null;
      // @ts-expect-error
      remarks = threeRemarks;
      // @ts-expect-error
      previewActive = true;
      // @ts-expect-error
      renderPreviewBody();
      document.getElementById('preview-overlay')?.classList.add('open');
    }, threeRemarks);

    const order = await page.evaluate(() =>
      [...document.querySelectorAll('#preview-body .pv-remark-entry .pv-remark-meta b')].map(el => el.textContent)
    );
    expect(order).toEqual(['Third Author', 'Second Author', 'First Author']);
  });

  test('a remark with no createdAt (loaded from before that field existed) sorts after every timestamped remark', async ({ page }) => {
    await page.goto('file://' + indexPath);
    await dismissOverlays(page);

    await page.evaluate(() => {
      // @ts-expect-error
      nodes = [{ id: 1, depth: 0, text: 'Parent', parentId: null, isCheckbox: false, checked: false, note: '', tags: [], styles: {} }];
      // @ts-expect-error
      collapsedIds = new Set();
      // @ts-expect-error
      selectedId = null; multiSelectedIds = []; selectAllMode = false; focusedId = null; undoStack = []; editingId = null; nextId = 2;
      // @ts-expect-error
      remarks = [
        { id: 'old', anchorNodeId: 1, person: 'No Timestamp', date: '2023-01-01', text: 'Legacy remark.' },
        { id: 'new', anchorNodeId: 1, person: 'Has Timestamp', date: '2024-01-01', text: 'Recent remark.', createdAt: 1000 },
      ];
      // @ts-expect-error
      padRemarksTabEnabled = true;
      // @ts-expect-error
      inlineExpandRemarksNodeIds = new Set([1]);
      // @ts-expect-error
      render();
    });

    const order = await page.evaluate(() =>
      [...document.querySelectorAll('.node-remark-text-inline')].map(el => (el as HTMLElement).dataset.remarkId)
    );
    expect(order).toEqual(['new', 'old']);
  });
});
