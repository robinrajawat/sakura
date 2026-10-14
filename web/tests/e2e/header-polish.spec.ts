import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

// Header polish (owner-approved mockup): toolbar groups have no grey box (dividers only, button
// hover backgrounds stay), marker summary counts use the text colour with only the icon tinted,
// and the line under the title is a quiet byline — sentence case, no pills, status shown as a
// coloured dot, "·" separators.

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try { localStorage.setItem('sakura_welcome_seen', '1'); sessionStorage.setItem('sakura_landing_dismissed', 'true'); } catch { /* storage unavailable */ }
  });
  await page.goto('file://' + indexPath);
  await page.evaluate(() => {
    document.getElementById('sakura-landing-overlay')?.style.setProperty('display', 'none');
    document.getElementById('welcome-overlay')?.classList.remove('open');
    // @ts-expect-error -- bare globals from index.html
    nodes = [{ id: 1, depth: 0, text: 'Pricing', parentId: null, isCheckbox: false, checked: false, note: '', tags: [], styles: {}, tables: [], marker: 'issue' }];
    // @ts-expect-error
    nextId = 2; collapsedIds = new Set(); selectedId = null; editingId = null; setDocStatus('review', false); render(); updateMarkerSummary();
  });
});

test('toolbar groups have no background box', async ({ page }) => {
  const bgs = await page.locator('#quick-bar .action-group .ag-buttons').evaluateAll((els) => els.map((e) => getComputedStyle(e).backgroundColor));
  expect(bgs.length).toBeGreaterThan(2);
  for (const bg of bgs) expect(bg).toBe('rgba(0, 0, 0, 0)');
});

test('marker summary counts use the text colour; the icon keeps the marker colour', async ({ page }) => {
  const btn = page.locator('#marker-summary .marker-sum-btn').first();
  await expect(btn).toBeVisible();
  const c = await btn.evaluate((b) => ({
    text: getComputedStyle(b).color,
    icon: getComputedStyle(b.querySelector('svg')!).color,
    fg: getComputedStyle(document.body).getPropertyValue('--fg').trim()
  }));
  expect(c.icon).not.toBe(c.text);
  const probe = await page.evaluate((fg) => { const d = document.createElement('div'); d.style.color = fg; document.body.appendChild(d); const v = getComputedStyle(d).color; d.remove(); return v; }, c.fg);
  expect(c.text).toBe(probe);
});

test('the title byline is sentence case with a status dot and no pill backgrounds', async ({ page }) => {
  const s = await page.evaluate(() => {
    const status = document.getElementById('doc-status-chip')!;
    const hist = document.getElementById('doc-history-chip')!;
    const dot = getComputedStyle(status, '::before');
    return {
      statusText: status.textContent,
      transform: getComputedStyle(status).textTransform,
      histTransform: getComputedStyle(hist).textTransform,
      histBg: getComputedStyle(hist).backgroundColor,
      histBorder: getComputedStyle(hist).borderTopStyle,
      dotW: dot.width, dotBg: dot.backgroundColor,
      sep: getComputedStyle(document.getElementById('doc-status-wrap')!, '::after').content
    };
  });
  expect(s.statusText).toBe('Review');
  expect(s.transform).toBe('none');
  expect(s.histTransform).toBe('none');
  expect(s.histBg).toBe('rgba(0, 0, 0, 0)');
  expect(s.histBorder).toBe('none');
  expect(s.dotW).toBe('7px');
  expect(s.dotBg).not.toBe('rgba(0, 0, 0, 0)');
  expect(s.sep).toBe('"·"');
});
