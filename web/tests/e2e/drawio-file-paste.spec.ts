import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

// Owner, 2026-10-23: a .drawio file pasted or dropped on a row becomes a diagram on that row (several allowed).
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => { try { localStorage.setItem('sakura_welcome_seen', '1'); sessionStorage.setItem('sakura_landing_dismissed', 'true'); } catch { /* storage unavailable */ } });
  await page.setViewportSize({ width: 1300, height: 800 });
  await page.goto('file://' + indexPath);
  await page.waitForFunction('typeof render === "function"');
  await page.evaluate(() => (window as any).eval(`
    const n = (id, depth, text) => ({ id, depth, text, parentId: null, isCheckbox: false, checked: false, note: '', tags: [], styles: {} });
    nodes = [n(1, 0, 'Alpha'), n(2, 0, 'Bravo')].map(normalizeNode); rebuildParentIds(); nextId = 3;
    collapsedIds = new Set(); selectedId = null; editingId = null; undoStack = []; render();`));
});

const XML = '<mxfile host="app.diagrams.net"><diagram name="Page-1" id="p1"><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/></root></mxGraphModel></diagram></mxfile>';
const rowDiagrams = (page, id: number) => page.evaluate((nid) => (window as any).eval(`diagrams.filter(d => d.anchorNodeId === ${nid}).map(d => d.title)`), id);

test('dropping .drawio and .drawio.svg files adds diagrams to that row, Undo removes them', async ({ page }) => {
  await page.evaluate((xml) => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" content="${xml.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}"><rect/></svg>`;
    const dt = new DataTransfer();
    dt.items.add(new File([xml], 'Landscape.drawio', { type: '' }));
    dt.items.add(new File([svg], 'Flow.drawio.svg', { type: 'image/svg+xml' }));
    const row = document.querySelector('.node-row[data-id="2"]')!;
    row.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));
  }, XML);
  await expect.poll(() => rowDiagrams(page, 2)).toEqual(['Landscape', 'Flow']);
  // The .drawio.svg went to diagrams, not images.
  expect(await page.evaluate(() => (window as any).eval('(nodes[1].images || []).length'))).toBe(0);
  await expect(page.locator('.node-row[data-id="2"] .node-diagram-dot')).toBeVisible();
  await page.locator('#toast .toast-action-btn', { hasText: 'Undo' }).click();
  await expect.poll(() => rowDiagrams(page, 2)).toEqual([]);
});

test('pasting draw.io XML on a selected row adds a diagram to it', async ({ page }) => {
  await page.locator('.node-row[data-id="1"]').click();
  await page.keyboard.press('Escape');
  await page.evaluate((xml) => (window as any).eval('selectedId = 1; editingId = null; render();') || xml, XML);
  await page.evaluate((xml) => {
    const dt = new DataTransfer(); dt.setData('text/plain', xml);
    document.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: dt }));
  }, XML);
  await expect.poll(() => rowDiagrams(page, 1)).toHaveLength(1);
  expect(await page.evaluate(() => (window as any).eval('nodes.length'))).toBe(2);
});

test('a .drawio.png gives back the diagram kept in its mxfile text chunk', async ({ page }) => {
  const xml = await page.evaluate(async (src) => {
    const enc = (s: string) => new TextEncoder().encode(s);
    const chunk = (type: string, data: Uint8Array) => { const b = new Uint8Array(12 + data.length); new DataView(b.buffer).setUint32(0, data.length); b.set(enc(type), 4); b.set(data, 8); return b; };
    const text = enc('mxfile\0' + encodeURIComponent(src));
    const parts = [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', new Uint8Array(13)), chunk('tEXt', text), chunk('IEND', new Uint8Array(0))];
    return (window as any).drawioXmlFromFile(new File(parts, 'Map.drawio.png', { type: 'image/png' }));
  }, XML);
  expect(xml).toBe(XML);
});
