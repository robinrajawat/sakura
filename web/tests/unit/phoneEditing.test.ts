import { describe, it, expect } from 'vitest';
import { keyboardInset, createLongPress } from '../../src/ui/phoneEditing';

function fakeTimers() {
  let next = 1; const pending = new Map<number, () => void>();
  return {
    timers: { set: (fn: () => void) => { const h = next++; pending.set(h, fn); return h; }, clear: (h: unknown) => { pending.delete(h as number); } },
    runAll: () => { const fns = [...pending.values()]; pending.clear(); fns.forEach((f) => f()); },
    count: () => pending.size
  };
}

describe('keyboardInset', () => {
  it('is how far the keyboard reaches up from the bottom', () => {
    expect(keyboardInset(844, { height: 500, offsetTop: 0 })).toBe(344);
    expect(keyboardInset(844, { height: 500, offsetTop: 40 })).toBe(304);
  });
  it('is 0 with no keyboard or no visualViewport', () => {
    expect(keyboardInset(844, { height: 844, offsetTop: 0 })).toBe(0);
    expect(keyboardInset(844, { height: 900, offsetTop: 0 })).toBe(0);
    expect(keyboardInset(844, null)).toBe(0);
    expect(keyboardInset(844, undefined)).toBe(0);
  });
});

describe('createLongPress', () => {
  it('fires after holding still', () => {
    const t = fakeTimers(); const hits: string[] = [];
    const lp = createLongPress<string>((x) => hits.push(x), t.timers);
    lp.down(10, 10, 'row-1');
    lp.move(14, 13);
    t.runAll();
    expect(hits).toEqual(['row-1']);
    expect(lp.fired()).toBe(true);
    lp.down(0, 0, 'row-2');
    expect(lp.fired()).toBe(false);
  });
  it('a move past the slop (a scroll) or a lift cancels it', () => {
    const t = fakeTimers(); const hits: string[] = [];
    const lp = createLongPress<string>((x) => hits.push(x), t.timers);
    lp.down(10, 10, 'a'); lp.move(10, 30);
    expect(t.count()).toBe(0);
    lp.down(10, 10, 'b'); lp.cancel();
    expect(t.count()).toBe(0);
    t.runAll();
    expect(hits).toEqual([]);
    expect(lp.fired()).toBe(false);
  });
});
