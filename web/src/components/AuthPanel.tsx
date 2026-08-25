import { useEffect, useState } from 'react';
import { useAuthStore } from '../store/authStore';
import { useProfileStore } from '../store/profileStore';
import { useNotificationsStore } from '../store/notificationsStore';
import { useThemeStore, THEME_TOKENS } from '../store/themeStore';

/**
 * Phase 4 slice (docs/framework-migration-plan.md): account/sync, part 1 -- auth panel. Sign
 * in/out only; no account settings, profile visibility, or account deletion yet (all real
 * features in legacy, each a separately-scoped follow-up).
 *
 * §6.8 slice: added email/password sign-in, direct port of legacy's real `wireEmailAuthForm`
 * (legacy/index.html:13920-13984) -- a collapsed-by-default "or use email" toggle revealing a
 * form with a sign-in/create-account mode switch, email + password inputs, and a "Forgot
 * password?" link. `authStore.ts`'s own header explains the real, considered reasoning for why
 * this ships safely even though the Email/Password provider might not be enabled in the
 * production Firebase project (a setting outside this file's control) -- worth reading there,
 * not repeated here. One real, deliberate simplification vs. legacy: legacy wires this exact
 * form into TWO separate DOM surfaces (a landing-page overlay and this account panel,
 * `wireEmailAuthForm('sakura-landing')`/`wireEmailAuthForm('account')`) with each surface's own
 * local form-scoped error text; `web/` has no landing/onboarding overlay at all yet (a real,
 * separately-scoped gap, not attempted here), so this is the one surface, and its error reuses
 * `authStore`'s own single shared `error` slot rather than a second local copy.
 */
export function AuthPanel() {
  const user = useAuthStore((s) => s.user);
  const loading = useAuthStore((s) => s.loading);
  const error = useAuthStore((s) => s.error);
  const init = useAuthStore((s) => s.init);
  const signInWithGoogle = useAuthStore((s) => s.signInWithGoogle);
  const signUpWithEmail = useAuthStore((s) => s.signUpWithEmail);
  const signInWithEmail = useAuthStore((s) => s.signInWithEmail);
  const sendPasswordReset = useAuthStore((s) => s.sendPasswordReset);
  const signOut = useAuthStore((s) => s.signOut);
  const ensureProfile = useProfileStore((s) => s.ensureProfile);
  const resetProfile = useProfileStore((s) => s.reset);
  const initNotifications = useNotificationsStore((s) => s.init);
  const theme = useThemeStore((s) => s.theme);
  const t = THEME_TOKENS[theme];

  const [emailFormOpen, setEmailFormOpen] = useState(false);
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    init();
    // init() only needs to run once per app lifetime (it attaches a single
    // onAuthStateChanged listener) -- an empty dependency array is deliberate here, not an
    // oversight, same as every other "run once on mount" effect in this codebase.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // notificationsStore.init() is idempotent (guarded internally, same convention as
    // backupStore.ts's own init) -- AuthPanel is always mounted (App.tsx renders it
    // unconditionally), so this is as good a "call once at app startup" site as any.
    initNotifications();
  }, [initNotifications]);

  // §6.8 slice: keep the signed-in user's `profiles/{uid}` document current on every sign-in
  // (email/displayName/photoURL refresh, `visibility` left untouched -- see profileStore.ts's
  // own header), and drop the local visibility flag back to its private default on sign-out so
  // a NEXT account signing in on this same device never briefly shows a stale prior visibility.
  useEffect(() => {
    if (user) void ensureProfile(user);
    else resetProfile();
    // ensureProfile/resetProfile are stable store actions, not meaningfully "changing" between
    // renders -- same reasoning as DocSyncPanel.tsx's own [user]-only effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  async function handleSubmit() {
    const trimmedEmail = email.trim();
    if (!trimmedEmail || !password) return;
    if (mode === 'signup' && password.length < 6) return;
    setNotice(null);
    setSubmitting(true);
    const ok = mode === 'signup' ? await signUpWithEmail(trimmedEmail, password) : await signInWithEmail(trimmedEmail, password);
    setSubmitting(false);
    if (ok) setPassword('');
  }

  async function handleForgotPassword() {
    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setNotice('Enter your email above first, then click this again.');
      return;
    }
    setNotice(null);
    const ok = await sendPasswordReset(trimmedEmail);
    if (ok) setNotice(`Password reset email sent to ${trimmedEmail}`);
  }

  if (loading) {
    return <div style={{ color: t.mutedText, fontSize: 13 }}>Checking sign-in status...</div>;
  }

  return (
    <div style={{ fontFamily: 'sans-serif', fontSize: 13 }}>
      {user ? (
        <div>
          Signed in as <strong>{user.displayName || user.email}</strong>{' '}
          <button type="button" onClick={() => signOut()}>
            Sign out
          </button>
        </div>
      ) : (
        <div>
          <button type="button" onClick={() => signInWithGoogle()}>
            Sign in with Google
          </button>{' '}
          {!emailFormOpen && (
            <button type="button" onClick={() => setEmailFormOpen(true)}>
              Or use email
            </button>
          )}
          {emailFormOpen && (
            <div style={{ display: 'grid', gap: 6, marginTop: 8, maxWidth: 260 }}>
              <input
                type="email"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.currentTarget.value)}
                style={{ fontSize: 12 }}
              />
              <input
                type="password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.currentTarget.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    void handleSubmit();
                  }
                }}
                style={{ fontSize: 12 }}
              />
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <button type="button" onClick={() => void handleSubmit()} disabled={submitting}>
                  {mode === 'signup' ? 'Create account' : 'Sign in'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMode(mode === 'signup' ? 'signin' : 'signup');
                    setNotice(null);
                  }}
                  style={{ fontSize: 11 }}
                >
                  {mode === 'signup' ? 'Already have an account? Sign in' : 'New here? Create an account'}
                </button>
              </div>
              <button type="button" onClick={() => void handleForgotPassword()} style={{ fontSize: 11, justifySelf: 'start' }}>
                Forgot password?
              </button>
              {notice && <div style={{ color: t.mutedText, fontSize: 12 }}>{notice}</div>}
            </div>
          )}
        </div>
      )}
      {error && <div style={{ color: '#c0392b', fontSize: 12, marginTop: 4 }}>{error}</div>}
    </div>
  );
}
