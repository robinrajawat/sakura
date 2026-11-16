import { test, expect, type Page } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

// The diagram editor keeps the drawing as it changes (draw.io's autosave), so neither closing it nor
// the app being put away loses anything drawn since the last Save (data-safety standard,
// docs/data-safety-audit.md). draw.io itself can't load here (embed.diagrams.net), so the test
// plays its side of the conversation: the messages it sends to Sakura.

const KNOWN_NOISE = /ServiceWorker|cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net|embed\.diagrams\.net|CORS policy|Failed to load resource|net::ERR/i;
const XML = '<mxfile><diagram id="p1" name="Page-1"><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/><mxCell id="2" value="Drawn" vertex="1" parent="1"><mxGeometry width="80" height="40" as="geometry"/></mxCell></root></mxGraphModel></diagram></mxfile>';

async function openEditor(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (err) => { if (!KNOWN_NOISE.test(err.message)) errors.push(err.message); });
  await page.addInitScript(() => { try { localStorage.setItem('sakura_welcome_seen', '1'); sessionStorage.setItem('sakura_landing_dismissed', 'true'); } catch { /* storage unavailable */ } });
  await page.goto('file://' + indexPath);
  await expect.poll(() => page.evaluate('typeof render === "function"')).toBe(true);
  await page.evaluate(`
    createDoc();
    nodes = [{ id: 1, depth: 0, text: 'Flow', parentId: null, isCheckbox: false, checked: false, note: '', tables: [], images: [], tags: [], styles: {} }];
    rebuildParentIds(); nextId = 2; diagrams = []; selectedId = 1; render(); saveToStorage();
    createDiagram();
  `);
  await expect(page.locator('#diagram-editor-overlay')).toHaveClass(/open/);
  return errors;
}
// A message from the editor's frame, as draw.io sends it.
const fromDrawio = (page: Page, msg: object) => page.evaluate((m) => {
  const frame = document.querySelector('#diagram-editor-iframe-wrap iframe') as HTMLIFrameElement;
  window.dispatchEvent(new MessageEvent('message', { data: JSON.stringify(m), source: frame.contentWindow }));
}, msg);

test('a drawing is kept as it changes, and closing doesn\'t ask or lose it', async ({ page }) => {
  const errors = await openEditor(page);
  // Before the diagram is loaded into the editor, nothing it sends is kept.
  await fromDrawio(page, { event: 'autosave', xml: '<mxfile/>' });
  expect(await page.evaluate('diagrams[0].xml')).toBe('');
  await fromDrawio(page, { event: 'init' });
  await fromDrawio(page, { event: 'autosave', xml: XML });
  expect(await page.evaluate('diagrams[0].xml')).toBe(XML);
  await expect(page.locator('#diagram-editor-status')).toHaveText('Saved');
  // Closing: no "you may lose changes" question; it closes (here after the picture's short wait).
  await page.evaluate('closeDiagramEditor()');
  await expect(page.locator('.sakura-modal-overlay.open, #sakura-modal-overlay.open')).toHaveCount(0);
  await expect(page.locator('#diagram-editor-overlay')).not.toHaveClass(/open/, { timeout: 5000 });
  expect(await page.evaluate('diagrams[0].xml')).toBe(XML);
  expect(errors).toEqual([]);
});

test('without autosave from draw.io, closing still asks first', async ({ page }) => {
  const errors = await openEditor(page);
  await fromDrawio(page, { event: 'init' });
  await page.evaluate('void closeDiagramEditor()');
  await expect(page.getByText('Close the diagram editor?')).toBeVisible();
  expect(errors).toEqual([]);
});
