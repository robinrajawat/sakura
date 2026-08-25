import { useState } from 'react';
import { useThemeStore, THEME_TOKENS } from '../store/themeStore';
import { useOutlinePrefsStore, type RowHighlightStyle } from '../store/outlinePrefsStore';
import { AiProviderSettings } from './AiProviderSettings';
import { SecureStorageSettings } from './SecureStorageSettings';
import { AutoRewriteSettings } from './AutoRewriteSettings';
import { AiFallbackSettings } from './AiFallbackSettings';
import { QuickInsertSettings } from './QuickInsertSettings';

/**
 * §6.7/§6.10 slice (docs/phase6-full-parity-plan.md): `web/`'s first real Settings surface.
 * Direct port of legacy's real `#settings-panel` dropdown-from-button UX (legacy/index.html:
 * 4606-4607) -- a panel anchored under a "Settings" toolbar button, toggled open/closed by the
 * same click. Deliberately minimal: legacy's own real panel has a multi-category rail
 * (Appearance/Presets & modes/Bars & menus/Panels/Hub/Editing/Data & backup, legacy/index.html:
 * 4622-4650) with dozens of settings; this panel is still a single flat page (no rail yet),
 * just with a second section now.
 *
 * The accent-color/node-text-color/System-auto-theme controls landed earlier this session live
 * in `App.tsx`'s header directly rather than here, since they were built before this panel
 * existed -- consolidating them into this panel (matching legacy's own real layout, where they
 * DO live inside `#settings-panel`) is a real, separately-scoped follow-up, not attempted in
 * this slice to avoid touching already-shipped, already-verified controls.
 *
 * §6.7 slice: added the real "Layout" section from legacy's own Settings panel
 * (legacy/index.html:5693-5698's own summary line, verified against the real code): compact
 * rows, text size, limit reading width, and row style -- see `outlinePrefsStore.ts`'s own header
 * for the two corrections this investigation made to the plan doc's original list ("row style"
 * IS real, just under a different name; "collapse depth" is NOT a real legacy feature at all)
 * and for why "Editor's Choice"/"Documentation Mode" presets are marked N/A rather than attempted.
 *
 * §6.9 slice 1: added the "AI" section (`AiProviderSettings.tsx`, a separate component rather
 * than inlined here given its own real state -- provider/model select, key entry/save/test -- to
 * keep this file from growing an ever-longer flat list of unrelated section markup). Provider/
 * model selection and API key storage+test only.
 *
 * §6.9 slice 2: added the "Secure Storage" section (`SecureStorageSettings.tsx`) -- the vault
 * setup/unlock/lock/disable UI `aiSettingsStore.ts`'s own header named as deferred from slice 1.
 *
 * §6.9 slice 4: added the "Auto-rewrite" section (`AutoRewriteSettings.tsx`) -- the enable
 * toggle, exclusion checkboxes, and threshold controls for `store/autoRewriteStore.ts`'s real
 * queue/flush engine.
 *
 * §6.9 slice 9: added the "AI Fallback" section (`AiFallbackSettings.tsx`) -- the provider
 * fallback chain's enable toggle and drag-to-reorder, per-row-enable list. Closes out §6.9's own
 * planned slice sequence (`docs/phase6-full-parity-plan.md`'s §6.9 section) alongside `aiCall.ts`'s
 * new `callAiByShapeWithFallback` and `state/aiUsage.ts`'s usage counters, which every capability
 * built in earlier slices now goes through automatically -- no further per-capability wiring
 * needed.
 *
 * §6.10 slice 1: added the "Quick Insert" section (`QuickInsertSettings.tsx`) -- the master enable
 * toggle, icon-only-row toggle, and 7 per-action checkboxes for `OutlineTree.tsx`'s Quick Insert
 * popup (a Phase 6.2 feature that existed with real mouse interaction but no settings at all, and
 * no real keyboard navigation, until this slice gave it both).
 *
 * §6.10 slice 2: added the real category rail -- direct port of legacy's own real
 * `#settings-rail`/`applySettingsCategory` (legacy/index.html:4622-4671, 16137-16142): a
 * left-hand list of category buttons, clicking one shows just that category's sections (CSS
 * `display` toggling, matching legacy's own real mechanism exactly -- every section stays
 * mounted, not conditionally rendered, so no component loses its own local state on a category
 * switch). Legacy's real rail has 12 categories (general/presets/toolbar/panels/hub/editing/
 * data/account/ai/features/shortcuts/about); this only builds the 4 that have any real content
 * in `web/` today (general/editing/ai/data) -- adding a 5th is just adding one `SettingsCategory`
 * union member, one rail button, and wrapping that slice's own new section in the matching
 * `display` check, no rework of what's already here. Deliberately NOT built: legacy's own
 * cross-category settings-text search box (`#settings-search`, legacy/index.html:4611-4618) --
 * a real, separately-scoped follow-up (its own text-match/highlight engine over every section),
 * not attempted alongside the rail itself.
 */
const ROW_STYLE_OPTIONS: { value: RowHighlightStyle; label: string }[] = [
  { value: 'original', label: 'Background tint' },
  { value: 'dot', label: 'Dot' },
  { value: 'bar', label: 'Bar' },
  { value: 'outline', label: 'Outline' }
];

/** Matches legacy's real `data-cat` values verbatim (legacy/index.html:4623-4670) -- only the
 * subset with real content in `web/` today. See this file's own header for how to add a 5th. */
type SettingsCategory = 'general' | 'editing' | 'ai' | 'data';

const SETTINGS_CATEGORIES: { id: SettingsCategory; label: string }[] = [
  { id: 'general', label: 'Appearance' },
  { id: 'editing', label: 'Editing' },
  { id: 'ai', label: 'AI' },
  { id: 'data', label: 'Data & Backup' }
];

export function SettingsPanel({ onClose }: { onClose: () => void }) {
  const theme = useThemeStore((s) => s.theme);
  const t = THEME_TOKENS[theme];
  const treeIndentWidth = useOutlinePrefsStore((s) => s.treeIndentWidth);
  const setTreeIndentWidth = useOutlinePrefsStore((s) => s.setTreeIndentWidth);
  const hideTreeLines = useOutlinePrefsStore((s) => s.hideTreeLines);
  const setHideTreeLines = useOutlinePrefsStore((s) => s.setHideTreeLines);
  const outlineNumbering = useOutlinePrefsStore((s) => s.outlineNumbering);
  const setOutlineNumbering = useOutlinePrefsStore((s) => s.setOutlineNumbering);
  const compactRows = useOutlinePrefsStore((s) => s.compactRows);
  const setCompactRows = useOutlinePrefsStore((s) => s.setCompactRows);
  const editorScale = useOutlinePrefsStore((s) => s.editorScale);
  const setEditorScale = useOutlinePrefsStore((s) => s.setEditorScale);
  const editorReadingWidthEnabled = useOutlinePrefsStore((s) => s.editorReadingWidthEnabled);
  const setEditorReadingWidthEnabled = useOutlinePrefsStore((s) => s.setEditorReadingWidthEnabled);
  const editorReadingWidth = useOutlinePrefsStore((s) => s.editorReadingWidth);
  const setEditorReadingWidth = useOutlinePrefsStore((s) => s.setEditorReadingWidth);
  const rowHighlightStyle = useOutlinePrefsStore((s) => s.rowHighlightStyle);
  const depthGuideLines = useOutlinePrefsStore((s) => s.depthGuideLines);
  const setDepthGuideLines = useOutlinePrefsStore((s) => s.setDepthGuideLines);
  const alwaysExpandInlineEnabled = useOutlinePrefsStore((s) => s.alwaysExpandInlineEnabled);
  const setAlwaysExpandInlineEnabled = useOutlinePrefsStore((s) => s.setAlwaysExpandInlineEnabled);
  const setRowHighlightStyle = useOutlinePrefsStore((s) => s.setRowHighlightStyle);
  const [activeCategory, setActiveCategory] = useState<SettingsCategory>('general');

  return (
    <div
      role="dialog"
      aria-label="Settings"
      style={{
        position: 'absolute',
        top: 'calc(100% + 8px)',
        right: 0,
        zIndex: 120,
        width: 460,
        maxWidth: '92vw',
        background: t.background,
        border: `1px solid ${t.border}`,
        borderRadius: 12,
        boxShadow: '0 14px 28px rgba(0,0,0,.12)',
        padding: '14px 16px',
        fontFamily: 'sans-serif',
        color: t.text
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <h3 style={{ fontSize: 13, margin: 0 }}>Settings</h3>
        <button type="button" onClick={onClose} aria-label="Close settings" title="Close" style={{ fontSize: 11 }}>
          ✕
        </button>
      </div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
        <div role="tablist" aria-label="Settings categories" style={{ display: 'flex', flexDirection: 'column', gap: 2, width: 96, flexShrink: 0 }}>
          {SETTINGS_CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              type="button"
              role="tab"
              aria-selected={activeCategory === cat.id}
              onClick={() => setActiveCategory(cat.id)}
              style={{
                textAlign: 'left',
                font: 'inherit',
                fontSize: 12,
                padding: '6px 8px',
                borderRadius: 6,
                border: 'none',
                cursor: 'pointer',
                background: activeCategory === cat.id ? t.hoverBg : 'transparent',
                color: activeCategory === cat.id ? t.text : t.mutedText,
                fontWeight: activeCategory === cat.id ? 600 : 400
              }}
            >
              {cat.label}
            </button>
          ))}
        </div>
        <div style={{ flex: 1, minWidth: 0, maxHeight: 440, overflowY: 'auto' }}>
      <div style={{ display: activeCategory === 'general' ? 'block' : 'none' }}>
      <div
        style={{
          fontSize: 12,
          fontWeight: 700,
          letterSpacing: '.04em',
          textTransform: 'uppercase',
          color: t.mutedText,
          margin: '0 0 8px',
          paddingBottom: 6,
          borderBottom: `1px solid ${t.border}`
        }}
      >
        Export formatting
      </div>
      <div style={{ display: 'grid', gap: 12, fontSize: 12 }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span>Tree indent width ({treeIndentWidth})</span>
          <input
            type="range"
            min={2}
            max={6}
            step={1}
            value={treeIndentWidth}
            onChange={(e) => setTreeIndentWidth(Number(e.currentTarget.value))}
            aria-label="Tree indent width"
          />
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input type="checkbox" checked={hideTreeLines} onChange={(e) => setHideTreeLines(e.currentTarget.checked)} aria-label="Hide tree lines" />
          <span>
            Hide tree lines
            <div style={{ fontSize: 11, color: t.mutedText }}>
              Clean indented view everywhere -- the live editor and .txt/clipboard exports alike --
              instead of │├└─ connector characters. Off shows real tree-line connectors in the live
              editor too (using the indent width below); depth guide lines only apply while this is on.
            </div>
          </span>
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input
            type="checkbox"
            checked={outlineNumbering}
            onChange={(e) => setOutlineNumbering(e.currentTarget.checked)}
            aria-label="Outline numbering"
          />
          <span>
            Outline numbering
            <div style={{ fontSize: 11, color: t.mutedText }}>Adds dotted outline numbers (1, 1.1, 1.2, ...) to .txt/.md/clipboard exports.</div>
          </span>
        </label>
      </div>
      <div
        style={{
          fontSize: 12,
          fontWeight: 700,
          letterSpacing: '.04em',
          textTransform: 'uppercase',
          color: t.mutedText,
          margin: '16px 0 8px',
          paddingBottom: 6,
          borderBottom: `1px solid ${t.border}`
        }}
      >
        Layout
      </div>
      <div style={{ display: 'grid', gap: 12, fontSize: 12 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input
            type="checkbox"
            checked={depthGuideLines}
            onChange={(e) => setDepthGuideLines(e.currentTarget.checked)}
            aria-label="Depth guide lines"
          />
          <span>
            Depth guide lines
            <div style={{ fontSize: 11, color: t.mutedText }}>Faint vertical lines marking each indent level in the live outline.</div>
          </span>
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input type="checkbox" checked={compactRows} onChange={(e) => setCompactRows(e.currentTarget.checked)} aria-label="Compact rows" />
          <span>
            Compact rows
            <div style={{ fontSize: 11, color: t.mutedText }}>
              Tighter spacing between separate rows, independent of text size.
            </div>
          </span>
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span>Text size ({Math.round(editorScale * 100)}%)</span>
          <input
            type="range"
            min={0.85}
            max={1.4}
            step={0.05}
            value={editorScale}
            onChange={(e) => setEditorScale(Number(e.currentTarget.value))}
            aria-label="Text size"
          />
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input
            type="checkbox"
            checked={editorReadingWidthEnabled}
            onChange={(e) => setEditorReadingWidthEnabled(e.currentTarget.checked)}
            aria-label="Limit reading width"
          />
          <span>
            Limit reading width
            <div style={{ fontSize: 11, color: t.mutedText }}>Caps line length and centers the tree instead of spanning the full window.</div>
          </span>
        </label>
        {editorReadingWidthEnabled && (
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, paddingLeft: 24 }}>
            <span>Reading width ({editorReadingWidth}px)</span>
            <input
              type="range"
              min={600}
              max={1400}
              step={20}
              value={editorReadingWidth}
              onChange={(e) => setEditorReadingWidth(Number(e.currentTarget.value))}
              aria-label="Reading width"
            />
          </label>
        )}
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span>Row style</span>
          <select
            value={rowHighlightStyle}
            onChange={(e) => setRowHighlightStyle(e.currentTarget.value as RowHighlightStyle)}
            aria-label="Row style"
            style={{ font: 'inherit', padding: '4px 6px', borderRadius: 4, border: `1px solid ${t.border}`, background: t.background, color: t.text }}
          >
            {ROW_STYLE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <div style={{ fontSize: 11, color: t.mutedText }}>How the selected row is highlighted.</div>
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input
            type="checkbox"
            checked={alwaysExpandInlineEnabled}
            onChange={(e) => setAlwaysExpandInlineEnabled(e.currentTarget.checked)}
            aria-label="Always expand inline previews"
          />
          <span>
            Always expand inline previews
            <div style={{ fontSize: 11, color: t.mutedText }}>
              Show every node's note/remark/Q&A preview automatically. Off by default -- click a node's own dot to expand just that one.
            </div>
          </span>
        </label>
      </div>
      </div>
      <div style={{ display: activeCategory === 'editing' ? 'block' : 'none' }}>
        <QuickInsertSettings t={t} />
      </div>
      <div style={{ display: activeCategory === 'ai' ? 'block' : 'none' }}>
        <AiProviderSettings t={t} />
        <AiFallbackSettings t={t} />
        <AutoRewriteSettings t={t} />
      </div>
      <div style={{ display: activeCategory === 'data' ? 'block' : 'none' }}>
        <SecureStorageSettings t={t} />
      </div>
        </div>
      </div>
    </div>
  );
}
