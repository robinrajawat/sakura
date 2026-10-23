import { test, expect, type Page } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

// A diagram's stamp (owner, 2026-10-23): the old diagram status, only visible inside the draw.io
// editor, became a stamp with the document's set (Draft, Review, Approved, Rejected). It is drawn
// into the picture in a band above the diagram, so it never covers a shape, and shows the same in
// the thumbnail, preview, PDF, Copy and Download.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');
const SVG = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="200" viewBox="0 0 400 200" content="&lt;mxfile/&gt;"><rect x="300" y="0" width="100" height="40" fill="#cde"/></svg>');

async function open(page: Page, status?: string) {
  await page.addInitScript(() => { localStorage.setItem('sakura_welcome_seen', '1'); sessionStorage.setItem('sakura_landing_dismissed', 'true'); });
  await page.goto('file://' + indexPath);
  await page.waitForFunction('typeof render === "function"');
  await page.evaluate(({ svg, status }) => {
    document.getElementById('sakura-landing-overlay')?.remove(); document.getElementById('welcome-overlay')?.remove();
    (window as any).eval(`ensureDocumentForEditing(); nodes=[normalizeNode({id:1,depth:0,text:'Order flow',parentId:null,isCheckbox:false,checked:false,note:'',tags:[],styles:{}})];
      diagrams=[Object.assign({id:'d1',anchorNodeId:1,title:'Night delivery',xml:'<mxGraphModel/>',previewSvg:${JSON.stringify(svg)},previewBorder:12,pageSvgs:[],pageCount:1,note:'',createdAt:1,modifiedAt:1,_hydrated:true},${JSON.stringify(status ? { status } : {})})];
      inlineExpandDiagramNodeIds=new Set([1]); collapsedIds=new Set(); nextId=2; undoStack=[]; render();`);
  }, { svg: SVG, status });
}
const thumbSrc = (page: Page) => page.locator('.node-diagram-preview-thumb img').getAttribute('src');

test('old statuses carry over: Final is Approved, the old default Draft is no stamp', async ({ page }) => {
  await open(page, 'final');
  expect(await page.evaluate('diagramStampOf(diagrams[0])')).toBe('approved');
  expect(decodeURIComponent((await thumbSrc(page))!)).toContain('APPROVED');
  await open(page, 'draft');
  expect(await page.evaluate('diagramStampOf(diagrams[0])')).toBe('');
  expect(await thumbSrc(page)).toBe(SVG);
});

test('the preview\'s Stamp button sets a stamp in a band above the diagram; No stamp takes it off', async ({ page }) => {
  await open(page);
  await page.locator('.node-diagram-preview-thumb').click();
  const viewer = page.locator('#diagram-viewer');
  await expect(viewer.locator('.dv-stamp')).toHaveText('No stamp');
  await viewer.locator('.dv-stamp').click();
  await page.locator('.sb-context-menu .sb-context-choice', { hasText: 'Approved' }).click();
  await expect(viewer.locator('.dv-stamp')).toHaveText('Approved');
  const src = decodeURIComponent((await viewer.locator('.dv-canvas img').getAttribute('src'))!);
  expect(src).toContain('APPROVED');
  // The band: the picture grows upwards, the diagram itself is untouched.
  expect(src).toMatch(/viewBox="0 -\d+(\.\d+)? 400 \d+/);
  expect(src).toContain('content="&lt;mxfile/&gt;"');
  expect(decodeURIComponent((await thumbSrc(page))!)).toContain('APPROVED');
  await page.keyboard.press('Escape');
  // The thumbnail menu has the same choices.
  await page.locator('.node-diagram-preview-thumb').click({ button: 'right' });
  await page.locator('.sb-context-menu .sb-context-item', { hasText: 'Stamp' }).hover();
  await page.locator('.sb-context-submenu .sb-context-choice', { hasText: 'Rejected' }).click();
  expect(await page.evaluate('diagramStampOf(diagrams[0])')).toBe('rejected');
  await page.locator('.node-diagram-preview-thumb').click({ button: 'right' });
  await page.locator('.sb-context-menu .sb-context-item', { hasText: 'Stamp' }).hover();
  await page.locator('.sb-context-submenu .sb-context-item', { hasText: 'No stamp' }).click();
  expect(await page.evaluate('diagramStampOf(diagrams[0])')).toBe('');
});

test('the stamp goes into the PDF and the downloaded SVG (which still opens in draw.io)', async ({ page }) => {
  await open(page, 'review');
  const pages = await page.evaluate('diagramDisplayPages(diagrams[0])') as { svg: string }[];
  expect(decodeURIComponent(pages[0].svg)).toContain('REVIEW');
  await page.locator('.node-diagram-preview-thumb').click({ button: 'right' });
  await page.locator('.sb-context-menu .sb-context-item', { hasText: 'Download' }).hover();
  const [dl] = await Promise.all([page.waitForEvent('download'), page.locator('.sb-context-submenu').getByText('SVG', { exact: false }).click()]);
  const text = fs.readFileSync(await dl.path(), 'utf8');
  expect(text).toContain('REVIEW');
  expect(text).toContain('content="&lt;mxfile/&gt;"');
});
