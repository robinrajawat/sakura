import { useEffect, useState } from 'react';
import { useHubJournalStore } from '../store/hubJournalStore';
import { useThemeStore, THEME_TOKENS } from '../store/themeStore';
import { MobileHubTodos } from './MobileHubTodos';
import { MobileHubJournal } from './MobileHubJournal';
import { AccountMenu } from './AccountMenu';

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
 * desktop chrome.
 *
 * §8.11 slice (docs/phase8-design-system-parity-plan.md), reported directly by the user against
 * a real side-by-side of this view and legacy's real `hub.html`: this component never set a real
 * background/text color anywhere (no `AppShell` ancestor to inherit `var(--bg)`/`var(--fg)` from,
 * and no `body`-level rule exists in `web/`'s own `index.css` either -- confirmed by a real
 * screenshot rendering solid white regardless of the OS's dark-mode preference), and had no brand
 * row or account entry point at all, unlike legacy's real `#hub-sticky-header`/`#todo-bar`
 * (legacy/hub.html:445-448: a brand icon+wordmark, and `#account-menu-wrap`, legacy/hub.html:
 * 449-471: an avatar button opening a dropdown with name/email, a real Auto/Light/Dark theme
 * row, a reminders toggle, and sign-out). Fixed: the wrapping div now carries real
 * `background: var(--bg)` / `color: var(--fg)` (matching `AppShell.tsx`'s own exact treatment,
 * §6.1) plus `minHeight: '100vh'`; a new header row reuses `AppShell.tsx`'s own exact "Sakura"
 * wordmark treatment (bold, `var(--accent)`, no separate brand icon -- confirmed desktop's own
 * real `#appbar` has none either, despite legacy's *mobile*-only page having one) plus the
 * already-real, already-tested `AccountMenu.tsx` (§7.6) for the account button/dropdown --
 * reused as-is rather than rebuilt, the same "one real account surface, not two" precedent §8.4a
 * already established for desktop's own former `SyncStatusIndicator.tsx` duplication.
 * **Real, deliberate scope note, not silently dropped**: `AccountMenu.tsx`'s own dropdown has
 * Settings/Help/Feedback/About entries legacy's real mobile dropdown doesn't (that one has only
 * name/email/theme/reminders/sign-out) -- reused anyway rather than forking a mobile-only
 * variant, since a real desktop-only Settings panel exists to open ("Settings" here shows an
 * honest `window.alert` placeholder instead, matching this project's established
 * no-toast-system convention, e.g. `WelcomeModal.tsx`'s own "not built here yet" placeholders --
 * a real mobile Settings surface is a separate, larger follow-up). The search icon
 * (`#hub-search-toggle`) and offline-banner/personalized-greeting chrome legacy's real header
 * also has are still deliberately not built -- no backing search/offline-detection feature
 * exists in `web/` for either yet.
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
    <div style={{ fontFamily: 'sans-serif', minHeight: '100vh', background: 'var(--bg)', color: 'var(--fg)' }}>
      <div style={{ maxWidth: 480, margin: '0 auto' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px 12px 8px'
          }}
        >
          <span style={{ fontWeight: 800, fontSize: 16, letterSpacing: '-0.015em', color: 'var(--accent)' }}>Sakura</span>
          <AccountMenu onOpenSettings={() => window.alert('Settings is not available on this mobile view yet -- open Sakura on a computer.')} />
        </div>
      <div style={{ display: 'flex', borderBottom: `1px solid ${t.border}`, padding: '0 12px 0' }}>
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
    </div>
  );
}
