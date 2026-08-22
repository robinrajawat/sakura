import { useEffect, useRef, useState, type DragEvent, type KeyboardEvent } from 'react';
import { useOutlineStore } from '../store/outlineStore';
import type { DropMode } from '../core/nodeMutations';
import { NodeText } from './NodeText';

/**
 * Phase 0's validation spike, now carrying Phase 2's first slice (docs/framework-migration-plan.md)
 * — real node create/edit/delete and fold/collapse, still wired to the real ported core logic,
 * still deliberately scoped down from the full README "Core Editing" feature set. Explicitly
 * NOT in this slice (see the plan doc for the full list): multi-select, Shift+Enter split,
 * sort children, semantic markup ([Section]/(note)/!alert/`code`), checkboxes, 'child'-mode
 * drag target (drop-to-nest). Each is a real, separately-scoped follow-up slice, not an
 * oversight here.
 */
export function OutlineTree() {
  const nodes = useOutlineStore((s) => s.nodes);
  const selectedId = useOutlineStore((s) => s.selectedId);
  const editingId = useOutlineStore((s) => s.editingId);
  const collapsedIds = useOutlineStore((s) => s.collapsedIds);
  const selectNode = useOutlineStore((s) => s.selectNode);
  const indentSelected = useOutlineStore((s) => s.indentSelected);
  const outdentSelected = useOutlineStore((s) => s.outdentSelected);
  const moveNode = useOutlineStore((s) => s.moveNode);
  const visibleIndexes = useOutlineStore((s) => s.visibleIndexes);
  const nodeHasChildrenFn = useOutlineStore((s) => s.nodeHasChildren);
  const startEditing = useOutlineStore((s) => s.startEditing);
  const commitEdit = useOutlineStore((s) => s.commitEdit);
  const cancelEdit = useOutlineStore((s) => s.cancelEdit);
  const newSiblingBelow = useOutlineStore((s) => s.newSiblingBelow);
  const newChild = useOutlineStore((s) => s.newChild);
  const deleteNode = useOutlineStore((s) => s.deleteNode);
  const toggleCollapse = useOutlineStore((s) => s.toggleCollapse);

  const [draggedId, setDraggedId] = useState<number | null>(null);
  const [dropTarget, setDropTarget] = useState<{ id: number; mode: DropMode } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingId !== null) inputRef.current?.focus();
  }, [editingId]);

  function handleTreeKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (editingId !== null || selectedId === null) return;
    if (e.key === 'Tab') {
      e.preventDefault();
      if (e.shiftKey) {
        outdentSelected();
      } else {
        indentSelected();
      }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (e.metaKey || e.ctrlKey) {
        newChild(selectedId);
      } else {
        newSiblingBelow(selectedId);
      }
    } else if (e.key === 'Backspace') {
      const node = nodes.find((n) => n.id === selectedId);
      if (node && !node.text) {
        e.preventDefault();
        deleteNode(selectedId);
      }
    }
  }

  function handleInputKeyDown(e: KeyboardEvent<HTMLInputElement>, id: number) {
    if (e.key === 'Enter') {
      e.preventDefault();
      commitEdit(id, e.currentTarget.value);
      if (e.metaKey || e.ctrlKey) {
        newChild(id);
      } else {
        newSiblingBelow(id);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cancelEdit();
    } else if (e.key === 'Backspace' && e.currentTarget.value === '') {
      e.preventDefault();
      deleteNode(id);
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
    const fraction = (e.clientY - rect.top) / rect.height;
    // Top third = above, middle third = nest as child, bottom third = below — matches the
    // ported moveNodeBlockCore's own 'above'/'child'/'below' modes exactly (see that
    // function's own header: 'child' inserts right after the target as its first child,
    // depth+1). No separate UI affordance needed beyond a wider middle drop zone.
    const mode: DropMode = fraction < 0.33 ? 'above' : fraction > 0.67 ? 'below' : 'child';
    setDropTarget({ id, mode });
  }

  function handleDrop(e: DragEvent<HTMLDivElement>, targetId: number) {
    e.preventDefault();
    if (draggedId !== null && dropTarget && dropTarget.id === targetId) {
      moveNode(draggedId, targetId, dropTarget.mode);
    }
    setDraggedId(null);
    setDropTarget(null);
  }

  const visible = visibleIndexes();

  return (
    <div
      role="tree"
      tabIndex={0}
      onKeyDown={handleTreeKeyDown}
      style={{
        fontFamily: 'sans-serif',
        border: '1px solid #ddd',
        borderRadius: 8,
        padding: '0.5rem',
        outline: 'none'
      }}
    >
      {visible.map((idx) => {
        const node = nodes[idx];
        const isSelected = node.id === selectedId;
        const isEditing = node.id === editingId;
        const isDragging = node.id === draggedId;
        const showDropAbove = dropTarget?.id === node.id && dropTarget.mode === 'above';
        const showDropBelow = dropTarget?.id === node.id && dropTarget.mode === 'below';
        const showDropChild = dropTarget?.id === node.id && dropTarget.mode === 'child';
        const hasChildren = nodeHasChildrenFn(node.id);
        const isCollapsed = collapsedIds.has(node.id);

        return (
          <div
            key={node.id}
            draggable={!isEditing}
            onDragStart={() => handleDragStart(node.id)}
            onDragOver={(e) => handleDragOver(e, node.id)}
            onDrop={(e) => handleDrop(e, node.id)}
            onDragEnd={() => {
              setDraggedId(null);
              setDropTarget(null);
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              paddingLeft: `${node.depth * 24 + 8}px`,
              paddingTop: 4,
              paddingBottom: 4,
              cursor: isEditing ? 'text' : 'grab',
              opacity: isDragging ? 0.4 : 1,
              backgroundColor: showDropChild ? 'rgba(66, 133, 244, 0.12)' : isSelected ? '#e8f0fe' : 'transparent',
              boxShadow: showDropChild ? 'inset 0 0 0 1.5px #4285f4' : 'none',
              borderTop: showDropAbove ? '2px solid #4285f4' : '2px solid transparent',
              borderBottom: showDropBelow ? '2px solid #4285f4' : '2px solid transparent',
              borderRadius: 4
            }}
          >
            <span
              onClick={(e) => {
                e.stopPropagation();
                if (hasChildren) toggleCollapse(node.id);
              }}
              style={{
                width: 16,
                display: 'inline-block',
                textAlign: 'center',
                cursor: hasChildren ? 'pointer' : 'default',
                color: '#888',
                userSelect: 'none'
              }}
            >
              {hasChildren ? (isCollapsed ? '▸' : '▾') : ''}
            </span>
            {isEditing ? (
              <input
                ref={inputRef}
                defaultValue={node.text ?? ''}
                onKeyDown={(e) => handleInputKeyDown(e, node.id)}
                onBlur={(e) => commitEdit(node.id, e.currentTarget.value)}
                style={{
                  flex: 1,
                  font: 'inherit',
                  border: 'none',
                  outline: '1px solid #4285f4',
                  borderRadius: 3,
                  padding: '0 4px'
                }}
              />
            ) : (
              <span
                onClick={() => selectNode(node.id)}
                onDoubleClick={() => startEditing(node.id)}
                style={{ flex: 1 }}
              >
                {node.text ? <NodeText text={node.text} /> : <span style={{ color: '#bbb' }}>(empty)</span>}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
