import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

async function dismissOverlays(page: import('@playwright/test').Page) {
  const landing = page.locator('#sakura-landing-overlay');
  if (await landing.isVisible().catch(() => false)) {
    await page.evaluate(() => {
      const el = document.getElementById('sakura-landing-overlay');
      if (el) el.style.display = 'none';
    });
  }
  const welcome = page.locator('#welcome-overlay');
  if (await welcome.isVisible().catch(() => false)) {
    await page.evaluate(() => document.getElementById('welcome-overlay')?.classList.remove('open'));
  }
}

// Rows are rich text (owner, 2026-10-22): typed **text** / __text__ no longer format anything --
// formatting is applied to selected words (row-rich-text.spec.ts) and stored in node.marks.
// Ctrl+B/Ctrl+I with no selection still toggle the whole-node style (below).
test.describe('Typed **bold**/__italic__ is plain text; Ctrl+B without a selection styles the row', () => {
  test('parseStyledText leaves **bold** and __italic__ as typed', async ({ page }) => {
    await page.goto('file://' + indexPath);
    await dismissOverlays(page);

    const html = await page.evaluate(() =>
      // @ts-expect-error -- bare global from index.html
      parseStyledText('Hello **world** and __there__ friend')
    );
    expect(html).toBe('Hello **world** and __there__ friend');
  });

  test('Ctrl+B with no selection (collapsed caret) falls back to the whole-node style toggle, unaffected', async ({ page }) => {
    await page.goto('file://' + indexPath);
    await dismissOverlays(page);

    await page.evaluate(() => {
      // @ts-expect-error
      nodes = [{ id: 1, depth: 0, text: 'Plain', parentId: null, isCheckbox: false, checked: false, note: '', tags: [], styles: {} }];
      // @ts-expect-error
      collapsedIds = new Set();
      // @ts-expect-error
      selectedId = null; multiSelectedIds = []; selectAllMode = false; focusedId = null; undoStack = []; editingId = null;
      // @ts-expect-error
      render();
      // @ts-expect-error
      beginEditAt(1, 2); // collapsed caret, no selection
    });

    const input = page.locator('#in-1');
    await expect(input).toBeVisible();
    await input.focus();
    await page.keyboard.press('Control+b');

    const state = await page.evaluate(() => ({
      // @ts-expect-error
      text: nodes[0].text,
      // @ts-expect-error
      stylesBold: nodes[0].styles.bold,
      // @ts-expect-error
      marks: rowMarksOf(nodes[0]),
    }));
    expect(state.text).toBe('Plain'); // text unchanged -- no ** markup inserted
    expect(state.stylesBold).toBeFalsy(); // one formatting system: every word bold instead
    expect(state.marks).toEqual([{ s: 0, e: 5, k: 'b' }]);
  });

  test('formatted words actually render bolder, not just structurally as <b>', async ({ page }) => {
    await page.goto('file://' + indexPath);
    await dismissOverlays(page);

    const result = await page.evaluate(() => {
      // @ts-expect-error
      nodes = [{ id: 1, depth: 0, text: 'Some bold text', marks: [{ s: 5, e: 9, k: 'b' }], parentId: null, isCheckbox: false, checked: false, note: '', tags: [], styles: {} }].map(normalizeNode);
      // @ts-expect-error
      collapsedIds = new Set();
      // @ts-expect-error
      selectedId = null; multiSelectedIds = []; selectAllMode = false; focusedId = null; undoStack = []; editingId = null;
      // @ts-expect-error
      render();
      const label = document.querySelector('.node-row[data-id="1"] .node-label')!;
      const strong = document.querySelector('.node-row[data-id="1"] .node-label b')!;
      return {
        labelWeight: getComputedStyle(label).fontWeight,
        strongWeight: getComputedStyle(strong).fontWeight,
        labelVariation: getComputedStyle(label).fontVariationSettings,
        strongVariation: getComputedStyle(strong).fontVariationSettings,
      };
    });

    // The <b> must be heavier than its surrounding text on BOTH axes a variable font
    // actually renders from -- font-weight alone isn't enough proof, since Chrome prefers the
    // explicit font-variation-settings value when one applies.
    expect(Number(result.strongWeight)).toBeGreaterThan(Number(result.labelWeight));
    expect(result.strongVariation).not.toBe(result.labelVariation);
    expect(result.strongVariation).toContain('700');
  });
});
