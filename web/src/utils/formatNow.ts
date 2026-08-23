/**
 * Phase 6.2 (docs/phase6-full-parity-plan.md's Core Editing list): Quick Insert, the last
 * remaining item. Matches legacy's own real `formatNow()` (legacy/index.html:13649) --
 * specifically its DEFAULT format only ("January 05, 2026, 3:45 PM"); the `iso`
 * ("2026-01-05 15:45") and `eu` ("05/01/2026 15:45") variants are gated behind a
 * `dateTimeFormat` preference this project doesn't have yet (no settings system at all), so
 * only the one format everyone gets without changing any setting is reproduced here.
 */
export function formatNow(now: Date = new Date()): string {
  const date = now.toLocaleDateString('en-US', { month: 'long', day: '2-digit', year: 'numeric' });
  const time = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  return `${date}, ${time}`;
}
