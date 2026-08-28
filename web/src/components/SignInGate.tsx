import { useEffect, useState } from 'react';
import { useAuthStore } from '../store/authStore';

const DISMISSED_KEY = 'sakura_web_landing_dismissed';

function readDismissed(): boolean {
  try {
    return sessionStorage.getItem(DISMISSED_KEY) === 'true';
  } catch {
    return false;
  }
}

/**
 * Phase 7.1 slice (docs/phase7-app-shell-and-dashboard-plan.md): the full-screen sign-in gate
 * every real legacy visitor sees first -- direct port of legacy's real `#sakura-landing-overlay`
 * (legacy/index.html:4498-4526) and its `shouldShowLandingOverlay`/`dismissLandingOverlay` logic
 * (legacy/index.html:13848-13872). Sign-in stays fully optional: "Continue without signing in" or
 * Escape dismisses the gate for this tab session only (sessionStorage, not localStorage -- back
 * on the next full reload of a NEW tab, matching legacy's own real "same as the person answered,
 * until they open a fresh tab" behavior); a successful sign-in dismisses it the same way, since
 * `authStore`'s own `user` field flipping to non-null alone makes this component stop rendering.
 * A distinct `sakura_web_*`-prefixed key, not legacy's bare `sakura_landing_dismissed` -- both
 * apps can share an origin (`/web-preview/` today) without this gate's dismissal state leaking
 * across them in the same tab.
 *
 * Reuses `authStore.ts`'s existing `signInWithGoogle`/`signUpWithEmail`/`signInWithEmail`/
 * `sendPasswordReset` actions directly -- this is a new gating shell around those, not new auth
 * logic (`AuthPanel.tsx`'s own header already flagged this exact gap before this slice: "web/ has
 * no landing/onboarding overlay at all yet"). Renders nothing while `loading` is true or once
 * `user` is set, matching legacy's own real "don't flash the gate at a signed-in user" behavior --
 * legacy's own equivalent is `restoreAccountSessionIfNeeded`, which only decides once an async
 * Firebase restore attempt has actually resolved either way. One real, deliberate simplification
 * vs. legacy not replicated here: legacy's own version skips that async wait entirely (deciding
 * synchronously, before any Firebase call) for a device that has never signed in before
 * (`localStorage.sakura_account_active` unset) -- `authStore.ts`'s `init()` always does a real
 * (typically fast, but non-zero) `onAuthStateChanged` round-trip regardless, so a brand-new
 * visitor may see a brief flash of the un-gated app before the gate appears. A real, separately-
 * scoped follow-up if that flash is ever visibly bothersome in practice, not attempted here.
 *
 * §7.6 slice (docs/phase7-app-shell-and-dashboard-plan.md): also reopens after a real dismissal
 * when `authStore.ts`'s `landingGateForceOpen` is set -- `AccountMenu.tsx`'s signed-out "Sign in"
 * entry does this, matching legacy's real `account-signin-open-btn` (`showLandingOverlay()`
 * regardless of prior dismissal). Reset back to false on the next dismissal, or as soon as
 * `user` becomes non-null (a plain effect below), so a stale request can never resurface the
 * gate uninvited after a later sign-out.
 *
 * §8.4h retrofit (docs/phase8-design-system-parity-plan.md): the overlay/card/brand/heading/sub
 * shell now renders through real `#sakura-landing-*` ids and CSS (index.css, cited from
 * legacy/index.html:698-704) instead of inline `style` objects -- `#sakura-landing-overlay` skips
 * legacy's own `display:none` toggle since this component only ever mounts while visible (the
 * same precedent already used for `#dock-tabstrip`/`.app-modal-overlay`). Every other element
 * (Google button, divider, email toggle/form/inputs/error/submit, mode-toggle, forgot-password,
 * continue-without-signing-in) stays inline, matching legacy's own real markup, which styles all
 * of those the same way (no named class beyond a bare `class="btn"` the two `<button>`s already
 * get for free from `web/`'s own bare-element-selector base treatment, index.css §6.1) -- this
 * slice also fixed two real mismatches investigation turned up along the way: the Google/email-
 * submit buttons and the email/password inputs were missing the plain `border`/`background`/
 * `color` inline overrides legacy's own markup gives them on top of that base treatment, so they'd
 * rendered with the wrong (accent-tinted) border and text color instead of legacy's plain
 * `var(--border)`/`var(--edit-bg)`/`var(--fg)`. The brand icon also now matches legacy's real
 * em-based sizing technique (`font-size:56px` on the wrapper, `width="1em" height="1em"` on the
 * svg) instead of a hardcoded `width={40} height={40}`.
 */
export function SignInGate() {
  const user = useAuthStore((s) => s.user);
  const loading = useAuthStore((s) => s.loading);
  const error = useAuthStore((s) => s.error);
  const init = useAuthStore((s) => s.init);
  const forceOpen = useAuthStore((s) => s.landingGateForceOpen);
  const closeLandingGate = useAuthStore((s) => s.closeLandingGate);
  const signInWithGoogle = useAuthStore((s) => s.signInWithGoogle);
  const signUpWithEmail = useAuthStore((s) => s.signUpWithEmail);
  const signInWithEmail = useAuthStore((s) => s.signInWithEmail);
  const sendPasswordReset = useAuthStore((s) => s.sendPasswordReset);

  const [dismissed, setDismissed] = useState(readDismissed);
  const [emailFormOpen, setEmailFormOpen] = useState(false);
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    init();
    // init() only needs to run once per app lifetime -- see authStore.ts's own idempotency
    // guard, added alongside this slice specifically because AccountMenu.tsx (§7.6, replacing
    // the retired AuthPanel.tsx) also calls it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const visible = !loading && !user && (forceOpen || !dismissed);

  function dismiss(): void {
    try {
      sessionStorage.setItem(DISMISSED_KEY, 'true');
    } catch {
      // sessionStorage can throw in a locked-down environment (private browsing, disabled
      // storage) -- matching legacy's own real try/catch-and-ignore here; the dismissal for
      // THIS render, not persisting it, is what matters most.
    }
    setDismissed(true);
    closeLandingGate();
  }

  useEffect(() => {
    if (user) closeLandingGate();
    // Resets a stale force-open request once a sign-in actually completes, regardless of which
    // surface (this gate's own form, or a sign-in started elsewhere) resolved it -- see this
    // component's own header for why this matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  useEffect(() => {
    if (!visible) return;
    function onKeyDown(e: KeyboardEvent): void {
      if (e.key === 'Escape') dismiss();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
    // dismiss() is a plain function re-created every render, not memoized -- re-running this
    // effect on every render just to satisfy exhaustive-deps would add/remove the listener far
    // more than needed for no behavioral change, since dismiss() itself always reads the latest
    // render's closeLandingGate/setDismissed regardless.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  if (!visible) return null;

  async function handleSubmit(): Promise<void> {
    const trimmedEmail = email.trim();
    if (!trimmedEmail || !password) return;
    if (mode === 'signup' && password.length < 6) return;
    setNotice(null);
    setSubmitting(true);
    const ok = mode === 'signup' ? await signUpWithEmail(trimmedEmail, password) : await signInWithEmail(trimmedEmail, password);
    setSubmitting(false);
    if (ok) setPassword('');
  }

  async function handleForgotPassword(): Promise<void> {
    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setNotice('Enter your email above first, then click this again.');
      return;
    }
    setNotice(null);
    const ok = await sendPasswordReset(trimmedEmail);
    if (ok) setNotice(`Password reset email sent to ${trimmedEmail}`);
  }

  return (
    <div id="sakura-landing-overlay" role="dialog" aria-modal="true" aria-labelledby="sakura-landing-heading">
      <div id="sakura-landing-card">
        <div id="sakura-landing-brand">
          <span id="sakura-landing-brand-icon" aria-hidden="true">
            <svg width="1em" height="1em" viewBox="0 0 72 72" xmlns="http://www.w3.org/2000/svg">
              <g opacity={0.9}>
                <ellipse cx="36" cy="18" rx="9" ry="9" fill="color-mix(in srgb,var(--accent) 38%,transparent)" stroke="color-mix(in srgb,var(--accent) 55%,transparent)" strokeWidth={1} />
                <ellipse cx="18" cy="30" rx="9" ry="9" fill="color-mix(in srgb,var(--accent) 30%,transparent)" stroke="color-mix(in srgb,var(--accent) 45%,transparent)" strokeWidth={1} />
                <ellipse cx="54" cy="30" rx="9" ry="9" fill="color-mix(in srgb,var(--accent) 30%,transparent)" stroke="color-mix(in srgb,var(--accent) 45%,transparent)" strokeWidth={1} />
                <ellipse cx="24" cy="46" rx="9" ry="9" fill="color-mix(in srgb,var(--accent) 22%,transparent)" stroke="color-mix(in srgb,var(--accent) 38%,transparent)" strokeWidth={1} />
                <ellipse cx="48" cy="46" rx="9" ry="9" fill="color-mix(in srgb,var(--accent) 22%,transparent)" stroke="color-mix(in srgb,var(--accent) 38%,transparent)" strokeWidth={1} />
                <circle cx="36" cy="32" r="5.5" fill="color-mix(in srgb,var(--accent) 18%,transparent)" stroke="color-mix(in srgb,var(--accent) 48%,transparent)" strokeWidth={1.2} />
              </g>
            </svg>
          </span>
          <span id="sakura-landing-brand-name">Sakura</span>
        </div>
        <h1 id="sakura-landing-heading">Your outline, wherever you go</h1>
        <p id="sakura-landing-sub">
          Sign in to sync everything — documents, Hub, and settings — across devices. Fully
          optional — everything keeps working locally if you skip this.
        </p>
        <button
          type="button"
          onClick={() => void signInWithGoogle()}
          style={{
            border: '1px solid var(--border)',
            borderRadius: 8,
            padding: '10px 16px',
            width: '100%',
            fontSize: 14,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
          </svg>
          Sign in with Google
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '14px 0', color: 'var(--muted)', fontSize: 11 }}>
          <span style={{ flex: 1, height: 1, background: 'var(--border)' }} />
          or
          <span style={{ flex: 1, height: 1, background: 'var(--border)' }} />
        </div>
        {!emailFormOpen && (
          <button
            type="button"
            onClick={() => setEmailFormOpen(true)}
            style={{ background: 'none', border: 'none', color: 'var(--accent)', fontSize: 13, cursor: 'pointer', padding: 0 }}
          >
            Sign in with email
          </button>
        )}
        {emailFormOpen && (
          <div style={{ textAlign: 'left', marginTop: 12 }}>
            <input
              type="email"
              placeholder="Email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.currentTarget.value)}
              style={{
                width: '100%',
                boxSizing: 'border-box',
                padding: '9px 10px',
                border: '1px solid var(--border)',
                borderRadius: 8,
                background: 'var(--edit-bg)',
                color: 'var(--fg)',
                fontSize: 13,
                marginBottom: 8,
                fontFamily: "'Inter', sans-serif"
              }}
            />
            <input
              type="password"
              placeholder="Password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.currentTarget.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  void handleSubmit();
                }
              }}
              style={{
                width: '100%',
                boxSizing: 'border-box',
                padding: '9px 10px',
                border: '1px solid var(--border)',
                borderRadius: 8,
                background: 'var(--edit-bg)',
                color: 'var(--fg)',
                fontSize: 13,
                marginBottom: 8,
                fontFamily: "'Inter', sans-serif"
              }}
            />
            {error && <div style={{ color: 'var(--fc-red)', fontSize: 12, marginBottom: 8, textAlign: 'left' }}>{error}</div>}
            <button
              type="button"
              onClick={() => void handleSubmit()}
              disabled={submitting}
              style={{ width: '100%', border: '1px solid var(--border)', borderRadius: 8, padding: 9, fontSize: 13, fontWeight: 600 }}
            >
              {mode === 'signup' ? 'Create account' : 'Sign in'}
            </button>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10, gap: 8 }}>
              <button
                type="button"
                onClick={() => {
                  setMode(mode === 'signup' ? 'signin' : 'signup');
                  setNotice(null);
                }}
                style={{ background: 'none', border: 'none', color: 'var(--muted)', fontSize: 11.5, cursor: 'pointer', padding: 0, textAlign: 'left' }}
              >
                {mode === 'signup' ? 'Already have an account? Sign in' : 'New here? Create an account'}
              </button>
              <button
                type="button"
                onClick={() => void handleForgotPassword()}
                style={{ background: 'none', border: 'none', color: 'var(--muted)', fontSize: 11.5, cursor: 'pointer', padding: 0, flexShrink: 0 }}
              >
                Forgot password?
              </button>
            </div>
            {notice && <div style={{ color: 'var(--muted)', fontSize: 12, marginTop: 8 }}>{notice}</div>}
          </div>
        )}
        <button
          type="button"
          onClick={dismiss}
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--muted)',
            fontSize: 13,
            marginTop: 14,
            cursor: 'pointer',
            textDecoration: 'underline',
            textUnderlineOffset: 2
          }}
        >
          Continue without signing in
        </button>
      </div>
    </div>
  );
}
