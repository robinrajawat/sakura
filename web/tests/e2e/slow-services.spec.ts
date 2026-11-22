import { test, expect, type Page } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

// Polish audit (2026-11-21): waits on outside services always end. draw.io (embed.diagrams.net,
// often blocked on company networks) used to leave "Loading draw.io…" for ever; an AI provider
// that never answered left "Generating…" for ever.

async function openEditor(page: Page) {
  await page.addInitScript(() => { try { localStorage.setItem('sakura_welcome_seen', '1'); sessionStorage.setItem('sakura_landing_dismissed', 'true'); } catch { /* storage unavailable */ } });
  // As a network that blocks diagrams.net.
  await page.route('https://embed.diagrams.net/**', (r) => r.abort());
  await page.goto('file://' + indexPath);
  await expect.poll(() => page.evaluate('typeof render === "function"')).toBe(true);
  await page.evaluate(`
    createDoc();
    nodes = [{ id: 1, depth: 0, text: 'Flow', parentId: null, isCheckbox: false, checked: false, note: '', tables: [], images: [], tags: [], styles: {} }];
    rebuildParentIds(); nextId = 2; diagrams = []; selectedId = 1; render(); saveToStorage();
    createDiagram();
  `);
  await expect(page.locator('#diagram-editor-overlay')).toHaveClass(/open/);
}
const waited = (page: Page, ms: number) => page.evaluate((ms) => {
  // @ts-expect-error -- bare globals from index.html
  _diagramEditorState.openedAt = Date.now() - ms; drawioWaitTick();
}, ms);

test('draw.io that does not load says so, with Retry and Close', async ({ page }) => {
  await openEditor(page);
  await expect(page.locator('#diagram-editor-status')).toHaveText('Loading draw.io…');
  await waited(page, 5000);
  await expect(page.locator('#diagram-editor-status')).toHaveText('Still loading draw.io…');
  await waited(page, 13000);
  await expect(page.locator('#drawio-wait-msg')).toHaveText('draw.io hasn’t loaded yet.');
  await expect(page.locator('#drawio-wait-detail')).toContainText('diagrams.net');
  await expect(page.locator('#drawio-wait-retry')).toBeVisible();
  // The frame behind can't take the note's clicks or the focus.
  await expect(page.locator('#diagram-editor-iframe-wrap iframe')).toHaveCSS('visibility', 'hidden');
  // The failed load is stopped: the browser's error page (another origin) could take a click meant
  // for Retry or Close, so the frame shows an empty page (this test failed about half the time).
  await expect(page.locator('#diagram-editor-iframe-wrap iframe')).toHaveAttribute('src', 'about:blank');
  // Retry starts the wait again.
  await page.locator('#drawio-wait-retry').click();
  await expect(page.locator('#drawio-wait-note')).toHaveCount(0);
  await expect(page.locator('#diagram-editor-status')).toHaveText('Loading draw.io…');
  await expect(page.locator('#diagram-editor-iframe-wrap iframe')).toHaveCSS('visibility', 'visible');
  await expect(page.locator('#diagram-editor-iframe-wrap iframe')).toHaveAttribute('src', /^https:\/\/embed\.diagrams\.net\//);
  // Close (from the note, or the editor's own ×) closes without asking: nothing was loaded.
  await waited(page, 13000);
  await page.locator('#drawio-wait-close').click();
  await expect(page.locator('#diagram-editor-overlay')).not.toHaveClass(/open/);
});

test('the note goes away by itself if draw.io arrives after all', async ({ page }) => {
  await openEditor(page);
  await waited(page, 13000);
  await expect(page.locator('#drawio-wait-note')).toBeVisible();
  await page.evaluate(() => {
    const frame = document.querySelector('#diagram-editor-iframe-wrap iframe') as HTMLIFrameElement;
    window.dispatchEvent(new MessageEvent('message', { data: JSON.stringify({ event: 'init' }), source: frame.contentWindow }));
  });
  await expect(page.locator('#drawio-wait-note')).toHaveCount(0);
});

test('closing with × before draw.io loads does not ask', async ({ page }) => {
  await openEditor(page);
  await page.locator('#diagram-editor-close').click();
  await expect(page.locator('#diagram-editor-overlay')).not.toHaveClass(/open/);
});

test('offline says the editor needs a connection', async ({ page, context }) => {
  await openEditor(page);
  await context.setOffline(true);
  await expect(page.locator('#drawio-wait-msg')).toHaveText('You’re offline.');
  await expect(page.locator('#drawio-wait-retry')).toBeHidden();
  await context.setOffline(false);
});

test('an AI provider that never answers ends with a clear error, so fallbacks can run', async ({ page }) => {
  await page.addInitScript(() => { try { localStorage.setItem('sakura_welcome_seen', '1'); sessionStorage.setItem('sakura_landing_dismissed', 'true'); } catch { /* storage unavailable */ } });
  await page.goto('file://' + indexPath);
  await expect.poll(() => page.evaluate('typeof render === "function"')).toBe(true);
  const result = await page.evaluate(async () => {
    // @ts-expect-error -- bare globals from index.html
    AI_REQUEST_TIMEOUT_MS = 300;
    // A provider that never answers: the request only ends when it is aborted.
    window.fetch = (_u: RequestInfo | URL, o?: RequestInit) => new Promise((_res, rej) => {
      o?.signal?.addEventListener('abort', () => rej(new DOMException('aborted', 'AbortError')));
    });
    try {
      // @ts-expect-error -- bare global from index.html
      await callAiByShape('openai', 'https://ai.hang.test/v1/chat/completions', 'k', 'm', 'sys', 'hi', 10);
      return { ok: true };
    } catch (e) {
      // @ts-expect-error -- bare global from index.html
      return { name: (e as Error).name, message: (e as Error).message, fallbackable: e instanceof FallbackableError };
    }
  });
  expect(result).toMatchObject({ name: 'FallbackableError', fallbackable: true });
  expect((result as { message: string }).message).toContain('didn’t answer within 0 seconds');
});
