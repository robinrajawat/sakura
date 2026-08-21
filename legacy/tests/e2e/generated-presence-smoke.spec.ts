import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

// Known-noise error substrings that are expected artifacts of loading index.html directly
// via file:// in a headless test harness — not real application bugs. ServiceWorker
// registration is rejected because the file:// origin ('null') doesn't support it; the
// cdnjs/jsdelivr CORS failures are optional export-library scripts (xlsx, mammoth,
// pptxgenjs) that fail to load cross-origin from a file:// page, which the app already
// tolerates (those features simply aren't used in this test).
const KNOWN_NOISE = /ServiceWorker|cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net|CORS policy|Failed to load resource/i;

test.describe('generated presence block (src/state/presence.ts spliced into index.html)', () => {
  test('startPresenceTrackingIfShared / stopPresenceTracking / isPresenceTrackingDocId exist and behave correctly', async ({ page }) => {
    const unexpectedErrors: string[] = [];
    page.on('pageerror', (err) => {
      if (!KNOWN_NOISE.test(err.message)) unexpectedErrors.push('pageerror: ' + err.message);
    });
    page.on('console', (msg) => {
      if (msg.type() === 'error' && !KNOWN_NOISE.test(msg.text())) {
        unexpectedErrors.push('console.error: ' + msg.text());
      }
    });

    await page.goto('file://' + indexPath);

    // Dismiss any startup overlays that might intercept interaction, same as
    // tests/e2e/visibility-badge.spec.ts.
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

    // 1. Confirm the three functions exist on the page.
    const fnTypes = await page.evaluate(() => ({
      // @ts-expect-error — global app state from index.html, not a module export
      start: typeof startPresenceTrackingIfShared,
      // @ts-expect-error
      stop: typeof stopPresenceTracking,
      // @ts-expect-error
      isTracking: typeof isPresenceTrackingDocId,
    }));
    expect(fnTypes).toEqual({ start: 'function', stop: 'function', isTracking: 'function' });

    // 2. Exercise a real start -> stop lifecycle against a stubbed loadFirestoreMods,
    // asserting the exact Firestore path written and that tracking stops correctly.
    const lifecycle = await page.evaluate(async () => {
      const writes: { pathSegments: string[]; data: Record<string, unknown> }[] = [];
      const deletes: string[][] = [];
      let unsubCalled = false;

      const stubMod = {
        doc: (_db: unknown, ...pathSegments: string[]) => ({ __path: pathSegments }),
        collection: (_db: unknown, ...pathSegments: string[]) => ({ __path: pathSegments }),
        setDoc: async (ref: { __path: string[] }, data: Record<string, unknown>) => {
          writes.push({ pathSegments: ref.__path, data });
        },
        deleteDoc: async (ref: { __path: string[] }) => {
          deletes.push(ref.__path);
        },
        onSnapshot: (
          _query: unknown,
          _onNext: (snap: { docs: Array<{ id: string; data: () => Record<string, unknown> }> }) => void,
          _onError: (err: unknown) => void
        ) => {
          return () => {
            unsubCalled = true;
          };
        },
      };

      // @ts-expect-error — global app state from index.html, not a module export
      const originalLoadFirestoreMods = window.loadFirestoreMods;
      // @ts-expect-error
      window.loadFirestoreMods = async () => ({ mod: stubMod, db: {} });

      // @ts-expect-error
      const originalCurrentUser = currentUser;
      // @ts-expect-error
      currentUser = { uid: 'me-uid', displayName: 'Me', email: 'me@example.com' };
      // @ts-expect-error
      sharedDocMeta['sharedDoc123'] = { ownerUid: 'owner-uid-1', role: 'viewer' };

      // @ts-expect-error
      startPresenceTrackingIfShared('sharedDoc123');

      // Let the async heartbeat write and the onSnapshot subscription settle.
      await new Promise((resolve) => setTimeout(resolve, 50));

      // @ts-expect-error
      const trackingWhileActive = isPresenceTrackingDocId('sharedDoc123');

      // @ts-expect-error
      stopPresenceTracking();

      // clearPresenceFor's deleteDoc call is also async — let it settle.
      await new Promise((resolve) => setTimeout(resolve, 50));

      // @ts-expect-error
      const trackingAfterStop = isPresenceTrackingDocId('sharedDoc123');

      // Restore ambient globals so this test doesn't leak state into others.
      // @ts-expect-error
      window.loadFirestoreMods = originalLoadFirestoreMods;
      // @ts-expect-error
      currentUser = originalCurrentUser;
      // @ts-expect-error
      delete sharedDocMeta['sharedDoc123'];

      return {
        writePathSegments: writes[0]?.pathSegments ?? [],
        deletePathSegments: deletes[0] ?? [],
        trackingWhileActive,
        trackingAfterStop,
        unsubCalled,
      };
    });

    expect(lifecycle.writePathSegments.join('/')).toBe('users/owner-uid-1/docs/sharedDoc123/presence/me-uid');
    expect(lifecycle.deletePathSegments.join('/')).toBe('users/owner-uid-1/docs/sharedDoc123/presence/me-uid');
    expect(lifecycle.trackingWhileActive).toBe(true);
    expect(lifecycle.trackingAfterStop).toBe(false);
    expect(lifecycle.unsubCalled).toBe(true);

    // 3. Zero unexpected page errors (ServiceWorker/CORS/cdnjs/jsdelivr noise excluded above).
    expect(unexpectedErrors).toEqual([]);
  });
});
