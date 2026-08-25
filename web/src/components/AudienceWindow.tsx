import { useEffect } from 'react';
import { useDocumentsStore } from '../store/documentsStore';
import { useThemeStore, THEME_TOKENS } from '../store/themeStore';
import { PresenterMode } from './PresenterMode';

/**
 * §6.6 slice (docs/phase6-full-parity-plan.md), Audience View step 2. Rendered by `App.tsx`
 * in place of the entire normal editor shell when `isAudienceWindow()` (`audienceMode.ts`)
 * detects `?sakuraAudience=1` -- direct port of legacy's real boot-time behavior
 * (legacy/index.html:38970-39003's `SAKURA_AUDIENCE_MODE` block): the normal chrome never
 * mounts at all in this window, matching legacy's own `sakura-audience-boot` CSS class that
 * hides everything until the audience-specific boot finishes.
 *
 * `App.tsx` never mounts `DocumentTabs.tsx` in this branch (that component is what normally
 * calls `useDocumentsStore.getState().init()` -- see its own header), so this component calls
 * `init()` itself on mount; without it, this window's `outlineStore` would stay on its own
 * bare in-memory seed instead of loading the real active document's own persisted nodes from
 * `localStorage`.
 *
 * Deliberately NOT yet the full legacy mechanism -- this is a standalone chromeless presenting
 * view, reachable only by navigating directly to the query param, not yet wired to anything
 * that opens it or drives it from another window. The next steps recorded in
 * phase6-full-parity-plan.md's §6.6 section: an "Open Audience View" trigger (a real
 * `window.open()` call), and a `window`-exposed bridge object so an opener window can push
 * live `usePresenterStore`/`useOutlineStore` state into this window the way legacy's own
 * `audienceWindowReady`/direct cross-window function calls do. Until that bridge exists, this
 * window only ever shows whatever document/presenting state is already sitting in ITS OWN
 * local storage -- not yet synced to any other window.
 */
export function AudienceWindow() {
  const init = useDocumentsStore((s) => s.init);
  const theme = useThemeStore((s) => s.theme);
  const t = THEME_TOKENS[theme];

  useEffect(() => {
    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div style={{ minHeight: '100vh', background: t.background, color: t.text, padding: '1.5rem', boxSizing: 'border-box' }}>
      <PresenterMode />
    </div>
  );
}
