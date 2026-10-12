/**
 * Pure helpers for featured tables shown as charts or Cards: round ("nice") value-axis ticks,
 * axis/tooltip number formatting with thousands separators, how many columns a Cards grid uses so
 * its rows come out balanced, and which way a Cards "change" value points.
 *
 * Wired into index.html via scripts/generate-index-blocks.mjs's `chartFormat` block. The SVG and
 * HTML builders (renderCartesianChartSvg, renderCardsHtml) stay hand-written in index.html; only
 * the decisions live here so they can be unit tested.
 */

export interface AxisScale {
  min: number;
  max: number;
  step: number;
  ticks: number[];
}

/** 1, 2, 2.5 or 5 times a power of ten — the smallest of those that is at least `rough`. */
function niceStep(rough: number): number {
  if (!(rough > 0) || !Number.isFinite(rough)) return 1;
  const pow = Math.pow(10, Math.floor(Math.log10(rough)));
  const f = rough / pow;
  const m = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
  return m * pow;
}

/**
 * A value axis that covers [dataMin, dataMax] with round tick values ("0, 50, 100, 150" rather
 * than "0, 37.5, 75, 112.5"). The axis always includes 0, so bars start at the baseline; about
 * `target` intervals are used. An all-zero or empty range still gets a usable 0..1 axis.
 */
export function niceAxisScale(dataMin: number, dataMax: number, target = 4): AxisScale {
  let lo = Math.min(0, Number.isFinite(dataMin) ? dataMin : 0);
  let hi = Math.max(0, Number.isFinite(dataMax) ? dataMax : 0);
  if (lo === hi) hi = lo + 1;
  const step = niceStep((hi - lo) / Math.max(1, target));
  lo = Math.floor(lo / step) * step;
  hi = Math.ceil(hi / step) * step;
  const ticks: number[] = [];
  const count = Math.round((hi - lo) / step);
  for (let i = 0; i <= count; i++) ticks.push(roundTo(lo + i * step, step));
  return { min: ticks[0], max: ticks[ticks.length - 1], step, ticks };
}

/** Removes floating-point noise (0.30000000000000004) at the precision `step` implies. */
function roundTo(v: number, step: number): number {
  const decimals = Math.max(0, Math.min(10, -Math.floor(Math.log10(step)) + 1));
  const r = Number(v.toFixed(decimals));
  return r === 0 ? 0 : r;
}

/**
 * A number for an axis label or tooltip: thousands separators up to a million ("12,500"),
 * compact above that ("1.2M", "3B"), at most two decimals, no trailing zeros.
 */
export function formatChartNumber(v: number): string {
  if (!Number.isFinite(v)) return '';
  const abs = Math.abs(v);
  const sign = v < 0 ? '-' : '';
  const trim = (n: number, d: number) => String(Number(n.toFixed(d)));
  if (abs >= 1e9) return sign + trim(abs / 1e9, 1) + 'B';
  if (abs >= 1e6) return sign + trim(abs / 1e6, 1) + 'M';
  const fixed = trim(abs, abs >= 100 ? 0 : 2);
  const [int, frac] = fixed.split('.');
  return sign + int.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (frac ? '.' + frac : '');
}

/**
 * How many columns a Cards grid uses for `n` cards so every row is (nearly) full: up to four in a
 * row, otherwise the fewest rows of at most four, spread evenly — 5 → 3+2, 6 → 3+3, 7 → 4+3,
 * 8 → 4+4, never 3+1.
 */
export function cardsGridColumns(n: number): number {
  if (!(n > 0)) return 1;
  if (n <= 4) return n;
  const rows = Math.ceil(n / 4);
  return Math.ceil(n / rows);
}

export type ChangeDirection = 'up' | 'down' | 'flat';

/**
 * Which way a Cards "change" cell points: an explicit ▲/▼/↑/↓ or a leading +/− decides; otherwise
 * the sign of its number (`parsed`, from parseCellNumber) does. Zero is flat. Text with no number
 * and no arrow (e.g. "n/a") has no direction (null) and is shown as written.
 */
export function cardChangeDirection(raw: string, parsed: number | null): ChangeDirection | null {
  const s = String(raw ?? '').trim();
  if (!s) return null;
  if (/^[▲↑]/.test(s)) return 'up';
  if (/^[▼↓]/.test(s)) return 'down';
  if (parsed === null || !Number.isFinite(parsed)) return null;
  if (parsed > 0) return 'up';
  if (parsed < 0) return 'down';
  return 'flat';
}

/** A change cell's text without a leading arrow or sign, since the arrow shows the direction. */
export function cardChangeText(raw: string): string {
  return String(raw ?? '').trim().replace(/^[▲▼↑↓]\s*/, '').replace(/^[+\-−]\s*/, '');
}
