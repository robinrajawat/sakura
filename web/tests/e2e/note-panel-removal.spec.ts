import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

// See tests/e2e/generated-presence-smoke.spec.ts for why these are expected/benign here.
const KNOWN_NOISE = /ServiceWorker|cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net|CORS policy|Failed to load resource/i;

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

// The Note Panel floating popup and the Code Block feature (a tab inside that popup, with no
// independent UI of its own) have both been fully removed. Inline notes -- the pre-existing
// "note shown directly under a node in the outline" feature -- are now the only way to attach a
// note to a node, and every former "open the note popup" entry point (toolbar button, right-click
// menu, Ctrl/Cmd+Shift+N, Quick Assist search results) now expands and focuses the inline note
// line instead. Existing `codeBlock` data is fully orphaned per an explicit product decision, not
// merely hidden -- there is nothing left in the app that reads or renders it.
test.describe('Note Panel + Code Block removal', () => {
  test('the Note Panel popup and Code Block DOM/feature machinery no longer exist', async ({ page }) => {
    await page.goto('file://' + indexPath);
    await dismissOverlays(page);

    const state = await page.evaluate(() => ({
      notePanel: !!document.getElementById('note-panel'),
      codeToolbar: !!document.getElementById('code-toolbar'),
      codeEditor: !!document.getElementById('code-editor'),
      // @ts-expect-error -- bare global from index.html
      openNodePanelFn: typeof openNodePanel,
      // @ts-expect-error
      highlightCodeFn: typeof highlightCode,
      // @ts-expect-error
      noteFeatureFlag: 'note' in FEATURE_FLAGS,
      // @ts-expect-error
      codeblockFeatureFlag: 'codeblock' in FEATURE_FLAGS,
      // @ts-expect-error
      backlinksSettingsSection: !!document.getElementById('settings-section-backlinks'),
      // @ts-expect-error
      backlinksFeatureFlag: 'backlinks' in FEATURE_FLAGS,
    }));

    expect(state.notePanel).toBe(false);
    expect(state.codeToolbar).toBe(false);
    expect(state.codeEditor).toBe(false);
    expect(state.openNodePanelFn).toBe('undefined');
    expect(state.highlightCodeFn).toBe('undefined');
    expect(state.noteFeatureFlag).toBe(false);
    expect(state.codeblockFeatureFlag).toBe(false);
    // Backlinks is an unrelated, still-active feature whose Settings row used to share a
    // wrapper section with the deleted Note feature -- it must have survived with its own section.
    expect(state.backlinksSettingsSection).toBe(true);
    expect(state.backlinksFeatureFlag).toBe(true);
  });

  test('Ctrl/Cmd+Shift+N expands and focuses the inline note line, and typed text persists to node.note', async ({ page }) => {
    await page.goto('file://' + indexPath);
    await dismissOverlays(page);

    await page.evaluate(() => {
      // @ts-expect-error
      nodes = [{ id: 1, depth: 0, text: 'Hello', parentId: null, isCheckbox: false, checked: false, note: '', tags: [], styles: {} }];
      // @ts-expect-error
      collapsedIds = new Set();
      // @ts-expect-error
      selectedId = 1; multiSelectedIds = []; selectAllMode = false; focusedId = null; undoStack = [];
      // @ts-expect-error
      nextId = 2;
      // @ts-expect-error
      render();
    });

    await page.keyboard.press('ControlOrMeta+Shift+N');
    const noteLine = page.locator('.node-note-line[data-node-id="1"]');
    await expect(noteLine).toBeVisible();
    await expect(noteLine).toBeFocused();
    await page.keyboard.type('this is a note');

    const noteText = await page.evaluate(() =>
      // @ts-expect-error
      nodes[0].note
    );
    expect(noteText).toBe('this is a note');
    // No popup should ever have appeared for this.
    const notePanelOpened = await page.evaluate(() => document.getElementById('note-panel'));
    expect(notePanelOpened).toBeNull();
  });

  test('the toolbar note button opens the same inline note line for the selected node', async ({ page }) => {
    await page.goto('file://' + indexPath);
    await dismissOverlays(page);

    await page.evaluate(() => {
      // @ts-expect-error
      nodes = [{ id: 1, depth: 0, text: 'Hello', parentId: null, isCheckbox: false, checked: false, note: '', tags: [], styles: {} }];
      // @ts-expect-error
      collapsedIds = new Set();
      // @ts-expect-error
      selectedId = 1; multiSelectedIds = []; selectAllMode = false; focusedId = null; undoStack = [];
      // @ts-expect-error
      nextId = 2;
      // Toolbar is collapsed by default -- the note button lives there.
      // @ts-expect-error
      setToolbarVisible(true, false);
      // @ts-expect-error
      render();
    });

    await page.locator('#qb-note').click();
    const noteLine = page.locator('.node-note-line[data-node-id="1"]');
    await expect(noteLine).toBeVisible();
    await expect(noteLine).toBeFocused();
  });

  test('Pad\'s own right-click context menu (which shares note-panel-named helpers) still opens without error', async ({ page }) => {
    // Regression test: the shared _noteCtxItem()/_closeNoteCtx() helpers, despite their name,
    // are Pad's own context-menu building blocks, not Note-Panel-exclusive -- removing the Note
    // Panel must not take them with it.
    const errors: string[] = [];
    page.on('pageerror', (err) => {
      if (!KNOWN_NOISE.test(err.message)) errors.push(err.message);
    });
    await page.goto('file://' + indexPath);
    await dismissOverlays(page);

    // togglePad() no-ops without an open document -- give it one so the button actually opens Pad.
    await page.evaluate(() => {
      // @ts-expect-error -- bare global from index.html
      currentDocId = 'test-doc';
      // @ts-expect-error
      setPadOpen(true);
    });
    const padEditor = page.locator('#pad-editor');
    await expect(padEditor).toBeVisible();
    await padEditor.click();
    await page.keyboard.type('some pad text');
    await padEditor.click({ button: 'right' });

    const menu = page.locator('#pad-ctx-menu');
    await expect(menu).toHaveClass(/open/);
    const itemCount = await menu.locator('.note-ctx-item').count();
    expect(itemCount).toBeGreaterThan(0);
    expect(errors).toEqual([]);
  });

  test('Quick Assist search still has a Notes category but no longer has a Code category', async ({ page }) => {
    await page.goto('file://' + indexPath);
    await dismissOverlays(page);

    const categories: string[] = await page.evaluate(() =>
      // @ts-expect-error -- bare global from index.html
      QA_SEARCH_CATEGORIES.map((c: any) => c.key)
    );
    expect(categories).toContain('notes');
    expect(categories).not.toContain('code');

    // collectNoteMatches's own feature-flag gate must still work now that it's the only
    // "search notes" entry point left (collectCodeMatches is gone entirely, not just disabled).
    const disabledResult = await page.evaluate(() => {
      // @ts-expect-error
      const prev = featureNoteEnabled;
      // @ts-expect-error
      featureNoteEnabled = false;
      // @ts-expect-error
      const out = collectNoteMatches('anything');
      // @ts-expect-error
      featureNoteEnabled = prev;
      return out;
    });
    expect(disabledResult).toEqual([]);
    // @ts-expect-error
    const collectCodeMatchesType = await page.evaluate(() => typeof collectCodeMatches);
    expect(collectCodeMatchesType).toBe('undefined');
  });

  test('unrelated toolbar buttons that sat next to the deleted Note Panel wiring still work', async ({ page }) => {
    // Regression test: qb-zoom (Focus), qb-checkbox, and qb-tags had their click handlers
    // defined right next to qb-note's -- all four got swept away together when the Note Panel's
    // own JS was removed, and only qb-note was meant to go. callAiRaw (a generic low-level AI
    // call shared by diagram generation and several rewrite features) sat right next to the
    // Note Panel's own AI-rewrite button wiring and was lost the same way.
    await page.goto('file://' + indexPath);
    await dismissOverlays(page);

    const callAiRawType = await page.evaluate(() =>
      // @ts-expect-error
      typeof callAiRaw
    );
    expect(callAiRawType).toBe('function');

    await page.evaluate(() => {
      // @ts-expect-error
      nodes = [{ id: 1, depth: 0, text: 'Hello', parentId: null, isCheckbox: false, checked: false, note: '', tags: [], styles: {} }];
      // @ts-expect-error
      collapsedIds = new Set();
      // @ts-expect-error
      selectedId = 1; multiSelectedIds = []; selectAllMode = false; focusedId = null; undoStack = [];
      // @ts-expect-error
      nextId = 2;
      // @ts-expect-error
      setToolbarVisible(true, false);
      // @ts-expect-error
      render();
    });

    await page.locator('#qb-checkbox').click();
    const isCheckbox = await page.evaluate(() =>
      // @ts-expect-error
      nodes[0].isCheckbox
    );
    expect(isCheckbox).toBe(true);

    // qb-zoom is hidden by default (an unrelated, pre-existing toolbar-config default, not
    // something this removal touched) -- dispatch its click directly rather than fighting
    // Playwright's visibility requirement over an unrelated setting.
    await page.evaluate(() =>
      // @ts-expect-error
      document.getElementById('qb-zoom')?.click()
    );
    const focused = await page.evaluate(() =>
      // @ts-expect-error
      focusedId
    );
    expect(focused).toBe(1);

    await page.locator('#qb-tags').click();
    const tagPopoverOpen = await page.locator('#tag-popover').evaluate((el) => el.classList.contains('open'));
    expect(tagPopoverOpen).toBe(true);
  });
});
