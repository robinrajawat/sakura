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

// To-Dos is the only Hub dock panel left (Meeting Notes, Journal, Library, and Recap were all
// removed). Its Settings → Features on/off switch was removed too (item 14): To-Dos is always on,
// and openDockTab/toggleDockTab (the single choke point every open path -- keyboard shortcut,
// cross-reference dots, the app-bar launcher -- runs through) always work.
test.describe('To-Dos is always on: its launcher and panel cannot be switched off', () => {
  test('there is no To-Dos feature switch; the launcher shows and the panel opens and closes', async ({ page }) => {
    await page.goto('file://' + indexPath);
    await dismissOverlays(page);
    const unexpectedErrors: string[] = [];
    page.on('pageerror', (err) => unexpectedErrors.push('pageerror: ' + err.message));

    await expect(page.locator('#feat-todos-toggle')).toHaveCount(0);
    const state = await page.evaluate(() => ({
      // @ts-expect-error — bare global from index.html
      hasFlag: 'todos' in FEATURE_FLAGS,
      // @ts-expect-error
      bridge: typeof window.sakuraTodosSetFeatureEnabled
    }));
    expect(state).toEqual({ hasFlag: false, bridge: 'undefined' });

    const read = () => page.evaluate(() => {
      const launcher = document.getElementById('dock-panel-appbar-toggle');
      const panel = document.getElementById('todos-panel');
      return {
        bodyHasClass: document.body.classList.contains('feature-off-todos'),
        launcherDisplay: launcher ? getComputedStyle(launcher).display : null,
        panelDisplay: panel ? getComputedStyle(panel).display : null,
        // @ts-expect-error
        open: dockPanelIsOpen()
      };
    });

    // @ts-expect-error — bare global from index.html
    await page.evaluate(() => openDockTab());
    const opened = await read();
    expect(opened.bodyHasClass).toBe(false);
    expect(opened.launcherDisplay).not.toBe('none');
    expect(opened.open).toBe(true);
    expect(opened.panelDisplay).not.toBe('none');

    // @ts-expect-error
    await page.evaluate(() => toggleDockTab());
    expect((await read()).open).toBe(false);
    expect(unexpectedErrors).toEqual([]);
  });

  test('old saved To-Dos settings with the feature switched off are ignored', async ({ page }) => {
    await page.addInitScript(() => { try { localStorage.setItem('sakura_todos_settings_v1', JSON.stringify({ featureEnabled: false })); } catch { /* storage unavailable */ } });
    await page.goto('file://' + indexPath);
    await dismissOverlays(page);
    await expect(page.locator('#dock-panel-appbar-toggle')).toBeVisible();
    // @ts-expect-error — bare global from index.html
    await page.evaluate(() => openDockTab());
    await expect(page.locator('#todos-panel')).toHaveClass(/open/);
  });

  // With only one dock panel there's nothing to switch between, so there's no tab strip at
  // all; the rail's To-Dos icon (or Esc) closes the panel, so it has no maximize/close of its own (owner 2026-10-29).
  test('there is no dock tab strip, and the To-Dos panel has no maximize/close; the launcher toggles it', async ({ page }) => {
    await page.goto('file://' + indexPath);
    await dismissOverlays(page);

    const opened = await page.evaluate(() => {
      document.getElementById('dock-panel-appbar-toggle')?.click();
      const max = document.getElementById('todos-panel-maximize');
      const close = document.getElementById('todos-panel-close');
      return {
        strip: !!document.getElementById('dock-tabstrip'),
        tabs: document.querySelectorAll('.dock-tab').length,
        // @ts-expect-error
        open: dockPanelIsOpen(),
        maxDisplay: max ? getComputedStyle(max).display : null,
        closeDisplay: close ? getComputedStyle(close).display : null
      };
    });
    expect(opened.strip).toBe(false);
    expect(opened.tabs).toBe(0);
    expect(opened.open).toBe(true);
    expect(opened.maxDisplay).toBeNull();
    expect(opened.closeDisplay).toBeNull();

    const closed = await page.evaluate(() => {
      document.getElementById('dock-panel-appbar-toggle')?.click();
      // @ts-expect-error
      return { open: dockPanelIsOpen(), active: dockActiveTab };
    });
    expect(closed.open).toBe(false);
    expect(closed.active).toBeNull();
  });
});
