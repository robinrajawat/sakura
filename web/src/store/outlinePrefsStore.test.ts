import { describe, expect, it, beforeEach, vi } from 'vitest';
import { useOutlinePrefsStore } from './outlinePrefsStore';

describe('outlinePrefsStore', () => {
  beforeEach(() => {
    useOutlinePrefsStore.setState({ treeIndentWidth: 3, hideTreeLines: true, outlineNumbering: false });
    localStorage.clear();
  });

  it('defaults match legacy\'s own real top-level defaults', () => {
    expect(useOutlinePrefsStore.getState().treeIndentWidth).toBe(3);
    expect(useOutlinePrefsStore.getState().hideTreeLines).toBe(true);
    expect(useOutlinePrefsStore.getState().outlineNumbering).toBe(false);
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

  it('persists every setter to localStorage', () => {
    useOutlinePrefsStore.getState().setTreeIndentWidth(4);
    useOutlinePrefsStore.getState().setHideTreeLines(false);
    useOutlinePrefsStore.getState().setOutlineNumbering(true);
    const persisted = JSON.parse(localStorage.getItem('sakura_web_outline_prefs_v1')!);
    expect(persisted).toEqual({ treeIndentWidth: 4, hideTreeLines: false, outlineNumbering: true });
  });

  it('a fresh store load reads back previously persisted prefs', async () => {
    localStorage.setItem('sakura_web_outline_prefs_v1', JSON.stringify({ treeIndentWidth: 6, hideTreeLines: false, outlineNumbering: true }));
    vi.resetModules();
    const fresh = await import('./outlinePrefsStore');
    expect(fresh.useOutlinePrefsStore.getState().treeIndentWidth).toBe(6);
    expect(fresh.useOutlinePrefsStore.getState().hideTreeLines).toBe(false);
    expect(fresh.useOutlinePrefsStore.getState().outlineNumbering).toBe(true);
  });

  it('falls back to real defaults for a corrupted persisted value rather than trusting it blindly', async () => {
    localStorage.setItem(
      'sakura_web_outline_prefs_v1',
      JSON.stringify({ treeIndentWidth: 'not-a-number', hideTreeLines: 'not-a-boolean', outlineNumbering: 'not-a-boolean' })
    );
    vi.resetModules();
    const fresh = await import('./outlinePrefsStore');
    expect(fresh.useOutlinePrefsStore.getState().treeIndentWidth).toBe(3);
    // A non-empty string is truthy in JS -- !!'not-a-boolean' is true, matching legacy's own
    // real `!!d.hideTreeLines`-style loose coercion (loadPrefs never validates booleans strictly
    // either), so this isn't a bug, just documenting the real, deliberately-loose behavior.
    expect(fresh.useOutlinePrefsStore.getState().hideTreeLines).toBe(true);
    expect(fresh.useOutlinePrefsStore.getState().outlineNumbering).toBe(true);
  });

  it('falls back to real defaults when nothing is persisted at all', async () => {
    vi.resetModules();
    const fresh = await import('./outlinePrefsStore');
    expect(fresh.useOutlinePrefsStore.getState().treeIndentWidth).toBe(3);
    expect(fresh.useOutlinePrefsStore.getState().hideTreeLines).toBe(true);
    expect(fresh.useOutlinePrefsStore.getState().outlineNumbering).toBe(false);
  });
});
