import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

// Copy thread: the whole thread as rich text with a plain-text twin, from the thread header's
// right-click menu or an entry's menu.

const KNOWN_NOISE = /ServiceWorker|cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net|embed\.diagrams\.net|CORS policy|Failed to load resource|net::ERR/i;

test('Copy thread puts the thread on the clipboard as rich text and plain lines', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const errors: string[] = [];
  page.on('pageerror', (err) => { if (!KNOWN_NOISE.test(err.message)) errors.push(err.message); });
  await page.addInitScript(() => { localStorage.setItem('sakura_welcome_seen', '1'); sessionStorage.setItem('sakura_landing_dismissed', 'true'); });
  await page.setViewportSize({ width: 1200, height: 800 });
  await page.goto('file://' + indexPath);
  await page.waitForFunction('typeof render === "function" && typeof nodes !== "undefined"');
  await page.evaluate(`
    const n = (id, depth, text) => ({ id, depth, text, parentId: null, isCheckbox: false, checked: false, note: '', tables: [], images: [], tags: [], styles: {} });
    nodes = [n(1, 0, 'Cutover weekend')]; rebuildParentIds(); nextId = 2;
    remarks = [
      { id: 'q', anchorNodeId: 1, person: 'Karsten', date: '2026-10-14', text: 'Does it include <b>EDI</b>?', type: 'question', createdAt: Date.UTC(2026, 9, 14, 9) },
      { id: 'a', anchorNodeId: 1, person: 'Ana', date: '2026-10-14', text: 'All partners.', answerTo: 'q', verdict: 'yes', createdAt: Date.UTC(2026, 9, 14, 10) },
      { id: 'd', anchorNodeId: 1, person: 'Robin', date: '2026-10-15', text: 'We go with Nov 2.', decision: true, createdAt: Date.UTC(2026, 9, 15, 9) }
    ];
    qaItems = []; inlineExpandRemarksNodeIds = new Set([1]); collapsedIds = new Set(); editingId = null; render();
  `);
  await page.locator('.thread-head').click({ button: 'right' });
  await page.locator('.sb-context-menu').getByText('Copy thread', { exact: true }).click();
  await expect(page.locator('.toast, #toast').filter({ hasText: 'Thread copied' }).first()).toBeVisible();
  const clip = await page.evaluate(async () => {
    const [item] = await navigator.clipboard.read();
    return { html: await (await item.getType('text/html')).text(), text: await (await item.getType('text/plain')).text() };
  });
  expect(clip.text.split('\n')[0]).toBe('Thread · Cutover weekend');
  expect(clip.text).toContain('question, answered');
  expect(clip.text).toContain('Does it include EDI?');
  expect(clip.text).toMatch(/Ana · [^\n]* · yes\nAll partners\./);
  expect(clip.text).toMatch(/Robin · [^\n]*2026[^\n]* · decision\nWe go with Nov 2\./);
  expect(clip.html).toContain('<b>EDI</b>');
  // Names plain bold (owner, 2026-10-23) and each entry's kind as a symbol in its colour (SVG doesn't survive a paste).
  expect(clip.html).toContain('<b>Karsten</b>');
  expect(clip.html).toMatch(/<span style="color:rgb\([^"]+\);font-weight:600">\u{1F91D}<\/span>/u);
  expect(clip.html).toMatch(/<span style="color:rgb\([^"]+\);font-weight:600">\u2713<\/span>/);
  // The entry menu offers it too.
  await page.locator('#inline-remark-text-d').click({ button: 'right' });
  await expect(page.locator('.sb-context-menu').getByText('Copy thread', { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});
