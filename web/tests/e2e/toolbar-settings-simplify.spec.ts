import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

// Item 14: the main toolbar is one fixed set of buttons (no group labels, no customization), the
// right-click node menu is fixed, the node hover toolbar is gone, Version history / Sort / Clear
// all moved from the toolbar's Extras menu to the document tab's right-click menu, and a long list
// of customization settings were removed with their behaviour fixed. These tests pin all of that,
// plus that prefs saved by older builds load without errors and drop on the next save.

const KNOWN_NOISE = /ServiceWorker|cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net|embed\.diagrams\.net|CORS policy|Failed to load resource|net::ERR/i;

function trackErrors(page: import('@playwright/test').Page) {
  const errors: string[] = [];
  page.on('pageerror', (err) => { if (!KNOWN_NOISE.test(err.message)) errors.push('pageerror: ' + err.message); });
  page.on('console', (msg) => { if (msg.type() === 'error' && !KNOWN_NOISE.test(msg.text())) errors.push('console.error: ' + msg.text()); });
  return errors;
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => { try { localStorage.setItem('sakura_welcome_seen', '1'); } catch { /* storage unavailable */ } });
});

async function dismissOverlays(page: import('@playwright/test').Page) {
  await page.evaluate(() => {
    const landing = document.getElementById('sakura-landing-overlay');
    if (landing) landing.style.display = 'none';
    document.getElementById('welcome-overlay')?.classList.remove('open');
  });
}

async function open(page: import('@playwright/test').Page) {
  await page.goto('file://' + indexPath);
  await dismissOverlays(page);
}

async function seedDoc(page: import('@playwright/test').Page) {
  await page.evaluate(() => {
    // @ts-expect-error -- bare globals from index.html
    ensureDocumentForEditing();
    // @ts-expect-error
    nodes = [
      { id: 1, depth: 0, text: 'Charlie', parentId: null, isCheckbox: false, checked: false, note: '', tags: [], styles: {} },
      { id: 2, depth: 1, text: 'Child of Charlie', parentId: 1, isCheckbox: false, checked: false, note: '', tags: [], styles: {} },
      { id: 3, depth: 0, text: 'Alpha', parentId: null, isCheckbox: false, checked: false, note: '', tags: [], styles: {} },
      { id: 4, depth: 0, text: 'Bravo', parentId: null, isCheckbox: false, checked: false, note: '', tags: [], styles: {} },
    ];
    // @ts-expect-error
    collapsedIds = new Set(); selectedId = null; multiSelectedIds = []; selectAllMode = false; focusedId = null; undoStack = []; editingId = null; nextId = 5;
    // @ts-expect-error
    render();
  });
}

const rootTexts = (page: import('@playwright/test').Page) =>
  // @ts-expect-error -- bare globals from index.html
  page.evaluate(() => nodes.filter((n: { depth: number }) => n.depth === 0).map((n: { text: string }) => n.text));

test.describe('Fixed main toolbar', () => {
  test('shows exactly the fixed buttons, in order, with no group labels', async ({ page }) => {
    const errors = trackErrors(page);
    await open(page);
    await expect(page.locator('#quick-bar')).toBeVisible();
    const shown = await page.evaluate(() =>
      Array.from(document.querySelectorAll('#quick-bar .quick-btn'))
        .filter((b) => (b as HTMLElement).offsetParent !== null)
        .map((b) => b.id || (b as HTMLElement).dataset.style));
    expect(shown).toEqual([
      'undo-btn', 'redo-btn',
      'qb-outdent', 'qb-indent',
      'bold', 'italic', 'hl-toggle-btn', 'fc-toggle-btn', 'heading-toggle-btn',
      'qb-insert', 'qb-ai',
      'qb-collapse', 'qb-zoom',
    ]);
    // Note/Checkbox/Tags + the other node inserts live in Insert ▾ (same order as right-click);
    // Rewrite + Generate outline live in AI ▾.
    await page.locator('#qb-insert').click();
    await expect(page.locator('#insert-menu .tb-menu-heading')).toHaveText(['Basics', 'Marker', 'Discussion', 'Visuals']);
    await expect(page.locator('#insert-menu .tb-menu-item:not([hidden]) .tb-menu-label')).toHaveText(['Note', 'Checkbox', 'Tags…', 'Date/time', 'Question', 'Remark', 'Table', 'Image', 'Diagram', 'Generate diagram']);
    await expect(page.locator('#insert-markers .tb-menu-marker')).toHaveCount(5);
    await page.locator('#qb-ai').click();
    await expect(page.locator('#insert-menu')).not.toHaveClass(/open/);
    await expect(page.locator('#ai-menu .tb-menu-label')).toHaveText(['Rewrite node', 'Generate outline']);
    await page.locator('#qb-ai').click();
    // Colour pickers stay attached to Highlight and Text colour.
    await expect(page.locator('#hl-caret-btn')).toBeVisible();
    await expect(page.locator('#fc-caret-btn')).toBeVisible();
    await expect(page.locator('#quick-bar .ag-label')).toHaveCount(0);
    for (const gone of ['#qb-above', '#qb-child', '#qb-duplicate', '#qb-up', '#qb-down', '#qb-delete', '#qb-smart-paste', '#insert-dt-btn', '#more-toggle', '#more-menu', '.fmt-btn[data-style="underline"]', '.fmt-btn[data-style="strike"]', '#editor-toolbar-toggle']) {
      await expect(page.locator(gone)).toHaveCount(0);
    }
    // Collapse all + Zoom sit at the right end of the bar.
    const gap = await page.evaluate(() => {
      const bar = document.getElementById('quick-bar')!.getBoundingClientRect();
      const zoom = document.getElementById('qb-zoom')!.getBoundingClientRect();
      const rewrite = document.getElementById('qb-ai')!.getBoundingClientRect();
      return { toRightEdge: bar.right - zoom.right, afterAi: zoom.left - rewrite.right };
    });
    expect(gap.toRightEdge).toBeLessThan(40);
    expect(gap.afterAi).toBeGreaterThan(100);
    expect(errors).toEqual([]);
  });

  test('the toggle-toolbar shortcut is gone and the toolbar stays visible', async ({ page }) => {
    const errors = trackErrors(page);
    await open(page);
    // @ts-expect-error -- bare globals from index.html
    expect(await page.evaluate(() => 'toggleToolbar' in SHORTCUTS)).toBe(false);
    await page.keyboard.press('Control+Shift+X');
    await expect(page.locator('#quick-bar')).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('actions removed from the toolbar stay reachable from the right-click menu and shortcuts', async ({ page }) => {
    const errors = trackErrors(page);
    await open(page);
    await seedDoc(page);
    await page.locator('.node-row[data-id="3"]').click({ button: 'right' });
    await page.locator('#context-more-toggle').click();
    await page.locator('#context-more-panel .context-submenu-trigger').hover();
    for (const action of ['above', 'below', 'child', 'duplicate', 'up', 'down', 'date-time', 'delete']) {
      await expect(page.locator(`#context-more-panel [data-action="${action}"]`)).toBeVisible();
    }
    // Duplicate via the menu actually works.
    await page.locator('#context-more-panel [data-action="duplicate"]').click();
    expect(await rootTexts(page)).toEqual(['Charlie', 'Alpha', 'Alpha', 'Bravo']);
    // Keyboard shortcuts for the rest are still registered.
    const ids = await page.evaluate(() => ['newChild', 'moveUp', 'moveDown', 'underline', 'strike', 'insertDateTime']
      // @ts-expect-error -- bare globals from index.html
      .filter((id) => !SHORTCUTS[id]));
    expect(ids).toEqual([]);
    expect(errors).toEqual([]);
  });
});

test.describe('Document tab menu: Version history, Sort, Clear all', () => {
  test('sorts top-level nodes A→Z, Z→A and by depth from the open document\'s tab', async ({ page }) => {
    const errors = trackErrors(page);
    await open(page);
    await seedDoc(page);
    const pick = async (label: string) => {
      await page.locator('.doc-tab.active').click({ button: 'right' });
      await page.locator('.sb-context-menu .sb-context-item', { hasText: label }).click();
    };
    await pick('Sort top-level nodes A → Z');
    expect(await rootTexts(page)).toEqual(['Alpha', 'Bravo', 'Charlie']);
    await pick('Sort top-level nodes Z → A');
    expect(await rootTexts(page)).toEqual(['Charlie', 'Bravo', 'Alpha']);
    await pick('Sort top-level nodes by depth');
    // Shallowest subtree first: the two leaf roots before Charlie (which has a child).
    expect((await rootTexts(page))[2]).toBe('Charlie');
    expect(errors).toEqual([]);
  });

  test('Version history opens from the tab menu', async ({ page }) => {
    await open(page);
    await seedDoc(page);
    await page.locator('.doc-tab.active').click({ button: 'right' });
    await page.locator('.sb-context-menu .sb-context-item', { hasText: 'Version history…' }).click();
    await expect(page.locator('#history-modal-overlay')).toHaveClass(/open/);
  });

  test('Clear all nodes asks first: Cancel keeps everything, Clear all empties the document and Undo restores it', async ({ page }) => {
    const errors = trackErrors(page);
    await open(page);
    await seedDoc(page);
    const clear = async () => {
      await page.locator('.doc-tab.active').click({ button: 'right' });
      await page.locator('.sb-context-menu .sb-context-item', { hasText: 'Clear all nodes…' }).click();
      await expect(page.locator('#sakura-modal-overlay')).toHaveClass(/open/);
    };
    await clear();
    await page.locator('#sakura-modal-actions button', { hasText: 'Cancel' }).click();
    // Let the dialog finish its close animation before opening it again.
    await expect(page.locator('#sakura-modal-overlay')).not.toHaveClass(/open/);
    // @ts-expect-error -- bare globals from index.html
    expect(await page.evaluate(() => nodes.length)).toBe(4);
    await clear();
    await page.locator('#sakura-modal-actions button', { hasText: 'Clear all' }).click();
    // @ts-expect-error
    await expect.poll(() => page.evaluate(() => nodes.length)).toBe(0);
    // @ts-expect-error
    await page.evaluate(() => contextualUndo());
    // @ts-expect-error
    expect(await page.evaluate(() => nodes.length)).toBe(4);
    expect(errors).toEqual([]);
  });

  test('Sort and Clear only appear on the open document\'s tab; Version history on every tab', async ({ page }) => {
    await open(page);
    await seedDoc(page);
    await page.evaluate(() => {
      // @ts-expect-error -- bare globals from index.html
      createDoc();
    });
    await page.locator('.doc-tab:not(.active)').first().click({ button: 'right' });
    const labels = await page.locator('.sb-context-menu .sb-context-item').allTextContents();
    expect(labels).toContain('Version history…');
    expect(labels.some((l) => l.startsWith('Sort'))).toBe(false);
    expect(labels).not.toContain('Clear all nodes…');
  });
});

test.describe('Fixed right-click menu, no hover toolbar', () => {
  test('quick row and More are fixed; there is no hover toolbar', async ({ page }) => {
    const errors = trackErrors(page);
    await open(page);
    await seedDoc(page);
    await expect(page.locator('#node-hover-rail')).toHaveCount(0);
    await expect(page.locator('#node-hover-menu')).toHaveCount(0);
    await page.locator('.node-row[data-id="1"]').hover();
    await expect(page.locator('.node-hover-rail-btn')).toHaveCount(0);
    await page.locator('.node-row[data-id="1"]').click({ button: 'right' });
    const quick = await page.evaluate(() => Array.from(document.querySelectorAll('#context-quickbar [data-action]')).map((b) => (b as HTMLElement).dataset.action));
    expect(quick).toEqual(['ai-rewrite', 'note', 'remark', 'qa', 'diagram', 'table']);
    await page.locator('#context-more-toggle').click();
    const more = await page.evaluate(() => Array.from(document.querySelectorAll('#context-more-panel [data-action]')).map((b) => (b as HTMLElement).dataset.action));
    expect(more).toEqual(['child', 'above', 'below', 'up', 'down', 'duplicate', 'focus', 'fold', 'sort-az', 'sort-za', 'sort-depth', 'date-time', 'image', 'diagram-gen', 'tags', 'version-history', 'delete']);
    // Add and Move are single icon rows; the add-to-node leftovers sit behind one Insert › flyout.
    await expect(page.locator('#context-more-panel .context-icon-row')).toHaveCount(2);
    await expect(page.locator('#context-more-panel .context-submenu [data-action]')).toHaveCount(3);
    await page.locator('#context-more-panel .context-submenu-trigger').hover();
    await expect(page.locator('#context-more-panel .context-submenu')).toBeVisible();
    expect(errors).toEqual([]);
  });
});

test.describe('Settings', () => {
  test('removed rows and sections are gone; kept ones are present', async ({ page }) => {
    await open(page);
    for (const gone of ['#settings-section-bars', '#settings-section-zen', '#settings-section-features', '#settings-section-hover-toolbar', '#settings-section-selection-fmt', '#settings-section-diagrams',
      '#toolbar-visible-toggle', '#toolbar-labels-toggle', '#word-wrap-toggle', '#toolbar-buttons-open-btn', '#rightclick-menu-open-btn', '#tabbar-visible-toggle', '#folder-default-collapsed-toggle', '#sb-restore-hint-btn',
      '#todos-overdue-badge-toggle', '#todos-actions-mode-select', '#todos-subtasks-collapse-toggle', '#todos-completed-collapse-toggle', '[id^="todoel-"]', '#confirm-delete-toggle', '#nqa-icon-row-toggle',
      '#always-expand-inline-toggle', '#node-timestamp-hover-toggle', '#diagram-gen-skip-review-toggle', '#feat-tagging-toggle', '#feat-todos-toggle', '#feat-quickassist-toggle', '#feat-nodeqa-toggle',
      '#arw-minwords-input', '#arw-pause-input', '#arw-batchcap-input', '#arw-chip-detail-toggle', '[id^="arwex-"]', '#debug-log-toggle', '[id^="sbitem-"]', '[id^="abhsec-"]', '[id^="ctxq-"]', '[id^="hoverq-"]',
      '.settings-rail-btn[data-cat="features"]', '#help-section-features', '#sb-hint-bar']) {
      await expect(page.locator(gone), gone).toHaveCount(0);
    }
    for (const kept of ['#theme-segmented', '#accent-swatch-row', '#editor-scale', '#datetime-format-select', '#default-author-input', '#feat-focus-toggle', '#typewriter-mode-toggle', '#feat-backlinks-toggle',
      '#global-search-bar-toggle', '#todos-expiry-select', '#todos-cap-select', '#trash-retention-select', '#cover-page-toggle', '#preview-branding-toggle', '#export-accent-toggle', '#auto-rewrite-toggle',
      '#ai-provider-select', '#ai-prompt-input', '#ai-max-tokens-select', '#shortcuts-open-modal-btn', '#sb-export-all-btn', '#vault-setup-btn', '#open-feedback-modal-btn']) {
      await expect(page.locator(kept), kept).toHaveCount(1);
    }
    // AI Capabilities now lives in the AI category, in its own always-visible section.
    await expect(page.locator('#settings-section-ai-capabilities[data-cat="ai"] #feat-ai-toggle')).toHaveCount(1);
  });

  test('Insert ▾ items run the same action as the right-click menu (Add remark adds a remark to the selected node)', async ({ page }) => {
    await open(page);
    await seedDoc(page);
    await page.locator('.node-row[data-id="1"]').click();
    // @ts-expect-error -- bare global from index.html
    const before = await page.evaluate(() => remarks.length);
    await page.locator('#qb-insert').click();
    await page.locator('#insert-menu [data-insert-action="remark"]').click();
    await expect(page.locator('#insert-menu')).not.toHaveClass(/open/);
    // @ts-expect-error
    await expect.poll(() => page.evaluate(() => remarks.length)).toBe(before + 1);
  });

  test('Insert ▾ marker strip sets the selected node\'s marker, and clicking the active one clears it', async ({ page }) => {
    await open(page);
    await seedDoc(page);
    await page.locator('.node-row[data-id="1"]').click();
    await page.locator('#qb-insert').click();
    await page.locator('#insert-markers [data-marker="followup"]').click();
    await expect(page.locator('#insert-menu')).not.toHaveClass(/open/);
    // @ts-expect-error -- bare global from index.html
    expect(await page.evaluate(() => nodes.find((n: { id: number }) => n.id === 1).marker)).toBe('followup');
    await page.locator('#qb-insert').click();
    await expect(page.locator('#insert-markers [data-marker="followup"]')).toHaveClass(/active/);
    await page.locator('#insert-markers [data-marker="followup"]').click();
    // @ts-expect-error
    expect(await page.evaluate(() => nodes.find((n: { id: number }) => n.id === 1).marker)).toBe('');
  });

  test('turning AI Capabilities off from Settings → AI hides the AI toolbar buttons but keeps its own switch', async ({ page }) => {
    await open(page);
    await page.evaluate(() => {
      document.getElementById('settings-toggle')!.click();
      (document.querySelector('.settings-rail-btn[data-cat="ai"]') as HTMLElement).click();
    });
    await page.locator('#feat-ai-toggle').click();
    await expect(page.locator('#qb-ai')).toBeHidden();
    await expect(page.locator('#feat-ai-toggle')).toBeVisible();
    await expect(page.locator('#settings-section-ai-rewrite')).toBeHidden();
    await page.locator('#feat-ai-toggle').click();
    await expect(page.locator('#qb-ai')).toBeVisible();
  });

  test('Text size lives in Settings → Appearance', async ({ page }) => {
    await open(page);
    await page.evaluate(() => {
      const s = document.getElementById('editor-scale') as HTMLInputElement;
      s.value = '1.2'; s.dispatchEvent(new Event('input', { bubbles: true }));
    });
    // @ts-expect-error -- bare globals from index.html
    expect(await page.evaluate(() => editorScale)).toBeCloseTo(1.2);
    await expect(page.locator('#editor-scale-value')).toHaveText('120%');
  });
});

test.describe('Zen mode', () => {
  test('hides the toolbar, tab bar and File Explorer, and restores them on exit', async ({ page }) => {
    await open(page);
    await seedDoc(page);
    // @ts-expect-error -- bare globals from index.html
    await page.evaluate(() => setZenMode(true));
    await expect(page.locator('#quick-bar')).toBeHidden();
    await expect(page.locator('#doc-tab-strip-row')).toBeHidden();
    // @ts-expect-error
    expect(await page.evaluate(() => sidebarOpen)).toBe(false);
    await expect(page.locator('#statusbar')).toBeVisible();
    // @ts-expect-error
    await page.evaluate(() => setZenMode(false));
    await expect(page.locator('#quick-bar')).toBeVisible();
    await expect(page.locator('#doc-tab-strip-row')).toBeVisible();
    // @ts-expect-error
    expect(await page.evaluate(() => sidebarOpen)).toBe(true);
  });
});

// Prefs written by older builds, covering every removed setting. Seeded before the first load.
const OLD_PREFS = {
  theme: 'light',
  toolbarLabels: true, toolbarVisible: false, expandedToolbar: true, wordWrapEnabled: false,
  toolbarHiddenGroups: ['history', 'format', 'fold', 'ai'],
  historyHiddenButtons: ['undo'], structureHiddenButtons: ['outdent'], moveHiddenButtons: ['up'], formatHiddenButtons: ['bold', 'highlight'],
  foldHiddenButtons: ['zoom', 'collapse'], aiHiddenButtons: ['rewrite'], extrasHiddenButtons: ['clear'], deleteHiddenButtons: ['delete'], insertHiddenButtons: ['note', 'tags'],
  editorFloatingHiddenButtons: ['zen', 'toolbar'],
  contextQuickActions: ['delete'], ctxImageActionAdded: true, contextSortChildrenEnabled: false,
  hoverToolbarEnabled: true, hoverToolbarActions: ['child', 'delete'], selectionFmtPopoverEnabled: false,
  statusbarHiddenItems: ['wordcount', 'saved', 'depth'], statusbarRightOrder: ['qa', 'scale', 'saved'],
  appbarHiddenButtons: ['help', 'import', 'export'], tabbarVisible: false,
  zenHideToolbar: false, zenHideSidebar: false, zenHideTabbar: false,
  nodeTimestampHoverEnabled: false, alwaysExpandInlineEnabled: true, diagramGenSkipReviewEnabled: true,
  featureTaggingEnabled: false, featureQuickAssistEnabled: false, nodeQuickAssistEnabled: false, nqaIconOnly: true,
  confirmBeforeDelete: false,
  autoRewriteMinWords: 0, autoRewriteIdleSec: 3, autoRewriteBatchCap: 50, autoRewriteChipShowQueued: false, autoRewriteExclusions: [],
  debugLoggingEnabled: true,
  qaSearchHiddenCategories: ['features'],
};
const REMOVED_KEYS = Object.keys(OLD_PREFS).filter((k) => k !== 'theme' && k !== 'qaSearchHiddenCategories');
const OLD_TODO_SETTINGS = { expiryDays: 7, capMax: 25, featureEnabled: false, rowActionsMode: 'fixed', showOverdueBadge: false, subtasksCollapsedByDefault: true, completedCollapsedByDefault: false, hiddenElements: ['priority', 'due'] };

test.describe('Old prefs load harmlessly and drop on the next save', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(([prefs, todo]) => {
      try {
        if (!sessionStorage.getItem('seeded')) {
          localStorage.setItem('sakura_v001_prefs', JSON.stringify(prefs));
          localStorage.setItem('sakura_todos_settings_v1', JSON.stringify(todo));
          localStorage.setItem('sakura_folder_default_collapsed_v1', 'true');
          sessionStorage.setItem('seeded', '1');
        }
      } catch { /* storage unavailable */ }
    }, [OLD_PREFS, OLD_TODO_SETTINGS] as const);
  });

  test('every removed setting is ignored on load, with no errors', async ({ page }) => {
    const errors = trackErrors(page);
    await open(page);
    await seedDoc(page);
    // Toolbar: always shown, every fixed button visible despite the old hidden lists.
    await expect(page.locator('#quick-bar')).toBeVisible();
    for (const id of ['#undo-btn', '#qb-outdent', '#hl-wrap', '#qb-insert', '#qb-ai', '#qb-collapse', '#qb-zoom']) {
      await expect(page.locator(id), id).toBeVisible();
    }
    await expect(page.locator('.fmt-btn[data-style="bold"]')).toBeVisible();
    await expect(page.locator('#editor-zen-toggle')).toBeVisible();
    // Tab bar always on; status bar items fixed; app bar items all shown.
    await expect(page.locator('#doc-tab-strip-row')).toBeVisible();
    await expect(page.locator('#sb-wordcount')).toBeVisible();
    await expect(page.locator('#sb-depth')).toBeVisible();
    await expect(page.locator('#sb-saved')).toBeVisible();
    for (const id of ['#help-toggle', '#import-toggle', '#export-toggle']) await expect(page.locator(id), id).toBeVisible();
    // Right-click menu fixed.
    await page.locator('.node-row[data-id="1"]').click({ button: 'right' });
    const quick = await page.evaluate(() => Array.from(document.querySelectorAll('#context-quickbar [data-action]')).map((b) => (b as HTMLElement).dataset.action));
    expect(quick).toEqual(['ai-rewrite', 'note', 'remark', 'qa', 'diagram', 'table']);
    await page.locator('#context-more-toggle').click();
    await expect(page.locator('#context-more-panel [data-action="sort-az"]')).toBeVisible();
    await page.keyboard.press('Escape');
    // Tagging / Quick Assist / Quick Insert are always on.
    await page.locator('#qb-insert').click();
    await expect(page.locator('#qb-tags')).toBeVisible();
    await page.locator('#qb-insert').click();
    // @ts-expect-error -- bare globals from index.html
    await page.evaluate(() => toggleQa());
    await expect(page.locator('#qa-dropdown')).toHaveClass(/open/);
    // To-Dos always on, Completed collapsed, every row element shown.
    await expect(page.locator('#dock-panel-appbar-toggle')).toBeVisible();
    // @ts-expect-error
    await page.evaluate(() => { setQaOpen(false); toggleDockTab(); });
    await expect(page.locator('#todos-panel')).toHaveClass(/open/);
    // @ts-expect-error
    await page.evaluate(() => toggleDockTab());
    // @ts-expect-error
    expect(await page.evaluate(() => typeof window.sakuraTodosFeatureEnabled)).toBe('undefined');
    // Zen: File Explorer still hidden despite the old zenHideSidebar:false.
    // @ts-expect-error
    await page.evaluate(() => setZenMode(true));
    // @ts-expect-error
    expect(await page.evaluate(() => sidebarOpen)).toBe(false);
    await expect(page.locator('#quick-bar')).toBeHidden();
    // @ts-expect-error
    await page.evaluate(() => setZenMode(false));
    // New folders start expanded despite the old "collapsed" flag.
    // @ts-expect-error
    const folderOpen = await page.evaluate(() => { createFolder(); return loadFolders().slice(-1)[0].open; });
    expect(folderOpen).toBe(true);
    expect(errors).toEqual([]);
  });

  test('removed keys are dropped from saved prefs and To-Dos settings on the next save', async ({ page }) => {
    const errors = trackErrors(page);
    await open(page);
    await page.evaluate(() => {
      // @ts-expect-error -- bare globals from index.html
      savePrefs();
      (document.getElementById('todos-expiry-select') as HTMLSelectElement).value = '14';
      document.getElementById('todos-expiry-select')!.dispatchEvent(new Event('change'));
    });
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('sakura_v001_prefs') || '{}'));
    for (const k of REMOVED_KEYS) expect(saved, k).not.toHaveProperty(k);
    expect(saved.theme).toBe('light');
    expect(saved.qaSearchHiddenCategories).toEqual([]);
    const todo = await page.evaluate(() => JSON.parse(localStorage.getItem('sakura_todos_settings_v1') || '{}'));
    expect(todo.expiryDays).toBe(14);
    expect(todo.capMax).toBe(25);
    for (const k of ['featureEnabled', 'rowActionsMode', 'showOverdueBadge', 'subtasksCollapsedByDefault', 'completedCollapsedByDefault', 'hiddenElements']) expect(todo, k).not.toHaveProperty(k);
    expect(errors).toEqual([]);
  });
});
