import { describe, it, expect } from 'vitest';
import {
  computeDiagramGenFinalRectsCore,
  type FinalRectPosition,
  type FinalRectDims
} from '../../src/state/diagramGenRects';

function positions(entries: Record<number, FinalRectPosition>): Map<number, FinalRectPosition> {
  return new Map(Object.entries(entries).map(([k, v]) => [Number(k), v]));
}

function dims(entries: Record<number, FinalRectDims>): Map<number, FinalRectDims> {
  return new Map(Object.entries(entries).map(([k, v]) => [Number(k), v]));
}

// Pinned local oracle — literal copy of index.html's own diagramGenFinishGenerate fragment
// (minX/maxX/maxY/snap10/offsetX/finalRect computation), same approach as every other slice's
// test file.
function oracle(
  scopeIdxs: number[],
  pos: Map<number, FinalRectPosition>,
  d: Map<number, FinalRectDims>
) {
  let minX = Infinity, maxX = -Infinity, maxY = -Infinity;
  scopeIdxs.forEach((idx) => {
    const p = pos.get(idx), dm = d.get(idx);
    if (!p || !dm) return;
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x + dm.w); maxY = Math.max(maxY, p.y + dm.h);
  });
  const snap10 = (n: number) => Math.round(n / 10) * 10;
  const offsetX = 40 - minX;
  const finalRect = new Map<number, { x: number; y: number; w: number; h: number }>();
  scopeIdxs.forEach((idx) => {
    const p = pos.get(idx), dm = d.get(idx);
    if (!p || !dm) return;
    const w = Math.round(dm.w), h = Math.round(dm.h);
    const x = snap10(p.x + offsetX + dm.w / 2) - Math.round(w / 2);
    const y = snap10(p.y + 40);
    finalRect.set(idx, { x, y, w, h });
  });
  return { finalRect, minX, maxX, maxY, offsetX };
}

describe('computeDiagramGenFinalRectsCore', () => {
  it('shifts the leftmost node to a 40px margin', () => {
    const p = positions({ 0: { x: 100, y: 0 } });
    const d = dims({ 0: { w: 60, h: 44 } });
    const result = computeDiagramGenFinalRectsCore([0], p, d);
    // offsetX = 40 - 100 = -60; snap10(100 + -60 + 30) - 30 = snap10(70)-30 = 70-30 = 40
    expect(result.finalRect.get(0)?.x).toBe(40);
  });

  it('snaps y to a 10px grid with a fixed 40px top offset', () => {
    const p = positions({ 0: { x: 0, y: 23 } });
    const d = dims({ 0: { w: 60, h: 44 } });
    const result = computeDiagramGenFinalRectsCore([0], p, d);
    // snap10(23+40) = snap10(63) = 60
    expect(result.finalRect.get(0)?.y).toBe(60);
  });

  it('rounds w/h to whole pixels', () => {
    const p = positions({ 0: { x: 0, y: 0 } });
    const d = dims({ 0: { w: 60.4, h: 44.6 } });
    const result = computeDiagramGenFinalRectsCore([0], p, d);
    expect(result.finalRect.get(0)?.w).toBe(60);
    expect(result.finalRect.get(0)?.h).toBe(45);
  });

  it('computes minX/maxX/maxY across all scoped nodes', () => {
    const p = positions({ 0: { x: 0, y: 0 }, 1: { x: 100, y: 50 } });
    const d = dims({ 0: { w: 60, h: 44 }, 1: { w: 80, h: 60 } });
    const result = computeDiagramGenFinalRectsCore([0, 1], p, d);
    expect(result.minX).toBe(0);
    expect(result.maxX).toBe(180); // 100+80
    expect(result.maxY).toBe(110); // 50+60
  });

  it('skips a scopeIdx with no position or dims entry rather than throwing', () => {
    const p = positions({ 0: { x: 0, y: 0 } });
    const d = dims({ 0: { w: 60, h: 44 } });
    expect(() => computeDiagramGenFinalRectsCore([0, 1], p, d)).not.toThrow();
    const result = computeDiagramGenFinalRectsCore([0, 1], p, d);
    expect(result.finalRect.has(1)).toBe(false);
    expect(result.finalRect.has(0)).toBe(true);
  });

  it('never mutates the input positions/dims maps', () => {
    const p = positions({ 0: { x: 10, y: 20 } });
    const d = dims({ 0: { w: 60, h: 44 } });
    const pSnapshot = JSON.stringify([...p]);
    const dSnapshot = JSON.stringify([...d]);
    computeDiagramGenFinalRectsCore([0], p, d);
    expect(JSON.stringify([...p])).toBe(pSnapshot);
    expect(JSON.stringify([...d])).toBe(dSnapshot);
  });

  it.each([
    { idxs: [0], p: { 0: { x: 5, y: 5 } }, d: { 0: { w: 50, h: 30 } } },
    {
      idxs: [0, 1, 2],
      p: { 0: { x: 0, y: 0 }, 1: { x: 130, y: 94 }, 2: { x: 260, y: 94 } },
      d: { 0: { w: 60, h: 44 }, 1: { w: 100, h: 44 }, 2: { w: 90, h: 64 } }
    },
    {
      idxs: [0, 1],
      p: { 0: { x: -50, y: 10 }, 1: { x: 20, y: 10 } },
      d: { 0: { w: 40.5, h: 44.2 }, 1: { w: 75.9, h: 44 } }
    }
  ])('matches the oracle for %j', ({ idxs, p, d }) => {
    const posMap = positions(p as Record<number, FinalRectPosition>);
    const dimsMap = dims(d as Record<number, FinalRectDims>);
    const result = computeDiagramGenFinalRectsCore(idxs, posMap, dimsMap);
    const oracleResult = oracle(idxs, posMap, dimsMap);
    expect(result).toEqual(oracleResult);
  });
});
