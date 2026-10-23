import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

// Owner, 2026-10-23: "unable to get the link popover at all ... unable to add the display text".
// While words are being edited and the caret is in a link, a one-line card under it has the link's
// address to edit in place, with Open, Copy and Remove; the words are renamed by typing over them
// (owner: "why are we making it two step?", then chose the one-line card).
async function seed(page: import('@playwright/test').Page, note = '') {
  await page.addInitScript(() => { localStorage.setItem('sakura_welcome_seen', '1'); sessionStorage.setItem('sakura_landing_dismissed', 'true'); });
  await page.goto('file://' + indexPath);
  await page.waitForFunction('typeof render === "function"');
  await page.evaluate((n) => {
    document.getElementById('sakura-landing-overlay')?.remove(); document.getElementById('welcome-overlay')?.remove();
    (window as any).eval(`ensureDocumentForEditing(); nodes=[normalizeNode({id:1,depth:0,text:'See ',parentId:null,isCheckbox:false,checked:false,note:${JSON.stringify(n)},tags:[],styles:{}})]; collapsedIds=new Set(); ${n ? 'inlineExpandNoteNodeIds=new Set([1]);' : ''} nextId=2; render();`);
  }, note);
}

test('a pasted address in a row: the caret in it shows the one-line link card; typing over the words renames it', async ({ page, context }) => {
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
  await expect(page.locator('#link-card-addr')).toHaveValue('https://example.com/plan');
  await expect(card.locator('input')).toHaveCount(1);
  // Select the link's words and type: the link stays on the new words.
  await page.evaluate(() => { const a = document.querySelector('.node-input a')!; const r = document.createRange(); r.selectNodeContents(a); const s = getSelection()!; s.removeAllRanges(); s.addRange(r); });
  await page.keyboard.type('the new plan');
  await page.keyboard.press('Escape');
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
  await expect(page.locator('#link-card-addr')).toHaveValue('https://example.com/spec');
  await card.locator('[data-tip="Remove link"]').click();
  // @ts-expect-error -- bare globals from index.html
  await expect.poll(() => page.evaluate(() => nodes[0].note)).not.toContain('<a');
  // @ts-expect-error
  expect(await page.evaluate(() => nodes[0].note)).toContain('the spec');
});

test('the card in a note: change the address in place; an address with spaces is refused; Escape keeps the old one', async ({ page }) => {
  await seed(page, 'Read <a href="https://example.com/spec" target="_blank" rel="noopener noreferrer">the spec</a> first');
  await page.locator('.node-note-line').click({ position: { x: 4, y: 6 } });
  await page.locator('.node-note-line a').click();
  const addr = page.locator('#link-card-addr');
  await addr.click();
  await addr.fill('two words');
  await page.keyboard.press('Enter');
  await expect(addr).toHaveClass(/is-invalid/);
  await page.keyboard.press('Escape');
  await expect(page.locator('#link-card')).toBeHidden();
  // @ts-expect-error -- bare globals from index.html
  expect(await page.evaluate(() => nodes[0].note)).toContain('href="https://example.com/spec"');
  await page.locator('.node-note-line a').click();
  await addr.click();
  await addr.fill('example.com/v2');
  await page.keyboard.press('Enter');
  // @ts-expect-error
  await expect.poll(() => page.evaluate(() => nodes[0].note)).toMatch(/href="https:\/\/example.com\/v2"[^>]*>the spec<\/a>/);
});

test('typing over a link in a note renames it and keeps the link; typing on keeps going inside it', async ({ page }) => {
  await seed(page, 'Read <a href="https://example.com/spec" target="_blank" rel="noopener noreferrer">https://example.com/spec</a> first');
  await page.locator('.node-note-line').click({ position: { x: 4, y: 6 } });
  await page.locator('.node-note-line a').click();
  await page.evaluate(() => { const a = document.querySelector('.node-note-line a')!; const r = document.createRange(); r.selectNodeContents(a); const s = getSelection()!; s.removeAllRanges(); s.addRange(r); });
  await page.keyboard.type('The spec');
  await page.mouse.click(5, 400);
  // @ts-expect-error -- bare globals from index.html
  await expect.poll(() => page.evaluate(() => nodes[0].note)).toMatch(/<a href="https:\/\/example.com\/spec"[^>]*>The spec<\/a> first/);
});
