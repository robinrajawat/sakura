import { test, expect, type Page } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

// Links in an inline note: a pasted titled link (SharePoint's "Copy link") or a bare URL must be
// clickable while editing (Ctrl/Cmd+click) and editable from the right-click menu.

const URL_A = 'https://example.sharepoint.com/:f:/r/sites/X/Shared%20Documents/SGI-83060?d=w96&csf=1';

test.use({ permissions: ['clipboard-read', 'clipboard-write'] });

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => { try { localStorage.setItem('sakura_welcome_seen', '1'); } catch { /* storage unavailable */ } });
});

async function seed(page: Page, note: string) {
  await page.goto('file://' + indexPath);
  await page.waitForFunction('typeof render === "function" && typeof nodes !== "undefined"');
  await page.evaluate((note) => {
    const l = document.getElementById('sakura-landing-overlay'); if (l) l.style.display = 'none';
    // @ts-expect-error -- bare globals from index.html
    nodes = [{ id: 1, depth: 0, text: 'Row', parentId: null, isCheckbox: false, checked: false, note, tables: [], images: [], tags: [], styles: {} }];
    // @ts-expect-error
    collapsedIds = new Set(); selectedId = null; multiSelectedIds = []; editingId = null; nextId = 2; undoStack = [];
    // @ts-expect-error
    inlineExpandNoteNodeIds = new Set([1]); forceInlineNoteId = note ? null : 1;
    // @ts-expect-error
    render();
  }, note);
}

async function setClipboard(page: Page, text: string, html?: string) {
  await page.evaluate(async ([text, html]) => {
    const items: Record<string, Blob> = { 'text/plain': new Blob([text], { type: 'text/plain' }) };
    if (html) items['text/html'] = new Blob([html], { type: 'text/html' });
    await navigator.clipboard.write([new ClipboardItem(items)]);
  }, [text, html ?? ''] as const);
}

const storedNote = (page: Page) => page.evaluate('nodes[0].note') as Promise<string>;

test('a pasted titled link opens with Ctrl/Cmd+click while editing, not with a plain click', async ({ page, context }) => {
  await seed(page, '');
  await setClipboard(page, URL_A, `<a href="${URL_A}">SGI-83060- Flexible night delivery</a>`);
  const note = page.locator('.node-note-line').first();
  await note.click();
  await page.keyboard.press('ControlOrMeta+V');
  const link = page.locator('.node-note-line a');
  await expect(link).toHaveText('SGI-83060- Flexible night delivery');

  let opened = 0;
  context.on('page', (p) => { opened++; p.close().catch(() => {}); });
  await link.click();
  await page.waitForTimeout(300);
  expect(opened).toBe(0);
  await link.click({ modifiers: ['ControlOrMeta'] });
  await expect.poll(() => opened).toBe(1);

  await link.hover();
  await expect(page.locator('#node-timestamp-tip')).toContainText('Ctrl/Cmd+click to open');
});

test('right-click a link: copy, edit and remove, each undoable', async ({ page }) => {
  await seed(page, 'See <a href="https://example.com/a">Project folder</a> end');
  const link = page.locator('.node-note-line a');
  const menu = page.locator('.sb-context-menu');

  await link.click({ button: 'right' });
  await expect(menu).toContainText('Open link');
  await menu.getByText('Copy link').click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('https://example.com/a');

  await link.click({ button: 'right' });
  await menu.getByText('Edit link…').click();
  const inputs = page.locator('#sakura-modal input');
  await expect(inputs.nth(0)).toHaveValue('Project folder');
  await inputs.nth(1).fill('https://example.com/b');
  await page.locator('#sakura-modal button', { hasText: 'Save' }).click();
  await expect.poll(() => storedNote(page)).toContain('href="https://example.com/b"');
  expect(await storedNote(page)).toContain('>Project folder</a>');
  await page.keyboard.press('ControlOrMeta+Z');
  await expect.poll(() => storedNote(page)).toContain('href="https://example.com/a"');

  await link.click({ button: 'right' });
  await menu.getByText('Remove link').click();
  await expect.poll(() => storedNote(page)).toBe('See Project folder end');
  await page.keyboard.press('ControlOrMeta+Z');
  await expect.poll(() => storedNote(page)).toContain('<a href="https://example.com/a">');
});

test('a pasted bare URL becomes a link; over selected text it links that text', async ({ page }) => {
  await seed(page, '');
  await setClipboard(page, URL_A);
  const note = page.locator('.node-note-line').first();
  await note.click();
  await page.keyboard.press('ControlOrMeta+V');
  await page.keyboard.type(' next');
  const html = await storedNote(page);
  expect(html).toMatch(/^<a href="[^"]+"[^>]*>https:\/\/example\.sharepoint\.com[^<]+<\/a>/);
  // Typing after the link stays outside it.
  expect(html).toMatch(/<\/a>(&nbsp;| )next$/);

  await seed(page, 'Project folder here');
  await setClipboard(page, URL_A);
  await page.locator('.node-note-line').first().click();
  await page.evaluate(() => {
    const line = document.querySelector('.node-note-line')!;
    const t = document.createTreeWalker(line, NodeFilter.SHOW_TEXT).nextNode()!;
    const r = document.createRange(); r.setStart(t, 0); r.setEnd(t, 14);
    const s = getSelection()!; s.removeAllRanges(); s.addRange(r);
  });
  await page.keyboard.press('ControlOrMeta+V');
  await expect.poll(() => storedNote(page)).toMatch(/^<a href="[^"]+"[^>]*>Project folder<\/a>(&nbsp;| )here$/);
});
