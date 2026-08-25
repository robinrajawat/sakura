import { useEffect, useState } from 'react';
import { useDocumentsStore } from '../store/documentsStore';
import { useThemeStore, THEME_TOKENS } from '../store/themeStore';
import { PresenterSlideView } from './PresenterSlideView';

/**
 * §6.6 slice (docs/phase6-full-parity-plan.md), Audience View steps 2 and 4. Rendered by
 * `App.tsx` in place of the entire normal editor shell when `isAudienceWindow()`
 * (`audienceMode.ts`) detects `?sakuraAudience=1` -- direct port of legacy's real boot-time
 * behavior (legacy/index.html:38970-39003's `SAKURA_AUDIENCE_MODE` block): the normal chrome
 * never mounts at all in this window, matching legacy's own `sakura-audience-boot` CSS class
 * that hides everything until the audience-specific boot finishes.
 *
 * `App.tsx` never mounts `DocumentTabs.tsx` in this branch (that component is what normally
 * calls `useDocumentsStore.getState().init()` -- see its own header), so this component calls
 * `init()` itself on mount; without it, this window's `outlineStore` would stay on its own
 * bare in-memory seed instead of loading the real active document's own persisted nodes from
 * `localStorage`.
 *
 * Renders `PresenterSlideView` with `interactive={false}` -- NOT the full `PresenterMode`, which
 * would give this window its own independent Prev/Next buttons and keyboard shortcuts that
 * fight whatever a driving opener pushes in. Legacy's own real Audience window has none of that
 * either (see PresenterSlideView.tsx's own header).
 *
 * On mount, if this window has a real `window.opener` that itself installed the bridge
 * (`state/audienceBridge.ts`), signals readiness via `window.opener.__sakuraAudienceChildReady
 * (window)` -- the direct equivalent of legacy's own `window.opener.audienceWindowReady(window)`
 * (legacy/index.html:39000). The opener then starts pushing live presenting state into this
 * window's own `usePresenterStore` (installAudienceBridge's `setSyncState`), which this
 * component just renders like any other store-driven view -- no polling, no DOM-cloning.
 *
 * The click-or-`F`-to-fullscreen hint is a direct port of legacy's own real one
 * (legacy/index.html:38985-38993): a cross-window `requestFullscreen()` call has no genuine user
 * gesture behind it and is silently blocked by the browser, same as any other cross-window call
 * -- this needs a real click or keypress inside THIS window itself. Reachable only by navigating
 * directly to the query param without ever going through `openAudienceWindow()` still works fine
 * -- this window just shows whatever's already sitting in its own local storage, not yet driven
 * by anything.
 */
export function AudienceWindow() {
  const init = useDocumentsStore((s) => s.init);
  const theme = useThemeStore((s) => s.theme);
  const t = THEME_TOKENS[theme];
  const [showFullscreenHint, setShowFullscreenHint] = useState(!!window.opener);

  useEffect(() => {
    init();
    if (window.opener && typeof window.opener.__sakuraAudienceChildReady === 'function') {
      window.opener.__sakuraAudienceChildReady(window);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function enterFullscreen() {
    setShowFullscreenHint(false);
    if (!document.fullscreenElement) document.documentElement.requestFullscreen?.().catch(() => {});
    window.opener?.focus?.();
  }

  useEffect(() => {
    if (!showFullscreenHint) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'f' || e.key === 'F') enterFullscreen();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [showFullscreenHint]);

  return (
    <div style={{ minHeight: '100vh', background: t.background, color: t.text, padding: '1.5rem', boxSizing: 'border-box' }}>
      <PresenterSlideView />
      {showFullscreenHint && (
        <div
          onClick={enterFullscreen}
          style={{
            position: 'fixed',
            left: '50%',
            bottom: 22,
            transform: 'translateX(-50%)',
            zIndex: 99999,
            padding: '10px 18px',
            borderRadius: 999,
            background: 'rgba(0,0,0,.82)',
            color: '#fff',
            font: "500 13px/1.4 'Inter', sans-serif",
            cursor: 'pointer',
            whiteSpace: 'nowrap',
            boxShadow: '0 6px 20px rgba(0,0,0,.3)'
          }}
        >
          Drag onto your presentation display, then click here (or press F) to go fullscreen
        </div>
      )}
    </div>
  );
}
