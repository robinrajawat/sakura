import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

async function dismissOverlays(page: import('@playwright/test').Page) {
  const landing = page.locator('#sakura-landing-overlay');
  if (await landing.isVisible().catch(() => false)) {
    await page.evaluate(() => {
      const el = document.getElementById('sakura-landing-overlay');
      if (el) el.style.display = 'none';
    });
  }
  const welcome = page.locator('#welcome-overlay');
  if (await welcome.isVisible().catch(() => false)) {
    await page.evaluate(() => document.getElementById('welcome-overlay')?.classList.remove('open'));
  }
}

// Pad grew from 3 tabs (Notepad/Q&A/Decision Log) to 7 (adding Diagrams/Mind Map/Files/
// Remarks) without the "keep at least one Pad tab enabled" guard growing with it: Notepad/
// Q&A/Decision Log's own setters only ever checked each OTHER, ignoring the newer 4 -- so
// disabling all three while, say, Diagrams was the only tab left enabled wrongly refused --
// and the newer 4 had no guard at all, so they could silently drop the count to zero.
test.describe('Pad "keep at least one tab enabled" guard recognizes all 7 Pad tabs', () => {
  const ALL_PAD_KEYS = ['padnotepad', 'padqa', 'decisionlog', 'paddiagrams', 'padmindmap', 'padfiles', 'padremarks'];

  test('disabling Notepad/Q&A/Decision Log is allowed when a newer tab (Diagrams) is still enabled', async ({ page }) => {
    await page.goto('file://' + indexPath);
    await dismissOverlays(page);

    const result = await page.evaluate((keys) => {
      // Start from a known state: only Diagrams enabled, everything else off.
      // @ts-expect-error — bare globals from index.html
      keys.forEach((k) => { FEATURE_FLAGS[k].set(k === 'paddiagrams'); });

      // @ts-expect-error
      setFeatureEnabled('padnotepad', false);
      // @ts-expect-error
      setFeatureEnabled('padqa', false);
      // @ts-expect-error
      setFeatureEnabled('decisionlog', false);

      const out = {
        // @ts-expect-error
        padnotepad: FEATURE_FLAGS.padnotepad.get(),
        // @ts-expect-error
        padqa: FEATURE_FLAGS.padqa.get(),
        // @ts-expect-error
        decisionlog: FEATURE_FLAGS.decisionlog.get(),
        // @ts-expect-error
        paddiagrams: FEATURE_FLAGS.paddiagrams.get()
      };
      // Restore full defaults for any later test in this file/session.
      // @ts-expect-error
      keys.forEach((k) => FEATURE_FLAGS[k].set(true));
      return out;
    }, ALL_PAD_KEYS);

    expect(result.padnotepad).toBe(false);
    expect(result.padqa).toBe(false);
    expect(result.decisionlog).toBe(false);
    expect(result.paddiagrams).toBe(true); // untouched, and correctly recognized as "still one enabled"
  });

  for (const key of ['paddiagrams', 'padmindmap', 'padfiles', 'padremarks']) {
    test(`disabling the last remaining tab (${key}) is refused with a toast, not silently allowed`, async ({ page }) => {
      await page.goto('file://' + indexPath);
      await dismissOverlays(page);

      const result = await page.evaluate((k) => {
        const keys = ['padnotepad', 'padqa', 'decisionlog', 'paddiagrams', 'padmindmap', 'padfiles', 'padremarks'];
        // Only `k` enabled, everything else off.
        // @ts-expect-error
        keys.forEach((key) => { FEATURE_FLAGS[key].set(key === k); });

        // @ts-expect-error
        setFeatureEnabled(k, false); // must be refused -- it's the last one standing
        // @ts-expect-error
        const stillEnabled = FEATURE_FLAGS[k].get();

        // Restore defaults.
        // @ts-expect-error
        keys.forEach((key) => FEATURE_FLAGS[key].set(true));
        return { stillEnabled };
      }, key);

      expect(result.stillEnabled).toBe(true);
    });
  }

  test('with several tabs enabled, disabling one that is not the last is still allowed', async ({ page }) => {
    await page.goto('file://' + indexPath);
    await dismissOverlays(page);

    const result = await page.evaluate((keys) => {
      // @ts-expect-error
      keys.forEach((k) => FEATURE_FLAGS[k].set(true));
      // @ts-expect-error
      setFeatureEnabled('padmindmap', false);
      // @ts-expect-error
      const out = { padmindmap: FEATURE_FLAGS.padmindmap.get(), padfiles: FEATURE_FLAGS.padfiles.get() };
      // @ts-expect-error
      keys.forEach((k) => FEATURE_FLAGS[k].set(true));
      return out;
    }, ALL_PAD_KEYS);

    expect(result.padmindmap).toBe(false);
    expect(result.padfiles).toBe(true);
  });
});
