import { useEffect, useRef, useState } from 'react';
import { useHubLibraryStore } from '../store/hubLibraryStore';
import { sortLibraryItemsCore, librarySearchMatchCore, libraryUrlHref } from '../state/hubLibrary';
import { useThemeStore, THEME_TOKENS } from '../store/themeStore';
import { sanitizeRichHtml } from '../utils/sanitizeRichHtml';
import { stripHtmlToText } from '../utils/stripHtmlToText';
import { formatRelativeTime } from '../utils/formatRelativeTime';

/**
 * §6.5 slice (docs/phase6-full-parity-plan.md): Hub Library panel, replacing the Phase 4
 * placeholder (freeform title/url/description CRUD) with legacy's real model -- persistence,
 * a rich-text body, tags, favorites, search, and a tag filter. See `hubLibrary.ts`'s own header
 * for the full scoping, including why AI rewrite/Version History/PDF export/Quick-Assist-
 * visibility/pasted-image handling stay out of scope for this slice.
 *
 * Rich text matches Journal's own narrower toolset exactly (bullet/numbered list toolbar
 * buttons plus Ctrl/Cmd+B/I keyboard-shortcut-only bold/italic, HubJournalPanel.tsx) rather than
 * NotePanel.tsx's fuller set -- legacy's own `#library-body-field` has the identical narrower
 * toolset (legacy/index.html:7974), not the Note panel's. Body content is imperative via a ref +
 * commit-on-blur, same reasoning as NotePanel.tsx's/HubJournalPanel.tsx's own editors
 * (`contentEditable` fights React state on every keystroke).
 *
 * Delete uses `window.confirm` rather than a new modal-confirm component, matching this
 * project's "simpler chrome first pass" convention (no shared confirm-dialog component exists
 * anywhere in web/ yet to reuse) -- same choice HubJournalPanel.tsx made.
 */
export function HubLibraryPanel() {
  const items = useHubLibraryStore((s) => s.items);
  const loaded = useHubLibraryStore((s) => s.loaded);
  const expandedId = useHubLibraryStore((s) => s.expandedId);
  const searchQuery = useHubLibraryStore((s) => s.searchQuery);
  const tagFilter = useHubLibraryStore((s) => s.tagFilter);
  const favoritesOnly = useHubLibraryStore((s) => s.favoritesOnly);
  const load = useHubLibraryStore((s) => s.load);
  const openItem = useHubLibraryStore((s) => s.openItem);
  const closeItem = useHubLibraryStore((s) => s.closeItem);
  const createItem = useHubLibraryStore((s) => s.createItem);
  const deleteItem = useHubLibraryStore((s) => s.deleteItem);
  const updateField = useHubLibraryStore((s) => s.updateField);
  const toggleFavorite = useHubLibraryStore((s) => s.toggleFavorite);
  const addTag = useHubLibraryStore((s) => s.addTag);
  const removeTag = useHubLibraryStore((s) => s.removeTag);
  const setSearchQuery = useHubLibraryStore((s) => s.setSearchQuery);
  const setTagFilter = useHubLibraryStore((s) => s.setTagFilter);
  const setFavoritesOnly = useHubLibraryStore((s) => s.setFavoritesOnly);
  const theme = useThemeStore((s) => s.theme);
  const t = THEME_TOKENS[theme];

  const [tagDraft, setTagDraft] = useState('');
  const bodyEditorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!loaded) load();
  }, [loaded, load]);

  const expandedItem = expandedId ? (items.find((i) => i.id === expandedId) ?? null) : null;

  // Imperatively (re)sync the contenteditable's content whenever the open item changes -- NOT
  // React-controlled, same reasoning as HubJournalPanel.tsx's own body editor.
  useEffect(() => {
    if (!expandedId || !bodyEditorRef.current) return;
    bodyEditorRef.current.innerHTML = sanitizeRichHtml(expandedItem?.body || '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expandedId]);

  const commitBody = () => {
    if (!expandedId || !bodyEditorRef.current) return;
    updateField(expandedId, { body: sanitizeRichHtml(bodyEditorRef.current.innerHTML) });
  };

  const visible = sortLibraryItemsCore(
    items.filter(
      (it) =>
        librarySearchMatchCore(it, stripHtmlToText(it.body), searchQuery) &&
        (!tagFilter || it.tags.includes(tagFilter)) &&
        (!favoritesOnly || it.favorite)
    )
  );

  if (expandedItem) {
    const href = libraryUrlHref(expandedItem.url);
    return (
      <div style={{ fontFamily: 'sans-serif', fontSize: 13 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <button
            type="button"
            onClick={closeItem}
            style={{ border: 'none', background: 'none', color: t.hintText, cursor: 'pointer', fontSize: 12 }}
          >
            ← Back
          </button>
          <button
            type="button"
            onClick={() => toggleFavorite(expandedItem.id)}
            style={{
              border: 'none',
              background: 'none',
              color: expandedItem.favorite ? '#e0a020' : t.hintText,
              cursor: 'pointer',
              fontSize: 14
            }}
            aria-pressed={expandedItem.favorite}
            title={expandedItem.favorite ? 'Remove from favorites' : 'Favorite this entry'}
          >
            {expandedItem.favorite ? '★' : '☆'}
          </button>
          <div style={{ flex: 1 }} />
          <button
            type="button"
            onClick={() => {
              if (window.confirm(`Delete "${expandedItem.title.trim() || 'this entry'}"? This can't be undone.`)) {
                deleteItem(expandedItem.id);
              }
            }}
            style={{ border: 'none', background: 'none', color: t.hintText, cursor: 'pointer', fontSize: 11 }}
          >
            Delete
          </button>
        </div>

        <input
          value={expandedItem.title}
          onChange={(e) => updateField(expandedItem.id, { title: e.currentTarget.value })}
          placeholder="Title"
          style={{
            width: '100%',
            fontSize: 14,
            fontWeight: 600,
            border: `1px solid ${t.border}`,
            borderRadius: 4,
            padding: '5px 8px',
            background: t.editBg,
            color: t.text,
            boxSizing: 'border-box',
            marginBottom: 6
          }}
        />

        <div style={{ display: 'flex', gap: 4, marginBottom: 6 }}>
          <input
            value={expandedItem.url}
            onChange={(e) => updateField(expandedItem.id, { url: e.currentTarget.value.trim() })}
            placeholder="Add a URL (optional)"
            style={{
              flex: 1,
              fontSize: 12,
              border: `1px solid ${t.border}`,
              borderRadius: 4,
              padding: '4px 8px',
              background: t.editBg,
              color: t.text,
              boxSizing: 'border-box'
            }}
          />
          {expandedItem.url && (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              style={{ fontSize: 11, color: t.text, alignSelf: 'center', textDecoration: 'none' }}
              title="Open link"
            >
              ↗
            </a>
          )}
        </div>
        {expandedItem.url && (
          <input
            value={expandedItem.urlLabel}
            onChange={(e) => updateField(expandedItem.id, { urlLabel: e.currentTarget.value })}
            placeholder="Label for this link (optional)"
            style={{
              width: '100%',
              fontSize: 11,
              border: `1px solid ${t.border}`,
              borderRadius: 4,
              padding: '4px 8px',
              background: t.editBg,
              color: t.text,
              boxSizing: 'border-box',
              marginBottom: 6
            }}
          />
        )}

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center', marginBottom: 6 }}>
          {expandedItem.tags.map((tag) => (
            <span
              key={tag}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 3,
                fontSize: 10,
                border: `1px solid ${t.border}`,
                borderRadius: 99,
                padding: '2px 6px',
                color: t.text
              }}
            >
              #{tag}
              <button
                type="button"
                onClick={() => removeTag(expandedItem.id, tag)}
                aria-label={`Remove tag ${tag}`}
                style={{ border: 'none', background: 'none', color: t.hintText, cursor: 'pointer', fontSize: 10, padding: 0 }}
              >
                ×
              </button>
            </span>
          ))}
          <input
            value={tagDraft}
            onChange={(e) => setTagDraft(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ',') {
                e.preventDefault();
                if (tagDraft.trim()) addTag(expandedItem.id, tagDraft);
                setTagDraft('');
              }
            }}
            placeholder="+ Add tag"
            style={{ fontSize: 11, border: 'none', background: 'none', color: t.text, outline: 'none', width: 90 }}
          />
        </div>

        <div style={{ display: 'flex', gap: 2, marginBottom: 6, borderBottom: `1px solid ${t.border}`, paddingBottom: 6 }}>
          <button
            type="button"
            title="Bullet list"
            onMouseDown={(e) => {
              e.preventDefault();
              bodyEditorRef.current?.focus();
              document.execCommand('insertUnorderedList');
            }}
            style={{
              border: `1px solid ${t.border}`,
              background: t.toolbarButtonBg,
              color: t.text,
              borderRadius: 4,
              minWidth: 24,
              height: 24,
              fontSize: 12,
              cursor: 'pointer'
            }}
          >
            •
          </button>
          <button
            type="button"
            title="Numbered list"
            onMouseDown={(e) => {
              e.preventDefault();
              bodyEditorRef.current?.focus();
              document.execCommand('insertOrderedList');
            }}
            style={{
              border: `1px solid ${t.border}`,
              background: t.toolbarButtonBg,
              color: t.text,
              borderRadius: 4,
              minWidth: 24,
              height: 24,
              fontSize: 12,
              cursor: 'pointer'
            }}
          >
            1.
          </button>
        </div>

        <div
          ref={bodyEditorRef}
          contentEditable
          suppressContentEditableWarning
          onBlur={commitBody}
          onKeyDown={(e) => {
            if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'b') {
              e.preventDefault();
              document.execCommand('bold');
            } else if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'i') {
              e.preventDefault();
              document.execCommand('italic');
            }
          }}
          style={{
            minHeight: 140,
            font: 'inherit',
            fontSize: 13,
            border: `1px solid ${t.border}`,
            borderRadius: 4,
            padding: 8,
            background: t.editBg,
            color: t.text,
            boxSizing: 'border-box'
          }}
        />
        {expandedItem.modifiedAt && (
          <div style={{ color: t.hintText, fontSize: 10, marginTop: 6 }}>
            Last updated {formatRelativeTime(expandedItem.modifiedAt)}
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={{ fontFamily: 'sans-serif', fontSize: 13 }}>
      <div style={{ display: 'flex', gap: 4, alignItems: 'center', marginBottom: 8 }}>
        <input
          placeholder="Find an entry..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.currentTarget.value)}
          style={{ fontSize: 12, flex: 1 }}
        />
        <button
          type="button"
          onClick={() => setFavoritesOnly(!favoritesOnly)}
          aria-pressed={favoritesOnly}
          title="Show favorites only"
          style={{
            border: 'none',
            background: 'none',
            color: favoritesOnly ? '#e0a020' : t.hintText,
            cursor: 'pointer',
            fontSize: 14
          }}
        >
          {favoritesOnly ? '★' : '☆'}
        </button>
        <button type="button" onClick={createItem} style={{ fontSize: 12 }}>
          + New
        </button>
      </div>

      {tagFilter && (
        <button
          type="button"
          onClick={() => setTagFilter(tagFilter)}
          style={{
            fontSize: 10,
            border: `1px solid ${t.border}`,
            borderRadius: 99,
            background: t.toolbarButtonBg,
            color: t.text,
            cursor: 'pointer',
            padding: '2px 8px',
            marginBottom: 8
          }}
        >
          #{tagFilter} ×
        </button>
      )}

      {visible.length === 0 && (
        <div style={{ color: t.hintText, fontSize: 12 }}>
          {items.length === 0 ? 'No library entries yet.' : 'No entries match your filters.'}
        </div>
      )}

      {visible.map((item) => (
        <div
          key={item.id}
          onClick={() => openItem(item.id)}
          style={{ borderBottom: `1px solid ${t.border}`, padding: '6px 2px', cursor: 'pointer' }}
          onMouseEnter={(e) => (e.currentTarget.style.background = t.hoverBg)}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <strong style={{ color: t.text, flex: 1 }}>{item.title || <span style={{ fontStyle: 'italic', color: t.hintText }}>Untitled</span>}</strong>
            {item.favorite && <span style={{ color: '#e0a020', fontSize: 11 }}>★</span>}
          </div>
          {item.url && (
            <a
              href={libraryUrlHref(item.url)}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              style={{ fontSize: 11, color: t.text }}
            >
              {item.urlLabel || item.url}
            </a>
          )}
          {stripHtmlToText(item.body) && (
            <div style={{ color: t.mutedText, fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {stripHtmlToText(item.body)}
            </div>
          )}
          {item.tags.length > 0 && (
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 2 }}>
              {item.tags.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setTagFilter(tag);
                  }}
                  style={{
                    fontSize: 10,
                    border: `1px solid ${t.border}`,
                    borderRadius: 99,
                    background: tagFilter === tag ? t.hoverBg : t.toolbarButtonBg,
                    color: t.text,
                    cursor: 'pointer',
                    padding: '1px 6px'
                  }}
                >
                  #{tag}
                </button>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
