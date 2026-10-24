import { describe, it, expect } from 'vitest';
import { popoverDismiss } from '../../src/ui/popoverDismiss';

function setup(inside: (t: unknown) => boolean = () => false) {
  const handlers: Record<string, (e: never) => void> = {};
  const doc = { addEventListener: (type: string, fn: (e: never) => void, capture: boolean) => { expect(capture).toBe(true); handlers[type] = fn; } };
  const state = { open: true, closed: 0 };
  const d = popoverDismiss(doc, { isOpen: () => state.open, isInside: inside, close: () => { state.open = false; state.closed++; } });
  const key = (k: string) => { let stopped = false; handlers.keydown({ key: k, stopPropagation: () => { stopped = true; } } as never); return stopped; };
  const press = (target: unknown) => handlers.mousedown({ target } as never);
  return { d, state, key, press };
}

describe('popoverDismiss', () => {
  it('Escape closes and returns focus to the opener', () => {
    const { d, state, key } = setup();
    let focused = 0;
    d.opened({ focus: () => focused++, isConnected: true });
    expect(key('Escape')).toBe(true);
    expect(state.closed).toBe(1);
    expect(focused).toBe(1);
  });
  it('does not focus an opener that left the page', () => {
    const { d, key } = setup();
    let focused = 0;
    d.opened({ focus: () => focused++, isConnected: false });
    key('Escape');
    expect(focused).toBe(0);
  });
  it('other keys and a closed popover are left alone', () => {
    const { state, key } = setup();
    expect(key('Enter')).toBe(false);
    state.open = false;
    expect(key('Escape')).toBe(false);
    expect(state.closed).toBe(0);
  });
  it('a press outside closes without moving focus; a press inside does not close', () => {
    const inside = { id: 'in' };
    const { d, state, press } = setup((t) => t === inside);
    let focused = 0;
    d.opened({ focus: () => focused++ });
    press(inside);
    expect(state.closed).toBe(0);
    press({ id: 'out' });
    expect(state.closed).toBe(1);
    expect(focused).toBe(0);
  });
  it('after an outside close, a later Escape does not refocus the old opener', () => {
    const { d, state, key, press } = setup();
    let focused = 0;
    d.opened({ focus: () => focused++ });
    press({});
    state.open = true;
    key('Escape');
    expect(focused).toBe(0);
  });
});
