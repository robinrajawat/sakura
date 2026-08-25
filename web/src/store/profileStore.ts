import { create } from 'zustand';
import { collection, doc, getDoc, getDocs, getFirestore, limit, query, setDoc, where, type Firestore } from 'firebase/firestore';
import { getFirebaseApp } from './authStore';
import type { User } from 'firebase/auth';

/**
 * §6.8 slice: Sakura profile documents -- the discoverability layer sharing depends on. Direct
 * port of legacy's real profile machinery (legacy/index.html:14119-14239): one doc per account
 * at `profiles/{uid}` (email/displayName/photoURL kept current on every sign-in, `visibility`
 * left untouched once the person themselves sets it), a `displayNameLower` copy purely so
 * `search`'s name-prefix range query works (Firestore has no case-insensitive query; a
 * lowercased `>=`/`<=` range is the standard workaround), and `findByEmail`/`search` -- the ONLY
 * lookup paths that exist, both scoped to `visibility=='public'` server-side by
 * firestore.rules, not just filtered client-side after the fact. A private profile can never be
 * returned by either query. Matches legacy's own real default: every new profile starts
 * `'private'`.
 */

export interface SakuraProfile {
  uid: string;
  email: string;
  displayName: string;
  photoURL: string;
  visibility: 'public' | 'private';
}

function getDb(): Firestore {
  return getFirestore(getFirebaseApp());
}

interface ProfileState {
  visibility: 'public' | 'private';
  ensureProfile: (user: User) => Promise<void>;
  setDiscoverable: (uid: string, on: boolean) => Promise<void>;
  reset: () => void;
  findByEmail: (email: string) => Promise<SakuraProfile | null>;
  search: (queryStr: string, excludeUid?: string) => Promise<SakuraProfile[]>;
}

export const useProfileStore = create<ProfileState>((set, get) => ({
  visibility: 'private',

  ensureProfile: async (user) => {
    try {
      const ref = doc(getDb(), 'profiles', user.uid);
      const snap = await getDoc(ref);
      const base = {
        email: (user.email || '').toLowerCase(),
        displayName: user.displayName || '',
        displayNameLower: (user.displayName || '').toLowerCase(),
        photoURL: user.photoURL || '',
        updatedAt: Date.now()
      };
      if (snap.exists()) {
        await setDoc(ref, base, { merge: true });
        set({ visibility: snap.data().visibility === 'public' ? 'public' : 'private' });
      } else {
        await setDoc(ref, { ...base, visibility: 'private' });
        set({ visibility: 'private' });
      }
    } catch (err) {
      console.warn('[sakura] ensureProfile failed:', err);
    }
  },

  setDiscoverable: async (uid, on) => {
    const prev = get().visibility;
    const next = on ? 'public' : 'private';
    set({ visibility: next });
    try {
      await setDoc(doc(getDb(), 'profiles', uid), { visibility: next, updatedAt: Date.now() }, { merge: true });
    } catch (err) {
      console.warn('[sakura] setDiscoverable failed:', err);
      set({ visibility: prev });
    }
  },

  reset: () => set({ visibility: 'private' }),

  findByEmail: async (email) => {
    const clean = (email || '').trim().toLowerCase();
    if (!clean) return null;
    try {
      const q = query(collection(getDb(), 'profiles'), where('email', '==', clean), where('visibility', '==', 'public'), limit(1));
      const snap = await getDocs(q);
      if (snap.empty) return null;
      const d = snap.docs[0];
      const data = d.data();
      return { uid: d.id, email: data.email || '', displayName: data.displayName || '', photoURL: data.photoURL || '', visibility: 'public' };
    } catch (err) {
      console.warn('[sakura] findByEmail failed:', err);
      return null;
    }
  },

  // Two separate queries, same reasoning as legacy's own searchPublicProfiles: an exact-email
  // equality filter alongside visibility=='public' needs no extra index (Firestore satisfies
  // pure equality-on-equality automatically), but the displayNameLower prefix range combined
  // with the visibility equality filter needs its own composite index (profiles: visibility
  // ASC, displayNameLower ASC) -- not auto-created. A name search failing before that index
  // exists degrades to "no name matches" (caught separately below) rather than breaking the
  // email-exact-match path, which keeps working regardless.
  search: async (queryStr, excludeUid) => {
    const clean = (queryStr || '').trim().toLowerCase();
    if (clean.length < 2) return [];
    const results = new Map<string, SakuraProfile>();
    try {
      const db = getDb();
      const emailQ = query(collection(db, 'profiles'), where('email', '==', clean), where('visibility', '==', 'public'), limit(5));
      const nameQ = query(
        collection(db, 'profiles'),
        where('visibility', '==', 'public'),
        where('displayNameLower', '>=', clean),
        // The upper bound below is a very high private-use-area code point, higher than
        // any realistic
        // display-name character -- the standard Firestore "starts with" workaround: a >=/<=
        // range whose upper bound is the query string followed by the highest possible
        // character, not just clean itself (which would degrade to an exact-match-only range).
        where('displayNameLower', '<=', clean + ''),
        limit(8)
      );
      const [emailSnap, nameSnap] = await Promise.all([
        getDocs(emailQ).catch((err) => {
          console.warn('[sakura] email-match profile search failed:', err);
          return { docs: [] as { id: string; data: () => Record<string, unknown> }[] };
        }),
        getDocs(nameQ).catch((err) => {
          console.warn(
            '[sakura] name-prefix profile search failed -- likely needs a composite index (profiles: visibility, displayNameLower), see Firebase Console -> Firestore -> Indexes:',
            err
          );
          return { docs: [] as { id: string; data: () => Record<string, unknown> }[] };
        })
      ]);
      [...emailSnap.docs, ...nameSnap.docs].forEach((d) => {
        if (!results.has(d.id)) {
          const data = d.data() as Record<string, string>;
          results.set(d.id, { uid: d.id, email: data.email || '', displayName: data.displayName || '', photoURL: data.photoURL || '', visibility: 'public' });
        }
      });
      if (excludeUid) results.delete(excludeUid);
      return [...results.values()].slice(0, 8);
    } catch (err) {
      console.warn('[sakura] search failed:', err);
      return [];
    }
  }
}));
