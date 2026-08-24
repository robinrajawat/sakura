/**
 * Phase 6.3 slice, Note editor link insertion. Direct port of legacy's `sanitizeHrefUrl`
 * (legacy/index.html:9071-9076). A second line of defense specific to the link-insert flow --
 * `sanitizeRichHtml` already strips `javascript:` hrefs from any HTML written into a note, but
 * this runs first, at the point a URL is typed into the link prompt, so a bad URL never even
 * reaches the `insertHTML` call.
 */
export function sanitizeHrefUrl(url: string | null | undefined): string {
  const trimmed = String(url || '').trim();
  // "jav\tascript:" is a known filter-bypass trick -- strip control characters before testing.
  const stripped = trimmed.replace(/[\x00-\x1f]/g, '');
  if (/^\s*javascript:/i.test(stripped)) return '';
  return trimmed;
}
