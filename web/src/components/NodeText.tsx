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
 */

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
  }
};

export function NodeText({ text }: { text: string }) {
  const segments = parseSemanticMarkup(text);
  if (segments.length === 0) {
    return <span style={{ color: '#bbb' }}>(empty)</span>;
  }
  return (
    <>
      {segments.map((seg, i) => (
        <span key={i} style={SEGMENT_STYLES[seg.type]}>
          {seg.text}
        </span>
      ))}
    </>
  );
}
