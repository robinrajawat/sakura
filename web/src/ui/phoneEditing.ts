/**
 * Editing by touch on a phone (docs/mobile-plan.md, phase 3): where the row toolbar sits above the
 * on-screen keyboard, and the long-press that opens a row's short menu (phones have no right-click,
 * and iOS sends no contextmenu on a long-press).
 *
 * Wired into index.html via scripts/generate-index-blocks.mjs's `phoneEditing` block; the toolbar,
 * the menu and their actions are wired by hand next to the phone drawer.
 */

/**
 * How far the on-screen keyboard reaches up from the bottom of the layout viewport, from
 * window.visualViewport. 0 with no keyboard, or where visualViewport is missing.
 */
export function keyboardInset(innerHeight: number, vv: { height: number; offsetTop: number } | null | undefined): number {
  if (!vv) return 0;
  return Math.max(0, Math.round(innerHeight - (vv.offsetTop + vv.height)));
}

export interface LongPressTimers {
  set: (fn: () => void, ms: number) => unknown;
  clear: (handle: unknown) => void;
}

export interface LongPress<T> {
  /** A finger went down at (x, y) over `target`. */
  down(x: number, y: number, target: T): void;
  /** The finger moved; more than `slop` px from where it went down cancels the press. */
  move(x: number, y: number): void;
  /** The finger lifted, or the gesture was cancelled or became a scroll. */
  cancel(): void;
  /** True once the press fired, until the next down (so the click that follows can be ignored). */
  fired(): boolean;
}

/** Fires `onFire(target)` when a finger stays down, within `slop` px, for `delay` ms. */
export function createLongPress<T>(onFire: (target: T) => void, timers: LongPressTimers, delay = 500, slop = 10): LongPress<T> {
  let handle: unknown = null;
  let start: { x: number; y: number } | null = null;
  let didFire = false;
  const stop = () => { if (handle !== null) timers.clear(handle); handle = null; start = null; };
  return {
    down(x, y, target) {
      stop(); didFire = false; start = { x, y };
      handle = timers.set(() => { handle = null; start = null; didFire = true; onFire(target); }, delay);
    },
    move(x, y) { if (start && Math.hypot(x - start.x, y - start.y) > slop) stop(); },
    cancel() { stop(); },
    fired() { return didFire; }
  };
}

/**
 * To-Dos swipe on a phone (docs/mobile-plan.md, phase 4), as on the old phone page: a swipe
 * right past the threshold completes the task, left deletes it (Undo in the toast). The threshold
 * is 30% of the row, at most 96px.
 */
export function swipeOutcome(dx: number, rowWidth: number): 'complete' | 'delete' | null {
  const threshold = Math.min(96, rowWidth * 0.3);
  if (dx > threshold) return 'complete';
  if (dx < -threshold) return 'delete';
  return null;
}

/**
 * Which way a touch is going once it has moved past `slop` px: 'x' (a swipe), 'y' (a scroll, so
 * leave it to the browser) or null (not decided yet).
 */
export function swipeAxis(dx: number, dy: number, slop = 10): 'x' | 'y' | null {
  if (Math.abs(dx) < slop && Math.abs(dy) < slop) return null;
  return Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
}
