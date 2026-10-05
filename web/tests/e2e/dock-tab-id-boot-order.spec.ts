import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

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
  await page.waitForTimeout(500);
  return pageErrors;
}

// DOCK_TAB_PANEL_ID (and its three sibling id-maps) used to be declared only once script
// execution reached the "Dock panel tab strip orchestration" module, hundreds of lines after
// the Todos/Meetings/Journal/Recap panel modules that each call their own applyXLocation() at
// their own top-level boot time -- which closes that panel via closeXPanel() ->
// dockSyncRailVisibility() -> dockPanelIsOpen() whenever that feature is disabled in settings.
// Disabling any one of those four features therefore crashed on load with "Cannot access
// 'DOCK_TAB_PANEL_ID' before initialization", aborting the rest of boot. Moved the four id-map
// consts (data only, no dependencies) to just before the Todos module, the earliest of the four.
test.describe('DOCK_TAB_PANEL_ID is available before any panel module needs it at boot', () => {
  test('disabling the Meetings feature does not throw an uncaught TDZ error on load', async ({ page }) => {
    const errors = await gotoWithErrorCapture(page, () => {
      try {
        const raw = localStorage.getItem('sakura_meetings_settings_v1');
        const obj = raw ? JSON.parse(raw) : {};
        obj.featureEnabled = false;
        localStorage.setItem('sakura_meetings_settings_v1', JSON.stringify(obj));
      } catch {}
    });
    expect(errors.filter(e => e.includes('DOCK_TAB_PANEL_ID'))).toEqual([]);
  });

  test('disabling the To-Dos feature (the earliest panel module in file order) does not throw an uncaught TDZ error on load', async ({ page }) => {
    const errors = await gotoWithErrorCapture(page, () => {
      try {
        const raw = localStorage.getItem('sakura_todos_settings_v1');
        const obj = raw ? JSON.parse(raw) : {};
        obj.featureEnabled = false;
        localStorage.setItem('sakura_todos_settings_v1', JSON.stringify(obj));
      } catch {}
    });
    expect(errors.filter(e => e.includes('DOCK_TAB_PANEL_ID'))).toEqual([]);
  });
});
