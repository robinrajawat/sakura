/**
 * Pure helpers for featured tables shown as charts, Cards or progress bars, and for heat-map
 * shading: round ("nice") value-axis ticks, axis/tooltip number formatting with thousands
 * separators, how many columns a Cards grid uses so its rows come out balanced, which way a Cards
 * "change" value points, a progress bar's fill, a numeric column's heat-map levels, and a timeline's
 * row order and past / next / upcoming phases, and a status board's lanes.
 *
 * Wired into index.html via scripts/generate-index-blocks.mjs's `chartFormat` block. The SVG and
 * HTML builders (renderCartesianChartSvg, renderCardsHtml, renderStatusBoardHtml) stay hand-written in index.html; only
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

/**
 * Whether a progress column holds fractions (0.62) rather than percentages (62): every number is
 * between 0 and 1 and at least one has a decimal part. "1" alone stays 1%.
 */
export function valuesLookLikeFractions(values: (number | null)[]): boolean {
  const nums = values.filter((v): v is number => v !== null && Number.isFinite(v));
  return nums.length > 0 && nums.every((v) => v >= 0 && v <= 1) && nums.some((v) => !Number.isInteger(v));
}

/**
 * A progress bar's fill, 0–100 (clamped), from a row's value and optional target: value ÷ target
 * when a target is given, otherwise the value itself as a percentage (×100 when the column holds
 * fractions). Null when there is nothing to show (no number, or a zero/negative target).
 */
export function progressPercent(value: number | null, target: number | null, fractions = false): number | null {
  if (value === null || !Number.isFinite(value)) return null;
  let pct: number;
  if (target !== null) {
    if (!Number.isFinite(target) || target <= 0) return null;
    pct = (value / target) * 100;
  } else {
    pct = fractions ? value * 100 : value;
  }
  return Math.max(0, Math.min(100, pct));
}

/**
 * Heat-map shading for one column: each number gets a level 1..`steps` by where it sits between
 * the column's lowest and highest value (level `steps` = highest, or lowest when `reverse`, for
 * columns where less is better). Cells without a number get null, and so does every cell when the
 * column has fewer than two distinct values (nothing to compare).
 */
export function heatLevels(values: (number | null)[], reverse = false, steps = 5): (number | null)[] {
  const nums = values.filter((v): v is number => v !== null && Number.isFinite(v));
  if (nums.length < 2) return values.map(() => null);
  const lo = Math.min(...nums), hi = Math.max(...nums);
  if (lo === hi) return values.map(() => null);
  return values.map((v) => {
    if (v === null || !Number.isFinite(v)) return null;
    let t = (v - lo) / (hi - lo);
    if (reverse) t = 1 - t;
    return 1 + Math.round(t * (steps - 1));
  });
}

export type TimelinePhase = 'done' | 'next' | 'upcoming';

/**
 * Display order for a timeline's rows: rows with a date in chronological order (ties keep their
 * table order), then rows without one ("TBD") in their table order.
 */
export function timelineOrder(dates: (number | null)[]): number[] {
  const idx = dates.map((_, i) => i);
  const dated = idx.filter((i) => dates[i] !== null && Number.isFinite(dates[i] as number));
  const undated = idx.filter((i) => !dated.includes(i));
  dated.sort((a, b) => (dates[a] as number) - (dates[b] as number) || a - b);
  return [...dated, ...undated];
}

/**
 * Each timeline row's phase relative to `today` (UTC midnight of the viewer's date): before today
 * is done, the first row on or after today is next, later ones are upcoming. A row with no date,
 * or a date written without a year (which can't be placed in time), has no phase (null).
 * `dates` must already be in display order.
 */
export function timelinePhases(dates: (number | null)[], hasYear: boolean[], today: number): (TimelinePhase | null)[] {
  let nextGiven = false;
  return dates.map((d, i) => {
    if (d === null || !Number.isFinite(d) || !hasYear[i]) return null;
    if (d < today) return 'done';
    if (!nextGiven) { nextGiven = true; return 'next'; }
    return 'upcoming';
  });
}

export type StatusGroup = 'open' | 'progress' | 'blocked' | 'done';

const STATUS_WORDS: Record<StatusGroup, string[]> = {
  open: ['open', 'to do', 'todo', 'new', 'not started', 'backlog', 'planned', 'pending', 'proposed'],
  progress: ['in progress', 'doing', 'wip', 'ongoing', 'started', 'active', 'underway', 'review', 'in review', 'testing', 'qa'],
  blocked: ['blocked', 'on hold', 'waiting', 'stuck', 'at risk', 'paused', 'delayed'],
  done: ['done', 'closed', 'complete', 'completed', 'resolved', 'finished', 'fixed', 'shipped']
};

/**
 * Which of the four standard groups a status cell belongs to — Open, In progress, Blocked, Done —
 * ignoring case, punctuation and emoji ("In-progress", "✅ Done", "ON HOLD"). Null for anything
 * else ("Cancelled", "Phase 2"), which a status board shows in a lane of its own.
 */
export function statusGroup(raw: string): StatusGroup | null {
  const s = String(raw ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  if (!s) return null;
  for (const g of Object.keys(STATUS_WORDS) as StatusGroup[]) if (STATUS_WORDS[g].includes(s)) return g;
  return null;
}

/** A column header that names a status column. */
export const STATUS_HEADER_RE = /^\s*(status|state|stage)\s*$/i;

/**
 * The status column of a table, or -1: the first column headed Status / State / Stage, otherwise
 * the first whose filled cells (at least two) are mostly recognised statuses.
 */
export function findStatusColumn(headers: string[], columns: string[][]): number {
  const byHeader = headers.findIndex((h) => STATUS_HEADER_RE.test(h || ''));
  if (byHeader >= 0) return byHeader;
  return columns.findIndex((col) => {
    const filled = col.map((v) => String(v ?? '').trim()).filter(Boolean);
    return filled.length >= 2 && filled.filter((v) => statusGroup(v) !== null).length / filled.length >= 0.6;
  });
}

export interface BoardLane {
  key: string;
  label: string;
  group: StatusGroup | null;
  rows: number[];
}

const LANE_LABELS: Record<StatusGroup, string> = { open: 'Open', progress: 'In progress', blocked: 'Blocked', done: 'Done' };

/**
 * A status board's lanes, from each row's status text: Open, In progress, Blocked, then any other
 * statuses (one lane each, labelled as first written, in order of appearance), then Done, then
 * "No status" for empty cells. Lanes with no rows are left out; rows keep their table order.
 */
export function boardLanes(statuses: string[]): BoardLane[] {
  const std = new Map<StatusGroup, BoardLane>();
  (['open', 'progress', 'blocked', 'done'] as StatusGroup[]).forEach((g) => std.set(g, { key: g, label: LANE_LABELS[g], group: g, rows: [] }));
  const other = new Map<string, BoardLane>();
  const none: BoardLane = { key: 'none', label: 'No status', group: null, rows: [] };
  statuses.forEach((raw, i) => {
    const text = String(raw ?? '').trim();
    if (!text) { none.rows.push(i); return; }
    const g = statusGroup(text);
    if (g) { std.get(g)!.rows.push(i); return; }
    const key = 'x:' + text.toLowerCase().replace(/\s+/g, ' ');
    if (!other.has(key)) other.set(key, { key, label: text, group: null, rows: [] });
    other.get(key)!.rows.push(i);
  });
  return [std.get('open')!, std.get('progress')!, std.get('blocked')!, ...other.values(), std.get('done')!, none].filter((l) => l.rows.length);
}

/**
 * The choices a Status column's picker offers: the four standard statuses, then any other status
 * already written in the column (as first written, in order), so a team's own wording stays one
 * click away.
 */
export function statusPickerOptions(values: string[]): string[] {
  const std = ['Open', 'In progress', 'Blocked', 'Done'];
  const seen = new Set<string>();
  const extra: string[] = [];
  values.forEach((v) => {
    const t = String(v ?? '').trim();
    if (!t || statusGroup(t)) return;
    const k = t.toLowerCase();
    if (!seen.has(k)) { seen.add(k); extra.push(t); }
  });
  return [...std, ...extra];
}
