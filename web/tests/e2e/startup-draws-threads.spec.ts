import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

// The owner's iPhone froze at startup: the first draw showed a thread before the thread code had
// set up (2026-11-20). A thread with an unsent reply opens as the document opens; it must draw
// then, with no error, and the app must finish starting. (Also runs in WebKit: startup.safari.spec.ts.)
test('a document opening with a thread on screen starts normally and shows the thread', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => { if (!/ServiceWorker/.test(e.message)) errors.push(e.message); });
  await page.addInitScript(() => {
    localStorage.setItem('sakura_welcome_seen', '1'); sessionStorage.setItem('sakura_landing_dismissed', 'true');
    const n = (id: number, text: string) => ({ id, depth: 0, text, parentId: null, isCheckbox: false, checked: false, note: '', tables: [], images: [], tags: [], styles: {} });
    localStorage.setItem('sakura_doc_v1_d1', JSON.stringify({ title: 'Kumla', nextId: 3, nodes: [n(1, 'Business Requirement'), n(2, 'Validation')],
      remarks: [{ id: 'r1', anchorNodeId: 2, text: 'What should we do about clean core?', author: 'Robin', createdAt: 1, kind: 'question' }] }));
    localStorage.setItem('sakura_docs_index_v1', JSON.stringify([{ id: 'd1', title: 'Kumla', updatedAt: 2 }]));
    localStorage.setItem('sakura_current_doc_v1', 'd1');
    localStorage.setItem('sakura_thread_drafts_v1', JSON.stringify({ 'd1|2': { html: 'half a reply', kind: 'comment', at: Date.now() } }));
  });
  await page.goto('file://' + indexPath);
  await expect(page.locator('#editor-pane')).toContainText('What should we do about clean core?');
  await expect(page.locator('.thread-composer-input').first()).toContainText('half a reply');
  expect(await page.evaluate(() => (window as unknown as { __sakuraMainDone?: boolean }).__sakuraMainDone)).toBe(true);
  expect(errors).toEqual([]);
});
