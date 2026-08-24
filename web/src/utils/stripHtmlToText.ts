/**
 * Phase 6.3 slice, part of the rich-text note work. Direct port of legacy's `stripHtmlToText`
 * (legacy/index.html:16600-16605). Used anywhere a note needs to render/search as plain text --
 * e.g. the row-inline note preview and `serializeTreeTextWithNotes.ts`'s injected dependency,
 * which had no real implementation to call until now.
 */
export function stripHtmlToText(html: string | null | undefined): string {
  if (!html) return '';
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  return (tmp.textContent || '').replace(/\s+/g, ' ').trim();
}
