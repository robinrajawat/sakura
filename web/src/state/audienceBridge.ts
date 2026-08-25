import { usePresenterStore } from '../store/presenterStore';

/**
 * §6.6 slice (docs/phase6-full-parity-plan.md), Audience View step 4: the cross-window bridge
 * itself, plus the real "Open Audience View" trigger -- the piece the previous three steps
 * (usePresenterStore.ts, #220; the query-param boot check + AudienceWindow.tsx, #221; the
 * PresenterSlideView.tsx extraction, this PR) were all building toward.
 *
 * Legacy's own real mechanism (legacy/index.html:38691-39096) works because `window.open('',...)`
 * on the SAME origin returns a real handle into the new window's own global scope -- the opener
 * calls functions that already exist in that window's own loaded copy of the app
 * (`win.switchDoc(id)`, `win.enterPresenterMode()`, etc.), no `postMessage` anywhere. `web/`'s
 * translation keeps that same "call a function living in the other window's own scope" shape,
 * just aimed at a Zustand store instead of legacy's own top-level mutable globals:
 * `installAudienceBridge()` exposes `window.__sakuraAudience.setSyncState` on EVERY window at
 * boot (main.tsx), unconditionally -- mirroring legacy's own pattern of always defining every
 * cross-window function regardless of which role (presenter or audience) a given window ends up
 * playing. The opener then calls that function directly through the handle `window.open()`
 * returns, exactly like legacy calls `win.switchDoc`.
 *
 * Readiness handshake: `AudienceWindow.tsx` calls `window.opener.__sakuraAudienceChildReady
 * (window)` once its own boot finishes -- the direct equivalent of legacy's own
 * `window.opener.audienceWindowReady(window)` (legacy/index.html:39000). A real second page
 * load/mount is inherently variable in timing, so waiting for an explicit signal from the child
 * window itself is far more reliable than guessing a fixed delay, same reasoning legacy's own
 * comment gives for the same choice.
 *
 * Ongoing sync: rather than legacy's manual poll/DOM-clone approach, this subscribes to
 * `usePresenterStore` via Zustand's own `subscribe` API once the child is ready, and pushes the
 * relevant subset of state (`pickSyncState`) into the child on every change -- a plain
 * subscription callback already fires exactly on every real state change and nothing else, so
 * there's no polling loop needed for content sync (only for detecting the child window closing,
 * which has no equivalent event to subscribe to).
 */
export interface AudienceSyncState {
  slideIndex: number;
  blanked: boolean;
  laserOn: boolean;
  laserPos: { x: number; y: number } | null;
}

// Only the fields PresenterSlideView.tsx actually renders -- overviewOpen/notesOpen/elapsedSec/
// audienceWindowOpen have no equivalent on the passive audience side (see presenterStore.ts's
// own header on why `audienceWindowOpen` specifically must never be pushed).
function pickSyncState(): AudienceSyncState {
  const s = usePresenterStore.getState();
  return { slideIndex: s.slideIndex, blanked: s.blanked, laserOn: s.laserOn, laserPos: s.laserPos };
}

declare global {
  interface Window {
    __sakuraAudience?: {
      setSyncState: (state: AudienceSyncState) => void;
    };
    __sakuraAudienceChildReady?: (win: Window) => void;
  }
}

/** Called once from main.tsx, unconditionally, for every window regardless of role. */
export function installAudienceBridge(): void {
  window.__sakuraAudience = {
    setSyncState: (state) => usePresenterStore.setState(state)
  };
}

let audienceWin: Window | null = null;
let unsubscribe: (() => void) | null = null;
let pollTimer: ReturnType<typeof setInterval> | null = null;

export function isAudienceWindowLive(): boolean {
  return !!(audienceWin && !audienceWin.closed);
}

function pushStateTo(win: Window): void {
  try {
    win.__sakuraAudience?.setSyncState(pickSyncState());
  } catch {
    // Cross-window call can throw if the other window has since navigated away or closed mid-
    // call -- best-effort, matching legacy's own defensive try/catch around every cross-window
    // call in this same mechanism.
  }
}

/** Opens (or focuses, if already open) a real second browser window navigated to this same page
 * with `?sakuraAudience=1` appended -- direct port of legacy's real `openAudienceWindow`
 * (legacy/index.html:38718-38734), same popup feature string (no toolbar/location/status bar,
 * meant to be dragged onto a second display and fullscreened there). */
export function openAudienceWindow(): void {
  if (isAudienceWindowLive()) {
    audienceWin!.focus();
    return;
  }
  const url = new URL(window.location.href);
  url.searchParams.set('sakuraAudience', '1');
  const w = window.open(url.toString(), 'sakura-audience-view', 'width=1280,height=720,menubar=no,toolbar=no,location=no,status=no');
  // Pop-up blocked -- a silent no-op here, unlike legacy's own real toast
  // ("Pop-up blocked — allow pop-ups for Sakura to open the Audience View"); `web/` has no
  // equivalent toast surface yet, a real, separately-scoped follow-up, not attempted in this
  // slice.
  if (!w) return;
  audienceWin = w;

  window.__sakuraAudienceChildReady = (win) => {
    // Guards against a stale call from a window that's since been closed and reopened, same
    // reasoning as legacy's own real `audienceWindowReady` check.
    if (win !== audienceWin) return;
    usePresenterStore.getState().setAudienceWindowOpen(true);
    pushStateTo(win);
  };

  if (!unsubscribe) {
    unsubscribe = usePresenterStore.subscribe(() => {
      if (isAudienceWindowLive()) pushStateTo(audienceWin!);
    });
  }

  if (!pollTimer) {
    pollTimer = setInterval(() => {
      if (audienceWin && audienceWin.closed) {
        audienceWin = null;
        usePresenterStore.getState().setAudienceWindowOpen(false);
      }
      if (!audienceWin && pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
      }
    }, 1000);
  }
}

export function closeAudienceWindow(): void {
  if (isAudienceWindowLive()) audienceWin!.close();
  audienceWin = null;
  usePresenterStore.getState().setAudienceWindowOpen(false);
}
