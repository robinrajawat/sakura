import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

// The welcome modal opens on a ~500ms timer whenever no documents exist yet (these tests seed
// in-memory nodes without creating one), so it could appear mid-test -- after the one-time
// dismissOverlays() check -- and intercept clicks/drags. Marking it as already seen before the
// page loads removes that race for this whole file.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => { try { localStorage.setItem('sakura_welcome_seen', '1'); } catch { /* storage unavailable: nothing to pre-seed */ } });
});

// See tests/e2e/generated-presence-smoke.spec.ts for why these are expected/benign here.
const KNOWN_NOISE = /ServiceWorker|cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net|embed\.diagrams\.net|CORS policy|Failed to load resource|net::ERR/i;

async function dismissOverlays(page: import('@playwright/test').Page) {
  const landing = page.locator('#sakura-landing-overlay');
  if (await landing.isVisible().catch(() => false)) {
    await page.evaluate(() => { const el = document.getElementById('sakura-landing-overlay'); if (el) el.style.display = 'none'; });
  }
  const welcome = page.locator('#welcome-overlay');
  if (await welcome.isVisible().catch(() => false)) {
    await page.evaluate(() => document.getElementById('welcome-overlay')?.classList.remove('open'));
  }
}

async function seedNodes(page: import('@playwright/test').Page) {
  await page.evaluate(() => {
    // @ts-expect-error -- bare globals from index.html
    nodes = [
      { id: 1, depth: 0, text: 'Parent', parentId: null, isCheckbox: false, checked: false, note: '', tags: [], styles: {} },
      { id: 2, depth: 1, text: 'Child A', parentId: 1, isCheckbox: false, checked: false, note: '', tags: [], styles: {} },
      { id: 3, depth: 1, text: 'Child B', parentId: 1, isCheckbox: false, checked: false, note: '', tags: [], styles: {} }
    ];
    // @ts-expect-error
    collapsedIds = new Set(); selectedId = null; multiSelectedIds = []; selectAllMode = false; focusedId = null; undoStack = []; editingId = null; nextId = 4;
    // @ts-expect-error
    qaItems = []; diagrams = []; remarks = [];
    // @ts-expect-error
    currentDocId = 'test-doc';
    // @ts-expect-error
    render();
  });
}

function trackErrors(page: import('@playwright/test').Page) {
  const errors: string[] = [];
  page.on('pageerror', (err) => { if (!KNOWN_NOISE.test(err.message)) errors.push('pageerror: ' + err.message); });
  page.on('console', (msg) => { if (msg.type() === 'error' && !KNOWN_NOISE.test(msg.text())) errors.push('console.error: ' + msg.text()); });
  return errors;
}

// The cutdown series removed the docked Pad panel and its Diagrams/Q&A/Remarks list tabs.
// Diagrams, Q&A, and remarks now live only inline under their nodes, so these tests pin that the
// container is really gone (no dead DOM/flags left behind) and that every surviving way into
// those objects -- right-click actions, Where used, generation -- still works without it.
test.describe('Pad container removal', () => {
  test('no Pad DOM, toggle, settings, or feature flags remain; Go Minimal still works', async ({ page }) => {
    const errors = trackErrors(page);
    await page.goto('file://' + indexPath);
    await dismissOverlays(page);

    for (const id of ['pad-panel', 'pad-resize-handle', 'editor-pad-toggle', 'settings-section-pad', 'feat-pad-toggle', 'feat-padqa-toggle', 'feat-paddiagrams-toggle', 'feat-padremarks-toggle', 'qa-list', 'diagrams-body', 'remarks-list-body']) {
      await expect(page.locator('#' + id)).toHaveCount(0);
    }
    // Popovers that used to live inside #pad-panel but serve surviving features.
    await expect(page.locator('#ref-jump-popover')).toHaveCount(1);
    await expect(page.locator('#remarks-date-popover')).toHaveCount(1);
    // "Skip review before generating" moved to its own Diagrams settings section.
    await expect(page.locator('#settings-section-diagrams #diagram-gen-skip-review-toggle')).toHaveCount(1);

    const flags = await page.evaluate(() => {
      // @ts-expect-error
      const keys = Object.keys(FEATURE_FLAGS);
      // @ts-expect-error
      const minimalBefore = isMinimalMode();
      document.getElementById('features-preset-btn')?.click();
      // @ts-expect-error
      const minimalAfter = isMinimalMode();
      document.getElementById('features-preset-btn')?.click();
      // @ts-expect-error
      return { keys, minimalBefore, minimalAfter, minimalRestored: isMinimalMode() };
    });
    expect(flags.keys.filter((k: string) => k.startsWith('pad'))).toEqual([]);
    expect(flags.minimalBefore).toBe(false);
    expect(flags.minimalAfter).toBe(true);
    expect(flags.minimalRestored).toBe(false);
    expect(errors).toEqual([]);
  });

  test('old saved prefs carrying removed Pad keys load without errors and are dropped on next save', async ({ page }) => {
    const errors = trackErrors(page);
    await page.goto('file://' + indexPath);
    await page.evaluate(() => {
      localStorage.setItem('sakura_v001_prefs', JSON.stringify({
        padEnabled: false, padQaTabEnabled: false, padDiagramsTabEnabled: true, padRemarksTabEnabled: false,
        padMatchEditorBg: false, padHiddenButtons: ['qa'], padDefaultView: 'remarks', qaCompactRows: true,
        qaRowActionsMode: 'fixed', qaAiBulkAnswerEnabled: true, qaAiSummaryEnabled: true, qaAiGenerateEnabled: false,
        qaAiGroupEnabled: false, zenHidePad: true, editorFloatingHiddenButtons: ['pad']
      }));
      localStorage.setItem('sakura_pad_open', 'true');
      localStorage.setItem('sakura-shortcut-overrides', JSON.stringify({ togglePad: 'mod+shift+y', toggleDiagrams: 'mod+shift+u' }));
    });
    await page.reload();
    await dismissOverlays(page);
    await seedNodes(page);
    await expect(page.locator('.node-row[data-id="1"]')).toBeVisible();

    const saved = await page.evaluate(() => {
      // @ts-expect-error
      savePrefs();
      // @ts-expect-error
      return { prefs: JSON.parse(localStorage.getItem('sakura_v001_prefs') || '{}'), overrides: { ...shortcutOverrides } };
    });
    const leftover = Object.keys(saved.prefs).filter((k) => /^pad|^zenHidePad$|^qaCompactRows$|^qaRowActionsMode$|^qaAi(Bulk|Summary|Generate|Group)/.test(k));
    expect(leftover).toEqual([]);
    expect(saved.prefs.editorFloatingHiddenButtons).toEqual([]);
    expect(saved.overrides).toEqual({});
    expect(errors).toEqual([]);
  });

  test('right-click Add question / Add remark create inline items under the node, with no "open in panel" icon', async ({ page }) => {
    const errors = trackErrors(page);
    await page.goto('file://' + indexPath);
    await dismissOverlays(page);
    await seedNodes(page);

    await page.evaluate(async () => {
      // @ts-expect-error
      await runQuickAction('qa', 2);
      // @ts-expect-error
      await runQuickAction('remark', 3);
    });
    const qaLine = page.locator('.node-qa-line');
    await expect(qaLine).toHaveCount(1);
    await expect(page.locator('.node-remark-line')).toHaveCount(1);
    await expect(page.locator('.node-qa-line .node-inline-open-panel-btn, .node-remark-line .node-inline-open-panel-btn')).toHaveCount(0);

    const linked = await page.evaluate(() => ({
      // @ts-expect-error
      qa: qaItems.map((q: { sourceNodeId: number }) => q.sourceNodeId),
      // @ts-expect-error
      remarks: remarks.map((r: { anchorNodeId: number }) => r.anchorNodeId)
    }));
    expect(linked).toEqual({ qa: [2], remarks: [3] });
    expect(errors).toEqual([]);
  });

  test('Where used reveals and focuses a linked question inline instead of opening a Pad', async ({ page }) => {
    const errors = trackErrors(page);
    await page.goto('file://' + indexPath);
    await dismissOverlays(page);
    await seedNodes(page);
    await page.evaluate(() => {
      // @ts-expect-error
      qaItems = [{ id: 'qa-test', question: 'Who signs off?', answer: '', sourceNodeId: 2, createdAt: Date.now() }];
      // @ts-expect-error
      collapsedIds = new Set([1]); inlineExpandQaNodeIds = new Set(); alwaysExpandInlineEnabled = false;
      // @ts-expect-error
      render();
    });
    // Collapsed parent + collapsed inline items: the question isn't on screen yet.
    await expect(page.locator('#inline-qa-q-qa-test')).toHaveCount(0);

    await page.evaluate(() => {
      // @ts-expect-error
      openWhereUsedPopover(document.querySelector('.node-row[data-id="1"]'), [1, 2, 3]);
    });
    const item = page.locator('#ref-jump-popover .ref-jump-item', { hasText: 'Who signs off?' });
    await expect(item).toBeVisible();
    await item.dispatchEvent('mousedown');

    const q = page.locator('#inline-qa-q-qa-test');
    await expect(q).toBeVisible();
    await expect(q).toBeFocused();
    expect(errors).toEqual([]);
  });

  test('Generate diagram is offered on the right-click menu and anchors its result under that node', async ({ page }) => {
    const errors = trackErrors(page);
    await page.goto('file://' + indexPath);
    await dismissOverlays(page);
    await seedNodes(page);

    await page.locator('.node-row[data-id="1"]').click({ button: 'right' });
    await page.locator('#context-more-toggle').click();
    await expect(page.locator('#context-more-panel [data-action="diagram-gen"]')).toBeVisible();
    await page.keyboard.press('Escape');

    await page.evaluate(async () => {
      // @ts-expect-error -- one-click mode, so no review screen to drive here
      diagramGenSkipReviewEnabled = true;
      // @ts-expect-error
      await runQuickAction('diagram-gen', 1);
    });
    const result = await page.evaluate(() => ({
      // @ts-expect-error
      count: diagrams.length,
      // @ts-expect-error
      anchor: diagrams[0]?.anchorNodeId,
      // @ts-expect-error
      hasXml: !!(diagrams[0]?.xml || '').includes('<mxfile')
    }));
    expect(result).toEqual({ count: 1, anchor: 1, hasXml: true });
    await expect(page.locator('.node-diagram-line .node-diagram-preview-card')).toHaveCount(1);
    expect(errors).toEqual([]);
  });
});
