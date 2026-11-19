import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

// Diagram content lives in IndexedDB. Safari (iOS above all) can lose the page's connection to it
// while the app is in the background, without telling the page; every save and load on that
// connection then fails until a reload. Two promises are kept here: a lost connection is replaced
// by a fresh one, and if a save still fails, the diagram's latest content is kept in localStorage
// (as the warning says), never only in memory.

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => { try { localStorage.setItem('sakura_welcome_seen', '1'); sessionStorage.setItem('sakura_landing_dismissed', 'true'); } catch { /* storage unavailable */ } });
  await page.goto('file://' + indexPath);
  await expect.poll(() => page.evaluate('typeof render === "function"')).toBe(true);
});

test('a lost IndexedDB connection is replaced, and saving and loading carry on', async ({ page }) => {
  const r = await page.evaluate(async () => {
    const w = window as unknown as { idbOpen: () => Promise<IDBDatabase>; idbSet: (k: string, v: unknown) => Promise<boolean>; idbGet: (k: string) => Promise<unknown> };
    await w.idbSet('test:k', { a: 1 });
    // What Safari leaves behind: the cached connection is closed, and no `close` event says so.
    (await w.idbOpen()).close();
    const saved = await w.idbSet('test:k', { a: 2 });
    const read = await w.idbGet('test:k');
    (await w.idbOpen()).close();
    const readAgain = await w.idbGet('test:k');
    return { saved, read, readAgain };
  });
  expect(r).toEqual({ saved: true, read: { a: 2 }, readAgain: { a: 2 } });
});

test('when a diagram still can\'t be saved there, its latest content is kept in localStorage and a plain warning shows', async ({ page }) => {
  await page.evaluate(`
    createDoc();
    nodes = [{ id: 1, depth: 0, text: 'Flow', parentId: null, isCheckbox: false, checked: false, note: '', tables: [], images: [], tags: [], styles: {} }];
    rebuildParentIds(); nextId = 2;
    diagrams = [{ id: 'd1', title: 'Flow', anchorNodeId: 1, xml: '<mxfile>v1</mxfile>', previewSvg: '', pageSvgs: [], modifiedAt: 1, _hydrated: true }];
    render(); saveToStorage();
  `);
  // Let the first save reach IndexedDB, so the diagram counts as saved there.
  await expect.poll(() => page.evaluate('diagrams[0].blobSynced')).toBe(true);
  const stored = () => page.evaluate('JSON.parse(localStorage.getItem(docKey(currentDocId))).diagrams[0].xml');
  const before = await page.evaluate('saveToStorage(); JSON.parse(localStorage.getItem(docKey(currentDocId))).diagrams[0].xml');
  // Now IndexedDB refuses every write, and the diagram is edited.
  await page.evaluate(`idbSet = async () => false; diagrams[0].xml = '<mxfile>v2</mxfile>'; diagrams[0].modifiedAt = 2; saveToStorage();`);
  await expect.poll(stored).toBe('<mxfile>v2</mxfile>');
  expect(before).toBeUndefined(); // saved in IndexedDB, so localStorage held only the metadata
  expect(await page.evaluate('diagrams[0].blobSynced')).toBe(false);
  await expect(page.getByText(/Diagrams couldn.t be saved to this browser.s storage just now, so your changes are being kept another way/).first()).toBeVisible();
});

test('several saves failing on a lost connection at once all recover on one fresh connection', async ({ page }) => {
  const r = await page.evaluate(async () => {
    const w = window as unknown as { idbOpen: () => Promise<IDBDatabase>; idbSet: (k: string, v: unknown) => Promise<boolean>; idbGet: (k: string) => Promise<unknown> };
    (await w.idbOpen()).close();
    const saved = await Promise.all([1, 2, 3, 4].map((i) => w.idbSet('test:p' + i, i)));
    const read = await Promise.all([1, 2, 3, 4].map((i) => w.idbGet('test:p' + i)));
    return { saved, read };
  });
  expect(r).toEqual({ saved: [true, true, true, true], read: [1, 2, 3, 4] });
});
