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

// See tests/e2e/generated-notifications-smoke.spec.ts for why these are expected/benign here.
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
  'extractTodosFromDocument', 'breakTodoIntoSubtasks', 'generateTodosSummary',
  // Generate diagram, removed everywhere (owner, 2026-10-29)
  'diagramGenTrimText', 'generateDiagramFromOutline'
];
const KEPT_FUNCTIONS = [
  'generateOutlineWithAi', 'insertAiOutline', 'rewriteNodeText', 'rewriteMultipleNodes', 'rewriteSubTextSelection',
  'setAutoRewriteEnabled', 'queueAutoRewrite', 'flushAutoRewriteQueue', 'callAiApi', 'callAiRaw',
  'callAiApiBatch', 'computeOutlineNumbers', 'renderCardsHtml'
];

test.describe('cutdown 9a: AI trimmed to Generate outline + Rewrite; node icons removed', () => {
  test('kept AI entry points exist; removed ones are gone from the DOM and the global scope', async ({ page }) => {
    const errors = trackErrors(page);
    await page.goto('file://' + indexPath);
    await dismissOverlays(page);
    await seedDoc(page);

    // AI entry points: Rewrite row on the right-click menu; Generate outline by shortcut and on the
    // empty page (KEPT_FUNCTIONS). The hidden toolbar's AI ▾ is gone (owner 2026-10-29).
    await page.locator('.node-row').first().click({ button: 'right' });
    await expect(page.locator('#context-quickbar [data-action="ai-rewrite"]')).toHaveCount(1);
    await page.keyboard.press('Escape');
    for (const id of ['qb-ai', 'ai-menu', 'qb-ai-outline', 'qb-ai-rewrite', 'qb-ai-expand', 'qb-ai-summarise', 'qb-ai-tags', 'qb-ai-icon', 'icon-picker-popover',
      'todos-extract-btn', 'todos-summary-btn', 'todos-summary-modal-overlay', 'settings-section-ai-todos',
      'todos-ai-settings-jump-btn', 'qa-ai-answer-toggle', 'sakura-modal-textarea', 'aitb-expand', 'aitb-summarise',
      'aitb-tags', 'aitb-icon', 'hoverq-ai-icon', 'ctxq-ai-icon']) {
      await expect(page.locator('#' + id), id).toHaveCount(0);
    }
    // Auto-rewrite status-bar toggle + its settings survive.
    await expect(page.locator('#sb-auto-rewrite-chip')).toHaveCount(1);
    await expect(page.locator('#auto-rewrite-toggle')).toHaveCount(1);
    // The toolbar is fixed now (item 14), so there's no "AI buttons" customization grid at all.
    await expect(page.locator('#ai-buttons-grid')).toHaveCount(0);

    const state = await page.evaluate(({ removed, kept }) => {
      const w = window as unknown as Record<string, unknown>;
      return {
        removedPresent: removed.filter((n) => typeof w[n] !== 'undefined'),
        keptMissing: kept.filter((n) => typeof w[n] !== 'function'),
        // @ts-expect-error -- bare globals from index.html
        ctxOrder: CTX_ACTION_ORDER.filter((a) => a.startsWith('ai-')),
        // @ts-expect-error
        qaAiIds: QA_ACTIONS.map((a) => a.id).filter((id) => id.startsWith('ai-')),
        // @ts-expect-error
        shortcuts: { generateOutline: !!SHORTCUTS.generateOutline, restructureText: !!SHORTCUTS.restructureText }
      };
    }, { removed: REMOVED_FUNCTIONS, kept: KEPT_FUNCTIONS });
    expect(state.removedPresent).toEqual([]);
    expect(state.keptMissing).toEqual([]);
    // 'ai-rewrite-all' / 'ai-rewrite-document' (Rewrite document) were removed later, in cutdown 9b.
    expect(state.ctxOrder).toEqual(['ai-rewrite']);
    expect(state.qaAiIds).toEqual(['ai-rewrite-node', 'ai-generate-outline']);
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
      contextQuickActions = ['ai-rewrite', 'note']; showContextMenu(200, 200, 1);
    });
    const menu = page.locator('#context-menu');
    await expect(menu).toBeVisible();
    const text = await menu.evaluate((m) => (m as HTMLElement).innerText + ' ' + [...m.querySelectorAll('[data-tip],[aria-label]')].map((e) => (e.getAttribute('data-tip') || '') + ' ' + (e.getAttribute('aria-label') || '')).join(' '));
    expect(text).toMatch(/Rewrite row/);
    expect(text).not.toMatch(/Suggest icon/i);
    expect(errors).toEqual([]);
  });

  test('To-Dos header has no AI buttons; a task keeps Rewrite (in its menu) and its subtasks keep Rewrite, with no "Break into subtasks"', async ({ page }) => {
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
    await expect(page.locator('.todo-subtask-ai')).toHaveCount(0);
    await page.locator('.todo-row[data-id="t2"]').click({ button: 'right', position: { x: 4, y: 10 } });
    await expect(page.locator('.sb-context-menu .sb-context-item', { hasText: 'Rewrite' })).toHaveCount(1);
    await expect(page.locator('.sb-context-menu .sb-context-item', { hasText: 'Break into subtasks' })).toHaveCount(0);
    await page.keyboard.press('Escape');
    // Subtasks fold behind their count at rest; open the task to see them.
    await page.click('.todo-subtasks-toggle[data-id="t1"]');
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
      // The legacy document is written straight into storage before the first load, exactly as an
      // older build would have left it, instead of being created in-page and then reloaded: under
      // heavy parallel load Chromium can navigate before a just-written localStorage entry is
      // committed, which made the reload come back with an empty store.
      const docId = 'legacy9adoc';
      localStorage.setItem('sakura_doc_v1_' + docId, JSON.stringify({
        nodes: [
          { id: 1, depth: 0, text: '🛒 Webshop checkout', parentId: null, isCheckbox: false, checked: false, note: '', tags: ['shop'], styles: {}, icon: '🛒' },
          { id: 2, depth: 1, text: 'Payment provider integration', parentId: 1, isCheckbox: false, checked: false, note: '', tags: [], styles: {}, icon: 'cart' }
        ],
        nextId: 3, selectedId: null, multiSelectedIds: [], selectionAnchorId: null, collapsed: [], title: 'Legacy icons', author: ''
      }));
      localStorage.setItem('sakura_docs_index_v1', JSON.stringify([{ id: docId, title: 'Legacy icons', updatedAt: Date.now() }]));
      localStorage.setItem('sakura_current_doc_v1', docId);
      localStorage.setItem('sakura_open_tabs_v1', JSON.stringify({ tabs: [docId], pinned: [], active: docId }));
    });
    await page.goto('file://' + indexPath);
    await dismissOverlays(page);
    // Wait for the stored document to actually render before reading app state.
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
        // The toolbar, right-click menu and hover toolbar customizations are gone entirely
        // (item 14), so their old saved lists aren't read into any state at all.
        customizationGlobals: ['aiHiddenButtons', 'contextQuickActions', 'hoverToolbarActions']
          .filter((n) => typeof (window as unknown as Record<string, unknown>)[n] !== 'undefined'),
        prefsHasQaAi: 'qaAiAnswerEnabled' in prefs,
        prefsCustomizationKeys: ['aiHiddenButtons', 'contextQuickActions', 'hoverToolbarActions'].filter((k) => k in prefs),
        overrideInMemory,
        overrides: JSON.parse(localStorage.getItem('sakura-shortcut-overrides') || '{}')
      };
    });
    // Leading emoji are plain text and stay exactly as the user wrote them; a stray `icon`
    // field from older data is never read (the existing load normalizer doesn't carry unknown
    // node fields, same as before this change) and loading it causes no error.
    expect(after.texts).toEqual(['🛒 Webshop checkout', 'Payment provider integration']);
    expect(after.icons.length).toBe(2);
    expect(after.customizationGlobals).toEqual([]);
    expect(after.prefsCustomizationKeys).toEqual([]);
    expect(after.prefsHasQaAi).toBe(false);
    expect(after.overrideInMemory).toBeUndefined();
    expect(after.overrides.restructureText).toBeUndefined();
    await expect(page.locator('.node-row')).toHaveCount(2);
    expect(errors).toEqual([]);
  });

  // To-Dos header: title + open count, Search, Sort-and-filter, ⋯ (Version history / Export as PDF /
  // Select), then Maximize/Close on one row; "Add a task" is its own row just below.
  test('To-Dos panel: header controls share one row and the add-task row sits below it, at default and minimum widths', async ({ page }) => {
    const errors = trackErrors(page);
    await page.goto('file://' + indexPath);
    await dismissOverlays(page);
    await seedDoc(page);
    await page.evaluate(() => {
      // @ts-expect-error -- bare global from index.html
      openDockTab('todos');
    });
    await expect(page.locator('#todos-panel')).toHaveClass(/open/);
    await expect(page.locator('#todos-open-row')).toHaveCount(0);
    const order = await page.locator('#todos-panel-header > *').evaluateAll((els) => els.map((e) => e.id || e.className));
    expect(order).toEqual(['todos-title', 'todos-open-label', 'todos-search-wrap', 'todos-more-wrap']);
    await expect(page.locator('#todos-add-row #todos-input')).toHaveCount(1);
    await expect(page.locator('#todos-add-row #todos-add-btn')).toHaveAttribute('data-tip', 'Add task');

    const layout = async () => page.evaluate(() => {
      const panel = document.getElementById('todos-panel')!.getBoundingClientRect();
      const ids = ['todos-title', 'todos-search-trigger', 'todos-more-trigger'];
      const rects = ids.map((id) => document.getElementById(id)!.getBoundingClientRect());
      const mids = rects.map((r) => Math.round(r.top + r.height / 2));
      const input = document.getElementById('todos-input')!.getBoundingClientRect();
      return {
        sameRow: Math.max(...mids) - Math.min(...mids) <= 2,
        allInside: rects.every((r) => r.width > 0 && r.left >= panel.left - 1 && r.right <= panel.right + 1),
        ordered: rects.every((r, i) => i === 0 || r.left >= rects[i - 1].right - 1),
        inputBelow: input.top >= Math.max(...rects.map((r) => r.bottom)) - 1,
        inputWidth: Math.round(input.width)
      };
    });
    const def = await layout();
    expect(def).toMatchObject({ sameRow: true, allInside: true, ordered: true, inputBelow: true });
    expect(def.inputWidth).toBeGreaterThan(150);

    // Minimum dock width (TODOS_WIDTH_MIN = 280): every header control stays visible.
    await page.evaluate(() => { document.documentElement.style.setProperty('--todos-w', '280px'); });
    expect(await layout()).toMatchObject({ sameRow: true, allInside: true, ordered: true, inputBelow: true });

    // ⋯ holds Version history (a flyout), Export as PDF and Select.
    await page.locator('#todos-more-trigger').click();
    await expect(page.locator('#todos-more-menu')).toBeVisible();
    await expect(page.locator('#todos-more-menu > .sb-context-item .sb-context-label')).toHaveText(['Version history', 'Export as PDF', 'Select or reorder tasks']);
    await page.locator('#todos-more-trigger').click();
    await expect(page.locator('#todos-more-menu')).toHaveCount(0);

    // N (with focus in the panel, outside any text field) jumps to the add-task input.
    await page.locator('#todos-more-trigger').focus();
    await page.keyboard.press('n');
    await expect(page.locator('#todos-input')).toBeFocused();
    await expect(page.locator('#todos-input')).toHaveValue('');

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
