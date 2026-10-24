import { describe, it, expect } from 'vitest';
import { placePopover } from '../../src/ui/placePopover';

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
