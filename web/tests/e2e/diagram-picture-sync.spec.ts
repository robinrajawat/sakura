import { test, expect, type Page } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

// Owner 2026-11-21: after signing out and in on an iPhone, every diagram said "This diagram has no
// picture yet". Only the drawing went to the account; each device had to redraw the picture with a
// hidden draw.io, which the iPhone didn't manage. The picture now goes with the drawing (previewOf
// names the drawing it was made from), a device keeps its own picture when the drawing is unchanged,
// and diagrams already in the account get their pictures once from a device that has them.
// Drives the real sync code against an in-memory Firestore stand-in (path -> data), with batches.

const XML = '<mxfile><diagram id="p1">drawn</diagram></mxfile>';
const SVG = '<svg xmlns="http://www.w3.org/2000/svg"><text>picture</text></svg>';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('sakura_welcome_seen', '1');
    sessionStorage.setItem('sakura_landing_dismissed', 'true');
  });
  await page.goto('file://' + indexPath);
  await page.evaluate(() => {
    const store: Record<string, Record<string, unknown>> = {};
    (window as unknown as { __cloud: typeof store }).__cloud = store;
    const ref = (_db: unknown, ...parts: string[]) => ({ path: parts.join('/') });
    const snap = (p: string) => ({ id: p.split('/').pop(), ref: { path: p }, exists: () => p in store, data: () => (p in store ? { ...store[p] } : undefined) });
    const set = (r: { path: string }, d: Record<string, unknown>, o?: { merge?: boolean }) => { store[r.path] = o && o.merge ? { ...(store[r.path] || {}), ...d } : { ...d }; };
    const mod = {
      doc: ref, collection: ref,
      getDoc: async (r: { path: string }) => snap(r.path),
      getDocs: async (r: { path: string }) => {
        const docs = Object.keys(store).filter((k) => k.startsWith(r.path + '/') && !k.slice(r.path.length + 1).includes('/')).map(snap);
        return { docs, empty: !docs.length };
      },
      setDoc: async (r: { path: string }, d: Record<string, unknown>, o?: { merge?: boolean }) => set(r, d, o),
      deleteDoc: async (r: { path: string }) => { delete store[r.path]; },
      writeBatch: () => {
        const ops: (() => void)[] = [];
        return {
          set: (r: { path: string }, d: Record<string, unknown>, o?: { merge?: boolean }) => { ops.push(() => set(r, d, o)); },
          delete: (r: { path: string }) => { ops.push(() => { delete store[r.path]; }); },
          commit: async () => { ops.forEach((f) => f()); },
        };
      },
      runTransaction: async (_db: unknown, fn: (tx: unknown) => Promise<unknown>) => fn({ get: async (r: { path: string }) => snap(r.path), set: (r: { path: string }, d: Record<string, unknown>, o?: { merge?: boolean }) => set(r, d, o) }),
    };
    // @ts-expect-error -- bare globals from index.html
    firestoreMods = { mod, db: {} }; currentUser = { uid: 'u1' };
  });
});

type Cloud = Record<string, Record<string, unknown>>;
const cloud = (page: Page) => page.evaluate(() => (window as unknown as { __cloud: Cloud }).__cloud);
const sig = (page: Page, xml: string) => page.evaluate((x) => {
  // @ts-expect-error -- bare global from index.html
  return diagramXmlSig(x) as string;
}, xml);
// A document with one diagram; withPicture: this device has drawn its picture.
const docWithDiagram = (page: Page, withPicture: boolean) => page.evaluate(async ({ XML, SVG, withPicture }) => {
  // @ts-expect-error -- bare globals from index.html
  createDoc(); nodes = [normalizeNode({ id: 1, depth: 0, text: 'Flow' })]; nextId = 2;
  // @ts-expect-error -- bare globals from index.html
  diagrams = [{ id: 'g1', title: 'Flow', xml: XML, previewSvg: withPicture ? SVG : '', pageSvgs: withPicture ? [{ name: '', svg: SVG }] : [], pageCount: 1, note: '', anchorNodeId: 1, createdAt: 1, modifiedAt: 1, _hydrated: true }];
  // @ts-expect-error -- bare globals from index.html
  dirty = true; saveToStorage();
  await new Promise((r) => setTimeout(r, 300)); // IndexedDB writes
  // @ts-expect-error -- bare global from index.html
  return currentDocId as string;
}, { XML, SVG, withPicture });

test('the picture goes to the account with the drawing, marked with the drawing it was made from', async ({ page }) => {
  const id = await docWithDiagram(page, true);
  await page.evaluate(async (id) => {
    // @ts-expect-error -- bare globals from index.html
    await pushDocToCloud(firestoreMods.mod, firestoreMods.db, id);
  }, id);
  const rec = (await cloud(page))['users/u1/docs/' + id + '/diagrams/g1'];
  expect(rec.xml).toBe(XML);
  expect(rec.previewSvg).toBe(SVG);
  expect(rec.previewOf).toBe(await sig(page, XML));
});

test('a device without the picture leaves the account\'s picture alone', async ({ page }) => {
  const id = await docWithDiagram(page, false);
  await page.evaluate(({ id, SVG, s }) => {
    (window as unknown as { __cloud: Cloud }).__cloud['users/u1/docs/' + id + '/diagrams/g1'] = { xml: 'old', previewSvg: SVG, previewOf: s };
  }, { id, SVG, s: await sig(page, XML) });
  await page.evaluate(async (id) => {
    // @ts-expect-error -- bare globals from index.html
    await pushDocToCloud(firestoreMods.mod, firestoreMods.db, id);
  }, id);
  const rec = (await cloud(page))['users/u1/docs/' + id + '/diagrams/g1'];
  expect(rec.xml).toBe(XML);
  expect(rec.previewSvg).toBe(SVG);
});

test('an incoming copy brings the picture when it matches the drawing, and not when it does not', async ({ page }) => {
  const result = await page.evaluate(async ({ XML, SVG }) => {
    // @ts-expect-error -- bare globals from index.html
    const { mod, db } = firestoreMods; const store = (window as unknown as { __cloud: Cloud }).__cloud;
    // @ts-expect-error -- bare global from index.html
    const s = diagramXmlSig(XML) as string;
    store['users/u1/docs/dA/diagrams/g1'] = { xml: XML, previewSvg: SVG, previewOf: s };
    store['users/u1/docs/dA/diagrams/g2'] = { xml: XML + 'changed', previewSvg: SVG, previewOf: s }; // drawn from an older drawing
    const meta = [{ id: 'g1', title: 'A' }, { id: 'g2', title: 'B' }];
    // @ts-expect-error -- bare globals from index.html
    await hydrateCloudDocBlobs(mod, db, 'u1', 'dA', { title: 'A', nodes: [], diagrams: meta });
    // @ts-expect-error -- bare global from index.html
    return { g1: await idbGet('diagblob:dA:g1'), g2: await idbGet('diagblob:dA:g2') };
  }, { XML, SVG });
  expect(result.g1.previewSvg).toBe(SVG);
  expect(result.g2.previewSvg).toBe('');
  expect(result.g2.xml).toBe(XML + 'changed');
});

test('an incoming copy with the same drawing keeps this device\'s own picture', async ({ page }) => {
  const result = await page.evaluate(async ({ XML, SVG }) => {
    // @ts-expect-error -- bare globals from index.html
    const { mod, db } = firestoreMods; const store = (window as unknown as { __cloud: Cloud }).__cloud;
    // @ts-expect-error -- bare global from index.html
    await idbSet('diagblob:dB:g1', { xml: XML, previewSvg: SVG, pageSvgs: [{ name: '', svg: SVG }] });
    store['users/u1/docs/dB/diagrams/g1'] = { xml: XML }; // the account has no picture
    // @ts-expect-error -- bare global from index.html
    await hydrateCloudDocBlobs(mod, db, 'u1', 'dB', { title: 'B', nodes: [], diagrams: [{ id: 'g1' }] });
    // @ts-expect-error -- bare global from index.html
    return await idbGet('diagblob:dB:g1');
  }, { XML, SVG });
  expect(result.previewSvg).toBe(SVG);
});

test('a diagram without a picture takes the one in the account instead of redrawing', async ({ page }) => {
  const id = await docWithDiagram(page, false);
  await page.evaluate(({ id, SVG, s }) => {
    (window as unknown as { __cloud: Cloud }).__cloud['users/u1/docs/' + id + '/diagrams/g1'] = { xml: 'x', previewSvg: SVG, previewOf: s };
  }, { id, SVG, s: await sig(page, XML) });
  const got = await page.evaluate(async () => {
    // @ts-expect-error -- bare globals from index.html
    const ok = await fetchDiagramPreviewFromAccount(findDiagram('g1'));
    // @ts-expect-error -- bare global from index.html
    return { ok, svg: findDiagram('g1').previewSvg };
  });
  expect(got).toEqual({ ok: true, svg: SVG });
});

test('pictures already on this device go up once, only where the account has the same drawing', async ({ page }) => {
  const id = await docWithDiagram(page, true);
  const s = await sig(page, XML);
  await page.evaluate(({ id, XML }) => {
    const store = (window as unknown as { __cloud: Cloud }).__cloud;
    store['users/u1/docs/' + id + '/diagrams/g1'] = { xml: XML };
    store['users/u1/docs/' + id + '/diagrams/g9'] = { xml: 'another' };
  }, { id, XML });
  await page.evaluate(async () => {
    // @ts-expect-error -- bare globals from index.html
    await backfillDiagramPreviewsToAccount(firestoreMods.mod, firestoreMods.db);
  });
  let c = await cloud(page);
  expect(c['users/u1/docs/' + id + '/diagrams/g1']).toMatchObject({ xml: XML, previewSvg: SVG, previewOf: s });
  expect(c['users/u1/docs/' + id + '/diagrams/g9'].previewSvg).toBeUndefined();
  // A different drawing in the account: its picture is not sent.
  await page.evaluate(({ id }) => {
    const store = (window as unknown as { __cloud: Cloud }).__cloud;
    store['users/u1/docs/' + id + '/diagrams/g1'] = { xml: 'edited elsewhere' };
    localStorage.removeItem('sakura_diagram_previews_sent_v1');
  }, { id });
  await page.evaluate(async () => {
    // @ts-expect-error -- bare globals from index.html
    await backfillDiagramPreviewsToAccount(firestoreMods.mod, firestoreMods.db);
  });
  c = await cloud(page);
  expect(c['users/u1/docs/' + id + '/diagrams/g1'].previewSvg).toBeUndefined();
  expect(await page.evaluate(() => localStorage.getItem('sakura_diagram_previews_sent_v1'))).toBe('u1');
});
