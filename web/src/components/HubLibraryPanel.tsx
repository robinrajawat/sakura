import { useState } from 'react';
import { useHubLibraryStore } from '../store/hubLibraryStore';
import { useThemeStore, THEME_TOKENS } from '../store/themeStore';

/** Phase 4 slice (docs/framework-migration-plan.md): Hub Library panel. Create/delete only. */
export function HubLibraryPanel() {
  const items = useHubLibraryStore((s) => s.items);
  const addItem = useHubLibraryStore((s) => s.addItem);
  const removeItem = useHubLibraryStore((s) => s.removeItem);
  const theme = useThemeStore((s) => s.theme);
  const t = THEME_TOKENS[theme];
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [description, setDescription] = useState('');

  return (
    <div style={{ fontFamily: 'sans-serif', fontSize: 13 }}>
      {items.map((item) => (
        <div key={item.id} style={{ borderBottom: `1px solid ${t.border}`, padding: '4px 0' }}>
          <strong>{item.title}</strong>
          {item.url && (
            <>
              {' '}
              —{' '}
              <a href={item.url} target="_blank" rel="noreferrer">
                {item.url}
              </a>
            </>
          )}
          <div style={{ color: t.mutedText }}>{item.description}</div>
          <button type="button" onClick={() => removeItem(item.id)} style={{ fontSize: 11 }}>
            remove
          </button>
        </div>
      ))}
      <div style={{ display: 'flex', gap: 4, marginTop: 6 }}>
        <input
          placeholder="Title"
          value={title}
          onChange={(e) => setTitle(e.currentTarget.value)}
          style={{ fontSize: 12, flex: 1 }}
        />
        <input
          placeholder="URL"
          value={url}
          onChange={(e) => setUrl(e.currentTarget.value)}
          style={{ fontSize: 12, flex: 1 }}
        />
        <input
          placeholder="Description"
          value={description}
          onChange={(e) => setDescription(e.currentTarget.value)}
          style={{ fontSize: 12, flex: 1 }}
        />
        <button
          type="button"
          onClick={() => {
            if (!title.trim()) return;
            addItem(title, url, description);
            setTitle('');
            setUrl('');
            setDescription('');
          }}
        >
          Add
        </button>
      </div>
    </div>
  );
}
