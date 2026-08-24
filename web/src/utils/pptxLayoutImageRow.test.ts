import { describe, it, expect } from 'vitest';
import { pptxLayoutImageRow } from './pptxLayoutImageRow';

describe('pptxLayoutImageRow', () => {
  it('sizes a single square image to fill the area height, centered horizontally', () => {
    const positions = pptxLayoutImageRow([{ width: 100, height: 100 }], 0, 0, 10, 2);
    expect(positions).toHaveLength(1);
    expect(positions[0]).toEqual({ x: 4, y: 0, w: 2, h: 2 });
  });

  it('lays two images side by side at full area height when they fit within the width', () => {
    // Two 1:1 images at areaH=2 each want w=2; total 2+2+0.2(gap)=4.2, well under areaW=10.
    const positions = pptxLayoutImageRow(
      [
        { width: 100, height: 100 },
        { width: 100, height: 100 }
      ],
      0,
      0,
      10,
      2
    );
    expect(positions[0]).toEqual({ x: 2.9, y: 0, w: 2, h: 2 });
    expect(positions[1]).toEqual({ x: 5.1, y: 0, w: 2, h: 2 });
  });

  it('shrinks the whole row proportionally when it would overflow the area width', () => {
    // Three 1:1 images at areaH=2 each naively want w=2; total 6+0.4(gap)=6.4 > areaW=4, so the
    // row scales down by 4/6.4=0.625 -- each image ends up 1.25 wide/tall, not 2.
    const positions = pptxLayoutImageRow(
      [
        { width: 100, height: 100 },
        { width: 100, height: 100 },
        { width: 100, height: 100 }
      ],
      0,
      0,
      4,
      2
    );
    positions.forEach((p) => {
      expect(p.w).toBeCloseTo(1.25);
      expect(p.h).toBeCloseTo(1.25);
    });
  });

  it('respects a wide (non-square) aspect ratio', () => {
    // A 200x100 (2:1) image at areaH=2 wants w=4.
    const positions = pptxLayoutImageRow([{ width: 200, height: 100 }], 0, 0, 10, 2);
    expect(positions[0].w).toBeCloseTo(4);
    expect(positions[0].h).toBeCloseTo(2);
  });

  it('floors a very narrow/tall image at 0.33in wide rather than shrinking to nothing', () => {
    // A 1x1000 image (extremely tall/narrow) naively wants a tiny width once scaled down enough
    // by other wide images sharing the row -- the 0.33in floor keeps it visible.
    const positions = pptxLayoutImageRow(
      [
        { width: 1000, height: 100 }, // very wide -> wants a huge width, forcing a big shrink
        { width: 1, height: 1000 } // very narrow -> would shrink below the floor without it
      ],
      0,
      0,
      5,
      2
    );
    expect(positions[1].w).toBeGreaterThanOrEqual(0.33);
  });

  it('treats a zero-height image as 1px tall (matching the Math.max(1, ...) divide-by-zero guard)', () => {
    // Without the guard, width/height would divide by zero (Infinity/NaN). With it, height is
    // floored to 1, so a 50x0 image is treated as an extremely wide 50:1 image.
    const positions = pptxLayoutImageRow([{ width: 50, height: 0 }], 0, 0, 100, 2);
    expect(positions[0].w).toBeCloseTo(100); // areaH(2) * (50/1) = 100, and 100 fits within areaW(100)
    expect(positions[0].h).toBeCloseTo(2);
  });
});
