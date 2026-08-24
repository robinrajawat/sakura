/**
 * §6.6 slice (docs/phase6-full-parity-plan.md): PowerPoint image embedding. Direct port of
 * legacy's real `pptxLayoutImageRow` (legacy/index.html:25488-25498) -- lays a row of images out
 * side by side within a fixed rectangle, all sharing one height (each image's own aspect ratio
 * decides its width), shrinking the whole row proportionally if it would otherwise overflow the
 * rectangle's width, and centering the (possibly-shrunk) row horizontally within it.
 */

export interface ImageAspect {
  width: number;
  height: number;
}

export interface ImageRowPosition {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Pure: matches legacy's own real algorithm exactly, including its `Math.max(0.33, ...)` floor
 * on each image's width (so a very tall/narrow image never shrinks to nothing) and its `gap`
 * (0.2in, legacy's own real constant) between images. */
export function pptxLayoutImageRow(images: ImageAspect[], areaX: number, areaY: number, areaW: number, areaH: number): ImageRowPosition[] {
  const gap = 0.2;
  let widths = images.map((img) => areaH * (img.width / Math.max(1, img.height)));
  let totalW = widths.reduce((a, b) => a + b, 0) + gap * (images.length - 1);
  const scale = totalW > areaW ? areaW / totalW : 1;
  const finalH = areaH * scale;
  widths = widths.map((w) => Math.max(0.33, w * scale));
  totalW = widths.reduce((a, b) => a + b, 0) + gap * (images.length - 1);
  let x = areaX + Math.max(0, (areaW - totalW) / 2);
  return widths.map((w) => {
    const pos = { x, y: areaY, w, h: finalH };
    x += w + gap;
    return pos;
  });
}
