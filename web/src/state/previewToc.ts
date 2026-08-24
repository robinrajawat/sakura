import { isSectionNodeText } from '../core/nodeQueries';
import { stripSemanticMarkers } from '../utils/stripSemanticMarkers';

/**
 * §6.6 slice (docs/phase6-full-parity-plan.md): Preview's table of contents, direct port of the
 * TOC-entry half of legacy's real `renderPreviewBody` (legacy/index.html:37483-37551's
 * `tocEntries.push(...)` calls) -- a section (`[Section]` markup) always contributes a level-1
 * entry, a heading (`node.styles.heading`, 1-6) contributes an entry at its own level, and every
 * other node contributes nothing. Deliberately NOT ported: `nodeIsSection`'s
 * `sectionMarkersDepthZero` preference (whether a bare top-level node also counts as a section)
 * -- no Settings panel exists anywhere in `web/` yet to hold that toggle (§6.10 not started), so
 * this uses the narrower, always-correct half of the check (`isSectionNodeText`, explicit
 * `[Section]` markup only) rather than guessing a default for a preference this project can't
 * yet expose. Slide-divider nodes are also skipped here -- legacy's own divider TOC entries
 * (`kind:'divider'`, legacy/index.html:37532) exist specifically to navigate Presenter Mode's
 * slide deck, a separate follow-up (Presenter Mode's own laser pointer/blackout/grid/etc. are
 * still §6.6's own remaining, unscoped items) rather than something Preview's read-through TOC
 * needs.
 */

export interface TocEntry {
  id: number;
  text: string;
  level: number;
  kind: 'section' | 'heading';
}

export interface TocSourceNode {
  id: number;
  text?: string | null;
  styles: { heading: number };
}

/** Matches legacy's own real per-entry label logic exactly: a section's label strips its
 * `[...]` brackets before stripping semantic markers (legacy/index.html:37540-37544); a
 * heading's label strips semantic markers directly off the raw text
 * (legacy/index.html:37507-ish pattern, same `stripSemanticMarkers` treatment every other
 * label-producing call site in this project already uses). Both fall back to 'Untitled' for an
 * empty result, matching legacy's own `||'Untitled'`/`||sectionText` fallbacks. */
export function buildTocEntries(nodes: TocSourceNode[]): TocEntry[] {
  const entries: TocEntry[] = [];
  for (const node of nodes) {
    const raw = String(node.text || '');
    if (isSectionNodeText(raw)) {
      const bracketless = raw.trim().replace(/^\[|\]$/g, '');
      const label = stripSemanticMarkers(bracketless).trim() || bracketless;
      entries.push({ id: node.id, text: label, level: 1, kind: 'section' });
    } else if (node.styles.heading > 0) {
      const label = stripSemanticMarkers(raw).trim() || 'Untitled';
      entries.push({ id: node.id, text: label, level: node.styles.heading, kind: 'heading' });
    }
  }
  return entries;
}
