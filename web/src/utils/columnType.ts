/**
 * Column types for tables (cell menu → Column type ›): a column can be set to Text, Number,
 * Currency, Date or Status instead of the default automatic detection. Stored as data-type (and
 * data-currency) on every cell of the column, like data-align. These are the pure parts: the
 * type names, the offered currencies, how a currency value is written, and how a picked date is
 * written so it matches the column's existing dates.
 *
 * Wired into index.html via scripts/generate-index-blocks.mjs's `columnType` block.
 */

export type ColumnType = 'text' | 'number' | 'currency' | 'date' | 'status';

export const COLUMN_TYPES: ColumnType[] = ['text', 'number', 'currency', 'date', 'status'];

/** A stored data-type value, or '' (automatic) for anything unknown. */
export function normalizeColumnType(v: string | null | undefined): ColumnType | '' {
  const s = String(v ?? '').trim().toLowerCase();
  return (COLUMN_TYPES as string[]).includes(s) ? (s as ColumnType) : '';
}

/** The currencies listed in the menu before any has been used (most recent ones go first after). */
export const DEFAULT_MENU_CURRENCIES = ['EUR', 'USD', 'GBP', 'INR', 'JPY'];
/** How many currencies the Column type menu lists directly; the rest are under "More currencies…". */
export const MENU_CURRENCY_COUNT = 5;

/** Every ISO 4217 code the browser knows (Intl), or the defaults where it can't list them. */
export function allCurrencyCodes(): string[] {
  try {
    const intl = Intl as unknown as { supportedValuesOf?: (k: string) => string[] };
    const list = intl.supportedValuesOf ? intl.supportedValuesOf('currency') : [];
    return list.length ? list : [...DEFAULT_MENU_CURRENCIES];
  } catch { return [...DEFAULT_MENU_CURRENCIES]; }
}

let knownCodes: Set<string> | null = null;
/** Whether `code` is a real ISO 4217 currency (any well-formed code where the browser can't list them). */
export function isCurrencyCode(code: string): boolean {
  if (!/^[A-Z]{3}$/.test(String(code ?? ''))) return false;
  if (!knownCodes) knownCodes = new Set(allCurrencyCodes());
  return knownCodes.size <= DEFAULT_MENU_CURRENCIES.length || knownCodes.has(code);
}

/** A currency's English name ("Danish Krone"), or the code itself if the browser has none. */
export function currencyName(code: string): string {
  try {
    const DN = (Intl as unknown as { DisplayNames?: new (l: string[], o: { type: string }) => { of(c: string): string | undefined } }).DisplayNames;
    return (DN && new DN(['en'], { type: 'currency' }).of(code)) || code;
  } catch { return code; }
}

/** The sign or code a currency is written with ("€", "CA$", "DKK"). */
export function currencySymbol(code: string): string {
  const s = formatCurrency(0, code);
  return s.replace(/[\d.,\s]+$/, '').trim() || code;
}

/**
 * The currencies the Column type menu lists: the column's current one, then recently used ones,
 * then the defaults, without repeats, up to MENU_CURRENCY_COUNT.
 */
export function menuCurrencies(recent: string[], current = ''): string[] {
  const out: string[] = [];
  [current, ...recent, ...DEFAULT_MENU_CURRENCIES].forEach((c) => {
    if (c && isCurrencyCode(c) && !out.includes(c) && out.length < MENU_CURRENCY_COUNT) out.push(c);
  });
  return out;
}

/** `recent` with `code` moved to the front, at most `max` long. */
export function pushRecentCurrency(recent: string[], code: string, max = 8): string[] {
  return [code, ...recent.filter((c) => c !== code)].slice(0, max);
}

/**
 * Whether a currency matches what was typed in the picker's search: the code, its name or its
 * symbol, ignoring case ("dkk", "danish", "kr" all find DKK; "dollar" finds every dollar).
 */
export function currencyMatches(code: string, query: string): boolean {
  const q = String(query ?? '').trim().toLowerCase();
  if (!q) return true;
  return code.toLowerCase().includes(q) || currencyName(code).toLowerCase().includes(q) || currencySymbol(code).toLowerCase() === q;
}

/**
 * A number written as currency: the currency's sign or code first, thousands separators, its usual
 * decimals ("€1,234.50", "-$12.00", "¥1,500", "DKK 1,234.50", "CA$5.00"). Always en-US punctuation,
 * so the result still reads back as a number (parseCellNumber) for charts, sorting and progress
 * bars. Unknown codes fall back to EUR.
 */
export function formatCurrency(n: number, code: string): string {
  if (!Number.isFinite(n)) return '';
  const cur = isCurrencyCode(code) ? code : 'EUR';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: cur }).format(n);
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * A picked date (UTC midnight) written in the column's own style: like "Oct 14, 2026" when the
 * column's first written date (`sample`) starts with a letter, otherwise ISO "2026-10-14".
 */
export function formatColumnDate(utc: number, sample = ''): string {
  const d = new Date(utc);
  const y = d.getUTCFullYear(), m = d.getUTCMonth(), day = d.getUTCDate();
  if (/^[A-Za-z]/.test(String(sample).trim())) return `${MONTHS[m]} ${day}, ${y}`;
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}
