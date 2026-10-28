import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

test('every Help section belongs to a rail, and no removed feature is described', async ({ page }) => {
  await page.goto('file://' + indexPath);
  const r = await page.evaluate(() => {
    const rails = [...document.querySelectorAll('#help-rail .settings-rail-btn')].map((b) => (b as HTMLElement).dataset.cat);
    const cats = [...new Set([...document.querySelectorAll('#help-panel .help-section')].map((s) => (s as HTMLElement).dataset.cat))];
    return { rails, cats, text: document.getElementById('help-content')!.textContent || '' };
  });
  expect(r.rails).toEqual(['overview', 'writing', 'objects', 'documents', 'todos', 'ai', 'app']);
  for (const c of r.cats) expect(r.rails, c!).toContain(c);
  for (const gone of ["Won't answer", 'Bars & Menus', 'Profile visibility', 'Typewriter', 'Declutter', 'Try things like', 'Mark as decision'])
    expect(r.text, gone).not.toContain(gone);
});
