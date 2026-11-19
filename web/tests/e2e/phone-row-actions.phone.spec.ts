import { test, expect, type Page } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

// Owner 2026-11-19. On a phone: the editing toolbar's ⋯ opens the row menu (the same one a long-press
// opens), which now also sets a row's Status (Agreed, Follow-up, Out of scope) and adds to its
// thread. And objects whose editing isn't built for touch are never edited on a phone: tables
// (charts, boards, API requests), picture mark-up and notes holding a table or picture say
// "edit it on a computer" instead of half-working.

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

test.beforeEach(async ({ page }) => {
  await page.addInitScript((png) => {
    localStorage.setItem('sakura_welcome_seen', '1');
    sessionStorage.setItem('sakura_landing_dismissed', 'true');
    const n = (id: number, text: string, extra: Record<string, unknown> = {}) =>
      ({ id, depth: 0, text, parentId: null, isCheckbox: false, checked: false, note: '', tables: [], images: [], tags: [], styles: {}, ...extra });
    const table = '<table><thead><tr><th>A</th><th>B</th></tr></thead><tbody><tr><td>1</td><td>2</td></tr></tbody></table>';
    const chart = '<table data-feature-chart="1" data-chart-type="bar"><thead><tr><th>Label</th><th>Value</th></tr></thead><tbody><tr><td>Q1</td><td>120</td></tr><tr><td>Q2</td><td>150</td></tr></tbody></table>';
    localStorage.setItem('sakura_doc_v1_e', JSON.stringify({
      nodes: [
        n(1, 'Table row', { tables: [table] }),
        n(2, 'Chart row', { tables: [chart] }),
        n(3, 'Picture row', { images: [{ id: 'i1', src: png, caption: 'Pic', annotations: [], createdAt: 1 }] }),
        n(4, 'Note with a table', { note: '<p>See:</p>' + table }),
        n(5, 'Plain note', { note: '<p>Just words</p>' }),
        n(6, 'Status row')
      ],
      nextId: 7, collapsed: [], title: 'Objects'
    }));
    localStorage.setItem('sakura_docs_index_v1', JSON.stringify([{ id: 'e', title: 'Objects', updatedAt: 1 }]));
    localStorage.setItem('sakura_current_doc_v1', 'e');
  }, PNG);
  await page.goto('file://' + indexPath);
  await page.waitForFunction(() => typeof (window as unknown as { createDoc?: unknown }).createDoc === 'function');
  await expect(page.locator('#editor-pane')).toContainText('Status row');
  await page.evaluate(() => {
    const w = window as unknown as { showToast: (m: string) => void; __toasts: string[] };
    w.__toasts = [];
    const orig = w.showToast;
    w.showToast = function (m: string, ...r: unknown[]) { w.__toasts.push(String(m)); return (orig as (...a: unknown[]) => void).call(this, m, ...r); };
  });
});

const label = (page: Page, text: string) => page.locator('.node-row', { hasText: text }).first().locator('.node-label');
const toasts = (page: Page) => page.evaluate(() => (window as unknown as { __toasts: string[] }).__toasts);
// @ts-expect-error -- bare global from index.html
const node = (page: Page, id: number) => page.evaluate((i) => nodes.find((n: { id: number }) => n.id === i), id);
async function longPress(page: Page, text: string) {
  const box = (await label(page, text).boundingBox())!;
  const cdp = await page.context().newCDPSession(page);
  const pt = [{ x: box.x + 10, y: box.y + box.height / 2, id: 1 }];
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pt });
  await page.waitForTimeout(650);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
}
const editableCells = (page: Page) => page.locator('.node-table-line td[contenteditable="true"], .node-table-line th[contenteditable="true"]');

test('the toolbar\'s ⋯ opens the row menu, which sets and clears a Status', async ({ page }) => {
  const menu = page.locator('#phone-row-menu');
  await label(page, 'Status row').tap();
  await expect(page.locator('#phone-edit-bar')).toBeVisible();
  await page.locator('#phone-edit-bar [data-act="more"]').tap();
  await expect(menu).toBeVisible();
  await expect(menu.locator('.prm-title')).toHaveText('Status row');
  await expect(menu.locator('.prm-markers button')).toHaveText(['Agreed', 'Follow-up', 'Out of scope']);
  await menu.locator('[data-act="m-followup"]').tap();
  await expect(menu).toBeHidden();
  expect((await node(page, 6)).marker).toBe('followup');
  // The menu shows the current Status; tapping it again clears it, as on the desktop.
  await label(page, 'Status row').tap();
  await page.locator('#phone-edit-bar [data-act="more"]').tap();
  await expect(menu.locator('[data-act="m-followup"]')).toHaveAttribute('aria-pressed', 'true');
  await menu.locator('[data-act="m-followup"]').tap();
  expect((await node(page, 6)).marker || '').toBe('');
  // @ts-expect-error -- bare global from index.html
  expect(await page.evaluate(() => undoStack.length)).toBeGreaterThanOrEqual(2);
});

test('Add to thread opens the reply box for that row, and a reply is saved', async ({ page }) => {
  await label(page, 'Status row').tap();
  await page.locator('#phone-edit-bar [data-act="more"]').tap();
  await page.locator('#phone-row-menu [data-act="thread"]').tap();
  const input = page.locator('.thread-composer-input').first();
  await expect(input).toBeVisible();
  await input.tap();
  await page.keyboard.insertText('Check with legal');
  await input.press('Enter');
  // @ts-expect-error -- bare global from index.html
  await expect.poll(() => page.evaluate(() => nodeThread(6).map((e: { text: string }) => stripHtmlToText(e.text)))).toEqual(['Check with legal']);
});

test('tables, charts and API requests are not edited on a phone: tap or double-tap says so', async ({ page }) => {
  for (const name of ['Table row', 'Chart row']) {
    const fig = page.locator('.node-row', { hasText: name }).first().locator('xpath=following-sibling::*[1]');
    await fig.tap();
    await fig.tap();
  }
  await expect(editableCells(page)).toHaveCount(0);
  expect(await toasts(page)).toContain('Tables are edited on a computer.');
  // The API request form is guarded on its own as well.
  // @ts-expect-error -- bare global from index.html
  await page.evaluate(() => openApiRequestEditor(nodes[0], 0));
  expect(await toasts(page)).toContain('API requests are edited on a computer.');
  // Nothing in the document changed.
  expect((await node(page, 1)).tables[0]).toBe('<table><thead><tr><th>A</th><th>B</th></tr></thead><tbody><tr><td>1</td><td>2</td></tr></tbody></table>');
});

test('pictures open to view, but mark-up says to use a computer', async ({ page }) => {
  await page.locator('.node-row', { hasText: 'Picture row' }).first().locator('xpath=following-sibling::*[1]').locator('img').first().tap();
  await expect(page.locator('#node-image-viewer')).toBeVisible();
  // @ts-expect-error -- bare global from index.html
  await page.evaluate(() => setNodeImageMarkupMode(true));
  expect(await toasts(page)).toContain('Pictures are marked up on a computer.');
  await expect(page.locator('#node-image-viewer .niv-markup-bar')).toBeHidden();
});

test('notes hold only words when edited: a table in a note moves onto its row before it can be edited', async ({ page }) => {
  // Loading and every render move a table out of a note onto its row (migrateNoteTablesToNode), so a
  // note opened for typing never holds one, on a phone or a computer.
  expect((await node(page, 4)).note).not.toContain('<table');
  // @ts-expect-error -- bare global from index.html
  const after = await page.evaluate(() => { nodes[3].note = '<p>See:</p><table><tbody><tr><td>a</td></tr></tbody></table>'; render(); return { note: nodes[3].note, tables: nodes[3].tables.length }; });
  expect(after.note).not.toContain('<table');
  expect(after.tables).toBeGreaterThanOrEqual(1);
  // The phone's own safety net recognises a note with objects, should one ever reach it.
  // @ts-expect-error -- bare global from index.html
  expect(await page.evaluate(() => [noteHasObjects('<p>a</p><table></table>'), noteHasObjects('<img src=x>'), noteHasObjects('<p>words</p>')])).toEqual([true, true, false]);
  // A plain note still edits on a phone.
  await page.evaluate(() => { const w = window as unknown as { eval: (s: string) => void }; w.eval('inlineExpandNoteNodeIds = new Set([5]); render();'); });
  await expect(page.locator('.node-note-line[data-node-id="5"]')).toHaveAttribute('contenteditable', 'true');
});

test('the editing toolbar fits the narrowest phone (320px) with Done fully on screen', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await label(page, 'Status row').tap();
  const bar = page.locator('#phone-edit-bar');
  await expect(bar).toBeVisible();
  const r = await bar.evaluate((b) => ({ overflow: b.scrollWidth > b.clientWidth, right: Math.max(...[...b.querySelectorAll('button')].map((x) => x.getBoundingClientRect().right)), minW: Math.min(...[...b.querySelectorAll('button')].map((x) => x.getBoundingClientRect().width)) }));
  expect(r.overflow).toBe(false);
  expect(r.right).toBeLessThanOrEqual(320);
  expect(r.minW).toBeGreaterThanOrEqual(36);
});

test('folding a row leaves no grey box over its first letters (Safari keeps :hover after a tap)', async ({ page }) => {
  // @ts-expect-error -- bare globals from index.html
  await page.evaluate(() => { nodes.push({ ...nodes[5], id: 7, depth: 1, text: 'Child row', marker: '' }); nextId = 8; rebuildParentIds(); render(); });
  const dot = page.locator('.node-row', { hasText: 'Status row' }).first().locator('.fold-dot');
  await dot.tap();
  await dot.hover();
  const bg = await dot.evaluate((d) => getComputedStyle(d).backgroundColor);
  expect(bg).toBe('rgba(0, 0, 0, 0)');
});

test('the menu says "Start a thread" on a row without one, "Add to thread" once it has one', async ({ page }) => {
  const item = page.locator('#phone-row-menu [data-act="thread"]');
  await label(page, 'Status row').tap();
  await page.locator('#phone-edit-bar [data-act="more"]').tap();
  await expect(item).toHaveText('Start a thread');
  await item.tap();
  const input = page.locator('.thread-composer-input').first();
  await input.tap();
  await page.keyboard.insertText('First point');
  await input.press('Enter');
  // @ts-expect-error -- bare global from index.html
  await expect.poll(() => page.evaluate(() => nodeThread(6).length)).toBe(1);
  await label(page, 'Status row').tap();
  await page.locator('#phone-edit-bar [data-act="more"]').tap();
  await expect(item).toHaveText('Add to thread');
});

test('an empty reply box closes when another row is tapped, and that row is edited; a typed reply stays', async ({ page }) => {
  await label(page, 'Status row').tap();
  await page.locator('#phone-edit-bar [data-act="more"]').tap();
  await page.locator('#phone-row-menu [data-act="thread"]').tap();
  await expect(page.locator('.thread-composer-input')).toHaveCount(1);
  await label(page, 'Plain note').tap();
  await expect(page.locator('.thread-composer-input')).toHaveCount(0);
  // @ts-expect-error -- bare global from index.html
  expect(await page.evaluate(() => editingId)).toBe(5);
  // Words typed in the box are never thrown away by tapping elsewhere.
  await label(page, 'Status row').tap();
  await page.locator('#phone-edit-bar [data-act="more"]').tap();
  await page.locator('#phone-row-menu [data-act="thread"]').tap();
  await page.locator('.thread-composer-input').first().tap();
  await page.keyboard.insertText('Half a thought');
  await label(page, 'Plain note').tap();
  await expect(page.locator('.thread-composer-input')).toHaveCount(1);
  await expect(page.locator('.thread-composer-input').first()).toContainText('Half a thought');
});

test('deleting a row on a phone offers Undo, which brings it back; not after something else changed', async ({ page }) => {
  const del = async (name: string) => {
    await label(page, name).tap();
    await page.locator('#phone-edit-bar [data-act="more"]').tap();
    await page.locator('#phone-row-menu [data-act="delete"]').tap();
  };
  await del('Status row');
  await expect(page.locator('.node-row', { hasText: 'Status row' })).toHaveCount(0);
  await page.locator('#toast button').filter({ hasText: 'Undo' }).first().tap();
  await expect(page.locator('.node-row', { hasText: 'Status row' })).toHaveCount(1);
  // Undo takes back only that delete: after another change it says so and changes nothing.
  await del('Status row');
  // @ts-expect-error -- bare globals from index.html
  await page.evaluate(() => { pushUndo(); nodes[0].text = 'Table row edited'; render(); });
  await page.locator('#toast button').filter({ hasText: 'Undo' }).first().tap();
  expect(await toasts(page)).toContain('Something else has changed since, so this delete can’t be undone here.');
  await expect(page.locator('.node-row', { hasText: 'Status row' })).toHaveCount(0);
});
