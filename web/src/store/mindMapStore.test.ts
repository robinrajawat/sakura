import { describe, expect, it, beforeEach } from 'vitest';
import { useMindMapStore } from './mindMapStore';

describe('mindMapStore', () => {
  beforeEach(() => {
    useMindMapStore.setState({ maps: [], nextMapId: 1 });
  });

  it('addMap creates a blank map and returns its id', () => {
    const id = useMindMapStore.getState().addMap();
    expect(id).toBe(1);
    const map = useMindMapStore.getState().maps[0];
    expect(map).toMatchObject({ id: 1, title: '', nodes: [], links: [], nextNodeId: 1, nextLinkId: 1, zoom: 1 });
    expect(map.pan).toEqual({ x: 0, y: 0 });
  });

  it('renameMap updates the title and modifiedAt', () => {
    const id = useMindMapStore.getState().addMap();
    const before = useMindMapStore.getState().maps[0].modifiedAt;
    useMindMapStore.getState().renameMap(id, 'Q4 brainstorm');
    const map = useMindMapStore.getState().maps[0];
    expect(map.title).toBe('Q4 brainstorm');
    expect(map.modifiedAt).toBeGreaterThanOrEqual(before);
  });

  it('removeMap removes it by id', () => {
    const id = useMindMapStore.getState().addMap();
    useMindMapStore.getState().removeMap(id);
    expect(useMindMapStore.getState().maps).toEqual([]);
  });

  it('duplicateMap deep-copies nodes/links under a new id with " (copy)" title', () => {
    const id = useMindMapStore.getState().addMap();
    useMindMapStore.getState().renameMap(id, 'Original');
    const a = useMindMapStore.getState().addNode(id, 10, 20);
    const b = useMindMapStore.getState().addNode(id, 30, 40);
    useMindMapStore.getState().addLink(id, a, b);

    useMindMapStore.getState().duplicateMap(id);
    const maps = useMindMapStore.getState().maps;
    expect(maps).toHaveLength(2);
    const copy = maps[1];
    expect(copy.title).toBe('Original (copy)');
    expect(copy.nodes).toHaveLength(2);
    expect(copy.links).toHaveLength(1);
    // Deep copy, not shared references.
    useMindMapStore.getState().updateNodeText(id, a, 'changed original');
    expect(useMindMapStore.getState().maps[1].nodes[0].text).toBe('');
  });

  it('addNode/updateNodeText/updateNodePosition', () => {
    const mapId = useMindMapStore.getState().addMap();
    const nodeId = useMindMapStore.getState().addNode(mapId, 100, 200);
    expect(nodeId).toBe(1);
    let node = useMindMapStore.getState().maps[0].nodes[0];
    expect(node).toMatchObject({ id: 1, x: 100, y: 200, text: '' });

    useMindMapStore.getState().updateNodeText(mapId, nodeId, 'idea one');
    node = useMindMapStore.getState().maps[0].nodes[0];
    expect(node.text).toBe('idea one');

    useMindMapStore.getState().updateNodePosition(mapId, nodeId, 150, 250);
    node = useMindMapStore.getState().maps[0].nodes[0];
    expect(node.x).toBe(150);
    expect(node.y).toBe(250);
  });

  it('removeNode also removes any links touching it', () => {
    const mapId = useMindMapStore.getState().addMap();
    const a = useMindMapStore.getState().addNode(mapId, 0, 0);
    const b = useMindMapStore.getState().addNode(mapId, 10, 10);
    const c = useMindMapStore.getState().addNode(mapId, 20, 20);
    useMindMapStore.getState().addLink(mapId, a, b);
    useMindMapStore.getState().addLink(mapId, b, c);

    useMindMapStore.getState().removeNode(mapId, b);
    const map = useMindMapStore.getState().maps[0];
    expect(map.nodes.map((n) => n.id)).toEqual([a, c]);
    expect(map.links).toEqual([]);
  });

  it('addLink rejects a self-link and returns false', () => {
    const mapId = useMindMapStore.getState().addMap();
    const a = useMindMapStore.getState().addNode(mapId, 0, 0);
    const ok = useMindMapStore.getState().addLink(mapId, a, a);
    expect(ok).toBe(false);
    expect(useMindMapStore.getState().maps[0].links).toEqual([]);
  });

  it('addLink rejects a duplicate link in either direction', () => {
    const mapId = useMindMapStore.getState().addMap();
    const a = useMindMapStore.getState().addNode(mapId, 0, 0);
    const b = useMindMapStore.getState().addNode(mapId, 10, 10);
    expect(useMindMapStore.getState().addLink(mapId, a, b)).toBe(true);
    expect(useMindMapStore.getState().addLink(mapId, a, b)).toBe(false);
    expect(useMindMapStore.getState().addLink(mapId, b, a)).toBe(false);
    expect(useMindMapStore.getState().maps[0].links).toHaveLength(1);
  });

  it('updateLinkLabel / removeLink', () => {
    const mapId = useMindMapStore.getState().addMap();
    const a = useMindMapStore.getState().addNode(mapId, 0, 0);
    const b = useMindMapStore.getState().addNode(mapId, 10, 10);
    useMindMapStore.getState().addLink(mapId, a, b);
    const linkId = useMindMapStore.getState().maps[0].links[0].id;

    useMindMapStore.getState().updateLinkLabel(mapId, linkId, 'leads to');
    expect(useMindMapStore.getState().maps[0].links[0].label).toBe('leads to');

    useMindMapStore.getState().removeLink(mapId, linkId);
    expect(useMindMapStore.getState().maps[0].links).toEqual([]);
  });

  it('setPanZoom updates without touching modifiedAt-driving fields', () => {
    const mapId = useMindMapStore.getState().addMap();
    useMindMapStore.getState().setPanZoom(mapId, { x: 50, y: -20 }, 1.5);
    const map = useMindMapStore.getState().maps[0];
    expect(map.pan).toEqual({ x: 50, y: -20 });
    expect(map.zoom).toBe(1.5);
  });

  it('nextMapId increments across maps', () => {
    const first = useMindMapStore.getState().addMap();
    const second = useMindMapStore.getState().addMap();
    expect(first).toBe(1);
    expect(second).toBe(2);
  });

  it('per-map node/link ids restart at 1 for each new map', () => {
    const mapA = useMindMapStore.getState().addMap();
    useMindMapStore.getState().addNode(mapA, 0, 0);
    const mapB = useMindMapStore.getState().addMap();
    const nodeIdInB = useMindMapStore.getState().addNode(mapB, 0, 0);
    expect(nodeIdInB).toBe(1);
  });
});
