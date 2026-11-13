import { test, expect, type Page } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

// docs/mobile-plan.md, ground rule 1: building the phone layout never changes the desktop. Each
// main desktop screen is photographed as shipped, then again with the phone stylesheet
// (<style id="sakura-phone-css">) switched off, in the same page with its clock paused so nothing
// moves in between, and the pixels must be identical. 768px is the narrowest desktop width.
const WIDTHS = [1280, 800, 768];

const ROWS = [
  { id: 1, depth: 0, text: '[Plan] Quarter goals', parentId: null, styles: { heading: 1 } },
  { id: 2, depth: 1, text: 'Ship the phone layout without touching the desktop', parentId: 1, note: '<p>One app, one URL.</p>',
    tables: ['<table><thead><tr><th>Owner</th><th>Status</th></tr></thead><tbody><tr><td>Sam</td><td>Open</td></tr><tr><td>Ana</td><td>Done</td></tr></tbody></table>'] },
  { id: 3, depth: 1, text: 'Checked item', parentId: 1, isCheckbox: true, checked: true },
  { id: 4, depth: 1, text: 'Open item with **bold** and #tag', parentId: 1, isCheckbox: true },
  { id: 5, depth: 0, text: 'Notes', parentId: null, styles: { heading: 2 } },
  { id: 6, depth: 1, text: 'A plain row', parentId: 5 }
].map((n) => ({ isCheckbox: false, checked: false, note: '', tables: [], tags: [], styles: {}, ...n }));

const SCREENS: { name: string; open: (page: Page) => Promise<void> }[] = [
  { name: 'editor', open: async () => {} },
  { name: 'sidebar closed', open: async (page) => { await page.evaluate(() => (window as unknown as { setSidebarOpen: (o: boolean) => void }).setSidebarOpen(false)); } },
  { name: 'settings', open: async (page) => { await page.locator('#rail-settings-btn').click(); } },
  { name: 'share menu', open: async (page) => { await page.locator('#doc-share-chip').click(); } },
  { name: 'to-dos', open: async (page) => { await page.locator('#dock-panel-appbar-toggle').click(); } }
];

async function shootBoth(page: Page, width: number, open: (page: Page) => Promise<void>): Promise<[Buffer, Buffer]> {
  await page.clock.install();
  await page.setViewportSize({ width, height: 900 });
  await page.goto('file://' + indexPath);
  await page.waitForFunction(() => typeof (window as unknown as { createDoc?: unknown }).createDoc === 'function');
  await page.evaluate(() => document.fonts.ready);
  await open(page);
  // Let start-up timers and fades finish, then freeze time for the two shots.
  await page.clock.runFor(5000);
  await page.clock.pauseAt(Date.now() + 60000);
  const shot = () => page.screenshot({ animations: 'disabled', caret: 'hide' });
  const shipped = await shot();
  await page.evaluate(() => {
    const el = document.getElementById('sakura-phone-css') as HTMLStyleElement | null;
    if (!el) throw new Error('no #sakura-phone-css');
    el.disabled = true;
  });
  const without = await shot();
  return [shipped, without];
}

test.describe('the desktop looks the same with and without the phone layout', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript((rows) => {
      localStorage.setItem('sakura_welcome_seen', '1');
      sessionStorage.setItem('sakura_landing_dismissed', 'true');
      localStorage.setItem('sakura_doc_v1_ab', JSON.stringify({ nodes: rows, nextId: 7, selectedId: null, multiSelectedIds: [], selectionAnchorId: null, collapsed: [], title: 'Desktop check', author: 'Robin', docStatus: 'review' }));
      localStorage.setItem('sakura_docs_index_v1', JSON.stringify([{ id: 'ab', title: 'Desktop check', updatedAt: 1767225600000 }]));
      localStorage.setItem('sakura_current_doc_v1', 'ab');
    }, ROWS);
  });

  for (const screen of SCREENS) {
    test(screen.name, async ({ page }) => {
      test.setTimeout(60000);
      for (const width of WIDTHS) {
        const [shipped, without] = await shootBoth(page, width, screen.open);
        if (!shipped.equals(without)) {
          await test.info().attach(`${width}-shipped.png`, { body: shipped, contentType: 'image/png' });
          await test.info().attach(`${width}-without-phone-css.png`, { body: without, contentType: 'image/png' });
        }
        expect(shipped.equals(without), `${screen.name} at ${width}px differs`).toBe(true);
      }
    });
  }
});
