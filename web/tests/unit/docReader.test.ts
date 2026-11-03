import { describe, it, expect } from 'vitest';
import {
  readerFolderPath,
  readerDocList,
  readerVisibleRows,
  readerAncestorIds,
  readerHasNote,
  readerThread
} from '../../src/utils/docReader';

const folders = [
  { id: 'f1', name: 'Projects' },
  { id: 'f2', name: 'Logistics', parentId: 'f1' },
  { id: 'loop', name: 'Loop', parentId: 'loop' }
];

describe('readerFolderPath', () => {
  it('joins the folder chain from the top', () => {
    expect(readerFolderPath('f2', folders)).toBe('Projects › Logistics');
    expect(readerFolderPath('f1', folders)).toBe('Projects');
  });
  it('is empty outside any folder or for an unknown folder', () => {
    expect(readerFolderPath(null, folders)).toBe('');
    expect(readerFolderPath('nope', folders)).toBe('');
  });
  it('stops on a parent loop instead of hanging', () => {
    expect(readerFolderPath('loop', folders).split(' › ').length).toBeLessThanOrEqual(32);
  });
});

describe('readerDocList', () => {
  const index = [
    { id: 'a', title: 'Night delivery', updatedAt: 300 },
    { id: 'b', title: '', updatedAt: 100 },
    { id: 'c', title: 'Trashed', updatedAt: 999, trashedAt: 5 },
    { id: 'd', title: 'Roadmap', updatedAt: 200 }
  ];
  const map = { a: 'f2', d: 'f1' };
  it('leaves out Trash, newest first, with folder paths and Untitled', () => {
    expect(readerDocList(index, folders, map)).toEqual([
      { id: 'a', title: 'Night delivery', path: 'Projects › Logistics', updatedAt: 300 },
      { id: 'd', title: 'Roadmap', path: 'Projects', updatedAt: 200 },
      { id: 'b', title: 'Untitled', path: '', updatedAt: 100 }
    ]);
  });
  it('filters by every word in name or folder path', () => {
    expect(readerDocList(index, folders, map, 'logistics night').map((d) => d.id)).toEqual(['a']);
    expect(readerDocList(index, folders, map, 'projects').map((d) => d.id)).toEqual(['a', 'd']);
    expect(readerDocList(index, folders, map, 'zzz')).toEqual([]);
  });
  it('copes with missing or broken data', () => {
    expect(readerDocList(undefined, null, null)).toEqual([]);
    expect(readerDocList([null, { title: 'no id' }], [], {})).toEqual([]);
  });
});

const nodes = [
  { id: 1, depth: 0, text: 'A' },
  { id: 2, depth: 1, text: 'A.1' },
  { id: 3, depth: 2, text: 'A.1.a' },
  { id: 4, depth: 1, text: 'A.2' },
  { id: 5, depth: 0, text: 'B' }
];

describe('readerVisibleRows', () => {
  it('shows every row when nothing is folded', () => {
    const rows = readerVisibleRows(nodes, new Set());
    expect(rows.map((r) => r.node.id)).toEqual([1, 2, 3, 4, 5]);
    expect(rows.map((r) => r.hasChildren)).toEqual([true, true, false, false, false]);
  });
  it('hides what is under a folded row and counts it', () => {
    const rows = readerVisibleRows(nodes, new Set([1]));
    expect(rows.map((r) => r.node.id)).toEqual([1, 5]);
    expect(rows[0]).toMatchObject({ folded: true, hiddenCount: 3 });
  });
  it('a fold on a row without children does nothing', () => {
    expect(readerVisibleRows(nodes, new Set([5])).map((r) => r.folded)).toEqual([false, false, false, false, false]);
  });
  it('a nested fold hides only its own branch', () => {
    expect(readerVisibleRows(nodes, new Set([2])).map((r) => r.node.id)).toEqual([1, 2, 4, 5]);
  });
});

describe('readerAncestorIds', () => {
  it('lists the rows above, nearest first', () => {
    expect(readerAncestorIds(nodes, 3)).toEqual([2, 1]);
    expect(readerAncestorIds(nodes, 5)).toEqual([]);
    expect(readerAncestorIds(nodes, 99)).toEqual([]);
  });
});

describe('readerHasNote', () => {
  it('needs a title, visible text or a picture', () => {
    expect(readerHasNote({ id: 1, note: '<p> </p>' })).toBe(false);
    expect(readerHasNote({ id: 1, note: '<p>Hi</p>' })).toBe(true);
    expect(readerHasNote({ id: 1, note: '<img src="data:image/png;base64,x">' })).toBe(true);
    expect(readerHasNote({ id: 1, noteTitle: 'Title' })).toBe(true);
  });
});

describe('readerThread', () => {
  const entries = [
    { id: 'q', anchorNodeId: 7, type: 'question' as const, text: 'Why?', createdAt: 1 },
    { id: 'c', anchorNodeId: 7, text: 'A comment', createdAt: 2 },
    { id: 'r', anchorNodeId: 7, text: 'Because', createdAt: 3, answerTo: 'q' },
    { id: 'd', anchorNodeId: 7, text: 'We go', createdAt: 4, decision: true },
    { id: 'blank', anchorNodeId: 7, text: '<p></p>', createdAt: 5 },
    { id: 'q2', anchorNodeId: 7, type: 'question' as const, text: 'When?', createdAt: 6 },
    { id: 'other', anchorNodeId: 8, text: 'Elsewhere', createdAt: 1 }
  ];
  it('reads in order with replies under their entry, blanks left out', () => {
    const t = readerThread(entries, 7);
    expect(t.map((x) => [x.entry.id, x.kind, x.nested, x.open])).toEqual([
      ['q', 'question', false, false],
      ['r', 'reply', true, false],
      ['c', 'comment', false, false],
      ['d', 'decision', false, false],
      ['q2', 'question', false, true]
    ]);
  });
});
