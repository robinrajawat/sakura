import type { Page } from '@playwright/test';

// Finger gestures for the phone suite (docs/standard-practice-plan.md, step 1).
//
// Playwright's own touch API only taps; a long-press, swipe or pinch needs separate down, move
// and lift steps. In Chromium those go through Chrome's own touch input (DevTools protocol), so the
// browser turns them into pointer events itself. WebKit has no such channel, so there the same
// pointer events Sakura listens for (pointerType 'touch') are dispatched in the page, each finger
// on the element under it when it went down, as a real touch's implicit capture does. That tests
// Sakura's gesture code in Safari's engine; it does not test WebKit's own touch-to-pointer step.

export type Point = { x: number; y: number };

/**
 * Plays a gesture: `frames[0]` puts the fingers down, every later frame moves them, then all lift.
 * Fingers are matched by position in each frame. `holdMs` waits after the last frame before lifting.
 */
export async function touchGesture(page: Page, frames: Point[][], holdMs = 0) {
  // SAKURA_SYNTH_TOUCH=1 forces the WebKit path in Chromium, to check it locally (WebKit can't be
  // installed in the cloud container).
  if (page.context().browser()?.browserType().name() === 'chromium' && !process.env.SAKURA_SYNTH_TOUCH) {
    const cdp = await page.context().newCDPSession(page);
    const pts = (f: Point[]) => f.map((p, i) => ({ x: p.x, y: p.y, id: i + 1 }));
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pts(frames[0]) });
    for (const f of frames.slice(1)) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pts(f) });
    if (holdMs) await page.waitForTimeout(holdMs);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await cdp.detach();
    return;
  }
  const send = (type: string, f: Point[]) => page.evaluate(({ type, f }) => {
    const FIRST = 1000;
    const w = window as unknown as { __touchTargets?: Map<number, Element>; __touchCapture?: Map<number, Element> };
    if (!w.__touchTargets) {
      // A real finger can be captured (setPointerCapture); a dispatched one has no live pointer behind
      // it, so the browser would throw. Honour capture for these fingers the way the browser would.
      const capture = (w.__touchCapture = new Map());
      const proto = Element.prototype;
      const set = proto.setPointerCapture, release = proto.releasePointerCapture, has = proto.hasPointerCapture;
      proto.setPointerCapture = function (id: number) { if (id >= FIRST) capture.set(id, this); else set.call(this, id); };
      proto.releasePointerCapture = function (id: number) { if (id >= FIRST) { if (capture.get(id) === this) capture.delete(id); } else release.call(this, id); };
      proto.hasPointerCapture = function (id: number) { return id >= FIRST ? capture.get(id) === this : has.call(this, id); };
    }
    const targets = (w.__touchTargets ||= new Map());
    const capture = w.__touchCapture!;
    f.forEach((p, i) => {
      const id = FIRST + i;
      if (type === 'pointerdown') { capture.delete(id); targets.set(id, document.elementFromPoint(p.x, p.y) || document.body); }
      const target = capture.get(id) || targets.get(id); if (!target) return;
      target.dispatchEvent(new PointerEvent(type, {
        bubbles: true, cancelable: true, composed: true, pointerId: id, pointerType: 'touch', isPrimary: i === 0,
        clientX: p.x, clientY: p.y, button: type === 'pointermove' ? -1 : 0, buttons: type === 'pointerup' ? 0 : 1,
        width: 1, height: 1, pressure: type === 'pointerup' ? 0 : 0.5
      }));
      if (type === 'pointerup') { targets.delete(id); capture.delete(id); }
    });
  }, { type, f });
  await send('pointerdown', frames[0]);
  for (const f of frames.slice(1)) await send('pointermove', f);
  if (holdMs) await page.waitForTimeout(holdMs);
  await send('pointerup', frames[frames.length - 1]);
}

/** One finger held still for `ms` (a long-press). */
export const longPressAt = (page: Page, p: Point, ms = 650) => touchGesture(page, [[p]], ms);

/** One finger moved by (dx, dy) in `steps` even steps (a swipe or drag). */
export const dragBy = (page: Page, p: Point, dx: number, dy: number, steps = 10) =>
  touchGesture(page, Array.from({ length: steps + 1 }, (_, i) => [{ x: p.x + (dx * i) / steps, y: p.y + (dy * i) / steps }]));
