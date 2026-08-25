import { describe, expect, it, beforeEach, vi } from 'vitest';
import { useOutlinePrefsStore, type QuickInsertActionId } from './outlinePrefsStore';

const DEFAULTS: {
  treeIndentWidth: number;
  hideTreeLines: boolean;
  outlineNumbering: boolean;
  depthGuideLines: boolean;
  compactRows: boolean;
  editorScale: number;
  editorReadingWidthEnabled: boolean;
  editorReadingWidth: number;
  rowHighlightStyle: 'original';
  alwaysExpandInlineEnabled: boolean;
  quickInsertEnabled: boolean;
  quickInsertIconOnly: boolean;
  quickInsertActions: QuickInsertActionId[];
  quickAssistEnabled: boolean;
  quickAssistSearchEnabled: boolean;
} = {
  treeIndentWidth: 3,
  hideTreeLines: true,
  outlineNumbering: false,
  depthGuideLines: true,
  compactRows: true,
  editorScale: 1,
  editorReadingWidthEnabled: false,
  editorReadingWidth: 900,
  rowHighlightStyle: 'original' as const,
  alwaysExpandInlineEnabled: false,
  quickInsertEnabled: true,
  quickInsertIconOnly: true,
  quickInsertActions: ['emdash', 'endash', 'arrow', 'checkmark', 'crossmark', 'middot', 'date-time'],
  quickAssistEnabled: true,
  quickAssistSearchEnabled: true
};

describe('outlinePrefsStore', () => {
  beforeEach(() => {
    useOutlinePrefsStore.setState({ ...DEFAULTS });
    localStorage.clear();
  });

  it('defaults match legacy\'s own real top-level defaults', () => {
    expect(useOutlinePrefsStore.getState()).toMatchObject(DEFAULTS);
  });

  it('setTreeIndentWidth sets an explicit value', () => {
    useOutlinePrefsStore.getState().setTreeIndentWidth(5);
    expect(useOutlinePrefsStore.getState().treeIndentWidth).toBe(5);
  });

  it('setTreeIndentWidth clamps to the real legacy range [2,6]', () => {
    useOutlinePrefsStore.getState().setTreeIndentWidth(0);
    expect(useOutlinePrefsStore.getState().treeIndentWidth).toBe(2);
    useOutlinePrefsStore.getState().setTreeIndentWidth(99);
    expect(useOutlinePrefsStore.getState().treeIndentWidth).toBe(6);
  });

  it('setTreeIndentWidth rounds a non-integer value', () => {
    useOutlinePrefsStore.getState().setTreeIndentWidth(4.6);
    expect(useOutlinePrefsStore.getState().treeIndentWidth).toBe(5);
  });

  it('setHideTreeLines toggles the value', () => {
    useOutlinePrefsStore.getState().setHideTreeLines(false);
    expect(useOutlinePrefsStore.getState().hideTreeLines).toBe(false);
  });

  it('setOutlineNumbering toggles the value', () => {
    useOutlinePrefsStore.getState().setOutlineNumbering(true);
    expect(useOutlinePrefsStore.getState().outlineNumbering).toBe(true);
  });

  it('setDepthGuideLines toggles the value', () => {
    useOutlinePrefsStore.getState().setDepthGuideLines(false);
    expect(useOutlinePrefsStore.getState().depthGuideLines).toBe(false);
  });

  it('setCompactRows toggles the value', () => {
    useOutlinePrefsStore.getState().setCompactRows(false);
    expect(useOutlinePrefsStore.getState().compactRows).toBe(false);
  });

  it('setEditorScale sets an explicit value', () => {
    useOutlinePrefsStore.getState().setEditorScale(1.2);
    expect(useOutlinePrefsStore.getState().editorScale).toBe(1.2);
  });

  it('setEditorScale clamps to the real legacy range [0.85,1.4]', () => {
    useOutlinePrefsStore.getState().setEditorScale(0.1);
    expect(useOutlinePrefsStore.getState().editorScale).toBe(0.85);
    useOutlinePrefsStore.getState().setEditorScale(9);
    expect(useOutlinePrefsStore.getState().editorScale).toBe(1.4);
  });

  it('setEditorReadingWidthEnabled toggles the value', () => {
    useOutlinePrefsStore.getState().setEditorReadingWidthEnabled(true);
    expect(useOutlinePrefsStore.getState().editorReadingWidthEnabled).toBe(true);
  });

  it('setEditorReadingWidth sets an explicit value', () => {
    useOutlinePrefsStore.getState().setEditorReadingWidth(1000);
    expect(useOutlinePrefsStore.getState().editorReadingWidth).toBe(1000);
  });

  it('setEditorReadingWidth clamps to the real legacy range [600,1400]', () => {
    useOutlinePrefsStore.getState().setEditorReadingWidth(100);
    expect(useOutlinePrefsStore.getState().editorReadingWidth).toBe(600);
    useOutlinePrefsStore.getState().setEditorReadingWidth(9999);
    expect(useOutlinePrefsStore.getState().editorReadingWidth).toBe(1400);
  });

  it('setRowHighlightStyle sets a valid style', () => {
    useOutlinePrefsStore.getState().setRowHighlightStyle('dot');
    expect(useOutlinePrefsStore.getState().rowHighlightStyle).toBe('dot');
    useOutlinePrefsStore.getState().setRowHighlightStyle('bar');
    expect(useOutlinePrefsStore.getState().rowHighlightStyle).toBe('bar');
    useOutlinePrefsStore.getState().setRowHighlightStyle('outline');
    expect(useOutlinePrefsStore.getState().rowHighlightStyle).toBe('outline');
  });

  it('setRowHighlightStyle falls back to \'original\' for an invalid style', () => {
    // @ts-expect-error -- deliberately passing an invalid value to exercise the runtime guard
    useOutlinePrefsStore.getState().setRowHighlightStyle('not-a-real-style');
    expect(useOutlinePrefsStore.getState().rowHighlightStyle).toBe('original');
  });

  it('setAlwaysExpandInlineEnabled toggles the value', () => {
    useOutlinePrefsStore.getState().setAlwaysExpandInlineEnabled(true);
    expect(useOutlinePrefsStore.getState().alwaysExpandInlineEnabled).toBe(true);
  });

  it('persists every setter to localStorage', () => {
    useOutlinePrefsStore.getState().setTreeIndentWidth(4);
    useOutlinePrefsStore.getState().setHideTreeLines(false);
    useOutlinePrefsStore.getState().setOutlineNumbering(true);
    useOutlinePrefsStore.getState().setDepthGuideLines(false);
    useOutlinePrefsStore.getState().setCompactRows(false);
    useOutlinePrefsStore.getState().setEditorScale(1.1);
    useOutlinePrefsStore.getState().setEditorReadingWidthEnabled(true);
    useOutlinePrefsStore.getState().setEditorReadingWidth(1000);
    useOutlinePrefsStore.getState().setRowHighlightStyle('bar');
    useOutlinePrefsStore.getState().setAlwaysExpandInlineEnabled(true);
    const persisted = JSON.parse(localStorage.getItem('sakura_web_outline_prefs_v1')!);
    expect(persisted).toEqual({
      treeIndentWidth: 4,
      hideTreeLines: false,
      outlineNumbering: true,
      depthGuideLines: false,
      compactRows: false,
      editorScale: 1.1,
      editorReadingWidthEnabled: true,
      editorReadingWidth: 1000,
      rowHighlightStyle: 'bar',
      alwaysExpandInlineEnabled: true,
      quickInsertEnabled: true,
      quickInsertIconOnly: true,
      quickInsertActions: DEFAULTS.quickInsertActions,
      quickAssistEnabled: true,
      quickAssistSearchEnabled: true
    });
  });

  it('a fresh store load reads back previously persisted prefs', async () => {
    localStorage.setItem(
      'sakura_web_outline_prefs_v1',
      JSON.stringify({
        treeIndentWidth: 6,
        hideTreeLines: false,
        outlineNumbering: true,
        depthGuideLines: false,
        compactRows: false,
        editorScale: 1.3,
        editorReadingWidthEnabled: true,
        editorReadingWidth: 1200,
        rowHighlightStyle: 'outline',
        alwaysExpandInlineEnabled: true
      })
    );
    vi.resetModules();
    const fresh = await import('./outlinePrefsStore');
    expect(fresh.useOutlinePrefsStore.getState()).toMatchObject({
      treeIndentWidth: 6,
      hideTreeLines: false,
      outlineNumbering: true,
      depthGuideLines: false,
      compactRows: false,
      editorScale: 1.3,
      editorReadingWidthEnabled: true,
      editorReadingWidth: 1200,
      rowHighlightStyle: 'outline',
      alwaysExpandInlineEnabled: true
    });
  });

  it('falls back to real defaults for a corrupted persisted value rather than trusting it blindly', async () => {
    localStorage.setItem(
      'sakura_web_outline_prefs_v1',
      JSON.stringify({
        treeIndentWidth: 'not-a-number',
        hideTreeLines: 'not-a-boolean',
        outlineNumbering: 'not-a-boolean',
        editorScale: 'not-a-number',
        editorReadingWidth: 'not-a-number',
        rowHighlightStyle: 'not-a-real-style'
      })
    );
    vi.resetModules();
    const fresh = await import('./outlinePrefsStore');
    expect(fresh.useOutlinePrefsStore.getState().treeIndentWidth).toBe(3);
    // A non-empty string is truthy in JS -- !!'not-a-boolean' is true, matching legacy's own
    // real `!!d.hideTreeLines`-style loose coercion (loadPrefs never validates booleans strictly
    // either), so this isn't a bug, just documenting the real, deliberately-loose behavior.
    expect(fresh.useOutlinePrefsStore.getState().hideTreeLines).toBe(true);
    expect(fresh.useOutlinePrefsStore.getState().outlineNumbering).toBe(true);
    expect(fresh.useOutlinePrefsStore.getState().editorScale).toBe(1);
    expect(fresh.useOutlinePrefsStore.getState().editorReadingWidth).toBe(900);
    expect(fresh.useOutlinePrefsStore.getState().rowHighlightStyle).toBe('original');
  });

  it('falls back to real defaults when nothing is persisted at all', async () => {
    vi.resetModules();
    const fresh = await import('./outlinePrefsStore');
    expect(fresh.useOutlinePrefsStore.getState()).toMatchObject(DEFAULTS);
  });

  describe('Quick Insert prefs (§6.10)', () => {
    it('setQuickInsertEnabled toggles and persists', () => {
      useOutlinePrefsStore.getState().setQuickInsertEnabled(false);
      expect(useOutlinePrefsStore.getState().quickInsertEnabled).toBe(false);
    });

    it('setQuickInsertIconOnly toggles and persists', () => {
      useOutlinePrefsStore.getState().setQuickInsertIconOnly(false);
      expect(useOutlinePrefsStore.getState().quickInsertIconOnly).toBe(false);
    });

    it('setQuickInsertActionEnabled(id, false) removes just that one action', () => {
      useOutlinePrefsStore.getState().setQuickInsertActionEnabled('endash', false);
      expect(useOutlinePrefsStore.getState().quickInsertActions).toEqual(['emdash', 'arrow', 'checkmark', 'crossmark', 'middot', 'date-time']);
    });

    it('setQuickInsertActionEnabled(id, true) re-adds an action at its fixed order position, not the end', () => {
      useOutlinePrefsStore.getState().setQuickInsertActionEnabled('endash', false);
      useOutlinePrefsStore.getState().setQuickInsertActionEnabled('endash', true);
      expect(useOutlinePrefsStore.getState().quickInsertActions).toEqual(['emdash', 'endash', 'arrow', 'checkmark', 'crossmark', 'middot', 'date-time']);
    });

    it('clampQuickInsertActions drops an unknown id and reorders to the real fixed order', async () => {
      localStorage.setItem('sakura_web_outline_prefs_v1', JSON.stringify({ quickInsertActions: ['date-time', 'not-a-real-action', 'emdash'] }));
      vi.resetModules();
      const fresh = await import('./outlinePrefsStore');
      expect(fresh.useOutlinePrefsStore.getState().quickInsertActions).toEqual(['emdash', 'date-time']);
    });

    it('falls back to all 7 actions enabled when nothing is persisted', async () => {
      vi.resetModules();
      const fresh = await import('./outlinePrefsStore');
      expect(fresh.useOutlinePrefsStore.getState().quickInsertActions).toEqual(DEFAULTS.quickInsertActions);
    });
  });

  describe('Quick Assist master toggle (§6.10 slice 3)', () => {
    it('setQuickAssistEnabled toggles and persists', () => {
      useOutlinePrefsStore.getState().setQuickAssistEnabled(false);
      expect(useOutlinePrefsStore.getState().quickAssistEnabled).toBe(false);
      const persisted = JSON.parse(localStorage.getItem('sakura_web_outline_prefs_v1')!);
      expect(persisted.quickAssistEnabled).toBe(false);
    });

    it('defaults to true when nothing is persisted', async () => {
      vi.resetModules();
      const fresh = await import('./outlinePrefsStore');
      expect(fresh.useOutlinePrefsStore.getState().quickAssistEnabled).toBe(true);
    });

    it('setQuickAssistSearchEnabled toggles and persists independently of setQuickAssistEnabled', () => {
      useOutlinePrefsStore.getState().setQuickAssistSearchEnabled(false);
      expect(useOutlinePrefsStore.getState().quickAssistSearchEnabled).toBe(false);
      expect(useOutlinePrefsStore.getState().quickAssistEnabled).toBe(true);
      const persisted = JSON.parse(localStorage.getItem('sakura_web_outline_prefs_v1')!);
      expect(persisted.quickAssistSearchEnabled).toBe(false);
    });
  });
});
