import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

test('depth guide lines run unbroken past a chips/cards block to the next row', async ({ page }) => {
  await page.goto('file://' + indexPath);
  const gaps = await page.evaluate(() => {
    const l = document.getElementById('sakura-landing-overlay');
    if (l) l.style.display = 'none';
    document.getElementById('welcome-overlay')?.classList.remove('open');
    const n = (id: number, depth: number, text: string, parentId: number | null, tables: string[] = []) =>
      ({ id, depth, text, parentId, isCheckbox: false, checked: false, note: '', tags: [], styles: {}, tables });
    const chips = '<table data-table-display="chips"><tr><th>C</th><th>D</th></tr><tr><td>ZN</td><td>Night</td></tr></table>';
    // @ts-expect-error -- bare globals from index.html
    nodes = [n(1, 0, 'Scope', null), n(2, 1, 'Customers', 1, [chips]), n(3, 1, 'Address change', 1)];
    // @ts-expect-error
    nextId = 4; collapsedIds = new Set(); render();
    const wrap = document.querySelector('.node-table-line-wrap')!;
    const guide = wrap.querySelector('.node-vguide')!.getBoundingClientRect();
    const next = document.querySelector('.node-row[data-id="3"]')!.getBoundingClientRect();
    return next.top - guide.bottom;
  });
  expect(gaps).toBeLessThanOrEqual(0.5);
});
