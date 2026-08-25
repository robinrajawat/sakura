/**
 * §6.8 slice (docs/phase6-full-parity-plan.md): direct port of legacy's real
 * `emailAuthErrorMessage` (legacy/index.html:13905-13919) -- maps a Firebase Auth error code to
 * the same human-readable message legacy shows, so a `web/` user sees the identical wording for
 * the identical failure. Firebase's own error messages are technical/inconsistent across SDK
 * versions; this table exists specifically to paper over that with real, considered copy.
 */
const EMAIL_AUTH_ERROR_MESSAGES: Record<string, string> = {
  'auth/invalid-email': 'That email address looks invalid.',
  'auth/user-not-found': 'No account found for that email.',
  'auth/wrong-password': 'Incorrect password.',
  'auth/invalid-credential': 'Incorrect email or password.',
  'auth/email-already-in-use': 'An account already exists for that email — try signing in instead.',
  'auth/weak-password': 'Password must be at least 6 characters.',
  'auth/missing-password': 'Enter a password.',
  'auth/too-many-requests': 'Too many attempts — please wait a moment and try again.',
  'auth/network-request-failed': 'Network error — check your connection and try again.',
  'auth/operation-not-allowed': "Email/password sign-in isn't enabled for this app yet."
};

/** Pure: matches legacy's own real fallback exactly ("Something went wrong — please try
 * again.") for any code not in the table above. */
export function emailAuthErrorMessageCore(code: string | null | undefined): string {
  return EMAIL_AUTH_ERROR_MESSAGES[code ?? ''] ?? 'Something went wrong — please try again.';
}
