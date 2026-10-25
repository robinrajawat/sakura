/**
 * Where a popover goes next to the thing that opened it: the one placement rule every popover in
 * index.html uses (owner, 2026-10-24: "standard, unified and elegant"; step 3 of the plan).
 *
 * Below the anchor, starting at its left edge. If it doesn't fit below, above the anchor. If it
 * fits neither way (a tall popover in a short window), its bottom is pinned to the window's bottom
 * edge so as much of it as possible shows. Always kept `margin` px inside the window on every side.
 *
 * Before this, five popovers each had their own copy of this logic and two had bugs: the tag
 * popover "flipped" to anchor.top - 4 (covering the anchor instead of sitting above it), and the
 * link card could go off the top of a short window.
 *
 * Pure: the caller measures the anchor and the popover (open, so it has a size) and applies the
 * result to style.left/top.
 */
export interface PlaceRect {
  left: number;
  top: number;
  bottom: number;
}
export interface PlaceResult {
  left: number;
  top: number;
  /** True when the popover went above the anchor (or was pinned to the bottom edge). */
  above: boolean;
}

export function placePopover(
  anchor: PlaceRect,
  width: number,
  height: number,
  viewportWidth: number,
  viewportHeight: number,
  gap = 4,
  margin = 8
): PlaceResult {
  const left = Math.max(margin, Math.min(anchor.left, viewportWidth - width - margin));
  const below = anchor.bottom + gap;
  if (below + height <= viewportHeight - margin) return { left, top: below, above: false };
  const above = anchor.top - gap - height;
  if (above >= margin) return { left, top: above, above: true };
  return { left, top: Math.max(margin, viewportHeight - margin - height), above: true };
}

/** The parts of a popover element showPopoverAt touches (a real HTMLElement in index.html). */
export interface PopoverElement {
  style: { left: string; top: string };
  classList: { add: (name: string) => void };
  offsetWidth: number;
  offsetHeight: number;
}

/**
 * Opens a popover next to its anchor in one call: moves it to 0,0 (so one near the right edge isn't
 * measured while squeezed), adds `open`, measures it and places it with placePopover. With no
 * anchor it only opens. Returns the placement, or null without an anchor.
 */
export function showPopoverAt(
  pop: PopoverElement,
  anchor: PlaceRect | null,
  viewportWidth: number,
  viewportHeight: number,
  gap = 4
): PlaceResult | null {
  pop.style.left = '0px';
  pop.style.top = '0px';
  pop.classList.add('open');
  if (!anchor) return null;
  const p = placePopover(anchor, pop.offsetWidth, pop.offsetHeight, viewportWidth, viewportHeight, gap);
  pop.style.left = p.left + 'px';
  pop.style.top = p.top + 'px';
  return p;
}
