import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

// Owner, 2026-10-20: a copy button before "Filter outline" copies every open item as a numbered agenda.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => { try { localStorage.setItem('sakura_welcome_seen', '1'); } catch { /* storage unavailable */ } });
  await page.goto('file://' + indexPath);
  await page.evaluate(() => {
    const l = document.getElementById('sakura-landing-overlay'); if (l) l.style.display = 'none';
    // Capture what the copy writes instead of depending on real clipboard permissions on file://.
    const w = window as unknown as { _copied: Record<string, string> };
    w._copied = {};
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: {
      write: async (items: ClipboardItem[]) => { for (const t of items[0].types) w._copied[t] = await (await items[0].getType(t)).text(); },
      writeText: async (t: string) => { w._copied['text/plain'] = t; },
    } });
    (document.getElementById('header-title') as HTMLInputElement).value = 'Launch plan';
    const n = (id: number, depth: number, text: string, parentId: number | null, x: object = {}) => ({ id, depth, text, parentId, styles: {}, ...x });
    // @ts-expect-error -- bare globals from index.html
    nodes = [n(1, 0, 'Scope', null), n(2, 1, 'Export', 1, { marker: 'followup' }), n(3, 0, 'Comms', null)].map(normalizeNode);
    // @ts-expect-error
    remarks = [{ id: 'f1', anchorNodeId: 2, text: 'Check the CSV', person: 'Ana', status: 'followup', owner: 'Ben', createdAt: Date.now() - 3 * 864e5 },
      { id: 'q1', anchorNodeId: 3, text: 'Who signs off?', type: 'question', person: 'Maria', createdAt: Date.now() }];
    // @ts-expect-error
    render();
  });
});

test('the copy button sits before Filter outline and copies a numbered agenda', async ({ page }) => {
  await page.locator('#marker-summary .open-items-btn').click();
  const actions = page.locator('.oi-head-actions');
  await expect(actions.locator('> *').first()).toHaveClass(/oi-copy/);
  await expect(actions.locator('.oi-switch')).toBeVisible();
  await page.locator('.oi-copy').click();
  await expect(page.locator('#toast')).toContainText('copied as an agenda');
  const copied = await page.evaluate(() => (window as unknown as { _copied: Record<string, string> })._copied);
  const text = copied['text/plain'];
  expect(text).toContain('Launch plan: open items');
  // A snapshot says when (owner, 2026-10-21): dates, not ages.
  expect(text).toMatch(/^As of \d{1,2} \w{3} \d{4} · 1 follow-up · 1 open question$/m);
  expect(text).toMatch(/Follow-ups\n1\. Export\n {3}Scope · Ben · since \d{1,2} \w{3}\n {3}Ana: Check the CSV/);
  expect(text).toMatch(/Open questions\n1\. Who signs off\?\n {3}Comms · Maria · \d{1,2} \w{3}/);
  expect(text).not.toMatch(/\dd open/);
  expect(copied['text/html']).toContain('<ol');
  expect(copied['text/html']).toContain('Ben</b>');
});

test('a follow-up quotes the entry that set it, not a later reply', async ({ page }) => {
  // Owner, 2026-10-21: Kristoffer set the follow-up, Marlene replied later; the list quoted Marlene.
  const text = await page.evaluate(() => {
    // @ts-expect-error
    remarks.push({ id: 'r1', anchorNodeId: 2, text: 'Same as today', person: 'Marlene', createdAt: Date.now() });
    // @ts-expect-error
    const menu = openItemsMenuItems().find((i) => i.label === 'Export · Ben');
    // @ts-expect-error
    return { agenda: openItemsAgendaContent().text, menu: menu.sub };
  });
  expect(text.agenda).toMatch(/1\. Export\n.*\n {3}Ana: Check the CSV$/m);
  expect(text.agenda).not.toContain('Same as today');
  expect(text.menu).toBe('Ana: Check the CSV');
});

test('a follow-up set on an open question, or followed by one, points at it', async ({ page }) => {
  const text = await page.evaluate(() => {
    // @ts-expect-error
    remarks.push({ id: 'q2', anchorNodeId: 2, text: 'Which columns?', type: 'question', person: 'Ana', createdAt: Date.now() });
    // @ts-expect-error
    return openItemsAgendaContent().text;
  });
  expect(text).toMatch(/1\. Export\n.*\n {3}Ana: Check the CSV · waiting on open question 1/);
  expect(text).toContain('1. Which columns?');
  const own = await page.evaluate(() => {
    // @ts-expect-error
    remarks = [{ id: 'q3', anchorNodeId: 2, text: 'Which columns?', type: 'question', person: 'Ana', status: 'followup', createdAt: Date.now() }];
    // @ts-expect-error
    return openItemsAgendaContent().text;
  });
  expect(own).toMatch(/1\. Export\n.*\n {3}Waiting on open question 1/);
});

test('with nothing open there is no copy button', async ({ page }) => {
  // @ts-expect-error
  await page.evaluate(() => { remarks = []; nodes.forEach((x) => { delete x.marker; }); render(); });
  await expect(page.locator('#marker-summary .open-items-btn')).toHaveCount(0);
  // @ts-expect-error
  expect(await page.evaluate(() => openItemsAgendaContent())).toBeNull();
});
