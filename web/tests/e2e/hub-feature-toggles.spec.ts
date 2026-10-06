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

const HUB_KEYS = ['todos', 'meetings', 'journal', 'library', 'report'] as const;

// Turning a Hub sub-feature (To-Dos/Meetings/Journal/Library/Recap) off in Settings used to
// have no visible effect: the setFeatureEnabled plumbing was real, but nothing hid the actual
// Hub tab button (#dock-tab-<key>) or its content panel (#<key>-panel), and openDockTab/
// toggleDockTab (the single choke point every open path -- keyboard shortcuts, cross-reference
// dots, the tab buttons themselves -- runs through) had no awareness of the flag either.
test.describe('Hub feature toggles actually hide their tab + panel (and cannot be opened around)', () => {
  for (const key of HUB_KEYS) {
    test(`disabling "${key}" hides #dock-tab-${key} and #${key}-panel, re-enabling restores them`, async ({ page }) => {
      await page.goto('file://' + indexPath);
      await dismissOverlays(page);

      // The panel itself is only visible while open (its base CSS hides it when closed
      // regardless of the feature flag), so open it first to get a meaningful baseline --
      // the real assertion is that the feature-off rule can hide it even while open.
      const initial = await page.evaluate((k) => {
        // @ts-expect-error — bare globals from index.html
        openDockTab(k);
        const tab = document.getElementById(`dock-tab-${k}`);
        const panel = document.getElementById(`${k}-panel`);
        return {
          tabDisplay: tab ? getComputedStyle(tab).display : null,
          panelDisplay: panel ? getComputedStyle(panel).display : null,
          panelOpen: panel ? panel.classList.contains('open') : false
        };
      }, key);
      expect(initial.tabDisplay).not.toBe('none');
      expect(initial.panelOpen).toBe(true);
      expect(initial.panelDisplay).not.toBe('none');

      const disabled = await page.evaluate((k) => {
        // @ts-expect-error — bare global from index.html
        setFeatureEnabled(k, false);
        const tab = document.getElementById(`dock-tab-${k}`);
        const panel = document.getElementById(`${k}-panel`);
        return {
          bodyHasClass: document.body.classList.contains(`feature-off-${k}`),
          tabDisplay: tab ? getComputedStyle(tab).display : null,
          panelDisplay: panel ? getComputedStyle(panel).display : null
        };
      }, key);
      expect(disabled.bodyHasClass).toBe(true);
      expect(disabled.tabDisplay).toBe('none');
      expect(disabled.panelDisplay).toBe('none');

      const reenabled = await page.evaluate((k) => {
        // @ts-expect-error
        setFeatureEnabled(k, true);
        // @ts-expect-error
        openDockTab(k);
        const tab = document.getElementById(`dock-tab-${k}`);
        const panel = document.getElementById(`${k}-panel`);
        return {
          bodyHasClass: document.body.classList.contains(`feature-off-${k}`),
          tabDisplay: tab ? getComputedStyle(tab).display : null,
          panelDisplay: panel ? getComputedStyle(panel).display : null
        };
      }, key);
      expect(reenabled.bodyHasClass).toBe(false);
      expect(reenabled.tabDisplay).not.toBe('none');
      expect(reenabled.panelDisplay).not.toBe('none');
    });
  }

  test('openDockTab/toggleDockTab refuse to open a disabled tab and fall back to an enabled one', async ({ page }) => {
    await page.goto('file://' + indexPath);
    await dismissOverlays(page);

    const result = await page.evaluate(() => {
      // @ts-expect-error
      setFeatureEnabled('todos', false);
      // @ts-expect-error — todos disabled: openDockTab must redirect, never open the hidden panel
      openDockTab('todos');
      // @ts-expect-error
      const todosOpenAfterOpenCall = dockPanelIsOpen('todos');
      // @ts-expect-error
      const activeAfterOpenCall = dockActiveTab;

      // @ts-expect-error
      toggleDockTab('todos');
      // @ts-expect-error
      const todosOpenAfterToggleCall = dockPanelIsOpen('todos');

      // @ts-expect-error
      setFeatureEnabled('todos', true);
      return { todosOpenAfterOpenCall, activeAfterOpenCall, todosOpenAfterToggleCall };
    });

    expect(result.todosOpenAfterOpenCall).toBe(false);
    expect(result.activeAfterOpenCall).not.toBe('todos');
    expect(result.activeAfterOpenCall).not.toBeNull();
    expect(result.todosOpenAfterToggleCall).toBe(false);
  });

  test('disabling every Hub feature makes openDockTab/toggleDockTab safe no-ops', async ({ page }) => {
    await page.goto('file://' + indexPath);
    await dismissOverlays(page);

    const unexpectedErrors: string[] = [];
    page.on('pageerror', (err) => unexpectedErrors.push('pageerror: ' + err.message));

    const result = await page.evaluate((keys) => {
      // @ts-expect-error
      keys.forEach((k) => setFeatureEnabled(k, false));
      // @ts-expect-error
      openDockTab('journal');
      // @ts-expect-error
      toggleDockTab('todos');
      // @ts-expect-error
      const anyOpen = keys.some((k) => dockPanelIsOpen(k));
      // Restore state for any later test in this file/session.
      // @ts-expect-error
      keys.forEach((k) => setFeatureEnabled(k, true));
      return { anyOpen };
    }, HUB_KEYS as unknown as string[]);

    expect(result.anyOpen).toBe(false);
    expect(unexpectedErrors).toEqual([]);
  });

  // The shared #dock-tabstrip replaces each panel's own title/maximize/close row (see the CSS
  // comment above #todos-panel-header etc.) -- but with only one Hub feature enabled, there's
  // nothing to switch to, so the whole strip (not just its tab button) is dropped entirely
  // rather than wasting a whole row just to house maximize/close. Those two fall back to their
  // normal spot in the panel's own header instead.
  test('the whole tab strip hides when only one Hub feature is enabled, falling back to the panel\'s own maximize/close', async ({ page }) => {
    await page.goto('file://' + indexPath);
    await dismissOverlays(page);

    const onlyTodos = await page.evaluate((keys) => {
      // @ts-expect-error
      keys.filter((k) => k !== 'todos').forEach((k) => setFeatureEnabled(k, false));
      // @ts-expect-error
      openDockTab('todos');
      const strip = document.getElementById('dock-tabstrip');
      const ownMax = document.getElementById('todos-panel-maximize');
      const ownClose = document.getElementById('todos-panel-close');
      const ownTitle = document.getElementById('todos-panel-title');
      return {
        bodyHasClass: document.body.classList.contains('hub-single-tab'),
        stripDisplay: strip ? getComputedStyle(strip).display : null,
        ownMaxDisplay: ownMax ? getComputedStyle(ownMax).display : null,
        ownCloseDisplay: ownClose ? getComputedStyle(ownClose).display : null,
        // The title stays hidden either way -- only maximize/close fall back.
        ownTitleDisplay: ownTitle ? getComputedStyle(ownTitle).display : null,
      };
    }, HUB_KEYS as unknown as string[]);
    expect(onlyTodos.bodyHasClass).toBe(true);
    expect(onlyTodos.stripDisplay).toBe('none');
    expect(onlyTodos.ownMaxDisplay).not.toBe('none');
    expect(onlyTodos.ownCloseDisplay).not.toBe('none');
    expect(onlyTodos.ownTitleDisplay).toBe('none');

    // Re-enabling a second feature while the panel is still open should bring the strip back
    // (and hide the panel's own maximize/close again) immediately, not just on the next open.
    const twoEnabled = await page.evaluate(() => {
      // @ts-expect-error
      setFeatureEnabled('meetings', true);
      const strip = document.getElementById('dock-tabstrip');
      const ownMax = document.getElementById('todos-panel-maximize');
      return {
        bodyHasClass: document.body.classList.contains('hub-single-tab'),
        stripDisplay: strip ? getComputedStyle(strip).display : null,
        ownMaxDisplay: ownMax ? getComputedStyle(ownMax).display : null,
      };
    });
    expect(twoEnabled.bodyHasClass).toBe(false);
    expect(twoEnabled.stripDisplay).not.toBe('none');
    expect(twoEnabled.ownMaxDisplay).toBe('none');

    // Restore state for any later test in this file/session.
    await page.evaluate((keys) => {
      // @ts-expect-error
      keys.forEach((k) => setFeatureEnabled(k, true));
    }, HUB_KEYS as unknown as string[]);
  });
});
