import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.resolve(__dirname, '../../dist');

test.describe('built output actually runs (not just present on disk)', () => {
  test.skip(!existsSync(distDir), 'dist/ not built yet — run `npm run build` first');

  test('built index.html loads and the editor pane renders', async ({ page }) => {
    await page.goto('file://' + path.join(distDir, 'index.html'));
    await page.waitForTimeout(500);
    const hasEditorPane = await page.evaluate(() => !!document.getElementById('editor-pane'));
    expect(hasEditorPane).toBe(true);
  });

  test('built hub.html loads', async ({ page }) => {
    await page.goto('file://' + path.join(distDir, 'hub.html'));
    await page.waitForTimeout(300);
    const title = await page.title();
    expect(title).toContain('Sakura');
  });
});
