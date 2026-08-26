import type { DocStatus } from '../store/documentsStore';

/** Direct port of legacy's real `docStatusLabel` (legacy/index.html:11293). */
const DOC_STATUS_LABELS: Record<DocStatus, string> = {
  '': 'No status',
  draft: 'Draft',
  review: 'Review',
  approved: 'Approved',
  rejected: 'Rejected'
};

export function docStatusLabelCore(status: DocStatus): string {
  return DOC_STATUS_LABELS[status] ?? 'No status';
}

/** Direct port of legacy's real `docStatusColor` (legacy/index.html:11294) -- maps a status to
 * one of `ThemeTokens`' six fixed color-preset keys (`''`/`draft` intentionally excluded, same
 * as legacy: an unset status renders with no color accent at all). */
const DOC_STATUS_COLOR_KEYS: Partial<Record<DocStatus, 'fcGray' | 'fcOrange' | 'fcGreen' | 'fcRed'>> = {
  draft: 'fcGray',
  review: 'fcOrange',
  approved: 'fcGreen',
  rejected: 'fcRed'
};

export function docStatusColorKeyCore(status: DocStatus): 'fcGray' | 'fcOrange' | 'fcGreen' | 'fcRed' | null {
  return DOC_STATUS_COLOR_KEYS[status] ?? null;
}

/** Direct port of legacy's real `normalizeDocLinkedUrl` (legacy/index.html:11317-11326): treats a
 * bare `PROJ-123`-style paste or a URL missing its scheme (both common paste patterns for this
 * specific field, copied straight from a tracker's own UI) as needing `https://` prepended,
 * rather than silently saving something that won't actually open as a link. Empty stays empty. */
export function normalizeDocLinkedUrlCore(raw: string): string {
  const v = raw.trim();
  if (!v) return '';
  if (/^[a-z][a-z0-9+.-]*:/i.test(v)) return v;
  return 'https://' + v;
}

/** Direct port of legacy's real `docLinkUrlLabel` (legacy/index.html:11343-11349) -- the link
 * chip's own display-text fallback when no explicit label was saved: `host/first-path-segment`
 * for a real URL, or a truncated raw string if the URL doesn't even parse. */
export function docLinkUrlLabelCore(url: string): string {
  try {
    const u = new URL(url);
    const seg = u.pathname.split('/').filter(Boolean)[0];
    return u.host + (seg ? '/' + seg : '');
  } catch {
    return url.length > 40 ? url.slice(0, 37) + '…' : url;
  }
}
