import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

const docIds = (page: import('@playwright/test').Page) =>
  // @ts-expect-error -- bare global from index.html
  page.evaluate(() => loadActiveDocsIndex().map((d: { id: string }) => d.id) as string[]);
const tabIds = (page: import('@playwright/test').Page) =>
  // @ts-expect-error -- bare global from index.html
  page.evaluate(() => openTabs.map((t: { docId: string }) => t.docId) as string[]);
const current = (page: import('@playwright/test').Page) =>
  // @ts-expect-error -- bare global from index.html
  page.evaluate(() => currentDocId as string);

// New document comes from the File Explorer (no tab strip since 2026-10-28).
// @ts-expect-error -- bare global from index.html
const newDoc = (page: import('@playwright/test').Page) => page.evaluate(() => createDoc());

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('sakura_welcome_seen', '1'));
  await page.goto('file://' + indexPath);
  await page.evaluate(() => {
    const l = document.getElementById('sakura-landing-overlay');
    if (l) l.style.display = 'none';
  });
});

// Opening a document with "+" and leaving it untouched used to leave an empty Untitled behind.
test('a new document left empty is removed when you switch away or close it', async ({ page }) => {
  await newDoc(page);
  const first = await current(page);
  // Even an added-but-blank row is still an empty document.
  await page.click('#es-first-row-btn');
  await page.keyboard.press('Escape');

  await newDoc(page);
  const second = await current(page);
  expect(second).not.toBe(first);
  expect(await docIds(page)).not.toContain(first);
  expect(await tabIds(page)).not.toContain(first);

  // @ts-expect-error -- bare global from index.html
  await page.evaluate(id => closeTab(id), second);
  expect(await docIds(page)).not.toContain(second);
});

test('a new document with anything in it is kept', async ({ page }) => {
  await newDoc(page);
  const withRow = await current(page);
  await page.click('#es-first-row-btn');
  await page.keyboard.type('Kick-off notes', { delay: 30 });
  await page.keyboard.press('Escape');

  await newDoc(page);
  const withTitle = await current(page);
  await page.fill('#header-title', 'Plan');
  await page.locator('#header-title').press('Enter');

  await newDoc(page);
  const ids = await docIds(page);
  expect(ids).toContain(withRow);
  expect(ids).toContain(withTitle);
});
