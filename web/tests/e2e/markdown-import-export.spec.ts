import { test, expect, type Page } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

// Markdown import and export (owner 2026-11-19, docs/markdown-plan.md): File Explorer + → Import
// (.md, .opml)… or a dropped file makes a new document; Share → Export as → Markdown downloads a .md
// that reads back to the same document.

const SAMPLE = [
  '# Q1 plan', '',
  '## Goals', '', 'Why we do this.', '',
  '- [x] Hire **two** engineers',
  '- [ ] Ship [v2](https://example.com/v2)',
  '  - Scope', '', '    Details of the scope.', '',
  '## Budget', '',
  '| Item | Cost |', '|---|---|', '| Laptops | 4000 |', ''
].join('\n');

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try { localStorage.setItem('sakura_welcome_seen', '1'); sessionStorage.setItem('sakura_landing_dismissed', 'true'); } catch { /* storage unavailable */ }
  });
  await page.goto('file://' + indexPath);
  await page.waitForFunction(() => typeof (window as unknown as { importMarkdownText?: unknown }).importMarkdownText === 'function');
  await page.evaluate(() => document.getElementById('sakura-landing-overlay')?.style.setProperty('display', 'none'));
});

async function docState(page: Page) {
  return page.evaluate(() => ({
    // @ts-expect-error -- bare globals from index.html
    title: (document.getElementById('header-title') as HTMLInputElement).value, rows: nodes.map((n) => ({
      text: n.text, depth: n.depth, heading: n.styles.heading, box: n.isCheckbox ? (n.checked ? 'x' : ' ') : '',
      note: n.note, tables: n.tables.length, marks: (n.marks || []).map((m: { k: string }) => m.k).join(',')
    }))
  }));
}

test('the + menu imports a .md file as a new document with its title, headings, To-Dos, notes and tables', async ({ page }) => {
  // @ts-expect-error -- bare globals from index.html
  const before = await page.evaluate(() => loadActiveDocsIndex().length);
  await page.locator('#sakura-opml-file-input').setInputFiles({ name: 'plan.md', mimeType: 'text/markdown', buffer: Buffer.from(SAMPLE) });
  await expect(page.locator('.toast, #toast').filter({ hasText: 'Imported 5 rows' }).first()).toBeVisible();
  const s = await docState(page);
  expect(s.title).toBe('Q1 plan');
  expect(s.rows.map((r) => [r.depth, r.text, r.heading, r.box])).toEqual([
    [0, 'Goals', 1, ''], [1, 'Hire two engineers', 0, 'x'], [1, 'Ship v2', 0, ' '], [2, 'Scope', 0, ''], [0, 'Budget', 1, '']
  ]);
  expect(s.rows[0].note).toBe('<p>Why we do this.</p>');
  expect(s.rows[1].marks).toBe('b');
  expect(s.rows[2].marks).toBe('a');
  expect(s.rows[3].note).toBe('<p>Details of the scope.</p>');
  expect(s.rows[4].tables).toBe(1);
  // @ts-expect-error -- bare globals from index.html
  expect(await page.evaluate(() => loadActiveDocsIndex().length)).toBe(before + 1);
  await expect(page.locator('#sidebar').getByText('Q1 plan').first()).toBeVisible();
});

test('a dropped .md file imports too; the file name is the title when there is no # heading', async ({ page }) => {
  await page.evaluate(() => {
    const dt = new DataTransfer();
    dt.items.add(new File(['- one\n- two\n'], 'Shopping list.md', { type: 'text/markdown' }));
    document.getElementById('sidebar')!.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
  });
  await expect.poll(async () => (await docState(page)).title).toBe('Shopping list');
  expect((await docState(page)).rows.map((r) => r.text)).toEqual(['one', 'two']);
});

test('Share → Export as → Markdown downloads a .md that imports back to the same document', async ({ page }) => {
  await page.locator('#sakura-opml-file-input').setInputFiles({ name: 'plan.md', mimeType: 'text/markdown', buffer: Buffer.from(SAMPLE) });
  await expect.poll(async () => (await docState(page)).rows.length).toBe(5);
  const original = await docState(page);

  await page.locator('#doc-share-chip').click();
  await expect(page.locator('#share-menu .sb-context-heading')).toHaveText(['Export as']);
  const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#share-menu [data-save="md"]').click()]);
  expect(download.suggestedFilename()).toBe('Q1 plan.md');
  const md = fs.readFileSync((await download.path())!, 'utf8');
  expect(md).toContain('# Q1 plan');
  expect(md).toContain('## Goals');
  expect(md).toContain('- [x] Hire **two** engineers');
  expect(md).toContain('- [ ] Ship [v2](https://example.com/v2)');
  expect(md).toContain('| Laptops | 4000 |');

  await page.locator('#sakura-opml-file-input').setInputFiles({ name: 'again.md', mimeType: 'text/markdown', buffer: Buffer.from(md) });
  await expect.poll(async () => (await docState(page)).title).toBe('Q1 plan');
  const back = await docState(page);
  expect(back.rows).toEqual(original.rows);
});

test('export names what Markdown cannot hold, and says so', async ({ page }) => {
  await page.locator('#sakura-opml-file-input').setInputFiles({ name: 'a.md', mimeType: 'text/markdown', buffer: Buffer.from('- row with a picture') });
  await expect.poll(async () => (await docState(page)).rows.length).toBe(1);
  await page.evaluate(() => {
    // @ts-expect-error -- bare globals from index.html
    nodes[0].images = [{ id: 'i1', src: 'data:image/png;base64,AAAA', caption: 'Floor plan', annotations: [], createdAt: 1 }];
  });
  await page.locator('#doc-share-chip').click();
  const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#share-menu [data-save="md"]').click()]);
  const md = fs.readFileSync((await download.path())!, 'utf8');
  expect(md).toContain('*\\[Picture: Floor plan\\]*');
  expect(md).not.toContain('base64');
  await expect(page.getByText(/1 picture listed by name only; export as PDF to keep them/).first()).toBeVisible();
});

test('nothing in a hostile file runs, and big or empty files are refused without a new document', async ({ page }) => {
  const evil = '# <img src=x onerror="window.__pwned=1">Title\n\n- <script>window.__pwned=2</script>row\n\n```\n<img src=x onerror="window.__pwned=3">\n```\n\n| <img src=x onerror="window.__pwned=4"> |\n|---|\n';
  await page.locator('#sakura-opml-file-input').setInputFiles({ name: 'evil.md', mimeType: 'text/markdown', buffer: Buffer.from(evil) });
  await expect.poll(async () => (await docState(page)).rows.length).toBeGreaterThan(0);
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => (window as unknown as { __pwned?: number }).__pwned)).toBeUndefined();
  const html = await page.locator('#editor-pane').innerHTML();
  expect(html).not.toMatch(/onerror|<script/i);

  // @ts-expect-error -- bare globals from index.html
  const count = await page.evaluate(() => loadActiveDocsIndex().length);
  await page.evaluate(async () => {
    // @ts-expect-error -- bare globals from index.html
    await importDocumentFile(new File(['x'.repeat(5 * 1024 * 1024 + 1)], 'big.md', { type: 'text/markdown' }));
    // @ts-expect-error -- bare globals from index.html
    await importDocumentFile(new File(['\n\n  \n'], 'empty.md', { type: 'text/markdown' }));
  });
  // @ts-expect-error -- bare globals from index.html
  expect(await page.evaluate(() => loadActiveDocsIndex().length)).toBe(count);
});

test('an .opml file still imports through the same Import item', async ({ page }) => {
  const opml = '<?xml version="1.0"?><opml version="2.0"><head><title>x</title></head><body><outline text="A"><outline text="B"/></outline></body></opml>';
  await page.locator('#sakura-opml-file-input').setInputFiles({ name: 'x.opml', mimeType: 'text/x-opml', buffer: Buffer.from(opml) });
  await expect.poll(async () => (await docState(page)).rows.map((r) => [r.depth, r.text])).toEqual([[0, 'A'], [1, 'B']]);
});
