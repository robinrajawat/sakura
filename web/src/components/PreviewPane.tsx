import { useOutlineStore } from '../store/outlineStore';
import { useThemeStore, THEME_TOKENS } from '../store/themeStore';
import { NodeText } from './NodeText';
import { sanitizeRichHtml } from '../utils/sanitizeRichHtml';

/**
 * Phase 3 slice (docs/framework-migration-plan.md): Preview Mode. A read-only rendered view of
 * the whole tree (every node, ignoring fold state -- unlike the editor, a folded subtree still
 * belongs in the document). Deliberately scoped way down from legacy's real renderPreviewBody:
 * no table of contents, no decision-log detection/grouping, no Presenter Mode slide deck, no
 * word-count/author/updated-at meta header. Each a real, separately-scoped follow-up if this
 * feature needs to grow toward parity later.
 */
export function PreviewPane() {
  const nodes = useOutlineStore((s) => s.nodes);
  const theme = useThemeStore((s) => s.theme);
  const t = THEME_TOKENS[theme];

  if (!nodes.length) {
    return <div style={{ color: t.mutedText, fontStyle: 'italic' }}>This document is empty.</div>;
  }

  return (
    <div style={{ fontFamily: 'sans-serif', color: t.text, lineHeight: 1.6 }}>
      {nodes.map((node) => (
        <div key={node.id} style={{ paddingLeft: `${node.depth * 24}px`, marginBottom: 4 }}>
          <div style={{ textDecoration: node.isCheckbox && node.checked ? 'line-through' : 'none' }}>
            {node.isCheckbox && (
              <input type="checkbox" checked={node.checked} disabled style={{ marginRight: 6 }} />
            )}
            {node.text ? <NodeText text={node.text} /> : <span style={{ color: t.mutedText }}>(empty)</span>}
          </div>
          {node.note && (
            <div
              style={{ fontSize: 13, color: t.mutedText, fontStyle: 'italic' }}
              // node.note is real HTML now (Phase 6.3 rich-text slice) -- sanitized again here
              // (belt-and-suspenders on top of the sanitize-on-write in NotePanel.tsx) since
              // this is the one place it's rendered via dangerouslySetInnerHTML.
              dangerouslySetInnerHTML={{ __html: sanitizeRichHtml(node.note) }}
            />
          )}
          {node.codeBlock && (
            <pre
              style={{
                background: t.codeBg,
                padding: 6,
                borderRadius: 4,
                fontSize: 13,
                overflowX: 'auto',
                maxWidth: '90%'
              }}
            >
              {node.codeBlock.code}
            </pre>
          )}
        </div>
      ))}
    </div>
  );
}
