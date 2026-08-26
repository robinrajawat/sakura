import { useEffect, useState, type ReactNode } from 'react';
import { useAuthStore } from '../store/authStore';
import { useProfileStore } from '../store/profileStore';
import { useNotificationsStore } from '../store/notificationsStore';
import { useThemeStore, THEME_TOKENS } from '../store/themeStore';
import type { SettingsCategory } from './SettingsPanel';
import { DropdownMenu } from './DropdownMenu';
import { FeedbackModal } from './FeedbackModal';
import { HelpModal } from './HelpModal';
import { AboutModal } from './AboutModal';

type Tokens = (typeof THEME_TOKENS)['light'];

function MenuItem({ onClick, danger, t, children }: { onClick: () => void; danger?: boolean; t: Tokens; children: ReactNode }) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      style={{
        display: 'block',
        width: '100%',
        textAlign: 'left',
        background: 'none',
        border: 'none',
        borderRadius: 6,
        padding: '7px 8px',
        font: 'inherit',
        fontSize: 12.5,
        color: danger ? 'var(--fc-red)' : t.text,
        cursor: 'pointer'
      }}
    >
      {children}
    </button>
  );
}

function Divider({ t }: { t: Tokens }) {
  return <div style={{ height: 1, background: t.border, margin: '4px 0' }} />;
}

function Avatar({ user, size, t }: { user: { photoURL: string | null; displayName: string | null; email: string | null }; size: number; t: Tokens }) {
  if (user.photoURL) {
    return <img src={user.photoURL} alt="" width={size} height={size} style={{ borderRadius: '50%', display: 'block', flexShrink: 0 }} />;
  }
  const initial = (user.displayName || user.email || '?').charAt(0).toUpperCase();
  return (
    <span
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: t.hoverBg,
        color: t.text,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: size * 0.5,
        fontWeight: 700,
        flexShrink: 0
      }}
    >
      {initial}
    </span>
  );
}

/**
 * §7.6 slice (docs/phase7-app-shell-and-dashboard-plan.md): the real header account entry point --
 * direct port of legacy's real `#account-toggle`/`#account-menu` (legacy/index.html:4558-4569): a
 * toggle button (avatar + green status dot when signed in, a plain "Sign in" label when not) that
 * opens an anchored dropdown, replacing `AuthPanel.tsx`'s old plain inline block at the bottom of
 * the vertical panel dump (`AuthPanel.tsx` itself is retired by this slice -- this component picks
 * up its three mount-time effects verbatim, since it's now the one thing in `App.tsx` always
 * mounted in its place: `authStore.init()`, `notificationsStore.init()`, and the
 * `profileStore.ensureProfile`/`reset` pair that keeps a signed-in user's `profiles/{uid}` doc
 * current).
 *
 * Scoped to what legacy's own dropdown actually has real content for in `web/` today: signed-out
 * shows the same "sync is optional" blurb plus a "Sign in" entry (reopens `SignInGate.tsx` via
 * `authStore.ts`'s new `openLandingGate()` -- see that store's own header), NOT the inline
 * email-form `AuthPanel.tsx` used to embed here (legacy's own dropdown doesn't either; the full
 * form only ever lives in the landing overlay). Signed-in shows avatar/name/email, "Manage
 * account" (opens Settings on its real "account" category, where `ProfileVisibilitySettings.tsx`
 * already lives) and "Sign out". Below that: "Settings" (opens Settings on its default category),
 * a Help section ("Help"/"Send Feedback"/"About Sakura" -- see each modal's own header for how
 * much of legacy's real target each faithfully covers vs. deliberately stubs), and the same
 * Ko-fi support blurb/button legacy's own dropdown ends with. Deliberately NOT ported: the
 * profile-visibility badge inline in the signed-in header row -- it already has a real home in
 * Settings → Account (`ProfileVisibilitySettings.tsx`), so duplicating it here would just be two
 * copies of the same toggle to keep in sync, not a new gap.
 */
export function AccountMenu({ onOpenSettings }: { onOpenSettings: (category?: SettingsCategory) => void }) {
  const user = useAuthStore((s) => s.user);
  const loading = useAuthStore((s) => s.loading);
  const init = useAuthStore((s) => s.init);
  const signOut = useAuthStore((s) => s.signOut);
  const openLandingGate = useAuthStore((s) => s.openLandingGate);
  const ensureProfile = useProfileStore((s) => s.ensureProfile);
  const resetProfile = useProfileStore((s) => s.reset);
  const initNotifications = useNotificationsStore((s) => s.init);
  const theme = useThemeStore((s) => s.theme);
  const t = THEME_TOKENS[theme];

  const [open, setOpen] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);

  useEffect(() => {
    init();
    // Same "call once per app lifetime" convention AuthPanel.tsx's own effect used -- init() is
    // idempotent (authStore.ts's own inited guard), and this is now the one place it's called
    // from an always-mounted header component.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    initNotifications();
  }, [initNotifications]);

  useEffect(() => {
    if (user) void ensureProfile(user);
    else resetProfile();
    // ensureProfile/resetProfile are stable store actions -- same reasoning AuthPanel.tsx's own
    // [user]-only effect gave.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  function goToSettings(category?: SettingsCategory): void {
    setOpen(false);
    onOpenSettings(category);
  }

  return (
    <div style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title="Account & sync"
        aria-haspopup="true"
        aria-expanded={open}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
      >
        {user ? (
          <span style={{ position: 'relative', display: 'inline-flex' }}>
            <Avatar user={user} size={20} t={t} />
            <span
              aria-hidden="true"
              style={{ position: 'absolute', bottom: -1, right: -1, width: 7, height: 7, borderRadius: '50%', background: '#2ecc71', border: `1.5px solid ${t.background}` }}
            />
          </span>
        ) : (
          <span style={{ fontSize: 12.5 }}>Sign in</span>
        )}
      </button>
      {open && (
        <DropdownMenu onClose={() => setOpen(false)} width={230} align="right">
          {loading ? (
            <div style={{ padding: '8px 10px', fontSize: 12, color: t.mutedText }}>Checking sign-in status...</div>
          ) : user ? (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px 8px' }}>
                <Avatar user={user} size={32} t={t} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {user.displayName || user.email}
                  </div>
                  {user.displayName && (
                    <div style={{ fontSize: 11, color: t.mutedText, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user.email}</div>
                  )}
                </div>
              </div>
              <MenuItem t={t} onClick={() => goToSettings('account')}>
                Manage account
              </MenuItem>
              <MenuItem
                t={t}
                danger
                onClick={() => {
                  setOpen(false);
                  void signOut();
                }}
              >
                Sign out
              </MenuItem>
            </>
          ) : (
            <div style={{ padding: '4px 6px 8px' }}>
              <div style={{ fontSize: 11, lineHeight: 1.5, color: t.mutedText, marginBottom: 8 }}>
                Sign in to sync everything — documents, Hub, and settings — across devices. Fully optional — everything keeps working
                locally if you skip this.
              </div>
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  openLandingGate();
                }}
                style={{ width: '100%', fontWeight: 600 }}
              >
                Sign in
              </button>
            </div>
          )}
          <Divider t={t} />
          <MenuItem t={t} onClick={() => goToSettings()}>
            Settings
          </MenuItem>
          <Divider t={t} />
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase', color: t.mutedText, padding: '2px 8px 4px' }}>Help</div>
          <MenuItem
            t={t}
            onClick={() => {
              setOpen(false);
              setHelpOpen(true);
            }}
          >
            Help
          </MenuItem>
          <MenuItem
            t={t}
            onClick={() => {
              setOpen(false);
              setFeedbackOpen(true);
            }}
          >
            Send Feedback
          </MenuItem>
          <MenuItem
            t={t}
            onClick={() => {
              setOpen(false);
              setAboutOpen(true);
            }}
          >
            About Sakura
          </MenuItem>
          <Divider t={t} />
          <div style={{ padding: '0 8px 6px', fontSize: 10.5, lineHeight: 1.5, color: t.mutedText }}>
            Sakura stays free, with no ads and no locked features — built by one person in their spare time. A tip is appreciated
            but never expected.
          </div>
          <div style={{ padding: '0 6px 4px' }}>
            <button
              type="button"
              onClick={() => window.open('https://ko-fi.com/robinrajawat', '_blank', 'noopener,noreferrer')}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                padding: '7px 10px',
                border: 'none',
                borderRadius: 8,
                font: "700 12px 'Inter', sans-serif",
                color: '#4a3208',
                cursor: 'pointer',
                background: 'linear-gradient(160deg,#f0c869,#d4a544)'
              }}
            >
              ☕ Buy me a coffee
            </button>
          </div>
        </DropdownMenu>
      )}
      {feedbackOpen && <FeedbackModal onClose={() => setFeedbackOpen(false)} />}
      {helpOpen && <HelpModal onClose={() => setHelpOpen(false)} />}
      {aboutOpen && <AboutModal onClose={() => setAboutOpen(false)} />}
    </div>
  );
}
