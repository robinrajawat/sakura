import { useThemeStore, THEME_TOKENS } from '../store/themeStore';
import { useOutlinePrefsStore } from '../store/outlinePrefsStore';

/**
 * §6.7/§6.10 slice (docs/phase6-full-parity-plan.md): `web/`'s first real Settings surface.
 * Direct port of legacy's real `#settings-panel` dropdown-from-button UX (legacy/index.html:
 * 4606-4607) -- a panel anchored under a "Settings" toolbar button, toggled open/closed by the
 * same click. Deliberately minimal: legacy's own real panel has a multi-category rail
 * (Appearance/Presets & modes/Bars & menus/Panels/Hub/Editing/Data & backup, legacy/index.html:
 * 4622-4650) with dozens of settings; this first slice is a single flat section holding only
 * the three prefs that already have a real, existing consumer (`outlinePrefsStore.ts`'s own
 * header explains exactly why those three and not the rest of legacy's "layout controls"/
 * "Editor's Choice" list -- most of the rest need real new rendering infrastructure built in
 * `OutlineTree.tsx` first, not just a preference toggle). The rail/multi-category navigation is
 * a real, separately-scoped follow-up as more settings get real backing state to show.
 *
 * The accent-color/node-text-color/System-auto-theme controls landed earlier this session live
 * in `App.tsx`'s header directly rather than here, since they were built before this panel
 * existed -- consolidating them into this panel (matching legacy's own real layout, where they
 * DO live inside `#settings-panel`) is a real, separately-scoped follow-up, not attempted in
 * this slice to avoid touching already-shipped, already-verified controls.
 */
export function SettingsPanel({ onClose }: { onClose: () => void }) {
  const theme = useThemeStore((s) => s.theme);
  const t = THEME_TOKENS[theme];
  const treeIndentWidth = useOutlinePrefsStore((s) => s.treeIndentWidth);
  const setTreeIndentWidth = useOutlinePrefsStore((s) => s.setTreeIndentWidth);
  const hideTreeLines = useOutlinePrefsStore((s) => s.hideTreeLines);
  const setHideTreeLines = useOutlinePrefsStore((s) => s.setHideTreeLines);
  const outlineNumbering = useOutlinePrefsStore((s) => s.outlineNumbering);
  const setOutlineNumbering = useOutlinePrefsStore((s) => s.setOutlineNumbering);

  return (
    <div
      role="dialog"
      aria-label="Settings"
      style={{
        position: 'absolute',
        top: 'calc(100% + 8px)',
        right: 0,
        zIndex: 120,
        width: 320,
        maxWidth: '92vw',
        background: t.background,
        border: `1px solid ${t.border}`,
        borderRadius: 12,
        boxShadow: '0 14px 28px rgba(0,0,0,.12)',
        padding: '14px 16px',
        fontFamily: 'sans-serif',
        color: t.text
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <h3 style={{ fontSize: 13, margin: 0 }}>Settings</h3>
        <button type="button" onClick={onClose} aria-label="Close settings" title="Close" style={{ fontSize: 11 }}>
          ✕
        </button>
      </div>
      <div
        style={{
          fontSize: 12,
          fontWeight: 700,
          letterSpacing: '.04em',
          textTransform: 'uppercase',
          color: t.mutedText,
          margin: '0 0 8px',
          paddingBottom: 6,
          borderBottom: `1px solid ${t.border}`
        }}
      >
        Export formatting
      </div>
      <div style={{ display: 'grid', gap: 12, fontSize: 12 }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span>Tree indent width ({treeIndentWidth})</span>
          <input
            type="range"
            min={2}
            max={6}
            step={1}
            value={treeIndentWidth}
            onChange={(e) => setTreeIndentWidth(Number(e.currentTarget.value))}
            aria-label="Tree indent width"
          />
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input type="checkbox" checked={hideTreeLines} onChange={(e) => setHideTreeLines(e.currentTarget.checked)} aria-label="Hide tree lines" />
          <span>
            Hide tree lines
            <div style={{ fontSize: 11, color: t.mutedText }}>
              Clean indented view in .txt/clipboard exports, no │├└─ connectors. Indentation stays the same either way.
            </div>
          </span>
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input
            type="checkbox"
            checked={outlineNumbering}
            onChange={(e) => setOutlineNumbering(e.currentTarget.checked)}
            aria-label="Outline numbering"
          />
          <span>
            Outline numbering
            <div style={{ fontSize: 11, color: t.mutedText }}>Adds dotted outline numbers (1, 1.1, 1.2, ...) to .txt/.md/clipboard exports.</div>
          </span>
        </label>
      </div>
    </div>
  );
}
