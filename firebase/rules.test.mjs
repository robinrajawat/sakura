// Emulator check for firestore.rules, run in CI (.github/workflows/ci.yml, verify-rules) on every
// PR that changes something outside docs. Locally (needs Java 11+):
//   cd firebase && npm ci && npm test
// It prints "ALL <n>" when every check passed and stops, with a non-zero exit, at the first one
// that didn't. The rules are published by hand (Firebase Console), so this checks the repo's copy.
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, setDoc, getDoc, deleteDoc, updateDoc, runTransaction, collection, query, where, getDocs, setLogLevel } from 'firebase/firestore';
import fs from 'fs';
setLogLevel('silent'); // a refused write is the expected result in half the checks
const env = await initializeTestEnvironment({ projectId: 'sakura-rules-test', firestore: { rules: fs.readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8089 } });
const me = env.authenticatedContext('u1').firestore();
const other = env.authenticatedContext('u2').firestore();
const anon = env.unauthenticatedContext().firestore();
const admin = env.authenticatedContext('adm', { email: 'someone@x.test' }).firestore(); // an admin through /admins, not the built-in email
const verified = env.authenticatedContext('u1', { email: 'A@x.test', email_verified: true }).firestore();
const unverified = env.authenticatedContext('u4', { email: 'd@x.test', email_verified: false }).firestore();
const thief = env.authenticatedContext('u5', { email: 'e@x.test', email_verified: true }).firestore();
import crypto from 'crypto';
const hash = e => crypto.createHash('sha256').update(e.trim().toLowerCase()).digest('hex');
const d = (db, p) => doc(db, p);
let ok = 0; const t = async (name, p) => { await p; ok++; console.log('ok', name); };
// Seed data, written with the rules off (the test library allows this once per run): a legacy doc
// without rev, a private and a public profile, and an admin entry.
await env.withSecurityRulesDisabled(async c => {
  const db = c.firestore();
  await setDoc(doc(db, 'users/u1/docs/old'), { title: 'Old', updatedAt: 1 });
  await setDoc(doc(db, 'profiles/u1'), { email: 'a@x.test', visibility: 'private' });
  await setDoc(doc(db, 'profiles/u3'), { email: 'c@x.test', visibility: 'public' });
  await setDoc(doc(db, 'admins/adm'), {});
});
await t('create new doc (any rev or none)', assertSucceeds(setDoc(d(me, 'users/u1/docs/a'), { title: 'A', rev: 1 })));
await t('owner reads doc', assertSucceeds(getDoc(d(me, 'users/u1/docs/a'))));
await t('update rev+1', assertSucceeds(setDoc(d(me, 'users/u1/docs/a'), { title: 'A2', rev: 2 }, { merge: true })));
await t('update same rev (old client, merge without rev) refused', assertFails(setDoc(d(me, 'users/u1/docs/a'), { title: 'stale' }, { merge: true })));
await t('update skipping a rev refused', assertFails(setDoc(d(me, 'users/u1/docs/a'), { title: 'x', rev: 4 }, { merge: true })));
await t('update going back refused', assertFails(setDoc(d(me, 'users/u1/docs/a'), { title: 'x', rev: 1 }, { merge: true })));
await t('legacy doc: first versioned write rev 1', assertSucceeds(setDoc(d(me, 'users/u1/docs/old'), { title: 'Old2', rev: 1 }, { merge: true })));
await t('transaction as the app does it', assertSucceeds(runTransaction(me, async tx => { const s = await tx.get(d(me, 'users/u1/docs/a')); tx.set(d(me, 'users/u1/docs/a'), { title: 'A3', rev: (s.data().rev || 0) + 1 }, { merge: true }); })));
await t('string rev refused', assertFails(setDoc(d(me, 'users/u1/docs/a'), { rev: '4' }, { merge: true })));
await t('subcollection write (versions)', assertSucceeds(setDoc(d(me, 'users/u1/docs/a/versions/1'), { ts: 1 })));
await t('subcollection write (diagrams)', assertSucceeds(setDoc(d(me, 'users/u1/docs/a/diagrams/g1'), { xml: '' })));
await t('meta write unchanged', assertSucceeds(setDoc(d(me, 'users/u1/meta/prefs'), { value: 1, updatedAt: 1 })));
await t('templates write unchanged', assertSucceeds(setDoc(d(me, 'users/u1/templates/t1'), { x: 1 })));
await t('root user doc owner', assertSucceeds(setDoc(d(me, 'users/u1'), { x: 1 })));
await t('delete doc', assertSucceeds(deleteDoc(d(me, 'users/u1/docs/old'))));
await t('other user cannot read doc', assertFails(getDoc(d(other, 'users/u1/docs/a'))));
await t('other user cannot write subcollection', assertFails(setDoc(d(other, 'users/u1/docs/a/versions/2'), { ts: 2 })));
await t('other user cannot write meta', assertFails(setDoc(d(other, 'users/u1/meta/prefs'), { value: 2 })));
await t('anon cannot read', assertFails(getDoc(d(anon, 'users/u1/meta/prefs'))));
await t('other user cannot create a doc under u1', assertFails(setDoc(d(other, 'users/u1/docs/z'), { rev: 1 })));

// Profiles: own always; others only when public, also through the share dialog's email query.
// Retired public profiles (2026-11-19): leftovers only, owner read and delete.
await t('owner reads own leftover profile', assertSucceeds(getDoc(d(me, 'profiles/u1'))));
await t('other cannot read a profile, even a once-public one', assertFails(getDoc(d(other, 'profiles/u3'))));
await t('listing public profiles refused', assertFails(getDocs(query(collection(other, 'profiles'), where('visibility', '==', 'public')))));
await t('email query on profiles refused', assertFails(getDocs(query(collection(other, 'profiles'), where('email', '==', 'c@x.test'), where('visibility', '==', 'public')))));
await t('owner cannot write a profile any more', assertFails(setDoc(d(me, 'profiles/u1'), { visibility: 'public' }, { merge: true })));
await t('anon cannot read a profile', assertFails(getDoc(d(anon, 'profiles/u3'))));
await t('owner deletes their leftover profile', assertSucceeds(deleteDoc(d(me, 'profiles/u1'))));

// emailIndex: exact-email lookup for Send a copy.
await t('verified account writes its own entry (address lowercased)', assertSucceeds(setDoc(d(verified, 'emailIndex/' + hash('a@x.test')), { uid: 'u1' })));
await t('signed-in user gets an entry by exact id', assertSucceeds(getDoc(d(other, 'emailIndex/' + hash('a@x.test')))));
await t('nobody can list the index', assertFails(getDocs(collection(other, 'emailIndex'))));
await t('anon cannot get an entry', assertFails(getDoc(d(anon, 'emailIndex/' + hash('a@x.test')))));
await t('unverified email cannot claim an entry', assertFails(setDoc(d(unverified, 'emailIndex/' + hash('d@x.test')), { uid: 'u4' })));
await t('cannot claim someone else\'s email', assertFails(setDoc(d(thief, 'emailIndex/' + hash('a@x.test')), { uid: 'u5' })));
await t('cannot point own entry at another account', assertFails(setDoc(d(thief, 'emailIndex/' + hash('e@x.test')), { uid: 'u1' })));
await t('entry holds only the uid', assertFails(setDoc(d(thief, 'emailIndex/' + hash('e@x.test')), { uid: 'u5', name: 'E' })));
await t('other cannot delete my entry', assertFails(deleteDoc(d(thief, 'emailIndex/' + hash('a@x.test')))));
await t('owner deletes own entry', assertSucceeds(deleteDoc(d(verified, 'emailIndex/' + hash('a@x.test')))));

// Notifications: a sender may create one known shape in someone's inbox; only the owner reads it.
const note = { type: 'copy', fromUid: 'u2', fromEmail: 'b@x.test', docTitle: 'A', createdAt: 1, read: false };
await t('sender creates a notice in the recipient inbox', assertSucceeds(setDoc(d(other, 'notifications/u1/items/n1'), note)));
await t('notice claiming another sender refused', assertFails(setDoc(d(other, 'notifications/u1/items/n2'), { ...note, fromUid: 'u3' })));
await t('notice with an extra field refused', assertFails(setDoc(d(other, 'notifications/u1/items/n3'), { ...note, payload: 'x' })));
await t('notice created as already read refused', assertFails(setDoc(d(other, 'notifications/u1/items/n4'), { ...note, read: true })));
await t('anon cannot create a notice', assertFails(setDoc(d(anon, 'notifications/u1/items/n5'), { ...note, fromUid: null })));
await t('sender cannot read the recipient inbox', assertFails(getDoc(d(other, 'notifications/u1/items/n1'))));
await t('sender cannot change a sent notice', assertFails(updateDoc(d(other, 'notifications/u1/items/n1'), { read: true })));
await t('recipient marks it read', assertSucceeds(updateDoc(d(me, 'notifications/u1/items/n1'), { read: true })));
await t('recipient deletes it', assertSucceeds(deleteDoc(d(me, 'notifications/u1/items/n1'))));

// Send a copy: the sender creates, stamped with their own uid; only the recipient reads and deletes.
const copy = { fromUid: 'u2', fromEmail: 'b@x.test', title: 'A', doc: '{}', createdAt: 1 };
await t('sender sends a copy', assertSucceeds(setDoc(d(other, 'copies/u1/items/c1'), copy)));
await t('copy claiming another sender refused', assertFails(setDoc(d(other, 'copies/u1/items/c2'), { ...copy, fromUid: 'u1' })));
await t('copy with a non-string doc refused', assertFails(setDoc(d(other, 'copies/u1/items/c3'), { ...copy, doc: { nodes: [] } })));
await t('copy with an extra field refused', assertFails(setDoc(d(other, 'copies/u1/items/c4'), { ...copy, extra: 1 })));
await t('sender cannot read the copy back', assertFails(getDoc(d(other, 'copies/u1/items/c1'))));
await t('nobody can change a sent copy', assertFails(setDoc(d(other, 'copies/u1/items/c1'), { ...copy, title: 'B' })));
await t('recipient cannot change it either', assertFails(updateDoc(d(me, 'copies/u1/items/c1'), { title: 'B' })));
await t('recipient reads it', assertSucceeds(getDoc(d(me, 'copies/u1/items/c1'))));
await t('recipient deletes it', assertSucceeds(deleteDoc(d(me, 'copies/u1/items/c1'))));

// Feedback: anyone files one (signed out too); only admins read, triage and delete.
await t('signed out files feedback', assertSucceeds(setDoc(d(anon, 'feedback/f1'), { kind: 'error', message: 'boom' })));
await t('empty message refused', assertFails(setDoc(d(anon, 'feedback/f2'), { kind: 'feedback', message: '' })));
await t('unknown kind refused', assertFails(setDoc(d(anon, 'feedback/f3'), { kind: 'spam', message: 'x' })));
await t('message of 6000 characters refused', assertFails(setDoc(d(anon, 'feedback/f4'), { kind: 'feedback', message: 'x'.repeat(6000) })));
await t('a user cannot read feedback', assertFails(getDoc(d(me, 'feedback/f1'))));
await t('admin reads feedback', assertSucceeds(getDoc(d(admin, 'feedback/f1'))));
await t('admin triages status', assertSucceeds(updateDoc(d(admin, 'feedback/f1'), { status: 'done' })));
await t('admin cannot rewrite the message', assertFails(updateDoc(d(admin, 'feedback/f1'), { message: 'edited' })));
await t('a user cannot delete feedback', assertFails(deleteDoc(d(me, 'feedback/f1'))));
await t('admin deletes feedback', assertSucceeds(deleteDoc(d(admin, 'feedback/f1'))));

// Admins: existence check on your own entry only; no listing, no client writes.
await t('admin reads own admin entry', assertSucceeds(getDoc(d(admin, 'admins/adm'))));
await t('a user cannot read someone else\'s admin entry', assertFails(getDoc(d(me, 'admins/adm'))));
await t('nobody lists admins', assertFails(getDocs(collection(admin, 'admins'))));
await t('a user cannot make themselves admin', assertFails(setDoc(d(me, 'admins/u1'), {})));

console.log('ALL', ok);
await env.cleanup();
