import { describe, expect, it, beforeEach } from 'vitest';
import { useSidebarStore, SIDEBAR_MIN_WIDTH, SIDEBAR_MAX_WIDTH } from './sidebarStore';

describe('sidebarStore', () => {
  beforeEach(() => {
    localStorage.clear();
    useSidebarStore.setState({ width: 234, open: true, loaded: false });
  });

  it('defaults to width 234, open true', () => {
    const { width, open } = useSidebarStore.getState();
    expect(width).toBe(234);
    expect(open).toBe(true);
  });

  it('init() restores a previously persisted width and open state', () => {
    localStorage.setItem('sakura_web_sidebar_width_v1', '300');
    localStorage.setItem('sakura_web_sidebar_open_v1', 'false');
    useSidebarStore.getState().init();
    expect(useSidebarStore.getState().width).toBe(300);
    expect(useSidebarStore.getState().open).toBe(false);
  });

  it('init() is idempotent -- a second call does not re-read storage', () => {
    useSidebarStore.getState().init();
    localStorage.setItem('sakura_web_sidebar_width_v1', '999');
    useSidebarStore.getState().init();
    // Second init() is a no-op (loaded guard) -- width stays whatever it was after the first init.
    expect(useSidebarStore.getState().width).not.toBe(999);
  });

  it('setWidth clamps below SIDEBAR_MIN_WIDTH', () => {
    useSidebarStore.getState().setWidth(50);
    expect(useSidebarStore.getState().width).toBe(SIDEBAR_MIN_WIDTH);
  });

  it('setWidth clamps above SIDEBAR_MAX_WIDTH', () => {
    useSidebarStore.getState().setWidth(999);
    expect(useSidebarStore.getState().width).toBe(SIDEBAR_MAX_WIDTH);
  });

  it('setWidth does NOT persist to localStorage -- only commitWidth does', () => {
    useSidebarStore.getState().setWidth(300);
    expect(localStorage.getItem('sakura_web_sidebar_width_v1')).toBeNull();
    useSidebarStore.getState().commitWidth();
    expect(localStorage.getItem('sakura_web_sidebar_width_v1')).toBe('300');
  });

  it('toggleOpen flips open state and persists immediately', () => {
    useSidebarStore.getState().toggleOpen();
    expect(useSidebarStore.getState().open).toBe(false);
    expect(localStorage.getItem('sakura_web_sidebar_open_v1')).toBe('false');
    useSidebarStore.getState().toggleOpen();
    expect(useSidebarStore.getState().open).toBe(true);
    expect(localStorage.getItem('sakura_web_sidebar_open_v1')).toBe('true');
  });

  it('a fresh init() with no persisted value at all defaults to open (matching legacy)', () => {
    useSidebarStore.getState().init();
    expect(useSidebarStore.getState().open).toBe(true);
  });
});
