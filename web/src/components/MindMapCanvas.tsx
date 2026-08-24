import { useEffect, useRef, useState } from 'react';
import type { MindMap } from '../store/mindMapStore';
import { useMindMapStore } from '../store/mindMapStore';
import { THEME_TOKENS } from '../store/themeStore';

type Tokens = (typeof THEME_TOKENS)['light'];

const NODE_WIDTH = 140;
const NODE_HEIGHT = 44;
const MIN_ZOOM = 0.3;
const MAX_ZOOM = 2.5;

function clampZoom(z: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));
}

/**
 * Phase 6.3 item 11 (docs/phase6-full-parity-plan.md), Mind Map -- the final piece of §6.3.
 * A genuinely freeform canvas (pan/zoom/drag/connect/edit nodes), not a minimal list-based
 * stand-in -- see `store/mindMapStore.ts`'s own header for how the data model deliberately
 * simplifies legacy's real one (no parentId tree, no branch colors, no auto-layout modes; links
 * are the sole connection mechanism) rather than partially porting it.
 *
 * Interactions, all hand-rolled with plain mouse events (no canvas library in this project's
 * dependencies, same convention `OutlineTree.tsx`'s own native drag-and-drop already uses):
 * - Double-click empty canvas, or the "+ Node" button, adds a node and opens it for editing.
 * - Drag a node's body to reposition it; drag its small corner handle onto another node to link
 *   them (release over empty space cancels).
 * - Drag empty canvas to pan; the zoom buttons (or a trackpad/wheel pinch) zoom, cursor-centered
 *   so the point under the pointer stays put.
 * - Double-click a node (or Enter while selected) to edit its text; Escape cancels without
 *   saving, Enter/blur commits.
 * - Click a node or link to select it; Delete/Backspace removes the selection (a node removal
 *   also removes any links touching it, via `removeNode`).
 *
 * Deliberately NOT built (each a real, separately-scoped follow-up): undo/redo, multi-select,
 * node collapse/subtree hiding, per-node color, snapping/alignment guides, and the Scratchpad /
 * Presenter-mode / Audience-View integration legacy's own Mind Map has -- this project's
 * Presenter mode has none of that infrastructure yet either (see `DiagramEditor.tsx`'s header
 * for the same deferral on the Diagrams side).
 */
export function MindMapCanvas({ map, onClose, onRename, t }: { map: MindMap; onClose: () => void; onRename: (title: string) => void; t: Tokens }) {
  const addNode = useMindMapStore((s) => s.addNode);
  const updateNodeText = useMindMapStore((s) => s.updateNodeText);
  const updateNodePosition = useMindMapStore((s) => s.updateNodePosition);
  const removeNode = useMindMapStore((s) => s.removeNode);
  const addLink = useMindMapStore((s) => s.addLink);
  const updateLinkLabel = useMindMapStore((s) => s.updateLinkLabel);
  const removeLink = useMindMapStore((s) => s.removeLink);
  const setPanZoom = useMindMapStore((s) => s.setPanZoom);

  const canvasRef = useRef<HTMLDivElement>(null);
  const [title, setTitle] = useState(map.title);
  const [selected, setSelected] = useState<{ type: 'node' | 'link'; id: number } | null>(null);
  const [editingNodeId, setEditingNodeId] = useState<number | null>(null);
  const [editText, setEditText] = useState('');
  const [hoveredNodeId, setHoveredNodeIdState] = useState<number | null>(null);
  const hoveredNodeIdRef = useRef<number | null>(null);
  function setHoveredNodeId(id: number | null) {
    hoveredNodeIdRef.current = id;
    setHoveredNodeIdState(id);
  }
  const [linkDraft, setLinkDraft] = useState<{ fromId: number; x: number; y: number } | null>(null);

  function toWorld(clientX: number, clientY: number): { x: number; y: number } {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return { x: (clientX - rect.left - map.pan.x) / map.zoom, y: (clientY - rect.top - map.pan.y) / map.zoom };
  }

  function commitTitle() {
    if (title !== map.title) onRename(title);
  }

  function zoomBy(factor: number, centerClientX?: number, centerClientY?: number) {
    const rect = canvasRef.current?.getBoundingClientRect();
    const cx = centerClientX != null && rect ? centerClientX - rect.left : (rect?.width ?? 0) / 2;
    const cy = centerClientY != null && rect ? centerClientY - rect.top : (rect?.height ?? 0) / 2;
    const newZoom = clampZoom(map.zoom * factor);
    const worldX = (cx - map.pan.x) / map.zoom;
    const worldY = (cy - map.pan.y) / map.zoom;
    setPanZoom(map.id, { x: cx - worldX * newZoom, y: cy - worldY * newZoom }, newZoom);
  }

  function resetView() {
    setPanZoom(map.id, { x: 0, y: 0 }, 1);
  }

  function handleWheel(e: React.WheelEvent) {
    e.preventDefault();
    zoomBy(e.deltaY < 0 ? 1.1 : 1 / 1.1, e.clientX, e.clientY);
  }

  function startEditing(nodeId: number, text: string) {
    setEditingNodeId(nodeId);
    setEditText(text);
    setSelected({ type: 'node', id: nodeId });
  }

  function commitEditing() {
    if (editingNodeId != null) updateNodeText(map.id, editingNodeId, editText);
    setEditingNodeId(null);
  }

  function cancelEditing() {
    setEditingNodeId(null);
  }

  function handleAddNodeAt(worldX: number, worldY: number) {
    const id = addNode(map.id, worldX - NODE_WIDTH / 2, worldY - NODE_HEIGHT / 2);
    startEditing(id, '');
  }

  function handleAddNodeCentered() {
    const rect = canvasRef.current?.getBoundingClientRect();
    const cx = (rect?.width ?? 400) / 2;
    const cy = (rect?.height ?? 300) / 2;
    const worldX = (cx - map.pan.x) / map.zoom;
    const worldY = (cy - map.pan.y) / map.zoom;
    handleAddNodeAt(worldX, worldY);
  }

  function handleCanvasDoubleClick(e: React.MouseEvent) {
    if ((e.target as HTMLElement).closest('[data-mindnode]')) return;
    const world = toWorld(e.clientX, e.clientY);
    handleAddNodeAt(world.x + NODE_WIDTH / 2, world.y + NODE_HEIGHT / 2);
  }

  function handleCanvasMouseDown(e: React.MouseEvent) {
    if ((e.target as HTMLElement).closest('[data-mindnode]')) return;
    setSelected(null);
    const startClientX = e.clientX;
    const startClientY = e.clientY;
    const startPan = map.pan;
    let moved = false;
    function onMove(ev: MouseEvent) {
      const dx = ev.clientX - startClientX;
      const dy = ev.clientY - startClientY;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) moved = true;
      if (moved) setPanZoom(map.id, { x: startPan.x + dx, y: startPan.y + dy }, map.zoom);
    }
    function onUp() {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }

  function handleNodeMouseDown(e: React.MouseEvent, nodeId: number) {
    e.stopPropagation();
    if (editingNodeId != null) return;
    setSelected({ type: 'node', id: nodeId });
    const node = map.nodes.find((n) => n.id === nodeId);
    if (!node) return;
    const startClientX = e.clientX;
    const startClientY = e.clientY;
    const origX = node.x;
    const origY = node.y;
    function onMove(ev: MouseEvent) {
      const dx = (ev.clientX - startClientX) / map.zoom;
      const dy = (ev.clientY - startClientY) / map.zoom;
      updateNodePosition(map.id, nodeId, origX + dx, origY + dy);
    }
    function onUp() {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }

  function handleHandleMouseDown(e: React.MouseEvent, nodeId: number) {
    e.stopPropagation();
    const world = toWorld(e.clientX, e.clientY);
    setLinkDraft({ fromId: nodeId, x: world.x, y: world.y });
    function onMove(ev: MouseEvent) {
      const w = toWorld(ev.clientX, ev.clientY);
      setLinkDraft((prev) => (prev ? { ...prev, x: w.x, y: w.y } : prev));
    }
    function onUp() {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      const target = hoveredNodeIdRef.current;
      if (target != null && target !== nodeId) addLink(map.id, nodeId, target);
      setLinkDraft(null);
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (editingNodeId != null) {
        if (e.key === 'Escape') cancelEditing();
        return;
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selected) {
        e.preventDefault();
        if (selected.type === 'node') removeNode(map.id, selected.id);
        else removeLink(map.id, selected.id);
        setSelected(null);
      } else if (e.key === 'Enter' && selected?.type === 'node') {
        const node = map.nodes.find((n) => n.id === selected.id);
        if (node) startEditing(node.id, node.text);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, editingNodeId, map.id, map.nodes]);

  const selectedLink = selected?.type === 'link' ? map.links.find((l) => l.id === selected.id) : null;
  const nodeById = new Map(map.nodes.map((n) => [n.id, n]));

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 200, background: t.background, display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderBottom: `1px solid ${t.border}`, flexShrink: 0 }}>
        <input
          value={title}
          onChange={(e) => setTitle(e.currentTarget.value)}
          onBlur={commitTitle}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur();
          }}
          placeholder="Untitled map"
          style={{ fontSize: 14, fontWeight: 600, flex: 1, minWidth: 0, border: 'none', background: 'transparent', color: t.text }}
        />
        <button type="button" onClick={handleAddNodeCentered} style={{ fontSize: 12 }}>
          + Node
        </button>
        <button type="button" onClick={() => zoomBy(1 / 1.2)} style={{ fontSize: 12 }} aria-label="Zoom out">
          −
        </button>
        <span style={{ fontSize: 12, color: t.mutedText, minWidth: 40, textAlign: 'center' }}>{Math.round(map.zoom * 100)}%</span>
        <button type="button" onClick={() => zoomBy(1.2)} style={{ fontSize: 12 }} aria-label="Zoom in">
          +
        </button>
        <button type="button" onClick={resetView} style={{ fontSize: 12 }}>
          Reset view
        </button>
        {selectedLink && (
          <input
            value={selectedLink.label}
            onChange={(e) => updateLinkLabel(map.id, selectedLink.id, e.currentTarget.value)}
            placeholder="Link label…"
            style={{ fontSize: 12, width: 120 }}
          />
        )}
        {selected && (
          <button
            type="button"
            onClick={() => {
              if (selected.type === 'node') removeNode(map.id, selected.id);
              else removeLink(map.id, selected.id);
              setSelected(null);
            }}
            style={{ fontSize: 12 }}
          >
            Delete
          </button>
        )}
        <button type="button" onClick={onClose} style={{ fontSize: 12 }}>
          Close
        </button>
      </div>
      <div
        ref={canvasRef}
        onWheel={handleWheel}
        onMouseDown={handleCanvasMouseDown}
        onDoubleClick={handleCanvasDoubleClick}
        style={{ flex: 1, minHeight: 0, position: 'relative', overflow: 'hidden', cursor: 'grab', background: t.background }}
      >
        {map.nodes.length === 0 && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: t.mutedText, fontSize: 13, fontStyle: 'italic', pointerEvents: 'none' }}>
            Double-click anywhere to add your first idea.
          </div>
        )}
        <svg
          style={{ position: 'absolute', left: 0, top: 0, width: '100%', height: '100%', pointerEvents: 'none', overflow: 'visible' }}
        >
          <g transform={`translate(${map.pan.x} ${map.pan.y}) scale(${map.zoom})`}>
            {map.links.map((link) => {
              const a = nodeById.get(link.a);
              const b = nodeById.get(link.b);
              if (!a || !b) return null;
              const ax = a.x + NODE_WIDTH / 2;
              const ay = a.y + NODE_HEIGHT / 2;
              const bx = b.x + NODE_WIDTH / 2;
              const by = b.y + NODE_HEIGHT / 2;
              const mx = (ax + bx) / 2;
              const my = (ay + by) / 2;
              const isSelected = selected?.type === 'link' && selected.id === link.id;
              return (
                <g key={link.id} style={{ pointerEvents: 'auto', cursor: 'pointer' }} onClick={(e) => { e.stopPropagation(); setSelected({ type: 'link', id: link.id }); }}>
                  <line x1={ax} y1={ay} x2={bx} y2={by} stroke={isSelected ? 'var(--accent)' : t.border} strokeWidth={isSelected ? 3 : 2} />
                  {link.label && (
                    <text x={mx} y={my - 6} fontSize={11} fill={t.mutedText} textAnchor="middle">
                      {link.label}
                    </text>
                  )}
                </g>
              );
            })}
            {linkDraft &&
              (() => {
                const from = nodeById.get(linkDraft.fromId);
                if (!from) return null;
                return (
                  <line
                    x1={from.x + NODE_WIDTH / 2}
                    y1={from.y + NODE_HEIGHT / 2}
                    x2={linkDraft.x}
                    y2={linkDraft.y}
                    stroke={'var(--accent)'}
                    strokeWidth={2}
                    strokeDasharray="4 4"
                  />
                );
              })()}
          </g>
        </svg>
        <div style={{ position: 'absolute', left: 0, top: 0, transform: `translate(${map.pan.x}px, ${map.pan.y}px) scale(${map.zoom})`, transformOrigin: '0 0' }}>
          {map.nodes.map((node) => {
            const isSelected = selected?.type === 'node' && selected.id === node.id;
            const isEditing = editingNodeId === node.id;
            return (
              <div
                key={node.id}
                data-mindnode={node.id}
                onMouseDown={(e) => handleNodeMouseDown(e, node.id)}
                onMouseEnter={() => setHoveredNodeId(node.id)}
                onMouseLeave={() => {
                  if (hoveredNodeIdRef.current === node.id) setHoveredNodeId(null);
                }}
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  startEditing(node.id, node.text);
                }}
                style={{
                  position: 'absolute',
                  left: node.x,
                  top: node.y,
                  width: NODE_WIDTH,
                  minHeight: NODE_HEIGHT,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '6px 10px',
                  boxSizing: 'border-box',
                  borderRadius: 8,
                  border: `${isSelected ? 2 : 1}px solid ${isSelected ? 'var(--accent)' : t.border}`,
                  background: hoveredNodeId === node.id && linkDraft ? t.hoverBg : t.background,
                  boxShadow: '0 1px 4px rgba(0,0,0,.08)',
                  cursor: 'grab',
                  fontSize: 13,
                  color: t.text,
                  textAlign: 'center',
                  userSelect: 'none'
                }}
              >
                {isEditing ? (
                  <input
                    autoFocus
                    value={editText}
                    onChange={(e) => setEditText(e.currentTarget.value)}
                    onMouseDown={(e) => e.stopPropagation()}
                    onBlur={commitEditing}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        e.stopPropagation();
                        commitEditing();
                      } else if (e.key === 'Escape') {
                        e.preventDefault();
                        e.stopPropagation();
                        cancelEditing();
                      }
                    }}
                    style={{ width: '100%', fontSize: 13, textAlign: 'center', border: 'none', background: 'transparent', color: t.text }}
                  />
                ) : (
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{node.text || 'Untitled idea'}</span>
                )}
                <div
                  data-mindnode-handle={node.id}
                  onMouseDown={(e) => handleHandleMouseDown(e, node.id)}
                  title="Drag to connect to another node"
                  style={{
                    position: 'absolute',
                    right: -6,
                    bottom: -6,
                    width: 12,
                    height: 12,
                    borderRadius: '50%',
                    background: 'var(--accent)',
                    border: `2px solid ${t.background}`,
                    cursor: 'crosshair'
                  }}
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
