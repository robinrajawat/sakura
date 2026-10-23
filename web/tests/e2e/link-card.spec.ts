import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

// Owner, 2026-10-23: "unable to get the link popover at all ... unable to add the display text".
// While words are being edited and the caret is in a link, a card under it offers the link's own
// actions (open, copy, edit, remove), as document editors do; Edit opens the labelled Link box.
async function seed(page: import('@playwright/test').Page, note = '') {
  await page.addInitScript(() => { localStorage.setItem('sakura_welcome_seen', '1'); sessionStorage.setItem('sakura_landing_dismissed', 'true'); });
  await page.goto('file://' + indexPath);
  await page.waitForFunction('typeof render === "function"');
  await page.evaluate((n) => {
    document.getElementById('sakura-landing-overlay')?.remove(); document.getElementById('welcome-overlay')?.remove();
    (window as any).eval(`ensureDocumentForEditing(); nodes=[normalizeNode({id:1,depth:0,text:'See ',parentId:null,isCheckbox:false,checked:false,note:${JSON.stringify(n)},tags:[],styles:{}})]; collapsedIds=new Set(); ${n ? 'inlineExpandNoteNodeIds=new Set([1]);' : ''} nextId=2; render();`);
  }, note);
}

test('a pasted address in a row: the caret in it shows the link card; Edit sets the words to show', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await seed(page);
  await page.locator('.node-row[data-id="1"] .node-label').click();
  await page.keyboard.press('End');
  await page.evaluate(() => navigator.clipboard.writeText('https://example.com/plan'));
  await page.keyboard.press('ControlOrMeta+v');
  const card = page.locator('#link-card');
  await expect(card).toBeHidden();
  await page.keyboard.press('ArrowLeft'); await page.keyboard.press('ArrowLeft');
  await expect(card).toBeVisible();
  await expect(card.locator('.link-card-url')).toHaveText('example.com/plan');
  await card.locator('[data-tip="Edit link"]').click();
  await expect(card).toBeHidden();
  const box = page.locator('#selection-fmt-popover');
  await expect(box.locator('.sfmt-url-label')).toHaveText(['Text', 'Address']);
  await expect(page.locator('#sfmt-link-text')).toBeFocused();
  await page.keyboard.type('the new plan');
  await page.keyboard.press('Enter');
  const link = page.locator('.node-row[data-id="1"] a.row-weblink');
  await expect(link).toHaveText('the new plan');
  await expect(link).toHaveAttribute('href', 'https://example.com/plan');
  // The box sits under the words, not over the lines above.
  const l = (await link.boundingBox())!;
  await page.locator('.node-row[data-id="1"] .node-label').click();
  await page.keyboard.press('End'); await page.keyboard.press('ArrowLeft'); await page.keyboard.press('ArrowLeft');
  await expect(card).toBeVisible();
  expect((await card.boundingBox())!.y).toBeGreaterThan(l.y);
  // Moving the caret out of the link hides the card.
  await page.keyboard.press('Home');
  await expect(card).toBeHidden();
});

test('the same card in a note; Remove takes the link off and keeps the words', async ({ page }) => {
  await seed(page, 'Read <a href="https://example.com/spec" target="_blank" rel="noopener noreferrer">the spec</a> first');
  const noteLine = page.locator('.node-note-line');
  await noteLine.click({ position: { x: 4, y: 6 } });
  await page.locator('.node-note-line a').click();
  const card = page.locator('#link-card');
  await expect(card).toBeVisible();
  await expect(card.locator('.link-card-url')).toHaveText('example.com/spec');
  await card.locator('[data-tip="Remove link"]').click();
  // @ts-expect-error -- bare globals from index.html
  await expect.poll(() => page.evaluate(() => nodes[0].note)).not.toContain('<a');
  // @ts-expect-error
  expect(await page.evaluate(() => nodes[0].note)).toContain('the spec');
});
