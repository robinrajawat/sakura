import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

// Diagram pictures for the phone (owner, 2026-11-03): the computer copies each diagram's rendered
// picture to users/{uid}/docs/{id}/previews/{diagramId}, a record of its own that the document
// never reads back. Only SVG pictures of a sane size go up, each once, and a failed upload never
// breaks the save it rides along with.
test('pictures go up once each, odd ones are skipped, a failure never throws', async ({ page }) => {
  await page.addInitScript(() => { localStorage.setItem('sakura_welcome_seen', '1'); sessionStorage.setItem('sakura_landing_dismissed', 'true'); });
  await page.goto('file://' + indexPath);
  const result = await page.evaluate(async () => {
    const w = window as any;
    const writes: string[] = [];
    let fail = false;
    const mod = {
      doc: (_db: unknown, ...parts: string[]) => parts.join('/'),
      setDoc: (p: string, v: { svg: string }) => {
        if (fail) return Promise.reject(new Error('offline'));
        writes.push(p + ' ' + v.svg.slice(0, 18));
        return Promise.resolve();
      }
    };
    const svg = 'data:image/svg+xml;base64,PHN2Zy8+';
    const items = [
      { id: 'a', previewSvg: svg },
      { id: 'b', previewSvg: 'data:image/png;base64,AAAA' },
      { id: 'c', previewSvg: 'data:image/svg+xml,' + 'x'.repeat(1000001) },
      { id: 'd' }
    ];
    await w.pushDiagramPreviews(mod, {}, 'u1', 'd1', items);
    const first = writes.slice();
    await w.pushDiagramPreviews(mod, {}, 'u1', 'd1', items); // unchanged: no second upload
    const second = writes.length;
    fail = true;
    let threw = false;
    try { await w.pushDiagramPreviews(mod, {}, 'u1', 'd1', [{ id: 'a', previewSvg: svg + 'Zm9v' }]); } catch { threw = true; }
    return { first, second, threw };
  });
  expect(result.first).toEqual(['users/u1/docs/d1/previews/a data:image/svg+xml']);
  expect(result.second).toBe(1);
  expect(result.threw).toBe(false);
});

// Tables for the phone (owner, 2026-11-03): the computer draws each table with the outline's own
// code and sends the copies in one record, docs/{id}/previews/_tables, keyed by the table's stored
// HTML. Sent again only when something changed; a failed write never throws.
test('table copies go up drawn by the outline code, once per change, never throwing', async ({ page }) => {
  await page.addInitScript(() => { localStorage.setItem('sakura_welcome_seen', '1'); sessionStorage.setItem('sakura_landing_dismissed', 'true'); });
  await page.goto('file://' + indexPath);
  const result = await page.evaluate(async () => {
    const w = window as any;
    const writes: { path: string; data: any }[] = [];
    let fail = false;
    const mod = {
      doc: (_db: unknown, ...parts: string[]) => parts.join('/'),
      setDoc: (p: string, v: any) => { if (fail) return Promise.reject(new Error('offline')); writes.push({ path: p, data: v }); return Promise.resolve(); }
    };
    const plain = '<table><tr><th>Item</th><th>Status</th></tr><tr><td>Night shifts</td><td>Open</td></tr></table>';
    const chips = '<table data-table-display="chips"><tr><th>Code</th><th>Meaning</th></tr><tr><td>ZN</td><td>Night</td></tr><tr><td>ZL</td><td>Fixed</td></tr></table>';
    const nodes = [{ id: 1, text: 'a', tables: [plain] }, { id: 2, text: 'b', tables: [chips, 42] }, { id: 3, text: 'c' }];
    await w.pushTablePreviews(mod, {}, 'u1', 'd1', nodes);
    await w.pushTablePreviews(mod, {}, 'u1', 'd1', nodes); // unchanged: no second write
    const first = writes.slice();
    fail = true;
    let threw = false;
    try { await w.pushTablePreviews(mod, {}, 'u1', 'd1', [{ id: 1, tables: [plain.replace('Open', 'Done')] }]); } catch { threw = true; }
    return { first, threw, plainKey: w.tableSnapshotKey(plain), chipsKey: w.tableSnapshotKey(chips) };
  });
  expect(result.first).toHaveLength(1);
  expect(result.first[0].path).toBe('users/u1/docs/d1/previews/_tables');
  const items = result.first[0].data.items;
  expect(Object.keys(items).sort()).toEqual([result.plainKey, result.chipsKey].sort());
  expect(items[result.plainKey].html).toContain('tbl-polished');
  expect(items[result.plainKey].html).toContain('tbl-status-pill');
  expect(items[result.chipsKey].html).toContain('pv-table-chips');
  expect(result.threw).toBe(false);
});
