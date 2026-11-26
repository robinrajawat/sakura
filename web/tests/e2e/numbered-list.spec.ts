import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

// Numbered lists (owner 2026-11-26): Row › Numbered list on a row numbers its direct children 1, 2,
// 3 in place of their dots. Nothing goes into the text, so moving a row renumbers the list.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => { try { localStorage.setItem('sakura_welcome_seen', '1'); sessionStorage.setItem('sakura_landing_dismissed', 'true'); } catch { /* storage unavailable */ } });
  await page.setViewportSize({ width: 1300, height: 800 });
  await page.goto('file://' + indexPath);
  await page.waitForFunction('typeof render === "function"');
  await page.evaluate(() => (window as any).eval(`
    const n = (id, depth, text) => ({ id, depth, text, parentId: null, isCheckbox: false, checked: false, note: '', tags: [], styles: {} });
    nodes = [n(1, 0, 'Summary'), n(2, 0, 'Runtime flow'), n(3, 1, 'Warehouse document is created'), n(4, 2, 'Inbound delivery or outbound order'),
      n(5, 1, 'EWM determines the storage process'), n(6, 1, 'EWM reads the POSC definition'), n(7, 0, 'Typical use cases')].map(normalizeNode);
    rebuildParentIds(); nextId = 8; collapsedIds = new Set(); selectedId = null; editingId = null; undoStack = []; render();`));
});

const nums = (page) => page.evaluate(() => Array.from(document.querySelectorAll('.node-row')).map((r) => (r.querySelector('.is-num') as HTMLElement | null)?.dataset.num || ''));

async function toggleFromMenu(page, id: number) {
  await page.locator(`.node-row[data-id="${id}"]`).click({ button: 'right' });
  await page.locator('#context-more-toggle').click();
  await page.locator('#context-more-panel [data-flyout="row"]').hover();
  await page.locator('#context-menu [data-action="numbered"]').click();
}

test('Row › Numbered list numbers the direct children only, and undo takes it back', async ({ page }) => {
  await toggleFromMenu(page, 2);
  expect(await nums(page)).toEqual(['', '', '1.', '', '2.', '3.', '']);
  expect(await page.evaluate(() => (window as any).eval('nodes[1].numbered'))).toBe(true);
  // The words are untouched.
  expect(await page.evaluate(() => (window as any).eval('nodes[2].text'))).toBe('Warehouse document is created');
  await page.screenshot({ path: test.info().outputPath('numbered.png') });
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+z' : 'Control+z');
  expect(await nums(page)).toEqual(['', '', '', '', '', '', '']);
});

test('the menu offers Bulleted list once numbered, and moving a row renumbers', async ({ page }) => {
  await toggleFromMenu(page, 2);
  await page.locator('.node-row[data-id="2"]').click({ button: 'right' });
  await page.locator('#context-more-toggle').click();
  await page.locator('#context-more-panel [data-flyout="row"]').hover();
  await expect(page.locator('#context-menu [data-action="numbered"]')).toContainText('Bulleted list');
  await page.keyboard.press('Escape');
  // Move the last step to the top: it becomes 1.
  for (let k = 0; k < 2; k++) {
    await page.locator('.node-row[data-id="6"]').click({ button: 'right' });
    await page.locator('#context-more-toggle').click();
    await page.locator('#context-more-panel [data-action="up"]').click();
  }
  expect(await page.evaluate(() => (window as any).eval('nodes.map(n => n.id)'))).toEqual([1, 2, 6, 3, 4, 5, 7]);
  expect(await nums(page)).toEqual(['', '', '1.', '2.', '', '3.', '']);
});

test('a row without children cannot be numbered', async ({ page }) => {
  await page.locator('.node-row[data-id="1"]').click({ button: 'right' });
  await page.locator('#context-more-toggle').click();
  await page.locator('#context-more-panel [data-flyout="row"]').hover();
  await expect(page.locator('#context-menu [data-action="numbered"]')).toHaveClass(/disabled|sb-context-disabled/);
});

test('it survives a save and reload, and the whole-document Outline numbering takes over when on', async ({ page }) => {
  await toggleFromMenu(page, 2);
  const saved = await page.evaluate(() => (window as any).eval('JSON.parse(JSON.stringify(nodes)).map(normalizeNode).map(n => !!n.numbered)'));
  expect(saved).toEqual([false, true, false, false, false, false, false]);
  await page.evaluate(() => (window as any).eval('setOutlineNumbering(true, false); render();'));
  expect(await nums(page)).toEqual(['', '', '', '', '', '', '']);
  await expect(page.locator('.node-row[data-id="3"] .node-number')).toHaveText('2.1');
});

test('the PDF prints the numbers, counting only rows that print', async ({ page }) => {
  await toggleFromMenu(page, 2);
  // Leave the first step out of the export: the next one becomes 1.
  await page.evaluate(() => (window as any).eval('nodes[2].noExport = true; renderPreviewBody(); el("preview-overlay").style.display = "flex";'));
  const pv = await page.evaluate(() => Array.from(document.querySelectorAll('#preview-doc .pv-bullet')).map((b) => b.textContent));
  expect(pv).toEqual(['1.', '2.']);
  await page.screenshot({ path: test.info().outputPath('numbered-pdf.png') });
});

test('OPML and Markdown files keep the numbering, both ways', async ({ page }) => {
  await toggleFromMenu(page, 2);
  const r = await page.evaluate(() => (window as any).eval(`(() => {
    const opml = serializeOpml(nodes);
    const fromOpml = parseOpmlToTreeNodes(opml).map(n => !!n.numbered);
    importMarkdownText('## Steps\\n\\n1. One\\n2. Two\\n', 'steps.md');
    const fromMd = nodes.map(n => [n.text, !!n.numbered]);
    return { hasAttr: opml.includes('_numbered="true"'), fromOpml, fromMd };
  })()`));
  expect(r.hasAttr).toBe(true);
  expect(r.fromOpml).toEqual([false, true, false, false, false, false, false]);
  expect(r.fromMd).toEqual([['Steps', true], ['One', false], ['Two', false]]);
  expect(await nums(page)).toEqual(['', '1.', '2.']);
});
