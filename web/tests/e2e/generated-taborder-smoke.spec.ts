import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

// See tests/e2e/generated-presence-smoke.spec.ts for why these are expected/benign here.
const KNOWN_NOISE = /ServiceWorker|cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net|CORS policy|Failed to load resource/i;

// A Phase 3-adjacent state slice (not core/, since these functions never touch the outline
// `nodes` array — only `openTabs`/`activeTabDocId`). Exercises the real, unchanged
// cycleOpenTab()/reorderTab() wrapper functions — the same functions the Ctrl+Tab shortcut and
// tab-strip drag-and-drop call — against real openTabs state built from fully-formed tab
// snapshot objects (the same shape switchDoc/loadTabFromStorageObj produce for a real document).
test.describe('generated tabOrder block (src/state/tabOrder.ts spliced into index.html)', () => {
  test('cycleOpenTab switches to the correct neighbor, and reorderTab reorders real tabs, both via the real wrapper functions', async ({ page }) => {
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

    // Real cycleOpenTab() call, through the real wrapper — three fake-but-fully-formed tabs,
    // cycling forward should land on the next one and switchDoc's own real orchestration
    // (currentDocId/activeTabDocId assignment) should reflect it. Tabs are built inside the
    // page context (not passed as page.evaluate arguments) since Set doesn't survive Playwright's
    // argument-serialization boundary.
    const cycleResult = await page.evaluate((docIds) => {
      function fakeTab(docId: number) {
        return {
          docId,
          title: 'Doc ' + docId,
          author: '',
          nodes: [{ id: 1, text: 'root', depth: 0, parentId: null, styles: {}, note: '', noteTitle: '', codeBlock: null, decisionLog: null, tags: [], checked: false, isCheckbox: false, marker: '', slideDivider: false }],
          nextId: 2,
          selectedId: 1,
          multiSelectedIds: [],
          selectionAnchorId: 1,
          collapsedIds: new Set(),
          undoStack: [],
          redoStack: [],
          padUndoStack: [],
          padRedoStack: [],
          dirty: false,
          scrollTop: 0,
          searchQuery: '',
          searchMatches: [],
          searchIndex: -1
        };
      }
      // @ts-expect-error — bare globals from index.html
      openTabs = docIds.map(fakeTab);
      // @ts-expect-error
      activeTabDocId = 101;
      // @ts-expect-error
      cycleOpenTab(1);
      // @ts-expect-error
      const afterForward = activeTabDocId;
      // @ts-expect-error
      cycleOpenTab(1);
      // @ts-expect-error
      const afterForwardAgain = activeTabDocId;
      // @ts-expect-error
      cycleOpenTab(-1);
      // @ts-expect-error
      const afterBackward = activeTabDocId;
      return { afterForward, afterForwardAgain, afterBackward };
    }, [101, 102, 103]);

    expect(cycleResult.afterForward).toBe(102);
    expect(cycleResult.afterForwardAgain).toBe(103);
    expect(cycleResult.afterBackward).toBe(102);

    // Real reorderTab() call, through the real wrapper — moving tab 101 to the right of 103.
    const reorderResult = await page.evaluate((docIds) => {
      function fakeTab(docId: number) {
        return {
          docId,
          title: 'Doc ' + docId,
          author: '',
          nodes: [{ id: 1, text: 'root', depth: 0, parentId: null, styles: {}, note: '', noteTitle: '', codeBlock: null, decisionLog: null, tags: [], checked: false, isCheckbox: false, marker: '', slideDivider: false }],
          nextId: 2,
          selectedId: 1,
          multiSelectedIds: [],
          selectionAnchorId: 1,
          collapsedIds: new Set(),
          undoStack: [],
          redoStack: [],
          padUndoStack: [],
          padRedoStack: [],
          dirty: false,
          scrollTop: 0,
          searchQuery: '',
          searchMatches: [],
          searchIndex: -1
        };
      }
      // @ts-expect-error
      openTabs = docIds.map(fakeTab);
      // @ts-expect-error
      reorderTab(101, 103, 'right');
      // @ts-expect-error
      const order = openTabs.map((t: any) => t.docId);
      // @ts-expect-error
      const persisted = JSON.parse(localStorage.getItem('sakura_open_tabs_v1'));
      return { order, persisted };
    }, [101, 102, 103]);

    expect(reorderResult.order).toEqual([102, 103, 101]);
    expect(reorderResult.persisted.tabs).toEqual([102, 103, 101]);

    // Proof the rest of the script still runs — an unrelated, physically-distant function
    // (defined tens of thousands of characters later in the file) is still callable. This is
    // exactly the check that would have caught the serializeMarkdown import-statement bug: a
    // syntax error anywhere in the script kills everything after it, not just the broken block.
    const restOfScriptWorks = await page.evaluate(() => {
      // @ts-expect-error
      return typeof esc === 'function' && typeof getAllAiProviders === 'function';
    });
    expect(restOfScriptWorks).toBe(true);

    expect(unexpectedErrors).toEqual([]);
  });
});
