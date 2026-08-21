import { useState, type DragEvent, type KeyboardEvent } from 'react';
import { useOutlineStore } from '../store/outlineStore';
import type { DropMode } from '../core/nodeMutations';

/**
 * Phase 0 validation spike (docs/framework-migration-plan.md). Renders the outline tree
 * seeded in outlineStore.ts, wired to the real ported nodeMutations/nodeQueries/nodeSelection
 * logic — not a mockup or a hardcoded static list. Purpose: surface any real friction in the
 * React+Zustand+tree-editing combination early, before Phase 2 commits to building the whole
 * real editor on top of this pattern.
 *
 * Scoped down deliberately (see outlineStore.ts's own header for the full list) — no
 * multi-select, no undo, no fold/collapse, no 'child'-mode drag target (drop-to-nest). Native
 * HTML5 drag-and-drop is used rather than a library (@dnd-kit etc.) specifically because this
 * spike's job is validating the *core logic wiring*, not settling on final drag tooling —
 * that choice belongs to Phase 2, informed by whatever this spike surfaces.
 */
export function OutlineTree() {
  const nodes = useOutlineStore((s) => s.nodes);
  const selectedId = useOutlineStore((s) => s.selectedId);
  const selectNode = useOutlineStore((s) => s.selectNode);
  const indentSelected = useOutlineStore((s) => s.indentSelected);
  const outdentSelected = useOutlineStore((s) => s.outdentSelected);
  const moveNode = useOutlineStore((s) => s.moveNode);

  const [draggedId, setDraggedId] = useState<number | null>(null);
  const [dropTarget, setDropTarget] = useState<{ id: number; mode: DropMode } | null>(null);

  function handleKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Tab') {
      e.preventDefault();
      if (e.shiftKey) {
        outdentSelected();
      } else {
        indentSelected();
      }
    }
  }

  function handleDragStart(id: number) {
    setDraggedId(id);
  }

  function handleDragOver(e: DragEvent<HTMLDivElement>, id: number) {
    e.preventDefault();
    if (draggedId === null || draggedId === id) {
      setDropTarget(null);
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    const isTopHalf = e.clientY - rect.top < rect.height / 2;
    setDropTarget({ id, mode: isTopHalf ? 'above' : 'below' });
  }

  function handleDrop(e: DragEvent<HTMLDivElement>, targetId: number) {
    e.preventDefault();
    if (draggedId !== null && dropTarget && dropTarget.id === targetId) {
      moveNode(draggedId, targetId, dropTarget.mode);
    }
    setDraggedId(null);
    setDropTarget(null);
  }

  return (
    <div
      role="tree"
      tabIndex={0}
      onKeyDown={handleKeyDown}
      style={{
        fontFamily: 'sans-serif',
        border: '1px solid #ddd',
        borderRadius: 8,
        padding: '0.5rem',
        outline: 'none'
      }}
    >
      {nodes.map((node) => {
        const isSelected = node.id === selectedId;
        const isDragging = node.id === draggedId;
        const showDropAbove = dropTarget?.id === node.id && dropTarget.mode === 'above';
        const showDropBelow = dropTarget?.id === node.id && dropTarget.mode === 'below';

        return (
          <div
            key={node.id}
            draggable
            onDragStart={() => handleDragStart(node.id)}
            onDragOver={(e) => handleDragOver(e, node.id)}
            onDrop={(e) => handleDrop(e, node.id)}
            onDragEnd={() => {
              setDraggedId(null);
              setDropTarget(null);
            }}
            onClick={() => selectNode(node.id)}
            style={{
              paddingLeft: `${node.depth * 24 + 8}px`,
              paddingTop: 4,
              paddingBottom: 4,
              cursor: 'grab',
              opacity: isDragging ? 0.4 : 1,
              backgroundColor: isSelected ? '#e8f0fe' : 'transparent',
              borderTop: showDropAbove ? '2px solid #4285f4' : '2px solid transparent',
              borderBottom: showDropBelow ? '2px solid #4285f4' : '2px solid transparent',
              borderRadius: 4
            }}
          >
            {node.text}
          </div>
        );
      })}
    </div>
  );
}
