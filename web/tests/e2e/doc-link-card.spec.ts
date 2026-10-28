import { test, expect, type Page } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

// The document header link uses the same one-line card as a link in the text (owner, 2026-10-23:
// "can't we use the same way for document header link?"): the address in the card with Open/Copy/
// Remove, the name renamed right on the chip. Enter or clicking away keeps, Escape cancels.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

async function open(page: Page) {
  await page.addInitScript(() => { localStorage.setItem('sakura_welcome_seen', '1'); sessionStorage.setItem('sakura_landing_dismissed', 'true'); });
  await page.goto('file://' + indexPath);
  await page.waitForFunction('typeof render === "function"');
  await page.evaluate(() => (window as any).eval('ensureDocumentForEditing(); render();'));
}
const link = (page: Page) => page.evaluate(() => (window as any).eval('[docLinkedUrl, docLinkedUrlLabel]'));

test('add a link: the address first, Enter keeps; then the name is renamed on the chip and clicking away keeps', async ({ page }) => {
  await open(page);
  const chip = page.locator('#doc-link-chip');
  // An empty link slot shows while the title area is hovered.
  await page.hover('#header-title');
  await chip.click();
  const menu = page.locator('#doc-link-menu');
  await expect(page.locator('#doc-link-input')).toBeFocused();
  await expect(page.locator('#doc-link-remove-btn')).toBeHidden();
  await page.keyboard.type('example.com/browse/PROJ-1');
  await page.keyboard.press('Enter');
  await expect(menu).not.toHaveClass(/open/);
  expect(await link(page)).toEqual(['https://example.com/browse/PROJ-1', '']);

  await chip.click();
  await expect(page.locator('#doc-link-label-input')).toBeFocused();
  await expect(page.locator('#doc-link-open-btn')).toBeVisible();
  await page.keyboard.type('PROJ-1');
  await page.mouse.click(5, 400);
  await expect(menu).not.toHaveClass(/open/);
  expect(await link(page)).toEqual(['https://example.com/browse/PROJ-1', 'PROJ-1']);
  await expect(chip).toContainText('PROJ-1');
});

test('Escape cancels, an address with spaces is refused, Remove takes the link off', async ({ page }) => {
  await open(page);
  await page.evaluate(() => (window as any).eval("setDocLinkedUrl('https://example.com/a', 'A')"));
  const chip = page.locator('#doc-link-chip');
  await chip.click();
  await expect(page.locator('#doc-link-label-input')).toBeFocused();
  await page.keyboard.type('B');
  await page.keyboard.press('Escape');
  expect(await link(page)).toEqual(['https://example.com/a', 'A']);
  await chip.click();
  await page.locator('#doc-link-input').fill('two words');
  await page.keyboard.press('Enter');
  await expect(page.locator('#doc-link-input')).toHaveClass(/is-invalid/);
  await expect(page.locator('#doc-link-menu')).toHaveClass(/open/);
  await page.locator('#doc-link-remove-btn').click();
  expect(await link(page)).toEqual(['', '']);
  await expect(chip).toContainText('Add link');
});

// The chip focuses the name field a moment after opening; that must not steal focus (and typing) from
// a field the user already moved to. Failed intermittently in CI before the fix (2026-10-24).
test('opening the card does not pull focus away from the address field', async ({ page }) => {
  await open(page);
  await page.evaluate(() => (window as any).eval("setDocLinkedUrl('https://example.com/a', 'A')"));
  await page.evaluate(() => { document.getElementById('doc-link-chip')!.click(); (document.getElementById('doc-link-input') as HTMLInputElement).focus(); });
  await page.waitForTimeout(50);
  await expect(page.locator('#doc-link-input')).toBeFocused();
});
