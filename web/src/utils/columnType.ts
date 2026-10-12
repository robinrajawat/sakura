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

/** Currencies offered in the menu, in order: ISO code → menu label. */
export const COLUMN_CURRENCIES: Record<string, string> = {
  EUR: '€ Euro',
  USD: '$ US dollar',
  GBP: '£ British pound',
  INR: '₹ Indian rupee',
  JPY: '¥ Japanese yen'
};

/**
 * A number written as currency: symbol first, thousands separators, the currency's usual decimals
 * ("€1,234.50", "-$12.00", "¥1,500"). Always en-US punctuation, so the result still reads back as
 * a number (parseCellNumber) for charts, sorting and progress bars. Unknown codes fall back to EUR.
 */
export function formatCurrency(n: number, code: string): string {
  if (!Number.isFinite(n)) return '';
  const cur = COLUMN_CURRENCIES[code] ? code : 'EUR';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: cur, currencyDisplay: 'narrowSymbol' }).format(n);
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
