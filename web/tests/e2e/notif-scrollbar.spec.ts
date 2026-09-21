import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

test('notification menu uses the app standard thin scrollbar', async ({ page }) => {
  await page.goto('file://' + indexPath);

  const cssCheck = await page.evaluate(() => {
    const sheets = Array.from(document.styleSheets);
    let widthRuleFound = false;
    let thumbRuleFound = false;
    for (const sheet of sheets) {
      let rules: CSSRuleList;
      try {
        rules = sheet.cssRules;
      } catch {
        continue;
      }
      for (const rule of Array.from(rules)) {
        const selector = (rule as CSSStyleRule).selectorText;
        if (!selector) continue;
        if (selector.includes('#notif-menu::-webkit-scrollbar') && !selector.includes('-thumb')) {
          widthRuleFound = true;
        }
        if (selector.includes('#notif-menu::-webkit-scrollbar-thumb')) {
          thumbRuleFound = true;
        }
      }
    }
    return { widthRuleFound, thumbRuleFound };
  });

  expect(cssCheck.widthRuleFound).toBe(true);
  expect(cssCheck.thumbRuleFound).toBe(true);
});
