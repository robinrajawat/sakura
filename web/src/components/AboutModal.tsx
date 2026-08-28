import { useThemeStore, THEME_TOKENS } from '../store/themeStore';
import { useEscapeToClose } from '../utils/useEscapeToClose';
import { CloseIcon, InfoIcon } from '../icons';

/**
 * §7.6 slice (docs/phase7-app-shell-and-dashboard-plan.md): "About Sakura", one of the account
 * dropdown's real entries -- direct port of legacy's real Settings → About section content
 * (legacy/index.html:5527-5537, the `settings-section-about`/`about-privacy` blocks), as a
 * standalone modal rather than a Settings category (`web/`'s own `SettingsPanel.tsx` has no
 * "about" category -- see that file's own header for why only general/editing/ai/data/account
 * exist today; adding a 6th purely to hold static copy isn't worth it when a small standalone
 * modal, matching this project's established `RestructureTextDialog.tsx`-style "purpose-built
 * overlay, not a generic modal system" convention, does the same job). Copy is legacy's own text
 * verbatim (copyright line, source/license links, privacy summary), not paraphrased -- the one
 * intentional omission is the "About → Support" section's Ko-fi button, since that same button
 * already lives one level up in `AccountMenu.tsx`'s own dropdown (legacy repeats it in both
 * places; this port doesn't).
 *
 * §8.4g retrofit (docs/phase8-design-system-parity-plan.md): renders through the real
 * `.app-modal-overlay`/`.app-modal`/`.app-modal-head`/`.app-modal-close-btn`/`.app-modal-body`
 * classes (index.css) -- the same generic dialog shell `FeedbackModal.tsx` uses for its own real
 * legacy-matched modal, reused here for visual consistency since this component renders the
 * identical shape (backdrop-centered box, header+close, body) even though legacy itself has no
 * standalone About modal to port 1:1 (see this file's own header above). `<InfoIcon>` in the
 * title reuses the same icon already used for this entry's own row in `AccountMenu.tsx`'s
 * dropdown, for the same self-consistency reason.
 */
export function AboutModal({ onClose }: { onClose: () => void }) {
  const theme = useThemeStore((s) => s.theme);
  const t = THEME_TOKENS[theme];
  useEscapeToClose(onClose);

  return (
    <div role="dialog" aria-label="About Sakura" aria-modal="true" className="app-modal-overlay" onClick={onClose}>
      <div className="app-modal" style={{ width: 'min(440px, 94vw)' }} onClick={(e) => e.stopPropagation()}>
        <div className="app-modal-head">
          <h2 style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <InfoIcon width={15} height={15} stroke="var(--accent)" />
            About Sakura
          </h2>
          <button type="button" className="app-modal-close-btn" onClick={onClose} aria-label="Close" title="Close">
            <CloseIcon />
          </button>
        </div>
        <div className="app-modal-body" style={{ fontSize: 12, lineHeight: 1.6, color: t.mutedText, display: 'grid', gap: 8 }}>
          <p style={{ margin: 0 }}>
            A knowledge-management workspace for structured documents and everyday personal productivity — To-Dos, Meeting Notes,
            Journal, Recap, and Library in the Hub.
          </p>
          <p style={{ margin: 0 }}>
            Works offline once loaded, no account required — sign in (Google or email) if you want your documents to follow you
            across devices, and use optional AI features with a provider of your choice.
          </p>
          <p style={{ margin: 0 }}>
            Everything is stored locally in your browser by default — nothing leaves this tab unless you sign in, turn on Cloud
            Backup, or use an AI feature. No analytics or tracking anywhere in Sakura, and other users can never access your data.
          </p>
          <p style={{ margin: 0 }}>
            Copyright © 2026 Robin Singh Rajawat. All rights reserved.{' '}
            <a href="https://github.com/robinrajawat/sakura" target="_blank" rel="noopener noreferrer">
              View source
            </a>{' '}
            ·{' '}
            <a href="https://github.com/robinrajawat/sakura/blob/main/LICENSE" target="_blank" rel="noopener noreferrer">
              License
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
