import { stripSemanticMarkers } from './stripSemanticMarkers';

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
 * Deliberately scoped to the five markers documented under "Core Editing" in the README --
 * `[Section]`, `(note)`, `!alert`, `` `code` ``, `[[wiki link]]` -- matching `parseStyledText`'s
 * real behavior for exactly these: delimiters are HIDDEN, only the styled content shows.
 * `[[wiki links]]` was added in the Phase 6.3 backlinks-groundwork slice (see
 * `core/backlinks.ts`'s own header for the query-layer half of that work) -- previously excluded
 * here with a header note calling it out as "a real cross-document feature, not just markup
 * styling," which is still true of the *panel* (Note panel Backlinks section, `@`-mention
 * picker, cleanup/rename wiring); rendering the existing markup as a clickable span, which is
 * all this file does, turned out to be exactly this parser's job after all once the groundwork
 * existed. The `link` segment's `text` is the DISPLAY text (matching legacy's own `parseStyledText`:
 * the raw reference gets its own semantic markers stripped for display, via the already-ported
 * `stripSemanticMarkers` -- close to but not byte-identical to `parseStyledText`'s own inline
 * regex chain for this specific sub-case, since that regex is legacy's OWN duplicate of the same
 * idea rather than a call to its own `stripSemanticMarkers` equivalent; not worth diverging from
 * the DRY, already-shared utility over a difference that only bites on the near-nonexistent case
 * of a wikilink target itself containing another marker); `target` carries the raw reference
 * text unstripped, for lookup against `core/backlinks.ts`'s `getBacklinksTo`/node-text matching.
 * Still explicitly NOT ported here (real features in `parseStyledText`, each its own future
 * slice, not oversights): `Decision Log:`/`Context:`/etc. label coloring (decision-log-specific,
 * not general-purpose), `Key:` prefix bolding (`sem-key`), and `SAP Note 12345`/`OSS Note 12345`
 * auto-linking (a narrow, product-specific integration). `>quote` is also NOT in this subset --
 * investigated and confirmed `parseStyledText` itself doesn't handle it either (despite a
 * `.sem-quote` CSS class existing, used by three OTHER call sites: Pad's blockquotes,
 * Preview/Presenter's remark text, and the tree's own dedicated `.node-quote-line` treatment for
 * whole-line quotes -- a different, node-level feature, not this inline-marker parser's job).
 */

export type SemanticSegmentType = 'text' | 'code' | 'section' | 'note' | 'alert' | 'link';

export interface SemanticSegment {
  type: SemanticSegmentType;
  text: string;
  /** Only set for `link` segments -- the raw, unstripped reference text between `[[` and `]]`,
   * for lookup against `getBacklinksTo`/node-text matching. `text` itself is the display text. */
  target?: string;
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
      // Same lazy-close-not-followed-by-] scan as core/backlinks.ts's getBacklinkRefs, so a
      // [[[triple]]] bracket run resolves identically in both places.
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
        const target = src.slice(i + 2, end);
        flushPlain(i);
        parts.push({ type: 'link', text: stripSemanticMarkers(target).trim() || target, target });
        i = end + 2;
        plainStart = i;
        continue;
      }
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
