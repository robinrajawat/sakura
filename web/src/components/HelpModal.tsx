import { useThemeStore, THEME_TOKENS } from '../store/themeStore';
import { useEscapeToClose } from '../utils/useEscapeToClose';

/**
 * §7.6 slice (docs/phase7-app-shell-and-dashboard-plan.md): "Help", one of the account
 * dropdown's real entries (legacy/index.html:4558-4569's `account-help-btn`). Legacy's own real
 * target is a large searchable multi-category help center (`#help-panel`,
 * legacy/index.html:5563+ -- Get Started/General/Presets & modes/Bars & menus/Panels/Hub/Editing/
 * and more, each with its own long-form content) -- porting that whole system is real,
 * separately-scoped work, the same category of deferral this plan's own header already allows
 * for the Guided-tour/demo content (docs/phase7-app-shell-and-dashboard-plan.md's own intro).
 * This is the small, honest placeholder the entry point needs in the meantime: a short pointer
 * to what's covered elsewhere already (the always-visible keyboard-shortcut list under the
 * toolbar, `ul` in `App.tsx`) plus the same repo link legacy's own About section gives, rather
 * than either faking a full help center or leaving "Help" a dead click.
 */
export function HelpModal({ onClose }: { onClose: () => void }) {
  const theme = useThemeStore((s) => s.theme);
  const t = THEME_TOKENS[theme];
  useEscapeToClose(onClose);

  return (
    <div
      role="presentation"
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.35)', zIndex: 220, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
    >
      <div
        role="dialog"
        aria-label="Help"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: t.background,
          color: t.text,
          border: `1px solid ${t.border}`,
          borderRadius: 12,
          padding: 20,
          width: 420,
          maxWidth: '92vw',
          boxShadow: '0 20px 40px rgba(0,0,0,.25)',
          fontFamily: "'Inter', sans-serif"
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 10 }}>
          <h3 style={{ margin: 0, fontSize: 15 }}>Help</h3>
          <button type="button" onClick={onClose} aria-label="Close" title="Close" style={{ fontSize: 11 }}>
            ✕
          </button>
        </div>
        <div style={{ fontSize: 12.5, lineHeight: 1.6, color: t.mutedText }}>
          <p style={{ margin: '0 0 8px' }}>
            Click to select a row, double-click to edit. <kbd>Enter</kbd> adds a sibling, <kbd>Ctrl/Cmd+Enter</kbd> a child,{' '}
            <kbd>Tab</kbd>/<kbd>Shift+Tab</kbd> indents/outdents, and dragging a row onto another lets you drop it above, below, or nested
            inside — the full list stays visible under the toolbar while a document is open.
          </p>
          <p style={{ margin: 0 }}>
            A full searchable help center (like legacy's own) isn't built here yet — questions or issues in the meantime are welcome at{' '}
            <a href="https://github.com/robinrajawat/sakura" target="_blank" rel="noopener noreferrer">
              github.com/robinrajawat/sakura
            </a>
            , or via Send Feedback in this same menu.
          </p>
        </div>
      </div>
    </div>
  );
}
