import type { CSSProperties } from 'react';
import { parseSemanticMarkup, type SemanticSegmentType } from '../utils/parseSemanticMarkup';

/**
 * Phase 2 slice (docs/framework-migration-plan.md). Renders a node's text with the semantic
 * markup styling documented under "Core Editing" in the README, using `parseSemanticMarkup`
 * (see that file's own header for why it's a fresh, faithful match of legacy's hand-written
 * `parseStyledText` rather than a reuse of the already-ported `parseInlineSegments.ts`, which
 * serves a different consumer with different requirements).
 *
 * Colors below are the light-theme literal values read directly from legacy's own CSS custom
 * properties (`--sem-section:#3a52a8`, `--sem-alert:#b02020`, `--sem-code:#4a3a8a`,
 * `--muted:#73716b`) rather than real CSS variables — `web/` has no theme system yet (that's
 * Phase 3's "theming" scope per the migration plan, not this slice's). Layout properties
 * (padding, border-radius, font-family, font-weight) are copied directly from legacy's real
 * `.sem-chip`/`.sem-meta`/`.sem-alert-inline`/`.sem-code-inline` CSS rules, not reinvented.
 *
 * Phase 6.3 backlinks-groundwork addition: `link` segments (legacy's `.bl-link`,
 * legacy/index.html:2175) render with the same background-tinted/accent-colored pill styling.
 * `onLinkClick` is optional and only wired by the interactive outline editor (`OutlineTree.tsx`)
 * -- Presenter/Preview's read-only renders of `NodeText` (`PresenterMode.tsx`/`PreviewPane.tsx`)
 * omit it, so a wikilink still shows with its distinct styling there but isn't clickable; wiring
 * navigation into those is a smaller, separate follow-up if wanted, not required for this slice.
 * Accent color is hardcoded to legacy's own default terracotta swatch (`#c2553d`) rather than a
 * real `var(--accent)` -- same reasoning as the other hardcoded colors in this file already:
 * `web/` has no theme/accent-customization system yet.
 */

const ACCENT = '#c2553d';

const SEGMENT_STYLES: Record<SemanticSegmentType, CSSProperties> = {
  text: {},
  code: {
    fontFamily: "'Fira Code', Consolas, 'Courier New', monospace",
    color: '#4a3a8a'
  },
  section: {
    color: '#3a52a8',
    fontWeight: 400
  },
  note: {
    display: 'inline-flex',
    alignItems: 'center',
    color: '#73716b',
    fontWeight: 500,
    fontSize: '0.82em',
    background: 'rgba(115, 113, 107, 0.13)',
    padding: '1px 7px',
    borderRadius: 999,
    margin: '0 1px',
    verticalAlign: 'middle',
    lineHeight: 1.5
  },
  alert: {
    color: '#b02020',
    fontWeight: 400
  },
  link: {
    display: 'inline',
    padding: '1px 3px',
    margin: '0 -1px',
    borderRadius: 4,
    background: 'rgba(194, 85, 61, 0.12)',
    color: ACCENT,
    fontWeight: 500
  }
};

export function NodeText({ text, onLinkClick }: { text: string; onLinkClick?: (target: string) => void }) {
  const segments = parseSemanticMarkup(text);
  if (segments.length === 0) {
    return <span style={{ color: '#bbb' }}>(empty)</span>;
  }
  return (
    <>
      {segments.map((seg, i) =>
        seg.type === 'link' ? (
          <span
            key={i}
            style={{ ...SEGMENT_STYLES.link, cursor: onLinkClick ? 'pointer' : 'default' }}
            onClick={
              onLinkClick
                ? (e) => {
                    e.stopPropagation();
                    onLinkClick(seg.target ?? seg.text);
                  }
                : undefined
            }
          >
            {seg.text}
          </span>
        ) : (
          <span key={i} style={SEGMENT_STYLES[seg.type]}>
            {seg.text}
          </span>
        )
      )}
    </>
  );
}
