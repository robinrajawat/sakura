import { useEffect, type ReactNode } from 'react';
import { useThemeStore } from '../store/themeStore';
import { useSidebarStore } from '../store/sidebarStore';
import { usePadVisibilityStore } from '../store/padVisibilityStore';
import { SakuraBrandIcon } from '../icons';

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
  /** §8.17 slice (docs/phase8-design-system-parity-plan.md): matches legacy's real
   * `body.zen-mode.zen-hide-appbar #appbar{display:none!important}` (legacy/index.html:2266) --
   * legacy's own real `zenHideAppbar` default is `true`, so `#appbar` hiding is unconditional
   * here too rather than wired to a settings toggle `web/` has no equivalent of yet. */
  zenMode?: boolean;
  /** §8.17 slice: the editor pane's floating chrome cluster (preview/toolbar/pad/zen toggles) --
   * a SIBLING of `children` inside `#editor-pane`, not nested inside it, matching legacy's own
   * real DOM exactly (`#editor-zen-toggle` etc. are direct children of `#editor-pane`, siblings of
   * `#editor-pane-inner`, legacy/index.html:6563-6577). Rendering it here instead of inside
   * `children` is what makes `position:absolute;bottom:14px` anchor to `#editor-pane`'s own real
   * flex-filled height (`flex:1 1 auto`, matching legacy's real `flex:1;min-height:0`) rather than
   * to the outline's own intrinsic content height -- nesting it inside `children` was a real bug
   * this slice found and fixed: on a short document the buttons rendered right after the last
   * node row instead of pinned to the bottom of the editing area. */
  floatingEditorChrome?: ReactNode;
  /** §8.19 slice (docs/phase8-design-system-parity-plan.md): the Pad panel's own content
   * (`<PadPanel />`) -- rendered as a SIBLING of `#editor-pane` inside the same horizontal flex
   * row, matching legacy's real DOM exactly: `#editor-row{flex:1;display:flex}` contains
   * `#editor-wrap` (`#editor-pane`'s own real ancestor), then `#pad-resize-handle`, then
   * `#pad-panel` as trailing siblings (legacy/index.html:6504-6765) -- Pad sits BESIDE the
   * editor, not stacked below it. Visibility/width are read internally from
   * `padVisibilityStore.ts` (same "the shell owns its own docked-panel state" convention
   * `sidebarWidth`/`sidebarOpen` above already establish for the sidebar), so a caller just
   * always passes the panel's content -- this component decides whether/how wide to show it. */
  padPanel?: ReactNode;
}

export function AppShell({
  title,
  headerActions,
  tabBar,
  sidebar,
  statusLeft,
  statusRight,
  children,
  contentRef,
  zenMode,
  floatingEditorChrome,
  padPanel
}: AppShellProps) {
  const initTheme = useThemeStore((s) => s.init);
  const sidebarWidth = useSidebarStore((s) => s.width);
  const sidebarOpen = useSidebarStore((s) => s.open);
  const initSidebar = useSidebarStore((s) => s.init);
  const setSidebarWidth = useSidebarStore((s) => s.setWidth);
  const commitSidebarWidth = useSidebarStore((s) => s.commitWidth);
  const padVisible = usePadVisibilityStore((s) => s.padVisible);
  const padWidth = usePadVisibilityStore((s) => s.padWidth);
  const setPadWidth = usePadVisibilityStore((s) => s.setPadWidth);
  const commitPadWidth = usePadVisibilityStore((s) => s.commitPadWidth);

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

  function startPadResize(startEvent: React.MouseEvent): void {
    startEvent.preventDefault();
    const startX = startEvent.clientX;
    const startWidth = usePadVisibilityStore.getState().padWidth;
    document.body.style.userSelect = 'none';

    function onMouseMove(e: MouseEvent): void {
      // Mirrors the sidebar's own startResize, but grows LEFTWARD -- the Pad panel is docked on
      // the trailing (right) edge, so dragging the handle left should widen it, matching legacy's
      // own real `applyPadWidth(startW - (e.clientX-startX))` (legacy/index.html:41599).
      setPadWidth(startWidth - (e.clientX - startX));
    }
    function onMouseUp(): void {
      document.body.style.userSelect = '';
      commitPadWidth();
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    }
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
          display: zenMode ? 'none' : 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 10,
          padding: '8px 12px',
          background: 'var(--tb-bg)',
          borderBottom: '1px solid var(--border)'
        }}
      >
        {/* §8.14 slice (docs/phase8-design-system-parity-plan.md): direct port of legacy's real
            `#app-brand`/`#app-brand-icon`/`#app-name` (legacy/index.html:4528-4530, 366-368) --
            two real, previously-missed gaps found together: no brand icon at all (see icons.tsx's
            own SakuraBrandIcon header for the correction to a prior session's wrong claim that the
            desktop appbar has no icon), and the wordmark's own styling was never actually matched
            to legacy's real `#app-name` rule -- a small, muted, letter-spaced, uppercase label
            (`font:700 12px`, `color:var(--muted)`, `letter-spacing:.09em`, `text-transform:
            uppercase`), not the bold/16px/accent-colored treatment this span previously had
            (`text-transform:uppercase` renders correctly regardless of the `title` prop's own
            literal casing, same as legacy's own redundant-but-real CSS transform over its
            already-uppercase "SAKURA" markup). */}
        <span style={{ display: 'flex', alignItems: 'center', gap: 0, minWidth: 0 }}>
          <span style={{ display: 'inline-flex', flexShrink: 0, marginRight: 7 }}>
            <SakuraBrandIcon />
          </span>
          <span
            style={{
              display: 'inline',
              font: "700 12px 'Inter', sans-serif",
              color: 'var(--muted)',
              letterSpacing: '.09em',
              textTransform: 'uppercase',
              userSelect: 'none'
            }}
          >
            {title}
          </span>
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

        {/* #editor-pane -- legacy/index.html:522. A real id (added alongside the scrollbar-theming
            retrofit, docs/phase8-design-system-parity-plan.md) so index.css's new
            `#editor-pane::-webkit-scrollbar` rule has something to attach to, plus legacy's own
            real `background:var(--canvas-bg)` (previously inherited the surrounding `--bg`, no
            visual separation from the chrome around it -- a real, findable color gap since
            `--canvas-bg` was already a wired theme token, §6.1, just never consumed) and its own
            real asymmetric padding (`12px 14px 18px 26px`, previously an approximated uniform
            `1rem 1.5rem`). */}
        <div
          ref={contentRef}
          id="editor-pane"
          data-testid="appshell-content"
          style={{ flex: '1 1 auto', minWidth: 0, position: 'relative', overflow: 'auto', padding: '12px 14px 18px 26px', background: 'var(--canvas-bg)' }}
        >
          {children}
          {floatingEditorChrome}
        </div>

        {/* #pad-resize-handle -- legacy/index.html:1634-1637/6597, 5px wide, hidden while Pad is
            closed (legacy's own real `.pad-hidden` class on both the handle and the panel). */}
        {padVisible && (
          <div
            onMouseDown={startPadResize}
            title="Drag to resize Pad"
            style={{ flex: '0 0 5px', width: 5, cursor: 'ew-resize', background: 'transparent' }}
          />
        )}

        {/* #pad-panel -- legacy/index.html:1638, a docked trailing sibling of #editor-pane (NOT
            stacked below it), `flex:0 0 var(--pad-width)` with its own real resizable width
            (padVisibilityStore.ts). */}
        {padVisible && (
          <div
            style={{
              flex: `0 0 ${padWidth}px`,
              width: padWidth,
              display: 'flex',
              flexDirection: 'column',
              background: 'var(--tb-bg)',
              overflow: 'auto'
            }}
          >
            {padPanel}
          </div>
        )}
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
