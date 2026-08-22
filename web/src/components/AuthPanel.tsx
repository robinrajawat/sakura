import { useEffect } from 'react';
import { useAuthStore } from '../store/authStore';
import { useThemeStore, THEME_TOKENS } from '../store/themeStore';

/**
 * Phase 4 slice (docs/framework-migration-plan.md): account/sync, part 1 -- auth panel. Sign
 * in/out only; no account settings, profile visibility, or account deletion yet (all real
 * features in legacy, each a separately-scoped follow-up).
 */
export function AuthPanel() {
  const user = useAuthStore((s) => s.user);
  const loading = useAuthStore((s) => s.loading);
  const error = useAuthStore((s) => s.error);
  const init = useAuthStore((s) => s.init);
  const signInWithGoogle = useAuthStore((s) => s.signInWithGoogle);
  const signOut = useAuthStore((s) => s.signOut);
  const theme = useThemeStore((s) => s.theme);
  const t = THEME_TOKENS[theme];

  useEffect(() => {
    init();
    // init() only needs to run once per app lifetime (it attaches a single
    // onAuthStateChanged listener) -- an empty dependency array is deliberate here, not an
    // oversight, same as every other "run once on mount" effect in this codebase.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
        <button type="button" onClick={() => signInWithGoogle()}>
          Sign in with Google
        </button>
      )}
      {error && <div style={{ color: '#c0392b', fontSize: 12, marginTop: 4 }}>{error}</div>}
    </div>
  );
}
