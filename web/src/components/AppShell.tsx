import type { ReactNode } from 'react';
import { useDocumentsStore } from '../store/documentsStore';
import { useThemeStore, THEME_TOKENS } from '../store/themeStore';

/**
 * Phase 6.1, part 2 (docs/phase6-full-parity-plan.md, "Design tokens & app shell"). The real
 * app shell around Part 1's design tokens (#129) -- header/app bar, left sidebar, status bar,
 * tab-bar dock -- replacing App.tsx's plain vertically-stacked panel dump (a bare `<h1>` and no
 * chrome at all). Structural dimensions below are copied from legacy/index.html's own CSS, not
 * approximated:
 *   - `#appbar`: fixed height, legacy/index.html:361 (`height:env(titlebar-area-height,40px)`)
 *   - `#sidebar`: fixed width, legacy/index.html:1378 (`--sb-width:234px`)
 *   - `#statusbar`: padding/font-size, legacy/index.html:619
 *   - `#doc-tab-strip-row`/`.doc-tab`: tab-bar row + individual tab chrome,
 *     legacy/index.html:1056-1073
 *
 * Deliberately scoped down from legacy's real shell, each a separate follow-up within 6.1 (see
 * docs/phase6-full-parity-plan.md's 6.1 section for the full list this phase still owes):
 * sidebar is a placeholder pane (no real file explorer / folders / templates yet -- that's
 * DocumentTabs.tsx's own closed-docs list for now), no searchable tab-switcher dropdown for
 * overflow, no drag-to-reorder tabs, no per-tab independent scroll/selection, no sidebar
 * resize handle or collapse toggle, no CSS custom properties yet (still consuming
 * `THEME_TOKENS` via inline styles, same approach as every other component today -- the doc
 * for that follow-up is themeStore.ts's own header comment).
 */
interface AppShellProps {
  title: string;
  headerActions: ReactNode;
  tabBar: ReactNode;
  sidebar: ReactNode;
  statusLeft: ReactNode;
  statusRight: ReactNode;
  children: ReactNode;
}

export function AppShell({
  title,
  headerActions,
  tabBar,
  sidebar,
  statusLeft,
  statusRight,
  children
}: AppShellProps) {
  const theme = useThemeStore((s) => s.theme);
  const accentColor = useThemeStore((s) => s.accentColor());
  const t = THEME_TOKENS[theme];

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        fontFamily: "'Inter', sans-serif",
        background: t.background,
        color: t.text
      }}
    >
      {/* #appbar -- legacy/index.html:361,364 */}
      <div
        style={{
          flex: '0 0 auto',
          height: 40,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 10,
          padding: '8px 12px',
          background: t.toolbarBackground,
          borderBottom: `1px solid ${t.border}`
        }}
      >
        <span style={{ fontWeight: 800, fontSize: 16, letterSpacing: '-0.015em', color: accentColor }}>
          {title}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>{headerActions}</div>
      </div>

      {/* #doc-tab-strip-row -- legacy/index.html:1056 */}
      <div
        style={{
          flex: '0 0 auto',
          display: 'flex',
          alignItems: 'stretch',
          background: t.toolbarBackground,
          borderBottom: `1px solid ${t.border}`,
          padding: '6px 4px 0 8px',
          overflowX: 'auto',
          overflowY: 'hidden'
        }}
      >
        {tabBar}
      </div>

      <div style={{ flex: '1 1 auto', display: 'flex', minHeight: 0 }}>
        {/* #sidebar -- legacy/index.html:1378 */}
        <div
          style={{
            flex: '0 0 234px',
            width: 234,
            display: 'flex',
            flexDirection: 'column',
            background: t.toolbarBackground,
            borderRight: `1px solid ${t.border}`,
            overflow: 'hidden'
          }}
        >
          {sidebar}
        </div>

        <div style={{ flex: '1 1 auto', minWidth: 0, overflow: 'auto', padding: '1rem 1.5rem' }}>
          {children}
        </div>
      </div>

      {/* #statusbar -- legacy/index.html:619 */}
      <div
        style={{
          flex: '0 0 auto',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '6px 12px',
          borderTop: `1px solid ${t.border}`,
          color: t.mutedText,
          fontSize: 12
        }}
      >
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', minWidth: 0 }}>{statusLeft}</div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', justifyContent: 'flex-end', minWidth: 0 }}>
          {statusRight}
        </div>
      </div>
    </div>
  );
}

/**
 * Sidebar placeholder content -- lists every closed (not-open-as-a-tab) document, reusing
 * documentsStore.ts's own docsIndex/openTabs the same way DocumentTabs.tsx's dropdown already
 * does. A real file explorer (folders, templates, drag-to-open) is 6.1's own remaining, separately-
 * scoped item -- see docs/phase6-full-parity-plan.md's 6.1 section.
 */
export function SidebarDocumentList() {
  const docsIndex = useDocumentsStore((s) => s.docsIndex);
  const openTabs = useDocumentsStore((s) => s.openTabs);
  const openDocument = useDocumentsStore((s) => s.openDocument);
  const theme = useThemeStore((s) => s.theme);
  const t = THEME_TOKENS[theme];

  const closedDocs = docsIndex.filter((d) => !openTabs.includes(d.id));

  return (
    <div style={{ padding: '8px 8px 8px', overflowY: 'auto', fontSize: 12 }}>
      <div style={{ color: t.hintText, fontWeight: 600, textTransform: 'uppercase', fontSize: 10, padding: '4px 4px 6px' }}>
        Documents
      </div>
      {closedDocs.length === 0 ? (
        <div style={{ color: t.hintText, padding: '4px 4px' }}>All documents are open</div>
      ) : (
        closedDocs.map((d) => (
          <div
            key={d.id}
            onClick={() => openDocument(d.id)}
            style={{
              padding: '5px 6px',
              borderRadius: 6,
              cursor: 'pointer',
              color: t.text,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap'
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = t.hoverBg)}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
          >
            {d.title}
          </div>
        ))
      )}
    </div>
  );
}
