/**
 * Pure text/color/box-sizing math from the `diagramGen*` subsystem — the deterministic
 * tree-diagram generator ("Generate rough diagram from outline", see docs/architecture-plan.md
 * for the wider feature). First slice of that subsystem to be extracted; the other ~27
 * `diagramGen*` functions (XML emission, tree layout, color assignment, AI classification) are
 * a genuinely separate, much larger scoping session, deliberately not touched here.
 *
 * Investigation before scoping (per this project's "investigate before assuming an ordering
 * guess is right" lesson): of the whole `diagramGen*` set, these five were the ones with zero
 * DOM/canvas/measurement-API dependency and zero reliance on the generator's own mutable
 * traversal state (`nodes`, `nodeMeta`, id counters) — pure functions of their own arguments,
 * same shape as `nodeQueries.ts`. `diagramGenBoxDims`/`diagramGenMergedBoxDims` estimate wrapped
 * text height from character count rather than real canvas text measurement, so they stay
 * accurate to extract without a browser.
 *
 * `diagramGenAdjustDimsForShape`/`diagramGenBoxDims`/`diagramGenMergedBoxDims` were originally
 * ~500 lines away from `diagramGenHardTruncate`/`diagramGenLighten` in index.html — relocated
 * next to them in a separate pure-code-motion commit first (see this project's established
 * "generator splices one contiguous block" constraint), so this generated block replaces all
 * five in one place.
 *
 * Lives in `src/core/` rather than `src/state/`, despite not touching the outline `nodes`
 * array: the project's real core/-vs-state/ distinction is DI style, not nodes-touching (see
 * `templatesApply.ts`'s header) — `core/` is per-call-parameter, no injected deps, no ambient
 * singleton. These five have even less coupling than that: no injected dependencies at all,
 * every input is a plain argument. That's the `core/` shape, just with the DI step skipped
 * entirely since there's nothing to inject.
 *
 * `DIAGRAM_GEN_MIN_W`/`MAX_W`/`PAD`/`CHAR_PX`/`ONE_LINE_H`/`TWO_LINE_H` are index.html's own
 * top-level consts, also read by hand-written code this slice doesn't touch (the AI-shortening
 * `diagramGenTrimText`, `DIAGRAM_GEN_CHAR_BUDGET`'s own computation) — so they can't be
 * relocated out of index.html entirely. Duplicated here as private literals instead, same
 * precedent as `diagramDisplayList.ts` duplicating `DIAGRAM_STATUSES`: every generated block
 * shares one script scope with the rest of index.html, so reusing the real names here would be
 * a duplicate top-level `const` — a hard SyntaxError killing the whole script on load. This
 * comment is the single place documenting they must stay in sync with index.html's own copy if
 * those ever change.
 */

const _DIAGRAM_GEN_MIN_W = 140;
const _DIAGRAM_GEN_MAX_W = 260;
const _DIAGRAM_GEN_PAD = 24;
const _DIAGRAM_GEN_CHAR_PX = 7;
const _DIAGRAM_GEN_ONE_LINE_H = 44;
const _DIAGRAM_GEN_TWO_LINE_H = 64;

export interface BoxDims {
  w: number;
  h: number;
}

/** Pure: matches index.html's own `diagramGenHardTruncate` exactly. Trims to `budget`
 * characters, breaking on the last space past position 15 rather than mid-word when possible,
 * and appends an ellipsis. Returns the trimmed (untruncated) text unchanged if it already fits. */
export function diagramGenHardTruncateCore(text: string, budget: number): string {
  const plain = String(text || '').trim();
  if (plain.length <= budget) return plain;
  let cut = plain.slice(0, budget - 1);
  const lastSpace = cut.lastIndexOf(' ');
  if (lastSpace > 15) cut = cut.slice(0, lastSpace);
  return cut + '\u2026';
}

/** Pure: matches index.html's own `diagramGenLighten` exactly. Blends a hex color toward white
 * by `amount` (0-1). Returns the input unchanged if it doesn't parse as a 6-digit hex color. */
export function diagramGenLightenCore(hex: string, amount: number): string {
  const h = String(hex || '').replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  if (!Number.isFinite(r) || !Number.isFinite(g) || !Number.isFinite(b)) return hex;
  const mix = (c: number) => Math.round(c + (255 - c) * amount);
  return '#' + [mix(r), mix(g), mix(b)].map((v) => v.toString(16).padStart(2, '0')).join('');
}

/** Pure: matches index.html's own `diagramGenAdjustDimsForShape` exactly. Adjusts a label-fit
 * box's dims for shapes whose usable interior differs from a plain rectangle's — a decision
 * diamond needs more room (angled edges eat into it), an actor gets a fixed compact portrait
 * size (label renders below the icon, not inside it), and a datastore's elliptical cap needs
 * extra height. Any other shape (including a plain box) passes `dims` through unchanged. */
export function diagramGenAdjustDimsForShapeCore(dims: BoxDims, shape: string): BoxDims {
  if (shape === 'decision') return { w: Math.round(dims.w * 1.45), h: Math.round(dims.h * 1.6) };
  if (shape === 'actor') return { w: 70, h: 86 };
  if (shape === 'datastore') return { w: dims.w, h: dims.h + 16 };
  return dims;
}

/** Pure: matches index.html's own `diagramGenBoxDims` exactly. Estimates a label-fit box size
 * from character count alone (no real text measurement) — width grows with the label between
 * `MIN_W`/`MAX_W`, and height only steps up to the two-line size if the label would still need
 * to wrap at that width. */
export function diagramGenBoxDimsCore(text: string): BoxDims {
  const len = String(text || '').length;
  const w = Math.min(
    _DIAGRAM_GEN_MAX_W,
    Math.max(_DIAGRAM_GEN_MIN_W, len * _DIAGRAM_GEN_CHAR_PX + _DIAGRAM_GEN_PAD)
  );
  const perLine = Math.max(1, Math.floor((w - _DIAGRAM_GEN_PAD) / _DIAGRAM_GEN_CHAR_PX));
  const lines = Math.max(1, Math.ceil(len / perLine));
  return { w, h: lines >= 2 ? _DIAGRAM_GEN_TWO_LINE_H : _DIAGRAM_GEN_ONE_LINE_H };
}

/** Pure: matches index.html's own `diagramGenMergedBoxDims` exactly. Sizes a merged title+detail
 * box (title and detail render as two separate stacked lines, not one run-on string): width is
 * whichever line is wider, height is each line's own independently-wrapped estimate stacked
 * together minus a small overlap (each already budgets its own top/bottom padding). Reuses
 * `diagramGenBoxDimsCore` per line rather than a new wrapping calculation. */
export function diagramGenMergedBoxDimsCore(titleText: string, detailText: string): BoxDims {
  const t = diagramGenBoxDimsCore(titleText);
  const d = diagramGenBoxDimsCore(detailText);
  return { w: Math.max(t.w, d.w), h: t.h + d.h - 8 };
}
