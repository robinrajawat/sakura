import { create } from 'zustand';

/**
 * Phase 6.3 item 11 (docs/phase6-full-parity-plan.md), Mind Map -- the final sub-slice, closing
 * out §6.3. Scoped per that doc's own bar: "a full canvas editor (pan/zoom/drag/connect/edit
 * nodes), not a minimal list-based stand-in" -- matched here, but as a genuinely freeform graph
 * rather than a port of legacy's own tree-shaped model.
 *
 * Deliberately a SIMPLER data model than legacy's real one, not a partial port of it: legacy's
 * `MindNode` carries `parentId` (an implicit tree alongside the explicit `links[]`) plus
 * per-branch color, three auto-layout modes (horizontal/vertical/radial,
 * legacy/index.html:50858), and collapse/expand -- ~700 lines just for `renderMindMap`. This
 * store drops `parentId`/branch-color/layout-mode/collapse entirely: every node just has its own
 * `x`/`y`, and `links[]` is the ONLY connection mechanism (any node to any other, freeform) --
 * an honest, self-consistent freeform canvas rather than a half-ported tree-plus-graph hybrid.
 * Each is a real, separately-scoped follow-up if still wanted: auto-layout modes, branch
 * coloring, node-linking to outline nodes (`anchorNodeId`), the Scratchpad
 * (Presenter-mode-only, and this project's Presenter mode doesn't have Whiteboard/Audience View
 * either -- see `DiagramEditor.tsx`'s own header for the same deferral on the Diagrams side),
 * undo/redo, duplicate, and per-map JSON migration from a prior format (nothing to migrate from
 * yet since this is `web/`'s first Mind Map implementation).
 */

export interface MindNode {
  id: number;
  x: number;
  y: number;
  text: string;
}

export interface MindLink {
  id: number;
  a: number;
  b: number;
  label: string;
}

export interface MindMap {
  id: number;
  title: string;
  nodes: MindNode[];
  links: MindLink[];
  nextNodeId: number;
  nextLinkId: number;
  pan: { x: number; y: number };
  zoom: number;
  createdAt: number;
  modifiedAt: number;
}

interface MindMapState {
  maps: MindMap[];
  nextMapId: number;

  addMap: () => number;
  removeMap: (id: number) => void;
  renameMap: (id: number, title: string) => void;
  duplicateMap: (id: number) => void;

  addNode: (mapId: number, x: number, y: number) => number;
  updateNodeText: (mapId: number, nodeId: number, text: string) => void;
  updateNodePosition: (mapId: number, nodeId: number, x: number, y: number) => void;
  removeNode: (mapId: number, nodeId: number) => void;

  /** No-op (returns false) if `a===b` or a link between the same pair already exists in either
   * direction -- matches the ordinary expectation for a freeform graph (no duplicate/self edges)
   * even though legacy's own richer model doesn't need this guard (its links sit alongside a
   * separate parentId tree, not as the sole connection mechanism). */
  addLink: (mapId: number, a: number, b: number) => boolean;
  updateLinkLabel: (mapId: number, linkId: number, label: string) => void;
  removeLink: (mapId: number, linkId: number) => void;

  setPanZoom: (mapId: number, pan: { x: number; y: number }, zoom: number) => void;
}

function touchMap(map: MindMap, patch: Partial<MindMap>): MindMap {
  return { ...map, ...patch, modifiedAt: Date.now() };
}

export const useMindMapStore = create<MindMapState>((set, get) => ({
  maps: [],
  nextMapId: 1,

  addMap: () => {
    const { maps, nextMapId } = get();
    const ts = Date.now();
    const map: MindMap = {
      id: nextMapId,
      title: '',
      nodes: [],
      links: [],
      nextNodeId: 1,
      nextLinkId: 1,
      pan: { x: 0, y: 0 },
      zoom: 1,
      createdAt: ts,
      modifiedAt: ts
    };
    set({ maps: [...maps, map], nextMapId: nextMapId + 1 });
    return nextMapId;
  },
  removeMap: (id) => set({ maps: get().maps.filter((m) => m.id !== id) }),
  renameMap: (id, title) =>
    set({ maps: get().maps.map((m) => (m.id === id ? touchMap(m, { title }) : m)) }),
  duplicateMap: (id) => {
    const { maps, nextMapId } = get();
    const src = maps.find((m) => m.id === id);
    if (!src) return;
    const ts = Date.now();
    const copy: MindMap = {
      ...src,
      id: nextMapId,
      title: src.title ? `${src.title} (copy)` : '',
      nodes: src.nodes.map((n) => ({ ...n })),
      links: src.links.map((l) => ({ ...l })),
      createdAt: ts,
      modifiedAt: ts
    };
    set({ maps: [...maps, copy], nextMapId: nextMapId + 1 });
  },

  addNode: (mapId, x, y) => {
    const map = get().maps.find((m) => m.id === mapId);
    if (!map) return -1;
    const id = map.nextNodeId;
    const node: MindNode = { id, x, y, text: '' };
    set({
      maps: get().maps.map((m) => (m.id === mapId ? touchMap(m, { nodes: [...m.nodes, node], nextNodeId: id + 1 }) : m))
    });
    return id;
  },
  updateNodeText: (mapId, nodeId, text) =>
    set({
      maps: get().maps.map((m) =>
        m.id === mapId ? touchMap(m, { nodes: m.nodes.map((n) => (n.id === nodeId ? { ...n, text } : n)) }) : m
      )
    }),
  updateNodePosition: (mapId, nodeId, x, y) =>
    set({
      maps: get().maps.map((m) =>
        m.id === mapId ? touchMap(m, { nodes: m.nodes.map((n) => (n.id === nodeId ? { ...n, x, y } : n)) }) : m
      )
    }),
  removeNode: (mapId, nodeId) =>
    set({
      maps: get().maps.map((m) =>
        m.id === mapId
          ? touchMap(m, {
              nodes: m.nodes.filter((n) => n.id !== nodeId),
              links: m.links.filter((l) => l.a !== nodeId && l.b !== nodeId)
            })
          : m
      )
    }),

  addLink: (mapId, a, b) => {
    if (a === b) return false;
    const map = get().maps.find((m) => m.id === mapId);
    if (!map) return false;
    const exists = map.links.some((l) => (l.a === a && l.b === b) || (l.a === b && l.b === a));
    if (exists) return false;
    const id = map.nextLinkId;
    const link: MindLink = { id, a, b, label: '' };
    set({
      maps: get().maps.map((m) => (m.id === mapId ? touchMap(m, { links: [...m.links, link], nextLinkId: id + 1 }) : m))
    });
    return true;
  },
  updateLinkLabel: (mapId, linkId, label) =>
    set({
      maps: get().maps.map((m) =>
        m.id === mapId ? touchMap(m, { links: m.links.map((l) => (l.id === linkId ? { ...l, label } : l)) }) : m
      )
    }),
  removeLink: (mapId, linkId) =>
    set({
      maps: get().maps.map((m) => (m.id === mapId ? touchMap(m, { links: m.links.filter((l) => l.id !== linkId) }) : m))
    }),

  setPanZoom: (mapId, pan, zoom) =>
    set({ maps: get().maps.map((m) => (m.id === mapId ? { ...m, pan, zoom } : m)) })
}));
