import { useOutlinePrefsStore, type QuickInsertActionId } from '../store/outlinePrefsStore';
import type { ThemeTokens } from '../store/themeStore';

/**
 * §6.10 slice (docs/phase6-full-parity-plan.md): the "Quick Insert" section of Settings — direct
 * port of legacy's real Quick Insert settings block (legacy/index.html:5023-5029's own
 * `settings-section-title`/icon-only-row toggle/actions grid, plus the master enable toggle at
 * legacy/index.html:5486, which legacy places under Settings → Features rather than here — kept
 * together in this one section instead, since `web/` has no separate Features page yet). Backs
 * `OutlineTree.tsx`'s Quick Insert popup, which existed since Phase 6.2 but hardcoded every one of
 * these (always on, always full-label, all 7 actions, no way to turn any of it off) until this
 * slice gave it real settings to read.
 */
const QUICK_INSERT_ACTION_LABELS: { id: QuickInsertActionId; label: string }[] = [
  { id: 'emdash', label: 'Em dash (—)' },
  { id: 'endash', label: 'En dash (–)' },
  { id: 'arrow', label: 'Arrow (➜)' },
  { id: 'checkmark', label: 'Check mark (✓)' },
  { id: 'crossmark', label: 'Cross mark (✗)' },
  { id: 'middot', label: 'Middle dot (·)' },
  { id: 'date-time', label: 'Date/time' }
];

export function QuickInsertSettings({ t }: { t: ThemeTokens }) {
  const enabled = useOutlinePrefsStore((s) => s.quickInsertEnabled);
  const setEnabled = useOutlinePrefsStore((s) => s.setQuickInsertEnabled);
  const iconOnly = useOutlinePrefsStore((s) => s.quickInsertIconOnly);
  const setIconOnly = useOutlinePrefsStore((s) => s.setQuickInsertIconOnly);
  const actions = useOutlinePrefsStore((s) => s.quickInsertActions);
  const setActionEnabled = useOutlinePrefsStore((s) => s.setQuickInsertActionEnabled);

  const sectionHeaderStyle: React.CSSProperties = {
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: '.04em',
    textTransform: 'uppercase',
    color: t.mutedText,
    margin: '16px 0 8px',
    paddingBottom: 6,
    borderBottom: `1px solid ${t.border}`
  };

  return (
    <>
      <div style={sectionHeaderStyle}>Quick Insert</div>
      <div style={{ display: 'grid', gap: 10, fontSize: 12 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.currentTarget.checked)} aria-label="Enable Quick Insert" />
          <span>
            Quick Insert
            <div style={{ fontSize: 11, color: t.mutedText }}>
              Ctrl/Cmd+Space opens a small character-insert menu while editing a node — em dash, en dash, arrow, check mark, cross mark, middle
              dot, date/time.
            </div>
          </span>
        </label>

        {enabled && (
          <>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, paddingLeft: 24 }}>
              <input type="checkbox" checked={iconOnly} onChange={(e) => setIconOnly(e.currentTarget.checked)} aria-label="Icon-only row" />
              <span>
                Icon-only row
                <div style={{ fontSize: 11, color: t.mutedText }}>Shows the menu as a compact row of icons instead of a vertical list with labels.</div>
              </span>
            </label>

            <div style={{ paddingLeft: 24, display: 'grid', gap: 4 }}>
              <span style={{ color: t.mutedText }}>Menu items</span>
              {QUICK_INSERT_ACTION_LABELS.map((item) => (
                <label key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input
                    type="checkbox"
                    checked={actions.includes(item.id)}
                    onChange={(e) => setActionEnabled(item.id, e.currentTarget.checked)}
                    aria-label={`Enable ${item.label}`}
                  />
                  <span>{item.label}</span>
                </label>
              ))}
            </div>
          </>
        )}
      </div>
    </>
  );
}
