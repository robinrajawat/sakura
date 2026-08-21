import { describe, it, expect } from 'vitest';
import {
  diagramGenLegendEntriesCore,
  diagramGenLegendCellsCore,
  type LegendNode,
  type LegendNodeMetaMap,
} from './diagramGenLegend';

function nodes(...marks: (string | undefined)[]): LegendNode[] {
  return marks.map((marker, i) => ({ id: i + 1, marker }));
}

describe('diagramGenLegendEntriesCore', () => {
  it('returns an empty array when nothing in scope is classified or marked', () => {
    const n = nodes(undefined, undefined);
    const meta: LegendNodeMetaMap = new Map();
    const entries = diagramGenLegendEntriesCore(n, { scopeIdxs: [0, 1] }, meta);
    expect(entries).toEqual([]);
  });

  it('includes a shape entry only for shapes actually present in scope', () => {
    const n = nodes();
    const meta: LegendNodeMetaMap = new Map([[1, { shape: 'ui' }]]);
    const entries = diagramGenLegendEntriesCore([{ id: 1 }], { scopeIdxs: [0] }, meta);
    expect(entries).toHaveLength(1);
    expect(entries[0].label).toBe('UI / Frontend');
  });

  it('excludes a shape of "process" (the default/unremarkable shape)', () => {
    const meta: LegendNodeMetaMap = new Map([[1, { shape: 'process' }]]);
    const entries = diagramGenLegendEntriesCore([{ id: 1 }], { scopeIdxs: [0] }, meta);
    expect(entries).toEqual([]);
  });

  it('orders shape entries by the fixed layer order, then decision/note/excluded/datastore', () => {
    const n = [{ id: 1 }, { id: 2 }, { id: 3 }];
    const meta: LegendNodeMetaMap = new Map([
      [1, { shape: 'decision' }],
      [2, { shape: 'external' }],
      [3, { shape: 'ui' }],
    ]);
    const entries = diagramGenLegendEntriesCore(n, { scopeIdxs: [0, 1, 2] }, meta);
    // layer order is [..., external, ...] before the decision/note/excluded/datastore tail
    expect(entries.map((e) => e.label)).toEqual(['UI / Frontend', 'External system', 'Decision']);
  });

  it('gives "note" and "excluded" shapes their own bespoke colors, not a palette lookup', () => {
    const meta: LegendNodeMetaMap = new Map([
      [1, { shape: 'note' }],
      [2, { shape: 'excluded' }],
    ]);
    const entries = diagramGenLegendEntriesCore([{ id: 1 }, { id: 2 }], { scopeIdxs: [0, 1] }, meta);
    expect(entries.find((e) => e.label === 'Note')?.color.fill).toBe('#FBF8EF');
    expect(entries.find((e) => e.label === 'Out of scope / unaffected')?.color.fill).toBe('#F7F7F5');
  });

  it('includes a marker entry only for markers actually present in scope', () => {
    const n = nodes('confirmed', undefined);
    const meta: LegendNodeMetaMap = new Map();
    const entries = diagramGenLegendEntriesCore(n, { scopeIdxs: [0, 1] }, meta);
    expect(entries).toHaveLength(1);
    expect(entries[0].label).toBe('Confirmed');
  });

  it('ignores an unrecognized marker value', () => {
    const n = nodes('not-a-real-marker');
    const meta: LegendNodeMetaMap = new Map();
    const entries = diagramGenLegendEntriesCore(n, { scopeIdxs: [0] }, meta);
    expect(entries).toEqual([]);
  });

  it('renders both shape and marker entries together, shapes first', () => {
    const n = [{ id: 1, marker: 'issue' }, { id: 2 }];
    const meta: LegendNodeMetaMap = new Map([[2, { shape: 'ui' }]]);
    const entries = diagramGenLegendEntriesCore(n, { scopeIdxs: [0, 1] }, meta);
    expect(entries.map((e) => e.label)).toEqual(['UI / Frontend', 'Issue']);
  });

  it('deduplicates repeated shapes/markers across multiple nodes into one entry each', () => {
    const n = [{ id: 1, marker: 'confirmed' }, { id: 2, marker: 'confirmed' }, { id: 3 }, { id: 4 }];
    const meta: LegendNodeMetaMap = new Map([
      [3, { shape: 'ui' }],
      [4, { shape: 'ui' }],
    ]);
    const entries = diagramGenLegendEntriesCore(n, { scopeIdxs: [0, 1, 2, 3] }, meta);
    expect(entries).toHaveLength(2);
  });

  it('only considers nodes within scopeIdxs, ignoring others in the array', () => {
    const n = [{ id: 1, marker: 'confirmed' }, { id: 2, marker: 'issue' }];
    const meta: LegendNodeMetaMap = new Map();
    const entries = diagramGenLegendEntriesCore(n, { scopeIdxs: [0] }, meta);
    expect(entries.map((e) => e.label)).toEqual(['Confirmed']);
  });
});

describe('diagramGenLegendCellsCore', () => {
  it('returns an empty string for no entries', () => {
    expect(diagramGenLegendCellsCore([], 0, 0)).toBe('');
  });

  it('renders one swatch cell and one label cell per entry', () => {
    const xml = diagramGenLegendCellsCore(
      [{ label: 'UI / Frontend', color: { fill: '#E6F1FB', stroke: '#185FA5', font: '#0C447C' } }],
      100,
      40
    );
    expect(xml.match(/<mxCell/g)?.length).toBe(2);
    expect(xml).toContain('id="gd-legend-sw0"');
    expect(xml).toContain('id="gd-legend-lbl0"');
    expect(xml).toContain('fillColor=#E6F1FB');
    expect(xml).toContain('x="100"');
  });

  it('stacks successive entries 22px apart vertically', () => {
    const entries = [
      { label: 'A', color: { fill: '#fff', stroke: '#000', font: '#000' } },
      { label: 'B', color: { fill: '#fff', stroke: '#000', font: '#000' } },
    ];
    const xml = diagramGenLegendCellsCore(entries, 0, 40);
    expect(xml).toContain('y="40"');
    expect(xml).toContain('y="62"');
  });

  it('escapes HTML-special characters in the label', () => {
    const xml = diagramGenLegendCellsCore(
      [{ label: '<a> & "b"', color: { fill: '#fff', stroke: '#000', font: '#000' } }],
      0,
      0
    );
    expect(xml).toContain('&lt;a&gt; &amp; &quot;b&quot;');
    expect(xml).not.toContain('<a>');
  });
});
