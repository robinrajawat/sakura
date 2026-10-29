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
  // The one layout (owner 2026-10-28) shows no toolbar row: the top line keeps only Share (History left it 2026-10-29).
  // Insert ▾ and AI ▾ still back the same actions (right-click, "/", the selection bar).
  test('the top line shows only Share; Insert ▾ and AI ▾ keep their items', async ({ page }) => {
    const errors = trackErrors(page);
    await open(page);
    const shown = await page.evaluate(() =>
      Array.from(document.querySelectorAll('#quick-bar .quick-btn'))
        .filter((b) => (b as HTMLElement).offsetParent !== null)
        .map((b) => b.id || (b as HTMLElement).dataset.style));
    expect(shown).toEqual(['doc-share-chip']);
    await page.locator('#qb-insert').dispatchEvent('click');
    // Two groups under small headings (owner 2026-10-29); row status marks only when you type.
    await expect(page.locator('#insert-menu .sb-context-heading')).toHaveText(['Text', 'Insert']);
    await expect(page.locator('#insert-menu > .sb-context-item .sb-context-label')).toHaveText(['Heading 1', 'Heading 2', 'Heading 3', 'Checkbox', 'Note', 'Table', 'Image', 'Diagram', 'Thread']);
    await expect(page.locator('#insert-markers')).toHaveCount(0);
    await page.locator('#qb-ai').dispatchEvent('click');
    await expect(page.locator('#insert-menu')).toHaveCount(0);
    await expect(page.locator('#ai-menu .sb-context-label')).toHaveText(['Rewrite row', 'Generate outline']);
    await page.locator('#qb-ai').dispatchEvent('click');
    await expect(page.locator('#hl-caret-btn')).toHaveCount(0);
    await expect(page.locator('#fc-caret-btn')).toHaveCount(0);
    await expect(page.locator('#quick-bar .ag-label')).toHaveCount(0);
    for (const gone of ['#qb-above', '#qb-child', '#qb-duplicate', '#qb-up', '#qb-down', '#qb-delete', '#qb-smart-paste', '#insert-dt-btn', '#more-toggle', '#more-menu', '.fmt-btn[data-style="underline"]', '.fmt-btn[data-style="strike"]', '#editor-toolbar-toggle']) {
      await expect(page.locator(gone)).toHaveCount(0);
    }
    expect(errors).toEqual([]);
  });

  test('the toggle-toolbar shortcut is gone and the toolbar stays visible', async ({ page }) => {
    const errors = trackErrors(page);
    await open(page);
    // @ts-expect-error -- bare globals from index.html
    expect(await page.evaluate(() => 'toggleToolbar' in SHORTCUTS)).toBe(false);
    await page.keyboard.press('Control+Shift+X');
    await expect(page.locator('#doc-share-chip')).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('actions removed from the toolbar stay reachable from the right-click menu and shortcuts', async ({ page }) => {
    const errors = trackErrors(page);
    await open(page);
    await seedDoc(page);
    await page.locator('.node-row[data-id="3"]').click({ button: 'right' });
    await page.locator('#context-more-toggle').click();
    await page.locator('#context-more-panel [data-flyout="insert"]').hover();
    for (const action of ['above', 'below', 'child', 'duplicate', 'up', 'down', 'date-time', 'delete']) {
      await expect(page.locator(`#context-menu :is(#context-more-panel, .sb-context-submenu) [data-action="${action}"]`)).toBeVisible();
    }
    // Duplicate via the menu actually works.
    await page.locator('#context-menu :is(#context-more-panel, .sb-context-submenu) [data-action="duplicate"]').click();
    expect(await rootTexts(page)).toEqual(['Charlie', 'Alpha', 'Alpha', 'Bravo']);
    // Keyboard shortcuts for the rest are still registered.
    const ids = await page.evaluate(() => ['newChild', 'moveUp', 'moveDown', 'underline', 'strike', 'insertDateTime']
      // @ts-expect-error -- bare globals from index.html
      .filter((id) => !SHORTCUTS[id]));
    expect(ids).toEqual([]);
    expect(errors).toEqual([]);
  });
});

test.describe('Document menu (right-click the title): Version history, Sort, Clear all', () => {
  test('sorts top-level nodes A→Z, Z→A and by depth from the document menu', async ({ page }) => {
    const errors = trackErrors(page);
    await open(page);
    await seedDoc(page);
    const pick = async (label: string) => {
      await page.locator('#header-title').click({ button: 'right' });
      await page.locator('.sb-context-menu .sb-context-item', { hasText: label }).click();
    };
    await pick('Sort rows A → Z');
    expect(await rootTexts(page)).toEqual(['Alpha', 'Bravo', 'Charlie']);
    await pick('Sort rows Z → A');
    expect(await rootTexts(page)).toEqual(['Charlie', 'Bravo', 'Alpha']);
    await pick('Sort rows by depth');
    // Shallowest subtree first: the two leaf roots before Charlie (which has a child).
    expect((await rootTexts(page))[2]).toBe('Charlie');
    expect(errors).toEqual([]);
  });

  test('Version history opens from the document menu', async ({ page }) => {
    await open(page);
    await seedDoc(page);
    await page.locator('#header-title').click({ button: 'right' });
    await page.locator('.sb-context-menu .sb-context-item', { hasText: 'Version history…' }).click();
    await expect(page.locator('#history-modal-overlay')).toHaveClass(/open/);
  });

  test('Clear all rows empties the document at once, with Undo in the toast (no dialog when Undo can bring it all back)', async ({ page }) => {
    const errors = trackErrors(page);
    await open(page);
    await seedDoc(page);
    await page.locator('#header-title').click({ button: 'right' });
    await page.locator('.sb-context-menu .sb-context-item', { hasText: 'Clear all rows' }).click();
    await expect(page.locator('#sakura-modal-overlay')).not.toHaveClass(/open/);
    // @ts-expect-error -- bare globals from index.html
    await expect.poll(() => page.evaluate(() => nodes.length)).toBe(0);
    await expect(page.locator('#toast')).toContainText('Cleared all rows');
    await page.locator('#toast button', { hasText: 'Undo' }).click();
    // @ts-expect-error
    expect(await page.evaluate(() => nodes.length)).toBe(4);
    expect(errors).toEqual([]);
  });

  test('the document menu lists Version history, Sort and Clear all; there is no tab menu', async ({ page }) => {
    await open(page);
    await seedDoc(page);
    await expect(page.locator('#doc-tab-strip')).toBeHidden();
    await page.locator('#header-title').click({ button: 'right' });
    const labels = await page.locator('.sb-context-menu .sb-context-item').allTextContents();
    expect(labels).toEqual(['Version history…', 'Sort rows A → Z', 'Sort rows Z → A', 'Sort rows by depth', 'Clear all rows']);
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
    expect(quick).toEqual(['ai-rewrite', 'note', 'remark', 'diagram', 'table', 'image']);
    await page.locator('#context-more-toggle').click();
    const actions = (sel: string) => page.evaluate((sel) => Array.from(document.querySelectorAll(sel)).map((b) => (b as HTMLElement).dataset.action), sel);
    expect(await actions('#context-more-panel [data-action]')).toEqual(['child', 'above', 'below', 'duplicate', 'up', 'down', 'sort-az', 'sort-za', 'sort-depth', 'delete']);
    // Add (with Duplicate) and Move are icon rows (plus Sort children with children); the add-to-node
    // leftovers sit behind Insert ›, Zoom in, Collapse/expand and the row's settings behind Row ›
    // (owner, 2026-10-20: shorter More). Submenus are the shared menu's flyouts.
    await expect(page.locator('#context-more-panel .sb-context-iconrow')).toHaveCount(3);
    await page.locator('#context-more-panel [data-flyout="insert"]').hover();
    expect(await actions('#context-menu .sb-context-submenu [data-action]')).toEqual(['date-time', 'diagram-gen']);
    await page.locator('#context-more-panel [data-flyout="row"]').hover();
    expect(await actions('#context-menu .sb-context-submenu [data-action]')).toEqual(['focus', 'fold', 'tags', 'version-history', 'no-export']);
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
      '.settings-rail-btn[data-cat="features"]', '#help-section-features', '#sb-hint-bar',
      '#feat-focus-toggle', '#typewriter-mode-toggle', '#feat-backlinks-toggle', '#editor-full-width-toggle', '#settings-section-nodeqa',
      '#settings-rail .settings-rail-btn[data-cat="toolbar"]', '#settings-rail .settings-rail-btn[data-cat="panels"]',
      '#datetime-format-select', '#global-search-bar-toggle', '#todos-cap-select', '#preview-branding-toggle', '#export-accent-toggle', '#ai-max-tokens-select',
      '#account-greeting-name-input', '#settings-section-quickassist']) {
      await expect(page.locator(gone), gone).toHaveCount(0);
    }
    for (const kept of ['#theme-segmented', '#accent-swatch-row', '#editor-scale', '#default-author-input',
      '#todos-expiry-select', '#trash-retention-select', '#cover-page-toggle', '#preview-branding-text-input', '#auto-rewrite-toggle',
      '#ai-provider-select', '#ai-prompt-input', '#shortcuts-open-modal-btn', '#sb-export-all-btn', '#vault-setup-btn', '#open-feedback-modal-btn']) {
      await expect(page.locator(kept), kept).toHaveCount(1);
    }
    // Five rails; Account joins them only while signed in (Admin lives inside it).
    await expect(page.locator('#settings-rail .settings-rail-btn span')).toHaveText(['General', 'Documents', 'Data & backup', 'AI', 'Account', 'About']);
    await expect(page.locator('#settings-rail-account-btn')).toBeHidden();
    await expect(page.locator('#settings-rail-admin-btn, #profile-visibility-segmented, #settings-section-account')).toHaveCount(0);
    // General = Appearance, To-Dos, Keyboard Shortcuts; Documents = New documents, PDF, Trash.
    // @ts-expect-error -- bare global from index.html
    await page.evaluate(() => { document.getElementById('settings-toggle')!.click(); applySettingsCategory('general'); });
    const titles = () => page.locator('#settings-content .settings-section:visible > .settings-section-title').allTextContents();
    expect(await titles()).toEqual(['Appearance', 'To-Dos', 'Keyboard Shortcuts']);
    await page.locator('#settings-rail .settings-rail-btn[data-cat="documents"]').click();
    expect(await titles()).toEqual(['New documents', 'PDF', 'Trash']);
    await page.locator('#settings-rail .settings-rail-btn[data-cat="about"]').click();
    expect(await titles()).toEqual(expect.arrayContaining(['About', 'Privacy & data', 'Support', 'Feedback & Crash Reports']));
    // AI Capabilities now lives in the AI category, in its own always-visible section.
    await expect(page.locator('#settings-section-ai-capabilities[data-cat="ai"] #feat-ai-toggle')).toHaveCount(1);
  });

  test('Insert ▾ items run the same action as the right-click menu (Add comment opens the selected node\'s reply box)', async ({ page }) => {
    await open(page);
    await seedDoc(page);
    await page.locator('.node-row[data-id="1"]').click();
    await page.locator('#qb-insert').dispatchEvent('click');
    await page.locator('#insert-menu [data-insert-action="remark"]').dispatchEvent('click');
    await expect(page.locator('#insert-menu')).toHaveCount(0);
    await expect(page.locator('.thread-composer-input[data-node-id="1"]')).toBeFocused();
  });

  test('turning AI Capabilities off from Settings → AI hides the AI entry points but keeps its own switch', async ({ page }) => {
    await open(page);
    await page.evaluate(() => {
      document.getElementById('settings-toggle')!.click();
      (document.querySelector('.settings-rail-btn[data-cat="ai"]') as HTMLElement).click();
    });
    await page.locator('#feat-ai-toggle').click();
    await expect(page.locator('body')).toHaveClass(/feature-off-ai/);
    await expect(page.locator('#feat-ai-toggle')).toBeVisible();
    await expect(page.locator('#settings-section-ai-rewrite')).toBeHidden();
    await page.locator('#feat-ai-toggle').click();
    await expect(page.locator('body')).not.toHaveClass(/feature-off-ai/);
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
  test('hides the top line and File Explorer, and restores them on exit', async ({ page }) => {
    await open(page);
    await seedDoc(page);
    // @ts-expect-error -- bare globals from index.html
    await page.evaluate(() => setZenMode(true));
    await expect(page.locator('#quick-bar')).toBeHidden();
    await expect(page.locator('#doc-tab-strip-row')).toBeHidden();
    // @ts-expect-error
    expect(await page.evaluate(() => sidebarOpen)).toBe(false);
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
  dateTimeFormat: 'iso', globalSearchVisible: false, exportUseAccentColor: false, aiMaxTokens: 4096, greetingDisplayName: 'Rob',
  previewBrandingEnabled: true, previewBrandingText: '',
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
    // The top line (Share) and the rail show whatever the old hidden lists said.
    await expect(page.locator('#doc-share-chip')).toBeVisible();
    await expect(page.locator('#doc-history-chip')).toBeHidden();
    await expect(page.locator('#editor-zen-toggle')).toBeVisible();
    await expect(page.locator('#doc-tab-strip-row')).toBeVisible();
    for (const id of ['#rail-docs-btn', '#dock-panel-appbar-toggle', '#rail-settings-btn']) await expect(page.locator(id), id).toBeVisible();
    // Right-click menu fixed.
    await page.locator('.node-row[data-id="1"]').click({ button: 'right' });
    const quick = await page.evaluate(() => Array.from(document.querySelectorAll('#context-quickbar [data-action]')).map((b) => (b as HTMLElement).dataset.action));
    expect(quick).toEqual(['ai-rewrite', 'note', 'remark', 'diagram', 'table', 'image']);
    await page.locator('#context-more-toggle').click();
    await expect(page.locator('#context-menu :is(#context-more-panel, .sb-context-submenu) [data-action="sort-az"]')).toBeVisible();
    await page.keyboard.press('Escape');
    // Tagging / Quick Assist / Quick Insert are always on.
    // Tags… is in the full list ("/tag" finds it; owner 2026-10-29 shortened the unfiltered one).
    // @ts-expect-error -- bare global from index.html
    expect(await page.evaluate(() => insertMenuItems(true).some((it: { id?: string }) => it.id === 'qb-tags'))).toBe(true);
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
    for (const k of ['capMax', 'featureEnabled', 'rowActionsMode', 'showOverdueBadge', 'subtasksCollapsedByDefault', 'completedCollapsedByDefault', 'hiddenElements']) expect(todo, k).not.toHaveProperty(k);
    expect(errors).toEqual([]);
  });
});
