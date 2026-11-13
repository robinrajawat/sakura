/**
 * Two-finger pinch for the picture and diagram viewers (docs/mobile-plan.md, phase 2). The point
 * of the picture that was under the fingers' midpoint when the pinch began stays under the
 * midpoint as the fingers move, so a pinch zooms where it happens and also pans with the hand.
 *
 * Wired into index.html via scripts/generate-index-blocks.mjs's `pinchZoom` block.
 */

export interface PinchPoint { x: number; y: number }
export interface PinchView { scale: number; tx: number; ty: number }
export interface PinchStart extends PinchView { mid: PinchPoint; dist: number }

/** Midpoint and distance of two pointers. */
export function pinchMeasure(a: PinchPoint, b: PinchPoint): { mid: PinchPoint; dist: number } {
  return { mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, dist: Math.hypot(a.x - b.x, a.y - b.y) };
}

/** The view for the fingers' current midpoint and distance, with the scale kept within min..max. */
export function pinchView(start: PinchStart, mid: PinchPoint, dist: number, min: number, max: number): PinchView {
  const ratio = start.dist > 0 ? dist / start.dist : 1;
  const scale = Math.min(max, Math.max(min, start.scale * ratio));
  const k = scale / start.scale;
  return { scale, tx: mid.x - (start.mid.x - start.tx) * k, ty: mid.y - (start.mid.y - start.ty) * k };
}

/** True when two taps (time in ms, positions in px) are close enough to count as a double-tap. */
export function isDoubleTap(prev: { t: number; x: number; y: number } | null, t: number, x: number, y: number): boolean {
  return !!prev && t - prev.t <= 300 && Math.hypot(x - prev.x, y - prev.y) <= 30;
}
