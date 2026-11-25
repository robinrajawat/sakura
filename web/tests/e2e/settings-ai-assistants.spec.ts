// @ts-nocheck -- the page's own globals (let bindings, not window properties) are used bare.
import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

// Settings → Account → AI assistants (docs/mcp-plan.md): the address to add in an assistant, the
// assistants connected to this account, and Disconnect. The Worker is stubbed at the network.
test('lists connected assistants; Disconnect removes one', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('sakura_welcome_seen', '1');
    sessionStorage.setItem('sakura_landing_dismissed', 'true');
  });
  let connections = [{ id: 'g1', name: 'Claude', connectedAt: Date.UTC(2026, 10, 25), lastUsedAt: null as number | null }, { id: 'g2', name: 'ChatGPT', connectedAt: Date.UTC(2026, 10, 20), lastUsedAt: Date.now() - 3 * 86_400_000 }];
  const deleted: string[] = [];
  await page.route('https://ai.sakura-notes.com/connections**', async (route) => {
    const req = route.request();
    if (req.method() === 'DELETE') {
      const id = new URL(req.url()).searchParams.get('id') || '';
      deleted.push(id + ' ' + req.headers()['authorization']);
      connections = connections.filter((c) => c.id !== id);
      return route.fulfill({ json: { ok: true }, headers: { 'Access-Control-Allow-Origin': '*' } });
    }
    return route.fulfill({ json: { connections }, headers: { 'Access-Control-Allow-Origin': '*' } });
  });
  await page.goto('file://' + indexPath);
  await page.waitForFunction('typeof updateAccountUI === "function"');
  await page.evaluate(() => {
    firestoreMods = { mod: { doc: () => ({}), getDoc: async () => ({ exists: () => true, data: () => ({}) }), setDoc: async () => {}, collection: () => ({}), query: () => ({}), where: () => ({}), orderBy: () => ({}), limit: () => ({}), onSnapshot: () => () => {} }, db: {} };
    const user = { uid: 'u1', email: 'a@example.com', getIdToken: async () => 'id-token-1' };
    updateAccountUI(user);
    currentUser = user;
    document.getElementById('settings-toggle')?.click();
    applySettingsCategory('account');
  });
  const section = page.locator('#settings-section-account-assistants');
  await expect(section).toBeVisible();
  await expect(section.locator('#mcp-connect-url')).toHaveText('https://ai.sakura-notes.com/mcp');
  const rows = section.locator('#mcp-connections-list .settings-list-row');
  await expect(rows).toHaveCount(2);
  await expect(rows.first()).toContainText('Claude');
  await expect(rows.first()).toContainText('not used yet · can read your documents');
  await expect(rows.nth(1)).toContainText(/· last used \S/); // the app's own relative time ("3 days ago", or a date)
  await section.screenshot({ path: test.info().outputPath('assistants.png') });
  await rows.first().getByRole('button', { name: 'Disconnect' }).click();
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText('ChatGPT');
  expect(deleted).toEqual(['g1 Bearer id-token-1']);
});

test('signed out, the section is hidden', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('sakura_welcome_seen', '1');
    sessionStorage.setItem('sakura_landing_dismissed', 'true');
  });
  await page.goto('file://' + indexPath);
  await expect(page.locator('#settings-section-account-assistants')).toBeHidden();
});
