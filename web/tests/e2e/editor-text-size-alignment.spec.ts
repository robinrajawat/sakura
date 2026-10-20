import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

// Settings → Text size scales the editor. The line height used to be scaled twice (font size × 1.25 ×
// scale), so at 140% rows grew tall and bullets, fold dots and checkboxes sat above the text
// (owner report 2026-10-20). Every bullet, checkbox and row-end indicator must centre on its first text
// line, headings too, and indicators grow with the text (owner: "are they not supposed to scale?").
for (const scale of [0.85, 1, 1.4]) {
  test(`at ${Math.round(scale * 100)}% text size bullets, checkboxes and indicator dots centre on the first text line`, async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('sakura_welcome_seen', '1'));
    await page.goto('file://' + indexPath);
    await page.evaluate(() => document.getElementById('sakura-landing-overlay')?.style.setProperty('display', 'none'));
    // nodes/render are top-level `let`s in index.html, reachable from evaluated source but not on window.
    await page.evaluate(`(() => {
      const H = (t, d, h = 0) => { const n = makeNode(t, d); n.styles.heading = h; return n; };
      nodes = [H('Heading one', 0, 1), H('Child', 1), H('Grandchild', 2), H('Heading two', 1, 2), H('A checkbox', 1), H('Last', 0)];
      nodes[4].isCheckbox = true; nodes[2].note = 'A note'; nodes[0].note = 'Heading note';
      render(); setEditorScale(${scale}, false);
    })()`);
    const rows = await page.locator('.node-row').evaluateAll((els) => els.map((r) => {
      const l = r.querySelector('.node-label') as HTMLElement;
      const cs = getComputedStyle(l);
      const lh = parseFloat(cs.lineHeight), top = l.getBoundingClientRect().top;
      const mid = (sel: string) => { const e = r.querySelector(sel); if (!e) return null; const b = e.getBoundingClientRect(); return b.top + b.height / 2 - (top + lh / 2); };
      const ind = r.querySelector('.node-note-dot');
      return { ratio: lh / parseFloat(cs.fontSize), dot: mid('.node-dot, .fold-dot'), cb: mid('.node-cb'), ind: mid('.node-note-dot'), indW: ind ? ind.getBoundingClientRect().width : null };
    }));
    expect(rows.length).toBe(6);
    expect(rows.filter((r) => r.ind !== null).length).toBe(2);
    for (const r of rows) {
      expect(r.ratio).toBeCloseTo(1.25, 2);
      expect(Math.abs(r.dot!)).toBeLessThanOrEqual(1.5);
      if (r.cb !== null) expect(Math.abs(r.cb)).toBeLessThanOrEqual(1.5);
      // The row-end indicators (here a note dot) grow with the text and stay centred on its line.
      if (r.ind !== null) {
        expect(Math.abs(r.ind)).toBeLessThanOrEqual(1.5);
        expect(r.indW!).toBeCloseTo(18 * scale, 0);
      }
    }
  });
}
