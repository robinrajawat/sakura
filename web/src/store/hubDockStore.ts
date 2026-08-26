import { create } from 'zustand';

export type HubTab = 'todos' | 'meetings' | 'journal' | 'library' | 'recap';

const LAST_TAB_KEY = 'sakura_web_dock_last_tab';
const HUB_TABS: HubTab[] = ['todos', 'meetings', 'journal', 'library', 'recap'];

function readLastTab(): HubTab {
  try {
    const saved = localStorage.getItem(LAST_TAB_KEY);
    if (saved && (HUB_TABS as string[]).includes(saved)) return saved as HubTab;
  } catch {
    // localStorage can throw in a locked-down environment -- same defensive convention every
    // other localStorage read in this project already uses; 'journal' (legacy's own real
    // default) is a safe fallback.
  }
  return 'journal';
}

interface HubDockState {
  activeTab: HubTab | null;
  lastTab: HubTab;
  openTab: (tab: HubTab) => void;
  toggleTab: (tab: HubTab) => void;
  close: () => void;
}

/**
 * §7.6 slice (docs/phase7-app-shell-and-dashboard-plan.md): the Hub dock's open/active-tab state,
 * shared between the app-bar launcher button (`App.tsx`'s `headerActions`) and the docked panel
 * itself (`HubDock.tsx`, rendered in the main content column) -- direct port of legacy's real
 * `dockActiveTab`/`dockLastTab`/`openDockTab`/`toggleDockTab` (legacy/index.html:52269-52336): a
 * tab click always shows that tab and remembers it as `lastTab` (persisted to localStorage, same
 * "which tab reopens next" behavior as legacy's own `sakura_dock_last_tab`); the launcher button
 * toggles -- closes if `lastTab`/`activeTab` is already open, opens `lastTab` otherwise, matching
 * legacy's own `toggleDockTab(dockActiveTab||dockLastTab)` call exactly. Deliberately NOT ported:
 * legacy's own maximize/restore width state (`dockMaximized`) -- a real, separately-scoped
 * follow-up once the dock's own default sizing has been checked against a real screenshot, not
 * attempted in this structural-docking slice.
 */
export const useHubDockStore = create<HubDockState>((set, get) => ({
  activeTab: null,
  lastTab: readLastTab(),

  openTab: (tab) => {
    try {
      localStorage.setItem(LAST_TAB_KEY, tab);
    } catch {
      // best-effort persistence only, same convention as readLastTab() above
    }
    set({ activeTab: tab, lastTab: tab });
  },

  toggleTab: (tab) => {
    if (get().activeTab === tab) {
      set({ activeTab: null });
      return;
    }
    get().openTab(tab);
  },

  close: () => set({ activeTab: null })
}));
