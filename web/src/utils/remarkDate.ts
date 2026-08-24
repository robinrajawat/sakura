/**
 * Phase 6.3 slice, Pad Remarks tab: date field. Direct port of legacy's `todayDateStr`
 * (legacy/index.html:42134) and `formatRemarkDateDisplay` (legacy/index.html:42172-42181,
 * accepts an optional `now` for testability rather than legacy's own always-real-`Date`
 * version). Legacy's real Remarks tab also has node-linking (an `anchorNodeId` field and an
 * anchor picker) and export inclusion (a `remarksExportEnabled` toggle wired into the
 * docx/pptx/PDF export pipeline) -- neither exists in this app yet (no node-linking
 * infrastructure for Pad items generally, no export pipeline at all), so both stay deferred.
 */
export function todayDateStr(now: Date = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

export function formatRemarkDateDisplay(dateStr: string | null | undefined, now: Date = new Date()): string {
  const s = dateStr || todayDateStr(now);
  const parts = s.split('-').map(Number);
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) return s;
  const [year, month, day] = parts;
  const d = new Date(year, month - 1, day);

  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const dCopy = new Date(d);
  dCopy.setHours(0, 0, 0, 0);
  const dayDiff = Math.round((today.getTime() - dCopy.getTime()) / 86400000);
  if (dayDiff === 0) return 'Today';
  if (dayDiff === 1) return 'Yesterday';

  const thisYear = now.getFullYear();
  const opts: Intl.DateTimeFormatOptions =
    d.getFullYear() === thisYear
      ? { month: 'short', day: 'numeric' }
      : { month: 'short', day: 'numeric', year: 'numeric' };
  return d.toLocaleDateString(undefined, opts);
}
