import { test, expect, type Page } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

// Owner 2026-11-19: on an iPhone (Safari 27.2) the app's startup stopped part way ("Cannot access
// 'SAKURA_BACKUP_DB' before initialization"), and every phone test had passed, because those ran
// Chromium at an iPhone's size, never Safari's engine. These run in WebKit (Safari's engine) and
// fail on any error during startup, with the kinds of data a real account has.

const NOISE = /ServiceWorker|service worker|gstatic\.com|googleapis|firebase|Failed to load resource|net::|Load failed|access control|cdnjs|jsdelivr|diagrams\.net/i;

async function startWith(page: Page, seed: (() => void) | null) {
  const errors: string[] = [];
  page.on('pageerror', (e) => { if (!NOISE.test(e.message)) errors.push(e.message + '\n' + (e.stack || '').split('\n').slice(0, 4).join('\n')); });
  await page.addInitScript(() => { localStorage.setItem('sakura_welcome_seen', '1'); sessionStorage.setItem('sakura_landing_dismissed', 'true'); });
  if (seed) await page.addInitScript(seed);
  await page.goto('file://' + indexPath);
  await page.waitForTimeout(2500);
  const done = await page.evaluate(() => (window as unknown as { __sakuraMainDone?: boolean }).__sakuraMainDone === true);
  const boot = await page.evaluate(() => (window as unknown as { __sakuraBootErrors?: unknown[] }).__sakuraBootErrors || []);
  return { errors, done, boot };
}

test('starts with no data', async ({ page }) => {
  const r = await startWith(page, null);
  expect(r.errors, r.errors.join('\n\n')).toEqual([]);
  expect(r.boot).toEqual([]);
  expect(r.done).toBe(true);
});

test('starts with a real account’s kinds of data: folders, diagrams, threads, To-Dos, an open document', async ({ page }) => {
  const r = await startWith(page, () => {
    const n = (id: number, text: string, extra: Record<string, unknown> = {}) => ({ id, depth: 0, text, parentId: null, isCheckbox: false, checked: false, note: '', tables: [], images: [], tags: [], styles: {}, ...extra });
    const table = '<table><thead><tr><th>A</th><th>B</th></tr></thead><tbody><tr><td>1</td><td>2</td></tr></tbody></table>';
    localStorage.setItem('sakura_doc_v1_d1', JSON.stringify({
      rowFormat: 3, title: 'Kumla WH', nextId: 6, collapsed: [2],
      nodes: [n(1, 'Business Requirement', { styles: { heading: 1 } }), n(2, 'Analysis', { styles: { heading: 1 }, note: '<p>Why</p>' }), n(3, 'Child', { depth: 1, parentId: 2, tables: [table] }), n(4, 'Validation', { marker: 'followup' }), n(5, 'Task', { isCheckbox: true })],
      diagrams: [{ id: 'g1', title: 'Flow', anchorNodeId: 2, blobSynced: true, modifiedAt: 1 }],
      remarks: [{ id: 'r1', anchorNodeId: 4, text: 'What should we do about clean core?', author: 'Robin', createdAt: 1 }]
    }));
    localStorage.setItem('sakura_doc_v1_d2', JSON.stringify({ title: 'Second', nextId: 2, nodes: [n(1, 'Hello')] }));
    localStorage.setItem('sakura_docs_index_v1', JSON.stringify([{ id: 'd1', title: 'Kumla WH', updatedAt: 2 }, { id: 'd2', title: 'Second', updatedAt: 1 }]));
    localStorage.setItem('sakura_current_doc_v1', 'd1');
    localStorage.setItem('sakura_folders_v1', JSON.stringify([{ id: 'f1', name: 'Clients', open: true, parentId: null }]));
    localStorage.setItem('sakura_doc_folder_v1', JSON.stringify({ d1: 'f1' }));
    localStorage.setItem('sakura_todos_v1', JSON.stringify([{ id: 't1', text: 'Buy milk', done: false, createdAt: 1 }]));
  });
  expect(r.errors, r.errors.join('\n\n')).toEqual([]);
  expect(r.boot).toEqual([]);
  expect(r.done).toBe(true);
  await expect(page.locator('#editor-pane')).toContainText('Business Requirement');
});

test('starts for a signed-in account (the session is restored from Firebase)', async ({ page }) => {
  const r = await startWith(page, () => {
    localStorage.setItem('sakura_account_active', 'true');
    localStorage.setItem('sakura_data_owner_v1', JSON.stringify({ uid: 'u1', email: 'me@example.com' }));
  });
  expect(r.errors, r.errors.join('\n\n')).toEqual([]);
  expect(r.done).toBe(true);
});

test('starts with a thread on screen from the first draw (the owner\u2019s iPhone froze here)', async ({ page }) => {
  const r = await startWith(page, () => {
    const n = (id: number, text: string) => ({ id, depth: 0, text, parentId: null, isCheckbox: false, checked: false, note: '', tables: [], images: [], tags: [], styles: {} });
    localStorage.setItem('sakura_doc_v1_d1', JSON.stringify({ title: 'Kumla', nextId: 3, nodes: [n(1, 'Business Requirement'), n(2, 'Validation')],
      remarks: [{ id: 'r1', anchorNodeId: 2, text: 'What should we do about clean core?', author: 'Robin', createdAt: 1, kind: 'question' }] }));
    localStorage.setItem('sakura_docs_index_v1', JSON.stringify([{ id: 'd1', title: 'Kumla', updatedAt: 2 }]));
    localStorage.setItem('sakura_current_doc_v1', 'd1');
    localStorage.setItem('sakura_thread_drafts_v1', JSON.stringify({ 'd1|2': { html: 'half a reply', kind: 'comment', at: Date.now() } }));
  });
  expect(r.errors, r.errors.join('\n\n')).toEqual([]);
  expect(r.boot).toEqual([]);
  expect(r.done).toBe(true);
  await expect(page.locator('#editor-pane')).toContainText('What should we do about clean core?');
});
