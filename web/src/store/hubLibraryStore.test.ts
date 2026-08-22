import { describe, expect, it, beforeEach } from 'vitest';
import { useHubLibraryStore } from './hubLibraryStore';

describe('hubLibraryStore', () => {
  beforeEach(() => {
    useHubLibraryStore.setState({ items: [], nextId: 1 });
  });

  it('addItem appends a new library item', () => {
    useHubLibraryStore.getState().addItem('React docs', 'https://react.dev', 'Official reference');
    expect(useHubLibraryStore.getState().items).toEqual([
      { id: 1, title: 'React docs', url: 'https://react.dev', description: 'Official reference' }
    ]);
  });

  it('removeItem removes the matching item', () => {
    useHubLibraryStore.getState().addItem('a', 'b', 'c');
    useHubLibraryStore.getState().removeItem(1);
    expect(useHubLibraryStore.getState().items).toEqual([]);
  });
});
