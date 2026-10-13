/**
 * Which displays fit a table (Show as ›), decided from the table's cell text alone so the rules
 * can be unit tested. A table is passed as a grid of trimmed cell strings, header row first —
 * index.html's tableTextGrid builds it from a <table>. Each rule returns {ok, reason}; the menu
 * disables an unfit display with the reason as its tooltip, and a table already set to a display
 * that no longer fits (after an edit) shows as a plain table.
 *
 * So far this holds Cards; the other displays' rules still live in index.html.
 *
 * Wired into index.html via scripts/generate-index-blocks.mjs's `tableDisplay` block.
 */

import { parseCellNumber, isBlankCellText } from './tableData';
import { cardChangeDirection } from './chartFormat';

export interface DisplayAvailability {
  ok: boolean;
  reason?: string;
}

/** Fewer than this many rows is not worth a grid of cards. */
export const CARDS_MIN_ROWS = 2;
/** More than this many cards reads worse than the table itself. */
export const CARDS_MAX_ROWS = 8;

/** Cell text that means "no value": n/a, a dash, TBD, a question mark. */
function cdIsPlaceholder(raw: string): boolean {
  return isBlankCellText(raw) || /^(n\/?a|tbd|tbc|[-–—?])$/i.test(String(raw ?? '').trim());
}

/**
 * A card value's number, or null when it isn't one. On top of parseCellNumber's shapes (currency,
 * %, k/M/B), allows a leading comparator and a one-word unit, since a headline figure is often
 * written that way: "<2 s", "~40", "3.2 h", "6 days", "≥ 99.9%".
 */
export function cardValueNumber(raw: string): number | null {
  const direct = parseCellNumber(raw);
  if (direct !== null) return direct;
  const s = String(raw ?? '').trim().replace(/^[<>≤≥~≈]\s*/, '');
  const unit = /^(.*\d%?)\s*[A-Za-zµ°]{1,12}\.?$/.exec(s);
  return parseCellNumber(unit ? unit[1] : s);
}

/** Body rows (header excluded) that hold anything at all. */
function cdBodyRows(grid: string[][]): string[][] {
  return grid.slice(1).filter((row) => row.some((c) => !isBlankCellText(c)));
}

function cdColumnCount(grid: string[][]): number {
  return grid.reduce((n, row) => Math.max(n, row.length), 0);
}

/**
 * Whether a table can show as Cards. A card is label · value · optional change, so the table needs:
 * 2 or 3 columns; 2–8 rows; numbers in the second column (at least half its filled cells, see
 * cardValueNumber); and, with a third column, changes in it — every filled cell has a direction
 * (cardChangeDirection) and at least one is written with a sign or an arrow, so a plain quantity
 * or a text column (Owner, Notes) isn't mistaken for one. n/a, dashes and empty cells are allowed
 * in both the value and the change column.
 */
export function cardsAvailability(grid: string[][]): DisplayAvailability {
  const cols = cdColumnCount(grid);
  if (cols !== 2 && cols !== 3) {
    return { ok: false, reason: `Cards need 2 or 3 columns: a label, a value and an optional change. This table has ${cols}.` };
  }
  const rows = cdBodyRows(grid);
  if (rows.length < CARDS_MIN_ROWS) return { ok: false, reason: `Cards need at least ${CARDS_MIN_ROWS} rows.` };
  if (rows.length > CARDS_MAX_ROWS) {
    return { ok: false, reason: `Cards fit up to ${CARDS_MAX_ROWS} rows. This table has ${rows.length}, so it reads better as a table or a chart.` };
  }
  const values = rows.map((r) => r[1] ?? '').filter((v) => !cdIsPlaceholder(v));
  const numeric = values.filter((v) => cardValueNumber(v) !== null).length;
  if (!numeric || numeric * 2 < values.length) {
    return { ok: false, reason: 'Cards need numbers in the second column, like 1,240, 12% or 3.2 h.' };
  }
  if (cols === 3) {
    const changes = rows.map((r) => r[2] ?? '').filter((v) => !cdIsPlaceholder(v));
    const allHaveDirection = changes.every((v) => cardChangeDirection(v, cardValueNumber(v.replace(/^[▲▼↑↓]\s*/, ''))) !== null);
    const anyMarked = changes.some((v) => /^\s*[▲▼↑↓+\-−]/.test(v));
    if (changes.length && !(allHaveDirection && anyMarked)) {
      return { ok: false, reason: 'The third column must hold changes written with a sign or an arrow (+12%, −3, ▲ 4), or be left empty.' };
    }
  }
  return { ok: true };
}

export interface CardRow {
  label: string;
  value: string;
  change: string;
}

/** The cards a table shows: one per filled body row, label · value · change as written. */
export function cardsRows(grid: string[][]): CardRow[] {
  const hasChange = cdColumnCount(grid) === 3;
  return cdBodyRows(grid).map((r) => ({
    label: (r[0] ?? '').trim(),
    value: (r[1] ?? '').trim(),
    change: hasChange ? (r[2] ?? '').trim() : ''
  }));
}
