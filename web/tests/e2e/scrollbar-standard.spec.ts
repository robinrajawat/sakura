import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// One scrollbar everywhere (owner 2026-10-30): a single global rule -- 8px, rounded --scroll thumb,
// darker on hover, no track -- in index.html and hub.html, and no panel with its own copy (the
// copies had drifted and 14 of 41 scrolling areas had none).
for (const file of ['index.html', 'hub.html']) {
  test(`${file}: one global scrollbar rule and no per-panel scrollbar rules`, async ({ page }) => {
    await page.goto('file://' + path.resolve(__dirname, '../../' + file));
    const r = await page.evaluate(() => {
      const found = { bar: '', thumb: '', hover: false, perPanel: [] as string[] };
      for (const sheet of Array.from(document.styleSheets)) {
        let rules: CSSRuleList; try { rules = sheet.cssRules; } catch { continue; }
        for (const rule of Array.from(rules)) {
          const sel = (rule as CSSStyleRule).selectorText; if (!sel || !sel.includes('::-webkit-scrollbar')) continue;
          const css = (rule as CSSStyleRule).cssText;
          // The browser may report '*::-webkit-scrollbar' as '::-webkit-scrollbar'.
          const parts = sel.split(',').map((x) => x.trim().replace(/^\*/, ''));
          if (parts.length === 1 && parts[0] === '::-webkit-scrollbar') found.bar = css;
          else if (parts.length === 1 && parts[0] === '::-webkit-scrollbar-thumb') found.thumb = css;
          else if (parts.length === 1 && parts[0] === '::-webkit-scrollbar-thumb:hover') found.hover = true;
          else if (parts.some((x) => !/^::-webkit-scrollbar-(track|corner|button)$/.test(x))) found.perPanel.push(sel);
        }
      }
      return found;
    });
    expect(r.bar).toContain('width: 8px');
    expect(r.thumb).toContain('var(--scroll)');
    expect(r.hover).toBe(true);
    expect(r.perPanel).toEqual([]);
  });
}
