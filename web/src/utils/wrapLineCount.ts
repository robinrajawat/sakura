/**
 * §6.6 slice (docs/phase6-full-parity-plan.md): PowerPoint export overflow "(cont'd)" slides.
 * Direct port of legacy's real `pptxMeasureWrappedLines`'s own core word-wrap algorithm
 * (legacy/index.html:25971-25993) -- greedy word-wrap, measuring against a fixed box width.
 * Legacy's own version reads a canvas 2D context directly; this one takes a `measureTextWidth`
 * injected dependency instead (the same DI convention this project's other browser-API-touching
 * pure logic already uses, e.g. `notifications.ts`'s `NotifDeps`), so the actual wrap-counting
 * algorithm is testable with a deterministic fake width function -- real canvas
 * `measureText`-backed measurement (unavoidably real-browser-only) lives in the caller
 * (`ExportButtons.tsx`), verified there via real headless-Chrome testing instead.
 */

/** Pure: greedy-wraps `text` into lines no wider than `boxWidthPx` (per `measureTextWidth`,
 * which returns a single word/space's rendered width in the same units as `boxWidthPx`),
 * returning the resulting line count. Matches legacy's own real algorithm exactly: a word that
 * doesn't fit on the current line starts a new one; the first word on any line is never wrapped
 * away no matter how wide it is (matching legacy's own `lineW>0&&...` guard, which only ever
 * wraps BEFORE adding a word, never mid-word). Always returns at least 1, even for empty text. */
export function wrapLineCount(text: string, boxWidthPx: number, measureTextWidth: (s: string) => number): number {
  const words = text.split(/\s+/).filter(Boolean);
  if (!words.length) return 1;
  const spaceW = measureTextWidth(' ');
  let lineW = 0;
  let lines = 1;
  for (const word of words) {
    const wordW = measureTextWidth(word);
    const add = (lineW === 0 ? 0 : spaceW) + wordW;
    if (lineW > 0 && lineW + add > boxWidthPx) {
      lines++;
      lineW = wordW;
    } else {
      lineW += add;
    }
  }
  return Math.max(1, lines);
}

/** Pure: matches legacy's own real `pptxLineHeightIn` exactly -- a line's height in inches at
 * `fontSizePt`, scaled by `lineSpacingMultiple` (defaulting to 1.25, matching legacy's own
 * Q&A-section default, since that's the multiple this project's own PPTX bullet text also
 * uses). */
export function pptxLineHeightIn(fontSizePt: number, lineSpacingMultiple = 1.25): number {
  return (fontSizePt * lineSpacingMultiple) / 72;
}
