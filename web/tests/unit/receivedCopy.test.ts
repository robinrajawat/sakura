import { describe, it, expect } from 'vitest';
import { cleanReceivedCopy, docIdForCopy } from '../../src/utils/receivedCopy';

let n = 0;
const cleaners = { sanitize: (h: string) => h.replace(/\son\w+="[^"]*"/g, ''), tidyTable: (h: string) => h.trim(), newDiagramId: () => 'new' + ++n };

describe('receivedCopy', () => {
  it('gives each inbox item one stable document id', () => {
    expect(docIdForCopy('Ab_c-1/x')).toBe('dcAbc1x');
    expect(docIdForCopy('Ab_c-1/x')).toBe(docIdForCopy('Ab_c-1/x'));
  });

  it('repairs ids, indents and parent links', () => {
    const d = cleanReceivedCopy({ nodes: [{ id: 5, text: 'A', depth: 3 }, { id: 5, text: 'B', depth: 9 }, { text: 'C', depth: -2 }, { id: 2, text: 'D', depth: 1 }, 'junk', null, [1]] }, cleaners);
    const nodes = d.nodes as Array<{ id: number; text: string; depth: number; parentId: number | null }>;
    expect(nodes.map((x) => [x.text, x.depth])).toEqual([['A', 0], ['B', 1], ['C', 0], ['D', 1]]);
    expect(new Set(nodes.map((x) => x.id)).size).toBe(4);
    expect(nodes.map((x) => x.parentId)).toEqual([null, 5, null, nodes[2].id]);
    expect(d.nextId).toBe(Math.max(...nodes.map((x) => x.id)) + 1);
  });

  it('cleans stored HTML and odd values', () => {
    const d = cleanReceivedCopy({ title: 7, nodes: [{ id: 1, text: 42, note: '<p onclick="x()">n</p>', tables: [' <table></table> ', 3], styles: [1], images: 'no' }] }, cleaners);
    const r = (d.nodes as Array<Record<string, unknown>>)[0];
    expect([d.title, r.text, r.note, r.tables, r.styles, r.images]).toEqual(['', '', '<p>n</p>', ['<table></table>'], {}, []]);
  });

  it('keeps only diagrams with a drawing, anchored to a row that exists, and thread entries on existing rows', () => {
    const d = cleanReceivedCopy({
      nodes: [{ id: 1, text: 'A', depth: 0 }, { id: 2, text: 'B', depth: 1 }],
      diagrams: [{ xml: '  ' }, { xml: '<mxfile/>', anchorNodeId: 999 }, { id: 'keep', xml: '<mxfile/>', anchorNodeId: 2 }, 'x'],
      remarks: [{ id: 'r1', anchorNodeId: 2, text: '<b onmouseover="y()">hi</b>', title: 'T' }, { id: 'r2', anchorNodeId: 404 }]
    }, cleaners);
    expect(d.diagrams).toEqual([{ id: 'new1', xml: '<mxfile/>', anchorNodeId: 1 }, { id: 'keep', xml: '<mxfile/>', anchorNodeId: 2 }]);
    expect(d.remarks).toEqual([{ id: 'r1', anchorNodeId: 2, text: '<b>hi</b>', title: 'T' }]);
  });

  it('an empty or missing document stays empty, not broken', () => {
    const d = cleanReceivedCopy({}, cleaners);
    expect([d.nodes, d.nextId, d.diagrams, d.remarks, d.title]).toEqual([[], 1, [], [], '']);
  });
});
