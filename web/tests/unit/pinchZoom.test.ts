import { describe, it, expect } from 'vitest';
import { pinchMeasure, pinchView, isDoubleTap } from '../../src/ui/pinchZoom';

describe('pinchZoom', () => {
  it('measures the midpoint and distance of two fingers', () => {
    expect(pinchMeasure({ x: 0, y: 0 }, { x: 30, y: 40 })).toEqual({ mid: { x: 15, y: 20 }, dist: 50 });
  });

  it('spreading the fingers zooms around the midpoint, which stays put', () => {
    const start = { scale: 1, tx: 0, ty: 0, mid: { x: 100, y: 100 }, dist: 100 };
    const v = pinchView(start, { x: 100, y: 100 }, 200, 0.1, 8);
    expect(v.scale).toBe(2);
    // The picture point at (100,100) is still at (100,100).
    expect(100 * v.scale + v.tx).toBe(100);
    expect(100 * v.scale + v.ty).toBe(100);
  });

  it('moving both fingers pans with them', () => {
    const start = { scale: 2, tx: -50, ty: 10, mid: { x: 100, y: 100 }, dist: 80 };
    const v = pinchView(start, { x: 130, y: 90 }, 80, 0.1, 8);
    expect(v).toEqual({ scale: 2, tx: -20, ty: 0 });
  });

  it('keeps the scale within its limits', () => {
    const start = { scale: 1, tx: 0, ty: 0, mid: { x: 0, y: 0 }, dist: 100 };
    expect(pinchView(start, { x: 0, y: 0 }, 2000, 0.5, 8).scale).toBe(8);
    expect(pinchView(start, { x: 0, y: 0 }, 1, 0.5, 8).scale).toBe(0.5);
    expect(pinchView({ ...start, dist: 0 }, { x: 0, y: 0 }, 50, 0.5, 8).scale).toBe(1);
  });

  it('counts two quick, close taps as a double-tap', () => {
    expect(isDoubleTap(null, 100, 0, 0)).toBe(false);
    expect(isDoubleTap({ t: 0, x: 10, y: 10 }, 250, 20, 15)).toBe(true);
    expect(isDoubleTap({ t: 0, x: 10, y: 10 }, 400, 10, 10)).toBe(false);
    expect(isDoubleTap({ t: 0, x: 10, y: 10 }, 100, 80, 10)).toBe(false);
  });
});
