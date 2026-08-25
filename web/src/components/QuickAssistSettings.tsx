import { useOutlinePrefsStore } from '../store/outlinePrefsStore';
import type { ThemeTokens } from '../store/themeStore';

/**
 * §6.10 slice 3 (docs/phase6-full-parity-plan.md): the "Quick Assist" section of Settings --
 * legacy's own real master toggle lives under Settings → Features (`quickassist-feature` in
 * `QA_COMMANDS` itself, legacy/index.html:17066), which `web/` doesn't have a separate page for --
 * kept alongside `QuickInsertSettings.tsx` here instead, same reasoning that section's own header
 * already gives for its own master toggle's placement.
 */
export function QuickAssistSettings({ t }: { t: ThemeTokens }) {
  const enabled = useOutlinePrefsStore((s) => s.quickAssistEnabled);
  const setEnabled = useOutlinePrefsStore((s) => s.setQuickAssistEnabled);

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
      <div style={sectionHeaderStyle}>Quick Assist</div>
      <div style={{ display: 'grid', gap: 10, fontSize: 12 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.currentTarget.checked)} aria-label="Enable Quick Assist" />
          <span>
            Quick Assist
            <div style={{ fontSize: 11, color: t.mutedText }}>
              Ctrl/Cmd+K opens a command box -- type a plain-language phrase like "hide file explorer" or "toggle dark mode" to flip a setting, or
              "duplicate node" / "rewrite this node" to run an action.
            </div>
          </span>
        </label>
      </div>
    </>
  );
}
