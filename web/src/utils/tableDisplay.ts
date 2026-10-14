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

/** Body rows (header and a typed total row excluded) that hold anything at all. */
function cdBodyRows(grid: string[][]): string[][] {
  const ti = typedTotalRowIndex(grid);
  return grid.slice(1).filter((row, i) => i + 1 !== ti && row.some((c) => !isBlankCellText(c)));
}

function cdColumnCount(grid: string[][]): number {
  return grid.reduce((n, row) => Math.max(n, row.length), 0);
}

/** Cards read a label, a value, an optional change and up to two detail lines: 5 columns at most. */
export const CARDS_MAX_COLUMNS = 5;

/** Whether a column's filled cells read as changes: every one has a direction and at least one is
 * written with a sign or an arrow, so a plain quantity or a date isn't mistaken for one. */
function cdIsChangeColumn(values: string[]): boolean {
  const filled = values.filter((v) => !cdIsPlaceholder(v));
  if (!filled.length) return false;
  const allHaveDirection = filled.every((v) => cardChangeDirection(v, cardValueNumber(v.replace(/^[▲▼↑↓]\s*/, ''))) !== null);
  const anyMarked = filled.some((v) => /^\s*[▲▼↑↓+\-−]/.test(v));
  return allHaveDirection && anyMarked;
}

/**
 * Which column (after the value) holds each card's change: the first one whose cells read as
 * changes (cdIsChangeColumn). -1 when none does. Every other column after the value is a detail line.
 */
export function cardsChangeColumn(grid: string[][]): number {
  const rows = cdBodyRows(grid);
  for (let c = 2; c < cdColumnCount(grid); c++) {
    if (cdIsChangeColumn(rows.map((r) => r[c] ?? ''))) return c;
  }
  return -1;
}

/**
 * Whether a table can show as Cards. A card is label · value, then an optional change pill and
 * detail lines, so the table needs: 2–5 columns; 2–8 rows (a typed total row is not counted toward
 * the 8); and numbers in the second column (at least half its filled cells, see cardValueNumber).
 * Columns after the value need nothing: one written as changes (cardsChangeColumn) becomes the pill,
 * any other (a note, an owner, a quantity) a detail line under the value.
 */
export function cardsAvailability(grid: string[][]): DisplayAvailability {
  const cols = cdColumnCount(grid);
  if (cols < 2 || cols > CARDS_MAX_COLUMNS) {
    return { ok: false, reason: `Cards need 2 to ${CARDS_MAX_COLUMNS} columns: a label, a value, then an optional change and notes. This table has ${cols}.` };
  }
  const rows = cdBodyRows(grid);
  // A typed total row becomes its own total card: it counts toward the minimum, not the maximum.
  const withTotal = rows.length + (typedTotalRowIndex(grid) >= 0 ? 1 : 0);
  if (withTotal < CARDS_MIN_ROWS) return { ok: false, reason: `Cards need at least ${CARDS_MIN_ROWS} rows.` };
  if (rows.length > CARDS_MAX_ROWS) {
    return { ok: false, reason: `Cards fit up to ${CARDS_MAX_ROWS} rows. This table has ${rows.length}, so it reads better as a table or a chart.` };
  }
  const values = rows.map((r) => r[1] ?? '').filter((v) => !cdIsPlaceholder(v));
  const numeric = values.filter((v) => cardValueNumber(v) !== null).length;
  if (!numeric || numeric * 2 < values.length) {
    return { ok: false, reason: 'Cards need numbers in the second column, like 1,240, 12% or 3.2 h.' };
  }
  return { ok: true };
}

export interface CardDetail {
  /** The column's header, shown before the text only when a card has more than one detail column. */
  label: string;
  text: string;
}

export interface CardRow {
  label: string;
  value: string;
  change: string;
  /** One line per detail column with text in this row, in column order. */
  details: CardDetail[];
}

/**
 * The cards a table shows: one per filled body row, label · value · change as written, and a
 * detail line for each other column with text in that row. A detail's label is its column header
 * when the table has two detail columns (so "Owner Ana" and "Due Fri" can be told apart), and empty
 * with one, where the text reads on its own as a note.
 */
export function cardsRows(grid: string[][]): CardRow[] {
  const ci = cardsChangeColumn(grid);
  const detailCols: number[] = [];
  for (let c = 2; c < cdColumnCount(grid); c++) if (c !== ci) detailCols.push(c);
  const head = grid[0] ?? [];
  return cdBodyRows(grid).map((r) => ({
    label: (r[0] ?? '').trim(),
    value: (r[1] ?? '').trim(),
    change: ci >= 0 ? (r[ci] ?? '').trim() : '',
    details: detailCols
      .map((c) => ({ label: detailCols.length > 1 ? (head[c] ?? '').trim() : '', text: (r[c] ?? '').trim() }))
      .filter((d) => !isBlankCellText(d.text))
  }));
}

// ── Total row ───────────────────────────────────────────────────────────────────────────────

/** A first-column label that marks a typed total row: Total, Totals, Sum, Grand total, Subtotal. */
export function isTotalLabel(raw: string): boolean {
  return /^(grand\s+|sub-?\s?)?(total|sum)s?\s*:?$/i.test(String(raw ?? '').trim());
}

/**
 * Grid index of a typed total row: the last body row with anything in it, when its first cell is a
 * total label (isTotalLabel). -1 when there is none.
 */
export function typedTotalRowIndex(grid: string[][]): number {
  for (let i = grid.length - 1; i >= 1; i--) {
    const row = grid[i];
    if (!row.some((c) => !isBlankCellText(c))) continue;
    return isTotalLabel(row[0] ?? '') ? i : -1;
  }
  return -1;
}

export interface ColumnSum {
  value: number;
  /** Written like the column's own values: same prefix/unit, decimals and thousands separators. */
  text: string;
}

/**
 * The sum of a column's values, written the way the column writes them ("15 days" + "3 days" →
 * "18 days", "DKK 500.00" × 3 → "DKK 1,500.00"). Null when the column isn't a number column: no
 * numbers, any text that isn't a number (placeholders like n/a and dashes are skipped), values with
 * different units, percentages (a sum of percentages is rarely meant), or k/M/B shorthand.
 */
export function sumColumn(values: string[]): ColumnSum | null {
  const filled = values.map((v) => String(v ?? '').trim()).filter((v) => !cdIsPlaceholder(v));
  if (!filled.length) return null;
  const NUM = /^(.*?)([+\-−]?\(?\d[\d,]*(?:\.(\d+))?\)?)(.*)$/;
  // A word unit compares without a plural "s", so "1 day" and "5 days" add up.
  const unitKey = (u: string) => u.trim().toLowerCase().replace(/^([a-zµ°]+?)s$/, '$1');
  let total = 0;
  let decimals = 0;
  let grouped = false;
  let shape: string | null = null;
  let prefix = '';
  const suffixes: string[] = [];
  for (const v of filled) {
    const n = cardValueNumber(v);
    if (n === null) return null;
    const m = NUM.exec(v);
    if (!m) return null;
    const pre = m[1].replace(/[+\-−]\s*$/, '');
    const suf = m[4];
    if (/%/.test(suf) || /^\s*[kmb]\b/i.test(suf)) return null;
    const key = pre.trim().toLowerCase() + '|' + unitKey(suf);
    if (shape === null) { shape = key; prefix = pre; }
    else if (shape !== key) return null;
    suffixes.push(suf);
    decimals = Math.max(decimals, m[3] ? m[3].length : 0);
    if (/\d,\d{3}/.test(m[2])) grouped = true;
    total += n;
  }
  // Singular unit for exactly 1, plural otherwise, when the column shows both forms.
  const plural = suffixes.find((x) => /[a-z]s\s*$/i.test(x));
  const singular = suffixes.find((x) => !/[a-z]s\s*$/i.test(x));
  const suffix = (total === 1 ? singular : plural) ?? suffixes[0];
  const abs = Math.abs(total).toFixed(decimals);
  const [int, frac] = abs.split('.');
  const intText = grouped || Math.abs(total) >= 10000 ? int.replace(/\B(?=(\d{3})+(?!\d))/g, ',') : int;
  const num = (total < 0 ? '−' : '') + intText + (frac ? '.' + frac : '');
  return { value: total, text: prefix + num + suffix };
}

export interface TotalRow {
  /** One entry per column: column 0 is "Total", the others the column's sum text or ''. */
  cells: string[];
  /** Whether any column could be added up at all. */
  any: boolean;
  /** Per column, the computed sum (null where the column isn't a number column). */
  sums: (ColumnSum | null)[];
}

/**
 * The calculated total row for a table: every column after the first that is a number column
 * (sumColumn) gets its sum; a typed total row, if there is one, is left out of the sums.
 */
export function computeTotalRow(grid: string[][]): TotalRow {
  const cols = cdColumnCount(grid);
  const skip = typedTotalRowIndex(grid);
  const rows = grid.slice(1).filter((r, i) => i + 1 !== skip && r.some((c) => !isBlankCellText(c)));
  const sums: (ColumnSum | null)[] = [null];
  for (let c = 1; c < cols; c++) sums.push(sumColumn(rows.map((r) => r[c] ?? '')));
  return { cells: sums.map((s, c) => (c === 0 ? 'Total' : s ? s.text : '')), any: sums.some((s) => s !== null), sums };
}

/**
 * Where a typed total row disagrees with what its rows add up to: one entry per number column whose
 * typed value differs from the calculated sum (beyond rounding). Empty when there is no typed total
 * row or it is right.
 */
export function totalRowMismatches(grid: string[][]): { col: number; typed: string; computed: string }[] {
  const ti = typedTotalRowIndex(grid);
  if (ti < 0) return [];
  const { sums } = computeTotalRow(grid);
  const out: { col: number; typed: string; computed: string }[] = [];
  sums.forEach((s, c) => {
    if (!s) return;
    const typed = (grid[ti][c] ?? '').trim();
    const tv = cardValueNumber(typed);
    if (tv === null || Math.abs(tv - s.value) > 1e-9 * Math.max(1, Math.abs(s.value))) out.push({ col: c, typed, computed: s.text });
  });
  return out;
}

/**
 * The highlighted total card Cards show after the others: the calculated sum of the value column
 * when the table has a calculated total row (`calculated`), else a typed total row as written.
 * Null when there is neither (or the value column can't be added up).
 */
export function cardsTotal(grid: string[][], calculated: boolean): CardRow | null {
  if (calculated) {
    const s = computeTotalRow(grid).sums[1];
    return s ? { label: 'Total', value: s.text, change: '', details: [] } : null;
  }
  const ti = typedTotalRowIndex(grid);
  if (ti < 0) return null;
  const r = grid[ti];
  const ci = cardsChangeColumn(grid);
  return { label: (r[0] ?? '').trim(), value: (r[1] ?? '').trim(), change: ci >= 0 ? (r[ci] ?? '').trim() : '', details: [] };
}
