import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

// Cutdown item 9a: AI trimmed to Generate outline + Rewrite (node, selection, document, note/remark
// lines, To-Do tasks/subtasks) + Auto-rewrite, and the whole node icon setup removed (icon picker,
// keyword/AI icon suggestion, Cards' keyword/AI icon badges). Removed AI: Expand node, Summarise
// selection, Suggest tags, Suggest icon, To-Dos Extract action items / Status summary / Break into
// subtasks (+ the Settings → AI → To-Dos AI section), Restructure text (Ctrl/Cmd+Shift+R), inline
// Q&A "AI Answer", and Generate diagram's AI label shortening. These tests pin what's kept, what's
// gone, and that data/prefs written by older builds load harmlessly.

// The welcome modal opens on a ~500ms timer whenever no documents exist yet, so it could appear
// mid-test and intercept clicks. Marking it as already seen before the page loads removes that race.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => { try { localStorage.setItem('sakura_welcome_seen', '1'); } catch { /* storage unavailable */ } });
});

// See tests/e2e/generated-presence-smoke.spec.ts for why these are expected/benign here.
const KNOWN_NOISE = /ServiceWorker|cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net|embed\.diagrams\.net|CORS policy|Failed to load resource|net::ERR/i;

function trackErrors(page: import('@playwright/test').Page) {
  const errors: string[] = [];
  page.on('pageerror', (err) => { if (!KNOWN_NOISE.test(err.message)) errors.push('pageerror: ' + err.message); });
  page.on('console', (msg) => { if (msg.type() === 'error' && !KNOWN_NOISE.test(msg.text())) errors.push('console.error: ' + msg.text()); });
  return errors;
}

async function dismissOverlays(page: import('@playwright/test').Page) {
  await page.evaluate(() => {
    const landing = document.getElementById('sakura-landing-overlay');
    if (landing) landing.style.display = 'none';
    document.getElementById('welcome-overlay')?.classList.remove('open');
  });
}

async function seedDoc(page: import('@playwright/test').Page) {
  await page.evaluate(() => {
    // A fresh profile starts with no document open (landing/empty state) — create one to edit.
    // @ts-expect-error -- bare globals from index.html
    ensureDocumentForEditing();
    // @ts-expect-error -- bare globals from index.html
    nodes = [
      { id: 1, depth: 0, text: '🛒 Webshop checkout', parentId: null, isCheckbox: false, checked: false, note: '', tags: ['shop'], styles: {}, icon: '🛒' },
      { id: 2, depth: 1, text: 'Payment provider integration', parentId: 1, isCheckbox: false, checked: false, note: '', tags: [], styles: {}, icon: 'cart' }
    ];
    // @ts-expect-error
    collapsedIds = new Set(); selectedId = null; multiSelectedIds = []; selectAllMode = false; focusedId = null; undoStack = []; editingId = null; nextId = 3;
    // @ts-expect-error
    render(); saveToStorage();
  });
}

const REMOVED_FUNCTIONS = [
  // node icons
  'showIconPickerPopover', 'hideIconPickerPopover', 'suggestIconForSelection', 'suggestIconsForAllNodes', 'suggestIconChoiceForNode',
  'suggestIconsForNodeIds', 'callAiIconBatch', 'callAiIconBatchChunk', 'callAiIconOptions', 'lookupIconForText',
  'buildHistoricalIconIndex', 'splitLeadingIcon',
  // Cards icons
  'pickCardIconId', 'getCardIconIds', 'suggestCardIconsWithAi', 'callAiCardIconBatch', 'callAiCardIconBatchChunk',
  // other removed AI
  'expandNodeWithAi', 'suggestTagsWithAi', 'summariseSelectionWithAi', 'restructureTextWithAi', 'callAiApiRestructure',
  'looksAlreadyStructured', 'insertAiOutlineAsNewDoc', 'sakuraTextareaPrompt', 'setQaAiAnswerEnabled', 'serializeMarkdown',
  'extractTodosFromDocument', 'breakTodoIntoSubtasks', 'generateTodosSummary'
];
const KEPT_FUNCTIONS = [
  'generateOutlineWithAi', 'insertAiOutline', 'rewriteNodeText', 'rewriteMultipleNodes', 'rewriteSubTextSelection',
  'rewriteAllNodes', 'setAutoRewriteEnabled', 'queueAutoRewrite', 'flushAutoRewriteQueue', 'callAiApi', 'callAiRaw',
  'callAiApiBatch', 'diagramGenTrimText', 'generateDiagramFromOutline', 'computeOutlineNumbers', 'renderCardsHtml'
];

test.describe('cutdown 9a: AI trimmed to Generate outline + Rewrite; node icons removed', () => {
  test('kept AI entry points exist; removed ones are gone from the DOM and the global scope', async ({ page }) => {
    const errors = trackErrors(page);
    await page.goto('file://' + indexPath);
    await dismissOverlays(page);
    await seedDoc(page);

    // Toolbar AI group: exactly Generate outline + Rewrite node.
    await expect(page.locator('#ag-ai .ag-buttons > button')).toHaveCount(2);
    await expect(page.locator('#qb-ai-outline')).toHaveCount(1);
    await expect(page.locator('#qb-ai-rewrite')).toHaveCount(1);
    for (const id of ['qb-ai-expand', 'qb-ai-summarise', 'qb-ai-tags', 'qb-ai-icon', 'icon-picker-popover',
      'todos-extract-btn', 'todos-summary-btn', 'todos-summary-modal-overlay', 'settings-section-ai-todos',
      'todos-ai-settings-jump-btn', 'qa-ai-answer-toggle', 'sakura-modal-textarea', 'aitb-expand', 'aitb-summarise',
      'aitb-tags', 'aitb-icon', 'hoverq-ai-icon', 'ctxq-ai-icon']) {
      await expect(page.locator('#' + id), id).toHaveCount(0);
    }
    // Auto-rewrite status-bar toggle + its settings survive.
    await expect(page.locator('#sb-auto-rewrite-chip')).toHaveCount(1);
    await expect(page.locator('#auto-rewrite-toggle')).toHaveCount(1);
    // "AI buttons" setting lists only surviving buttons.
    await expect(page.locator('#ai-buttons-grid input[type="checkbox"]')).toHaveCount(2);

    const state = await page.evaluate(({ removed, kept }) => {
      const w = window as unknown as Record<string, unknown>;
      return {
        removedPresent: removed.filter((n) => typeof w[n] !== 'undefined'),
        keptMissing: kept.filter((n) => typeof w[n] !== 'function'),
        // @ts-expect-error -- bare globals from index.html
        aiTbButtons: AI_TB_BUTTONS,
        // @ts-expect-error
        ctxOrder: CTX_ACTION_ORDER.filter((a) => a.startsWith('ai-')),
        // @ts-expect-error
        qaAiIds: QA_ACTIONS.map((a) => a.id).filter((id) => id.startsWith('ai-')),
        // @ts-expect-error
        shortcuts: { generateOutline: !!SHORTCUTS.generateOutline, restructureText: !!SHORTCUTS.restructureText }
      };
    }, { removed: REMOVED_FUNCTIONS, kept: KEPT_FUNCTIONS });
    expect(state.removedPresent).toEqual([]);
    expect(state.keptMissing).toEqual([]);
    expect(state.aiTbButtons).toEqual(['outline', 'rewrite']);
    expect(state.ctxOrder).toEqual(['ai-rewrite', 'ai-rewrite-all']);
    expect(state.qaAiIds).toEqual(['ai-rewrite-document', 'ai-rewrite-node', 'ai-generate-outline']);
    expect(state.shortcuts).toEqual({ generateOutline: true, restructureText: false });
    expect(errors).toEqual([]);
  });

  test('the empty-document screen still offers "Generate with AI"', async ({ page }) => {
    const errors = trackErrors(page);
    await page.goto('file://' + indexPath);
    await dismissOverlays(page);
    await page.evaluate(() => {
      // @ts-expect-error -- bare globals from index.html
      ensureDocumentForEditing(); nodes = []; selectedId = null; render();
    });
    await expect(page.locator('#es-ai-outline-btn')).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('right-click node menu offers Rewrite but no icon actions', async ({ page }) => {
    const errors = trackErrors(page);
    await page.goto('file://' + indexPath);
    await dismissOverlays(page);
    await seedDoc(page);
    await page.evaluate(() => {
      // @ts-expect-error -- bare globals from index.html
      contextQuickActions = ['ai-rewrite', 'ai-rewrite-all', 'note']; showContextMenu(200, 200, 1);
    });
    const menu = page.locator('#context-menu');
    await expect(menu).toBeVisible();
    const text = await menu.evaluate((m) => (m as HTMLElement).innerText + ' ' + [...m.querySelectorAll('[data-tip],[aria-label]')].map((e) => (e.getAttribute('data-tip') || '') + ' ' + (e.getAttribute('aria-label') || '')).join(' '));
    expect(text).toMatch(/Rewrite node/);
    expect(text).not.toMatch(/Suggest icon/i);
    expect(errors).toEqual([]);
  });

  test('To-Dos header has no AI buttons; a task keeps Rewrite and its subtasks keep Rewrite, with no "Break into subtasks"', async ({ page }) => {
    const errors = trackErrors(page);
    await page.addInitScript(() => {
      localStorage.setItem('sakura_todos_v1', JSON.stringify([
        { id: 't1', text: 'Plan release', done: false, createdAt: Date.now(), completedAt: null, priority: 'none', status: 'none', dueDate: null, link: null, linkLabel: null, nodeRef: null, repeat: null,
          subtasks: [{ id: 's1', text: 'Write notes', done: false }] },
        { id: 't2', text: 'Book venue', done: false, createdAt: Date.now(), completedAt: null, priority: 'none', status: 'none', dueDate: null, link: null, linkLabel: null, nodeRef: null, repeat: null, subtasks: [] }
      ]));
      // Old To-Dos AI toggles from before this cutdown — must load harmlessly.
      localStorage.setItem('sakura_todos_settings_v1', JSON.stringify({ aiExtractEnabled: true, aiSubtaskEnabled: true, aiSummaryEnabled: true, aiSummaryHighlight: true, rowActionsMode: 'fixed' }));
    });
    await page.goto('file://' + indexPath);
    await dismissOverlays(page);
    await seedDoc(page);
    await page.evaluate(() => {
      // @ts-expect-error -- bare global from index.html
      openDockTab('todos');
    });
    await expect(page.locator('#todos-panel')).toHaveClass(/open/);
    await expect(page.locator('#todos-panel-header button')).not.toHaveCount(0);
    await expect(page.locator('#todos-extract-btn, #todos-summary-btn')).toHaveCount(0);
    await expect(page.locator('.todo-rewrite')).toHaveCount(2);
    await expect(page.locator('.todo-subtask-ai')).toHaveCount(0);
    await expect(page.locator('.todo-subtask-rewrite')).toHaveCount(1);
    expect(errors).toEqual([]);
  });

  test('a document with legacy node icons and old prefs/shortcuts loads with no errors; removed prefs drop on next save', async ({ page }) => {
    const errors = trackErrors(page);
    await page.addInitScript(() => {
      if (sessionStorage.getItem('seeded9a')) return;
      sessionStorage.setItem('seeded9a', '1');
      localStorage.setItem('sakura_v001_prefs', JSON.stringify({
        aiHiddenButtons: ['expand', 'summarise', 'tags', 'icon'],
        contextQuickActions: ['ai-rewrite', 'ai-icon', 'note'],
        hoverToolbarActions: ['child', 'ai-icon', 'ai-icon-all'],
        qaAiAnswerEnabled: false
      }));
      localStorage.setItem('sakura-shortcut-overrides', JSON.stringify({ restructureText: 'mod+alt+r' }));
    });
    await page.goto('file://' + indexPath);
    await dismissOverlays(page);
    await seedDoc(page);
    await page.reload();
    await dismissOverlays(page);
    // Wait for the reloaded document to actually render before reading app state.
    await expect(page.locator('.node-row')).toHaveCount(2, { timeout: 15000 });

    const after = await page.evaluate(() => {
      // @ts-expect-error -- bare globals from index.html
      savePrefs();
      // @ts-expect-error
      const overrideInMemory = shortcutOverrides.restructureText;
      // @ts-expect-error
      saveShortcutOverrides();
      const prefs = JSON.parse(localStorage.getItem('sakura_v001_prefs') || '{}');
      return {
        // @ts-expect-error
        texts: nodes.map((n) => n.text),
        // @ts-expect-error
        icons: nodes.map((n) => n.icon),
        // @ts-expect-error
        aiHidden: aiHiddenButtons,
        // @ts-expect-error
        quick: contextQuickActions,
        // @ts-expect-error
        hover: hoverToolbarActions,
        prefsHasQaAi: 'qaAiAnswerEnabled' in prefs,
        prefsAiHidden: prefs.aiHiddenButtons,
        overrideInMemory,
        overrides: JSON.parse(localStorage.getItem('sakura-shortcut-overrides') || '{}')
      };
    });
    // Leading emoji are plain text and stay exactly as the user wrote them; a stray `icon`
    // field from older data is never read (the existing load normalizer doesn't carry unknown
    // node fields, same as before this change) and loading it causes no error.
    expect(after.texts).toEqual(['🛒 Webshop checkout', 'Payment provider integration']);
    expect(after.icons.length).toBe(2);
    expect(after.aiHidden).toEqual([]);
    expect(after.prefsAiHidden).toEqual([]);
    expect(after.quick).toEqual(['ai-rewrite', 'note']);
    expect(after.hover).toEqual(['child']);
    expect(after.prefsHasQaAi).toBe(false);
    expect(after.overrideInMemory).toBeUndefined();
    expect(after.overrides.restructureText).toBeUndefined();
    await expect(page.locator('.node-row')).toHaveCount(2);
    expect(errors).toEqual([]);
  });

  // With the To-Dos AI header buttons gone, the panel's header row and its "Add a task" row are one
  // bar: input (flexible) + add button, then History / Export / Maximize / Close.
  test('To-Dos panel: add-task input and History/Export/Maximize/Close share one bar at default, minimum, and maximized widths', async ({ page }) => {
    const errors = trackErrors(page);
    await page.goto('file://' + indexPath);
    await dismissOverlays(page);
    await seedDoc(page);
    await page.evaluate(() => {
      // @ts-expect-error -- bare global from index.html
      openDockTab('todos');
    });
    await expect(page.locator('#todos-panel')).toHaveClass(/open/);
    await expect(page.locator('#todos-input-row')).toHaveCount(0);
    const order = await page.locator('#todos-panel-header > *').evaluateAll((els) => els.map((e) => e.id));
    expect(order).toEqual(['todos-input', 'todos-add-btn', 'todos-history-btn', 'todos-export-trigger', 'todos-panel-maximize', 'todos-panel-close']);
    // Tooltips unchanged.
    await expect(page.locator('#todos-add-btn')).toHaveAttribute('data-tip', 'Add task');
    await expect(page.locator('#todos-history-btn')).toHaveAttribute('data-tip', 'Version history');
    await expect(page.locator('#todos-export-trigger')).toHaveAttribute('data-tip', 'Export to-do list');
    await expect(page.locator('#todos-panel-close')).toHaveAttribute('data-tip', 'Close (Esc)');

    const layout = async () => page.evaluate(() => {
      const panel = document.getElementById('todos-panel')!.getBoundingClientRect();
      const ids = ['todos-input', 'todos-add-btn', 'todos-history-btn', 'todos-export-trigger', 'todos-panel-maximize', 'todos-panel-close'];
      const rects = ids.map((id) => document.getElementById(id)!.getBoundingClientRect());
      const bottoms = rects.map((r) => Math.round(r.bottom));
      return {
        sameRow: Math.max(...bottoms) - Math.min(...bottoms) <= 2,
        allInside: rects.every((r) => r.width > 0 && r.left >= panel.left - 1 && r.right <= panel.right + 1),
        inputWidth: Math.round(rects[0].width),
        ordered: rects.every((r, i) => i === 0 || r.left >= rects[i - 1].right - 1)
      };
    });
    const def = await layout();
    expect(def).toMatchObject({ sameRow: true, allInside: true, ordered: true });
    expect(def.inputWidth).toBeGreaterThan(150);

    // Minimum dock width (TODOS_WIDTH_MIN = 320): input shrinks, every button stays visible.
    await page.evaluate(() => { document.getElementById('todos-panel')!.style.width = '320px'; });
    const min = await layout();
    expect(min).toMatchObject({ sameRow: true, allInside: true, ordered: true });
    expect(min.inputWidth).toBeGreaterThan(60);
    expect(min.inputWidth).toBeLessThan(def.inputWidth);

    // Maximized.
    await page.locator('#todos-panel-maximize').click();
    await expect(page.locator('#todos-panel')).toHaveClass(/maximized/);
    expect(await layout()).toMatchObject({ sameRow: true, allInside: true, ordered: true });
    await page.locator('#todos-panel-maximize').click();
    await expect(page.locator('#todos-panel')).not.toHaveClass(/maximized/);

    // Focus order: the input comes first, then the add button, then the action buttons.
    await page.locator('#todos-input').focus();
    await page.keyboard.press('Tab');
    await expect(page.locator('#todos-add-btn')).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.locator('#todos-history-btn')).toBeFocused();

    // Pressing on the input never starts a panel drag; Enter still adds the task.
    await page.locator('#todos-input').click();
    await expect(page.locator('#todos-panel-header')).not.toHaveClass(/dragging/);
    await page.locator('#todos-input').fill('Merged bar task');
    await page.keyboard.press('Enter');
    await expect(page.locator('.todo-text', { hasText: 'Merged bar task' })).toHaveCount(1);
    await expect(page.locator('#todos-input')).toHaveValue('');
    // The add button adds too.
    await page.locator('#todos-input').fill('Clicked add');
    await page.locator('#todos-add-btn').click();
    await expect(page.locator('.todo-text', { hasText: 'Clicked add' })).toHaveCount(1);
    expect(errors).toEqual([]);
  });
});
