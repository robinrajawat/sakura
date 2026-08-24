import { useEffect, useState } from 'react';
import { useHubJournalStore } from '../store/hubJournalStore';
import { useThemeStore, THEME_TOKENS } from '../store/themeStore';
import { MobileHubTodos } from './MobileHubTodos';
import { MobileHubJournal } from './MobileHubJournal';

type MobileHubView = 'todos' | 'journal';

/**
 * §6.5 slice (docs/phase6-full-parity-plan.md): Mobile Hub, the last remaining item in Hub's
 * full-depth build-out. Legacy's real `hub.html` is a wholly separate mobile-native page --
 * required account sign-in, swipe-gesture rows, bottom-sheet detail views -- built specifically
 * to bridge a phone's otherwise-empty local storage with a desktop's data via Firestore sync
 * (legacy/hub.html's own header comment: "no sign-in, no data, by design").
 *
 * `web/` has neither piece of cross-cutting infra that premise depends on: no client-side
 * routing at all (decision #3, docs/framework-migration-plan.md -- one SPA, no page boundary to
 * put a genuinely separate mobile page behind) and no Hub-domain Firestore sync (§6.8, not
 * started -- `hubTodosStore.ts`/`hubJournalStore.ts` both currently wire real `bumpSyncTimestamp`/
 * `pushMetaToCloud` calls to no-ops). Since this single SPA has no "a different device's empty
 * storage" problem to bridge in the first place -- the mobile view reads the exact same local
 * store as the desktop Hub panels below it -- there is nothing to sign in to bridge, and a
 * sign-in gate here would be theater, not parity. This is a real, deliberate scope reduction
 * (see `useIsMobileViewport.ts`'s own header for the full reasoning), not a partial port:
 * everything legacy's real mobile page actually DOES once you're past its sign-in wall --
 * swipe-to-act rows, bottom-sheet task/entry detail, the To-Dos/Journal-only scope itself -- is
 * built here faithfully.
 *
 * Rendered by `App.tsx` as an early return in place of `AppShell`'s entire desktop layout below
 * `useIsMobileViewport()`'s breakpoint -- no app-shell header/sidebar/tab-bar chrome wraps it,
 * matching legacy's own "wholly separate, focused experience" feel rather than squeezed-down
 * desktop chrome. Deliberately not ported: the account menu/search bar/offline
 * banner/personalized greeting header legacy's own mobile chrome has, and (a real, honest gap
 * from bypassing `AppShell` entirely) the theme toggle -- there is currently no way to switch
 * light/dark from this view; it still renders whatever `themeStore` was last set to from a
 * desktop-width session. Each a real, separately-scoped follow-up once this view's own chrome
 * needs grow past "swap in the two real panels," not silently dropped.
 */
export function MobileHub() {
  const [view, setView] = useState<MobileHubView>('todos');
  const journalLoaded = useHubJournalStore((s) => s.loaded);
  const loadJournal = useHubJournalStore((s) => s.load);
  const theme = useThemeStore((s) => s.theme);
  const t = THEME_TOKENS[theme];

  useEffect(() => {
    if (!journalLoaded) loadJournal();
  }, [journalLoaded, loadJournal]);

  return (
    <div style={{ fontFamily: 'sans-serif', maxWidth: 480, margin: '0 auto' }}>
      <div style={{ display: 'flex', borderBottom: `1px solid ${t.border}`, padding: '10px 12px 0' }}>
        {(
          [
            { key: 'todos', label: 'To-Dos' },
            { key: 'journal', label: 'Journal' }
          ] as { key: MobileHubView; label: string }[]
        ).map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setView(tab.key)}
            aria-pressed={view === tab.key}
            style={{
              flex: 1,
              padding: '10px 0',
              border: 'none',
              borderBottom: view === tab.key ? `2px solid ${t.text}` : '2px solid transparent',
              background: 'none',
              color: view === tab.key ? t.text : t.mutedText,
              fontWeight: view === tab.key ? 700 : 500,
              fontSize: 14,
              cursor: 'pointer'
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>
      {view === 'todos' ? <MobileHubTodos /> : <MobileHubJournal />}
    </div>
  );
}
