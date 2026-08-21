/**
 * Image export — first slice. `parseInlineSegments` is the one genuinely pure piece of
 * "canvas-dependent" image export: everything around it (`measureTreeImage`, `exportTreeAsImage`,
 * `getImageExportColors`) genuinely touches `document.createElement('canvas')`/`getContext`/
 * `getComputedStyle` directly, but this function itself is plain string parsing with zero DOM
 * dependency — investigated before assuming the whole "canvas-dependent" label applied uniformly,
 * per this project's own "investigate before assuming" lesson, and it didn't.
 *
 * Splits one node's text into typed inline segments for the tree-image renderer: an inline
 * `` `code` ``/`[section]`/`(note)` span anywhere in the text, a `>quote` or `!alert` token when
 * it starts the text or follows whitespace, a `[[wiki link]]` span, and everything else as plain
 * `text` — the same semantic-marker syntax the editor and clipboard export both recognize,
 * parsed here purely for measurement/rendering rather than HTML color styling (see
 * `parseStyledTextForClipboardCore` in `serializeClipboardHtml.ts` for that sibling parser — the
 * two aren't merged since one returns typed segments for canvas layout and the other returns
 * ready-made HTML spans, genuinely different output shapes for genuinely different consumers).
 *
 * Single real call site (`measureTreeImage`), but substantial enough — real branching structure
 * across seven segment types — to be worth its own tested module rather than staying
 * hand-written the way `decisionRowSnippet`'s four trivial lines did.
 */

export type InlineSegmentType = 'link' | 'code' | 'section' | 'note' | 'quote' | 'alert' | 'text';

export interface InlineSegment {
  type: InlineSegmentType;
  text: string;
}

/** Pure: matches index.html's own `parseInlineSegments` exactly. */
export function parseInlineSegmentsCore(text: string | null | undefined): InlineSegment[] {
  const src = String(text || '');
  const parts: InlineSegment[] = [];
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (ch === '[' && src[i + 1] === '[') {
      let end = -1;
      let searchFrom = i + 2;
      while (searchFrom < src.length - 1) {
        const p = src.indexOf(']]', searchFrom);
        if (p < 0) break;
        if (p + 2 >= src.length || src[p + 2] !== ']') {
          end = p;
          break;
        }
        searchFrom = p + 1;
      }
      if (end > i + 2) {
        parts.push({ type: 'link', text: src.slice(i + 2, end) });
        i = end + 2;
        continue;
      }
    }
    if (ch === '`') {
      const end = src.indexOf('`', i + 1);
      if (end > i + 1) {
        parts.push({ type: 'code', text: src.slice(i + 1, end) });
        i = end + 1;
        continue;
      }
    }
    if (ch === '[') {
      const end = src.indexOf(']', i + 1);
      if (end > i + 1) {
        parts.push({ type: 'section', text: src.slice(i + 1, end) });
        i = end + 1;
        continue;
      }
    }
    if (ch === '(') {
      const end = src.indexOf(')', i + 1);
      if (end > i + 1) {
        parts.push({ type: 'note', text: src.slice(i + 1, end) });
        i = end + 1;
        continue;
      }
    }
    if (ch === '>' && (i === 0 || /\s/.test(src[i - 1]))) {
      parts.push({ type: 'quote', text: src.slice(i + 1).trimStart() });
      break;
    }
    if (ch === '!' && (i === 0 || /\s/.test(src[i - 1]))) {
      let end = i + 1;
      while (end < src.length && !/\s/.test(src[end])) end++;
      if (end > i + 1) {
        parts.push({ type: 'alert', text: src.slice(i + 1, end) });
        i = end;
        continue;
      }
    }
    let j = i + 1;
    while (j < src.length) {
      const c = src[j];
      const alertStart = c === '!' && /\s/.test(src[j - 1]);
      const quoteStart = c === '>' && /\s/.test(src[j - 1]);
      if (c === '`' || c === '[' || c === '(' || alertStart || quoteStart) break;
      j++;
    }
    parts.push({ type: 'text', text: src.slice(i, j) });
    i = j;
  }
  return parts.filter((p) => p.text);
}
