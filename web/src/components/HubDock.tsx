import type { ComponentType, ReactNode } from 'react';
import { useThemeStore, THEME_TOKENS } from '../store/themeStore';
import { useHubDockStore, type HubTab } from '../store/hubDockStore';
import { HubTodosPanel } from './HubTodosPanel';
import { HubMeetingsPanel } from './HubMeetingsPanel';
import { HubJournalPanel } from './HubJournalPanel';
import { HubLibraryPanel } from './HubLibraryPanel';
import { HubRecapPanel } from './HubRecapPanel';

const HUB_TABS: { id: HubTab; label: string; icon: ReactNode }[] = [
  {
    id: 'todos',
    label: 'To-Dos',
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 6h11M9 12h11M9 18h11" />
        <circle cx="4" cy="6" r="1.6" fill="currentColor" stroke="none" />
        <circle cx="4" cy="12" r="1.6" fill="currentColor" stroke="none" />
        <path d="M2.5 18l1 1 2-2" />
      </svg>
    )
  },
  {
    id: 'meetings',
    label: 'Meetings',
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="4" width="18" height="18" rx="2" />
        <line x1="16" y1="2" x2="16" y2="6" />
        <line x1="8" y1="2" x2="8" y2="6" />
        <line x1="3" y1="10" x2="21" y2="10" />
        <path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01" />
      </svg>
    )
  },
  {
    id: 'journal',
    label: 'Journal',
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
        <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
      </svg>
    )
  },
  {
    id: 'library',
    label: 'Library',
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
        <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
        <path d="M9 7h6M9 11h4" />
      </svg>
    )
  },
  {
    id: 'recap',
    label: 'Recap',
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="9" />
        <path d="M8 12.5l2.5 2.5L16 9.5" />
      </svg>
    )
  }
];

const HUB_PANEL_BY_TAB: Record<HubTab, ComponentType> = {
  todos: HubTodosPanel,
  meetings: HubMeetingsPanel,
  journal: HubJournalPanel,
  library: HubLibraryPanel,
  recap: HubRecapPanel
};

/**
 * §7.6 slice (docs/phase7-app-shell-and-dashboard-plan.md): the Hub, docked -- direct port of
 * legacy's real slide-in tabbed dock (legacy/index.html:6812-6816's tab strip +
 * `dockMoveTabstripInto`/`openDockTab`, legacy/index.html:52260-52336). The five Hub panels
 * (`HubTodosPanel.tsx` etc, all real since §6.5, docs/phase6-full-parity-plan.md) render exactly
 * as before -- this component only supplies the docking chrome (tab strip + close button +
 * fixed-position slide-in panel) around whichever one is active; no panel's own internals change.
 * Opened/toggled via `hubDockStore.ts` (see that file's own header for the exact open/toggle
 * semantics it ports from legacy).
 *
 * Renders as `position:fixed` anchored to the right edge, top inset matching `AppShell.tsx`'s own
 * real 40px header height -- `AppShell.tsx` has no dedicated dock-panel layout slot of its own
 * yet (its content area is still Phase 6's plain vertical stack), so this deliberately overlays
 * the content column and status bar's right edge rather than reflowing the layout to make room, a
 * real, documented scope simplification for this structural-docking slice, not an oversight.
 */
export function HubDock() {
  const theme = useThemeStore((s) => s.theme);
  const t = THEME_TOKENS[theme];
  const activeTab = useHubDockStore((s) => s.activeTab);
  const openTab = useHubDockStore((s) => s.openTab);
  const close = useHubDockStore((s) => s.close);

  if (!activeTab) return null;

  const ActivePanel = HUB_PANEL_BY_TAB[activeTab];

  return (
    <div
      role="complementary"
      aria-label="Hub"
      style={{
        position: 'fixed',
        top: 40,
        right: 0,
        bottom: 0,
        width: 380,
        maxWidth: '92vw',
        background: t.background,
        borderLeft: `1px solid ${t.border}`,
        boxShadow: '-8px 0 20px rgba(0,0,0,.1)',
        zIndex: 400,
        display: 'flex',
        flexDirection: 'column',
        fontFamily: "'Inter', sans-serif"
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', borderBottom: `1px solid ${t.border}`, flexShrink: 0 }}>
        <div role="tablist" aria-label="Hub sections" style={{ display: 'flex', flex: 1, overflowX: 'auto' }}>
          {HUB_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.id}
              title={tab.label}
              onClick={() => openTab(tab.id)}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 3,
                flex: '1 0 auto',
                padding: '8px 10px',
                border: 'none',
                borderBottom: activeTab === tab.id ? '2px solid var(--accent)' : '2px solid transparent',
                background: 'none',
                color: activeTab === tab.id ? t.text : t.mutedText,
                fontSize: 10.5,
                cursor: 'pointer'
              }}
            >
              {tab.icon}
              <span>{tab.label}</span>
            </button>
          ))}
        </div>
        <button type="button" onClick={close} aria-label="Close Hub" title="Close Hub" style={{ flexShrink: 0, margin: '0 6px', fontSize: 11 }}>
          ✕
        </button>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: 12 }}>
        <ActivePanel />
      </div>
    </div>
  );
}
