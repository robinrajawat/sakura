import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

// 'Failed to register a ServiceWorker...null origin' is a file://-protocol testing artifact
// (no ServiceWorker support under a null origin) that has nothing to do with app code -- it
// does not happen in the real deployed app over https. Every other uncaught error is real.
function isTestEnvironmentNoise(message: string): boolean {
  return message.includes('ServiceWorker');
}

async function gotoWithErrorCapture(page: import('@playwright/test').Page, setup: () => void) {
  const pageErrors: string[] = [];
  page.on('pageerror', (err) => pageErrors.push(err.message));
  await page.addInitScript(setup);
  await page.goto('file://' + indexPath);
  await page.evaluate(() => {
    const landing = document.getElementById('sakura-landing-overlay');
    if (landing) landing.style.display = 'none';
    document.getElementById('welcome-overlay')?.remove();
  });
  await page.waitForTimeout(800);
  return pageErrors.filter(e => !isTestEnvironmentNoise(e));
}

// DOCK_TAB_PANEL_ID/MAXIMIZE_ID/MAXICON_ID/CLOSE_ID and dockActiveTab used to be declared only
// once script execution reached the "Dock panel tab strip orchestration" module, hundreds of
// lines after the Todos/Meetings/Journal/Recap panel modules that each call their own
// applyXLocation() at their own top-level boot time -- which closes that panel via
// closeXPanel() -> dockSyncRailVisibility() -> dockPanelIsOpen() whenever that feature is
// disabled in settings. dockPanelIsOpen() reads DOCK_TAB_PANEL_ID, and dockSyncRailVisibility()
// itself reads/writes dockActiveTab. Disabling any one of the four panel features therefore
// crashed on load with "Cannot access ... before initialization", aborting the rest of boot.
//
// This surfaced in two separate rounds: fixing DOCK_TAB_PANEL_ID alone (moving just the four
// id-map consts) looked complete and had a test asserting no error containing the literal
// string "DOCK_TAB_PANEL_ID" -- but the very next live report, still with Meetings disabled,
// hit dockSyncRailVisibility's OTHER uninitialized reference (dockActiveTab) and threw a
// different message that narrow assertion never would have caught. Asserting on zero uncaught
// errors at all (below), not on one specific error string, is what actually would have caught
// the second crash immediately instead of needing a second live report.
test.describe('No panel module throws an uncaught TDZ error when disabled at boot', () => {
  test('disabling the Meetings feature does not throw any uncaught error on load', async ({ page }) => {
    const errors = await gotoWithErrorCapture(page, () => {
      try {
        const raw = localStorage.getItem('sakura_meetings_settings_v1');
        const obj = raw ? JSON.parse(raw) : {};
        obj.featureEnabled = false;
        localStorage.setItem('sakura_meetings_settings_v1', JSON.stringify(obj));
      } catch {}
    });
    expect(errors).toEqual([]);
  });

  test('disabling the To-Dos feature (the earliest panel module in file order) does not throw any uncaught error on load', async ({ page }) => {
    const errors = await gotoWithErrorCapture(page, () => {
      try {
        const raw = localStorage.getItem('sakura_todos_settings_v1');
        const obj = raw ? JSON.parse(raw) : {};
        obj.featureEnabled = false;
        localStorage.setItem('sakura_todos_settings_v1', JSON.stringify(obj));
      } catch {}
    });
    expect(errors).toEqual([]);
  });
});
