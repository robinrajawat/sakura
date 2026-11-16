import { describe, it, expect } from 'vitest';
import { fieldDraftKey, threadDraftKey, draftsForDoc, pruneDrafts, mergeDrafts, THREAD_DRAFT_MAX_AGE_MS } from '../../src/utils/threadDrafts';

const d = (html: string, at: number, extra: object = {}) => ({ html, at, ...extra });

describe('threadDrafts', () => {
  it('keys drafts by document and row, and lists one document\'s drafts', () => {
    const map = { [threadDraftKey('docA', 1)]: d('a', 1), [threadDraftKey('docA', 'x')]: d('b', 2), [threadDraftKey('docB', 1)]: d('c', 3) };
    expect(draftsForDoc(map, 'docA')).toEqual([[1, d('a', 1)], ['x', d('b', 2)]]);
    expect(draftsForDoc(map, 'docC')).toEqual([]);
    expect(draftsForDoc(null, 'docA')).toEqual([]);
  });

  it('drops malformed and old drafts', () => {
    const now = 10 * THREAD_DRAFT_MAX_AGE_MS;
    const map = { a: d('keep', now - 1000), b: d('old', now - THREAD_DRAFT_MAX_AGE_MS - 1), c: { html: 5, at: now }, e: null };
    expect(pruneDrafts(map, now)).toEqual({ a: d('keep', now - 1000) });
    expect(pruneDrafts('junk', now)).toEqual({});
  });

  it('takes a change made on one side only', () => {
    const base = { k: d('one', 1) };
    expect(mergeDrafts(base, { k: d('one two', 2) }, base)).toEqual({ k: d('one two', 2) });
    expect(mergeDrafts(base, base, { k: d('one three', 3) })).toEqual({ k: d('one three', 3) });
  });

  it('removes a draft sent on one device, unless the other device changed it since', () => {
    const base = { k: d('one', 1) };
    expect(mergeDrafts(base, base, {})).toEqual({});
    expect(mergeDrafts(base, {}, base)).toEqual({});
    expect(mergeDrafts(base, { k: d('one more', 2) }, {})).toEqual({ k: d('one more', 2) });
    expect(mergeDrafts(base, {}, { k: d('one more', 2) })).toEqual({ k: d('one more', 2) });
  });

  it('keeps both texts when both devices changed the same draft, the newer first', () => {
    const base = { k: d('start', 1) };
    expect(mergeDrafts(base, { k: d('phone text', 5) }, { k: d('laptop text', 4, { kind: 'question' }) }))
      .toEqual({ k: d('phone text<br>laptop text', 5) });
    // The newer already holds the older's words: no repeat.
    expect(mergeDrafts(base, { k: d('start and more', 3) }, { k: d('start and more, then some', 6) }))
      .toEqual({ k: d('start and more, then some', 6) });
  });

  it('keeps everything both sides have on a first sync (no base)', () => {
    expect(mergeDrafts(undefined, { a: d('mine', 1) }, { b: d('theirs', 2) })).toEqual({ a: d('mine', 1), b: d('theirs', 2) });
    expect(mergeDrafts(undefined, { a: d('mine', 1) }, { a: d('theirs', 2) })).toEqual({ a: d('theirs<br>mine', 2) });
  });

  it('keeps both texts of a plain-text field on separate lines', () => {
    const k = fieldDraftKey('todos-add');
    expect(k).toBe('field|todos-add');
    expect(mergeDrafts({}, { [k]: d('Call the bank', 2) }, { [k]: d('Book flights', 3) })).toEqual({ [k]: d('Book flights\nCall the bank', 3) });
    // A field draft never shows up among a document's reply drafts.
    expect(draftsForDoc({ [k]: d('x', 1) }, 'dmwivi4eskdcb3')).toEqual([]);
  });
});
