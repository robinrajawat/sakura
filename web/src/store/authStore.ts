import { create } from 'zustand';
import { initializeApp, type FirebaseApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  type Auth,
  type User
} from 'firebase/auth';
import { emailAuthErrorMessageCore } from '../state/authErrors';

/** Firebase Auth SDK errors are always a real `FirebaseError` with a `.code` string
 * (`'auth/...'`), but importing that type just for a duck-typed field read is unnecessary --
 * this reads the field the same defensive way `err instanceof Error ? err.message : ...` already
 * does elsewhere in this file. */
function firebaseErrorCode(err: unknown): string | undefined {
  return err && typeof err === 'object' && 'code' in err && typeof (err as { code: unknown }).code === 'string'
    ? (err as { code: string }).code
    : undefined;
}

// The SAME real, live production Firebase project config legacy/index.html already embeds
// (const FIREBASE_CONFIG at that file's own line ~13662) -- not a new project, not a secret
// (Firebase client config is designed to be public; access control is enforced by Firestore
// security rules server-side, not by keeping this object hidden). Reused verbatim rather than
// duplicated by hand, so this file is the one place both apps' config could visibly drift from
// each other if legacy's own copy ever changes.
const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyB0WitU2dazVbt_MCkkxZuL_pxSH76Xlj0',
  authDomain: 'auth.sakura-notes.com',
  projectId: 'sakura-4cdae',
  storageBucket: 'sakura-4cdae.firebasestorage.app',
  messagingSenderId: '547935562547',
  appId: '1:547935562547:web:50ddb56ab0db0089452c46',
  measurementId: 'G-KSBVB732SJ'
};

let app: FirebaseApp | null = null;
let auth: Auth | null = null;

function getFirebaseAuth(): Auth {
  if (!app) app = initializeApp(FIREBASE_CONFIG);
  if (!auth) auth = getAuth(app);
  return auth;
}

/** Shared with docSyncStore.ts (and any future module that needs the same Firebase app
 * instance) so `initializeApp` is only ever called once -- calling it twice with an app of the
 * same default name throws. */
export function getFirebaseApp(): FirebaseApp {
  if (!app) app = initializeApp(FIREBASE_CONFIG);
  return app;
}

interface AuthState {
  user: User | null;
  loading: boolean;
  error: string | null;
  init: () => void;
  signInWithGoogle: () => Promise<void>;
  signUpWithEmail: (email: string, password: string) => Promise<boolean>;
  signInWithEmail: (email: string, password: string) => Promise<boolean>;
  sendPasswordReset: (email: string) => Promise<boolean>;
  signOut: () => Promise<void>;
}

/**
 * Phase 4 slice (docs/framework-migration-plan.md): account/sync, part 1 -- auth only. `init()`
 * attaches the real `onAuthStateChanged` listener (called once, from App.tsx, same "call once
 * before use" convention as initHubTodosState/initHubJournalState elsewhere in this project,
 * though this one wires a real Firebase listener rather than injecting fakes -- see the
 * project's testing note below for why). Google sign-in only for this slice, matching legacy's
 * primary sign-in path; legacy's email/password flow is a real, separately-scoped follow-up.
 *
 * No dependency-injection seam here unlike hubTodosStore.ts/hubJournalStore.ts -- this module
 * talks to the real Firebase SDK directly rather than through injected functions, since the
 * thing worth testing (the SDK's own auth-state machine) isn't this project's code to fake
 * convincingly, and Firebase's own emulator suite is the real tool for testing against actual
 * auth behavior -- not wired up in this slice (needs its own local emulator setup, a real,
 * separately-scoped follow-up). This file's own logic is thin enough (three near-literal SDK
 * calls) that the risk of an untested wrapper bug is low relative to the cost of building a
 * fake auth backend just to exercise it.
 *
 * §6.8 slice: `signUpWithEmail`/`signInWithEmail`/`sendPasswordReset` are a direct port of
 * legacy's real `wireEmailAuthForm` submit/forgot-password handlers (legacy/index.html:
 * 13920-13984), using the SDK's own `createUserWithEmailAndPassword`/
 * `signInWithEmailAndPassword`/`sendPasswordResetEmail`. Legacy's own comment there is worth
 * repeating verbatim: "Needs the Email/Password provider turned on in the Firebase console
 * (Authentication → Sign-in method) — this is a project-level setting outside this file, not
 * something the client code can enable itself." If that provider isn't enabled, every call here
 * fails with `auth/operation-not-allowed`, which `emailAuthErrorMessageCore` already turns into
 * a real, honest message ("Email/password sign-in isn't enabled for this app yet.") rather than
 * a raw SDK error -- so this ships safely regardless of that project-level setting's current
 * state, matching legacy's own graceful-degradation behavior exactly. Each of the three actions
 * returns a boolean (`true` on success) instead of throwing, matching this file's own established
 * "set `error`, don't throw" convention (`signInWithGoogle` below) -- the return value exists
 * purely so the calling UI knows whether to clear its own form inputs.
 */
export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  loading: true,
  error: null,

  init: () => {
    onAuthStateChanged(getFirebaseAuth(), (user) => {
      set({ user, loading: false });
    });
  },

  signInWithGoogle: async () => {
    set({ error: null });
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(getFirebaseAuth(), provider);
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Sign-in failed' });
    }
  },

  signUpWithEmail: async (email, password) => {
    set({ error: null });
    try {
      await createUserWithEmailAndPassword(getFirebaseAuth(), email, password);
      return true;
    } catch (err) {
      set({ error: emailAuthErrorMessageCore(firebaseErrorCode(err)) });
      return false;
    }
  },

  signInWithEmail: async (email, password) => {
    set({ error: null });
    try {
      await signInWithEmailAndPassword(getFirebaseAuth(), email, password);
      return true;
    } catch (err) {
      set({ error: emailAuthErrorMessageCore(firebaseErrorCode(err)) });
      return false;
    }
  },

  sendPasswordReset: async (email) => {
    set({ error: null });
    try {
      await sendPasswordResetEmail(getFirebaseAuth(), email);
      return true;
    } catch (err) {
      set({ error: emailAuthErrorMessageCore(firebaseErrorCode(err)) });
      return false;
    }
  },

  signOut: async () => {
    try {
      await firebaseSignOut(getFirebaseAuth());
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Sign-out failed' });
    }
  }
}));
