import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

// Cutdown item 9b: presets and feature modes removed (Editor's Choice, Documentation mode, Zen's
// three preset buttons, Features Go Minimal / Restore Full), accent list trimmed to six and chrome
// presets dropped; export settings fixed (exports and copy always include folded sections, Q&A,
// notes, remarks); Zen's "Hide status bar" / "Hide app bar" / "Use browser fullscreen" removed
// (the status bar and app bar are always visible, Zen always goes fullscreen); Preview settings
// folded into Export & copy; "Rewrite document", "Laser pointer" and "Slide divider" removed.
// These tests pin what's gone, the fixed behaviours, and that data saved by older builds loads
// harmlessly.

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

// A parent with a folded child, a note, a linked Q&A item and a linked remark.
async function seedRichDoc(page: import('@playwright/test').Page) {
  await page.evaluate(() => {
    // A fresh profile starts with no document open (landing/empty state) — create one to edit.
    // @ts-expect-error -- bare globals from index.html
    ensureDocumentForEditing();
    // @ts-expect-error
    nodes = [
      { id: 1, depth: 0, text: 'Folded parent', parentId: null, isCheckbox: false, checked: false, note: '<p>Parent note text</p>', tags: [], styles: {} },
      { id: 2, depth: 1, text: 'Hidden child', parentId: 1, isCheckbox: false, checked: false, note: '', tags: [], styles: {} },
      { id: 3, depth: 0, text: 'Second root', parentId: null, isCheckbox: false, checked: false, note: '', tags: [], styles: {} }
    ];
    // @ts-expect-error
    qaItems = [{ id: 'q1', question: 'Linked question text', answer: 'Linked answer text', sourceNodeId: 3 }];
    // @ts-expect-error
    remarks = [{ id: 'r1', anchorNodeId: 3, person: 'Jane Doe', text: 'Remark body text', date: '2024-01-01' }];
    // @ts-expect-error
    collapsedIds = new Set([1]); selectedId = null; multiSelectedIds = []; selectAllMode = false; focusedId = null; undoStack = []; editingId = null; nextId = 4;
    // @ts-expect-error
    render();
  });
}

async function openSettingsCategory(page: import('@playwright/test').Page, cat: string) {
  await page.evaluate((c) => {
    if (!document.getElementById('settings-panel')?.classList.contains('open')) document.getElementById('settings-toggle')?.click();
    // @ts-expect-error -- bare global from index.html
    applySettingsCategory(c);
  }, cat);
  await expect(page.locator('#settings-panel')).toHaveClass(/open/);
}

const REMOVED_IDS = [
  'editors-choice-preset-btn', 'editors-choice-undo-btn', 'doc-mode-preset-btn', 'doc-mode-undo-btn',
  'zen-preset-minimal-btn', 'zen-preset-writing-btn', 'zen-preset-fullscreen-btn', 'features-preset-btn', 'features-preset-label',
  'welcome-editors-choice-link', 'zen-hide-statusbar-toggle', 'zen-hide-appbar-toggle', 'zen-fullscreen-toggle',
  'statusbar-visible-toggle', 'appbar-visible-toggle', 'statusbar-visible-row', 'appbar-visible-row',
  'skip-folded-exports-toggle', 'qa-export-toggle', 'node-content-export-toggle', 'remarks-export-toggle',
  'export-menu-fold-note-enabled-toggle', 'export-menu-fold-note', 'preview-export-field', 'app-laser-dot',
  'ctxq-slide-divider', 'ctxq-ai-rewrite-all', 'chrome-swatch-row', 'accent-swatch-custom', 'accent-intensity-slider'
];

const REMOVED_GLOBALS = [
  'applyEditorsChoicePreset', 'applyEditorsChoicePresetWithUndo', 'applyDocModePreset', 'applyDocModePresetWithUndo', 'applyZenPreset',
  'isMinimalMode', 'setZenHideAppbar', 'setZenHideStatusbar', 'setZenUseFullscreen', 'setStatusbarVisible', 'setAppbarVisible',
  'revealStatusbar', 'zenRevealAppbar', 'zenDockQaInStatusbar', 'setSkipFoldedInExports', 'setExportMenuFoldNoteEnabled',
  'updateExportMenuFoldNote', 'applyFoldFilter', 'setQaExportEnabled', 'setNodeContentExportEnabled', 'setRemarksExportEnabled',
  'setPreviewSlideDepth', 'setPreviewPdfMargin', 'setPreviewPdfFooterEnabled', 'setPreviewAlwaysExpand', 'setPreviewTocMaxLevel',
  'setPreviewHeadingFallback', 'rewriteAllNodes', 'setAppLaser', 'toggleSlideDivider', 'requestDiagramGenGuideline',
  'diagramGenValidateGuideline', 'callAiApiWithPrompt', 'setChromePreset', 'applyChromeColors', 'setAccentIntensity', 'setAccentCustomColor'
];

const KEPT_GLOBALS = [
  'setZenMode', 'exportPdfDirect', 'exportPreviewAsPdf', 'renderPreviewBody', 'exportOpml', 'serializeOpml', 'copyNodesToClipboard',
  'setTheme', 'setEditorScale', 'generateOutlineWithAi', 'rewriteMultipleNodes', 'rewriteSubTextSelection', 'setAutoRewriteEnabled',
  'setPreviewBrandingText', 'setCoverPageEnabled', 'setAccentPreset'
  // (setPreviewBrandingEnabled and setExportUseAccentColor went with their switches: one PDF mark field,
  // exports always use the accent.)
  // (setZenHideToolbar/-Sidebar/-Tabbar and setTabbarVisible were removed later, in item 14 —
  // Zen always hides those, and the tab bar is always on.)
];

test.describe('cutdown 9b: presets, dead settings, and leftovers removed', () => {
  test('removed Settings rows, sections, presets and globals are gone; kept ones remain', async ({ page }) => {
    const errors = trackErrors(page);
    await page.goto('file://' + indexPath);
    await dismissOverlays(page);

    for (const id of REMOVED_IDS) await expect(page.locator('#' + id), id).toHaveCount(0);
    await expect(page.locator('.settings-rail-btn[data-cat="presets"], .settings-section[data-cat="presets"], .help-section[data-cat="presets"]')).toHaveCount(0);

    const globals = await page.evaluate(({ removed, kept }) => ({
      removedPresent: removed.filter((n: string) => typeof (window as unknown as Record<string, unknown>)[n] !== 'undefined'),
      keptMissing: kept.filter((n: string) => typeof (window as unknown as Record<string, unknown>)[n] !== 'function')
    }), { removed: REMOVED_GLOBALS, kept: KEPT_GLOBALS });
    expect(globals.removedPresent).toEqual([]);
    expect(globals.keptMissing).toEqual([]);

    const panelText = (await page.locator('#settings-panel').textContent()) || '';
    for (const gone of ["Editor's choice", 'Documentation mode', 'Go Minimal', 'Restore Full', 'Presentation', 'Presets', 'Skip folded sections',
      'Include Q&A in exports', 'Include node Notes', 'Include Remarks in exports', 'Folded-content notice', 'Hide status bar', 'Hide app bar',
      'Use browser fullscreen', 'Slide divider', 'Rewrite document', 'Preview']) {
      expect(panelText, gone).not.toContain(gone);
    }
    const sectionTitles = await page.locator('#settings-panel .settings-section-title').allTextContents();
    expect(sectionTitles).not.toContain('Preview');
    expect(sectionTitles).not.toContain('Presets');
    // Zen mode's last three hide-on-entry options were removed later (item 14) — Zen always hides
    // the toolbar, File Explorer and tab bar — so its Settings section is gone entirely.
    expect(sectionTitles).not.toContain('Zen mode');
    await expect(page.locator('#settings-section-zen')).toHaveCount(0);

    // Documents → PDF: Cover page, Open items page, PDF mark — and nothing else.
    await openSettingsCategory(page, 'documents');
    const pdfSection = page.locator('#settings-panel .settings-section[data-cat="documents"]').filter({ has: page.locator('.settings-section-title', { hasText: /^PDF$/ }) });
    const rows = pdfSection.locator('.settings-list-row .settings-switch-text');
    expect(await rows.allTextContents()).toEqual(['Cover page', 'Open items page', 'PDF mark']);
    // The mark defaults to SAKURA; blank means no mark.
    await expect(page.locator('#preview-branding-text-input')).toHaveValue('SAKURA');

    // Six accent swatches, the default (terracotta) first; no chrome or custom swatches.
    const accents = await page.locator('#accent-swatch-row .accent-swatch').evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.accent));
    expect(accents).toEqual(['terracotta', 'teal', 'indigo', 'violet', 'moss', 'amber']);

    // The whole Features section (and so its old empty "Presentation" heading) was removed later,
    // in item 14; AI Capabilities moved to Settings → AI.
    await expect(page.locator('#settings-section-features')).toHaveCount(0);
    await expect(page.locator('#settings-section-ai-capabilities #feat-ai-toggle')).toHaveCount(1);

    // Quick Assist has no preset or Rewrite document run actions, and no app bar shortcut remains.
    const qa = await page.evaluate(() => ({
      // @ts-expect-error -- bare globals from index.html
      actions: QA_ACTIONS.map((a) => a.id),
      // @ts-expect-error
      toggleAppbar: !!SHORTCUTS.toggleAppbar
    }));
    expect(qa.actions).toEqual(['new-document', 'duplicate-node', 'ai-rewrite-node', 'ai-generate-outline']);
    expect(qa.toggleAppbar).toBe(false);
    expect(errors).toEqual([]);
  });

  test('right-click node menu + More: no Laser pointer, Rewrite document or Slide divider; Rewrite row stays', async ({ page }) => {
    const errors = trackErrors(page);
    await page.goto('file://' + indexPath);
    await dismissOverlays(page);
    await seedRichDoc(page);
    // The menu is fixed (item 14): "More" always lists every action the quick row has no room for.
    await page.locator('.node-row[data-id="3"]').click({ button: 'right' });
    await expect(page.locator('#context-menu')).toBeVisible();
    await page.locator('#context-more-toggle').click();
    await expect(page.locator('#context-more-panel')).toBeVisible();
    const menuText = await page.locator('#context-menu').evaluate((m) => (m as HTMLElement).innerText + ' ' + [...m.querySelectorAll('[data-tip],[aria-label]')].map((e) => (e.getAttribute('data-tip') || '') + ' ' + (e.getAttribute('aria-label') || '')).join(' '));
    expect(menuText).toMatch(/Rewrite row/);
    expect(menuText).not.toMatch(/Laser pointer|Rewrite document|Slide divider/i);
    await expect(page.locator('#context-menu [data-action="laser"], #context-menu [data-action="ai-rewrite-all"], #context-menu [data-action="slide-divider"]')).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test('Zen mode keeps the app bar visible, always requests browser fullscreen, and exits it', async ({ page }) => {
    const errors = trackErrors(page);
    await page.goto('file://' + indexPath);
    await dismissOverlays(page);
    await seedRichDoc(page);

    await page.evaluate(() => {
      const w = window as unknown as { __fs: { req: number; exit: number; el: Element | null } };
      w.__fs = { req: 0, exit: 0, el: null };
      document.documentElement.requestFullscreen = () => { w.__fs.req++; w.__fs.el = document.documentElement; return Promise.resolve(); };
      Object.defineProperty(document, 'fullscreenElement', { configurable: true, get: () => w.__fs.el });
      document.exitFullscreen = () => { w.__fs.exit++; w.__fs.el = null; return Promise.resolve(); };
      // @ts-expect-error -- bare global from index.html
      setZenMode(true);
    });
    await expect(page.locator('body')).toHaveClass(/zen-mode/);
    await expect(page.locator('#appbar')).toBeVisible();
    await expect(page.locator('#rail-settings-btn')).toBeVisible();
    expect(await page.evaluate(() => (window as unknown as { __fs: { req: number } }).__fs.req)).toBe(1);

    await page.evaluate(() => {
      // @ts-expect-error -- bare global from index.html
      setZenMode(false);
    });
    await expect(page.locator('body')).not.toHaveClass(/zen-mode/);
    expect(await page.evaluate(() => (window as unknown as { __fs: { exit: number } }).__fs.exit)).toBe(1);
    await expect(page.locator('#appbar')).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('PDF, OPML and Ctrl/Cmd+C copy always include folded sections, notes, Q&A and remarks; no folded notice in Export menu', async ({ page }) => {
    const errors = trackErrors(page);
    await page.goto('file://' + indexPath);
    await dismissOverlays(page);
    await seedRichDoc(page);
    // The folded child really is hidden in the editor.
    await expect(page.locator('.node-row[data-id="2"]')).toHaveCount(0);

    // Export menu: still exactly PDF and OPML, and no folded-content notice despite a folded node.
    await page.evaluate(() => document.getElementById('export-toggle')?.click());
    await expect(page.locator('#export-menu')).toBeVisible();
    await expect(page.locator('#export-menu')).not.toContainText(/folded/i);
    await page.keyboard.press('Escape');

    // PDF: render headlessly, with print() stubbed.
    await page.evaluate(() => {
      window.print = () => {};
      // @ts-expect-error -- bare global from index.html
      exportPdfDirect();
    });
    const pdfText = (await page.locator('#preview-body').textContent()) || '';
    for (const s of ['Folded parent', 'Hidden child', 'Parent note text', 'Linked question text', 'Linked answer text', 'Remark body text']) {
      expect(pdfText, s).toContain(s);
    }
    await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));

    // OPML and copy (scoped to the folded parent, the way Ctrl/Cmd+C on a selection is).
    const out = await page.evaluate(() => {
      // @ts-expect-error -- bare globals from index.html
      const opml = serializeOpml(getScopedNodes(true));
      // @ts-expect-error
      selectedId = 1; multiSelectedIds = [];
      // @ts-expect-error
      const copied = getScopedNodes(false).map((n) => n.text);
      return { opml, copied };
    });
    expect(out.opml).toContain('Hidden child');
    expect(out.opml).toContain('_note="Parent note text"');
    expect(out.copied).toEqual(['Folded parent', 'Hidden child']);
    expect(errors).toEqual([]);
  });

  test('prefs, shortcuts and a slide-divider document saved by older builds load harmlessly; removed keys drop on next save', async ({ page }) => {
    const errors = trackErrors(page);
    await page.addInitScript(() => {
      if (sessionStorage.getItem('seeded9b')) return;
      sessionStorage.setItem('seeded9b', '1');
      localStorage.setItem('sakura_v001_prefs', JSON.stringify({
        // Removed in 9b — each must load harmlessly and be dropped on the next save.
        statusbarVisible: false, appbarVisible: false, zenHideStatusbar: true, zenHideAppbar: true, zenUseFullscreen: false,
        skipFoldedInExports: true, exportMenuFoldNoteEnabled: true, qaExportEnabled: false, nodeContentExportEnabled: false, remarksExportEnabled: false,
        previewSlideDepth: 2, previewPdfMargin: 'wide', previewPdfFooterEnabled: false, previewAlwaysExpand: false, previewTocOpen: false,
        previewHeadingDepthFallback: { 0: 1, 1: 2 }, previewTocMaxLevel: 6, noteHiddenButtons: ['ai-summarise'],
        chromePreset: 'ink', accentIntensity: 40, accentCustomColor: '#123456',
        accentPreset: 'plum',
        // Menu customizations (with entries removed in 9b) — the customizations themselves were
        // removed in item 14, so these are simply ignored.
        contextQuickActions: ['slide-divider', 'ai-rewrite-all', 'ai-rewrite', 'note'],
        hoverToolbarActions: ['child', 'slide-divider'],
        // Kept — must still apply.
        previewBrandingEnabled: false, previewBrandingText: 'Acme'
      }));
      localStorage.setItem('sakura-shortcut-overrides', JSON.stringify({ toggleAppbar: 'mod+alt+a' }));
      localStorage.setItem('sakura_editors_choice_undo_v1', JSON.stringify({ toolbarVisible: true }));
      localStorage.setItem('sakura_doc_mode_undo_v1', JSON.stringify({ toolbarVisible: true }));
      // A document from an older build with a Slide divider node — written straight into storage
      // before the first load (no write-then-reload).
      const docId = 'legacy9bdoc';
      localStorage.setItem('sakura_doc_v1_' + docId, JSON.stringify({
        nodes: [
          { id: 1, depth: 0, text: 'Intro', parentId: null, isCheckbox: false, checked: false, note: '', tags: [], styles: {}, slideDivider: false },
          { id: 2, depth: 0, text: 'Old divider node', parentId: null, isCheckbox: false, checked: false, note: '', tags: [], styles: {}, slideDivider: true },
          { id: 3, depth: 1, text: 'Under the divider', parentId: 2, isCheckbox: false, checked: false, note: '', tags: [], styles: {}, slideDivider: false }
        ],
        nextId: 4, selectedId: null, multiSelectedIds: [], selectionAnchorId: null, collapsed: [], title: 'Legacy dividers', author: ''
      }));
      localStorage.setItem('sakura_docs_index_v1', JSON.stringify([{ id: docId, title: 'Legacy dividers', updatedAt: Date.now() }]));
      localStorage.setItem('sakura_current_doc_v1', docId);
      localStorage.setItem('sakura_open_tabs_v1', JSON.stringify({ tabs: [docId], pinned: [], active: docId }));
    });
    await page.goto('file://' + indexPath);
    await dismissOverlays(page);
    await expect(page.locator('.node-row')).toHaveCount(3, { timeout: 15000 });

    // The old divider node is an ordinary row (no badge) and the old hidden-bar prefs don't hide anything.
    await expect(page.locator('.node-slide-divider-badge')).toHaveCount(0);
    await expect(page.locator('#appbar')).toBeVisible();

    const state = await page.evaluate(() => {
      // @ts-expect-error -- bare globals from index.html
      const overrideInMemory = shortcutOverrides.toggleAppbar;
      // @ts-expect-error
      savePrefs(); saveShortcutOverrides();
      const prefs = JSON.parse(localStorage.getItem('sakura_v001_prefs') || '{}');
      return {
        prefs,
        overrideInMemory,
        overrides: JSON.parse(localStorage.getItem('sakura-shortcut-overrides') || '{}'),
        menuGlobals: ['contextQuickActions', 'hoverToolbarActions'].filter((n) => typeof (window as unknown as Record<string, unknown>)[n] !== 'undefined'),
        // @ts-expect-error
        accent: accentPreset,
        accentVar: getComputedStyle(document.body).getPropertyValue('--accent').trim(),
        inlineBg: document.body.style.getPropertyValue('--bg'),
        // @ts-expect-error
        branding: [previewBrandingText, prefs.pdfMark],
        // @ts-expect-error
        dividerFlags: nodes.map((n) => n.slideDivider)
      };
    });
    for (const k of ['statusbarVisible', 'appbarVisible', 'zenHideStatusbar', 'zenHideAppbar', 'zenUseFullscreen', 'skipFoldedInExports',
      'exportMenuFoldNoteEnabled', 'qaExportEnabled', 'nodeContentExportEnabled', 'remarksExportEnabled', 'previewSlideDepth', 'previewPdfMargin',
      'previewPdfFooterEnabled', 'previewAlwaysExpand', 'previewTocOpen', 'previewHeadingDepthFallback', 'previewTocMaxLevel', 'noteHiddenButtons',
      'chromePreset', 'accentIntensity', 'accentCustomColor', 'contextQuickActions', 'hoverToolbarActions']) {
      expect(state.prefs, k).not.toHaveProperty(k);
    }
    expect(state.menuGlobals).toEqual([]);
    // 'plum' is no longer offered — falls back to the default accent; no chrome preset applies.
    expect(state.accent).toBe('terracotta');
    expect(state.prefs.accentPreset).toBe('terracotta');
    expect(state.accentVar).toBe('#c2553d');
    expect(state.inlineBg).toBe('');
    // Branding was off, so the old prefs migrate to no mark.
    expect(state.branding).toEqual(['', '']);
    expect(state.overrideInMemory).toBeUndefined();
    expect(state.overrides.toggleAppbar).toBeUndefined();
    // The stray slideDivider flag isn't carried on loaded nodes.
    expect(state.dividerFlags).toEqual([undefined, undefined, undefined]);

    // PDF: the old divider renders as an ordinary node — no divider heading, no extra Contents
    // entry, nothing split out.
    await page.evaluate(() => {
      window.print = () => {};
      // @ts-expect-error -- bare global from index.html
      exportPdfDirect();
    });
    await expect(page.locator('#preview-body .pv-divider-row, #preview-body .pv-slide')).toHaveCount(0);
    const pdfText = (await page.locator('#preview-body').textContent()) || '';
    expect(pdfText).toContain('Old divider node');
    expect(pdfText).toContain('Under the divider');
    await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
    expect(errors).toEqual([]);
  });
});
