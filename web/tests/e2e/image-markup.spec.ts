import { test, expect, type Page, type Locator } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');
const probePath = path.resolve(__dirname, 'fixtures/storage-probe.html');

// Image markup (PR B of "images as node objects"): rectangles, arrows, highlighter boxes and text
// labels drawn in the enlarged viewer, stored as shapes in image.annotations with coordinates
// relative to the picture (0–1), rendered in the viewer, on thumbnails and in the PDF.

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => { try { localStorage.setItem('sakura_welcome_seen', '1'); } catch { /* storage unavailable */ } });
});

const KNOWN_NOISE = /ServiceWorker|cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net|embed\.diagrams\.net|CORS policy|Failed to load resource|net::ERR/i;

function trackErrors(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (err) => { if (!KNOWN_NOISE.test(err.message)) errors.push('pageerror: ' + err.message); });
  page.on('console', (msg) => { if (msg.type() === 'error' && !KNOWN_NOISE.test(msg.text())) errors.push('console.error: ' + msg.text()); });
  return errors;
}

async function dismissOverlays(page: Page) {
  await page.evaluate(() => {
    const landing = document.getElementById('sakura-landing-overlay');
    if (landing) landing.style.display = 'none';
    document.getElementById('welcome-overlay')?.classList.remove('open');
  });
}

// An 800x500 picture with a known natural size (SVG keeps the test independent of encoders).
const SHOT = 'data:image/svg+xml;base64,' + Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="500" viewBox="0 0 800 500">' +
  '<rect width="800" height="500" fill="#f4f5f7"/><rect width="800" height="40" fill="#2d3748"/>' +
  '<rect y="40" width="160" height="460" fill="#e2e8f0"/><rect x="240" y="120" width="420" height="240" rx="8" fill="#5a67d8"/></svg>'
).toString('base64');
const SHOT2 = 'data:image/svg+xml;base64,' + Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600"><rect width="600" height="600" fill="#222"/></svg>'
).toString('base64');

async function seedDoc(page: Page, images: Array<Record<string, unknown>>, extra: Array<Record<string, unknown>> = []) {
  await page.evaluate(({ images, extra }) => {
    // @ts-expect-error -- bare globals from index.html
    ensureDocumentForEditing();
    // @ts-expect-error
    nodes = [
      { id: 1, depth: 0, text: 'Screens', parentId: null, isCheckbox: false, checked: false, note: '', tags: [], styles: {}, images },
      { id: 2, depth: 0, text: 'Other', parentId: null, isCheckbox: false, checked: false, note: '', tags: [], styles: {} },
      ...extra
      // @ts-expect-error
    ].map(normalizeNode);
    // @ts-expect-error
    collapsedIds = new Set(); selectedId = null; multiSelectedIds = []; selectAllMode = false; focusedId = null; undoStack = []; redoStack = []; editingId = null; nextId = 10;
    // @ts-expect-error
    render();
  }, { images, extra });
}

async function annotations(page: Page, nodeId = 1, index = 0) {
  return page.evaluate(({ nodeId, index }) => {
    // @ts-expect-error
    const n = nodes.find((x: any) => x.id === nodeId);
    return JSON.parse(JSON.stringify(n.images[index].annotations));
  }, { nodeId, index });
}

async function openViewer(page: Page, nodeId = 1, index = 0) {
  await page.locator(`.node-image-strip[data-node-id="${nodeId}"] .node-image-thumb`).nth(index).click();
  const viewer = page.locator('#node-image-viewer');
  await expect(viewer).toHaveClass(/open/);
  // overlay is painted once the picture knows its natural size
  await expect.poll(() => viewer.locator('.niv-annot-layer').getAttribute('viewBox')).not.toBe('0 0 1 1');
  return viewer;
}

// Drag across the overlay between two points given as fractions of the picture.
async function drag(page: Page, layer: Locator, from: [number, number], to: [number, number]) {
  const box = (await layer.boundingBox())!;
  await page.mouse.move(box.x + from[0] * box.width, box.y + from[1] * box.height);
  await page.mouse.down();
  await page.mouse.move(box.x + ((from[0] + to[0]) / 2) * box.width, box.y + ((from[1] + to[1]) / 2) * box.height, { steps: 3 });
  await page.mouse.move(box.x + to[0] * box.width, box.y + to[1] * box.height, { steps: 3 });
  await page.mouse.up();
}
async function clickAt(page: Page, layer: Locator, at: [number, number]) {
  const box = (await layer.boundingBox())!;
  await page.mouse.click(box.x + at[0] * box.width, box.y + at[1] * box.height);
}

// Where a mark sits, as fractions of the picture's on-screen box.
async function markFrac(page: Page, imgSel: string, markSel: string) {
  return page.evaluate(({ imgSel, markSel }) => {
    const img = document.querySelector(imgSel)!.getBoundingClientRect();
    const m = document.querySelector(markSel)!.getBoundingClientRect();
    return { x: (m.left - img.left) / img.width, y: (m.top - img.top) / img.height, w: m.width / img.width, h: m.height / img.height };
  }, { imgSel, markSel });
}

async function readSharedStorage(page: Page, key: string): Promise<string> {
  const probe = await page.context().newPage();
  try {
    await probe.goto('file://' + probePath);
    return await probe.evaluate((k) => localStorage.getItem(k) || '', key);
  } finally {
    await probe.close();
  }
}

test.describe('Image markup', () => {
  test('draws a rectangle, arrow, highlighter box and text label with real pointer drags; one app undo removes the session', async ({ page }) => {
    const errors = trackErrors(page);
    await page.goto('file://' + indexPath);
    await dismissOverlays(page);
    await seedDoc(page, [{ id: 'i1', src: SHOT, caption: 'Login' }]);
    const viewer = await openViewer(page);
    const layer = viewer.locator('.niv-annot-layer');
    await expect(viewer.locator('.niv-markup-bar')).toBeHidden();
    await viewer.locator('.niv-markup-toggle').click();
    await expect(viewer).toHaveClass(/niv-marking/);
    await expect(viewer.locator('.niv-markup-bar')).toBeVisible();

    await viewer.locator('.niv-mk-tool[data-tool="rect"]').click();
    await drag(page, layer, [0.1, 0.1], [0.4, 0.3]);
    await viewer.locator('.niv-mk-tool[data-tool="arrow"]').click();
    await viewer.locator('.niv-mk-swatch[data-color="#2f7cf6"]').click();
    await drag(page, layer, [0.8, 0.8], [0.5, 0.5]);
    await viewer.locator('.niv-mk-tool[data-tool="highlight"]').click();
    await viewer.locator('.niv-mk-swatch[data-color="#f5b800"]').click();
    await drag(page, layer, [0.2, 0.6], [0.7, 0.7]);
    await viewer.locator('.niv-mk-tool[data-tool="text"]').click();
    await viewer.locator('.niv-mk-swatch[data-color="#ffffff"]').click();
    await clickAt(page, layer, [0.6, 0.15]);
    const input = viewer.locator('.niv-mk-text-input');
    await expect(input).toBeFocused();
    await page.keyboard.type('Click here');
    await page.keyboard.press('Enter');
    await expect(input).toHaveCount(0);
    // a plain click with a drawing tool is not a mark
    await viewer.locator('.niv-mk-tool[data-tool="rect"]').click();
    await clickAt(page, layer, [0.9, 0.1]);

    const ann = await annotations(page);
    expect(ann.map((a: any) => a.type)).toEqual(['rect', 'arrow', 'highlight', 'text']);
    const [rect, arrow, hl, text] = ann;
    expect(rect.x).toBeCloseTo(0.1, 1); expect(rect.y).toBeCloseTo(0.1, 1); expect(rect.w).toBeCloseTo(0.3, 1); expect(rect.h).toBeCloseTo(0.2, 1);
    expect(rect.color).toBe('#e8384f');
    expect(arrow).toMatchObject({ color: '#2f7cf6' });
    expect(arrow.x1).toBeCloseTo(0.8, 1); expect(arrow.y2).toBeCloseTo(0.5, 1);
    expect(hl).toMatchObject({ color: '#f5b800' });
    expect(text).toMatchObject({ text: 'Click here', color: '#ffffff' });
    expect(text.x).toBeCloseTo(0.6, 1);
    expect(rect.strokeWidth).toBeGreaterThan(0); expect(text.size).toBeGreaterThan(0);
    await expect(layer.locator('[data-annot-id]')).toHaveCount(4);
    await expect(layer.locator('g[data-annot-type="arrow"] polygon')).toHaveCount(1);
    await expect(layer.locator('g[data-annot-type="highlight"] rect')).toHaveAttribute('fill-opacity', '0.35');
    await expect(layer.locator('g[data-annot-type="text"] text')).toHaveAttribute('paint-order', 'stroke');
    // the original picture is never touched
    // @ts-expect-error
    expect(await page.evaluate(() => nodes[0].images[0].src)).toBe(SHOT);
    // rendered rectangle lines up with where it was drawn
    const f = await markFrac(page, '#node-image-viewer .niv-img', '#node-image-viewer g[data-annot-type="rect"] rect');
    expect(f.x).toBeCloseTo(0.1, 1); expect(f.w).toBeCloseTo(0.3, 1);

    await page.keyboard.press('Escape'); // leaves marking mode
    await expect(viewer).not.toHaveClass(/niv-marking/);
    await expect(viewer).toHaveClass(/open/);
    await expect(viewer.locator('.niv-markup-count')).toHaveText('4');
    await page.keyboard.press('Escape'); // closes
    await expect(viewer).not.toHaveClass(/open/);
    // One app-level undo step for the whole marking session.
    // @ts-expect-error
    expect(await page.evaluate(() => undoStack.length)).toBe(1);
    await page.evaluate(() => {
      // @ts-expect-error
      undo();
    });
    expect(await annotations(page)).toEqual([]);
    await page.evaluate(() => {
      // @ts-expect-error
      redo();
    });
    expect((await annotations(page)).length).toBe(4);
    expect(errors).toEqual([]);
  });

  test('select, move, nudge and delete marks; editor undo/redo; Clear markings with confirm; Esc unwinds', async ({ page }) => {
    const errors = trackErrors(page);
    await page.goto('file://' + indexPath);
    await dismissOverlays(page);
    await seedDoc(page, [
      { id: 'i1', src: SHOT, caption: 'One', annotations: [
        { id: 'r1', type: 'rect', x: 0.1, y: 0.1, w: 0.2, h: 0.2, color: '#e8384f', strokeWidth: 0.005 },
        { id: 't1', type: 'text', x: 0.5, y: 0.5, text: 'Label', size: 0.04, color: '#1b1b1f' }
      ] },
      { id: 'i2', src: SHOT2, caption: 'Two' }
    ]);
    const viewer = await openViewer(page);
    const layer = viewer.locator('.niv-annot-layer');
    await page.keyboard.press('m'); // M enters marking mode
    await expect(viewer).toHaveClass(/niv-marking/);
    await page.keyboard.press('v'); // select tool
    await expect(viewer.locator('.niv-mk-tool[data-tool="select"]')).toHaveClass(/active/);
    await expect(viewer.locator('.niv-mk-undo')).toBeDisabled();
    await expect(viewer.locator('.niv-mk-del')).toBeDisabled();

    // pick the rectangle by its outline and drag it
    await drag(page, layer, [0.1, 0.2], [0.3, 0.4]);
    let ann = await annotations(page);
    expect(ann[0].x).toBeCloseTo(0.3, 1); expect(ann[0].y).toBeCloseTo(0.3, 1);
    expect(ann[0].w).toBeCloseTo(0.2, 3);
    await expect(layer.locator('.niv-annot-sel')).toHaveCount(1);
    await expect(viewer.locator('.niv-mk-del')).toBeEnabled();
    // arrow keys nudge the selection and never step to the next image
    const before = ann[0].x;
    await page.keyboard.press('ArrowRight');
    await expect(viewer.locator('.niv-counter')).toHaveText('1 / 2');
    ann = await annotations(page);
    expect(ann[0].x).toBeGreaterThan(before);
    // editor undo (Ctrl+Z) twice → back to the seeded position; redo with Ctrl+Shift+Z and Ctrl+Y
    await page.keyboard.press('Control+z');
    await page.keyboard.press('Control+z');
    ann = await annotations(page);
    expect(ann[0].x).toBeCloseTo(0.1, 3);
    await expect(viewer.locator('.niv-mk-undo')).toBeDisabled();
    await page.keyboard.press('Control+Shift+z');
    await page.keyboard.press('Control+y');
    ann = await annotations(page);
    expect(ann[0].x).toBeGreaterThan(0.3);
    await viewer.locator('.niv-mk-undo').click();
    await viewer.locator('.niv-mk-redo').click();
    expect((await annotations(page))[0].x).toBeGreaterThan(0.3);

    // delete with the Delete key, then via the button after selecting the label
    await drag(page, layer, [0.3, ann[0].y + 0.1], [0.3, ann[0].y + 0.1]); // click on the rect's left edge
    await page.keyboard.press('Delete');
    expect((await annotations(page)).map((a: any) => a.id)).toEqual(['t1']);
    await clickAt(page, layer, [0.52, 0.52]);
    await expect(viewer.locator('.niv-mk-del')).toBeEnabled();
    // recolour the selected mark from the palette
    await viewer.locator('.niv-mk-swatch[data-color="#2fb344"]').click();
    expect((await annotations(page))[0].color).toBe('#2fb344');
    // Esc first drops the selection, not the viewer
    await page.keyboard.press('Escape');
    await expect(layer.locator('.niv-annot-sel')).toHaveCount(0);
    await expect(viewer).toHaveClass(/niv-marking/);
    await clickAt(page, layer, [0.52, 0.52]);
    await viewer.locator('.niv-mk-del').click();
    expect(await annotations(page)).toEqual([]);
    // three editor undos: the button delete, the recolour, the Delete-key delete
    await viewer.locator('.niv-mk-undo').click();
    expect((await annotations(page)).map((a: any) => a.color)).toEqual(['#2fb344']);
    await viewer.locator('.niv-mk-undo').click();
    await viewer.locator('.niv-mk-undo').click();
    expect((await annotations(page)).length).toBe(2);

    // Clear markings asks first; Cancel keeps them, Clear removes all
    await viewer.locator('.niv-mk-clear').click();
    await expect(viewer.locator('.niv-mk-confirm')).toBeVisible();
    await viewer.locator('.niv-mk-clear-no').click();
    expect((await annotations(page)).length).toBe(2);
    await viewer.locator('.niv-mk-clear').click();
    await viewer.locator('.niv-mk-clear-yes').click();
    expect(await annotations(page)).toEqual([]);
    await expect(viewer.locator('.niv-mk-clear')).toBeDisabled();
    await page.keyboard.press('Control+z');
    expect((await annotations(page)).length).toBe(2);

    // Esc leaves marking mode; now arrows step images again; a second Esc closes
    await page.keyboard.press('Escape');
    await expect(viewer).not.toHaveClass(/niv-marking/);
    await page.keyboard.press('ArrowRight');
    await expect(viewer.locator('.niv-counter')).toHaveText('2 / 2');
    await page.keyboard.press('Escape');
    await expect(viewer).not.toHaveClass(/open/);
    // the whole session (moves, deletes, clear, undos) was one app-level undo step -- and since the
    // session ended where it started apart from the move, undoing restores the seeded marks exactly
    // @ts-expect-error
    expect(await page.evaluate(() => undoStack.length)).toBe(1);
    await page.evaluate(() => {
      // @ts-expect-error
      undo();
    });
    ann = await annotations(page);
    expect(ann.map((a: any) => [a.id, a.x, a.color])).toEqual([['r1', 0.1, '#e8384f'], ['t1', 0.5, '#1b1b1f']]);
    expect(errors).toEqual([]);
  });

  test('text labels: Esc cancels just the label, double-click edits one, emptying it deletes it', async ({ page }) => {
    const errors = trackErrors(page);
    await page.goto('file://' + indexPath);
    await dismissOverlays(page);
    await seedDoc(page, [{ id: 'i1', src: SHOT, caption: '', annotations: [
      { id: 't1', type: 'text', x: 0.2, y: 0.2, text: 'Old', size: 0.05, color: '#e8384f' }
    ] }, { id: 'i2', src: SHOT2 }]);
    const viewer = await openViewer(page);
    const layer = viewer.locator('.niv-annot-layer');
    await viewer.locator('.niv-markup-toggle').click();
    await page.keyboard.press('t');
    await clickAt(page, layer, [0.6, 0.6]);
    await expect(viewer.locator('.niv-mk-text-input')).toBeFocused();
    await page.keyboard.type('Nope');
    await page.keyboard.press('ArrowRight'); // caret move inside the input, not an image step
    await page.keyboard.press('Escape');
    await expect(viewer.locator('.niv-mk-text-input')).toHaveCount(0);
    await expect(viewer).toHaveClass(/niv-marking/);
    await expect(viewer).toHaveClass(/open/);
    await expect(viewer.locator('.niv-counter')).toHaveText('1 / 2');
    expect((await annotations(page)).map((a: any) => a.text)).toEqual(['Old']);

    await page.keyboard.press('v');
    await layer.locator('g[data-annot-type="text"] text').dblclick();
    const input = viewer.locator('.niv-mk-text-input');
    await expect(input).toBeFocused();
    await expect(input).toHaveValue('Old');
    await page.keyboard.type('New label');
    await page.keyboard.press('Enter');
    expect((await annotations(page)).map((a: any) => [a.id, a.text, a.x])).toEqual([['t1', 'New label', 0.2]]);
    await layer.locator('g[data-annot-type="text"] text').dblclick();
    await page.keyboard.press('Control+a');
    await page.keyboard.press('Backspace');
    await page.keyboard.press('Enter');
    expect(await annotations(page)).toEqual([]);
    expect(errors).toEqual([]);
  });

  test('marks persist after closing/reopening the viewer and after a reload', async ({ page }) => {
    const errors = trackErrors(page);
    await page.addInitScript((src) => {
      if (sessionStorage.getItem('seededMarkupDoc')) return;
      sessionStorage.setItem('seededMarkupDoc', '1');
      const docId = 'markdoc1';
      localStorage.setItem('sakura_doc_v1_' + docId, JSON.stringify({
        nodes: [{ id: 1, depth: 0, text: 'Screens', parentId: null, isCheckbox: false, checked: false, tags: [], styles: {}, note: '',
          images: [{ id: 'i1', src, caption: 'Shot', annotations: [], createdAt: 5 }] }],
        nextId: 2, selectedId: null, multiSelectedIds: [], selectionAnchorId: null, collapsed: [], title: 'Markup persist', author: ''
      }));
      localStorage.setItem('sakura_docs_index_v1', JSON.stringify([{ id: docId, title: 'Markup persist', updatedAt: Date.now() }]));
      localStorage.setItem('sakura_current_doc_v1', docId);
      localStorage.setItem('sakura_open_tabs_v1', JSON.stringify({ tabs: [docId], pinned: [], active: docId }));
    }, SHOT);
    // Make sure this page's localStorage is the context's shared store before relying on a reload
    // (see gotoWithSharedStorage in backup-simplified.spec.ts for the flake this avoids).
    for (let attempt = 1; ; attempt++) {
      await page.goto('file://' + indexPath);
      const marker = 'm' + Date.now() + '-' + attempt;
      await page.evaluate((m) => localStorage.setItem('sakura_e2e_storage_probe', m), marker);
      let shared = false;
      for (let i = 0; i < 20 && !shared; i++) {
        shared = (await readSharedStorage(page, 'sakura_e2e_storage_probe')) === marker;
        if (!shared) await page.waitForTimeout(150);
      }
      if (shared || attempt >= 5) { expect(shared).toBe(true); break; }
      await page.evaluate(() => sessionStorage.removeItem('seededMarkupDoc'));
    }
    await dismissOverlays(page);
    let viewer = await openViewer(page);
    const layer = viewer.locator('.niv-annot-layer');
    await viewer.locator('.niv-markup-toggle').click();
    await page.keyboard.press('r');
    await drag(page, layer, [0.2, 0.2], [0.5, 0.6]);
    await page.keyboard.press('a');
    await drag(page, layer, [0.9, 0.9], [0.55, 0.65]);
    await viewer.locator('.niv-close').click();
    await expect(viewer).not.toHaveClass(/open/);
    viewer = await openViewer(page);
    await expect(viewer.locator('.niv-annot-layer [data-annot-id]')).toHaveCount(2);
    await expect(viewer.locator('.niv-markup-count')).toHaveText('2');
    await page.keyboard.press('Escape');
    const saved = await annotations(page);
    await page.evaluate(() => {
      // @ts-expect-error
      saveToStorage();
    });
    await expect.poll(async () => {
      const raw = await readSharedStorage(page, 'sakura_doc_v1_markdoc1');
      try { return JSON.parse(raw).nodes[0].images[0].annotations.length; } catch { return -1; }
    }).toBe(2);
    await page.reload();
    await dismissOverlays(page);
    expect(await annotations(page)).toEqual(saved);
    await expect(page.locator('.node-image-thumb .node-image-thumb-marks [data-annot-id]')).toHaveCount(2);
    viewer = await openViewer(page);
    await expect(viewer.locator('.niv-annot-layer [data-annot-id]')).toHaveCount(2);
    expect(errors).toEqual([]);
  });

  test('marks stay aligned when the display width changes, and show on thumbnails', async ({ page }) => {
    const errors = trackErrors(page);
    await page.goto('file://' + indexPath);
    await dismissOverlays(page);
    await seedDoc(page, [{ id: 'i1', src: SHOT, caption: 'Shot', annotations: [
      { id: 'r1', type: 'rect', x: 0.25, y: 0.4, w: 0.5, h: 0.2, color: '#e8384f', strokeWidth: 0.0001 },
      { id: 'a1', type: 'arrow', x1: 0.1, y1: 0.1, x2: 0.3, y2: 0.3, color: '#2f7cf6', strokeWidth: 0.004 }
    ] }]);
    // thumbnail: same marks, scaled, laid over the picture
    const thumbMarks = page.locator('.node-image-thumb .node-image-thumb-marks');
    await expect(thumbMarks.locator('[data-annot-id]')).toHaveCount(2);
    await expect(thumbMarks).toHaveAttribute('viewBox', '0 0 800 500');
    await expect(thumbMarks).toHaveAttribute('preserveAspectRatio', 'xMinYMin slice');
    const viewer = await openViewer(page);
    const fracs: Array<{ x: number; y: number; w: number; h: number }> = [];
    const widths: number[] = [];
    for (const size of ['small', 'medium', 'full', 'auto']) {
      await page.evaluate((key) => (window as any).eval(`setNodeImageWidth(_nivState.nodeId, _nivState.imageId, IMAGE_WIDTH_PRESETS.find(p => p.key === '${key}').value); refreshNodeImageViewer();`), size);
      await page.waitForTimeout(50);
      widths.push((await viewer.locator('.niv-img').boundingBox())!.width);
      const layerBox = (await viewer.locator('.niv-annot-layer').boundingBox())!;
      const imgBox = (await viewer.locator('.niv-img').boundingBox())!;
      expect(Math.abs(layerBox.width - imgBox.width)).toBeLessThan(1);
      expect(Math.abs(layerBox.height - imgBox.height)).toBeLessThan(1);
      fracs.push(await markFrac(page, '#node-image-viewer .niv-img', '#node-image-viewer g[data-annot-type="rect"] rect'));
    }
    expect(new Set(widths.map((w) => Math.round(w))).size).toBeGreaterThan(1);
    for (const f of fracs) {
      expect(f.x).toBeCloseTo(0.25, 2); expect(f.y).toBeCloseTo(0.4, 2); expect(f.w).toBeCloseTo(0.5, 2); expect(f.h).toBeCloseTo(0.2, 2);
    }
    expect(errors).toEqual([]);
  });

  test('PDF figures overlay the marks exactly over the image at its width', async ({ page }) => {
    const errors = trackErrors(page);
    await page.goto('file://' + indexPath);
    await dismissOverlays(page);
    const ann = [
      { id: 'r1', type: 'rect', x: 0.25, y: 0.4, w: 0.5, h: 0.2, color: '#e8384f', strokeWidth: 0.0001 },
      { id: 't1', type: 'text', x: 0.6, y: 0.1, text: 'Here', size: 0.05, color: '#ffffff' }
    ];
    await seedDoc(page, [
      { id: 'p1', src: SHOT, caption: 'Marked 60%', width: 60, annotations: ann },
      { id: 'p2', src: SHOT, caption: 'Marked auto', annotations: ann },
      { id: 'p3', src: SHOT, caption: 'Plain' }
    ]);
    await page.evaluate(() => {
      // @ts-expect-error
      renderPreviewBody();
      // The headless PDF pipeline renders into a hidden overlay; show it so layout can be measured.
      const ov = document.getElementById('preview-overlay')!;
      ov.style.cssText = 'display:block;position:fixed;inset:0;overflow:auto;z-index:99999;background:#fff';
    });
    const body = page.locator('#preview-body');
    await expect(body.locator('.pv-node-image-figure')).toHaveCount(3);
    await expect(body.locator('.pv-node-image-marks')).toHaveCount(2);
    await expect(body.locator('.pv-node-image-figure').nth(2).locator('.pv-node-image-box')).toHaveCount(0);
    await expect.poll(() => body.locator('.pv-node-image-marks [data-annot-id]').count()).toBe(4);
    const geo = await page.evaluate(() => {
      const figs = [...document.querySelectorAll('#preview-body .pv-node-image-figure')].slice(0, 2);
      return figs.map((f) => {
        const img = f.querySelector('img')!.getBoundingClientRect();
        const svg = f.querySelector('svg')!.getBoundingClientRect();
        const r = f.querySelector('g[data-annot-type="rect"] rect')!.getBoundingClientRect();
        return { dw: Math.abs(img.width - svg.width), dh: Math.abs(img.height - svg.height), dx: Math.abs(img.left - svg.left), dy: Math.abs(img.top - svg.top),
          rx: (r.left - img.left) / img.width, ry: (r.top - img.top) / img.height, rw: r.width / img.width, imgW: img.width, caption: f.querySelector('figcaption')?.textContent };
      });
    });
    for (const g of geo) {
      expect(g.dw).toBeLessThan(1); expect(g.dh).toBeLessThan(1); expect(g.dx).toBeLessThan(1); expect(g.dy).toBeLessThan(1);
      expect(g.rx).toBeCloseTo(0.25, 2); expect(g.ry).toBeCloseTo(0.4, 2); expect(g.rw).toBeCloseTo(0.5, 2);
    }
    expect(geo.map((g) => g.caption)).toEqual(['Marked 60%', 'Marked auto']);
    expect(errors).toEqual([]);
  });

  test('malformed annotations in a stored document load without errors; duplicate and copy carry marks', async ({ page }) => {
    const errors = trackErrors(page);
    await page.addInitScript((src) => {
      if (sessionStorage.getItem('seededBadMarks')) return;
      sessionStorage.setItem('seededBadMarks', '1');
      const docId = 'badmarks1';
      localStorage.setItem('sakura_doc_v1_' + docId, JSON.stringify({
        nodes: [{ id: 1, depth: 0, text: 'Screens', parentId: null, isCheckbox: false, checked: false, tags: [], styles: {}, note: '',
          images: [{ id: 'i1', src, caption: 'Shot', annotations: [
            null, 7, 'x', { keep: 1 }, { type: 'blur', x: 0, y: 0, w: 1, h: 1 }, { type: 'rect', x: 'a', y: 0, w: 1, h: 1 },
            { type: 'rect', x: -5, y: 0.5, w: 99, h: 0.25, color: '" onload="alert(1)' },
            { type: 'text', x: 0.5, y: 0.5, text: '<img src=x onerror=alert(1)>' },
            { type: 'arrow', x1: 0, y1: 0, x2: 0, y2: 0 }
          ], createdAt: 5 }, { id: 'i2', src, caption: '', annotations: 'not an array', createdAt: 5 }] }],
        nextId: 2, selectedId: null, multiSelectedIds: [], selectionAnchorId: null, collapsed: [], title: 'Bad marks', author: ''
      }));
      localStorage.setItem('sakura_docs_index_v1', JSON.stringify([{ id: docId, title: 'Bad marks', updatedAt: Date.now() }]));
      localStorage.setItem('sakura_current_doc_v1', docId);
      localStorage.setItem('sakura_open_tabs_v1', JSON.stringify({ tabs: [docId], pinned: [], active: docId }));
    }, SHOT);
    await page.goto('file://' + indexPath);
    await dismissOverlays(page);
    const ann = await annotations(page);
    expect(ann.map((a: any) => a.type)).toEqual(['rect', 'text']);
    expect(ann[0]).toMatchObject({ x: 0, w: 1, color: '#e8384f' });
    expect(await annotations(page, 1, 1)).toEqual([]);
    await expect(page.locator('.node-image-thumb').first().locator('.node-image-thumb-marks [data-annot-id]')).toHaveCount(2);
    const viewer = await openViewer(page);
    await expect(viewer.locator('.niv-annot-layer [data-annot-id]')).toHaveCount(2);
    await expect(viewer.locator('.niv-annot-layer img')).toHaveCount(0);
    await expect(viewer.locator('.niv-annot-layer text')).toHaveText('<img src=x onerror=alert(1)>');
    await page.keyboard.press('Escape');
    // Duplicate carries the marks (deep copy).
    await page.evaluate(() => {
      // @ts-expect-error
      setSingleSelection(1); duplicateSelected();
    });
    const copies = await page.evaluate(() => {
      // @ts-expect-error
      const [a, b] = nodes.filter((n: any) => n.text === 'Screens');
      b.images[0].annotations[0].x = 0.5;
      return { a: a.images[0].annotations[0].x, bLen: b.images[0].annotations.length };
    });
    expect(copies).toEqual({ a: 0, bLen: 2 });
    expect(errors).toEqual([]);
  });
});
