import { describe, it, expect } from 'vitest';
import { openItemsOf, toolOpenItems, toolCurrentDocument, toolWhatChanged, toolTodos } from '../src/mcpMore';
import { sectionOf, toolGetDocument } from '../src/mcpNotes';
import type { FirestoreReader } from '../src/firestoreRest';

const NOW = Date.UTC(2026, 10, 25, 12);
const DAY = 86_400_000;
const doc = {
  title: 'Landscape',
  nodes: [
    { id: 1, text: 'Integrations', depth: 0 },
    { id: 2, text: 'SAP to CRM', depth: 1, marker: 'followup', markerAt: NOW - 3 * DAY },
    { id: 3, text: 'Auth', depth: 1, marker: 'confirmed' },
    { id: 4, text: 'Data', depth: 0 },
    { id: 5, text: 'Retention', depth: 1, marker: 'issue' }
  ],
  remarks: [
    { id: 'q1', anchorNodeId: 3, type: 'question', text: '<p>Which IdP?</p>', person: 'Ana', createdAt: NOW - DAY },
    { id: 'q2', anchorNodeId: 4, type: 'question', text: '<p>Where stored?</p>', createdAt: NOW - DAY },
    { id: 'a2', anchorNodeId: 4, answerTo: 'q2', text: '<p>EU</p>', createdAt: NOW }
  ]
};
const index = [{ id: 'd1', title: 'Landscape', updatedAt: NOW - 1000 }, { id: 'd2', title: 'Older', updatedAt: NOW - 5 * DAY }];

function fakeDb(extra: Partial<FirestoreReader> = {}): FirestoreReader {
  return {
    async get(path) {
      if (path === 'users/u/meta/docsIndex') return { value: index };
      if (path === 'users/u/docs/d1') return doc;
      if (path === 'users/u/docs/d2') return { title: 'Older', nodes: [{ id: 1, text: 'Nothing here', depth: 0 }] };
      if (path === 'users/u/meta/todos') return {
        value: [
          { id: 't1', text: 'Send the deck', dueDate: '2026-11-25', done: false, createdAt: 1 },
          { id: 't2', text: 'Contract back', waitingFor: 'Karsten', waitingSince: NOW - 2 * DAY, done: false, createdAt: 1 },
          { id: 't3', text: 'Old thing', done: true, completedAt: NOW - DAY, createdAt: 1 }
        ]
      };
      return null;
    },
    async list() { return []; },
    async batchGet(paths) { return paths.map((p) => { const id = p.split('/').pop() as string; return [id, id === 'd1' ? doc : { title: 'Older', nodes: [] }] as [string, Record<string, unknown>]; }); },
    ...extra
  };
}

describe('open items', () => {
  it('finds follow-ups (old names too) and unanswered questions, with the rows above', () => {
    const r = openItemsOf({ id: 'd1', title: 'Landscape' }, doc, NOW);
    expect(r.followUps).toEqual([{ row: 'Integrations › SAP to CRM', since: '3 days' }, { row: 'Data › Retention', since: '' }]);
    expect(r.openQuestions).toEqual([{ row: 'Integrations › Auth', question: 'Which IdP?', asked: '1 day', by: 'Ana' }]);
  });
  it('one document, or across all of them', async () => {
    expect(JSON.parse(await toolOpenItems(fakeDb(), 'u', 'd1', () => NOW)).followUps).toHaveLength(2);
    const all = JSON.parse(await toolOpenItems(fakeDb(), 'u', '', () => NOW));
    expect(all.map((d: { id: string }) => d.id)).toEqual(['d1']);
  });
});

describe('current document and sections', () => {
  it('returns the most recently changed document', async () => {
    const out = await toolCurrentDocument(fakeDb(), 'u');
    expect(out).toMatch(/^Most recently changed document: "Landscape" \(id d1/);
    expect(out).toContain('# Landscape');
  });
  it('reads one branch of a long document', async () => {
    const part = sectionOf(doc, 'data');
    expect(part?.title).toBe('Landscape › Data');
    expect((part?.nodes as Array<{ text: string; depth: number }>).map((n) => [n.text, n.depth])).toEqual([['Data', 0], ['Retention', 1]]);
    expect(await toolGetDocument(fakeDb(), 'u', 'd1', 'nowhere')).toMatch(/No row in that document contains/);
    expect(await toolGetDocument(fakeDb(), 'u', 'd1', 'integr')).toContain('SAP to CRM');
  });
});

describe('what changed', () => {
  it('compares the newest version from before the date with now', async () => {
    const old = { ts: NOW - 10 * DAY, nodes: [{ id: 1, text: 'Integrations', depth: 0 }, { id: 2, text: 'SAP to CRM (draft)', depth: 1 }, { id: 9, text: 'Gone row', depth: 0 }] };
    const newer = { ts: NOW - DAY, nodes: doc.nodes };
    const db = fakeDb({ async list(path) { return path.endsWith('/versions') ? [[String(old.ts), { ts: old.ts, json: JSON.stringify(old) }], [String(newer.ts), { ts: newer.ts, json: JSON.stringify(newer) }]] : []; } });
    const r = JSON.parse(await toolWhatChanged(db, 'u', 'd1', '', () => NOW));
    expect(r.comparedWith).toBe(new Date(old.ts).toISOString());
    expect(r.rowsAdded).toEqual(['Auth', 'Data', 'Retention']);
    expect(r.rowsRemoved).toEqual(['Gone row']);
    expect(r.rowsReworded).toEqual([{ was: 'SAP to CRM (draft)', now: 'SAP to CRM' }]);
    expect(r.summary).toMatch(/3 rows added/);
    expect(await toolWhatChanged(fakeDb(), 'u', 'd1', 'not a date')).toMatch(/Give "since" as a date/);
  });
});

describe('to-dos', () => {
  it('lists open tasks in the app sections; done only on request', async () => {
    const open = JSON.parse(await toolTodos(fakeDb(), 'u', false, () => NOW));
    expect(open.map((s: { section: string }) => s.section)).not.toContain('Done');
    expect(JSON.stringify(open)).toContain('Send the deck');
    expect(JSON.stringify(open)).toMatch(/Waiting for Karsten/);
    const all = JSON.parse(await toolTodos(fakeDb(), 'u', true, () => NOW));
    expect(JSON.stringify(all)).toContain('Old thing');
  });
});
