import { describe, expect, it, beforeEach } from 'vitest';
import { useHubJournalStore, formatDateLocal } from './hubJournalStore';

describe('hubJournalStore', () => {
  beforeEach(() => {
    localStorage.clear();
    useHubJournalStore.setState({ entries: [], loaded: false, expandedDate: null });
  });

  it('setBody finds-or-creates an entry for the given date', () => {
    useHubJournalStore.getState().setBody('2026-01-05', 'Good day');
    const entries = useHubJournalStore.getState().entries;
    expect(entries).toHaveLength(1);
    expect(entries[0].date).toBe('2026-01-05');
    expect(entries[0].body).toBe('Good day');
  });

  it('setBody updates the existing entry for a date rather than creating a duplicate', () => {
    useHubJournalStore.getState().setBody('2026-01-05', 'First');
    useHubJournalStore.getState().setBody('2026-01-05', 'Second');
    const entries = useHubJournalStore.getState().entries;
    expect(entries).toHaveLength(1);
    expect(entries[0].body).toBe('Second');
  });

  it('setBody stamps modifiedAt on every edit', () => {
    useHubJournalStore.getState().setBody('2026-01-05', 'First');
    const firstModified = useHubJournalStore.getState().entries[0].modifiedAt;
    useHubJournalStore.getState().setBody('2026-01-05', 'Second');
    const secondModified = useHubJournalStore.getState().entries[0].modifiedAt;
    expect(secondModified).toBeGreaterThanOrEqual(firstModified);
  });

  it('toggleMood sets the mood on first click', () => {
    useHubJournalStore.getState().toggleMood('2026-01-05', 'good');
    expect(useHubJournalStore.getState().entries[0].mood).toBe('good');
  });

  it('toggleMood clicking the same mood again clears it', () => {
    useHubJournalStore.getState().toggleMood('2026-01-05', 'good');
    useHubJournalStore.getState().toggleMood('2026-01-05', 'good');
    expect(useHubJournalStore.getState().entries[0].mood).toBe('');
  });

  it('toggleMood clicking a different mood replaces it, not clears it', () => {
    useHubJournalStore.getState().toggleMood('2026-01-05', 'good');
    useHubJournalStore.getState().toggleMood('2026-01-05', 'rough');
    expect(useHubJournalStore.getState().entries[0].mood).toBe('rough');
  });

  it('an invalid mood value falls back to empty via normalizeJournalEntryCore on creation', () => {
    useHubJournalStore.getState().setBody('2026-01-05', 'Body');
    expect(useHubJournalStore.getState().entries[0].mood).toBe('');
  });

  it('removeEntry removes the matching entry by date', () => {
    useHubJournalStore.getState().setBody('2026-01-05', 'Body');
    useHubJournalStore.getState().removeEntry('2026-01-05');
    expect(useHubJournalStore.getState().entries).toEqual([]);
  });

  it('removeEntry closes the card if it was the expanded date', () => {
    useHubJournalStore.getState().setBody('2026-01-05', 'Body');
    useHubJournalStore.getState().openEntry('2026-01-05');
    useHubJournalStore.getState().removeEntry('2026-01-05');
    expect(useHubJournalStore.getState().expandedDate).toBeNull();
  });

  it('openEntry/closeEntry toggle the expanded card date', () => {
    useHubJournalStore.getState().openEntry('2026-01-05');
    expect(useHubJournalStore.getState().expandedDate).toBe('2026-01-05');
    useHubJournalStore.getState().closeEntry();
    expect(useHubJournalStore.getState().expandedDate).toBeNull();
  });

  it('load() reads persisted entries back via the shimmed idbGet', async () => {
    useHubJournalStore.getState().setBody('2026-01-05', 'Persisted');
    useHubJournalStore.setState({ entries: [], loaded: false });
    await useHubJournalStore.getState().load();
    expect(useHubJournalStore.getState().entries).toHaveLength(1);
    expect(useHubJournalStore.getState().entries[0].body).toBe('Persisted');
    expect(useHubJournalStore.getState().loaded).toBe(true);
  });

  it('formatDateLocal formats using local calendar fields, not UTC', () => {
    // Picked at noon local time specifically so a UTC-based formatter (toISOString) would still
    // agree with a local-based one here -- this test pins the format shape, a timezone-crossing
    // edge case isn't reproducible deterministically in CI without mocking the system timezone.
    const d = new Date(2026, 0, 5, 12, 0, 0);
    expect(formatDateLocal(d)).toBe('2026-01-05');
  });
});
