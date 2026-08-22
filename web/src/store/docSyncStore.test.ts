import { describe, expect, it } from 'vitest';
import { cloudNodeToOutlineNode, outlineNodeToRawNode, type RawNode } from './docSyncStore';

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
      // Legacy-only fields, deliberately present here to confirm they're just ignored on read
      // (not copied into OutlineNode -- that's fine, OutlineNode doesn't have room for them;
      // the preservation guarantee is about outlineNodeToRawNode not losing them, not about
      // this function surfacing them). `tags` is NOT in this list -- it's a known, surfaced
      // field, tested separately below.
      styles: { color: 'red' },
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
      tags: ['important']
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
      tags: []
    });
  });

  it('drops non-string entries from a malformed cloud tags array', () => {
    const raw: RawNode = { id: 1, depth: 0, tags: ['ok', 42, null, 'also-ok'] };
    expect(cloudNodeToOutlineNode(raw).tags).toEqual(['ok', 'also-ok']);
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
      tags: ['important']
    };
    const result = outlineNodeToRawNode(edited, raw);
    // Every legacy-only field survives untouched.
    expect(result.styles).toEqual({ color: 'red' });
    expect(result.marker).toBe('confirmed');
    expect(result.noteTitle).toBe('My note');
    expect(result.decisionLog).toEqual([{ id: 'd1' }]);
    expect(result.slideDivider).toBe(true);
    expect(result.createdAt).toBe(111);
    expect(result.modifiedAt).toBe(222);
    // The one field that actually changed reflects the edit.
    expect(result.text).toBe('edited text');
    // tags is a known field, unchanged in this edit, still comes from `edited` not `raw`.
    expect(result.tags).toEqual(['important']);
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
      tags: ['old-tag']
    };
    const edited = { ...raw, tags: ['new-tag', 'second-tag'] } as unknown as Parameters<
      typeof outlineNodeToRawNode
    >[0];
    const result = outlineNodeToRawNode(edited, raw);
    expect(result.tags).toEqual(['new-tag', 'second-tag']);
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
      tags: []
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
