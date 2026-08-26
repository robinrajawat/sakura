import { useThemeStore, THEME_TOKENS } from '../store/themeStore';
import { useEscapeToClose } from '../utils/useEscapeToClose';
import { CloseIcon } from '../icons';

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
 */
export function AboutModal({ onClose }: { onClose: () => void }) {
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
        aria-label="About Sakura"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: t.background,
          color: t.text,
          border: `1px solid ${t.border}`,
          borderRadius: 12,
          padding: 20,
          width: 440,
          maxWidth: '92vw',
          boxShadow: '0 20px 40px rgba(0,0,0,.25)',
          fontFamily: "'Inter', sans-serif"
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 6 }}>
          <h3 style={{ margin: 0, fontSize: 15 }}>About Sakura</h3>
          <button type="button" onClick={onClose} aria-label="Close" title="Close">
            <CloseIcon />
          </button>
        </div>
        <div style={{ fontSize: 12, lineHeight: 1.6, color: t.mutedText, display: 'grid', gap: 8 }}>
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
