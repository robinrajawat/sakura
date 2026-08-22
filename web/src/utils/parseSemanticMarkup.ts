/**
 * Phase 2 slice (docs/framework-migration-plan.md). Matches the CORE subset of legacy's
 * hand-written `parseStyledText` (index.html, never extracted to `src/` — it's DOM-string
 * building, not pure business logic in the sense Phase 1's core/state/utils modules were) —
 * NOT the already-ported `utils/parseInlineSegments.ts`, which is a different tokenizer built
 * for canvas image-export measurement (`measureTreeImage`), a genuinely different consumer
 * with genuinely different needs (visible delimiters kept for width measurement, no
 * `sem-key`/backlink/SAP-note handling). Investigated both before writing this — see this
 * file's own git history / PR description for the real live-DOM CSS classes
 * (`.sem-chip`/`.sem-meta`/`.sem-alert-inline`/`.sem-code-inline`) this was checked against,
 * rather than assuming the already-ported parser was the right fit just because it existed.
 *
 * Deliberately scoped to the four markers documented under "Core Editing" in the README —
 * `[Section]`, `(note)`, `!alert`, `` `code` `` — matching `parseStyledText`'s real behavior
 * for exactly these: delimiters are HIDDEN, only the styled content shows. Explicitly NOT
 * ported here (real features in `parseStyledText`, each its own future slice, not oversights):
 * `[[wiki links]]` (backlinks — a real cross-document feature, not just markup styling),
 * `Decision Log:`/`Context:`/etc. label coloring (decision-log-specific, not general-purpose),
 * `Key:` prefix bolding (`sem-key`), and `SAP Note 12345`/`OSS Note 12345` auto-linking (a
 * narrow, product-specific integration). `>quote` is also NOT in this subset — investigated
 * and confirmed `parseStyledText` itself doesn't handle it either (despite a `.sem-quote` CSS
 * class existing, used by three OTHER call sites: Pad's blockquotes, Preview/Presenter's
 * remark text, and the tree's own dedicated `.node-quote-line` treatment for whole-line
 * quotes — a different, node-level feature, not this inline-marker parser's job).
 *
 * A `[[` is deliberately left untouched (falls through as plain text, not split into `[` +
 * `[` fragments) specifically so text containing a real `[[wiki link]]` doesn't render
 * garbled just because this parser doesn't support links yet — correct-but-incomplete rather
 * than actively wrong.
 */

export type SemanticSegmentType = 'text' | 'code' | 'section' | 'note' | 'alert';

export interface SemanticSegment {
  type: SemanticSegmentType;
  text: string;
}

export function parseSemanticMarkup(text: string | null | undefined): SemanticSegment[] {
  const src = String(text || '');
  const parts: SemanticSegment[] = [];
  let plainStart = 0;
  let i = 0;

  function flushPlain(end: number) {
    if (end > plainStart) {
      parts.push({ type: 'text', text: src.slice(plainStart, end) });
    }
  }

  while (i < src.length) {
    const ch = src[i];

    if (ch === '`') {
      const end = src.indexOf('`', i + 1);
      if (end > i + 1) {
        flushPlain(i);
        parts.push({ type: 'code', text: src.slice(i + 1, end) });
        i = end + 1;
        plainStart = i;
        continue;
      }
    }

    if (ch === '[' && src[i + 1] === '[') {
      // Skip the whole `[[` pair as plain text — advancing past only the first bracket
      // would let the SECOND one start its own (wrong) section match on the next
      // iteration, exactly the garbling this guard exists to prevent.
      i += 2;
      continue;
    }

    if (ch === '[') {
      const end = src.indexOf(']', i + 1);
      if (end > i + 1) {
        flushPlain(i);
        parts.push({ type: 'section', text: src.slice(i + 1, end) });
        i = end + 1;
        plainStart = i;
        continue;
      }
    }

    if (ch === '(') {
      const end = src.indexOf(')', i + 1);
      if (end > i + 1) {
        flushPlain(i);
        parts.push({ type: 'note', text: src.slice(i + 1, end) });
        i = end + 1;
        plainStart = i;
        continue;
      }
    }

    if (ch === '!' && (i === 0 || /\s/.test(src[i - 1]))) {
      let end = i + 1;
      while (end < src.length && !/\s/.test(src[end])) end++;
      if (end > i + 1) {
        flushPlain(i);
        parts.push({ type: 'alert', text: src.slice(i + 1, end) });
        i = end;
        plainStart = i;
        continue;
      }
    }

    i++;
  }
  flushPlain(src.length);
  return parts;
}
