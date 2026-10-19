import { test, expect, type Page } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

// Thread polish (owner design 2026-10-15): the reply line's actions in three groups with the kind
// icons (Ask | to / Yes / No | statuses); an entry's author is picked from the document's names (or
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

test('reply line: Ask, Decision | Yes / No | statuses, each with its kind icon', async ({ page }) => {
  const errors = await seed(page);
  await page.evaluate('openThreadComposer(1, false)');
  const acts = page.locator('.thread-composer .thread-actions');
  const shape = await acts.evaluate((a) => [...a.children].map((c) => c.classList.contains('thread-btn-sep') ? '|'
    : c.classList.contains('thread-btn-group') || c.classList.contains('thread-btn-statuses') ? [...c.children].map((b) => (b as HTMLElement).dataset.act).join(',')
      : (c as HTMLElement).dataset.act));
  expect(shape).toEqual(['ask', 'decision', '|', 'yes,no', '|', 'followup,parked']);
  await expect(acts.locator('.thread-btn .thread-btn-kind svg')).toHaveCount(6);
  // Actions start right under the text, and the keyboard hint right under them (one left column).
  const order = await page.locator('.thread-composer .thread-composer-foot').evaluate((f) => [...f.children].map((c) => c.className));
  expect(order).toEqual(['thread-actions', 'thread-composer-hint']);
  const x = await page.evaluate(() => {
    const inp = document.querySelector('.thread-composer .thread-composer-input')!.getBoundingClientRect();
    const act = document.querySelector('.thread-composer .thread-actions')!.getBoundingClientRect();
    const hint = document.querySelector('.thread-composer .thread-composer-hint')!.getBoundingClientRect();
    return [Math.abs(act.left + 6 - inp.left), Math.abs(hint.left - inp.left), hint.top >= act.bottom - 1];
  });
  expect(x[0]).toBeLessThan(4);
  expect(x[1]).toBeLessThan(4);
  expect(x[2]).toBe(true);
  expect(errors).toEqual([]);
});

test('Decision on the reply line adds what you typed as a decision entry; the row marker stays', async ({ page }) => {
  const errors = await seed(page);
  await page.evaluate('openThreadComposer(1, false)');
  const dec = page.locator('.thread-composer .thread-btn[data-act="decision"]');
  // Nothing typed: nothing is added.
  await dec.click();
  expect(await page.evaluate('remarks.length')).toBe(2);
  await page.locator('.thread-composer .thread-composer-input').click();
  await page.keyboard.type('Go live Saturday 06:00');
  await page.locator('.thread-composer .thread-btn[data-act="decision"]').click();
  const added = await page.evaluate("(() => { const r = remarks[remarks.length - 1]; return [r.text, !!r.decision, r.type || '', r.status || '', nodes[0].marker || '']; })()");
  expect(added).toEqual(['Go live Saturday 06:00', true, '', '', '']);
  await expect(page.locator('.thread-head')).toContainText('Decision');
  // A question can't be a decision: Ask hides the button.
  await page.evaluate('openThreadComposer(1, true)');
  await expect(page.locator('.thread-composer .thread-btn[data-act="decision"]')).toHaveCount(0);
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
