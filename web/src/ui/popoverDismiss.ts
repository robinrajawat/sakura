/**
 * How a popover closes: the one rule the anchored popovers in index.html share (owner, 2026-10-24:
 * "standard, unified and elegant"; step 3 of the plan, after placePopover).
 *
 * - Escape closes it and puts focus back on the control that opened it, so the keyboard user
 *   carries on where they were.
 * - A mouse press outside it closes it, and focus stays where the press put it.
 * - A press on one of its own triggers is "inside", so the trigger's click can toggle it instead of
 *   closing and reopening it.
 *
 * Both listeners are capture-phase on the document, as every popover used before, so a press on
 * something that stops propagation still closes an open popover.
 *
 * Before this each popover had its own copy; the thread date popover had no Escape at all, and
 * none of them returned focus.
 */
export interface DismissOptions {
  isOpen: () => boolean;
  /** True for a press inside the popover or on one of its triggers. */
  isInside: (target: EventTarget | null) => boolean;
  close: () => void;
}
export interface DismissDocument {
  addEventListener(type: 'keydown' | 'mousedown', fn: (e: never) => void, capture: boolean): void;
}
interface FocusTarget {
  focus: () => void;
  isConnected?: boolean;
}

export function popoverDismiss(doc: DismissDocument, opts: DismissOptions): { opened: (trigger: FocusTarget | null) => void } {
  let returnTo: FocusTarget | null = null;
  doc.addEventListener(
    'keydown',
    (e: { key: string; stopPropagation: () => void }) => {
      if (e.key !== 'Escape' || !opts.isOpen()) return;
      e.stopPropagation();
      const to = returnTo;
      returnTo = null;
      opts.close();
      if (to && to.isConnected !== false) to.focus();
    },
    true
  );
  doc.addEventListener(
    'mousedown',
    (e: { target: EventTarget | null }) => {
      if (!opts.isOpen() || opts.isInside(e.target)) return;
      returnTo = null;
      opts.close();
    },
    true
  );
  return { opened: (trigger) => { returnTo = trigger; } };
}
