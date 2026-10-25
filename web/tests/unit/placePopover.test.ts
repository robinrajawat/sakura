import { describe, it, expect } from 'vitest';
import { placePopover, showPopoverAt } from '../../src/ui/placePopover';

const anchor = (left: number, top: number, h = 20) => ({ left, top, bottom: top + h });

describe('placePopover', () => {
  it('goes below the anchor, at its left edge, when it fits', () => {
    expect(placePopover(anchor(100, 100), 200, 150, 1200, 800)).toEqual({ left: 100, top: 124, above: false });
  });
  it('goes above the anchor (not over it) when there is no room below', () => {
    const r = placePopover(anchor(100, 700), 200, 150, 1200, 800);
    expect(r).toEqual({ left: 100, top: 700 - 4 - 150, above: true });
    expect(r.top + 150).toBeLessThanOrEqual(700);
  });
  it('pins to the bottom edge when it fits neither below nor above', () => {
    expect(placePopover(anchor(100, 60), 200, 700, 1200, 720)).toEqual({ left: 100, top: 12, above: true });
  });
  it('never goes off the top, even when taller than the window', () => {
    expect(placePopover(anchor(100, 60), 200, 900, 1200, 720).top).toBe(8);
  });
  it('is kept inside the window on the right and the left', () => {
    expect(placePopover(anchor(1100, 100), 200, 100, 1200, 800).left).toBe(1200 - 200 - 8);
    expect(placePopover(anchor(-40, 100), 200, 100, 1200, 800).left).toBe(8);
  });
  it('takes a custom gap and margin', () => {
    expect(placePopover(anchor(100, 100), 200, 100, 1200, 800, 6, 12)).toEqual({ left: 100, top: 126, above: false });
    expect(placePopover(anchor(0, 100), 200, 100, 1200, 800, 6, 12).left).toBe(12);
  });
  it('fits exactly at the bottom margin', () => {
    expect(placePopover(anchor(0, 600), 100, 168, 1200, 800).above).toBe(false); // 624 + 168 = 792
    expect(placePopover(anchor(0, 600), 100, 169, 1200, 800).above).toBe(true);
  });
});

describe('showPopoverAt', () => {
  const el = (w: number, h: number) => {
    const classes: string[] = [];
    const seen: string[] = [];
    const style = { _l: '', get left() { return this._l; }, set left(v: string) { this._l = v; seen.push('left=' + v); }, top: '' };
    return { style, classList: { add: (c: string) => classes.push(c) }, offsetWidth: w, offsetHeight: h, classes, seen };
  };
  it('moves to 0,0, opens, then places', () => {
    const pop = el(200, 100);
    expect(showPopoverAt(pop, anchor(100, 100), 1200, 800)).toEqual({ left: 100, top: 124, above: false });
    expect(pop.seen[0]).toBe('left=0px');
    expect(pop.classes).toEqual(['open']);
    expect([pop.style.left, pop.style.top]).toEqual(['100px', '124px']);
  });
  it('only opens without an anchor', () => {
    const pop = el(200, 100);
    expect(showPopoverAt(pop, null, 1200, 800)).toBeNull();
    expect(pop.classes).toEqual(['open']);
  });
  it('passes the gap through', () => {
    expect(showPopoverAt(el(200, 100), anchor(100, 100), 1200, 800, 6)?.top).toBe(126);
  });
});
