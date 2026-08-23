import { describe, expect, it } from 'vitest';
import { cloudNodeToOutlineNode, outlineNodeToRawNode, type RawNode } from './docSyncStore';
import { defaultNodeStyles } from './outlineStore';

describe('cloudNodeToOutlineNode', () => {
  it('maps the fields web/ understands from a full legacy-shaped node', () => {
    const raw: RawNode = {
      id: 5,
      depth: 2,
      text: 'Hello',
      parentId: 1,
      isCheckbox: true,
      checked: true,
      note: 'a note',
      codeBlock: { lang: 'python', code: 'print(1)' },
      tags: ['important'],
      // `styles` is a KNOWN, surfaced field (Phase 6.2) -- real values here should round-trip
      // through, not get dropped/defaulted. `marker` stays a genuinely unknown legacy-only
      // field, deliberately present to confirm it's ignored on read (OutlineNode has no room
      // for it; the preservation guarantee is about outlineNodeToRawNode not losing it, not
      // about this function surfacing it).
      styles: { bold: true, italic: false, underline: true, strike: false, heading: 2, highlight: 'yellow', color: 'red' },
      marker: 'confirmed'
    };
    expect(cloudNodeToOutlineNode(raw)).toEqual({
      id: 5,
      depth: 2,
      text: 'Hello',
      parentId: null, // never trusted from cloud data, see this function's own header
      isCheckbox: true,
      checked: true,
      note: 'a note',
      codeBlock: { lang: 'python', code: 'print(1)' },
      tags: ['important'],
      styles: { bold: true, italic: false, underline: true, strike: false, heading: 2, highlight: 'yellow', color: 'red' }
    });
  });

  it('defaults missing/invalid fields the same way normalizeNode would', () => {
    const raw: RawNode = { id: '7', depth: 'not-a-number' };
    expect(cloudNodeToOutlineNode(raw)).toEqual({
      id: 7,
      depth: 0,
      text: '',
      parentId: null,
      isCheckbox: false,
      checked: false,
      note: '',
      codeBlock: null,
      tags: [], styles: defaultNodeStyles()
    });
  });

  it('drops non-string entries from a malformed cloud tags array', () => {
    const raw: RawNode = { id: 1, depth: 0, tags: ['ok', 42, null, 'also-ok'], styles: defaultNodeStyles() };
    expect(cloudNodeToOutlineNode(raw).tags).toEqual(['ok', 'also-ok']);
  });

  it('rejects an out-of-range or non-integer heading, matching legacy\'s own normalizeStyles validation', () => {
    expect(cloudNodeToOutlineNode({ id: 1, depth: 0, styles: { heading: 7 } }).styles.heading).toBe(0);
    expect(cloudNodeToOutlineNode({ id: 1, depth: 0, styles: { heading: 0 } }).styles.heading).toBe(0);
    expect(cloudNodeToOutlineNode({ id: 1, depth: 0, styles: { heading: -1 } }).styles.heading).toBe(0);
    expect(cloudNodeToOutlineNode({ id: 1, depth: 0, styles: { heading: 2.5 } }).styles.heading).toBe(0);
    expect(cloudNodeToOutlineNode({ id: 1, depth: 0, styles: { heading: 'h1' } }).styles.heading).toBe(0);
    expect(cloudNodeToOutlineNode({ id: 1, depth: 0, styles: { heading: 3 } }).styles.heading).toBe(3);
  });

  it('defaults styles entirely when the raw node has no styles object at all', () => {
    expect(cloudNodeToOutlineNode({ id: 1, depth: 0 }).styles).toEqual(defaultNodeStyles());
  });
});

describe('outlineNodeToRawNode', () => {
  it('preserves legacy-only fields when a raw counterpart exists, overwriting only what web/ edits', () => {
    const raw: RawNode = {
      id: 5,
      depth: 1,
      text: 'old text',
      parentId: 1,
      isCheckbox: false,
      checked: false,
      note: '',
      codeBlock: null,
      tags: ['important'],
      styles: { color: 'red' },
      marker: 'confirmed',
      noteTitle: 'My note',
      decisionLog: [{ id: 'd1' }],
      slideDivider: true,
      createdAt: 111,
      modifiedAt: 222,
      completedAt: null
    };
    const edited = {
      id: 5,
      depth: 1,
      text: 'edited text', // the only thing that actually changed
      parentId: 1,
      isCheckbox: false,
      checked: false,
      note: '',
      codeBlock: null,
      tags: ['important'],
      styles: defaultNodeStyles()
    };
    const result = outlineNodeToRawNode(edited, raw);
    // Genuinely unknown legacy-only fields survive untouched.
    expect(result.marker).toBe('confirmed');
    expect(result.noteTitle).toBe('My note');
    expect(result.decisionLog).toEqual([{ id: 'd1' }]);
    expect(result.slideDivider).toBe(true);
    expect(result.createdAt).toBe(111);
    expect(result.modifiedAt).toBe(222);
    // The one field that actually changed reflects the edit.
    expect(result.text).toBe('edited text');
    // tags/styles are both known, WRITE fields -- like text, they always come from `edited`,
    // never preserved from `raw` even when raw held a different (here, invalid/legacy-shaped)
    // value. styles is no longer opaque-preserved the way marker/noteTitle/etc still are.
    expect(result.tags).toEqual(['important']);
    expect(result.styles).toEqual(defaultNodeStyles());
  });

  it('writes an edited tags array, overwriting the raw counterpart (known field, not preserved)', () => {
    const raw: RawNode = {
      id: 5,
      depth: 1,
      text: 'text',
      parentId: 1,
      isCheckbox: false,
      checked: false,
      note: '',
      codeBlock: null,
      tags: ['old-tag'], styles: defaultNodeStyles()
    };
    const edited = { ...raw, tags: ['new-tag', 'second-tag'], styles: defaultNodeStyles() } as unknown as Parameters<
      typeof outlineNodeToRawNode
    >[0];
    const result = outlineNodeToRawNode(edited, raw);
    expect(result.tags).toEqual(['new-tag', 'second-tag']);
  });

  it('writes an edited styles object, overwriting the raw counterpart (known field, not preserved)', () => {
    const raw: RawNode = {
      id: 5,
      depth: 1,
      text: 'text',
      parentId: 1,
      isCheckbox: false,
      checked: false,
      note: '',
      codeBlock: null,
      tags: [],
      styles: defaultNodeStyles()
    };
    const newStyles = { ...defaultNodeStyles(), bold: true, heading: 3 };
    const edited = { ...raw, styles: newStyles } as unknown as Parameters<typeof outlineNodeToRawNode>[0];
    const result = outlineNodeToRawNode(edited, raw);
    expect(result.styles).toEqual(newStyles);
  });

  it('writes only the known fields for a node with no raw counterpart (freshly created in the web app)', () => {
    const edited = {
      id: 99,
      depth: 0,
      text: 'brand new',
      parentId: null,
      isCheckbox: false,
      checked: false,
      note: '',
      codeBlock: null,
      tags: [], styles: defaultNodeStyles()
    };
    const result = outlineNodeToRawNode(edited, undefined);
    expect(result).toEqual(edited);
  });

  it('a checkbox toggle only changes checked, leaving every other legacy field untouched', () => {
    const raw: RawNode = {
      id: 1,
      depth: 0,
      text: 'task',
      parentId: null,
      isCheckbox: true,
      checked: false,
      note: '',
      codeBlock: null,
      tags: ['work'],
      marker: 'issue'
    };
    const edited = { ...raw, checked: true } as unknown as Parameters<typeof outlineNodeToRawNode>[0];
    const result = outlineNodeToRawNode(edited, raw);
    expect(result.checked).toBe(true);
    expect(result.tags).toEqual(['work']);
    expect(result.marker).toBe('issue');
  });
});
