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
// Ctrl+B/Ctrl+I with an actual text selection wrap (or unwrap, toggling) just that substring
// instead of bolding/italicizing the whole node; with no selection they fall back to the
// pre-existing whole-node style toggle, unchanged.
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

  test('Ctrl+B on a selection wraps just that text in ** and toggles it off on re-selection', async ({ page }) => {
    await page.goto('file://' + indexPath);
    await dismissOverlays(page);

    await page.evaluate(() => {
      // @ts-expect-error
      nodes = [{ id: 1, depth: 0, text: 'Hello World', parentId: null, isCheckbox: false, checked: false, note: '', tags: [], styles: {} }];
      // @ts-expect-error
      collapsedIds = new Set();
      // @ts-expect-error
      selectedId = null; multiSelectedIds = []; selectAllMode = false; focusedId = null; undoStack = []; editingId = null;
      // @ts-expect-error
      render();
      // @ts-expect-error
      beginEditAt(1, 0);
    });

    const input = page.locator('#in-1');
    await expect(input).toBeVisible();
    await input.focus();
    // Select "Hello" (offsets 0-5).
    await page.evaluate(() => {
      // @ts-expect-error
      setEditableSelectionRange(document.getElementById('in-1'), 0, 5);
    });
    await page.keyboard.press('Control+b');

    let state = await page.evaluate(() => ({
      // @ts-expect-error
      text: nodes[0].text,
      // @ts-expect-error
      editingId,
      // @ts-expect-error
      isFocused: document.activeElement === document.getElementById('in-1'),
    }));
    expect(state.text).toBe('**Hello** World');
    expect(state.editingId).toBe(1); // stayed in edit mode -- no full render() happened
    expect(state.isFocused).toBe(true);

    // The reselected range (returned by getEditableSelectionRange) should point at the same
    // "Hello" text, now shifted by the two leading ** markers, so an immediate second Ctrl+B
    // toggles it back off.
    const selAfterWrap = await page.evaluate(() =>
      // @ts-expect-error
      getEditableSelectionRange(document.getElementById('in-1'))
    );
    expect(selAfterWrap).toEqual({ start: 2, end: 7 });

    await page.keyboard.press('Control+b');
    state = await page.evaluate(() => ({
      // @ts-expect-error
      text: nodes[0].text,
    }));
    expect(state.text).toBe('Hello World'); // unwrapped back to the original
  });

  test('Ctrl+I on a selection wraps it in __ (independent of bold)', async ({ page }) => {
    await page.goto('file://' + indexPath);
    await dismissOverlays(page);

    await page.evaluate(() => {
      // @ts-expect-error
      nodes = [{ id: 1, depth: 0, text: 'Hello World', parentId: null, isCheckbox: false, checked: false, note: '', tags: [], styles: {} }];
      // @ts-expect-error
      collapsedIds = new Set();
      // @ts-expect-error
      selectedId = null; multiSelectedIds = []; selectAllMode = false; focusedId = null; undoStack = []; editingId = null;
      // @ts-expect-error
      render();
      // @ts-expect-error
      beginEditAt(1, 0);
    });

    const input = page.locator('#in-1');
    await expect(input).toBeVisible();
    await input.focus();
    await page.evaluate(() => {
      // @ts-expect-error
      setEditableSelectionRange(document.getElementById('in-1'), 6, 11); // "World"
    });
    await page.keyboard.press('Control+i');

    const state = await page.evaluate(() => ({
      // @ts-expect-error
      text: nodes[0].text,
    }));
    expect(state.text).toBe('Hello __World__');
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

  test('wrapping a selection is undoable', async ({ page }) => {
    await page.goto('file://' + indexPath);
    await dismissOverlays(page);

    await page.evaluate(() => {
      // @ts-expect-error
      nodes = [{ id: 1, depth: 0, text: 'Hello World', parentId: null, isCheckbox: false, checked: false, note: '', tags: [], styles: {} }];
      // @ts-expect-error
      collapsedIds = new Set();
      // @ts-expect-error
      selectedId = null; multiSelectedIds = []; selectAllMode = false; focusedId = null; undoStack = []; editingId = null;
      // @ts-expect-error
      render();
      // @ts-expect-error
      beginEditAt(1, 0);
    });

    const input = page.locator('#in-1');
    await expect(input).toBeVisible();
    await input.focus();
    await page.evaluate(() => {
      // @ts-expect-error
      setEditableSelectionRange(document.getElementById('in-1'), 0, 5);
    });
    await page.keyboard.press('Control+b');

    let state = await page.evaluate(() => ({
      // @ts-expect-error
      text: nodes[0].text,
    }));
    expect(state.text).toBe('**Hello** World');

    await page.evaluate(() => {
      // @ts-expect-error
      contextualUndo();
    });
    state = await page.evaluate(() => ({
      // @ts-expect-error
      text: nodes[0].text,
    }));
    expect(state.text).toBe('Hello World');
  });

  // .node-label sets font-variation-settings:'wght' 450 (needed to force Inter's true Medium
  // instance rather than an ambiguous default). That's an inherited CSS property, so the
  // <strong> parseStyledText renders for **bold** inherited the SAME 'wght' 450 from its
  // .node-label ancestor -- and for a variable font, an explicit font-variation-settings value
  // wins over what font-weight's own "bolder" computation would otherwise render. The <strong>
  // tag was structurally correct (font-weight computed to 700) but visually indistinguishable
  // from the surrounding text: Ctrl+B appeared to do nothing. Fixed with a `.node-label
  // strong{font-variation-settings:'wght' 700}` rule, mirroring the one .style-bold already has.
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
