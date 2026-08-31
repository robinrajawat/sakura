import { describe, expect, it, beforeEach } from 'vitest';
import { usePadVisibilityStore, PAD_MIN_WIDTH, PAD_MAX_WIDTH } from './padVisibilityStore';

describe('padVisibilityStore', () => {
  beforeEach(() => {
    localStorage.clear();
    usePadVisibilityStore.setState({ padVisible: false, padWidth: 440 });
  });

  it('defaults padVisible to false and padWidth to 440, matching legacy', () => {
    const { padVisible, padWidth } = usePadVisibilityStore.getState();
    expect(padVisible).toBe(false);
    expect(padWidth).toBe(440);
  });

  it('setPadWidth clamps below PAD_MIN_WIDTH', () => {
    usePadVisibilityStore.getState().setPadWidth(50);
    expect(usePadVisibilityStore.getState().padWidth).toBe(PAD_MIN_WIDTH);
  });

  it('setPadWidth clamps above PAD_MAX_WIDTH', () => {
    usePadVisibilityStore.getState().setPadWidth(999);
    expect(usePadVisibilityStore.getState().padWidth).toBe(PAD_MAX_WIDTH);
  });

  it('setPadWidth does NOT persist to localStorage -- only commitPadWidth does', () => {
    usePadVisibilityStore.getState().setPadWidth(500);
    expect(localStorage.getItem('sakura_web_pad_width_v1')).toBeNull();
    usePadVisibilityStore.getState().commitPadWidth();
    expect(localStorage.getItem('sakura_web_pad_width_v1')).toBe('500');
  });

  it('togglePadVisible flips visibility and persists immediately', () => {
    usePadVisibilityStore.getState().togglePadVisible();
    expect(usePadVisibilityStore.getState().padVisible).toBe(true);
    expect(localStorage.getItem('sakura_web_pad_open')).toBe('true');
    usePadVisibilityStore.getState().togglePadVisible();
    expect(usePadVisibilityStore.getState().padVisible).toBe(false);
    expect(localStorage.getItem('sakura_web_pad_open')).toBe('false');
  });
});
