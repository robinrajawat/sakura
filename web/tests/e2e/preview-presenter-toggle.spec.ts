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

async function seedOneNode(page: import('@playwright/test').Page) {
  await page.evaluate(() => {
    // @ts-expect-error — bare globals from index.html
    nodes = [{ id: 1, depth: 0, text: 'Hello', parentId: null, isCheckbox: false, checked: false, note: '', codeBlock: null, tags: [], styles: {} }];
    // @ts-expect-error
    nextId = 2; collapsedIds = new Set(); selectedId = 1; multiSelectedIds = []; selectAllMode = false; focusedId = null; undoStack = []; editingId = null;
    // @ts-expect-error
    render();
  });
}

// Preview and Presenter Mode are now toggleable like every other FEATURE_FLAGS entry --
// disabling either guards its human-facing entry point (the toolbar button/shortcut, the ▶
// present button) directly inside openPreview()/enterPresenterMode(), the same "guard the
// function, not just the button" pattern used elsewhere in this file. Crucially, PDF/DOCX/
// PPTX export call renderPreviewBody()/buildDocxPackage() directly rather than through
// openPreview(), so they must keep working regardless of these flags.
test.describe('Preview/Presenter feature toggles', () => {
  test('disabling "preview" hides the toolbar button and makes openPreview() a no-op; re-enabling restores both', async ({ page }) => {
    await page.goto('file://' + indexPath);
    await dismissOverlays(page);
    await seedOneNode(page);

    const before = await page.evaluate(() => {
      const btn = document.getElementById('editor-preview-toggle');
      return { display: btn ? getComputedStyle(btn).display : null };
    });
    expect(before.display).not.toBe('none');

    const disabled = await page.evaluate(() => {
      // @ts-expect-error
      setFeatureEnabled('preview', false);
      // @ts-expect-error
      openPreview();
      const btn = document.getElementById('editor-preview-toggle');
      return {
        bodyHasClass: document.body.classList.contains('feature-off-preview'),
        btnDisplay: btn ? getComputedStyle(btn).display : null,
        // @ts-expect-error
        previewActive
      };
    });
    expect(disabled.bodyHasClass).toBe(true);
    expect(disabled.btnDisplay).toBe('none');
    expect(disabled.previewActive).toBe(false);

    const reenabled = await page.evaluate(() => {
      // @ts-expect-error
      setFeatureEnabled('preview', true);
      // @ts-expect-error
      openPreview();
      const btn = document.getElementById('editor-preview-toggle');
      return {
        bodyHasClass: document.body.classList.contains('feature-off-preview'),
        btnDisplay: btn ? getComputedStyle(btn).display : null,
        // @ts-expect-error
        previewActive
      };
    });
    expect(reenabled.bodyHasClass).toBe(false);
    expect(reenabled.btnDisplay).not.toBe('none');
    expect(reenabled.previewActive).toBe(true);
  });

  test('turning "preview" off while Preview is open closes it immediately', async ({ page }) => {
    await page.goto('file://' + indexPath);
    await dismissOverlays(page);
    await seedOneNode(page);

    const result = await page.evaluate(() => {
      // @ts-expect-error
      setFeatureEnabled('presenter', false); // isolate: only testing the preview-active-closes behavior
      // @ts-expect-error
      openPreview();
      // @ts-expect-error
      const openedFirst = previewActive;
      // @ts-expect-error
      setFeatureEnabled('preview', false);
      // @ts-expect-error
      const closedAfter = previewActive;
      // @ts-expect-error
      setFeatureEnabled('preview', true); setFeatureEnabled('presenter', true);
      return { openedFirst, closedAfter };
    });

    expect(result.openedFirst).toBe(true);
    expect(result.closedAfter).toBe(false);
  });

  test('disabling "presenter" hides the ▶ button and makes enterPresenterMode() a no-op; re-enabling restores both', async ({ page }) => {
    await page.goto('file://' + indexPath);
    await dismissOverlays(page);
    await seedOneNode(page);

    const disabled = await page.evaluate(() => {
      // @ts-expect-error
      setFeatureEnabled('presenter', false);
      // @ts-expect-error
      enterPresenterMode();
      const btn = document.getElementById('preview-present-btn');
      return {
        bodyHasClass: document.body.classList.contains('feature-off-presenter'),
        btnDisplay: btn ? getComputedStyle(btn).display : null,
        // @ts-expect-error
        previewPresenting
      };
    });
    expect(disabled.bodyHasClass).toBe(true);
    expect(disabled.btnDisplay).toBe('none');
    expect(disabled.previewPresenting).toBe(false);

    const reenabled = await page.evaluate(() => {
      // @ts-expect-error
      setFeatureEnabled('presenter', true);
      const btn = document.getElementById('preview-present-btn');
      return {
        bodyHasClass: document.body.classList.contains('feature-off-presenter'),
        btnDisplay: btn ? getComputedStyle(btn).display : null
      };
    });
    expect(reenabled.bodyHasClass).toBe(false);
    expect(reenabled.btnDisplay).not.toBe('none');
  });

  test('opening Preview with auto-presenter on does NOT enter Presenter Mode while "presenter" is disabled', async ({ page }) => {
    await page.goto('file://' + indexPath);
    await dismissOverlays(page);
    await seedOneNode(page);

    const result = await page.evaluate(() => {
      // @ts-expect-error
      previewAutoPresenter = true;
      // @ts-expect-error
      setFeatureEnabled('presenter', false);
      // @ts-expect-error
      openPreview(); // openPreview() itself calls enterPresenterMode() when previewAutoPresenter is true
      // @ts-expect-error
      const out = { previewActive, previewPresenting };
      // @ts-expect-error
      closePreview(); setFeatureEnabled('presenter', true);
      return out;
    });

    expect(result.previewActive).toBe(true); // preview itself still opens fine
    expect(result.previewPresenting).toBe(false); // but never auto-jumps into presenting
  });

  test('turning "presenter" off while presenting exits presenter mode immediately', async ({ page }) => {
    await page.goto('file://' + indexPath);
    await dismissOverlays(page);
    await seedOneNode(page);

    const result = await page.evaluate(() => {
      // @ts-expect-error
      openPreview();
      // @ts-expect-error
      enterPresenterMode();
      // @ts-expect-error
      const presentingFirst = previewPresenting;
      // @ts-expect-error
      setFeatureEnabled('presenter', false);
      // @ts-expect-error
      const presentingAfter = previewPresenting;
      // @ts-expect-error
      closePreview(); setFeatureEnabled('presenter', true);
      return { presentingFirst, presentingAfter };
    });

    expect(result.presentingFirst).toBe(true);
    expect(result.presentingAfter).toBe(false);
  });

  test('PDF/DOCX/PPTX export rendering (renderPreviewBody) keeps working while "preview" is disabled', async ({ page }) => {
    await page.goto('file://' + indexPath);
    await dismissOverlays(page);
    await seedOneNode(page);

    const result = await page.evaluate(() => {
      // @ts-expect-error
      setFeatureEnabled('preview', false);
      // @ts-expect-error
      setFeatureEnabled('presenter', false);
      // Export paths call renderPreviewBody()/buildDocxPackage() directly, never openPreview() --
      // confirm the shared rendering engine is untouched by either flag.
      // @ts-expect-error
      renderPreviewBody();
      const bodyHtml = document.getElementById('preview-body')?.innerHTML || '';
      // @ts-expect-error
      const slideCount = previewSlides.length;
      // @ts-expect-error
      setFeatureEnabled('preview', true); setFeatureEnabled('presenter', true);
      return { bodyHtml, slideCount };
    });

    expect(result.bodyHtml).toContain('Hello');
    expect(result.slideCount).toBeGreaterThan(0);
  });
});
