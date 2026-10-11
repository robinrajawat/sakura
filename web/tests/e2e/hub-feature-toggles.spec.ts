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
// removed), so these cover the one feature toggle the dock still has.
//
// Turning To-Dos off in Settings used to have no visible effect: the setFeatureEnabled
// plumbing was real, but nothing hid its entry point or its content panel, and openDockTab/
// toggleDockTab (the single choke point every open path -- keyboard shortcut, cross-reference
// dots, the app-bar launcher -- runs through) had no awareness of the flag either.
test.describe('To-Dos feature toggle hides its launcher + panel (and cannot be opened around)', () => {
  test('disabling To-Dos hides #dock-panel-appbar-toggle and #todos-panel, re-enabling restores them', async ({ page }) => {
    await page.goto('file://' + indexPath);
    await dismissOverlays(page);

    // The panel itself is only visible while open (its base CSS hides it when closed
    // regardless of the feature flag), so open it first to get a meaningful baseline --
    // the real assertion is that the feature-off rule can hide it even while open.
    const read = () => page.evaluate(() => {
      const launcher = document.getElementById('dock-panel-appbar-toggle');
      const panel = document.getElementById('todos-panel');
      return {
        bodyHasClass: document.body.classList.contains('feature-off-todos'),
        launcherDisplay: launcher ? getComputedStyle(launcher).display : null,
        panelDisplay: panel ? getComputedStyle(panel).display : null,
        panelOpen: panel ? panel.classList.contains('open') : false
      };
    });

    // @ts-expect-error — bare global from index.html
    await page.evaluate(() => openDockTab());
    const initial = await read();
    expect(initial.launcherDisplay).not.toBe('none');
    expect(initial.panelOpen).toBe(true);
    expect(initial.panelDisplay).not.toBe('none');

    // @ts-expect-error
    await page.evaluate(() => setFeatureEnabled('todos', false));
    const disabled = await read();
    expect(disabled.bodyHasClass).toBe(true);
    expect(disabled.launcherDisplay).toBe('none');
    expect(disabled.panelDisplay).toBe('none');

    await page.evaluate(() => {
      // @ts-expect-error
      setFeatureEnabled('todos', true);
      // @ts-expect-error
      openDockTab();
    });
    const reenabled = await read();
    expect(reenabled.bodyHasClass).toBe(false);
    expect(reenabled.launcherDisplay).not.toBe('none');
    expect(reenabled.panelDisplay).not.toBe('none');
  });

  test('openDockTab/toggleDockTab are safe no-ops while To-Dos is disabled', async ({ page }) => {
    await page.goto('file://' + indexPath);
    await dismissOverlays(page);
    const unexpectedErrors: string[] = [];
    page.on('pageerror', (err) => unexpectedErrors.push('pageerror: ' + err.message));

    const result = await page.evaluate(() => {
      // @ts-expect-error
      setFeatureEnabled('todos', false);
      // @ts-expect-error
      openDockTab();
      // @ts-expect-error
      toggleDockTab();
      // @ts-expect-error
      const open = dockPanelIsOpen();
      // @ts-expect-error
      const active = dockActiveTab;
      // @ts-expect-error
      setFeatureEnabled('todos', true);
      return { open, active };
    });
    expect(result.open).toBe(false);
    expect(result.active).toBeNull();
    expect(unexpectedErrors).toEqual([]);
  });

  // With only one dock panel there's nothing to switch between, so there's no tab strip at
  // all -- the To-Dos panel's own header carries maximize/close instead.
  test('there is no dock tab strip, and the To-Dos panel shows its own maximize/close; the launcher toggles it', async ({ page }) => {
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
    expect(opened.maxDisplay).not.toBe('none');
    expect(opened.closeDisplay).not.toBe('none');

    const closed = await page.evaluate(() => {
      document.getElementById('dock-panel-appbar-toggle')?.click();
      // @ts-expect-error
      return { open: dockPanelIsOpen(), active: dockActiveTab };
    });
    expect(closed.open).toBe(false);
    expect(closed.active).toBeNull();
  });
});
