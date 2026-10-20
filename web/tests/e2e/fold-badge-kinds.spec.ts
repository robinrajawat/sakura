import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

// Owner, 2026-10-20: a folded row's "+N" showed only a grey dot when something was hidden inside.
// It now shows what: small diagram/table/image icons with counts. Undo toasts stay 4s.
// Owner, later the same day: drop notes and threads, show open questions instead (tooltip lists the rest).
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => { try { localStorage.setItem('sakura_welcome_seen', '1'); } catch { /* storage unavailable */ } });
  await page.goto('file://' + indexPath);
  await page.evaluate(() => {
    const landing = document.getElementById('sakura-landing-overlay'); if (landing) landing.style.display = 'none';
    const n = (id: number, depth: number, text: string, parentId: number | null, x: object = {}) => ({ id, depth, text, parentId, isCheckbox: false, checked: false, note: '', noteTitle: '', tags: [], styles: {}, ...x });
    // @ts-expect-error -- bare globals from index.html
    nodes = [n(1, 0, 'Parent', null), n(2, 1, 'With note and table', 1, { note: 'x', tables: ['<table><tr><td>1</td></tr></table>'] }), n(3, 1, 'With note', 1, { note: 'y' }), n(4, 2, 'Deeper thread', 3), n(7, 2, 'Answered thread', 3),
      n(5, 0, 'Plain parent', null), n(6, 1, 'Plain child', 5)].map(normalizeNode);
    // @ts-expect-error
    remarks = [{ id: 'r1', anchorNodeId: 4, text: 'Q1?', type: 'question', createdAt: 1 }, { id: 'r2', anchorNodeId: 4, text: 'Q2?', type: 'question', createdAt: 2 },
      { id: 'r3', anchorNodeId: 7, text: 'Q3?', type: 'question', createdAt: 3 }, { id: 'r4', anchorNodeId: 7, text: 'Yes', verdict: 'yes', answerTo: 'r3', createdAt: 4 },
      { id: 'r5', anchorNodeId: 7, text: 'Just a comment', type: 'comment', createdAt: 5 }];
    // @ts-expect-error
    collapsedIds = new Set([1, 5]); selectedId = null; multiSelectedIds = []; selectAllMode = false; focusedId = null; undoStack = []; editingId = null; nextId = 8;
    // @ts-expect-error
    render();
  });
});

test('a folded row\'s count names what is hidden inside, with counts', async ({ page }) => {
  const badge = page.locator('.node-row[data-id="1"] .fold-badge');
  await expect(badge).toHaveText('+412'); // +4 rows, 1 table, 2 open questions (notes and the answered thread are not counted)
  const kinds = badge.locator('.fold-badge-kind');
  await expect(kinds).toHaveCount(2); // table, then open questions
  await expect(kinds.nth(0)).toHaveAttribute('title', '1 table inside');
  await expect(kinds.nth(1)).toHaveAttribute('title', '2 open questions inside');
  await expect(badge.locator('.fold-badge-dot')).toHaveCount(0);
  await expect(badge).toHaveAttribute('data-tip', /a note/); // notes still named in the tooltip
  // Nothing inside: just the count.
  await expect(page.locator('.node-row[data-id="5"] .fold-badge')).toHaveText('+1');
});

test('an Undo toast stays up longer than a plain one', async ({ page }) => {
  const shown = (msg: string) => page.evaluate(async (m) => {
    // @ts-expect-error
    showToast(m);
    const t = document.getElementById('toast')!; const start = performance.now();
    await new Promise<void>((res) => { const iv = setInterval(() => { if (!t.classList.contains('show')) { clearInterval(iv); res(); } }, 50); });
    return performance.now() - start;
  }, msg);
  expect(await shown('Saved')).toBeLessThan(2500);
  expect(await shown('Row deleted — Ctrl/Cmd+Z to undo')).toBeGreaterThan(3500);
});
