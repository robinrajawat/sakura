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
