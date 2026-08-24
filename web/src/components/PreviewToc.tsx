import { useThemeStore, THEME_TOKENS } from '../store/themeStore';
import type { TocEntry } from '../state/previewToc';

/**
 * §6.6 slice (docs/phase6-full-parity-plan.md): Preview's table-of-contents sidebar, direct
 * port of legacy's real `#preview-toc` panel (legacy/index.html:7570,37957+) -- one row per
 * `TocEntry` (`previewToc.ts`), indented by heading level, the active entry highlighted by
 * `PreviewPane.tsx`'s own scroll-spy. Deliberately scoped down from legacy's real panel: no
 * collapse/resize handle (legacy's `#preview-toc-resize-handle`/`.collapsed` state), no
 * Decision Log section (`#preview-toc-dlog-label`+entries -- Decision Log detection isn't
 * ported to Preview at all in this project yet), same "honest first pass, simpler chrome"
 * convention every other Pad/Hub panel in this project already uses.
 */
export function PreviewToc({ entries, activeId, onSelect }: { entries: TocEntry[]; activeId: number | null; onSelect: (id: number) => void }) {
  const theme = useThemeStore((s) => s.theme);
  const t = THEME_TOKENS[theme];

  if (entries.length === 0) return null;

  return (
    <nav
      aria-label="Table of contents"
      style={{
        width: 200,
        flex: '0 0 200px',
        overflowY: 'auto',
        borderRight: `1px solid ${t.border}`,
        padding: '12px 8px 40px 16px'
      }}
    >
      <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.07em', color: t.hintText, padding: '0 0 8px 2px' }}>
        Contents
      </div>
      {entries.map((entry) => (
        <button
          key={entry.id}
          type="button"
          data-target={`pv-anchor-${entry.id}`}
          onClick={() => onSelect(entry.id)}
          style={{
            display: 'block',
            width: '100%',
            textAlign: 'left',
            border: 'none',
            background: 'none',
            cursor: 'pointer',
            padding: '4px 6px',
            marginBottom: 1,
            borderRadius: 6,
            fontSize: entry.kind === 'section' ? 12.5 : 12,
            fontWeight: entry.kind === 'section' || activeId === entry.id ? 700 : 400,
            paddingLeft: entry.kind === 'section' ? 6 : 6 + (entry.level - 1) * 12,
            color: activeId === entry.id ? 'var(--accent)' : t.mutedText
          }}
        >
          {entry.text}
        </button>
      ))}
    </nav>
  );
}
