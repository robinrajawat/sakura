/**
 * Pure helpers for table editing (node.tables objects): what a cell's text means as a number or a
 * date, the order "Sort by this column" puts rows in, whether a column is numeric (so it
 * right-aligns automatically), the stored per-column alignment values, and parsing a spreadsheet
 * range copied from Excel / Google Sheets (tab-separated text) into a grid of cell strings.
 *
 * Wired into index.html via scripts/generate-index-blocks.mjs's `tableData` block. Everything that
 * touches the DOM (moving <tr>/<td> elements, reading a pasted HTML table) stays hand-written in
 * index.html next to buildTableEditItems; only the decisions live here so they can be unit tested.
 */

export type TableAlign = 'left' | 'center' | 'right';

const TD_CURRENCY = '$€£¥₹';
// A currency written before or after the number: a sign ("$", "€", "₩"…), a prefixed dollar or yen
// ("CA$", "A$", "R$", "CN¥"), a common local abbreviation ("kr", "kr.", "zł", "Kč", "Fr.", "Rs", "Rp",
// "R", "CFA", "Cg.") or an ISO code ("DKK", "CHF" — checked against the real code list, so "JAN" isn't one).
const TD_CURRENCY_TOKEN = '(?:[A-Z]{1,3}\\$|CN¥|FCFA|F CFA|CFA|CFPF|Cg\\.?|kr\\.?|Kr\\.?|zł|Kč|Fr\\.?|Rs\\.?|Rp|R|[A-Z]{3}|[' + TD_CURRENCY + '₩₪₺₽₫₱฿₦₴₸₡₲₵])';
let tdIsoCodes: Set<string> | null = null;
function tdIsCurrencyToken(tok: string): boolean {
  if (!/^[A-Z]{3}$/.test(tok)) return true;
  if (!tdIsoCodes) {
    try {
      const intl = Intl as unknown as { supportedValuesOf?: (k: string) => string[] };
      tdIsoCodes = new Set(intl.supportedValuesOf ? intl.supportedValuesOf('currency') : []);
    } catch { tdIsoCodes = new Set(); }
  }
  return tdIsoCodes.size === 0 || tdIsoCodes.has(tok);
}

/**
 * A cell's numeric value, or null when the text isn't a plain number. Accepts the shapes people
 * type or paste from spreadsheets: thousands separators ("1,234.5"), a currency sign before or
 * after a sign ("$12", "-$12", "$-12", "12 €", "DKK 1,234.50", "kr 100", "CA$5", "100 zł"), a trailing percent ("12.5%"), accounting-style
 * negatives ("(1,234)"), a Unicode minus, and a k/M/B magnitude suffix ("1.2k"). A percentage is
 * compared by its written number (so "9%" < "10%"), not divided by 100.
 */
export function parseCellNumber(raw: string): number | null {
  let s = String(raw ?? '').replace(/[  ]/g, ' ').trim();
  if (!s) return null;
  s = s.replace(/−/g, '-');
  let negative = false;
  const paren = /^\((.*)\)$/.exec(s);
  if (paren) { negative = true; s = paren[1].trim(); }
  // A sign and a currency can come in either order: "-$5", "$-5", "+€3", "-kr 5", "DKK -5".
  const lead = new RegExp('^([+-]?)\\s*(' + TD_CURRENCY_TOKEN + '?)\\s*([+-]?)\\s*(?=[\\d.])');
  const m = lead.exec(s);
  if (m) {
    if (m[2] && !tdIsCurrencyToken(m[2])) return null;
    if (m[1] && m[3]) return null;
    if (m[1] === '-' || m[3] === '-') negative = !negative;
    s = s.slice(m[0].length);
  }
  const trail = new RegExp('(\\d)\\s*(' + TD_CURRENCY_TOKEN + ')$').exec(s);
  if (trail && !(m && m[2]) && tdIsCurrencyToken(trail[2])) s = s.slice(0, trail.index + 1);
  let pct = false;
  if (/\s*%$/.test(s)) { pct = true; s = s.replace(/\s*%$/, ''); }
  let mult = 1;
  const suf = /^(.*\d)\s*([kKmMbB])$/.exec(s);
  if (suf && !pct) { s = suf[1]; mult = /k/i.test(suf[2]) ? 1e3 : /m/i.test(suf[2]) ? 1e6 : 1e9; }
  if (!/^(?:\d{1,3}(?:,\d{3})+|\d+)?(?:\.\d+)?$/.test(s) || !/\d/.test(s)) return null;
  const n = parseFloat(s.replace(/,/g, '')) * mult;
  if (!Number.isFinite(n)) return null;
  return negative ? -n : n;
}

const TD_MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
function tdMonthIndex(word: string): number {
  const w = word.toLowerCase().replace(/\.$/, '');
  if (w.length < 3) return -1;
  const i = TD_MONTHS.indexOf(w.slice(0, 3));
  if (i < 0) return -1;
  const full = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'][i];
  // "Sept" is common; otherwise the word must be a prefix of the full month name.
  if (!full.startsWith(w) && !(i === 8 && w === 'sept')) return -1;
  return i;
}
function tdValidDay(y: number, mo: number, d: number): boolean {
  if (mo < 0 || mo > 11 || d < 1 || d > 31) return false;
  const dt = new Date(Date.UTC(y, mo, d));
  return dt.getUTCMonth() === mo && dt.getUTCDate() === d;
}

/**
 * A cell's date as a sortable number (UTC milliseconds), or null when it isn't a date. Accepts
 * ISO dates ("2026-10-14", optionally with a time), "2026/10/14", and month-name dates in either
 * order with an optional year and weekday: "Oct 14", "October 14, 2026", "14 Oct", "14 Oct 2026",
 * "Tue, Oct 14", "Oct 2026". A date without a year sorts as if in year 2000 (a leap year, so
 * "Feb 29" stays valid), which keeps a column of "Oct 14"/"Nov 3" style dates in calendar order.
 * Slash dates like 10/14 are deliberately NOT parsed: day/month order differs by locale.
 */
export function parseCellDate(raw: string): number | null {
  const s = String(raw ?? '').trim().replace(/\s+/g, ' ');
  if (!s) return null;
  let m = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[T ](\d{1,2}):(\d{2})(?::(\d{2}))?)?/.exec(s);
  if (m && m[0].length >= s.replace(/(?:Z|[+-]\d{2}:?\d{2})$/, '').length) {
    const y = +m[1], mo = +m[2] - 1, d = +m[3];
    if (!tdValidDay(y, mo, d)) return null;
    return Date.UTC(y, mo, d, m[4] ? +m[4] : 0, m[5] ? +m[5] : 0, m[6] ? +m[6] : 0);
  }
  const t = s.replace(/^(?:mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)[a-z]*\.?,? /i, '');
  // Month first: "Oct 14", "October 14, 2026", "Oct 14th 2026"
  m = /^([A-Za-z]+\.?) (\d{1,2})(?:st|nd|rd|th)?(?:,? (\d{4}))?$/.exec(t);
  if (m) {
    const mo = tdMonthIndex(m[1]); const d = +m[2]; const y = m[3] ? +m[3] : 2000;
    return mo >= 0 && tdValidDay(y, mo, d) ? Date.UTC(y, mo, d) : null;
  }
  // Day first: "14 Oct", "14 October 2026"
  m = /^(\d{1,2})(?:st|nd|rd|th)? ([A-Za-z]+\.?),?(?: (\d{4}))?$/.exec(t);
  if (m) {
    const mo = tdMonthIndex(m[2]); const d = +m[1]; const y = m[3] ? +m[3] : 2000;
    return mo >= 0 && tdValidDay(y, mo, d) ? Date.UTC(y, mo, d) : null;
  }
  // Month and year: "Oct 2026"
  m = /^([A-Za-z]+\.?),? (\d{4})$/.exec(t);
  if (m) {
    const mo = tdMonthIndex(m[1]);
    return mo >= 0 ? Date.UTC(+m[2], mo, 1) : null;
  }
  return null;
}

interface SortKey { rank: number; num: number; text: string }
function tdSortKey(raw: string): SortKey {
  const text = String(raw ?? '').trim();
  if (!text) return { rank: 3, num: 0, text };
  const n = parseCellNumber(text);
  if (n !== null) return { rank: 0, num: n, text };
  const d = parseCellDate(text);
  if (d !== null) return { rank: 1, num: d, text };
  return { rank: 2, num: 0, text };
}
const tdCollator = typeof Intl !== 'undefined'
  ? new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })
  : null;

/**
 * Compares two cell texts for "Sort by this column": numbers (numerically) come before dates
 * (chronologically), which come before other text (natural, case-insensitive order, so "Item 9"
 * < "Item 10"). `direction` -1 reverses the order within that ranking, but empty cells always
 * sort last in both directions so a sort never buries the filled rows under blank ones.
 */
export function compareCellText(a: string, b: string, direction: 1 | -1 = 1): number {
  const ka = tdSortKey(a), kb = tdSortKey(b);
  if (ka.rank === 3 || kb.rank === 3) return ka.rank === kb.rank ? 0 : ka.rank === 3 ? 1 : -1;
  let c: number;
  if (ka.rank !== kb.rank) c = ka.rank - kb.rank;
  else if (ka.rank < 2) c = ka.num === kb.num ? 0 : ka.num < kb.num ? -1 : 1;
  else c = tdCollator ? tdCollator.compare(ka.text, kb.text) : ka.text.localeCompare(kb.text);
  return c * direction;
}

/**
 * The order (as indices into `values`) that sorts rows by those cell texts. Stable: rows whose
 * cells compare equal keep their current relative order, so sorting twice by different columns
 * behaves like a spreadsheet's secondary sort.
 */
export function tableSortOrder(values: string[], direction: 1 | -1 = 1): number[] {
  return values
    .map((v, i) => ({ v, i }))
    .sort((x, y) => compareCellText(x.v, y.v, direction) || x.i - y.i)
    .map((x) => x.i);
}

/**
 * True when a column should right-align automatically: it has at least one non-empty body cell
 * and every non-empty body cell is a number (see parseCellNumber — currency, percent, commas and
 * negatives all count). Header cells are not passed in.
 */
export function isNumericColumn(values: string[]): boolean {
  let seen = false;
  for (const v of values) {
    const t = String(v ?? '').trim();
    if (!t) continue;
    if (parseCellNumber(t) === null) return false;
    seen = true;
  }
  return seen;
}

/** A stored alignment value, or '' when absent/unknown (auto). */
export function normalizeAlign(v: unknown): TableAlign | '' {
  const s = String(v ?? '').trim().toLowerCase();
  return s === 'left' || s === 'center' || s === 'right' ? s : '';
}

/**
 * True when pasted plain text looks like a spreadsheet range rather than ordinary text: it has a
 * tab. Excel and Google Sheets separate a copied range's columns with tabs; ordinary prose
 * practically never contains one.
 */
export function looksLikeSpreadsheetText(text: string): boolean {
  return /\t/.test(String(text ?? ''));
}

/**
 * Parses tab-separated text as Excel / Google Sheets put it on the clipboard: rows end with
 * \n or \r\n, columns are separated by \t, and a cell containing a tab, newline or quote is
 * wrapped in double quotes with inner quotes doubled. The trailing newline spreadsheets add after
 * the last row is dropped, and every row is padded to the widest row's length.
 */
export function parseTsv(text: string): string[][] {
  const src = String(text ?? '').replace(/\r\n?/g, '\n');
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let i = 0;
  let atCellStart = true;
  while (i < src.length) {
    const ch = src[i];
    if (atCellStart && ch === '"') {
      // Quoted cell: runs to the next lone quote.
      let j = i + 1; let val = ''; let closed = false;
      while (j < src.length) {
        if (src[j] === '"') {
          if (src[j + 1] === '"') { val += '"'; j += 2; continue; }
          closed = true; j++; break;
        }
        val += src[j]; j++;
      }
      if (closed && (j >= src.length || src[j] === '\t' || src[j] === '\n')) {
        cell = val; i = j; atCellStart = false; continue;
      }
      // Not a well-formed quoted cell: treat the quote literally.
    }
    if (ch === '\t') { row.push(cell); cell = ''; atCellStart = true; i++; continue; }
    if (ch === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; atCellStart = true; i++; continue; }
    cell += ch; atCellStart = false; i++;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  const width = rows.reduce((w, r) => Math.max(w, r.length), 0);
  return rows.map((r) => r.concat(Array(width - r.length).fill('')));
}

/**
 * How big a table has to become for a pasted grid (`dataRows` × `dataCols`) dropped at
 * (`startRow`, `startCol`) to fit: the current size, grown only where the paste runs past it.
 */
export function gridSizeForPaste(rows: number, cols: number, startRow: number, startCol: number, dataRows: number, dataCols: number): { rows: number; cols: number } {
  return {
    rows: Math.max(rows, startRow + dataRows),
    cols: Math.max(cols, startCol + dataCols)
  };
}

/** Clamps a grid-picker size to 1..max in each direction. */
export function clampGridSize(rows: number, cols: number, max = 8): { rows: number; cols: number } {
  const c = (n: number) => Math.max(1, Math.min(max, Math.round(Number.isFinite(n) ? n : 1)));
  return { rows: c(rows), cols: c(cols) };
}

// ── Display polish (display copies only; the stored table never changes) ──────────────────

/** A cell that shows nothing useful: empty, whitespace, or only quotes (`" "`, `''`). */
export function isBlankCellText(raw: string | null | undefined): boolean {
  return String(raw ?? '').replace(/["'“”‘’\s ]/g, '') === '';
}

/**
 * "Group rows": lengths of the runs of equal consecutive values (trimmed, case-sensitive), in
 * order — ['a','a','b'] → [2, 1]. A blank value never joins a run, so empty cells stay their own
 * rows rather than being merged into one.
 */
export function groupRunLengths(values: string[]): number[] {
  const out: number[] = [];
  let prev: string | null = null;
  for (const raw of values) {
    const v = String(raw ?? '').trim();
    if (out.length && v !== '' && v === prev) out[out.length - 1]++;
    else out.push(1);
    prev = v;
  }
  return out;
}

/** True when grouping would merge anything: some value repeats in consecutive rows. */
export function hasGroupableRuns(values: string[]): boolean {
  return groupRunLengths(values).some(n => n > 1);
}

/**
 * A grouped value shaped like "code (name)" — "2001 (Centrallager Vejen)", "2501 (LC North
 * (Kumla))" — splits into a bold code and a muted name. The code is one short token with a
 * digit in it, so ordinary text with a parenthesis ("Review (draft)") stays whole.
 */
export function splitCodeName(raw: string): { code: string; name: string } | null {
  const m = /^(\S{1,16})\s+\((.+)\)$/.exec(String(raw ?? '').trim());
  if (!m || !/\d/.test(m[1])) return null;
  return { code: m[1], name: m[2].trim() };
}
