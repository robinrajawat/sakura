/**
 * Formats a timestamp as a short relative-time string ("just now", "3m ago", "2h ago"), or an
 * absolute short date once it's a day or more old.
 *
 * Wired into index.html via scripts/generate-index-blocks.mjs's `formatRelativeTime` block —
 * name and signature both match the original exactly, so no wrapper was needed and none of
 * index.html's real call sites changed.
 *
 * The original index.html function calls `Date.now()` directly inside its own body, making it
 * untestable without either mocking global time or waiting in real time. `now` is added here
 * as an optional SECOND parameter defaulting to `Date.now()` — the one addition strictly
 * needed for deterministic tests, kept as the only change from the original (locale stays
 * hardcoded to 'en-US' exactly as it was; adding a locale option isn't needed for testability
 * and belongs to a real feature request, not this extraction). Every real call site calls this
 * with exactly one argument (`formatRelativeTime(ts)`), unaffected by the added parameter.
 */
export function formatRelativeTime(ts: number | null | undefined, now: number = Date.now()): string {
  if (!ts) return '—';
  const secs = Math.floor((now - ts) / 1000);
  if (secs < 5) return 'just now';
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
