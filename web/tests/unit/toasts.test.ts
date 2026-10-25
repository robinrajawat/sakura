// @vitest-environment happy-dom
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';

// The app's toasts (src/ui/toasts.ts, moved from index.html 2026-10-25). The module registers its
// Ctrl/Cmd+Z listener when it loads, so its page globals go in first.
type Toasts = typeof import('../../src/ui/toasts');
let t: Toasts;
const toast = () => document.getElementById('toast') as HTMLElement;
const undoKey = () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true, cancelable: true }));

beforeAll(async () => {
  const g = globalThis as Record<string, unknown>;
  g.el = (id: string) => document.getElementById(id);
  g.matchesShortcut = (e: KeyboardEvent, action: string) => action === 'undo' && e.ctrlKey && e.key === 'z';
  t = await import('../../src/ui/toasts');
});
beforeEach(() => {
  vi.useFakeTimers();
  document.body.innerHTML = '<div id="toast"></div>';
});
afterEach(() => vi.useRealTimers());

describe('showToast', () => {
  it('shows the message as text and hides after 1.6s', () => {
    t.showToast('<b>Saved</b>');
    expect(toast().classList.contains('show')).toBe(true);
    expect(toast().textContent).toBe('<b>Saved</b>');
    expect(toast().querySelector('b')).toBeNull();
    vi.advanceTimersByTime(1599);
    expect(toast().classList.contains('show')).toBe(true);
    vi.advanceTimersByTime(1);
    expect(toast().classList.contains('show')).toBe(false);
  });

  it('a message mentioning undo stays TOAST_UNDO_MS; durationMs overrides', () => {
    t.showToast('Deleted — Undo with Ctrl+Z');
    vi.advanceTimersByTime(t.TOAST_UNDO_MS - 1);
    expect(toast().classList.contains('show')).toBe(true);
    vi.advanceTimersByTime(1);
    expect(toast().classList.contains('show')).toBe(false);
    t.showToast('Hi', undefined, false, 300);
    vi.advanceTimersByTime(300);
    expect(toast().classList.contains('show')).toBe(false);
  });

  it('success style and the Quick Assist badge', () => {
    t.showToast('Done', 'success', true);
    expect(toast().classList.contains('toast-success')).toBe(true);
    const icon = toast().querySelector('.toast-qa-icon') as HTMLElement;
    expect(icon.dataset.tip).toBe('From Quick Assist');
    expect(icon.querySelector('svg')).not.toBeNull();
    t.showToast('Plain');
    expect(toast().classList.contains('toast-success')).toBe(false);
    expect(toast().querySelector('.toast-qa-icon')).toBeNull();
  });

  it('a new toast restarts the timer', () => {
    t.showToast('One');
    vi.advanceTimersByTime(1000);
    t.showToast('Two');
    vi.advanceTimersByTime(1000);
    expect(toast().classList.contains('show')).toBe(true);
    expect(toast().textContent).toBe('Two');
  });
});

describe('showActionToast', () => {
  it('its button runs the action once and hides the toast', () => {
    const undo = vi.fn();
    t.showActionToast('Row deleted', 'Undo', undo);
    const btn = toast().querySelector('.toast-action-btn') as HTMLButtonElement;
    expect(btn.textContent).toBe('Undo');
    expect(toast().classList.contains('with-action')).toBe(true);
    btn.click();
    expect(undo).toHaveBeenCalledTimes(1);
    expect(toast().classList.contains('show')).toBe(false);
    undoKey();
    expect(undo).toHaveBeenCalledTimes(1);
  });

  it('Ctrl/Cmd+Z runs the action while it shows, and not after it times out', () => {
    const undo = vi.fn();
    t.showActionToast('Row deleted', 'Undo', undo, 1000);
    undoKey();
    expect(undo).toHaveBeenCalledTimes(1);
    expect(toast().classList.contains('show')).toBe(false);

    const later = vi.fn();
    t.showActionToast('Row deleted', 'Undo', later, 1000);
    vi.advanceTimersByTime(1000);
    expect(toast().classList.contains('show')).toBe(false);
    undoKey();
    expect(later).not.toHaveBeenCalled();
    vi.advanceTimersByTime(200);
    expect(toast().classList.contains('with-action')).toBe(false);
  });

  it('does nothing without a #toast element', () => {
    document.body.innerHTML = '';
    expect(() => t.showActionToast('x', 'Undo', () => {})).not.toThrow();
  });
});
