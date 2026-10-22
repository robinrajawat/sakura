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

// Dynalist-style inline bold/italic: **text** and __text__ are recognized by parseStyledText
// (the same display-only, one-way renderer that already turns [Section]/(note)/`code` into
// styled chips) and rendered as <strong>/<em> in the view-mode .node-label -- raw markup while
// actively editing, exactly like every other semantic marker, never live-converted as you type.
// Ctrl+B/Ctrl+I with a text selection used to wrap it in **/__; since rows became rich text
// (owner, 2026-10-22) they format the selected words instead (row-rich-text.spec.ts). With no
// selection they still toggle the whole-node style (below).
test.describe('Inline **bold**/__italic__ markup and selection-scoped Ctrl+B/Ctrl+I', () => {
  test('parseStyledText renders **bold** and __italic__ as <strong>/<em> in view mode', async ({ page }) => {
    await page.goto('file://' + indexPath);
    await dismissOverlays(page);

    const html = await page.evaluate(() =>
      // @ts-expect-error -- bare global from index.html
      parseStyledText('Hello **world** and __there__ friend')
    );
    expect(html).toBe('Hello <strong>world</strong> and <em>there</em> friend');
  });

  test('the actual node-label in the tree shows bold/italic text', async ({ page }) => {
    await page.goto('file://' + indexPath);
    await dismissOverlays(page);

    await page.evaluate(() => {
      // @ts-expect-error
      nodes = [{ id: 1, depth: 0, text: 'Some **bold** text', parentId: null, isCheckbox: false, checked: false, note: '', tags: [], styles: {} }];
      // @ts-expect-error
      collapsedIds = new Set();
      // @ts-expect-error
      selectedId = null; multiSelectedIds = []; selectAllMode = false; focusedId = null; undoStack = []; editingId = null;
      // @ts-expect-error
      render();
    });

    const strong = page.locator('.node-row[data-id="1"] .node-label strong');
    await expect(strong).toHaveText('bold');
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
    }));
    expect(state.text).toBe('Plain'); // text unchanged -- no ** markup inserted
    expect(state.stylesBold).toBe(true); // whole-node style flag toggled instead
  });

  test('inline **bold** actually renders bolder, not just structurally as <strong>', async ({ page }) => {
    await page.goto('file://' + indexPath);
    await dismissOverlays(page);

    const result = await page.evaluate(() => {
      // @ts-expect-error
      nodes = [{ id: 1, depth: 0, text: 'Some **bold** text', parentId: null, isCheckbox: false, checked: false, note: '', tags: [], styles: {} }];
      // @ts-expect-error
      collapsedIds = new Set();
      // @ts-expect-error
      selectedId = null; multiSelectedIds = []; selectAllMode = false; focusedId = null; undoStack = []; editingId = null;
      // @ts-expect-error
      render();
      const label = document.querySelector('.node-row[data-id="1"] .node-label')!;
      const strong = document.querySelector('.node-row[data-id="1"] .node-label strong')!;
      return {
        labelWeight: getComputedStyle(label).fontWeight,
        strongWeight: getComputedStyle(strong).fontWeight,
        labelVariation: getComputedStyle(label).fontVariationSettings,
        strongVariation: getComputedStyle(strong).fontVariationSettings,
      };
    });

    // The <strong> must be heavier than its surrounding text on BOTH axes a variable font
    // actually renders from -- font-weight alone isn't enough proof, since Chrome prefers the
    // explicit font-variation-settings value when one applies.
    expect(Number(result.strongWeight)).toBeGreaterThan(Number(result.labelWeight));
    expect(result.strongVariation).not.toBe(result.labelVariation);
    expect(result.strongVariation).toContain('700');
  });
});
