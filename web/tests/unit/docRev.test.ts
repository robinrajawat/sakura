import { describe, it, expect } from 'vitest';
import { decideDocPush, readDocRev, localCopyIsNewer, deletionWins } from '../../src/state/docRev';

describe('readDocRev', () => {
  it('reads missing, invalid and negative values as 0', () => {
    expect(readDocRev(undefined)).toBe(0);
    expect(readDocRev('x')).toBe(0);
    expect(readDocRev(-3)).toBe(0);
    expect(readDocRev(4)).toBe(4);
  });
});

describe('decideDocPush', () => {
  it('writes a document the cloud does not have', () => {
    expect(decideDocPush({ exists: false }, undefined, 10)).toEqual({ write: true, nextRev: 1 });
    expect(decideDocPush({ exists: false }, 4, 10)).toEqual({ write: true, nextRev: 5 });
  });

  it('writes when the cloud is still at the remembered rev', () => {
    expect(decideDocPush({ exists: true, rev: 3, updatedAt: 999 }, 3, 1)).toEqual({ write: true, nextRev: 4 });
  });

  it('refuses when another device wrote in between, whatever the times say', () => {
    expect(decideDocPush({ exists: true, rev: 4, updatedAt: 1 }, 3, 999)).toEqual({ write: false });
  });

  it('treats a cloud document from before revs as rev 0', () => {
    expect(decideDocPush({ exists: true, updatedAt: 5 }, 0, 1)).toEqual({ write: true, nextRev: 1 });
    expect(decideDocPush({ exists: true, updatedAt: 5 }, 2, 1)).toEqual({ write: false });
  });

  it('migration: with no remembered rev, the old newer-save rule decides', () => {
    expect(decideDocPush({ exists: true, rev: 7, updatedAt: 100 }, undefined, 200)).toEqual({ write: true, nextRev: 8 });
    expect(decideDocPush({ exists: true, rev: 7, updatedAt: 100 }, undefined, 100)).toEqual({ write: true, nextRev: 8 });
    expect(decideDocPush({ exists: true, rev: 7, updatedAt: 300 }, undefined, 200)).toEqual({ write: false });
  });
});

describe('localCopyIsNewer', () => {
  it('is true only when this device saved after the account was last written', () => {
    expect(localCopyIsNewer(200, 100)).toBe(true);
    expect(localCopyIsNewer(100, 100)).toBe(false);
    expect(localCopyIsNewer(100, 200)).toBe(false);
    expect(localCopyIsNewer(undefined, 5)).toBe(false);
  });
});

describe('deletionWins', () => {
  it('a delete wins over a copy last saved before it', () => {
    expect(deletionWins(100, 200, false)).toBe(true);
    expect(deletionWins(200, 200, false)).toBe(true);
  });
  it('an edit made after the delete wins, and so do unsaved edits on screen', () => {
    expect(deletionWins(300, 200, false)).toBe(false);
    expect(deletionWins(100, 200, true)).toBe(false);
  });
});
