import { create } from 'zustand';
import { initializeApp, type FirebaseApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  type Auth,
  type User
} from 'firebase/auth';

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

  signOut: async () => {
    try {
      await firebaseSignOut(getFirebaseAuth());
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Sign-out failed' });
    }
  }
}));
