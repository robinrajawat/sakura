import { test, expect, type Page } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

// Thread polish (owner design 2026-10-15, 2026-10-27): the end-of-thread line picks one kind
// (Comment · Question · Decision); an entry's author is picked from the document's names (or
// "Someone else…"); pasting into a thread keeps bold/italic/links/lists/line breaks and drops fonts,
// sizes and colours.

const KNOWN_NOISE = /ServiceWorker|cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net|embed\.diagrams\.net|CORS policy|Failed to load resource|net::ERR/i;

async function seed(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (err) => { if (!KNOWN_NOISE.test(err.message)) errors.push(err.message); });
  await page.addInitScript(() => { try { localStorage.setItem('sakura_welcome_seen', '1'); sessionStorage.setItem('sakura_landing_dismissed', 'true'); } catch { /* storage unavailable */ } });
  await page.setViewportSize({ width: 1300, height: 900 });
  await page.goto('file://' + indexPath);
  await page.waitForFunction('typeof render === "function"');
  await page.evaluate(`
    const n = (id, depth, text) => ({ id, depth, text, parentId: null, isCheckbox: false, checked: false, note: '', tables: [], images: [], tags: [], styles: {} });
    nodes = [n(1, 0, 'Cutover')]; rebuildParentIds(); nextId = 2;
    remarks = [
      { id: 'q1', anchorNodeId: 1, person: 'Karsten', date: '2026-10-15', text: 'Does the EU file load before Saturday?', type: 'question', createdAt: 1 },
      { id: 'c1', anchorNodeId: 1, person: 'Ana', date: '2026-10-15', text: 'Weekend works for ops.', createdAt: 2 }
    ];
    inlineExpandRemarksNodeIds = new Set([1]); collapsedIds = new Set(); editingId = null; undoStack = []; render();
  `);
  return errors;
}

test('the line\'s icon picks the kind: Comment, Question or Decision (owner, 2026-10-27); no buttons under the line', async ({ page }) => {
  const errors = await seed(page);
  await page.evaluate('openThreadComposer(1, false)');
  const icon = page.locator('.thread-composer .thread-kind');
  const input = page.locator('.thread-composer .thread-composer-input');
  await expect(page.locator('.thread-composer .thread-btn')).toHaveCount(0);
  await expect(page.locator('.thread-composer .thread-composer-hint')).toHaveCount(0);
  await expect(icon).toHaveClass(/is-comment/);
  await expect(icon).toHaveAttribute('data-tip', /^Comment — click to change/);
  await expect(input).toHaveAttribute('data-placeholder', 'Add a comment…');
  // Picking a kind keeps what you typed; the icon and placeholder follow it.
  await input.click();
  await page.keyboard.type('Go live Saturday 06:00');
  await icon.click();
  const menu = page.locator('.sb-context-menu');
  await expect(menu.locator('.sb-context-item', { hasText: 'Comment' }).locator('.sb-context-meta')).toHaveText('✓');
  await menu.getByText('Decision', { exact: true }).click();
  await expect(page.locator('.thread-composer .thread-kind')).toHaveClass(/is-decision/);
  await expect(input).toHaveText('Go live Saturday 06:00');
  await expect(input).toHaveAttribute('data-placeholder', 'Record a decision…');
  await input.click();
  await page.keyboard.press('Enter');
  const added = await page.evaluate("(() => { const r = remarks[remarks.length - 1]; return [r.text, !!r.decision, r.type || '', nodes[0].marker || '']; })()");
  expect(added).toEqual(['Go live Saturday 06:00', true, '', '']);
  // After adding, the line is back to Comment.
  await expect(page.locator('.thread-composer .thread-kind')).toHaveClass(/is-comment/);
  await page.locator('.thread-composer .thread-kind').click();
  await menu.getByText('Question', { exact: true }).click();
  await expect(input).toHaveAttribute('data-placeholder', 'Ask a question…');
  await input.click();
  await page.keyboard.type('Who signs off?');
  await page.keyboard.press('Enter');
  expect(await page.evaluate('remarks[remarks.length - 1].type')).toBe('question');
  expect(errors).toEqual([]);
});

test('an entry\'s author: click → pick a name from the document, or type someone else', async ({ page }) => {
  await seed(page);
  const name = page.locator('.thread-entry:has(#inline-remark-text-c1) .node-remark-person-inline');
  await name.click();
  const menu = page.locator('.sb-context-menu');
  await expect(menu).toContainText('Karsten');
  await menu.getByText('Karsten', { exact: true }).click();
  expect(await page.evaluate("remarks.find(r => r.id === 'c1').person")).toBe('Karsten');
  await page.keyboard.press('ControlOrMeta+Z');
  expect(await page.evaluate("remarks.find(r => r.id === 'c1').person")).toBe('Ana');

  await page.locator('.thread-entry:has(#inline-remark-text-c1) .node-remark-person-inline').click();
  await page.locator('.sb-context-menu').getByText('Someone else…').click();
  await page.keyboard.type('Priya');
  await page.keyboard.press('Enter');
  expect(await page.evaluate("remarks.find(r => r.id === 'c1').person")).toBe('Priya');
});

test('pasting into an entry keeps bold, links and lists, and drops fonts, sizes and colours', async ({ page }) => {
  await seed(page);
  const text = page.locator('#inline-remark-text-c1');
  await text.click();
  await page.keyboard.press('End');
  await page.evaluate(() => {
    const el = document.getElementById('inline-remark-text-c1')!;
    const dt = new DataTransfer();
    dt.setData('text/html', '<span style="font-family:Calibri;font-size:11pt;color:#1f497d"> See <b>this</b> <a href="https://example.com/x" class="x">link</a></span><ul><li style="color:red">one</li></ul><o:p></o:p>');
    dt.setData('text/plain', ' See this link one');
    el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
  });
  const html = await text.evaluate((e) => e.innerHTML);
  expect(html).toContain('<b>this</b>');
  expect(html).toMatch(/<a href="https:\/\/example\.com\/x" target="_blank" rel="noopener noreferrer">link<\/a>/);
  expect(html).toContain('<li>one</li>');
  expect(html).not.toMatch(/font-family|font-size|color|class=|<span|o:p/i);
});
