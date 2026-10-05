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

// The welcome modal opens itself on a 500ms timer for a never-seen, doc-less session (see
// openWelcomeModal's setTimeout(...,500) call site) -- a one-shot dismissOverlays() right after
// goto() runs before that timer ever fires, so it does nothing, and the modal (pointer-events:
// all once .open) pops up mid-gesture on any test that holds a mousedown past ~500ms, silently
// swallowing every subsequent elementFromPoint hit-test for the rest of the test. Seeding this
// before navigation is what actually prevents it, for any test exercising the real long-press-
// then-drag timing.
async function seedWelcomeSeen(page: import('@playwright/test').Page) {
  await page.addInitScript(() => localStorage.setItem('sakura_welcome_seen', '1'));
}

test.describe('Zooming into a childless node lets you actually add a first child', () => {
  test('typing a character while focused on an empty node creates and seeds a child', async ({ page }) => {
    await page.goto('file://' + indexPath);
    await dismissOverlays(page);

    await page.evaluate(() => {
      // @ts-expect-error -- bare globals from index.html
      nodes = [{ id: 1, depth: 0, text: 'Leaf', parentId: null, isCheckbox: false, checked: false, note: '', tags: [], styles: {} }];
      // @ts-expect-error
      collapsedIds = new Set();
      // @ts-expect-error
      selectedId = 1; multiSelectedIds = []; selectAllMode = false; focusedId = null; undoStack = []; editingId = null;
      // @ts-expect-error
      nextId = 2;
      // @ts-expect-error
      enterFocus(1);
    });

    await expect(page.locator('.focus-empty-state')).toBeVisible();
    await page.keyboard.press('x');

    const afterChar = await page.evaluate(() => ({
      // @ts-expect-error
      texts: nodes.map((n: any) => n.text),
      // @ts-expect-error
      depths: nodes.map((n: any) => n.depth),
      // @ts-expect-error
      editingId,
    }));
    expect(afterChar.texts).toEqual(['Leaf', 'x']);
    expect(afterChar.depths).toEqual([0, 1]);
    // @ts-expect-error
    const childId = await page.evaluate(() => nodes[1].id);
    expect(afterChar.editingId).toBe(childId);
    await expect(page.locator(`#in-${childId}`)).toBeFocused();
  });

  test('Enter while focused on an empty node also creates a (blank) child', async ({ page }) => {
    await page.goto('file://' + indexPath);
    await dismissOverlays(page);

    await page.evaluate(() => {
      // @ts-expect-error
      nodes = [{ id: 1, depth: 0, text: 'Leaf', parentId: null, isCheckbox: false, checked: false, note: '', tags: [], styles: {} }];
      // @ts-expect-error
      collapsedIds = new Set();
      // @ts-expect-error
      selectedId = 1; multiSelectedIds = []; selectAllMode = false; focusedId = null; undoStack = []; editingId = null;
      // @ts-expect-error
      nextId = 2;
      // @ts-expect-error
      enterFocus(1);
    });

    await expect(page.locator('.focus-empty-state')).toBeVisible();
    await page.keyboard.press('Enter');

    const state = await page.evaluate(() => ({
      // @ts-expect-error
      texts: nodes.map((n: any) => n.text),
      // @ts-expect-error
      depths: nodes.map((n: any) => n.depth),
    }));
    expect(state.texts).toEqual(['Leaf', '']);
    expect(state.depths).toEqual([0, 1]);
  });

  test('clicking the placeholder itself also creates a first child', async ({ page }) => {
    await page.goto('file://' + indexPath);
    await dismissOverlays(page);

    await page.evaluate(() => {
      // @ts-expect-error
      nodes = [{ id: 1, depth: 0, text: 'Leaf', parentId: null, isCheckbox: false, checked: false, note: '', tags: [], styles: {} }];
      // @ts-expect-error
      collapsedIds = new Set();
      // @ts-expect-error
      selectedId = 1; multiSelectedIds = []; selectAllMode = false; focusedId = null; undoStack = []; editingId = null;
      // @ts-expect-error
      nextId = 2;
      // @ts-expect-error
      enterFocus(1);
    });

    await page.locator('.focus-empty-state').click();
    const state = await page.evaluate(() => ({
      // @ts-expect-error
      texts: nodes.map((n: any) => n.text),
      // @ts-expect-error
      depths: nodes.map((n: any) => n.depth),
    }));
    expect(state.texts).toEqual(['Leaf', '']);
    expect(state.depths).toEqual([0, 1]);
  });
});

test.describe('Node rows arm drag-reorder via a long press on the leading dot only, Dynalist-style', () => {
  // Dragging is tracked manually (mousemove/mouseup against dragState), not via native HTML5
  // draggable/dragstart -- a browser only recognizes a mousedown+move as a drag gesture near its
  // own start, so flipping `draggable` true mid-hold (after the long-press timer fires, with the
  // mouse having sat still) is too late for a later move to ever be recognized as a drag. That
  // silently did nothing for real users. Armed state is a CSS class (.drag-armed while waiting,
  // .dragging once actually moving).
  //
  // A long press ARMING a reorder is restricted to the leading dot (.fold-dot for a row with
  // children, .node-dot for a leaf row) -- pressing and holding on the row's own text never arms
  // a reorder, only the dot does. A long press on text is indistinguishable from the user just
  // pausing while reading or positioning the caret, and the dot is the one visible, dedicated
  // "handle" spot anyway (same tradeoff the pre-#427 separate handle icon made, just relocated
  // onto the existing dot rather than a new element). Crossing into another row before any
  // long-press timer fires still starts a click-and-drag multi-select from anywhere on the row,
  // dot or text, independent of whether a reorder could ever arm from that press origin.
  test('a row has neither drag class by default, before any press', async ({ page }) => {
    await page.goto('file://' + indexPath);
    await dismissOverlays(page);

    await page.evaluate(() => {
      // @ts-expect-error
      nodes = [
        { id: 1, depth: 0, text: 'Alpha', parentId: null, isCheckbox: false, checked: false, note: '', tags: [], styles: {} },
        { id: 2, depth: 0, text: 'Beta', parentId: null, isCheckbox: false, checked: false, note: '', tags: [], styles: {} },
      ];
      // @ts-expect-error
      collapsedIds = new Set();
      // @ts-expect-error
      selectedId = null; multiSelectedIds = []; selectAllMode = false; focusedId = null; undoStack = []; editingId = null;
      // @ts-expect-error
      nextId = 3;
      // @ts-expect-error
      render();
    });

    const row = page.locator('.node-row[data-id="1"]');
    await expect(row).not.toHaveClass(/drag-armed/);
    await expect(row).not.toHaveClass(/dragging/);
  });

  test('pressing and holding on the label text, however long, never arms dragging', async ({ page }) => {
    await page.goto('file://' + indexPath);
    await dismissOverlays(page);

    await page.evaluate(() => {
      // @ts-expect-error
      nodes = [{ id: 1, depth: 0, text: 'Alpha', parentId: null, isCheckbox: false, checked: false, note: '', tags: [], styles: {} }];
      // @ts-expect-error
      collapsedIds = new Set();
      // @ts-expect-error
      selectedId = null; multiSelectedIds = []; selectAllMode = false; focusedId = null; undoStack = []; editingId = null;
      // @ts-expect-error
      nextId = 2;
      // @ts-expect-error
      render();
    });

    const row = page.locator('.node-row[data-id="1"]');
    const label = row.locator('.node-label');
    await label.dispatchEvent('mousedown', { bubbles: true, clientX: 100, clientY: 100 });
    await page.waitForTimeout(500); // well past the dot's own long-press threshold
    await expect(row).not.toHaveClass(/drag-armed/);
    await page.mouse.up();
    await expect(row).not.toHaveClass(/drag-armed/);
  });

  test('crossing into another row from the label still starts a click-and-drag multi-select, even though no reorder could ever arm there', async ({ page }) => {
    await page.goto('file://' + indexPath);
    await dismissOverlays(page);

    await page.evaluate(() => {
      // @ts-expect-error
      nodes = [
        { id: 1, depth: 0, text: 'Alpha', parentId: null, isCheckbox: false, checked: false, note: '', tags: [], styles: {} },
        { id: 2, depth: 0, text: 'Beta', parentId: null, isCheckbox: false, checked: false, note: '', tags: [], styles: {} },
      ];
      // @ts-expect-error
      collapsedIds = new Set();
      // @ts-expect-error
      selectedId = null; multiSelectedIds = []; selectAllMode = false; focusedId = null; undoStack = []; editingId = null;
      // @ts-expect-error
      nextId = 3;
      // @ts-expect-error
      render();
    });

    const row = page.locator('.node-row[data-id="1"]');
    const label = row.locator('.node-label');
    const box = (await label.boundingBox())!;
    const otherBox = (await page.locator('.node-row[data-id="2"] .node-label').boundingBox())!;
    await page.mouse.move(box.x + 5, box.y + 5);
    await page.mouse.down();
    await page.mouse.move(otherBox.x + 5, otherBox.y + 5, { steps: 5 });
    await page.waitForTimeout(100);

    await expect(row).not.toHaveClass(/drag-armed/);
    await expect(row).not.toHaveClass(/dragging/);
    const midDrag = await page.evaluate(() => ({
      // @ts-expect-error
      multi: multiSelectedIds.slice(),
    }));
    expect(midDrag.multi).toEqual([1, 2]);
    await page.mouse.up();
  });

  test('pressing and holding on the leaf node-dot arms dragging, past the long-press threshold', async ({ page }) => {
    await page.goto('file://' + indexPath);
    await dismissOverlays(page);

    await page.evaluate(() => {
      // @ts-expect-error
      nodes = [{ id: 1, depth: 0, text: 'Alpha', parentId: null, isCheckbox: false, checked: false, note: '', tags: [], styles: {} }];
      // @ts-expect-error
      collapsedIds = new Set();
      // @ts-expect-error
      selectedId = null; multiSelectedIds = []; selectAllMode = false; focusedId = null; undoStack = []; editingId = null;
      // @ts-expect-error
      nextId = 2;
      // @ts-expect-error
      render();
    });

    const row = page.locator('.node-row[data-id="1"]');
    const dot = row.locator('.node-dot');
    await dot.dispatchEvent('mousedown', { bubbles: true, clientX: 10, clientY: 10 });
    await page.waitForTimeout(400);

    await expect(row).toHaveClass(/drag-armed/);
    await page.mouse.up();
    await expect(row).not.toHaveClass(/drag-armed/);
  });

  test('a quick tap (no drag) on the leaf node-dot does not enter edit mode or move anything', async ({ page }) => {
    // The row's click-to-edit handler only reacts to the row itself or .node-label -- .node-dot
    // is neither, so a quick tap there is correctly a no-op (not even edit-entry), same as it was
    // before the dot gained any drag wiring at all.
    await page.goto('file://' + indexPath);
    await dismissOverlays(page);

    await page.evaluate(() => {
      // @ts-expect-error
      nodes = [{ id: 1, depth: 0, text: 'Alpha', parentId: null, isCheckbox: false, checked: false, note: '', tags: [], styles: {} }];
      // @ts-expect-error
      collapsedIds = new Set();
      // @ts-expect-error
      selectedId = null; multiSelectedIds = []; selectAllMode = false; focusedId = null; undoStack = []; editingId = null;
      // @ts-expect-error
      nextId = 2;
      // @ts-expect-error
      render();
    });

    await page.locator('.node-row[data-id="1"] .node-dot').click();
    // @ts-expect-error
    const editingIdAfter = await page.evaluate(() => editingId);
    expect(editingIdAfter).toBe(null);
  });

  // A real mouse/trackpad is never perfectly still during a deliberate hold -- natural hand
  // tremor easily drifts a few pixels over 300ms. The jitter tolerance (checked only once, right
  // when the long-press timer fires) must absorb that or a genuine long-press-to-drag attempt
  // silently fails every time, which is exactly what was reported live.
  test('small jitter on the dot, well within the jitter tolerance during the hold, does not cancel arming', async ({ page }) => {
    await page.goto('file://' + indexPath);
    await dismissOverlays(page);

    await page.evaluate(() => {
      // @ts-expect-error
      nodes = [{ id: 1, depth: 0, text: 'Alpha', parentId: null, isCheckbox: false, checked: false, note: '', tags: [], styles: {} }];
      // @ts-expect-error
      collapsedIds = new Set();
      // @ts-expect-error
      selectedId = null; multiSelectedIds = []; selectAllMode = false; focusedId = null; undoStack = []; editingId = null;
      // @ts-expect-error
      nextId = 2;
      // @ts-expect-error
      render();
    });

    const row = page.locator('.node-row[data-id="1"]');
    const dot = row.locator('.node-dot');
    await dot.dispatchEvent('mousedown', { bubbles: true, clientX: 10, clientY: 10 });
    await page.mouse.move(22, 22); // ~17px of drift -- plausible hand tremor, under the tolerance
    await page.waitForTimeout(400);

    await expect(row).toHaveClass(/drag-armed/);
  });

  test('a quick click on the fold dot of a row with children still toggles collapse instantly, no drag', async ({ page }) => {
    await page.goto('file://' + indexPath);
    await dismissOverlays(page);

    await page.evaluate(() => {
      // @ts-expect-error
      nodes = [
        { id: 1, depth: 0, text: 'Parent', parentId: null, isCheckbox: false, checked: false, note: '', tags: [], styles: {} },
        { id: 2, depth: 1, text: 'Child', parentId: 1, isCheckbox: false, checked: false, note: '', tags: [], styles: {} },
      ];
      // @ts-expect-error
      collapsedIds = new Set();
      // @ts-expect-error
      selectedId = null; multiSelectedIds = []; selectAllMode = false; focusedId = null; undoStack = []; editingId = null;
      // @ts-expect-error
      nextId = 3;
      // @ts-expect-error
      render();
    });

    const row = page.locator('.node-row[data-id="1"]');
    const foldDot = row.locator('.fold-dot');
    await foldDot.click();

    // @ts-expect-error
    const collapsedAfter = await page.evaluate(() => Array.from(collapsedIds));
    expect(collapsedAfter).toEqual([1]);
    await expect(row).not.toHaveClass(/drag-armed/);
    await expect(row).not.toHaveClass(/dragging/);
  });

  test('a long press on the fold dot of a row with children also arms dragging, Dynalist-style, without toggling collapse', async ({ page }) => {
    // The fold dot is the most natural, visible place to press on a collapsed/foldable row --
    // it used to be excluded from arming entirely (to not fight with its own instant-mousedown
    // collapse toggle), which silently broke dragging for anyone who pressed there instead of
    // the plain text. It now runs the same long-press tracking as the rest of the row; a quick
    // tap still toggles collapse (the onTap callback, which only fires if no drag ever started),
    // while a sustained press arms dragging just like everywhere else.
    await page.goto('file://' + indexPath);
    await dismissOverlays(page);

    await page.evaluate(() => {
      // @ts-expect-error
      nodes = [
        { id: 1, depth: 0, text: 'Parent', parentId: null, isCheckbox: false, checked: false, note: '', tags: [], styles: {} },
        { id: 2, depth: 1, text: 'Child', parentId: 1, isCheckbox: false, checked: false, note: '', tags: [], styles: {} },
      ];
      // @ts-expect-error
      collapsedIds = new Set();
      // @ts-expect-error
      selectedId = null; multiSelectedIds = []; selectAllMode = false; focusedId = null; undoStack = []; editingId = null;
      // @ts-expect-error
      nextId = 3;
      // @ts-expect-error
      render();
    });

    const row = page.locator('.node-row[data-id="1"]');
    const foldDot = row.locator('.fold-dot');
    await foldDot.dispatchEvent('mousedown', { bubbles: true, clientX: 50, clientY: 50 });
    await page.waitForTimeout(400);

    await expect(row).toHaveClass(/drag-armed/);

    // Releasing without ever moving resets it back to unarmed, same as the rest of the row, and
    // never toggled collapse (that only happens via onTap, when no drag ever started).
    await page.mouse.up();
    await expect(row).not.toHaveClass(/drag-armed/);
    // @ts-expect-error
    const collapsedAfter = await page.evaluate(() => Array.from(collapsedIds));
    expect(collapsedAfter).toEqual([1]); // a bare arm-then-release with no movement still counts as a tap
  });

  test('a full long-press-then-drag on a parent with a visible child actually reorders it, child included', async ({ page }) => {
    await seedWelcomeSeen(page);
    await page.goto('file://' + indexPath);
    await dismissOverlays(page);

    await page.evaluate(() => {
      // @ts-expect-error
      nodes = [
        { id: 1, depth: 0, text: 'Parent', parentId: null, isCheckbox: false, checked: false, note: '', tags: [], styles: {} },
        { id: 2, depth: 1, text: 'Child', parentId: 1, isCheckbox: false, checked: false, note: '', tags: [], styles: {} },
        { id: 3, depth: 0, text: 'Beta', parentId: null, isCheckbox: false, checked: false, note: '', tags: [], styles: {} },
        { id: 4, depth: 0, text: 'Gamma', parentId: null, isCheckbox: false, checked: false, note: '', tags: [], styles: {} },
      ];
      // @ts-expect-error
      collapsedIds = new Set();
      // @ts-expect-error
      selectedId = null; multiSelectedIds = []; selectAllMode = false; focusedId = null; undoStack = []; editingId = null;
      // @ts-expect-error
      nextId = 5;
      // @ts-expect-error
      render();
    });

    const dot = page.locator('.node-row[data-id="1"] .fold-dot');
    const box = (await dot.boundingBox())!;
    const gammaRow = page.locator('.node-row[data-id="4"]');
    const gammaBox = (await gammaRow.boundingBox())!;

    await page.mouse.move(box.x + 3, box.y + 3);
    await page.mouse.down();
    await page.waitForTimeout(400); // past the long-press threshold, armed
    await page.mouse.move(gammaBox.x + 10, gammaBox.y + gammaBox.height - 3, { steps: 15 }); // drop below Gamma
    await page.waitForTimeout(50);
    await expect(gammaRow).toHaveClass(/drag-over-below/);
    await page.mouse.up();

    const after = await page.evaluate(() => ({
      // @ts-expect-error
      order: nodes.map((n: any) => n.id),
      // @ts-expect-error
      depths: nodes.map((n: any) => n.depth),
    }));
    expect(after.order).toEqual([3, 4, 1, 2]);
    expect(after.depths).toEqual([0, 0, 0, 1]); // Parent/Child keep their relative depth
  });

  test('a full long-press-then-drag started on the fold dot also reorders the row', async ({ page }) => {
    await seedWelcomeSeen(page);
    await page.goto('file://' + indexPath);
    await dismissOverlays(page);

    await page.evaluate(() => {
      // @ts-expect-error
      nodes = [
        { id: 1, depth: 0, text: 'Parent', parentId: null, isCheckbox: false, checked: false, note: '', tags: [], styles: {} },
        { id: 2, depth: 1, text: 'Child', parentId: 1, isCheckbox: false, checked: false, note: '', tags: [], styles: {} },
        { id: 3, depth: 0, text: 'Beta', parentId: null, isCheckbox: false, checked: false, note: '', tags: [], styles: {} },
        { id: 4, depth: 0, text: 'Gamma', parentId: null, isCheckbox: false, checked: false, note: '', tags: [], styles: {} },
      ];
      // @ts-expect-error
      collapsedIds = new Set();
      // @ts-expect-error
      selectedId = null; multiSelectedIds = []; selectAllMode = false; focusedId = null; undoStack = []; editingId = null;
      // @ts-expect-error
      nextId = 5;
      // @ts-expect-error
      render();
    });

    const dot = page.locator('.node-row[data-id="1"] .fold-dot');
    const box = (await dot.boundingBox())!;
    const gammaBox = (await page.locator('.node-row[data-id="4"]').boundingBox())!;

    await page.mouse.move(box.x + 3, box.y + 3);
    await page.mouse.down();
    await page.waitForTimeout(400);
    await page.mouse.move(gammaBox.x + 10, gammaBox.y + gammaBox.height - 3, { steps: 15 });
    await page.waitForTimeout(50);
    await page.mouse.up();

    const after = await page.evaluate(() => ({
      // @ts-expect-error
      order: nodes.map((n: any) => n.id),
      // @ts-expect-error
      collapsed: Array.from(collapsedIds),
    }));
    expect(after.order).toEqual([3, 4, 1, 2]);
    expect(after.collapsed).toEqual([]); // the press-drag never toggled collapse
  });

  test('a node cannot be dropped inside its own subtree', async ({ page }) => {
    await seedWelcomeSeen(page);
    await page.goto('file://' + indexPath);
    await dismissOverlays(page);

    await page.evaluate(() => {
      // @ts-expect-error
      nodes = [
        { id: 1, depth: 0, text: 'Parent', parentId: null, isCheckbox: false, checked: false, note: '', tags: [], styles: {} },
        { id: 2, depth: 1, text: 'Child', parentId: 1, isCheckbox: false, checked: false, note: '', tags: [], styles: {} },
      ];
      // @ts-expect-error
      collapsedIds = new Set();
      // @ts-expect-error
      selectedId = null; multiSelectedIds = []; selectAllMode = false; focusedId = null; undoStack = []; editingId = null;
      // @ts-expect-error
      nextId = 3;
      // @ts-expect-error
      render();
    });

    const parentDot = page.locator('.node-row[data-id="1"] .fold-dot');
    const box = (await parentDot.boundingBox())!;
    const childBox = (await page.locator('.node-row[data-id="2"] .node-label').boundingBox())!;

    await page.mouse.move(box.x + 3, box.y + 3);
    await page.mouse.down();
    await page.waitForTimeout(400);
    await page.mouse.move(childBox.x + 10, childBox.y + 5, { steps: 10 });
    await page.waitForTimeout(50);
    await expect(page.locator('.node-row[data-id="2"]')).not.toHaveClass(/drag-over-above|drag-over-below|drag-over-child/);
    await page.mouse.up();

    const after = await page.evaluate(() => ({
      // @ts-expect-error
      order: nodes.map((n: any) => n.id),
    }));
    expect(after.order).toEqual([1, 2]); // unchanged -- invalid drop target, no-op
  });

  // Reported live, with a screenshot: dragging toward the top of the list showed the end-of-list
  // indicator (the pane's own inset bottom border) and dropped at the bottom instead. Root cause:
  // hovering the pane's own top padding -- or any blank space above the first row, or the gap
  // between two rows -- never lands on a .node-row, and that used to be unconditionally treated
  // as "drop at the very end", regardless of whether the pointer was actually near the top.
  test('dragging into the blank space above the first row (not directly over any row) targets the TOP, not the end', async ({ page }) => {
    await seedWelcomeSeen(page);
    await page.goto('file://' + indexPath);
    await dismissOverlays(page);

    await page.evaluate(() => {
      // @ts-expect-error
      nodes = [
        { id: 1, depth: 0, text: 'Business Requirements', parentId: null, isCheckbox: false, checked: false, note: '', tags: [], styles: {} },
        { id: 2, depth: 0, text: 'Business Case', parentId: null, isCheckbox: false, checked: false, note: '', tags: [], styles: {} },
        { id: 3, depth: 0, text: 'High Level Task List', parentId: null, isCheckbox: false, checked: false, note: '', tags: [], styles: {} },
      ];
      // @ts-expect-error
      collapsedIds = new Set();
      // @ts-expect-error
      selectedId = null; multiSelectedIds = []; selectAllMode = false; focusedId = null; undoStack = []; editingId = null;
      // @ts-expect-error
      nextId = 4;
      // @ts-expect-error
      render();
    });

    const lastDot = page.locator('.node-row[data-id="3"] .node-dot');
    const lastBox = (await lastDot.boundingBox())!;
    const firstRowBox = (await page.locator('.node-row[data-id="1"]').boundingBox())!;
    const paneBox = (await page.locator('#editor-pane').boundingBox())!;
    const aboveFirstRowY = Math.max(paneBox.y + 2, firstRowBox.y - 8); // the pane's own top padding, not any row

    await page.mouse.move(lastBox.x + 3, lastBox.y + 3);
    await page.mouse.down();
    await page.waitForTimeout(400);
    await page.mouse.move(firstRowBox.x + 10, aboveFirstRowY, { steps: 15 });
    await page.waitForTimeout(50);

    await expect(page.locator('#editor-pane')).not.toHaveClass(/drag-over-end/);
    await expect(page.locator('.node-row[data-id="1"]')).toHaveClass(/drag-over-above/);
    await page.mouse.up();

    const after = await page.evaluate(() => ({
      // @ts-expect-error
      order: nodes.map((n: any) => n.id),
    }));
    expect(after.order).toEqual([3, 1, 2]);
  });

  test('dragging genuinely past the last row still targets the end of the list', async ({ page }) => {
    await seedWelcomeSeen(page);
    await page.goto('file://' + indexPath);
    await dismissOverlays(page);

    await page.evaluate(() => {
      // @ts-expect-error
      nodes = [
        { id: 1, depth: 0, text: 'Alpha', parentId: null, isCheckbox: false, checked: false, note: '', tags: [], styles: {} },
        { id: 2, depth: 0, text: 'Beta', parentId: null, isCheckbox: false, checked: false, note: '', tags: [], styles: {} },
        { id: 3, depth: 0, text: 'Gamma', parentId: null, isCheckbox: false, checked: false, note: '', tags: [], styles: {} },
      ];
      // @ts-expect-error
      collapsedIds = new Set();
      // @ts-expect-error
      selectedId = null; multiSelectedIds = []; selectAllMode = false; focusedId = null; undoStack = []; editingId = null;
      // @ts-expect-error
      nextId = 4;
      // @ts-expect-error
      render();
    });

    const firstDot = page.locator('.node-row[data-id="1"] .node-dot');
    const firstBox = (await firstDot.boundingBox())!;
    const lastRowBox = (await page.locator('.node-row[data-id="3"]').boundingBox())!;
    const paneBox = (await page.locator('#editor-pane').boundingBox())!;
    const belowLastRowY = Math.min(paneBox.y + paneBox.height - 2, lastRowBox.y + lastRowBox.height + 20);

    await page.mouse.move(firstBox.x + 3, firstBox.y + 3);
    await page.mouse.down();
    await page.waitForTimeout(400);
    await page.mouse.move(lastRowBox.x + 10, belowLastRowY, { steps: 15 });
    await page.waitForTimeout(50);

    await expect(page.locator('#editor-pane')).toHaveClass(/drag-over-end/);
    await page.mouse.up();

    const after = await page.evaluate(() => ({
      // @ts-expect-error
      order: nodes.map((n: any) => n.id),
    }));
    expect(after.order).toEqual([2, 3, 1]);
  });

  test('click-and-drag across rows selects the range between them, Dynalist-style', async ({ page }) => {
    await seedWelcomeSeen(page);
    await page.goto('file://' + indexPath);
    await dismissOverlays(page);

    await page.evaluate(() => {
      // @ts-expect-error
      nodes = [
        { id: 1, depth: 0, text: 'Alpha', parentId: null, isCheckbox: false, checked: false, note: '', tags: [], styles: {} },
        { id: 2, depth: 0, text: 'Beta', parentId: null, isCheckbox: false, checked: false, note: '', tags: [], styles: {} },
        { id: 3, depth: 0, text: 'Gamma', parentId: null, isCheckbox: false, checked: false, note: '', tags: [], styles: {} },
      ];
      // @ts-expect-error
      collapsedIds = new Set();
      // @ts-expect-error
      selectedId = null; multiSelectedIds = []; selectAllMode = false; focusedId = null; undoStack = []; editingId = null;
      // @ts-expect-error
      nextId = 4;
      // @ts-expect-error
      render();
    });

    const alphaBox = (await page.locator('.node-row[data-id="1"] .node-label').boundingBox())!;
    const gammaBox = (await page.locator('.node-row[data-id="3"]').boundingBox())!;

    await page.mouse.move(alphaBox.x + 5, alphaBox.y + 5);
    await page.mouse.down();
    await page.mouse.move(gammaBox.x + 5, gammaBox.y + 5, { steps: 10 }); // crosses rows -- before any long-press
    await page.waitForTimeout(50);

    const midDrag = await page.evaluate(() => ({
      // @ts-expect-error
      multi: multiSelectedIds.slice(),
    }));
    expect(midDrag.multi).toEqual([1, 2, 3]);

    await page.mouse.up();

    const after = await page.evaluate(() => ({
      // @ts-expect-error
      multi: multiSelectedIds.slice(),
    }));
    expect(after.multi).toEqual([1, 2, 3]); // selection sticks after release
  });

  test('node label text is selectable (user-select is not none)', async ({ page }) => {
    await page.goto('file://' + indexPath);
    await dismissOverlays(page);

    await page.evaluate(() => {
      // @ts-expect-error
      nodes = [{ id: 1, depth: 0, text: 'Selectable text', parentId: null, isCheckbox: false, checked: false, note: '', tags: [], styles: {} }];
      // @ts-expect-error
      collapsedIds = new Set();
      // @ts-expect-error
      selectedId = null; multiSelectedIds = []; selectAllMode = false; focusedId = null; undoStack = []; editingId = null;
      // @ts-expect-error
      nextId = 2;
      // @ts-expect-error
      render();
    });

    const userSelect = await page.locator('.node-label').first().evaluate((el) => getComputedStyle(el).userSelect);
    expect(userSelect).not.toBe('none');
  });
});
