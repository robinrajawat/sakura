import { useThemeStore, THEME_TOKENS } from '../store/themeStore';
import { useEscapeToClose } from '../utils/useEscapeToClose';
import { CloseIcon, BookIcon } from '../icons';

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
 *
 * §8.4g retrofit (docs/phase8-design-system-parity-plan.md): renders through the real
 * `.app-modal-overlay`/`.app-modal`/`.app-modal-head`/`.app-modal-close-btn`/`.app-modal-body`
 * classes (index.css) -- same generic dialog shell as `FeedbackModal.tsx`/`AboutModal.tsx`, reused
 * here for the same reason `AboutModal.tsx` does: this placeholder renders the identical shape,
 * even though legacy's own real Help target (`#help-panel`) is a different, anchored-popover
 * component this slice isn't attempting to port (see this file's own header above). `<BookIcon>`
 * in the title reuses the same icon already used for this entry's own row in `AccountMenu.tsx`'s
 * dropdown.
 */
export function HelpModal({ onClose }: { onClose: () => void }) {
  const theme = useThemeStore((s) => s.theme);
  const t = THEME_TOKENS[theme];
  useEscapeToClose(onClose);

  return (
    <div role="dialog" aria-label="Help" aria-modal="true" className="app-modal-overlay" onClick={onClose}>
      <div className="app-modal" style={{ width: 'min(420px, 94vw)' }} onClick={(e) => e.stopPropagation()}>
        <div className="app-modal-head">
          <h2 style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <BookIcon width={15} height={15} stroke="var(--accent)" />
            Help
          </h2>
          <button type="button" className="app-modal-close-btn" onClick={onClose} aria-label="Close" title="Close">
            <CloseIcon />
          </button>
        </div>
        <div className="app-modal-body" style={{ fontSize: 12.5, lineHeight: 1.6, color: t.mutedText }}>
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
