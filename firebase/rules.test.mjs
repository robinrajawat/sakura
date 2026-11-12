// Emulator check for firestore.rules (not run in CI: needs Java and the Firebase emulator).
// Run it before publishing a rules change:
//   mkdir -p /tmp/rules && cp firebase/firestore.rules firebase/rules.test.mjs /tmp/rules && cd /tmp/rules
//   echo '{"firestore":{"rules":"firestore.rules"},"emulators":{"firestore":{"port":8089},"ui":{"enabled":false}}}' > firebase.json
//   npm init -y && npm i firebase-tools@13 @firebase/rules-unit-testing@3 firebase@10
//   npx firebase emulators:exec --only firestore --project sakura-rules-test "node rules.test.mjs"
// It prints "ALL <n>" when every check passed and stops at the first one that didn't.
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, setDoc, getDoc, deleteDoc, runTransaction } from 'firebase/firestore';
import fs from 'fs';
const env = await initializeTestEnvironment({ projectId: 'sakura-rules-test', firestore: { rules: fs.readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8089 } });
const me = env.authenticatedContext('u1').firestore();
const other = env.authenticatedContext('u2').firestore();
const anon = env.unauthenticatedContext().firestore();
const d = (db, p) => doc(db, p);
let ok = 0; const t = async (name, p) => { await p; ok++; console.log('ok', name); };
// legacy doc without rev
await env.withSecurityRulesDisabled(async c => { await setDoc(doc(c.firestore(), 'users/u1/docs/old'), { title: 'Old', updatedAt: 1 }); });
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
console.log('ALL', ok);
await env.cleanup();
