import { useEffect, useRef } from 'react';
import { THEME_TOKENS } from '../store/themeStore';
import type { DecisionAnchorCandidate } from '../state/decisionLogQueries';

type Tokens = (typeof THEME_TOKENS)['light'];

/**
 * §6.7 slice (docs/phase6-full-parity-plan.md): the anchor-picker popover -- direct port of
 * legacy's real `#decision-anchor-suggest` (legacy/index.html:35111-35163's own
 * `renderDecisionAnchorSuggest`). Deliberately generic over `DecisionAnchorCandidate` rather than
 * a Decision-Log-specific shape: `getDecisionAnchorCandidatesCore` (already ported,
 * `decisionLogQueries.ts`) is the one real call site today, but the candidate shape
 * (`{id,text,taken,depth}`) is domain-agnostic, matching this project's own precedent of reusing
 * a single generic anchor helper across domains (`diagramAnchor.ts`'s `computeDiagramAnchorLabel`/
 * `reorderDiagramsCore`, both already reused for Decision Log directly).
 *
 * One real, deliberate simplification: legacy's own popover shows a full collapsible NODE TREE
 * when the search is empty, and only switches to `getDecisionAnchorCandidatesCore`'s flat,
 * depth-sorted list once there's a query (`buildAnchorTree`/`buildAnchorTreeItemEl`, a separate,
 * more complex collapsible-tree renderer this project hasn't ported). This component always uses
 * the flat, depth-indented list (the same pure function already handles the empty-query case --
 * every node, sorted depth-first, capped at 50) -- a real, honest scoping choice, not a silent
 * gap: the flat list is fully usable, just without expand/collapse branches for very large
 * documents.
 */
export function AnchorPicker({
  t,
  query,
  onQueryChange,
  candidates,
  onSelect,
  onClose
}: {
  t: Tokens;
  query: string;
  onQueryChange: (query: string) => void;
  candidates: DecisionAnchorCandidate[];
  onSelect: (nodeId: number | null) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent): void {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    function onEscape(e: KeyboardEvent): void {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('mousedown', onClickOutside);
    document.addEventListener('keydown', onEscape);
    return () => {
      document.removeEventListener('mousedown', onClickOutside);
      document.removeEventListener('keydown', onEscape);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      onMouseDown={(e) => e.stopPropagation()}
      style={{
        position: 'absolute',
        top: '100%',
        left: 0,
        marginTop: 2,
        minWidth: 240,
        maxWidth: 320,
        maxHeight: 260,
        overflowY: 'auto',
        background: t.background,
        border: `1px solid ${t.border}`,
        borderRadius: 8,
        boxShadow: '0 14px 28px rgba(0,0,0,.16)',
        zIndex: 95,
        padding: 4,
        font: "400 12px 'Inter', sans-serif"
      }}
    >
      <input
        autoFocus
        value={query}
        onChange={(e) => onQueryChange(e.currentTarget.value)}
        placeholder="Search nodes…"
        style={{ width: '100%', boxSizing: 'border-box', fontSize: 12, padding: '4px 6px', marginBottom: 4 }}
      />
      <div
        onMouseDown={(e) => {
          e.preventDefault();
          onSelect(null);
        }}
        style={{ padding: '6px 9px', borderRadius: 5, cursor: 'pointer', color: t.mutedText, fontStyle: 'italic' }}
        onMouseEnter={(ev) => (ev.currentTarget.style.background = t.hoverBg)}
        onMouseLeave={(ev) => (ev.currentTarget.style.background = 'transparent')}
      >
        Not linked to a node
      </div>
      {candidates.length === 0 && <div style={{ padding: '8px 9px', color: t.hintText }}>No matching nodes</div>}
      {candidates.map((c) => (
        <div
          key={c.id}
          title={c.taken ? 'This node already has a decision log — open it from the list, or clear its link first' : undefined}
          onMouseDown={(e) => {
            if (c.taken) return;
            e.preventDefault();
            onSelect(c.id);
          }}
          style={{
            padding: '6px 9px',
            paddingLeft: 8 + Math.min(c.depth, 6) * 10,
            borderRadius: 5,
            cursor: c.taken ? 'not-allowed' : 'pointer',
            color: c.taken ? t.hintText : t.text,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis'
          }}
          onMouseEnter={(ev) => {
            if (!c.taken) ev.currentTarget.style.background = t.hoverBg;
          }}
          onMouseLeave={(ev) => (ev.currentTarget.style.background = 'transparent')}
        >
          {c.text}
          {c.taken ? ' — already has one' : ''}
        </div>
      ))}
    </div>
  );
}
