import { test, expect } from '@playwright/test';
import path from 'path';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const hubPath = path.resolve(__dirname, '../../hub.html');

// Security review, 2026-11-03: the phone page allowed 'unsafe-eval' in its Content Security Policy
// although nothing on it uses eval() or new Function() (index.html dropped it earlier, with the
// same Firebase and Google sign-in scripts). Removed; this keeps it out and checks the page boots
// without the browser reporting any policy violation.
test('the phone page CSP has no unsafe-eval', () => {
  const html = readFileSync(hubPath, 'utf8');
  const csp = (html.match(/http-equiv="Content-Security-Policy" content="([^"]*)"/) || [])[1] || '';
  expect(csp).toContain("script-src 'self' 'unsafe-inline'");
  expect(csp).not.toContain('unsafe-eval');
});

test('the phone page boots with no Content Security Policy violation', async ({ page }) => {
  await page.addInitScript(() => {
    (window as any).__cspViolations = [];
    document.addEventListener('securitypolicyviolation', (e) => (window as any).__cspViolations.push(e.violatedDirective + ' ' + e.blockedURI));
  });
  const errors: string[] = [];
  page.on('pageerror', (e) => { if (/EvalError|unsafe-eval/i.test(e.message)) errors.push(e.message); });
  await page.goto('file://' + hubPath);
  await page.waitForTimeout(1500);
  const v = await page.evaluate(() => (window as any).__cspViolations as string[]);
  expect(v.filter((x) => /script-src|eval/.test(x))).toEqual([]);
  expect(errors).toEqual([]);
});
