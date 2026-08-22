import { describe, expect, it, beforeEach } from 'vitest';
import { useHubJournalStore } from './hubJournalStore';

describe('hubJournalStore', () => {
  beforeEach(() => {
    localStorage.clear();
    useHubJournalStore.setState({ entries: [], loaded: false });
  });

  it('addEntry appends a normalized entry', () => {
    useHubJournalStore.getState().addEntry('Good day', 'good', ['work']);
    const entries = useHubJournalStore.getState().entries;
    expect(entries).toHaveLength(1);
    expect(entries[0].body).toBe('Good day');
    expect(entries[0].mood).toBe('good');
    expect(entries[0].tags).toEqual(['work']);
  });

  it('addEntry falls back to an empty mood for an invalid mood value', () => {
    useHubJournalStore.getState().addEntry('Body', 'not-a-real-mood', []);
    expect(useHubJournalStore.getState().entries[0].mood).toBe('');
  });

  it('removeEntry removes the matching entry', () => {
    useHubJournalStore.getState().addEntry('Body', 'okay', []);
    const id = useHubJournalStore.getState().entries[0].id;
    useHubJournalStore.getState().removeEntry(id);
    expect(useHubJournalStore.getState().entries).toEqual([]);
  });

  it('load() reads persisted entries back via the shimmed idbGet', async () => {
    useHubJournalStore.getState().addEntry('Persisted', 'great', []);
    useHubJournalStore.setState({ entries: [], loaded: false });
    await useHubJournalStore.getState().load();
    expect(useHubJournalStore.getState().entries).toHaveLength(1);
    expect(useHubJournalStore.getState().entries[0].body).toBe('Persisted');
    expect(useHubJournalStore.getState().loaded).toBe(true);
  });
});
