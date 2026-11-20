import { test, expect, type Page } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

// Owner 2026-11-20 (iPhone): a thread had a comment, a question and, below them, an unsent entry
// typed as Raja. Tapping Reply on the question turned that unsent text into a reply to the question,
// written as the owner. Unsent text now keeps its target and its author, and says it isn't sent.

const row = (id: number, text: string) => ({ id, depth: 0, text, parentId: null, isCheckbox: false, checked: false, note: '', tables: [], images: [], tags: [], styles: {} });

async function setup(page: Page) {
  await page.addInitScript(() => { localStorage.setItem('sakura_welcome_seen', '1'); sessionStorage.setItem('sakura_landing_dismissed', 'true'); });
  await page.setViewportSize({ width: 1300, height: 900 });
  await page.goto('file://' + indexPath);
  await page.waitForFunction(() => (window as unknown as { __sakuraMainDone?: boolean }).__sakuraMainDone === true);
  await page.evaluate((rows) => {
    // @ts-expect-error -- bare globals from index.html
    createDoc(); nodes = rows.map(normalizeNode); nextId = 2;
    // @ts-expect-error -- bare globals from index.html
    remarks = [{ id: 'c1', anchorNodeId: 1, person: 'Robin', text: 'this will be checked.', context: '', createdAt: 1 }, { id: 'q1', anchorNodeId: 1, person: 'Robin', text: 'What to say?', context: '', createdAt: 2, type: 'question' }];
    // The unsent entry, written as Raja (a draft, as the app saves one while typing).
    // @ts-expect-error -- bare globals from index.html
    typedDrafts.put(threadDraftKey(currentDocId, 1), { html: 'We need to take this with Raja', at: Date.now(), person: 'Raja' });
    // @ts-expect-error -- bare globals from index.html
    _threadAuthor = null; _threadDraftsRevealedFor = undefined; render();
  }, [row(1, 'Validation')]);
}
// @ts-expect-error -- bare globals from index.html
const draft = (page: Page) => page.evaluate(() => typedDrafts.entry(threadDraftKey(currentDocId, 1)) || null);

test('unsent text shows its own author and says it is not sent', async ({ page }) => {
  await setup(page);
  const box = page.locator('.thread-composer').first();
  await expect(box.locator('.thread-composer-input')).toHaveText('We need to take this with Raja');
  await expect(box.locator('.thread-author-btn')).toHaveText('Raja ▾');
  await expect(box.locator('.thread-unsent')).toBeVisible();
  await expect(box.locator('.thread-unsent')).toHaveText('Not sent');
});

test('Reply on a question does not take over unsent text written for the thread', async ({ page }) => {
  await setup(page);
  // @ts-expect-error -- bare globals from index.html
  await page.evaluate(() => openThreadComposer(1, false, 'q1'));
  await expect(page.locator('#toast')).toContainText('You have an unsent entry here');
  const d = await draft(page);
  expect(d.answerTo).toBeUndefined();
  expect(d.person).toBe('Raja');
  await expect(page.locator('.thread-composer').first()).not.toHaveClass(/is-nested/);
});

test('sending it posts it as written: by Raja, at the end of the thread, not as a reply', async ({ page }) => {
  await setup(page);
  // @ts-expect-error -- bare globals from index.html
  await page.evaluate(() => openThreadComposer(1, false, 'q1'));
  const input = page.locator('.thread-composer-input').first();
  await input.click();
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  // @ts-expect-error -- bare globals from index.html
  const posted = await page.evaluate(() => remarks.find((r: { text: string }) => r.text.includes('Raja')));
  expect(posted.person).toBe('Raja');
  expect(posted.answerTo).toBeUndefined();
  expect(await draft(page)).toBeNull();
});

test('with no unsent text, Reply on a question still opens a reply to it', async ({ page }) => {
  await setup(page);
  // @ts-expect-error -- bare globals from index.html
  await page.evaluate(() => { typedDrafts.remove(threadDraftKey(currentDocId, 1)); openThreadComposer(1, false, 'q1'); });
  await expect(page.locator('.thread-composer').first()).toHaveClass(/is-nested/);
  await expect(page.locator('.thread-composer .thread-unsent').first()).toBeHidden();
});
