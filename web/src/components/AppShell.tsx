import { useEffect, type ReactNode } from 'react';
import { useThemeStore } from '../store/themeStore';
import { useSidebarStore } from '../store/sidebarStore';

/**
 * Phase 6.1, part 2 (docs/phase6-full-parity-plan.md, "Design tokens & app shell"). The real
 * app shell around Part 1's design tokens (#129) -- header/app bar, left sidebar, status bar,
 * tab-bar dock -- replacing App.tsx's plain vertically-stacked panel dump (a bare `<h1>` and no
 * chrome at all). Structural dimensions below are copied from legacy/index.html's own CSS, not
 * approximated:
 *   - `#appbar`: fixed height, legacy/index.html:361 (`height:env(titlebar-area-height,40px)`)
 *   - `#sidebar`: default/min/max width, legacy/index.html:29828-29830 (see sidebarStore.ts)
 *   - `#statusbar`: padding/font-size, legacy/index.html:619
 *   - `#doc-tab-strip-row`/`#doc-tab-strip`/`.doc-tab`: tab-bar row + individual tab chrome,
 *     legacy/index.html:1056-1073 (real classes/ids since §8.4e, docs/phase8-design-system-
 *     parity-plan.md -- this component's own dimensions here were a Phase 6.1 inline-style
 *     approximation before that)
 *
 * Colors are real CSS custom properties (`var(--bg)`, `var(--accent)`, etc.) rather than
 * `THEME_TOKENS[theme]` lookups -- themeStore.ts's own `CSS_VAR_MAP`/`applyCssVariables` sets
 * these on `<body>` (matching legacy's own `body.theme-light`/`body.theme-dark` + independently-
 * mutated `--accent` mechanism), and this component + DocumentTabs.tsx are the first to actually
 * consume them that way, per themeStore.ts's own header on why. The payoff: neither component
 * needs to subscribe to `theme`/`accentPreset` at all anymore for styling purposes -- an accent
 * or theme change updates every `var(--...)` reference here purely through CSS cascade, with no
 * React re-render of this component involved. Every OTHER existing component (OutlineTree.tsx,
 * the Hub panels, etc.) still reads `THEME_TOKENS[theme]` via plain React state, unchanged --
 * migrating those is a separate, much larger follow-up, not attempted here.
 *
 * Deliberately scoped down from legacy's real shell, each a separate follow-up within 6.1 (see
 * docs/phase6-full-parity-plan.md's 6.1 section for the full list this phase still owes):
 * sidebar is a placeholder pane (no real file explorer / folders / templates yet -- that's
 * DocumentTabs.tsx's own closed-docs list for now).
 * Per-tab independent scroll/selection, drag-to-reorder tabs, sidebar resize/collapse, and the
 * searchable tab-switcher dropdown now work -- see `contentRef` below, documentsStore.ts's own
 * `TabViewState`/`reorderTab`, sidebarStore.ts, and DocumentTabs.tsx's own header for how each
 * is implemented. Sidebar collapse's toggle button lives in App.tsx's `headerActions` (passed
 * into this component's header, not rendered here) rather than a separate floating "reopen"
 * button the way legacy needs -- see sidebarStore.ts's own header for why that split doesn't
 * apply here.
 */
interface AppShellProps {
  title: string;
  headerActions: ReactNode;
  tabBar: ReactNode;
  sidebar: ReactNode;
  statusLeft: ReactNode;
  statusRight: ReactNode;
  children: ReactNode;
  /** Ref callback for the scrollable content pane -- lets a caller (App.tsx, via
   * documentsStore's `registerScrollContainer`) read/write its `scrollTop` for the per-tab
   * scroll-position restore described in documentsStore.ts's own `TabViewState` header. */
  contentRef?: (el: HTMLDivElement | null) => void;
}

export function AppShell({
  title,
  headerActions,
  tabBar,
  sidebar,
  statusLeft,
  statusRight,
  children,
  contentRef
}: AppShellProps) {
  const initTheme = useThemeStore((s) => s.init);
  const sidebarWidth = useSidebarStore((s) => s.width);
  const sidebarOpen = useSidebarStore((s) => s.open);
  const initSidebar = useSidebarStore((s) => s.init);
  const setSidebarWidth = useSidebarStore((s) => s.setWidth);
  const commitSidebarWidth = useSidebarStore((s) => s.commitWidth);

  useEffect(() => {
    initTheme();
    initSidebar();
    // Same deliberate empty-dependency-array convention as DocumentTabs.tsx's own init()
    // effect -- applies the CSS custom properties (themeStore) and restores persisted
    // width/open state (sidebarStore) once per app lifetime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function startResize(startEvent: React.MouseEvent): void {
    startEvent.preventDefault();
    const startX = startEvent.clientX;
    const startWidth = useSidebarStore.getState().width;
    document.body.style.userSelect = 'none';

    function onMouseMove(e: MouseEvent): void {
      setSidebarWidth(startWidth + (e.clientX - startX));
    }
    function onMouseUp(): void {
      document.body.style.userSelect = '';
      commitSidebarWidth();
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    }
    // Plain window-level listeners added/removed imperatively around the drag gesture --
    // matches legacy's own initSidebarResize closure shape exactly (legacy/index.html:33046-33056)
    // rather than routing this through React state/effects, since the gesture's lifetime is
    // itself the right scope for these listeners and doesn't need to survive a re-render.
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        fontFamily: "'Public Sans', 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        background: 'var(--bg)',
        color: 'var(--fg)'
      }}
    >
      {/* #appbar -- legacy/index.html:361,364. A real `id` (not just a comment) as of §8.1
          (docs/phase8-design-system-parity-plan.md) -- `index.css`'s new `#appbar .primary`/etc.
          scoped overrides need a real selector to attach to, matching legacy's own real
          `#appbar .btn{...}` scoped rule (legacy/index.html:813) exactly. */}
      <div
        id="appbar"
        style={{
          flex: '0 0 auto',
          height: 40,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 10,
          padding: '8px 12px',
          background: 'var(--tb-bg)',
          borderBottom: '1px solid var(--border)'
        }}
      >
        <span style={{ fontWeight: 800, fontSize: 16, letterSpacing: '-0.015em', color: 'var(--accent)' }}>
          {title}
        </span>
        <div id="header-actions" style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          {headerActions}
        </div>
      </div>

      {/* #doc-tab-strip-row -- legacy/index.html:1056/6336. §8.4e retrofit (docs/phase8-design-
          system-parity-plan.md): this was a Phase 6.1 inline-style approximation, real id but
          the wrong CSS attached to it (a duplicate of #doc-tab-strip's OWN properties, which
          legacy keeps as a distinct, separately-scrolling inner element -- see index.css's own
          #doc-tab-strip-row/#doc-tab-strip header comment for the real bug that came from
          conflating the two). This row itself now carries only the real #doc-tab-strip-row
          rule; DocumentTabs.tsx owns the inner #doc-tab-strip element and its siblings. */}
      <div id="doc-tab-strip-row">{tabBar}</div>

      <div style={{ flex: '1 1 auto', display: 'flex', minHeight: 0 }}>
        {/* #sidebar -- legacy/index.html:1378,1380 (width/collapsed-state numbers live in
            sidebarStore.ts, matching legacy/index.html:29828-29830 exactly) */}
        <div
          data-testid="appshell-sidebar"
          style={{
            flex: sidebarOpen ? `0 0 ${sidebarWidth}px` : '0 0 0px',
            width: sidebarOpen ? sidebarWidth : 0,
            display: 'flex',
            flexDirection: 'column',
            background: 'var(--tb-bg)',
            borderRight: sidebarOpen ? '1px solid var(--border)' : 'none',
            overflow: 'hidden',
            opacity: sidebarOpen ? 1 : 0,
            pointerEvents: sidebarOpen ? 'auto' : 'none'
          }}
        >
          {sidebar}
        </div>

        {/* #sidebar-resize-handle -- legacy/index.html:1382, 5px wide, hidden while collapsed
            (legacy/index.html:1385's `#sidebar.collapsed ~ #sidebar-resize-handle{display:none}`) */}
        {sidebarOpen && (
          <div
            onMouseDown={startResize}
            title="Drag to resize file explorer"
            style={{ flex: '0 0 5px', width: 5, cursor: 'ew-resize', background: 'transparent' }}
          />
        )}

        <div
          ref={contentRef}
          data-testid="appshell-content"
          style={{ flex: '1 1 auto', minWidth: 0, overflow: 'auto', padding: '1rem 1.5rem' }}
        >
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
          borderTop: '1px solid var(--border)',
          color: 'var(--muted)',
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
 * Sidebar content -- see SidebarFileExplorer.tsx (its own dedicated file, matching the same
 * split as DocumentTabs.tsx: sizable enough content-specific logic that it doesn't belong
 * cluttering this file's own job of shell chrome/layout).
 */
