/**
 * Drops colours that came in with pasted rich text (owner, 2026-11-02: text pasted from a web page into
 * a note kept its black text and bright blue links, unreadable in dark mode). Like Notion and Google
 * Docs, pasted text takes the theme's own colours; bold, lists, tables and links stay.
 *
 * Kept: anything Sakura writes itself — a value using a theme variable (`var(--…)`), the selection
 * bar's highlight (`hiliteColor` with an rgba at .35 alpha) and `transparent`.
 * Dropped: `color`, `background` and `background-color` declarations with any other value, and the
 * old `color` / `bgcolor` attributes (`<font color>`, `<td bgcolor>`).
 *
 * Works on the HTML string (no DOM), so it can run on save and when a stored note is normalized.
 * Wired into index.html via scripts/generate-index-blocks.mjs's `pastedColours` block.
 */
const SAKURA_HIGHLIGHT = /^rgba\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*0?\.35\s*\)$/i;

function keepColourValue(prop: string, value: string): boolean {
  const v = value.replace(/!important/i, '').trim();
  if (/var\(--/i.test(v)) return true;
  if (prop === 'color') return false;
  return v.toLowerCase() === 'transparent' || SAKURA_HIGHLIGHT.test(v);
}

function cleanStyle(style: string): { text: string; dropped: boolean } {
  let dropped = false;
  const kept = style.split(';').filter((decl) => {
    const i = decl.indexOf(':');
    if (i < 0) return true;
    const prop = decl.slice(0, i).trim().toLowerCase();
    if (prop !== 'color' && prop !== 'background' && prop !== 'background-color') return true;
    const keep = keepColourValue(prop, decl.slice(i + 1));
    if (!keep) dropped = true;
    return keep;
  });
  return { text: kept.map((d) => d.trim()).filter(Boolean).join('; '), dropped };
}

export function stripPastedColours(html: string): string {
  if (!html || !/color|background/i.test(html)) return html || '';
  return html.replace(/<[a-zA-Z][^>]*>/g, (tag) =>
    tag
      .replace(/\s(?:bg)?color\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
      .replace(/\sstyle\s*=\s*("([^"]*)"|'([^']*)')/i, (m, _q, dq, sq) => {
        const { text, dropped } = cleanStyle(dq ?? sq ?? '');
        if (!dropped) return m;
        return text ? ` style="${text.replace(/"/g, '&quot;')}"` : '';
      })
  );
}
