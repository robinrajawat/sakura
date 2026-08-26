import type { CSSProperties } from 'react';
import { parseSemanticMarkup, type SemanticSegmentType } from '../utils/parseSemanticMarkup';

/**
 * Phase 2 slice (docs/framework-migration-plan.md). Renders a node's text with the semantic
 * markup styling documented under "Core Editing" in the README, using `parseSemanticMarkup`
 * (see that file's own header for why it's a fresh, faithful match of legacy's hand-written
 * `parseStyledText` rather than a reuse of the already-ported `parseInlineSegments.ts`, which
 * serves a different consumer with different requirements).
 *
 * Colors below read the real CSS custom properties `themeStore.ts`'s `applyCssVariables` sets on
 * `document.body` (`--sem-section`, `--sem-alert`, `--sem-code`, `--muted`, `--accent`) rather
 * than baking in one theme's literal hex values -- matching legacy's own real `.sem-chip`/
 * `.sem-meta`/`.sem-alert-inline`/`.sem-code-inline`/`.sem-sap-note` CSS rules, which read the
 * exact same custom properties. (This file predates Phase 6.1's "Design tokens & app shell"
 * slice, which is what actually introduced those CSS custom properties; this §6.11 visual pass is
 * the follow-up that switches this component over to them now that they exist.) Layout properties
 * (padding, border-radius, font-family, font-weight) are copied directly from legacy's real CSS
 * rules, not reinvented.
 *
 * Phase 6.3 backlinks-groundwork addition: `link` segments (legacy's `.bl-link`,
 * legacy/index.html:2175) render with the same background-tinted/accent-colored pill styling.
 * `onLinkClick` is optional and only wired by the interactive outline editor (`OutlineTree.tsx`)
 * -- Presenter/Preview's read-only renders of `NodeText` (`PresenterMode.tsx`/`PreviewPane.tsx`)
 * omit it, so a wikilink still shows with its distinct styling there but isn't clickable; wiring
 * navigation into those is a smaller, separate follow-up if wanted, not required for this slice.
 */

const SEGMENT_STYLES: Record<SemanticSegmentType, CSSProperties> = {
  text: {},
  code: {
    fontFamily: "'Fira Code', Consolas, 'Courier New', monospace",
    color: 'var(--sem-code)'
  },
  section: {
    color: 'var(--sem-section)',
    fontWeight: 400
  },
  note: {
    display: 'inline-flex',
    alignItems: 'center',
    color: 'var(--muted)',
    fontWeight: 500,
    fontSize: '0.82em',
    background: 'color-mix(in srgb, var(--muted) 13%, transparent)',
    padding: '1px 7px',
    borderRadius: 999,
    margin: '0 1px',
    verticalAlign: 'middle',
    lineHeight: 1.5
  },
  alert: {
    color: 'var(--sem-alert)',
    fontWeight: 400
  },
  link: {
    display: 'inline',
    padding: '1px 3px',
    margin: '0 -1px',
    borderRadius: 4,
    background: 'color-mix(in srgb, var(--accent) 12%, transparent)',
    color: 'var(--accent)',
    fontWeight: 500
  }
};

export function NodeText({ text, onLinkClick }: { text: string; onLinkClick?: (target: string) => void }) {
  const segments = parseSemanticMarkup(text);
  if (segments.length === 0) {
    return <span style={{ color: 'var(--muted)' }}>(empty)</span>;
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
