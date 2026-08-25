import type { RowHighlightStyle } from '../store/outlinePrefsStore';

/**
 * §6.7 slice (docs/phase6-full-parity-plan.md): pure resolver for legacy's real
 * `rowHighlightStyle` ("Row style" in Settings → Layout) -- direct port of the four
 * `body.row-hl-{style}` CSS variants (legacy/index.html:561): `original` (a background tint,
 * stronger for the primary selection than for other selected members of a multi-select),
 * `dot` (a small left-edge circle instead of a fill), `bar` (an inset left border), and
 * `outline` (a full inset border, plus a faint fill for the primary selection only). Reproduces
 * legacy's own exact `color-mix(in srgb, var(--accent) N%, transparent)` values as literal CSS
 * strings (all major browsers support `color-mix()` natively) rather than computing a blended
 * hex value in JS, since that's exactly what legacy's own CSS already does.
 *
 * `isPrimary`/`isMember` map to `web/`'s own two selection concepts: `isPrimary` is a single,
 * non-multi selection (`node.id === selectedId`) -- the closest existing equivalent to legacy's
 * own `.primary-selection` (the anchor node within a multi-select); `isMember` is
 * `isMultiSelected` (any other node swept into the same multi-select) -- legacy's own plain
 * `.selected`. `web/` has no separate "anchor within a multi-select" concept to distinguish a
 * multi-select's own primary member from its other members, so a multi-selected node always
 * renders at the weaker "member" level here, never the stronger "primary" one -- a real,
 * deliberate simplification, not an attempt to reproduce that finer distinction.
 *
 * `originalSelectedBg`/`originalMultiSelectedBg` are the theme's own already-tinted colors
 * (`THEME_TOKENS[theme].selectedBg`/`.multiSelectedBg`) -- the `original` style just reuses
 * whatever `web/` already renders for a selected row today (its only style before this slice),
 * so this function's own job for that one case is simply to pass them through unchanged.
 */
export interface RowHighlightResult {
  backgroundColor?: string;
  boxShadow?: string;
}

export function resolveRowHighlightStyle(
  style: RowHighlightStyle,
  isPrimary: boolean,
  isMember: boolean,
  accent: string,
  originalSelectedBg: string,
  originalMultiSelectedBg: string
): RowHighlightResult {
  if (!isPrimary && !isMember) return {};
  switch (style) {
    case 'dot':
      // The dot itself needs a real DOM element (an absolutely-positioned pseudo-element in
      // legacy) -- OutlineTree.tsx renders it separately based on the same isPrimary/isMember
      // flags this function is given; this style intentionally contributes no
      // background/boxShadow of its own, matching legacy's own CSS (row-hl-dot sets no
      // background on the row itself, only on its `::before`).
      return {};
    case 'bar':
      return { boxShadow: `inset ${isPrimary ? 3 : 2}px 0 0 color-mix(in srgb, ${accent} ${isPrimary ? 60 : 32}%, transparent)` };
    case 'outline':
      return {
        boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${accent} ${isPrimary ? 55 : 40}%, transparent)`,
        backgroundColor: isPrimary ? `color-mix(in srgb, ${accent} 12%, transparent)` : undefined
      };
    case 'original':
    default:
      return { backgroundColor: isPrimary ? originalSelectedBg : originalMultiSelectedBg };
  }
}
