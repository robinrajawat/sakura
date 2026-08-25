import { describe, expect, it } from 'vitest';
import { emailAuthErrorMessageCore } from './authErrors';

describe('emailAuthErrorMessageCore', () => {
  it('maps known Firebase Auth error codes to legacy\'s real human-readable messages', () => {
    expect(emailAuthErrorMessageCore('auth/invalid-email')).toBe('That email address looks invalid.');
    expect(emailAuthErrorMessageCore('auth/user-not-found')).toBe('No account found for that email.');
    expect(emailAuthErrorMessageCore('auth/wrong-password')).toBe('Incorrect password.');
    expect(emailAuthErrorMessageCore('auth/invalid-credential')).toBe('Incorrect email or password.');
    expect(emailAuthErrorMessageCore('auth/email-already-in-use')).toBe(
      'An account already exists for that email — try signing in instead.'
    );
    expect(emailAuthErrorMessageCore('auth/weak-password')).toBe('Password must be at least 6 characters.');
    expect(emailAuthErrorMessageCore('auth/missing-password')).toBe('Enter a password.');
    expect(emailAuthErrorMessageCore('auth/too-many-requests')).toBe('Too many attempts — please wait a moment and try again.');
    expect(emailAuthErrorMessageCore('auth/network-request-failed')).toBe('Network error — check your connection and try again.');
    expect(emailAuthErrorMessageCore('auth/operation-not-allowed')).toBe("Email/password sign-in isn't enabled for this app yet.");
  });

  it('falls back to the generic message for an unrecognized or missing code', () => {
    expect(emailAuthErrorMessageCore('auth/some-new-error-code')).toBe('Something went wrong — please try again.');
    expect(emailAuthErrorMessageCore(null)).toBe('Something went wrong — please try again.');
    expect(emailAuthErrorMessageCore(undefined)).toBe('Something went wrong — please try again.');
    expect(emailAuthErrorMessageCore('')).toBe('Something went wrong — please try again.');
  });
});
