/**
 * What a loading screen shows after a given wait, following the usual response-time limits
 * (Nielsen; also Google's and Apple's guidance): nothing for a short wait, then placeholder
 * shapes, then words saying it is taking longer, then a way out (Retry) once it looks stuck.
 * Offline wins over all of them: waiting can't help, so the screen says so straight away.
 *
 * Wired into index.html via scripts/generate-index-blocks.mjs's `loadingStage` block. The
 * document placeholder (setDocContentPendingLock) uses it; any other wait can too.
 */
export type LoadingStage = 'quiet' | 'loading' | 'slow' | 'stalled' | 'offline';

/** Below this, show nothing: a spinner that flashes for a moment looks worse than the wait. */
export const LOADING_SHOW_AFTER_MS = 300;
/** From here, say it is taking longer than usual. */
export const LOADING_SLOW_AFTER_MS = 4000;
/** From here, treat it as stuck: say so and offer Retry. */
export const LOADING_STALLED_AFTER_MS = 12000;

export function loadingStage(elapsedMs: number, online: boolean = true): LoadingStage {
  if (!online) return 'offline';
  const t = Number.isFinite(elapsedMs) ? elapsedMs : 0;
  if (t < LOADING_SHOW_AFTER_MS) return 'quiet';
  if (t < LOADING_SLOW_AFTER_MS) return 'loading';
  if (t < LOADING_STALLED_AFTER_MS) return 'slow';
  return 'stalled';
}

/** Milliseconds until the stage after this one, or null when no later stage comes by waiting. */
export function msUntilNextLoadingStage(elapsedMs: number, online: boolean = true): number | null {
  if (!online) return null;
  const t = Number.isFinite(elapsedMs) ? Math.max(0, elapsedMs) : 0;
  for (const edge of [LOADING_SHOW_AFTER_MS, LOADING_SLOW_AFTER_MS, LOADING_STALLED_AFTER_MS]) {
    if (t < edge) return edge - t;
  }
  return null;
}
