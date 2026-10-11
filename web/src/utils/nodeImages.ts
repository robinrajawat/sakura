/**
 * Pure helpers for `node.images` — screenshots/pictures attached to an outline node as their own
 * per-node objects (siblings of `node.note`/`node.tables`, never embedded in note HTML).
 *
 * Shape of one entry: `{ id, src, caption, width?, annotations: [], createdAt }`.
 * - `src` is a data URL (or, for a migrated legacy note image, possibly an http(s) URL) stored
 *   in the document itself — no external storage.
 * - `width` is an optional display size, as a percentage (10–100) of the available width, used
 *   by the enlarged viewer and the PDF. Absent means "Auto" (natural size, capped at 100%). The
 *   viewer offers Small/Medium/Full presets (see IMAGE_WIDTH_PRESETS) but any integer in range
 *   round-trips, so a later slider can reuse the field unchanged.
 * - `annotations` holds the markup editor's marks (rectangles, arrows, highlighter boxes, text
 *   labels) as plain shapes over the picture — the picture itself (`src`) is never modified.
 *   Every coordinate is relative to the image (0–1 of its natural width/height), and stroke
 *   width / text size are relative to the image's width, so marks stay aligned and in proportion
 *   at any display size. See ImageAnnotation / normalizeImageAnnotations / annotationsToSvg.
 *
 * Wired into index.html via scripts/generate-index-blocks.mjs's `nodeImages` block. Everything
 * DOM/canvas-specific (decoding, drawing, toDataURL, note-HTML parsing for the migration) stays
 * hand-written in index.html; only the decisions live here so they can be unit tested.
 */

export interface NodeImage {
  id: string;
  src: string;
  caption: string;
  width?: number;
  annotations: ImageAnnotation[];
  createdAt: number;
}

// ---------------------------------------------------------------------------------------------
// Annotations (markup): non-destructive shapes drawn over an image.
//
//   rect      { id, type:'rect',      x, y, w, h, color, strokeWidth }   outline box
//   highlight { id, type:'highlight', x, y, w, h, color }                filled, ~35% opacity
//   arrow     { id, type:'arrow',     x1, y1, x2, y2, color, strokeWidth } line + arrowhead at x2,y2
//   text      { id, type:'text',      x, y, text, size, color }          (x,y) = top-left of label
//
// x/y/w/h/x1../y2 are fractions (0–1) of the image's natural width (x) and height (y).
// strokeWidth and size are fractions of the image's natural WIDTH (so one number scales evenly).
// ---------------------------------------------------------------------------------------------

export type ImageAnnotationType = 'rect' | 'highlight' | 'arrow' | 'text';
export interface BoxAnnotation {
  id: string;
  type: 'rect' | 'highlight';
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;
  strokeWidth?: number;
}
export interface ArrowAnnotation {
  id: string;
  type: 'arrow';
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: string;
  strokeWidth: number;
}
export interface TextAnnotation {
  id: string;
  type: 'text';
  x: number;
  y: number;
  text: string;
  size: number;
  color: string;
}
export type ImageAnnotation = BoxAnnotation | ArrowAnnotation | TextAnnotation;

/** Hard cap on marks per image — far beyond any real screenshot markup, small enough that a
 * corrupt or hostile document can't make rendering crawl. Extra entries are dropped. */
export const MAX_IMAGE_ANNOTATIONS = 200;
/** A text label is a short callout, not a paragraph. */
export const ANNOTATION_TEXT_MAX = 200;
/** Highlighter fill opacity (marker-style: the picture stays readable underneath). */
export const HIGHLIGHT_OPACITY = 0.35;
export const DEFAULT_ANNOTATION_STROKE = 0.004;
export const DEFAULT_ANNOTATION_TEXT_SIZE = 0.025;
const STROKE_MIN = 0.0005;
const STROKE_MAX = 0.05;
const TEXT_SIZE_MIN = 0.004;
const TEXT_SIZE_MAX = 0.25;

export interface AnnotationColor {
  key: string;
  label: string;
  hex: string;
}
/** Fixed palette, picked to read on both light and dark screenshots (saturated mid-tones, plus
 * black and white for the cases where colour would clash). First entry is the default. */
export const ANNOTATION_COLORS: AnnotationColor[] = [
  { key: 'red', label: 'Red', hex: '#e8384f' },
  { key: 'yellow', label: 'Yellow', hex: '#f5b800' },
  { key: 'green', label: 'Green', hex: '#2fb344' },
  { key: 'blue', label: 'Blue', hex: '#2f7cf6' },
  { key: 'black', label: 'Black', hex: '#1b1b1f' },
  { key: 'white', label: 'White', hex: '#ffffff' }
];
export const DEFAULT_ANNOTATION_COLOR = ANNOTATION_COLORS[0].hex;

const round4 = (n: number): number => Math.round(n * 10000) / 10000;
function finite(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}
export function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}
/** A colour is kept only as a #rgb/#rrggbb hex (lower-cased, expanded) — it's written straight
 * into SVG attributes, so nothing else gets through. Anything else falls back to the default. */
export function normalizeAnnotationColor(c: unknown): string {
  if (typeof c !== 'string') return DEFAULT_ANNOTATION_COLOR;
  const t = c.trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(t)) return t;
  if (/^#[0-9a-f]{3}$/.test(t)) return '#' + t[1] + t[1] + t[2] + t[2] + t[3] + t[3];
  return DEFAULT_ANNOTATION_COLOR;
}
function normalizeStroke(v: unknown): number {
  if (!finite(v) || v <= 0) return DEFAULT_ANNOTATION_STROKE;
  return round4(Math.min(STROKE_MAX, Math.max(STROKE_MIN, v)));
}
function normalizeTextSize(v: unknown): number {
  if (!finite(v) || v <= 0) return DEFAULT_ANNOTATION_TEXT_SIZE;
  return round4(Math.min(TEXT_SIZE_MAX, Math.max(TEXT_SIZE_MIN, v)));
}
/** Label text: single line, trimmed, capped. */
export function normalizeAnnotationText(t: unknown): string {
  if (typeof t !== 'string') return '';
  return t.replace(/[\r\n\t]+/g, ' ').trim().slice(0, ANNOTATION_TEXT_MAX);
}

/** Box (rect/highlight) from any two corner points, clamped inside the image. */
export function boxFromPoints(ax: number, ay: number, bx: number, by: number): { x: number; y: number; w: number; h: number } {
  const x1 = clamp01(Math.min(ax, bx));
  const y1 = clamp01(Math.min(ay, by));
  const x2 = clamp01(Math.max(ax, bx));
  const y2 = clamp01(Math.max(ay, by));
  return { x: round4(x1), y: round4(y1), w: round4(x2 - x1), h: round4(y2 - y1) };
}

/** One stored mark → a clean ImageAnnotation, or null if it's malformed (unknown type, missing
 * or non-numeric coordinates, zero size, empty text). Coordinates are clamped to the image,
 * a negative width/height is flipped, numbers are rounded to 4 decimals (sub-pixel at 1600px). */
export function normalizeImageAnnotation(raw: unknown, makeId: () => string): ImageAnnotation | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const e = raw as Record<string, unknown>;
  const a = normalizeAnnotationShape(e);
  if (!a) return null;
  return { ...a, id: typeof e.id === 'string' && e.id ? e.id.slice(0, 64) : makeId() } as ImageAnnotation;
}
function normalizeAnnotationShape(e: Record<string, unknown>): ImageAnnotation | null {
  const id = '';
  const color = normalizeAnnotationColor(e.color);
  if (e.type === 'rect' || e.type === 'highlight') {
    if (!finite(e.x) || !finite(e.y) || !finite(e.w) || !finite(e.h)) return null;
    const b = boxFromPoints(e.x, e.y, e.x + e.w, e.y + e.h);
    if (b.w <= 0 || b.h <= 0) return null;
    if (e.type === 'highlight') return { id, type: 'highlight', ...b, color };
    return { id, type: 'rect', ...b, color, strokeWidth: normalizeStroke(e.strokeWidth) };
  }
  if (e.type === 'arrow') {
    if (!finite(e.x1) || !finite(e.y1) || !finite(e.x2) || !finite(e.y2)) return null;
    const a: ArrowAnnotation = {
      id,
      type: 'arrow',
      x1: round4(clamp01(e.x1)),
      y1: round4(clamp01(e.y1)),
      x2: round4(clamp01(e.x2)),
      y2: round4(clamp01(e.y2)),
      color,
      strokeWidth: normalizeStroke(e.strokeWidth)
    };
    if (a.x1 === a.x2 && a.y1 === a.y2) return null;
    return a;
  }
  if (e.type === 'text') {
    if (!finite(e.x) || !finite(e.y)) return null;
    const text = normalizeAnnotationText(e.text);
    if (!text) return null;
    return { id, type: 'text', x: round4(clamp01(e.x)), y: round4(clamp01(e.y)), text, size: normalizeTextSize(e.size), color };
  }
  return null;
}

/** Whatever was stored in `image.annotations` → a clean list: malformed entries dropped,
 * duplicate/missing ids replaced, at most MAX_IMAGE_ANNOTATIONS kept (the oldest ones — later
 * marks are drawn on top, and the cap only ever bites on corrupt data). */
export function normalizeImageAnnotations(raw: unknown, makeId: () => string): ImageAnnotation[] {
  if (!Array.isArray(raw)) return [];
  const out: ImageAnnotation[] = [];
  const seen = new Set<string>();
  for (const entry of raw) {
    if (out.length >= MAX_IMAGE_ANNOTATIONS) break;
    const a = normalizeImageAnnotation(entry, makeId);
    if (!a) continue;
    if (seen.has(a.id)) a.id = makeId();
    seen.add(a.id);
    out.push(a);
  }
  return out;
}

/** Moves a mark by (dx, dy) image fractions, stopping at the image's edges so the whole shape
 * (or, for text, its anchor point) stays inside. Returns a new object. */
export function translateAnnotation<T extends ImageAnnotation>(a: T, dx: number, dy: number): T {
  if (a.type === 'arrow') {
    const minX = Math.min(a.x1, a.x2), maxX = Math.max(a.x1, a.x2);
    const minY = Math.min(a.y1, a.y2), maxY = Math.max(a.y1, a.y2);
    const ddx = Math.min(1 - maxX, Math.max(-minX, dx));
    const ddy = Math.min(1 - maxY, Math.max(-minY, dy));
    return { ...a, x1: round4(a.x1 + ddx), y1: round4(a.y1 + ddy), x2: round4(a.x2 + ddx), y2: round4(a.y2 + ddy) } as T;
  }
  if (a.type === 'text') {
    return { ...a, x: round4(clamp01(a.x + dx)), y: round4(clamp01(a.y + dy)) } as T;
  }
  const b = a as BoxAnnotation;
  const ddx = Math.min(1 - (b.x + b.w), Math.max(-b.x, dx));
  const ddy = Math.min(1 - (b.y + b.h), Math.max(-b.y, dy));
  return { ...a, x: round4(b.x + ddx), y: round4(b.y + ddy) } as T;
}

/** Arrowhead triangle for an arrow from (x1,y1) to (x2,y2) in pixel space with stroke width
 * `stroke`: the tip sits exactly at (x2,y2); `base` is where the shaft should stop so the line's
 * thick end never pokes out past the head. The head shrinks on very short arrows. */
export function arrowGeometry(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  stroke: number
): { base: [number, number]; points: [number, number][] } {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const headLen = Math.min(Math.max(stroke * 4, 6), len * 0.6);
  const halfW = headLen * 0.55;
  const bx = x2 - ux * headLen;
  const by = y2 - uy * headLen;
  const r = (n: number): number => Math.round(n * 100) / 100;
  return {
    base: [r(x2 - ux * headLen * 0.7), r(y2 - uy * headLen * 0.7)],
    points: [
      [r(x2), r(y2)],
      [r(bx - uy * halfW), r(by + ux * halfW)],
      [r(bx + uy * halfW), r(by - ux * halfW)]
    ]
  };
}

/** Relative luminance (0 = black, 1 = white) of a #rrggbb colour. */
export function colorLuminance(hex: string): number {
  const h = normalizeAnnotationColor(hex);
  const ch = (i: number): number => {
    const v = parseInt(h.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * ch(1) + 0.7152 * ch(3) + 0.0722 * ch(5);
}
/** Halo/outline drawn behind a text label so it stays legible on any background: dark behind
 * light text (white, yellow), white behind everything else. */
export function annotationHaloColor(hex: string): string {
  return colorLuminance(hex) > 0.4 ? '#1b1b1f' : '#ffffff';
}

function escXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export interface AnnotationSvgOptions {
  /** Minimum stroke, in the same pixel units as `width`/`height` (thumbnails pass a floor so a
   * mark shrunk to ~130px still shows as a line). */
  minStroke?: number;
  /** Adds an invisible, wide hit area per mark (pointer-events) for the editor. */
  hitAreas?: boolean;
}

/** SVG inner markup for `annotations` drawn over an image of `width` x `height` pixels — the
 * caller puts it in an <svg viewBox="0 0 width height"> laid exactly over the picture. Each mark
 * is a <g data-annot-id="…" data-annot-type="…">. Input is normalized first, so stored garbage
 * can never reach the markup. */
export function annotationsToSvg(annotations: unknown, width: number, height: number, opts: AnnotationSvgOptions = {}): string {
  const W = finite(width) && width > 0 ? width : 1;
  const H = finite(height) && height > 0 ? height : 1;
  let n = 0;
  const list = normalizeImageAnnotations(annotations, () => 'a' + ++n);
  const r = (v: number): number => Math.round(v * 100) / 100;
  const minStroke = finite(opts.minStroke) && opts.minStroke > 0 ? opts.minStroke : 0;
  const hitW = Math.max(W, H) * 0.012;
  const parts: string[] = [];
  for (const a of list) {
    const open = '<g data-annot-id="' + escXml(a.id) + '" data-annot-type="' + a.type + '">';
    if (a.type === 'rect' || a.type === 'highlight') {
      const x = r(a.x * W), y = r(a.y * H), w = r(a.w * W), h = r(a.h * H);
      if (a.type === 'highlight') {
        parts.push(open + '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" fill="' + a.color + '" fill-opacity="' + HIGHLIGHT_OPACITY + '"' + (opts.hitAreas ? ' pointer-events="all"' : '') + '/></g>');
      } else {
        const sw = r(Math.max(minStroke, (a.strokeWidth ?? DEFAULT_ANNOTATION_STROKE) * W));
        const rx = r(Math.min(sw * 1.5, w / 4, h / 4));
        let g = open + '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="' + rx + '" fill="none" stroke="' + a.color + '" stroke-width="' + sw + '" stroke-linejoin="round"/>';
        if (opts.hitAreas) g += '<rect class="annot-hit" x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" fill="none" stroke="transparent" stroke-width="' + r(Math.max(sw, hitW)) + '" pointer-events="stroke"/>';
        parts.push(g + '</g>');
      }
    } else if (a.type === 'arrow') {
      const sw = Math.max(minStroke, a.strokeWidth * W);
      const x1 = a.x1 * W, y1 = a.y1 * H, x2 = a.x2 * W, y2 = a.y2 * H;
      const geo = arrowGeometry(x1, y1, x2, y2, sw);
      let g = open + '<line x1="' + r(x1) + '" y1="' + r(y1) + '" x2="' + geo.base[0] + '" y2="' + geo.base[1] + '" stroke="' + a.color + '" stroke-width="' + r(sw) + '" stroke-linecap="round"/>' +
        '<polygon points="' + geo.points.map((p) => p[0] + ',' + p[1]).join(' ') + '" fill="' + a.color + '" stroke="' + a.color + '" stroke-width="' + r(sw * 0.5) + '" stroke-linejoin="round"/>';
      if (opts.hitAreas) g += '<line class="annot-hit" x1="' + r(x1) + '" y1="' + r(y1) + '" x2="' + r(x2) + '" y2="' + r(y2) + '" stroke="transparent" stroke-width="' + r(Math.max(sw * 3, hitW)) + '" pointer-events="stroke"/>';
      parts.push(g + '</g>');
    } else if (a.type === 'text') {
      const fs = a.size * W;
      const halo = annotationHaloColor(a.color);
      // Baseline ~0.8em below the stored top edge, so (x,y) is where the label's top-left sits.
      parts.push(open + '<text x="' + r(a.x * W) + '" y="' + r(a.y * H + fs * 0.8) + '" font-size="' + r(fs) + '" font-family="Inter, system-ui, -apple-system, Segoe UI, Arial, sans-serif" font-weight="700" fill="' + a.color + '" stroke="' + halo + '" stroke-width="' + r(fs * 0.2) + '" stroke-linejoin="round" paint-order="stroke"' + (opts.hitAreas ? ' pointer-events="all"' : '') + ' xml:space="preserve">' + escXml(a.text) + '</text></g>');
    }
  }
  return parts.join('');
}

/** Longest side, in pixels, a newly added image is downscaled to. */
export const NODE_IMAGE_MAX_LONG_SIDE = 1600;
/** Lossy encode quality used for WebP (and the JPEG fallback). */
export const NODE_IMAGE_ENCODE_QUALITY = 0.8;
/** Caption length cap — a caption is a label, not a note. */
export const NODE_IMAGE_CAPTION_MAX = 500;

export interface NodeImageWidthPreset {
  key: 'auto' | 'small' | 'medium' | 'full';
  label: string;
  value: number | undefined;
}
export const IMAGE_WIDTH_PRESETS: NodeImageWidthPreset[] = [
  { key: 'auto', label: 'Auto', value: undefined },
  { key: 'small', label: 'Small', value: 35 },
  { key: 'medium', label: 'Medium', value: 60 },
  { key: 'full', label: 'Full', value: 100 }
];

/** A src worth moving out of a note / keeping as an image object: an inline data:image URL or
 * an absolute http(s) URL. blob:, file:, relative and empty srcs are not (they don't survive a
 * reload or another device), so a legacy note image with one of those is left where it is. */
export function isUsableImageSrc(src: unknown): boolean {
  if (typeof src !== 'string') return false;
  const s = src.trim();
  return /^data:image\/[a-z0-9.+-]+(?:;[^,]*)?,./i.test(s) || /^https?:\/\/\S+$/i.test(s);
}

/** Clamps a stored display width to an integer percentage in [10, 100]; anything else
 * (missing, non-numeric, non-finite) means "Auto" and comes back undefined. */
export function normalizeImageWidth(width: unknown): number | undefined {
  if (typeof width !== 'number' || !Number.isFinite(width)) return undefined;
  return Math.min(100, Math.max(10, Math.round(width)));
}

/** Which preset (if any) a stored width corresponds to — Auto for undefined. */
export function imageWidthPresetKey(width: number | undefined): NodeImageWidthPreset['key'] | null {
  const hit = IMAGE_WIDTH_PRESETS.find((p) => p.value === width);
  return hit ? hit.key : null;
}

function normalizeCaption(caption: unknown): string {
  if (typeof caption !== 'string') return '';
  return caption.replace(/[\r\n\t]+/g, ' ').slice(0, NODE_IMAGE_CAPTION_MAX);
}

/** Normalizes whatever was stored in `node.images` into a clean array. Entries without a
 * non-empty string src are dropped (nothing to show); everything else is kept. A missing or
 * duplicate id is replaced via `makeId`; `annotations` goes through normalizeImageAnnotations
 * (malformed marks dropped, coordinates clamped, capped at MAX_IMAGE_ANNOTATIONS). */
export function normalizeNodeImages(raw: unknown, now: number, makeId: () => string): NodeImage[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: NodeImage[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;
    const e = entry as Record<string, unknown>;
    if (typeof e.src !== 'string' || !e.src.trim()) continue;
    let id = typeof e.id === 'string' && e.id ? e.id : '';
    if (!id || seen.has(id)) id = makeId();
    seen.add(id);
    const img: NodeImage = {
      id,
      src: e.src,
      caption: normalizeCaption(e.caption),
      annotations: normalizeImageAnnotations(e.annotations, makeId),
      createdAt: typeof e.createdAt === 'number' && Number.isFinite(e.createdAt) && e.createdAt > 0 ? e.createdAt : now
    };
    const w = normalizeImageWidth(e.width);
    if (w !== undefined) img.width = w;
    out.push(img);
  }
  return out;
}

/** Deep copy for duplicating/copy-pasting a node: same pictures, captions, widths and
 * annotations, but fresh ids so the copies are independent objects. */
export function cloneNodeImagesWithNewIds(images: unknown, now: number, makeId: () => string): NodeImage[] {
  const normalized = normalizeNodeImages(images, now, makeId);
  return normalized.map((img) => {
    const copy: NodeImage = {
      ...img,
      id: makeId(),
      annotations: JSON.parse(JSON.stringify(img.annotations)) as ImageAnnotation[]
    };
    return copy;
  });
}

/** Size to draw a `width` x `height` picture at so its long side is at most `maxLongSide`,
 * keeping aspect ratio; `scaled` is false when it already fits. Degenerate input (zero/NaN)
 * comes back unscaled at 1x1 minimum so a caller never builds a 0-size canvas. */
export function computeImageTargetSize(
  width: number,
  height: number,
  maxLongSide: number = NODE_IMAGE_MAX_LONG_SIDE
): { width: number; height: number; scaled: boolean } {
  const w = Number.isFinite(width) && width > 0 ? Math.round(width) : 1;
  const h = Number.isFinite(height) && height > 0 ? Math.round(height) : 1;
  const long = Math.max(w, h);
  if (long <= maxLongSide) return { width: w, height: h, scaled: false };
  const k = maxLongSide / long;
  return { width: Math.max(1, Math.round(w * k)), height: Math.max(1, Math.round(h * k)), scaled: true };
}

/** True for a GIF with more than one frame. Walks the block structure (header, logical screen
 * descriptor, optional global colour table, then extension/image blocks) counting image
 * descriptors; stops as soon as a second frame is seen. Malformed/truncated data counts as
 * whatever frames were found before the damage. */
export function isAnimatedGif(bytes: Uint8Array): boolean {
  if (!bytes || bytes.length < 13) return false;
  const sig = String.fromCharCode(bytes[0], bytes[1], bytes[2]);
  if (sig !== 'GIF') return false;
  let p = 13;
  const lsdFlags = bytes[10];
  if (lsdFlags & 0x80) p += 3 * (1 << ((lsdFlags & 0x07) + 1));
  let frames = 0;
  const skipSubBlocks = (): boolean => {
    while (p < bytes.length) {
      const size = bytes[p];
      p += 1;
      if (size === 0) return true;
      p += size;
    }
    return false;
  };
  while (p < bytes.length) {
    const b = bytes[p];
    if (b === 0x3b) break; // trailer
    if (b === 0x21) {
      p += 2; // introducer + label
      if (!skipSubBlocks()) break;
    } else if (b === 0x2c) {
      frames += 1;
      if (frames > 1) return true;
      if (p + 10 > bytes.length) break;
      const flags = bytes[p + 9];
      p += 10;
      if (flags & 0x80) p += 3 * (1 << ((flags & 0x07) + 1));
      p += 1; // LZW minimum code size
      if (!skipSubBlocks()) break;
    } else {
      break;
    }
  }
  return false;
}

/** Whether a newly added file of this MIME type should be downscaled/re-encoded at all. SVG is
 * vector (rasterising it would lose that) and an animated GIF would lose its animation, so both
 * are kept byte-for-byte; every other image/* type is re-encoded. */
export function shouldReencodeImage(mime: string, animatedGif: boolean): boolean {
  const m = String(mime || '').toLowerCase();
  if (!m.startsWith('image/')) return false;
  if (m === 'image/svg+xml') return false;
  if (m === 'image/gif' && animatedGif) return false;
  return true;
}

/** Decoded byte size of a data URL's payload (base64 or percent-encoded). 0 for non-data URLs. */
export function dataUrlByteLength(dataUrl: string): number {
  if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:')) return 0;
  const comma = dataUrl.indexOf(',');
  if (comma < 0) return 0;
  const meta = dataUrl.slice(5, comma);
  const payload = dataUrl.slice(comma + 1);
  if (/;base64$/i.test(meta)) {
    const clean = payload.replace(/\s+/g, '');
    const pad = clean.endsWith('==') ? 2 : clean.endsWith('=') ? 1 : 0;
    return Math.max(0, Math.floor((clean.length * 3) / 4) - pad);
  }
  try {
    return decodeURIComponent(payload).length;
  } catch {
    return payload.length;
  }
}

/** The MIME type a data URL actually carries (lower-cased), or '' if it isn't one. Used to check
 * that `canvas.toDataURL('image/webp')` really produced WebP — browsers that can't encode it
 * silently return PNG instead. */
export function dataUrlMime(dataUrl: string): string {
  const m = /^data:([^;,]+)[;,]/i.exec(String(dataUrl || ''));
  return m ? m[1].toLowerCase() : '';
}

export interface EncodedCandidate {
  bytes: number;
  mime: string;
}

/** Picks between the original file and the re-encoded (WebP, or JPEG fallback) version. When
 * the picture had to be downscaled the re-encoded one always wins (the original is too big by
 * definition). Otherwise the original is kept only if it is a web-safe raster type
 * (PNG/JPEG/WebP) and already no larger than the re-encode — e.g. a tiny flat-colour PNG. */
export function pickEncodedImage(
  original: EncodedCandidate,
  encoded: EncodedCandidate | null,
  scaled: boolean
): 'original' | 'encoded' {
  if (!encoded || !encoded.bytes) return 'original';
  if (scaled) return 'encoded';
  const keepable = ['image/png', 'image/jpeg', 'image/webp'].includes(String(original.mime).toLowerCase());
  if (keepable && original.bytes > 0 && original.bytes <= encoded.bytes) return 'original';
  return 'encoded';
}

/** Caption for a picture moved out of a legacy note: its alt text, trimmed — unless that's
 * empty or just a file name (what most paste paths put there), which isn't a caption. */
export function captionFromLegacyAlt(alt: unknown): string {
  if (typeof alt !== 'string') return '';
  const t = alt.trim();
  if (!t) return '';
  if (/^[\w\-. ]+\.(png|jpe?g|gif|webp|bmp|svg|avif|heic)$/i.test(t)) return '';
  return normalizeCaption(t);
}
