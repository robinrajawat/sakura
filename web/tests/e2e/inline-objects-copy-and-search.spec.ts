import { test, expect, type Page } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

// A duplicated or pasted row gets its own copies of every inline object (Q&A, remarks and
// diagrams included, not just note/tables/images), and Quick Assist finds table cells and image
// captions — the only inline-object text it didn't search before.

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => { localStorage.setItem('sakura_welcome_seen', '1'); sessionStorage.setItem('sakura_landing_dismissed', 'true'); });
});

async function seed(page: Page) {
  await page.goto('file://' + indexPath);
  await page.waitForFunction('typeof render === "function" && typeof nodes !== "undefined"');
  await page.evaluate(`
    const n = (id, depth, text, extra = {}) => ({ id, depth, text, parentId: null, isCheckbox: false, checked: false, note: '', tables: [], images: [], tags: [], styles: {}, ...extra });
    nodes = [
      n(1, 0, 'Rollout', {
        note: '<p>Plan note</p>',
        tables: ['<table data-chart-title="Sites"><tr><th>Site</th><th>Go-live</th></tr><tr><td>Berlin</td><td>Nov 3</td></tr></table>'],
        images: [{ id: 'img1', src: 'data:image/gif;base64,R0lGODlhAQABAAAAACw=', caption: 'Login screen after SSO', annotations: [], createdAt: 1 }]
      }),
      n(2, 1, 'Pilot site'),
      n(3, 0, 'Other')
    ];
    rebuildParentIds(); nextId = 4;
    qaItems = [
      { id: 'qa1', question: 'Who signs off?', answer: 'Ops lead', sourceNodeId: 1, createdAt: 1 },
      { id: 'qa2', question: 'Pilot date?', answer: '', sourceNodeId: 2, createdAt: 1 }
    ];
    remarks = [
      { id: 'r1', person: 'Ana', text: 'Check the EDI mapping', date: '2026-10-01', context: '', anchorNodeId: 1, followUp: true, createdAt: 1 },
      { id: 'r2', person: '', text: '', date: '2026-10-01', context: '', anchorNodeId: 1, createdAt: 1 }
    ];
    diagrams = [{ id: 'dg1', title: 'Flow', xml: '<mxfile/>', previewSvg: '', pageSvgs: [], pageCount: 1, status: 'draft', note: '', anchorNodeId: 1, createdAt: 1, modifiedAt: 1, _hydrated: true }];
    undoStack = []; editingId = null; render();
  `);
}

test('Duplicate copies Q&A, remarks and diagrams of every row in the branch', async ({ page }) => {
  await seed(page);
  await page.evaluate('setSingleSelection(1); duplicateSelected()');
  const r = await page.evaluate(`(() => {
    const copy = nodes.find(n => n.text === 'Rollout' && n.id !== 1);
    const childCopy = nodes.find(n => n.text === 'Pilot site' && n.id !== 2);
    return {
      qa: qaItems.filter(q => q.sourceNodeId === copy.id).map(q => [q.question, q.answer]),
      childQa: qaItems.filter(q => q.sourceNodeId === childCopy.id).length,
      rm: remarks.filter(x => x.anchorNodeId === copy.id).map(x => [x.text, x.person, !!x.followUp]),
      dg: diagrams.filter(d => d.anchorNodeId === copy.id).map(d => [d.title, d.xml]),
      ids: new Set([...qaItems.map(q => q.id), ...remarks.map(x => x.id)]).size === qaItems.length + remarks.length,
      originalQa: qaItems.filter(q => q.sourceNodeId === 1).length
    };
  })()`);
  expect(r.qa).toEqual([['Who signs off?', 'Ops lead']]);
  expect(r.childQa).toBe(1);
  expect(r.rm).toEqual([['Check the EDI mapping', 'Ana', true]]); // the blank remark is not copied
  expect(r.dg).toEqual([['Flow', '<mxfile/>']]);
  expect(r.ids).toBe(true);
  expect(r.originalQa).toBe(1);
  // Q&A and remarks are in the undo snapshot: Undo takes the copies away again.
  await page.evaluate('undo()');
  expect(await page.evaluate('qaItems.length + "/" + remarks.length')).toBe('2/2');
});

test('Copy and paste brings Q&A and remarks along', async ({ page }) => {
  await seed(page);
  const r = await page.evaluate(`(() => {
    const scope = nodes.slice(0, 2);
    const html = serializeClipboardHtml(scope, true) + encodeSakuraClipComment(buildNodeClipboardPayload(scope));
    const extras = extractSakuraClipPayload(html);
    setSingleSelection(3);
    pasteParsedNodes(parseTreeClipboardHtml(html), undefined, extras);
    const pasted = nodes.filter(n => n.text === 'Rollout' && n.id !== 1)[0];
    return {
      qa: qaItems.filter(q => q.sourceNodeId === pasted.id).map(q => q.question),
      rm: remarks.filter(x => x.anchorNodeId === pasted.id).map(x => x.text),
      dg: diagrams.filter(d => d.anchorNodeId === pasted.id).length
    };
  })()`);
  expect(r.qa).toEqual(['Who signs off?']);
  expect(r.rm).toEqual(['Check the EDI mapping']);
  expect(r.dg).toBe(1);
});

test('Quick Assist finds table cells and image captions', async ({ page }) => {
  await seed(page);
  const r = await page.evaluate(`(() => {
    const docNodes = nodes;
    loadActiveDocsIndex = () => [{ id: currentDocId || 'doc1', title: 'Plan' }];
    getDocNodesForSearch = () => ({ docNodes, docTitle: 'Plan' });
    const groups = collectSearchGroups('berlin');
    const tables = groups.find(g => g.name === 'Tables').items.map(i => i.label);
    const images = collectImageMatches('sso login').map(i => i.label);
    const title = collectTableMatches('sites').map(i => i.label);
    return { tables, images, title, notesHit: collectTableMatches('plan note').length };
  })()`);
  expect(r.tables).toEqual(['Berlin · Nov 3']);
  expect(r.images).toEqual(['Login screen after SSO']);
  expect(r.title).toEqual(['Sites']);
  expect(r.notesHit).toBe(0);
  expect(await page.evaluate('qaParseCategoryPrefix("table: berlin")')).toEqual({ categoryKey: 'tables', rest: 'berlin' });
  expect(await page.evaluate('qaParseCategoryPrefix("image: login")')).toEqual({ categoryKey: 'images', rest: 'login' });
});
