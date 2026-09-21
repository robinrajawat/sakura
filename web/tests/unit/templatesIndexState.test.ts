import { describe, it, expect, beforeEach } from 'vitest';
import {
  templateKey,
  builtinTemplateId,
  getBuiltinTemplateIconById,
  initTemplatesIndexState,
  loadTemplatesIndex,
  saveTemplatesIndex,
  setTemplateIcon,
  touchTemplateIndex,
  loadActiveTemplatesIndex,
  loadTrashedTemplatesIndex,
  moveTemplateToTrashCore,
  restoreTemplateFromTrashCore,
  stampTemplateDateAuthorCore,
  type TemplatesIndexDeps,
  type TemplateIndexEntry,
  type TemplateStampableNode
} from '../../src/state/templatesIndex';

describe('templateKey / builtinTemplateId / getBuiltinTemplateIconById (pure)', () => {
  it('templateKey prefixes with the storage key scheme', () => {
    expect(templateKey('abc123')).toBe('sakura_template_v1_abc123');
  });

  it('builtinTemplateId prefixes and version-suffixes a bare key', () => {
    // Oracle: matches index.html's `'t_builtin_'+key+'_v'+BUILTIN_TEMPLATES_VERSION` with the
    // real current version (10).
    expect(builtinTemplateId('meeting-notes')).toBe('t_builtin_meeting-notes_v10');
  });

  it('getBuiltinTemplateIconById always returns null (no built-in template pack ships anymore)', () => {
    // Oracle: index.html's getBuiltinTemplateDefs() is a hardcoded empty array, so the original
    // `.find()` on it always misses and the function always returns null — this is the exact
    // same always-null behavior, not a change.
    expect(getBuiltinTemplateIconById('t_builtin_meeting-notes_v10')).toBeNull();
    expect(getBuiltinTemplateIconById('anything')).toBeNull();
  });
});

interface LocalStorageLike {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
}

describe('stateful templates index (initTemplatesIndexState + CRUD)', () => {
  let storageData: Record<string, string>;
  let markMetaChangedCalls: string[];
  let scheduleBackupWriteCalls: number;
  let lastAnyDataChangeAt: number | null;
  let fakeNow: number;

  const fakeStorage: LocalStorageLike = {
    getItem: (key) => (key in storageData ? storageData[key] : null),
    setItem: (key, value) => {
      storageData[key] = value;
    }
  };

  function makeDeps(overrides: Partial<TemplatesIndexDeps> = {}): TemplatesIndexDeps {
    return {
      getLocalStorage: () => fakeStorage as unknown as Storage,
      markMetaChanged: (metaKey) => {
        markMetaChangedCalls.push(metaKey);
      },
      scheduleBackupWrite: () => {
        scheduleBackupWriteCalls++;
      },
      setLastAnyDataChangeAt: (ts) => {
        lastAnyDataChangeAt = ts;
      },
      now: () => fakeNow,
      ...overrides
    };
  }

  beforeEach(() => {
    storageData = {};
    markMetaChangedCalls = [];
    scheduleBackupWriteCalls = 0;
    lastAnyDataChangeAt = null;
    fakeNow = 1_000_000;
    initTemplatesIndexState(makeDeps());
  });

  it('loadTemplatesIndex returns [] when nothing is stored yet', () => {
    expect(loadTemplatesIndex()).toEqual([]);
  });

  it('loadTemplatesIndex returns [] for corrupt JSON or a non-array value, never throws', () => {
    storageData['sakura_templates_index_v1'] = '{not valid json';
    expect(loadTemplatesIndex()).toEqual([]);
    storageData['sakura_templates_index_v1'] = JSON.stringify({ not: 'an array' });
    expect(loadTemplatesIndex()).toEqual([]);
  });

  it('loadTemplatesIndex returns [] when getLocalStorage() itself returns null (e.g. private browsing)', () => {
    initTemplatesIndexState(makeDeps({ getLocalStorage: () => null }));
    expect(loadTemplatesIndex()).toEqual([]);
  });

  it('saveTemplatesIndex persists the list and fires all three real side effects', () => {
    const list: TemplateIndexEntry[] = [{ id: 't1', title: 'One' }];
    saveTemplatesIndex(list);
    expect(JSON.parse(storageData['sakura_templates_index_v1'])).toEqual(list);
    expect(lastAnyDataChangeAt).toBe(fakeNow);
    expect(scheduleBackupWriteCalls).toBe(1);
    expect(markMetaChangedCalls).toEqual(['templatesIndex']);
  });

  it('saveTemplatesIndex silently no-ops on a storage write failure, matching the original try/catch', () => {
    const throwingStorage: LocalStorageLike = {
      getItem: () => null,
      setItem: () => {
        throw new Error('QuotaExceededError');
      }
    };
    initTemplatesIndexState(makeDeps({ getLocalStorage: () => throwingStorage as unknown as Storage }));
    expect(() => saveTemplatesIndex([{ id: 't1' }])).not.toThrow();
  });

  it('setTemplateIcon updates an existing entry\'s icon and persists', () => {
    saveTemplatesIndex([{ id: 't1', title: 'One', icon: null }]);
    const result = setTemplateIcon('t1', 'star');
    expect(result.find((t) => t.id === 't1')?.icon).toBe('star');
    expect(JSON.parse(storageData['sakura_templates_index_v1'])[0].icon).toBe('star');
  });

  it('setTemplateIcon clears an icon when passed a falsy value', () => {
    saveTemplatesIndex([{ id: 't1', icon: 'star' }]);
    const result = setTemplateIcon('t1', null);
    expect(result.find((t) => t.id === 't1')?.icon).toBeNull();
  });

  it('setTemplateIcon is a no-op for an unknown id (returns the list unchanged, no save)', () => {
    saveTemplatesIndex([{ id: 't1' }]);
    scheduleBackupWriteCalls = 0;
    const result = setTemplateIcon('does-not-exist', 'star');
    expect(result).toEqual([{ id: 't1' }]);
    expect(scheduleBackupWriteCalls).toBe(0);
  });

  it('touchTemplateIndex creates a new entry with a fresh updatedAt when the id is unknown', () => {
    const result = touchTemplateIndex('t1', 'My Template');
    expect(result).toEqual([{ id: 't1', title: 'My Template', updatedAt: fakeNow }]);
  });

  it('touchTemplateIndex defaults to "Untitled template" for a falsy title', () => {
    const result = touchTemplateIndex('t1', '');
    expect(result[0].title).toBe('Untitled template');
    const result2 = touchTemplateIndex('t2', undefined);
    expect(result2.find((t) => t.id === 't2')?.title).toBe('Untitled template');
  });

  it('touchTemplateIndex updates an existing entry in place, preserving other fields', () => {
    saveTemplatesIndex([{ id: 't1', title: 'Old', icon: 'star', updatedAt: 1 }]);
    fakeNow = 2_000_000;
    const result = touchTemplateIndex('t1', 'New');
    expect(result).toEqual([{ id: 't1', title: 'New', icon: 'star', updatedAt: 2_000_000 }]);
  });

  it('loadActiveTemplatesIndex excludes trashed entries', () => {
    saveTemplatesIndex([
      { id: 't1', title: 'Active' },
      { id: 't2', title: 'Trashed', trashedAt: 500 }
    ]);
    expect(loadActiveTemplatesIndex()).toEqual([{ id: 't1', title: 'Active' }]);
  });

  it('loadTrashedTemplatesIndex includes only trashed entries, most-recent first', () => {
    saveTemplatesIndex([
      { id: 't1', title: 'Active' },
      { id: 't2', title: 'Older trash', trashedAt: 100 },
      { id: 't3', title: 'Newer trash', trashedAt: 500 }
    ]);
    expect(loadTrashedTemplatesIndex().map((t) => t.id)).toEqual(['t3', 't2']);
  });

  it('moveTemplateToTrashCore stamps trashedAt on the matching entry', () => {
    saveTemplatesIndex([{ id: 't1', title: 'One' }]);
    fakeNow = 3_000_000;
    moveTemplateToTrashCore('t1');
    expect(loadTemplatesIndex()[0].trashedAt).toBe(3_000_000);
  });

  it('moveTemplateToTrashCore is a no-op for an unknown id', () => {
    saveTemplatesIndex([{ id: 't1' }]);
    scheduleBackupWriteCalls = 0;
    moveTemplateToTrashCore('does-not-exist');
    expect(scheduleBackupWriteCalls).toBe(0);
  });

  it('restoreTemplateFromTrashCore removes trashedAt and returns true', () => {
    saveTemplatesIndex([{ id: 't1', title: 'One', trashedAt: 500 }]);
    const result = restoreTemplateFromTrashCore('t1');
    expect(result).toBe(true);
    const entry = loadTemplatesIndex()[0];
    expect(entry.trashedAt).toBeUndefined();
    expect('trashedAt' in entry).toBe(false);
    expect(entry.title).toBe('One');
  });

  it('restoreTemplateFromTrashCore returns false and does not save for an unknown id', () => {
    saveTemplatesIndex([{ id: 't1' }]);
    scheduleBackupWriteCalls = 0;
    const result = restoreTemplateFromTrashCore('does-not-exist');
    expect(result).toBe(false);
    expect(scheduleBackupWriteCalls).toBe(0);
  });
});

describe('stampTemplateDateAuthorCore (pure)', () => {
  function node(text: string): TemplateStampableNode {
    return { text };
  }

  it('stamps a "Date:" line with the given date string', () => {
    const nodes = [node('Date:')];
    stampTemplateDateAuthorCore(nodes, 'August 21, 2026', '');
    expect(nodes[0].text).toBe('Date: August 21, 2026');
  });

  it('stamps an "Author:" line only when an author name is provided', () => {
    const withAuthor = [node('Author:')];
    stampTemplateDateAuthorCore(withAuthor, 'August 21, 2026', 'Ajay');
    expect(withAuthor[0].text).toBe('Author: Ajay');

    const withoutAuthor = [node('Author:')];
    stampTemplateDateAuthorCore(withoutAuthor, 'August 21, 2026', '');
    expect(withoutAuthor[0].text).toBe('Author:');
  });

  it('stamps a "Date · Author" line with both when an author is provided', () => {
    const nodes = [node('Date · Author')];
    stampTemplateDateAuthorCore(nodes, 'August 21, 2026', 'Ajay');
    expect(nodes[0].text).toBe('August 21, 2026 · Ajay');
  });

  it('stamps a "Date · Author" line with only the date when no author is provided', () => {
    const nodes = [node('Date · Author')];
    stampTemplateDateAuthorCore(nodes, 'August 21, 2026', '');
    expect(nodes[0].text).toBe('August 21, 2026');
  });

  it('never touches a line that already has real content, even if it starts with a placeholder word', () => {
    const nodes = [node('Date: already filled in'), node('Author: someone'), node('Date')];
    stampTemplateDateAuthorCore(nodes, 'August 21, 2026', 'Ajay');
    expect(nodes[0].text).toBe('Date: already filled in');
    expect(nodes[1].text).toBe('Author: someone');
    expect(nodes[2].text).toBe('Date');
  });

  it('trims whitespace before matching, but leaves the original text untrimmed if no match', () => {
    const nodes = [node('  Date:  ')];
    stampTemplateDateAuthorCore(nodes, 'August 21, 2026', '');
    expect(nodes[0].text).toBe('Date: August 21, 2026');
  });

  it('is generic/template-agnostic: works for any node with these exact lines, not a hardcoded template', () => {
    const nodes = [node('Some Header'), node('Date:'), node('Some Other Section'), node('Author:')];
    stampTemplateDateAuthorCore(nodes, '2026-08-21', 'Robin');
    expect(nodes[0].text).toBe('Some Header');
    expect(nodes[1].text).toBe('Date: 2026-08-21');
    expect(nodes[2].text).toBe('Some Other Section');
    expect(nodes[3].text).toBe('Author: Robin');
  });

  it('mutates the array elements in place — same object references, no new array returned', () => {
    const nodes = [node('Date:')];
    const originalRef = nodes[0];
    const result = stampTemplateDateAuthorCore(nodes, 'x', '');
    expect(result).toBeUndefined();
    expect(nodes[0]).toBe(originalRef);
  });

  it('handles an empty node list without throwing', () => {
    expect(() => stampTemplateDateAuthorCore([], 'x', '')).not.toThrow();
  });

  it('handles nodes with missing/undefined text without throwing', () => {
    const nodes = [{ text: undefined as unknown as string }];
    expect(() => stampTemplateDateAuthorCore(nodes, 'x', '')).not.toThrow();
  });
});
