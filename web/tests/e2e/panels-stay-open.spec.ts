import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

// Menus and popovers open OVER the panes (owner 2026-11-02): Account, Notifications, Share and Search
// never close Settings, Help, To-Dos or Documents, and Esc closes only the menu. To-Dos is remembered.

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try { localStorage.setItem('sakura_welcome_seen', '1'); sessionStorage.setItem('sakura_landing_dismissed', 'true'); } catch { /* storage unavailable */ }
  });
  await page.setViewportSize({ width: 1400, height: 800 });
  await page.goto('file://' + indexPath);
});

const hosts: Record<string, { open: string; isOpen: string }> = {
  settings: { open: '#rail-settings-btn', isOpen: "document.getElementById('settings-panel').classList.contains('open')" },
  help: { open: '#doc-help-btn', isOpen: "document.getElementById('help-panel').classList.contains('open')" },
  todos: { open: '#dock-panel-appbar-toggle', isOpen: "document.getElementById('todos-panel').classList.contains('open')" },
};

for (const [name, h] of Object.entries(hosts)) {
  test(`${name} stays open while Account and Notifications open over it, and after Esc`, async ({ page }) => {
    await page.locator(h.open).click();
    const isOpen = () => page.evaluate((js) => (0, eval)(js), h.isOpen);
    expect(await isOpen()).toBe(true);
    for (const opener of ['#account-toggle', '#notif-toggle']) {
      await page.locator(opener).click();
      expect(await isOpen()).toBe(true);
      await page.keyboard.press('Escape');
      expect(await isOpen()).toBe(true);
    }
    if (name !== 'settings') {
      await page.locator('#doc-share-chip').click();
      await expect(page.locator('.sb-context-menu')).toBeVisible();
      expect(await isOpen()).toBe(true);
    }
  });
}

test('To-Dos is open again after a reload when it was open before', async ({ page }) => {
  await page.locator('#dock-panel-appbar-toggle').click();
  await expect(page.locator('#todos-panel')).toHaveClass(/open/);
  await page.reload();
  await expect(page.locator('#todos-panel')).toHaveClass(/open/);
  await page.locator('#dock-panel-appbar-toggle').click();
  await expect(page.locator('#todos-panel')).not.toHaveClass(/open/);
  await page.reload();
  await expect(page.locator('#todos-panel')).not.toHaveClass(/open/);
});
