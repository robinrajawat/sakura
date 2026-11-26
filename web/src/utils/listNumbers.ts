/**
 * Numbered lists (owner 2026-11-26): a row with `numbered: true` shows its direct children as
 * 1, 2, 3 in place of their dots. One level only, digits only: a grandchild list is numbered
 * only if its own parent is switched on, and starts again at 1. Nothing is written into the
 * rows' text, so moving a row renumbers the list.
 *
 * Shared by the editor, the PDF, Markdown export (the app's and the AI connector's), Markdown
 * import, OPML and copy as text; spliced into index.html by scripts/generate-index-blocks.mjs.
 */

export interface NumberableRow {
  depth: number;
  numbered?: boolean;
}

/**
 * Each row's number in its parent's numbered list, or 0 when its parent isn't numbered (or it has
 * no parent row). Parents are found from depth in list order, so a list that leaves rows out
 * (rows left out of an export, a zoomed-in branch) numbers what it actually shows.
 */
export function computeListNumbers(list: NumberableRow[]): number[] {
  const open: { numbered: boolean; count: number }[] = [];
  return list.map((row) => {
    const depth = Math.max(0, Math.floor(row.depth || 0));
    open.length = Math.min(open.length, depth);
    const parent = depth > 0 ? open[depth - 1] : undefined;
    const n = parent && parent.numbered ? ++parent.count : 0;
    open[depth] = { numbered: !!row.numbered, count: 0 };
    return n;
  });
}

export interface TypedNumberRow extends NumberableRow {
  text: string;
  marks?: { s: number; e: number }[];
}

const TYPED_NUMBER_RE = /^(\d{1,3})[.)][ \t]+/;

/**
 * Repairs lists whose numbers were typed into the words ("1. Warehouse document is created",
 * "2. …"), as an AI draft or a pasted list often has them: when every child of a row (two or
 * more) starts with 1., 2., 3.… in order, the numbers come off the text (formatting marks shift
 * with it) and the parent becomes a numbered list. Anything less regular is left exactly as
 * typed. Changes `list` in place; returns how many lists it repaired.
 */
export function repairTypedNumbers(list: TypedNumberRow[]): number {
  let repaired = 0;
  for (let p = 0; p < list.length; p++) {
    const depth = Math.max(0, Math.floor(list[p].depth || 0));
    const kids: number[] = [];
    for (let i = p + 1; i < list.length; i++) {
      const d = Math.max(0, Math.floor(list[i].depth || 0));
      if (d <= depth) break;
      if (d === depth + 1) kids.push(i);
    }
    if (kids.length < 2) continue;
    const cuts = kids.map((i, k) => {
      const m = TYPED_NUMBER_RE.exec(list[i].text || '');
      return m && Number(m[1]) === k + 1 ? m[0].length : -1;
    });
    if (cuts.some((c) => c < 0)) continue;
    kids.forEach((i, k) => {
      const row = list[i];
      const cut = cuts[k];
      row.text = row.text.slice(cut);
      if (Array.isArray(row.marks)) {
        row.marks = row.marks
          .map((m) => ({ ...m, s: Math.max(0, m.s - cut), e: m.e - cut }))
          .filter((m) => m.e > m.s);
      }
    });
    list[p].numbered = true;
    repaired++;
  }
  return repaired;
}
