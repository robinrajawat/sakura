import { test, expect, type Page } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pagePath = path.resolve(__dirname, '../../public/connect.html');

// Connecting an AI assistant (docs/mcp-plan.md): the Worker sends the person here with the request
// in the fragment; they allow or decline it; the answer goes back to the Worker as a form post.
// Firebase and the Worker are stubbed at the network.

async function open(page: Page, signedIn: boolean, hash: string) {
  await page.route('https://www.gstatic.com/firebasejs/**/firebase-app.js', (r) => r.fulfill({ contentType: 'text/javascript', body: 'export function initializeApp(){ return {}; }' }));
  await page.route('https://www.gstatic.com/firebasejs/**/firebase-auth.js', (r) => r.fulfill({
    contentType: 'text/javascript',
    body: `export function getAuth(){ return {}; }
      export function onAuthStateChanged(a, cb){ setTimeout(() => cb(${signedIn ? "{ email: 'robin@example.com', refreshToken: 'refresh-1', getIdToken: async () => 'id-1' }" : 'null'}), 0); }`
  }));
  const posts: string[] = [];
  await page.route('https://ai.sakura-notes.com/authorize', async (r) => { posts.push(r.request().postData() || ''); await r.fulfill({ contentType: 'text/html', body: '<p id="done">sent</p>' }); });
  await page.goto('file://' + pagePath + hash);
  return posts;
}

const request = '#' + new URLSearchParams({ handle: 'h-123', client: '<img src=x onerror=alert(1)>Claude', domain: '', to: 'claude.ai', local: '' }).toString();

test('signed in: shows who asks and where access goes; Allow sends the sign-in to the Worker', async ({ page }) => {
  const posts = await open(page, true, request);
  await expect(page.locator('#state-ask')).toBeVisible();
  // The name came from the assistant: text only, never markup.
  await expect(page.locator('#client-name')).toHaveText('<img src=x onerror=alert(1)>Claude');
  await expect(page.locator('#client-name img')).toHaveCount(0);
  await expect(page.locator('#client-origin')).toContainText('Access will be sent to claude.ai.');
  await expect(page.locator('#account-email')).toHaveText('robin@example.com');
  await expect(page.locator('#loopback-warning')).toBeHidden();
  expect(page.url()).not.toContain('h-123'); // the request left the address bar
  await page.screenshot({ path: test.info().outputPath('connect-ask.png') });
  await page.click('#allow-btn');
  await expect(page.locator('#done')).toBeVisible();
  const body = new URLSearchParams(posts[0]);
  expect(body.get('handle')).toBe('h-123');
  expect(body.get('decision')).toBe('allow');
  expect(body.get('idToken')).toBe('id-1');
  expect(body.get('refreshToken')).toBe('refresh-1');
});

test('Don\'t allow sends no sign-in', async ({ page }) => {
  const posts = await open(page, true, request);
  await page.click('#deny-btn');
  await expect(page.locator('#done')).toBeVisible();
  const body = new URLSearchParams(posts[0]);
  expect(body.get('decision')).toBe('deny');
  expect(body.get('idToken')).toBe('');
  expect(body.get('refreshToken')).toBe('');
});

test('signed out: asks to sign in first, and keeps the request across the reload', async ({ page }) => {
  await open(page, false, request);
  await expect(page.locator('#state-signin')).toBeVisible();
  await page.reload();
  await expect(page.locator('#state-signin')).toBeVisible();
  await expect(page.locator('#client-name')).toContainText('Claude');
});

test('an app on this computer gets a warning; no request shows how to connect', async ({ page }) => {
  await open(page, true, '#' + new URLSearchParams({ handle: 'h', client: 'Local tool', to: 'localhost', local: '1' }).toString());
  await expect(page.locator('#loopback-warning')).toBeVisible();
  const p2 = await page.context().newPage();
  await open(p2, true, '');
  await expect(p2.locator('#state-invalid')).toBeVisible();
});
