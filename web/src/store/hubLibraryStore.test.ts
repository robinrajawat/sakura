import { describe, expect, it, beforeEach } from 'vitest';
import { useHubLibraryStore } from './hubLibraryStore';

function reset() {
  useHubLibraryStore.setState({
    items: [],
    loaded: false,
    expandedId: null,
    searchQuery: '',
    tagFilter: null,
    favoritesOnly: false
  });
  localStorage.clear();
}

describe('hubLibraryStore', () => {
  beforeEach(reset);

  it('load() populates items from persisted storage exactly once', async () => {
    await useHubLibraryStore.getState().load();
    expect(useHubLibraryStore.getState().items).toEqual([]);
    expect(useHubLibraryStore.getState().loaded).toBe(true);
  });

  it('createItem appends a new blank item and opens it', () => {
    useHubLibraryStore.getState().createItem();
    const { items, expandedId } = useHubLibraryStore.getState();
    expect(items).toHaveLength(1);
    expect(items[0].title).toBe('');
    expect(expandedId).toBe(items[0].id);
  });

  it('deleteItem removes the matching item and closes it if it was expanded', () => {
    useHubLibraryStore.getState().createItem();
    const id = useHubLibraryStore.getState().items[0].id;
    useHubLibraryStore.getState().deleteItem(id);
    expect(useHubLibraryStore.getState().items).toEqual([]);
    expect(useHubLibraryStore.getState().expandedId).toBeNull();
  });

  it('updateField patches the matching item and bumps modifiedAt', () => {
    useHubLibraryStore.getState().createItem();
    const id = useHubLibraryStore.getState().items[0].id;
    const before = useHubLibraryStore.getState().items[0].modifiedAt;
    useHubLibraryStore.getState().updateField(id, { title: 'React docs', url: 'react.dev' });
    const updated = useHubLibraryStore.getState().items[0];
    expect(updated.title).toBe('React docs');
    expect(updated.url).toBe('react.dev');
    expect(updated.modifiedAt).toBeGreaterThanOrEqual(before);
  });

  it('toggleFavorite flips favorite on the matching item only', () => {
    useHubLibraryStore.getState().createItem();
    useHubLibraryStore.getState().createItem();
    const [first, second] = useHubLibraryStore.getState().items;
    useHubLibraryStore.getState().toggleFavorite(first.id);
    const items = useHubLibraryStore.getState().items;
    expect(items.find((i) => i.id === first.id)?.favorite).toBe(true);
    expect(items.find((i) => i.id === second.id)?.favorite).toBe(false);
  });

  it('addTag trims, strips a leading #, and does not add a duplicate', () => {
    useHubLibraryStore.getState().createItem();
    const id = useHubLibraryStore.getState().items[0].id;
    useHubLibraryStore.getState().addTag(id, '  #frontend  ');
    useHubLibraryStore.getState().addTag(id, 'frontend');
    expect(useHubLibraryStore.getState().items[0].tags).toEqual(['frontend']);
  });

  it('addTag is a no-op for an empty/whitespace-only tag', () => {
    useHubLibraryStore.getState().createItem();
    const id = useHubLibraryStore.getState().items[0].id;
    useHubLibraryStore.getState().addTag(id, '   ');
    expect(useHubLibraryStore.getState().items[0].tags).toEqual([]);
  });

  it('removeTag removes only the matching tag', () => {
    useHubLibraryStore.getState().createItem();
    const id = useHubLibraryStore.getState().items[0].id;
    useHubLibraryStore.getState().addTag(id, 'frontend');
    useHubLibraryStore.getState().addTag(id, 'reference');
    useHubLibraryStore.getState().removeTag(id, 'frontend');
    expect(useHubLibraryStore.getState().items[0].tags).toEqual(['reference']);
  });

  it('setTagFilter toggles: setting the already-active filter again clears it', () => {
    useHubLibraryStore.getState().setTagFilter('frontend');
    expect(useHubLibraryStore.getState().tagFilter).toBe('frontend');
    useHubLibraryStore.getState().setTagFilter('frontend');
    expect(useHubLibraryStore.getState().tagFilter).toBeNull();
  });

  it('setSearchQuery and setFavoritesOnly update their own fields', () => {
    useHubLibraryStore.getState().setSearchQuery('react');
    useHubLibraryStore.getState().setFavoritesOnly(true);
    expect(useHubLibraryStore.getState().searchQuery).toBe('react');
    expect(useHubLibraryStore.getState().favoritesOnly).toBe(true);
  });
});
