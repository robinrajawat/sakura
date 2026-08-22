import { useEffect, useRef, useState, type CSSProperties, type DragEvent, type KeyboardEvent } from 'react';
import { useOutlineStore } from '../store/outlineStore';
import type { DropMode } from '../core/nodeMutations';
import { CODE_LANGS } from '../store/outlineStore';
import { NodeText } from './NodeText';

const sortButtonStyle: CSSProperties = {
  fontFamily: 'inherit',
  fontSize: 12,
  padding: '2px 8px',
  border: '1px solid #ddd',
  borderRadius: 4,
  background: '#fff',
  cursor: 'pointer'
};

/**
 * Phase 2 complete (docs/framework-migration-plan.md); Phase 3 in progress: Note (plain text,
 * no rich HTML/sanitization) and Code block (lang + code, no syntax highlighting) per node —
 * each a click-to-edit inline textarea toggle via setNote/setCodeBlock. Both deliberately
 * scoped down from legacy's full feature set (noteTitle, rich HTML, highlighting) — each a
 * real, separately-scoped follow-up.
 */
export function OutlineTree() {
  const nodes = useOutlineStore((s) => s.nodes);
  const selectedId = useOutlineStore((s) => s.selectedId);
  const editingId = useOutlineStore((s) => s.editingId);
  const collapsedIds = useOutlineStore((s) => s.collapsedIds);
  const multiSelectedIds = useOutlineStore((s) => s.multiSelectedIds);
  const clickNode = useOutlineStore((s) => s.clickNode);
  const selectionRootIndexes = useOutlineStore((s) => s.selectionRootIndexes);
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
  const splitAtCursor = useOutlineStore((s) => s.splitAtCursor);
  const deleteNode = useOutlineStore((s) => s.deleteNode);
  const deleteSelected = useOutlineStore((s) => s.deleteSelected);
  const toggleCollapse = useOutlineStore((s) => s.toggleCollapse);
  const sortChildren = useOutlineStore((s) => s.sortChildren);
  const toggleCheckbox = useOutlineStore((s) => s.toggleCheckbox);
  const setNote = useOutlineStore((s) => s.setNote);
  const setCodeBlock = useOutlineStore((s) => s.setCodeBlock);
  const [editingNoteId, setEditingNoteId] = useState<number | null>(null);
  const [editingCodeId, setEditingCodeId] = useState<number | null>(null);

  const [draggedId, setDraggedId] = useState<number | null>(null);
  const [draggedIds, setDraggedIds] = useState<number[] | null>(null);
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
    } else if (e.key === 'Delete') {
      // The multi-select counterpart to Backspace-on-empty-text above: Delete removes every
      // root of the current selection (single or multi) regardless of its text content,
      // matching legacy's own Delete-key binding for deleteSelected().
      e.preventDefault();
      deleteSelected();
    }
  }

  function handleInputKeyDown(e: KeyboardEvent<HTMLInputElement>, id: number) {
    if (e.key === 'Enter' && e.shiftKey && !e.metaKey && !e.ctrlKey) {
      // Shift+Enter splits at the cursor -- checked before the plain-Enter branch below, since
      // Shift+Enter would otherwise fall into the "commit then create a sibling" path with the
      // caret position discarded. Ctrl/Cmd+Shift+Enter isn't a real gesture legacy binds either
      // (ctrl/meta+Enter alone means newChild), so it's excluded here rather than guessing at
      // an unbound combination's intent.
      e.preventDefault();
      splitAtCursor(id, e.currentTarget.value, e.currentTarget.selectionStart ?? e.currentTarget.value.length);
      return;
    }
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
    // If the dragged row is part of a live multi-selection, drag the whole selection as one
    // combined block — same isMultiDrag check as legacy's own row dragstart handler. Root
    // indexes only (not every descendant id), matching moveMultipleNodeBlocksCore's own
    // expectation that draggedIds identifies whole subtrees to move together.
    if (multiSelectedIds.length > 1 && multiSelectedIds.includes(id)) {
      const roots = selectionRootIndexes().map((idx) => nodes[idx].id);
      setDraggedIds(roots);
    } else {
      setDraggedIds(null);
    }
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
      moveNode(draggedId, targetId, dropTarget.mode, draggedIds ?? undefined);
    }
    setDraggedId(null);
    setDraggedIds(null);
    setDropTarget(null);
  }

  const visible = visibleIndexes();

  return (
    <div>
      {/* Sort top-level nodes — the toolbar-level entry point legacy exposes via its "Extras"
          menu (sort-root-az-btn/sort-root-za-btn/sort-root-depth-btn), always operating on
          root blocks (parentId null). The per-node "sort this node's children" context-menu
          entry point is deferred until web/ has a context menu at all. */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 6, fontFamily: 'sans-serif', fontSize: 12 }}>
        <span style={{ color: '#888', alignSelf: 'center' }}>Sort top-level:</span>
        <button type="button" onClick={() => sortChildren(null, 'az')} style={sortButtonStyle}>
          A → Z
        </button>
        <button type="button" onClick={() => sortChildren(null, 'za')} style={sortButtonStyle}>
          Z → A
        </button>
        <button type="button" onClick={() => sortChildren(null, 'depth')} style={sortButtonStyle}>
          By depth
        </button>
      </div>
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
        const isMultiSelected = multiSelectedIds.length > 1 && multiSelectedIds.includes(node.id);
        const isEditing = node.id === editingId;
        const isDragging = node.id === draggedId || (draggedIds !== null && draggedIds.includes(node.id));
        const showDropAbove = dropTarget?.id === node.id && dropTarget.mode === 'above';
        const showDropBelow = dropTarget?.id === node.id && dropTarget.mode === 'below';
        const showDropChild = dropTarget?.id === node.id && dropTarget.mode === 'child';
        const hasChildren = nodeHasChildrenFn(node.id);
        const isCollapsed = collapsedIds.has(node.id);

        return (
          <div key={node.id}>
          <div
            draggable={!isEditing}
            onDragStart={() => handleDragStart(node.id)}
            onDragOver={(e) => handleDragOver(e, node.id)}
            onDrop={(e) => handleDrop(e, node.id)}
            onDragEnd={() => {
              setDraggedId(null);
              setDraggedIds(null);
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
              backgroundColor: showDropChild
                ? 'rgba(66, 133, 244, 0.12)'
                : isSelected
                  ? '#e8f0fe'
                  : isMultiSelected
                    ? '#eef3fd'
                    : 'transparent',
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
            {node.isCheckbox && (
              <input
                type="checkbox"
                checked={node.checked}
                onChange={() => toggleCheckbox(node.id)}
                onClick={(e) => e.stopPropagation()}
                style={{ marginRight: 6, cursor: 'pointer' }}
              />
            )}
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
                onClick={(e) => clickNode(node.id, { shiftKey: e.shiftKey, ctrlKey: e.ctrlKey || e.metaKey })}
                onDoubleClick={() => startEditing(node.id)}
                style={{ flex: 1, textDecoration: node.isCheckbox && node.checked ? 'line-through' : 'none' }}
              >
                {node.text ? <NodeText text={node.text} /> : <span style={{ color: '#bbb' }}>(empty)</span>}
              </span>
            )}
            <span
              onClick={(e) => {
                e.stopPropagation();
                setEditingNoteId(editingNoteId === node.id ? null : node.id);
              }}
              title={node.note ? 'Edit note' : 'Add note'}
              style={{ fontSize: 11, color: '#aaa', cursor: 'pointer', padding: '0 6px', userSelect: 'none' }}
            >
              {node.note ? '📝' : '+note'}
            </span>
            <span
              onClick={(e) => {
                e.stopPropagation();
                setEditingCodeId(editingCodeId === node.id ? null : node.id);
              }}
              title={node.codeBlock ? 'Edit code block' : 'Add code block'}
              style={{ fontSize: 11, color: '#aaa', cursor: 'pointer', padding: '0 6px', userSelect: 'none' }}
            >
              {node.codeBlock ? '💻' : '+code'}
            </span>
          </div>
          {editingNoteId === node.id && (
            <div style={{ paddingLeft: `${node.depth * 24 + 32}px`, paddingBottom: 4 }}>
              <textarea
                defaultValue={node.note}
                autoFocus
                rows={2}
                onBlur={(e) => setNote(node.id, e.currentTarget.value)}
                style={{ width: '90%', font: 'inherit', fontSize: 13, border: '1px solid #ddd', borderRadius: 4 }}
              />
            </div>
          )}
          {editingNoteId !== node.id && node.note && (
            <div
              onClick={() => setEditingNoteId(node.id)}
              style={{
                paddingLeft: `${node.depth * 24 + 32}px`,
                paddingBottom: 4,
                fontSize: 13,
                color: '#666',
                cursor: 'text',
                whiteSpace: 'pre-wrap'
              }}
            >
              {node.note}
            </div>
          )}
          {editingCodeId === node.id && (
            <div style={{ paddingLeft: `${node.depth * 24 + 32}px`, paddingBottom: 4 }}>
              <select
                defaultValue={node.codeBlock?.lang ?? 'plain'}
                onChange={(e) =>
                  setCodeBlock(node.id, { lang: e.currentTarget.value, code: node.codeBlock?.code ?? '' })
                }
                style={{ fontSize: 12, marginBottom: 4 }}
              >
                {CODE_LANGS.map((lang) => (
                  <option key={lang} value={lang}>
                    {lang}
                  </option>
                ))}
              </select>
              <textarea
                defaultValue={node.codeBlock?.code ?? ''}
                rows={4}
                onBlur={(e) =>
                  setCodeBlock(node.id, { lang: node.codeBlock?.lang ?? 'plain', code: e.currentTarget.value })
                }
                style={{
                  display: 'block',
                  width: '90%',
                  fontFamily: 'monospace',
                  fontSize: 13,
                  border: '1px solid #ddd',
                  borderRadius: 4
                }}
              />
            </div>
          )}
          {editingCodeId !== node.id && node.codeBlock && (
            <pre
              onClick={() => setEditingCodeId(node.id)}
              style={{
                marginLeft: `${node.depth * 24 + 32}px`,
                marginTop: 0,
                marginBottom: 4,
                padding: 6,
                background: '#f6f6f6',
                borderRadius: 4,
                fontSize: 13,
                cursor: 'text',
                maxWidth: '85%',
                overflowX: 'auto'
              }}
            >
              {node.codeBlock.code}
            </pre>
          )}
          </div>
        );
      })}
      </div>
    </div>
  );
}
