/**
 * Trims a style sheet down to the rules a given page can use, keeping each kept rule's original
 * text byte for byte (so nothing is re-serialised by a browser that might drop what it doesn't
 * understand). Used for Download PDF's server copy, which used to carry every style in the app
 * (~340 KB) up to the Worker; the printed page needs a small part of it.
 *
 * Conservative by design — a rule is kept unless it clearly can't apply:
 * - @font-face, @page, @keyframes, @import, @charset, @property, @counter-style, @namespace and any
 *   unknown at-rule: always kept.
 * - @media, @supports, @layer, @container: kept around whatever inside them is kept.
 * - Style rules: kept when any selector in the list matches something on the page (`matches`),
 *   after removing pseudo-elements and state-only pseudo-classes (:hover, ::before…); kept too
 *   when a selector can't be tested (`matches` throws).
 */
export type SelectorMatcher = (selector: string) => boolean;

interface Block { prelude: string; body: string | null; text: string }

/** Splits CSS text into top-level rules, honouring strings, comments and nested braces. */
export function splitCssRules(css: string): Block[] {
  const out: Block[] = [];
  let i = 0;
  const n = css.length;
  while (i < n) {
    // skip whitespace and comments between rules
    while (i < n) {
      if (/\s/.test(css[i])) { i++; continue; }
      if (css.startsWith('/*', i)) { const e = css.indexOf('*/', i + 2); i = e < 0 ? n : e + 2; continue; }
      break;
    }
    if (i >= n) break;
    const start = i;
    let depth = 0, bodyStart = -1, quote = '';
    while (i < n) {
      const c = css[i];
      if (quote) { if (c === '\\') i++; else if (c === quote) quote = ''; i++; continue; }
      if (c === '"' || c === "'") { quote = c; i++; continue; }
      if (css.startsWith('/*', i)) { const e = css.indexOf('*/', i + 2); i = e < 0 ? n : e + 2; continue; }
      if (c === '{') { if (depth === 0) bodyStart = i; depth++; i++; continue; }
      if (c === '}') { depth--; i++; if (depth === 0) break; continue; }
      if (c === ';' && depth === 0) { i++; break; }
      i++;
    }
    const text = css.slice(start, i);
    if (bodyStart < 0) out.push({ prelude: text.trim(), body: null, text });
    else out.push({ prelude: css.slice(start, bodyStart).trim(), body: css.slice(bodyStart + 1, i - 1), text });
  }
  return out;
}

/** Splits a selector list at top-level commas (not inside :is(), [attr="a,b"] or strings). */
export function splitSelectorList(prelude: string): string[] {
  const out: string[] = [];
  let depth = 0, quote = '', cur = '';
  for (let k = 0; k < prelude.length; k++) {
    const c = prelude[k];
    if (quote) { cur += c; if (c === '\\') { cur += prelude[++k] ?? ''; } else if (c === quote) quote = ''; continue; }
    if (c === '"' || c === "'") { quote = c; cur += c; continue; }
    if (c === '(' || c === '[') depth++;
    if (c === ')' || c === ']') depth--;
    if (c === ',' && depth === 0) { out.push(cur.trim()); cur = ''; continue; }
    cur += c;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

const STATE_PSEUDO = /::?(?:before|after|placeholder|selection|marker|first-line|first-letter|backdrop|file-selector-button|-webkit-[a-z-]+|-moz-[a-z-]+)|:(?:hover|focus-visible|focus-within|focus|active|visited|link|any-link|target|checked|disabled|enabled|placeholder-shown|indeterminate|default|invalid|valid|in-range|out-of-range|required|optional|read-only|read-write|autofill|user-invalid|user-valid|open|popover-open|modal|fullscreen|playing|paused)\b(?!\()/g;

/** The part of a selector that can be tested against a static page (states and pseudo-elements removed). */
export function testableSelector(sel: string): string {
  let s = sel.replace(STATE_PSEUDO, '').trim();
  s = s.replace(/[>+~]\s*$/, '').trim();
  return s || '*';
}

const KEEP_WHOLE = /^@(font-face|page|keyframes|-webkit-keyframes|import|charset|property|counter-style|namespace|font-feature-values|view-transition)\b/i;
const RECURSE = /^@(media|supports|layer|container|document|-moz-document|scope|starting-style)\b/i;

export function trimCss(css: string, matches: SelectorMatcher): string {
  const kept: string[] = [];
  for (const r of splitCssRules(css)) {
    if (r.prelude.startsWith('@')) {
      if (r.body === null || KEEP_WHOLE.test(r.prelude) || !RECURSE.test(r.prelude)) { kept.push(r.text); continue; }
      const inner = trimCss(r.body, matches);
      if (inner.trim() || /^@layer\b/i.test(r.prelude)) kept.push(r.prelude + '{' + inner + '}');
      continue;
    }
    if (r.body === null) continue; // stray text
    const used = splitSelectorList(r.prelude).some((sel) => {
      try { return matches(testableSelector(sel)); } catch { return true; }
    });
    if (used) kept.push(r.text);
  }
  return kept.join('\n');
}
