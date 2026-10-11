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
 * - `annotations` is reserved for the markup editor (rectangles/arrows/highlights/text). It is
 *   copied through verbatim — never inspected, never dropped — so data written by a newer
 *   version survives a round trip through this one.
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
  annotations: unknown[];
  createdAt: number;
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
 * duplicate id is replaced via `makeId`; `annotations` is passed through as-is (shallow-copied
 * array) so future markup data round-trips untouched. */
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
      annotations: Array.isArray(e.annotations) ? e.annotations.slice() : [],
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
      annotations: JSON.parse(JSON.stringify(img.annotations)) as unknown[]
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
