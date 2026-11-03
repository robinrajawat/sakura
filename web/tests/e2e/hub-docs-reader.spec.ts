import { test, expect, type Page } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const hubPath = path.resolve(__dirname, '../../hub.html');

// Reading documents on the phone (owner, 2026-11-03): the Documents tab lists synced documents and
// opens one read only. Owner: "there should be no way to corrupt the documents" -- the fake
// Firestore below records every write, and these tests fail if the documents view makes one.

const now = Date.now();
const cloud: Record<string, unknown> = {
  'users/u1/meta/docsIndex': { value: [
    { id: 'd1', title: 'Night delivery', updatedAt: now - 3600e3 },
    { id: 'd2', title: 'Roadmap', updatedAt: now - 86400e3 * 3 },
    { id: 'dx', title: 'In the bin', updatedAt: now, trashedAt: now }
  ], updatedAt: now },
  'users/u1/meta/folders': { value: [{ id: 'f1', name: 'Projects' }], updatedAt: now },
  'users/u1/meta/docFolderMap': { value: { d1: 'f1' }, updatedAt: now },
  'users/u1/docs/d1': {
    title: 'Night delivery', author: 'Robin', docStatus: 'Draft', updatedAt: now - 3600e3, collapsed: [3],
    nodes: [
      { id: 1, depth: 0, text: 'Goals', styles: { heading: 1 } },
      { id: 2, depth: 1, text: 'Cost under 4 EUR', marker: 'followup', note: '<p>Finance <b>first</b><img src="x" onerror="window.__pwned=1"></p><script>window.__pwned=1</script>' },
      { id: 3, depth: 0, text: 'Rollout' },
      { id: 4, depth: 1, text: 'Oslo' },
      { id: 5, depth: 1, text: 'Bergen, see Goals', marks: [{ s: 12, e: 17, k: 'r', v: '2' }], marksText: 'Bergen, see Goals' },
      { id: 6, depth: 0, text: 'SMS at night', isCheckbox: true }
    ],
    remarks: [
      { id: 'q', anchorNodeId: 6, person: 'Kristoffer', text: 'Consent needed?', type: 'question', createdAt: now - 86400e3 }
    ],
    diagrams: [{ id: 'g1', title: 'Route map', anchorNodeId: 6 }, { id: 'g2', title: 'Depot flow', anchorNodeId: 6 }]
  },
  // The picture the computer uploads for the phone; a non-SVG entry must be ignored.
  'users/u1/docs/d1/previews/g1': { svg: 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" style="color-scheme: light dark;" width="40" height="20"><rect width="40" height="20" fill="#ccc"/></svg>') },
  'users/u1/docs/d1/previews/g2': { svg: 'javascript:alert(1)' }
};

async function openHub(page: Page) {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('file://' + hubPath);
  await page.evaluate((data) => {
    const w = window as any;
    w.__writes = [];
    const rec = (name: string) => (...args: unknown[]) => { w.__writes.push([name, String(args[0])]); return Promise.resolve(); };
    const mod = {
      doc: (_db: unknown, ...parts: string[]) => parts.join('/'),
      collection: (_db: unknown, ...parts: string[]) => parts.join('/'),
      getDoc: (p: string) => Promise.resolve({ exists: () => p in data, data: () => JSON.parse(JSON.stringify(data[p])) }),
      getDocs: (p: string) => Promise.resolve({
        forEach: (fn: (d: unknown) => void) => Object.keys(data).filter((k) => k.startsWith(p + '/')).forEach((k) =>
          fn({ id: k.slice(p.length + 1), data: () => JSON.parse(JSON.stringify(data[k])) }))
      }),
      setDoc: rec('setDoc'), updateDoc: rec('updateDoc'), deleteDoc: rec('deleteDoc'), addDoc: rec('addDoc'),
      writeBatch: () => ({ set: rec('batch.set'), update: rec('batch.update'), delete: rec('batch.delete'), commit: () => Promise.resolve() })
    };
    w.__fakeMods = { mod, db: {} };
    document.getElementById('auth-gate')!.style.display = 'none';
    document.getElementById('hub-app')!.style.display = 'block';
    w.eval("loadFirestoreMods = function(){ return Promise.resolve(window.__fakeMods); }; currentUser = { displayName: 'Robin', uid: 'u1' }; loadTodosLocal(); renderTodos();");
  }, cloud);
}

test('Documents tab lists synced documents (no Trash), with folder path and search', async ({ page }) => {
  await openHub(page);
  await page.click('#hub-tab-docs');
  await expect(page.locator('.doc-item')).toHaveCount(2);
  await expect(page.locator('.doc-item').first().locator('.doc-item-title')).toHaveText('Night delivery');
  await expect(page.locator('.doc-item').first().locator('.doc-item-meta')).toContainText('Projects');
  await expect(page.locator('#todo-fab')).toBeHidden();
  await page.click('#hub-search-toggle');
  await page.fill('#hub-search-input', 'road');
  await expect(page.locator('.doc-item')).toHaveCount(1);
  await expect(page.locator('.doc-item-title')).toHaveText('Roadmap');
  await page.click('#hub-tab-todos');
  await expect(page.locator('#docs-view')).toBeHidden();
  expect(await page.evaluate(() => (window as any).__writes)).toEqual([]);
});

test('a document opens read only: folds, note, thread, row link; nothing is written', async ({ page }) => {
  await openHub(page);
  await page.click('#hub-tab-docs');
  await page.click('.doc-item[data-doc-id="d1"]');
  const body = page.locator('#doc-reader-body');
  await expect(page.locator('#doc-reader-title')).toHaveText('Night delivery');
  await expect(page.locator('#doc-reader-byline')).toContainText('Draft');
  // Saved folds come along: Rollout is folded with 2 rows under it.
  await expect(body.locator('.rd-row[data-id="4"]')).toHaveCount(0);
  await expect(body.locator('.rd-more')).toHaveText('+2');
  // Tapping a folded row's dot unfolds it (no fold arrows).
  await expect(body.locator('.rd-dot[data-fold="3"]')).toHaveClass(/is-folded/);
  await body.locator('.rd-dot[data-fold="3"]').click();
  await expect(body.locator('.rd-row[data-id="4"]')).toBeVisible();
  // Note opens in place, sanitized (no script, no onerror).
  await body.locator('[data-note="2"]').click();
  await expect(body.locator('.rd-note')).toContainText('Finance first');
  expect(await body.locator('.rd-note').innerHTML()).not.toMatch(/onerror|script/i);
  expect(await page.evaluate(() => (window as any).__pwned)).toBeUndefined();
  // Thread icon shows the open question count, and opens the thread.
  await expect(body.locator('[data-thread="6"] .rd-count')).toHaveText('1');
  await body.locator('[data-thread="6"]').click();
  await expect(body.locator('.rd-thread')).toContainText('Consent needed?');
  // A row link unfolds and jumps to its row.
  // Tapping a parent row's words folds it.
  await body.locator('.rd-text[data-fold="1"]').click();
  await expect(body.locator('.rd-row[data-id="2"]')).toHaveCount(0);
  await body.locator('.bl-link').click();
  await expect(body.locator('.rd-row[data-id="2"]')).toBeVisible();
  // No editing surface anywhere in the reader.
  await expect(page.locator('#doc-reader [contenteditable], #doc-reader input, #doc-reader textarea')).toHaveCount(0);
  // Back returns to the list.
  await page.click('#doc-reader-back');
  await expect(page.locator('#doc-reader')).toBeHidden();
  await expect(page.locator('.doc-item')).toHaveCount(2);
  expect(await page.evaluate(() => (window as any).__writes)).toEqual([]);
});

test('a document missing from the account says so instead of showing an empty page', async ({ page }) => {
  await openHub(page);
  await page.click('#hub-tab-docs');
  await page.click('.doc-item[data-doc-id="d2"]');
  await expect(page.locator('#doc-reader-body .rd-message')).toContainText('hasn’t reached your account');
  expect(await page.evaluate(() => (window as any).__writes)).toEqual([]);
});

test('open items, diagram pictures and Share, still without a single write', async ({ page }) => {
  await openHub(page);
  await page.click('#hub-tab-docs');
  await page.click('.doc-item[data-doc-id="d1"]');
  const body = page.locator('#doc-reader-body');
  // Open items under the title: one follow-up and one open question; tap an item to jump to it.
  await expect(page.locator('.rd-oi-btn')).toHaveAttribute('aria-label', /1 follow-up.*1 open question/);
  await page.click('.rd-oi-btn');
  await expect(page.locator('.rd-oi-item')).toHaveCount(2);
  await page.locator('.rd-oi-item', { hasText: 'Consent needed?' }).click();
  await expect(body.locator('.rd-thread')).toContainText('Consent needed?');
  // The uploaded picture shows; a diagram without a (valid) picture keeps the computer chip.
  await expect(body.locator('.rd-dg img')).toHaveCount(1);
  await expect(body.locator('.rd-dg img')).toHaveAttribute('src', /^data:image\/svg\+xml/);
  await expect(body).toContainText('opens on a computer');
  // draw.io pictures follow the system's dark setting; the reader pins them to the app's theme.
  expect(decodeURIComponent((await body.locator('.rd-dg img').getAttribute('src'))!)).toContain('color-scheme: light;');
  // Tap opens it full screen; x closes it.
  await body.locator('[data-diagram="g1"]').click();
  await expect(page.locator('#rd-viewer')).toBeVisible();
  await page.click('#rd-viewer-close');
  await expect(page.locator('#rd-viewer')).toBeHidden();
  // Share > Text hands the outline over (clipboard where the share sheet is missing).
  await page.evaluate(() => {
    const w = window as any;
    w.__shared = '';
    Object.defineProperty(navigator, 'share', { value: undefined, configurable: true });
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: (t: string) => { w.__shared = t; return Promise.resolve(); } }, configurable: true });
  });
  await page.click('#doc-reader-share');
  await page.locator('#doc-reader-share-menu button', { hasText: 'Text' }).click();
  await expect.poll(() => page.evaluate(() => (window as any).__shared)).toContain('  - Cost under 4 EUR');
  expect(await page.evaluate(() => (window as any).__shared)).toContain('- [ ] SMS at night');
  expect(await page.evaluate(() => (window as any).__writes)).toEqual([]);
});
