import { test, expect, type Page } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

// Owner, 2026-11-16: after Download PDF in iPhone Safari the document's title was gone ("we need to
// be extremely careful about these data loss issues"). It didn't reproduce in Chrome; the leading
// Safari-only cause is form restoration putting an old value back into the field after the app
// loaded the document. The title and author now only change through the app or the person using
// them (src/ui/fieldGuard.ts): anything else is put back before it can be saved.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('sakura_welcome_seen', '1');
    sessionStorage.setItem('sakura_landing_dismissed', 'true');
    const n = { id: 1, depth: 0, text: 'Row', parentId: null, isCheckbox: false, checked: false, note: '', tables: [], images: [], tags: [], styles: {} };
    localStorage.setItem('sakura_doc_v1_g', JSON.stringify({ nodes: [n], nextId: 2, collapsed: [], title: 'My Title', author: 'Robin' }));
    localStorage.setItem('sakura_docs_index_v1', JSON.stringify([{ id: 'g', title: 'My Title', updatedAt: 1 }]));
    localStorage.setItem('sakura_current_doc_v1', 'g');
  });
  await page.goto('file://' + indexPath);
  await page.waitForFunction(() => typeof (window as unknown as { createDoc?: unknown }).createDoc === 'function');
  await expect(page.locator('#header-title')).toHaveValue('My Title');
});

const stored = (page: Page) => page.evaluate(() => { const d = JSON.parse(localStorage.getItem('sakura_doc_v1_g') || '{}'); return { title: d.title, author: d.author }; });
const save = (page: Page) => page.evaluate(() => {
  // @ts-expect-error -- bare globals from index.html
  dirty = true; saveToStorage();
});

test('a value the browser puts into the title or author is not saved; the document keeps its own', async ({ page }) => {
  // What form restoration does: set the field's value with no event and no focus.
  await page.evaluate(() => { (document.getElementById('header-title') as HTMLInputElement).value = ''; (document.getElementById('doc-author') as HTMLInputElement).value = ''; });
  await save(page);
  expect(await stored(page)).toEqual({ title: 'My Title', author: 'Robin' });
  await expect(page.locator('#header-title')).toHaveValue('My Title');
  // And on the page coming back (pageshow), before any save.
  await page.evaluate(() => { (document.getElementById('header-title') as HTMLInputElement).value = 'stale'; window.dispatchEvent(new Event('pageshow')); });
  await expect(page.locator('#header-title')).toHaveValue('My Title');
});

test('the person can still rename or clear the title, and it is saved', async ({ page }) => {
  const title = page.locator('#header-title');
  await title.fill('Renamed');
  await save(page);
  expect((await stored(page)).title).toBe('Renamed');
  await title.fill('');
  await save(page);
  expect((await stored(page)).title).toBe('');
});

test('opening another document and restoring a version still set the title', async ({ page }) => {
  await page.evaluate(() => {
    // @ts-expect-error -- bare globals from index.html
    createDoc(); setDocTitleField('Second'); dirty = true; saveToStorage();
  });
  // @ts-expect-error -- bare global from index.html
  await page.evaluate(() => switchDoc('g'));
  await expect(page.locator('#header-title')).toHaveValue('My Title');
});
