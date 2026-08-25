import { useEffect, useRef, useState } from 'react';
import { useAuthStore } from '../store/authStore';
import { useDocSyncStore } from '../store/docSyncStore';
import { syncDotVisualForStatus, type SyncDotVisual } from '../state/syncStatusDot';

const DOT_COLOR: Record<SyncDotVisual, string> = {
  syncing: 'var(--accent)',
  synced: '#2fa84f',
  'idle-ok': 'color-mix(in srgb, #2fa84f 42%, transparent)',
  error: '#e5484d'
};

const STATUS_LABEL: Record<SyncDotVisual, string> = {
  syncing: 'Syncing…',
  synced: 'Synced',
  'idle-ok': 'Sync up to date',
  error: 'Sync error — will retry on your next change'
};

/**
 * §6.8 slice: the real persistent top-bar sync-status dot, direct port of legacy's real
 * `account-toggle-status-dot` (legacy/index.html:482-487) and `updateSyncStatusUI`'s dot logic
 * (legacy/index.html:15583-15612) -- previously `web/` only had `DocSyncPanel.tsx`'s own
 * `syncStatus` text line, scoped to whichever document happens to be open and only visible
 * while that panel is scrolled into view. This dot instead reflects the account's overall,
 * always-visible cloud-sync health from the header: an overlay badge on a small avatar (or a
 * colored-circle initial fallback, matching legacy's own real fallback exactly) next to
 * `NotificationBell`, hidden entirely when signed out -- mirrors legacy's own avatar-wrap
 * `display:none` while signed out, so there's nothing to show a status for.
 *
 * The bright-then-dim fade (`'synced'` for 4000ms, then settling into a dim, persistent
 * `'idle-ok'` rather than fading to nothing) is this component's own local timer, matching
 * legacy's real `_syncDotFadeTimer` -- `syncDotVisualForStatus` (`state/syncStatusDot.ts`) is
 * the pure, tested resting-state mapping; this effect layers the one genuinely time-based
 * transition on top, same split legacy's own code has between its DOM-manipulating
 * `updateSyncStatusUI` and its own bare `setTimeout`.
 *
 * A real, deliberate simplification vs. legacy: no click-to-open account dropdown menu -- `web/`
 * has no account dropdown surface at all yet (`AuthPanel.tsx`/`DocSyncPanel.tsx` are flat panels,
 * not a menu), a real, separately-scoped gap already true before this slice. This dot is a
 * glanceable status indicator only; hovering shows the current status via its `title` attribute.
 */
export function SyncStatusIndicator() {
  const user = useAuthStore((s) => s.user);
  const syncStatus = useDocSyncStore((s) => s.syncStatus);
  const [visual, setVisual] = useState<SyncDotVisual>('idle-ok');
  const fadeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (fadeTimerRef.current) {
      clearTimeout(fadeTimerRef.current);
      fadeTimerRef.current = null;
    }
    if (syncStatus === 'synced') {
      setVisual('synced');
      fadeTimerRef.current = setTimeout(() => setVisual('idle-ok'), 4000);
      return;
    }
    setVisual(syncDotVisualForStatus(syncStatus));
  }, [syncStatus]);

  useEffect(
    () => () => {
      if (fadeTimerRef.current) clearTimeout(fadeTimerRef.current);
    },
    []
  );

  if (!user) return null;

  const initial = (user.displayName || user.email || '?').trim().charAt(0).toUpperCase();

  return (
    <span title={STATUS_LABEL[visual]} style={{ position: 'relative', display: 'inline-flex', width: 20, height: 20, flexShrink: 0 }}>
      {user.photoURL ? (
        <img src={user.photoURL} alt="" width={20} height={20} style={{ borderRadius: '50%', display: 'block' }} />
      ) : (
        <span
          aria-hidden="true"
          style={{
            width: 20,
            height: 20,
            borderRadius: '50%',
            background: 'var(--accent)',
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 10,
            fontWeight: 600
          }}
        >
          {initial}
        </span>
      )}
      <span
        style={{
          position: 'absolute',
          bottom: -1,
          right: -1,
          width: 7,
          height: 7,
          borderRadius: '50%',
          border: '1.5px solid var(--bg)',
          background: DOT_COLOR[visual],
          animation: visual === 'syncing' ? 'accountDotPulse 1s ease-in-out infinite' : undefined
        }}
      />
      <style>{`@keyframes accountDotPulse { 0%, 100% { opacity: 1; } 50% { opacity: .35; } }`}</style>
    </span>
  );
}
