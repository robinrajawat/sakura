import { describe, expect, it, beforeEach } from 'vitest';
import { useInlineExpandStore } from './inlineExpandStore';

describe('inlineExpandStore', () => {
  beforeEach(() => {
    useInlineExpandStore.setState({ noteExpandIds: new Set(), remarkExpandIds: new Set(), qaExpandIds: new Set() });
  });

  it('toggleNoteExpand adds an id not yet present, and removes one already present', () => {
    useInlineExpandStore.getState().toggleNoteExpand(1);
    expect(useInlineExpandStore.getState().noteExpandIds.has(1)).toBe(true);
    useInlineExpandStore.getState().toggleNoteExpand(1);
    expect(useInlineExpandStore.getState().noteExpandIds.has(1)).toBe(false);
  });

  it('toggleRemarkExpand and toggleQaExpand track independent sets', () => {
    useInlineExpandStore.getState().toggleRemarkExpand(2);
    useInlineExpandStore.getState().toggleQaExpand(3);
    const state = useInlineExpandStore.getState();
    expect(state.remarkExpandIds.has(2)).toBe(true);
    expect(state.qaExpandIds.has(3)).toBe(true);
    expect(state.noteExpandIds.size).toBe(0);
    expect(state.remarkExpandIds.has(3)).toBe(false);
  });

  it('toggling one id does not affect another id in the same set', () => {
    useInlineExpandStore.getState().toggleNoteExpand(1);
    useInlineExpandStore.getState().toggleNoteExpand(2);
    const ids = useInlineExpandStore.getState().noteExpandIds;
    expect(ids.has(1)).toBe(true);
    expect(ids.has(2)).toBe(true);
  });
});
