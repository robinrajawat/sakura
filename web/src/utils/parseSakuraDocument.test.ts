import { describe, it, expect } from 'vitest';
import { parseSakuraDocumentCore } from './parseSakuraDocument';

function payload(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    v: 1,
    kind: 'sakura-document',
    exportedAt: 1000,
    title: 'My Tree',
    nodes: [{ id: 1, depth: 0, text: 'Root', parentId: null, isCheckbox: false, checked: false, note: '', codeBlock: null, tags: [], styles: { bold: false, italic: false, underline: false, strike: false, heading: 0, highlight: false, color: false } }],
    ...overrides
  });
}

describe('parseSakuraDocumentCore', () => {
  it('parses a well-formed payload and returns title + nodes', () => {
    const result = parseSakuraDocumentCore(payload());
    expect(result?.title).toBe('My Tree');
    expect(result?.nodes).toHaveLength(1);
    expect(result?.nodes[0]).toMatchObject({ id: 1, depth: 0, text: 'Root' });
  });

  it('returns null for invalid JSON', () => {
    expect(parseSakuraDocumentCore('not json{')).toBeNull();
  });

  it('returns null when kind is not "sakura-document"', () => {
    expect(parseSakuraDocumentCore(payload({ kind: 'something-else' }))).toBeNull();
  });

  it('returns null when nodes is missing or not an array', () => {
    expect(parseSakuraDocumentCore(payload({ nodes: 'not-an-array' }))).toBeNull();
  });

  it('returns null when nodes is an empty array', () => {
    expect(parseSakuraDocumentCore(payload({ nodes: [] }))).toBeNull();
  });

  it('drops individual nodes missing a finite id or depth, keeping the rest', () => {
    const result = parseSakuraDocumentCore(
      payload({
        nodes: [
          { id: 1, depth: 0, text: 'Good' },
          { id: 'not-a-number', depth: 0, text: 'Bad id' },
          { id: 2, depth: 'nope', text: 'Bad depth' },
          { id: 3, depth: 1, text: 'Also good' }
        ]
      })
    );
    expect(result?.nodes.map((n) => n.id)).toEqual([1, 3]);
  });

  it('always sets parentId to null regardless of what the payload claims, letting the caller rebuild it', () => {
    const result = parseSakuraDocumentCore(
      payload({ nodes: [{ id: 1, depth: 0, text: 'Root', parentId: 999 }] })
    );
    expect(result?.nodes[0].parentId).toBeNull();
  });

  it('defaults title to "Untitled" when missing or blank', () => {
    expect(parseSakuraDocumentCore(payload({ title: '' }))?.title).toBe('Untitled');
    expect(parseSakuraDocumentCore(payload({ title: undefined }))?.title).toBe('Untitled');
  });

  it('normalizes styles, defaulting missing/invalid fields safely', () => {
    const result = parseSakuraDocumentCore(payload({ nodes: [{ id: 1, depth: 0, text: 'x', styles: { heading: 99, bold: 'yes' } }] }));
    expect(result?.nodes[0].styles).toEqual({
      bold: true,
      italic: false,
      underline: false,
      strike: false,
      heading: 0,
      highlight: false,
      color: false
    });
  });

  it('normalizes a valid codeBlock and drops a malformed one', () => {
    const withCode = parseSakuraDocumentCore(
      payload({ nodes: [{ id: 1, depth: 0, text: 'x', codeBlock: { lang: 'js', code: 'x=1' } }] })
    );
    expect(withCode?.nodes[0].codeBlock).toEqual({ lang: 'js', code: 'x=1' });
    const malformed = parseSakuraDocumentCore(payload({ nodes: [{ id: 1, depth: 0, text: 'x', codeBlock: { lang: 'js' } }] }));
    expect(malformed?.nodes[0].codeBlock).toBeNull();
  });

  it('filters non-string entries out of tags', () => {
    const result = parseSakuraDocumentCore(payload({ nodes: [{ id: 1, depth: 0, text: 'x', tags: ['ok', 42, null, 'also-ok'] }] }));
    expect(result?.nodes[0].tags).toEqual(['ok', 'also-ok']);
  });
});
