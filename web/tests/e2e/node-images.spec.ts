import { test, expect, type Page } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

// Images as node objects (node.images): pictures/screenshots live on the node itself -- like
// node.tables -- shown as a thumbnail strip under the row, opened in an enlarged viewer, exported
// to PDF as figures. Newly added ones are downscaled to <=1600px and re-encoded (WebP, JPEG
// fallback); pictures embedded in an older note migrate into node.images on load.

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

// Small real images (the migration must not re-encode these, so their exact src is asserted).
const PNG_1x1 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
const GIF_1x1 = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBTAA7';

async function seedDoc(page: Page, extraNodes: Array<Record<string, unknown>> = []) {
  await page.evaluate((extra) => {
    // @ts-expect-error -- bare globals from index.html
    ensureDocumentForEditing();
    // @ts-expect-error
    nodes = [
      { id: 1, depth: 0, text: 'Screens', parentId: null, isCheckbox: false, checked: false, note: '', tags: [], styles: {} },
      { id: 2, depth: 1, text: 'Login flow', parentId: 1, isCheckbox: false, checked: false, note: '', tags: [], styles: {} },
      { id: 3, depth: 0, text: 'Other', parentId: null, isCheckbox: false, checked: false, note: '', tags: [], styles: {} },
      ...extra
      // @ts-expect-error
    ].map(normalizeNode);
    // @ts-expect-error
    collapsedIds = new Set(); selectedId = null; multiSelectedIds = []; selectAllMode = false; focusedId = null; undoStack = []; redoStack = []; editingId = null; nextId = 10;
    // @ts-expect-error
    render();
  }, extraNodes);
}

// Builds a realistic "screenshot" in the page (window chrome, sidebar, text lines, a photo-ish
// gradient) as a PNG File, stashing it on window.__testFiles under `key`.
async function makeScreenshotFile(page: Page, key: string, w = 2880, h = 1800) {
  return page.evaluate(async ({ key, w, h }) => {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#f4f5f7'; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#2d3748'; ctx.fillRect(0, 0, w, 90);
    ctx.fillStyle = '#e2e8f0'; ctx.fillRect(0, 90, 520, h - 90);
    const g = ctx.createLinearGradient(700, 300, 2200, 1200); g.addColorStop(0, '#5a67d8'); g.addColorStop(1, '#ed64a6');
    ctx.fillStyle = g; ctx.fillRect(700, 300, 1500, 800);
    ctx.fillStyle = '#1a202c'; ctx.font = '36px sans-serif';
    for (let i = 0; i < 28; i++) ctx.fillText('Settings row ' + i + ' — some interface text, value ' + (i * 37), 40, 160 + i * 56);
    for (let i = 0; i < 9; i++) ctx.fillText('Paragraph line ' + i + ': lorem ipsum dolor sit amet consectetur', 700, 1200 + i * 56);
    const blob: Blob = await new Promise((r) => c.toBlob((b) => r(b!), 'image/png'));
    const file = new File([blob], 'Screenshot.png', { type: 'image/png' });
    // @ts-expect-error -- test stash
    (window.__testFiles ||= {})[key] = file;
    return file.size;
  }, { key, w, h });
}

async function imageMeta(page: Page, nodeId: number) {
  return page.evaluate(async (id) => {
    // @ts-expect-error
    const n = nodes.find((x: any) => x.id === id);
    const out: Array<{ id: string; mime: string; w: number; h: number; bytes: number; caption: string; width?: number }> = [];
    for (const im of n.images) {
      const img = new Image(); img.src = im.src; await img.decode();
      // @ts-expect-error
      out.push({ id: im.id, mime: dataUrlMime(im.src), w: img.naturalWidth, h: img.naturalHeight, bytes: dataUrlByteLength(im.src), caption: im.caption, width: im.width });
    }
    return out;
  }, nodeId);
}

function pasteFileEvent(page: Page, key: string, targetSelector: string | null) {
  return page.evaluate(({ key, targetSelector }) => {
    // @ts-expect-error
    const file: File = window.__testFiles[key];
    const clipboardData = { getData: () => '', files: [file], items: [{ kind: 'file', type: file.type, getAsFile: () => file }] };
    const ev = new Event('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(ev, 'clipboardData', { value: clipboardData });
    const target = targetSelector ? document.querySelector(targetSelector)! : document.body;
    target.dispatchEvent(ev);
    return ev.defaultPrevented;
  }, { key, targetSelector });
}

async function nodeImageCount(page: Page, id: number) {
  // @ts-expect-error
  return page.evaluate((i) => (nodes.find((n: any) => n.id === i)?.images || []).length, id);
}

test.describe('Images as node objects', () => {
  test('migrates <img> embedded in an older note into node.images on load, keeping the text, idempotently', async ({ page }) => {
    const errors = trackErrors(page);
    await page.addInitScript(({ png, gif }) => {
      if (sessionStorage.getItem('seededImgDoc')) return;
      sessionStorage.setItem('seededImgDoc', '1');
      const docId = 'imgdoc1';
      localStorage.setItem('sakura_doc_v1_' + docId, JSON.stringify({
        nodes: [
          { id: 1, depth: 0, text: 'Old node', parentId: null, isCheckbox: false, checked: false, tags: [], styles: {},
            note: `<p>Intro text.</p><p><img src="${png}" alt="Login screen"></p><p>Look <img src="${gif}" alt="icon.gif"> here.</p><p><img src="blob:https://x/gone"></p>` },
          { id: 2, depth: 0, text: 'Image-only note', parentId: null, isCheckbox: false, checked: false, tags: [], styles: {}, note: `<img src="${png}">` },
          { id: 3, depth: 0, text: 'Already migrated', parentId: null, isCheckbox: false, checked: false, tags: [], styles: {}, note: '<p>plain</p>',
            images: [{ id: 'keep1', src: png, caption: 'Kept', width: 60, annotations: [{ id: 'm1', type: 'rect', x: 0.1, y: 0.2, w: 0.3, h: 0.4, color: '#e8384f', strokeWidth: 0.004 }], createdAt: 5 }] }
        ],
        nextId: 4, selectedId: null, multiSelectedIds: [], selectionAnchorId: null, collapsed: [], title: 'Migration test', author: ''
      }));
      localStorage.setItem('sakura_docs_index_v1', JSON.stringify([{ id: docId, title: 'Migration test', updatedAt: Date.now() }]));
      localStorage.setItem('sakura_current_doc_v1', docId);
      localStorage.setItem('sakura_open_tabs_v1', JSON.stringify({ tabs: [docId], pinned: [], active: docId }));
    }, { png: PNG_1x1, gif: GIF_1x1 });
    await page.goto('file://' + indexPath);
    await dismissOverlays(page);

    const result = await page.evaluate(() => {
      // @ts-expect-error
      const byId = (id: number) => nodes.find((n: any) => n.id === id);
      const n1 = byId(1), n2 = byId(2), n3 = byId(3);
      return {
        n1Images: n1.images.map((i: any) => ({ src: i.src, caption: i.caption, ann: i.annotations, hasId: !!i.id })),
        n1Note: n1.note,
        n2Images: n2.images.length, n2Note: n2.note,
        n3Images: n3.images,
        // @ts-expect-error
        again: migrateNoteImagesToNode(n1),
      };
    });
    expect(result.n1Images).toEqual([
      { src: PNG_1x1, caption: 'Login screen', ann: [], hasId: true },
      { src: GIF_1x1, caption: '', ann: [], hasId: true },
    ]);
    expect(result.n1Note).toContain('Intro text.');
    expect(result.n1Note).toMatch(/Look\s+here\./);
    expect(result.n1Note).not.toContain('data:image');
    expect(result.n1Note).toContain('blob:https://x/gone'); // no usable src: left alone
    expect(result.n2Images).toBe(1);
    expect(result.n2Note).toBe('');
    expect(result.n3Images).toEqual([{ id: 'keep1', src: PNG_1x1, caption: 'Kept', width: 60, annotations: [{ id: 'm1', type: 'rect', x: 0.1, y: 0.2, w: 0.3, h: 0.4, color: '#e8384f', strokeWidth: 0.004 }], createdAt: 5 }]);
    expect(result.again).toBe(false);

    await expect(page.locator('.node-row[data-id="1"] .node-image-dot')).toHaveCount(1);
    await expect(page.locator('.node-row[data-id="2"] .node-image-dot')).toHaveCount(1);
    await expect(page.locator('.node-image-strip[data-node-id="1"] .node-image-thumb')).toHaveCount(2);
    await expect(page.locator('.node-image-strip[data-node-id="1"] .node-image-caption')).toHaveText(['Login screen']);

    // Persisted: a save writes the migrated shape (annotations untouched).
    const stored = await page.evaluate(() => {
      // @ts-expect-error
      saveToStorage();
      return JSON.parse(localStorage.getItem('sakura_doc_v1_imgdoc1') || '{}');
    });
    expect(stored.nodes[0].images).toHaveLength(2);
    expect(stored.nodes[0].note).not.toContain('data:image');
    expect(stored.nodes[2].images[0].annotations).toEqual([{ id: 'm1', type: 'rect', x: 0.1, y: 0.2, w: 0.3, h: 0.4, color: '#e8384f', strokeWidth: 0.004 }]);
    // The deliberately unusable blob: picture left in the note fails to load -- expected.
    expect(errors.filter((e) => !/blob:https:\/\/x\/gone/.test(e))).toEqual([]);
  });

  test('pasting a screenshot on a selected node adds it to node.images, downscaled and re-encoded', async ({ page }) => {
    const errors = trackErrors(page);
    await page.goto('file://' + indexPath);
    await dismissOverlays(page);
    await seedDoc(page);
    const origBytes = await makeScreenshotFile(page, 'shot');
    await page.evaluate(() => {
      // @ts-expect-error
      setSingleSelection(2); render();
    });
    const prevented = await pasteFileEvent(page, 'shot', null);
    expect(prevented).toBe(true);
    await expect.poll(() => nodeImageCount(page, 2)).toBe(1);
    const [meta] = await imageMeta(page, 2);
    expect(['image/webp', 'image/jpeg']).toContain(meta.mime);
    expect(Math.max(meta.w, meta.h)).toBeLessThanOrEqual(1600);
    expect(meta.w).toBe(1600);
    expect(meta.h).toBe(1000);
    expect(meta.bytes).toBeLessThan(origBytes);
    // note untouched, no text node created from the paste
    const after = await page.evaluate(() => ({
      // @ts-expect-error
      note: nodes.find((n: any) => n.id === 2).note,
      // @ts-expect-error
      count: nodes.length,
    }));
    expect(after.note).toBe('');
    expect(after.count).toBe(3);
    await expect(page.locator('.node-row[data-id="2"] .node-image-dot')).toHaveCount(1);
    await expect(page.locator('.node-image-strip[data-node-id="2"] .node-image-thumb')).toHaveCount(1);
    expect(errors).toEqual([]);
  });

  test('pasting while editing the row, or in the note line, also goes to node.images (never the note HTML)', async ({ page }) => {
    await page.goto('file://' + indexPath);
    await dismissOverlays(page);
    await seedDoc(page);
    await makeScreenshotFile(page, 'small', 400, 300);
    // editing the row
    await page.evaluate(() => {
      // @ts-expect-error
      setSingleSelection(3); beginEdit(3, false);
    });
    await expect(page.locator('#in-3')).toBeVisible();
    await pasteFileEvent(page, 'small', '#in-3');
    await expect.poll(() => nodeImageCount(page, 3)).toBe(1);
    // note line focused
    await page.evaluate(() => {
      // @ts-expect-error
      commitEdit(); editingId = null; inlineExpandNoteNodeIds = new Set([1]); forceInlineNoteId = 1; render();
    });
    await page.locator('#note-line-1').click();
    await pasteFileEvent(page, 'small', '#note-line-1');
    await expect.poll(() => nodeImageCount(page, 1)).toBe(1);
    const note1 = await page.evaluate(() => {
      // @ts-expect-error
      return nodes.find((n: any) => n.id === 1).note;
    });
    expect(note1).not.toContain('<img');
    // a small image that needs no downscale is still re-encoded or kept only if smaller
    const [meta] = await imageMeta(page, 1);
    expect(meta.w).toBe(400);
    expect(['image/webp', 'image/jpeg', 'image/png']).toContain(meta.mime);
  });

  test('dropping image files onto a row and picking files via right-click → Add image… both add (multiple) images', async ({ page }) => {
    await page.goto('file://' + indexPath);
    await dismissOverlays(page);
    await seedDoc(page);
    await makeScreenshotFile(page, 'a', 2000, 1200);
    await makeScreenshotFile(page, 'b', 800, 2400);
    const dropped = await page.evaluate(() => {
      // @ts-expect-error
      const files: Record<string, File> = window.__testFiles;
      const dt = new DataTransfer(); dt.items.add(files.a); dt.items.add(files.b);
      const row = document.querySelector('.node-row[data-id="3"]')!;
      const over = new DragEvent('dragover', { dataTransfer: dt, bubbles: true, cancelable: true });
      row.dispatchEvent(over);
      const ev = new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true });
      row.dispatchEvent(ev);
      return { overPrevented: over.defaultPrevented, dropPrevented: ev.defaultPrevented };
    });
    expect(dropped).toEqual({ overPrevented: true, dropPrevented: true });
    await expect.poll(() => nodeImageCount(page, 3)).toBe(2);
    const metas = await imageMeta(page, 3);
    expect(metas.map((m) => [m.w, m.h])).toEqual([[1600, 960], [533, 1600]]);
    // one undo step for the whole drop
    await page.evaluate(() => {
      // @ts-expect-error
      undo();
    });
    expect(await nodeImageCount(page, 3)).toBe(0);
    await page.evaluate(() => {
      // @ts-expect-error
      redo();
    });
    expect(await nodeImageCount(page, 3)).toBe(2);

    // Right-click → More → Add image… opens a multi-file picker.
    const pngB64 = await page.evaluate(async () => {
      const c = document.createElement('canvas'); c.width = 1800; c.height = 900;
      const ctx = c.getContext('2d')!; ctx.fillStyle = '#336699'; ctx.fillRect(0, 0, 1800, 900); ctx.fillStyle = '#fff'; ctx.font = '60px sans-serif'; ctx.fillText('Picked file', 100, 200);
      return c.toDataURL('image/png').split(',')[1];
    });
    await page.locator('.node-row[data-id="1"]').click({ button: 'right' });
    // Add image… sits in the right-click quick row.
    const item = page.locator('#context-quickbar [data-action="image"]');
    await expect(item).toHaveAttribute('data-tip', /Add image…/);
    const chooserPromise = page.waitForEvent('filechooser');
    await item.click();
    const chooser = await chooserPromise;
    expect(chooser.isMultiple()).toBe(true);
    const buf = Buffer.from(pngB64, 'base64');
    await chooser.setFiles([{ name: 'one.png', mimeType: 'image/png', buffer: buf }, { name: 'two.png', mimeType: 'image/png', buffer: buf }]);
    await expect.poll(() => nodeImageCount(page, 1)).toBe(2);
    const picked = await imageMeta(page, 1);
    expect(picked.map((m) => m.w)).toEqual([1600, 1600]);
    expect(picked[0].id).not.toBe(picked[1].id);
  });

  test('viewer opens from a thumbnail, steps with arrows, edits caption, sets width, deletes; all undoable', async ({ page }) => {
    const errors = trackErrors(page);
    await page.goto('file://' + indexPath);
    await dismissOverlays(page);
    await seedDoc(page, [{ id: 4, depth: 0, text: 'Three shots', parentId: null, note: '', tags: [], styles: {}, images: [
      { id: 'i1', src: PNG_1x1, caption: 'First', annotations: [{ id: 'm1', type: 'rect', x: 0.1, y: 0.2, w: 0.3, h: 0.4, color: '#e8384f', strokeWidth: 0.004 }] },
      { id: 'i2', src: GIF_1x1, caption: '' },
      { id: 'i3', src: PNG_1x1, caption: 'Third' },
    ] }]);
    await page.locator('.node-image-strip[data-node-id="4"] .node-image-thumb').first().click();
    const viewer = page.locator('#node-image-viewer');
    await expect(viewer).toHaveClass(/open/);
    await expect(viewer.locator('.niv-counter')).toHaveText('1 / 3');
    await expect(viewer.locator('.niv-caption')).toHaveValue('First');
    await expect(viewer.locator('.niv-annot-layer')).toHaveCount(1);
    await page.keyboard.press('ArrowRight');
    await expect(viewer.locator('.niv-counter')).toHaveText('2 / 3');
    // arrows must not move the outline selection behind the viewer
    // @ts-expect-error
    const sel = await page.evaluate(() => selectedId);
    await viewer.locator('.niv-caption').fill('Second caption');
    await viewer.locator('.niv-caption').press('Enter');
    await viewer.locator('.niv-size-btn[data-size="medium"]').click();
    await expect(viewer.locator('.niv-size-btn[data-size="medium"]')).toHaveClass(/active/);
    let imgs = await page.evaluate(() => {
      // @ts-expect-error
      return nodes.find((n: any) => n.id === 4).images.map((i: any) => ({ id: i.id, caption: i.caption, width: i.width }));
    });
    expect(imgs[1]).toEqual({ id: 'i2', caption: 'Second caption', width: 60 });
    // @ts-expect-error
    expect(await page.evaluate(() => selectedId)).toBe(sel);
    await viewer.locator('.niv-next').click();
    await expect(viewer.locator('.niv-counter')).toHaveText('3 / 3');
    await expect(viewer.locator('.niv-next')).toBeDisabled();
    await viewer.locator('.niv-delete').click();
    await expect(viewer.locator('.niv-counter')).toHaveText('2 / 2');
    expect(await nodeImageCount(page, 4)).toBe(2);
    // Ctrl/Cmd+Z inside the viewer undoes the delete
    await page.keyboard.press('Control+z');
    await expect.poll(() => nodeImageCount(page, 4)).toBe(3);
    await page.keyboard.press('Escape');
    await expect(viewer).not.toHaveClass(/open/);
    await expect(page.locator('.node-image-strip[data-node-id="4"] .node-image-caption')).toHaveText(['First', 'Second caption', 'Third']);
    // undo width, then caption (one undo step for the whole caption edit)
    await page.evaluate(() => {
      // @ts-expect-error
      undo();
    });
    imgs = await page.evaluate(() => {
      // @ts-expect-error
      return nodes.find((n: any) => n.id === 4).images.map((i: any) => ({ caption: i.caption, width: i.width }));
    });
    expect(imgs[1]).toEqual({ caption: 'Second caption', width: undefined });
    await page.evaluate(() => {
      // @ts-expect-error
      undo();
    });
    imgs = await page.evaluate(() => {
      // @ts-expect-error
      return nodes.find((n: any) => n.id === 4).images.map((i: any) => ({ caption: i.caption, ann: i.annotations }));
    });
    expect(imgs[1].caption).toBe('');
    expect(imgs[0].ann).toEqual([{ id: 'm1', type: 'rect', x: 0.1, y: 0.2, w: 0.3, h: 0.4, color: '#e8384f', strokeWidth: 0.004 }]);
    // click outside closes; thumbnail right-click menu deletes
    await page.locator('.node-image-strip[data-node-id="4"] .node-image-thumb').nth(1).click();
    await expect(viewer).toHaveClass(/open/);
    await viewer.click({ position: { x: 5, y: 5 } });
    await expect(viewer).not.toHaveClass(/open/);
    await page.locator('.node-image-strip[data-node-id="4"] .node-image-thumb').nth(0).click({ button: 'right' });
    await page.locator('.sb-context-menu .sb-context-item', { hasText: 'Delete image' }).click();
    expect(await nodeImageCount(page, 4)).toBe(2);
    expect(errors).toEqual([]);
  });

  test('the image dot folds/unfolds the strip; a folded branch mentions images', async ({ page }) => {
    await page.goto('file://' + indexPath);
    await dismissOverlays(page);
    await seedDoc(page);
    await page.evaluate((png) => {
      // @ts-expect-error
      nodes[1].images = [{ id: 'z1', src: png, caption: '', annotations: [], createdAt: 1 }]; render();
    }, PNG_1x1);
    const dot = page.locator('.node-row[data-id="2"] .node-image-dot');
    await expect(dot).toHaveClass(/pv-dot-open/);
    await expect(dot).toHaveAttribute('data-tip', /This node has an image — click to fold it/);
    await dot.click();
    await expect(page.locator('.node-image-strip[data-node-id="2"]')).toHaveCount(0);
    await page.locator('.node-row[data-id="2"] .node-image-dot').click();
    await expect(page.locator('.node-image-strip[data-node-id="2"]')).toHaveCount(1);
    await page.evaluate(() => {
      // @ts-expect-error
      collapsedIds = new Set([1]); render();
    });
    await expect(page.locator('.node-row[data-id="1"] .fold-badge')).toHaveAttribute('data-tip', /contains an image/);
  });

  test('copy/paste (Ctrl/Cmd+C → paste), duplicate and backspace-merge carry images with fresh ids', async ({ page }) => {
    await page.goto('file://' + indexPath);
    await dismissOverlays(page);
    await seedDoc(page);
    await page.evaluate((png) => {
      // @ts-expect-error
      nodes[1].images = [{ id: 'c1', src: png, caption: 'Copied', width: 35, annotations: [{ id: 'm2', type: 'rect', x: 0.1, y: 0.2, w: 0.3, h: 0.4, color: '#e8384f', strokeWidth: 0.004 }], createdAt: 1 }]; render();
    }, PNG_1x1);
    // Real copy path, capturing what it writes to the clipboard.
    const clip = await page.evaluate(async () => {
      let captured: any = null;
      // @ts-expect-error
      window.ClipboardItem = class { constructor(public data: any) {} };
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { write: async (items: any[]) => { captured = items[0].data; } } });
      // @ts-expect-error
      setSingleSelection(2); render();
      // @ts-expect-error
      await copyNodesToClipboard();
      return { html: await captured['text/html'].text(), text: await captured['text/plain'].text() };
    });
    expect(clip.html).toContain('sakura-dl:');
    await page.evaluate(({ html, text }) => {
      // @ts-expect-error
      setSingleSelection(3); render();
      const ev = new Event('paste', { bubbles: true, cancelable: true });
      Object.defineProperty(ev, 'clipboardData', { value: { getData: (t: string) => (t === 'text/html' ? html : t === 'text/plain' ? text : ''), files: [], items: [] } });
      document.body.dispatchEvent(ev);
    }, clip);
    const pasted = await page.evaluate(() => {
      // @ts-expect-error
      const n = nodes.find((x: any) => x.text === 'Login flow' && x.id !== 2);
      return n ? n.images.map((i: any) => ({ id: i.id, caption: i.caption, width: i.width, ann: i.annotations })) : null;
    });
    expect(pasted).toHaveLength(1);
    expect(pasted![0]).toMatchObject({ caption: 'Copied', width: 35, ann: [{ id: 'm2', type: 'rect', x: 0.1, y: 0.2, w: 0.3, h: 0.4, color: '#e8384f', strokeWidth: 0.004 }] });
    expect(pasted![0].id).not.toBe('c1');

    // duplicate
    const dup = await page.evaluate(() => {
      // @ts-expect-error
      setSingleSelection(2); duplicateSelected();
      // @ts-expect-error
      const copies = nodes.filter((x: any) => x.text === 'Login flow');
      return copies.map((n: any) => n.images.map((i: any) => i.id)).flat();
    });
    expect(new Set(dup).size).toBe(dup.length);
    expect(dup.length).toBe(3);

    // backspace-merge: node 3 merges into the previous visible row; its images follow
    const merged = await page.evaluate((png) => {
      // @ts-expect-error
      nodes = [{ id: 20, depth: 0, text: 'A', parentId: null, note: '', tags: [], styles: {}, images: [{ id: 'a1', src: png }] }, { id: 21, depth: 0, text: 'B', parentId: null, note: '', tags: [], styles: {}, images: [{ id: 'b1', src: png }] }].map(normalizeNode);
      // @ts-expect-error
      collapsedIds = new Set(); render(); mergeNodeIntoPrevAndFocus(21, 'B');
      // @ts-expect-error
      return nodes.map((n: any) => ({ text: n.text, imgs: n.images.map((i: any) => i.id) }));
    }, PNG_1x1);
    expect(merged).toEqual([{ text: 'AB', imgs: ['a1', 'b1'] }]);
  });

  // The right-click menu is fixed now (item 14): Add image… is always there (under More), and an
  // older saved menu customization -- even one that left it out -- is ignored.
  test('right-click menu always offers Add image…, whatever an older saved menu said', async ({ page }) => {
    await page.addInitScript(() => {
      if (sessionStorage.getItem('seededPrefs')) return;
      sessionStorage.setItem('seededPrefs', '1');
      localStorage.setItem('sakura_v001_prefs', JSON.stringify({ contextQuickActions: ['note', 'diagram', 'table'], ctxImageActionAdded: true }));
    });
    await page.goto('file://' + indexPath);
    await dismissOverlays(page);
    await seedDoc(page);
    await page.locator('.node-row').first().click({ button: 'right' });
    await expect(page.locator('#context-quickbar [data-action="image"]')).toBeVisible();
    await expect(page.locator('#ctxq-image')).toHaveCount(0);
    await expect(page.locator('#hoverq-image')).toHaveCount(0);
  });

  test('PDF renders each node image as a figure with its width and caption; OPML leaves images out', async ({ page }) => {
    await page.goto('file://' + indexPath);
    await dismissOverlays(page);
    await seedDoc(page);
    await page.evaluate((png) => {
      // @ts-expect-error
      nodes[1].images = [{ id: 'p1', src: png, caption: 'Login page', width: 60 }, { id: 'p2', src: png, caption: '' }].map((x) => ({ ...x, annotations: [], createdAt: 1 }));
      // @ts-expect-error
      renderPreviewBody();
    }, PNG_1x1);
    const pdf = await page.evaluate(() => {
      const body = document.getElementById('preview-body')!;
      const figs = [...body.querySelectorAll('.pv-node-image-figure')] as HTMLElement[];
      return figs.map((f) => ({ width: f.style.width, auto: f.classList.contains('pv-node-image-auto'), caption: f.querySelector('figcaption')?.textContent || '', hasImg: !!f.querySelector('img.pv-node-image') }));
    });
    expect(pdf).toEqual([
      { width: '60%', auto: false, caption: 'Login page', hasImg: true },
      { width: '', auto: true, caption: '', hasImg: true },
    ]);
    // @ts-expect-error
    const opml = await page.evaluate(() => serializeOpml(nodes));
    expect(opml).toContain('Login flow');
    expect(opml).not.toContain('data:image');
  });
});
