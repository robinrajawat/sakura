/**
 * §6.8 slice: the pure state<->dot-color mapping behind the real persistent top-bar sync-status
 * dot (`components/SyncStatusIndicator.tsx`) -- direct port of the resting-state half of
 * legacy's real `updateSyncStatusUI`'s dot `classList` logic (legacy/index.html:15599-15611).
 * The other half -- the 4000ms "bright green, then settle into a dim persistent green" fade
 * timer legacy's own `_syncDotFadeTimer` implements -- is genuinely time-based UI behavior, not
 * something legacy itself expresses as a pure function either (it's a plain `setTimeout` inside
 * imperative DOM code), so that part stays in the component itself rather than being forced into
 * a pure function just for its own sake.
 */

export type SyncDotVisual = 'syncing' | 'synced' | 'idle-ok' | 'error';

/** Pure: `docSyncStore`'s `syncStatus` -> the dot's own resting visual state, matching legacy's
 * real dot logic exactly. `'idle'` (nothing in flight for the currently open document, or no
 * document open at all) maps to `'idle-ok'` -- legacy's own `wireAccountUI` gives the dot this
 * same baseline presence the moment someone is signed in, rather than leaving it blank until the
 * first sync event ever fires. The one state this function does NOT produce on its own is the
 * bright, pre-fade `'synced'` -> `'idle-ok'` transition itself; the caller is responsible for
 * showing `'synced'` for 4000ms (matching `_syncDotFadeTimer`) before falling back to calling
 * this again, which will then correctly resolve to `'idle-ok'` for an unchanged `'idle'`/`'synced'`
 * status. */
export function syncDotVisualForStatus(status: 'idle' | 'syncing' | 'synced' | 'error'): SyncDotVisual {
  if (status === 'syncing') return 'syncing';
  if (status === 'error') return 'error';
  if (status === 'synced') return 'synced';
  return 'idle-ok';
}
