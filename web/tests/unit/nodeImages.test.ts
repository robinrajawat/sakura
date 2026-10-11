import { describe, it, expect } from 'vitest';
import {
  ANNOTATION_COLORS,
  DEFAULT_ANNOTATION_COLOR,
  DEFAULT_ANNOTATION_STROKE,
  DEFAULT_ANNOTATION_TEXT_SIZE,
  MAX_IMAGE_ANNOTATIONS,
  ANNOTATION_TEXT_MAX,
  annotationHaloColor,
  annotationsToSvg,
  arrowGeometry,
  boxFromPoints,
  normalizeAnnotationColor,
  normalizeImageAnnotation,
  normalizeImageAnnotations,
  translateAnnotation,
  IMAGE_WIDTH_PRESETS,
  NODE_IMAGE_MAX_LONG_SIDE,
  captionFromLegacyAlt,
  cloneNodeImagesWithNewIds,
  computeImageTargetSize,
  dataUrlByteLength,
  dataUrlMime,
  imageWidthPresetKey,
  isAnimatedGif,
  isUsableImageSrc,
  normalizeImageWidth,
  normalizeNodeImages,
  pickEncodedImage,
  shouldReencodeImage
} from '../../src/utils/nodeImages';

function idMaker() {
  let n = 0;
  return () => 'img' + ++n;
}

// Minimal real GIFs: 1x1 single-frame, and the same frame repeated (two image descriptors).
const GIF_HEADER = [0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 1, 0, 1, 0, 0x80, 0, 0, 0, 0, 0, 0xff, 0xff, 0xff];
const GCE = [0x21, 0xf9, 0x04, 0x00, 0x0a, 0x00, 0x00, 0x00];
const FRAME = [0x2c, 0, 0, 0, 0, 1, 0, 1, 0, 0x00, 0x02, 0x02, 0x44, 0x01, 0x00];
const NETSCAPE = [0x21, 0xff, 0x0b, ...'NETSCAPE2.0'.split('').map((c) => c.charCodeAt(0)), 0x03, 0x01, 0x00, 0x00, 0x00];
const singleGif = new Uint8Array([...GIF_HEADER, ...GCE, ...FRAME, 0x3b]);
const animatedGif = new Uint8Array([...GIF_HEADER, ...NETSCAPE, ...GCE, ...FRAME, ...GCE, ...FRAME, 0x3b]);

describe('isUsableImageSrc', () => {
  it('accepts data:image URLs and http(s) URLs', () => {
    expect(isUsableImageSrc('data:image/png;base64,iVBORw0KGgo=')).toBe(true);
    expect(isUsableImageSrc('data:image/svg+xml,%3Csvg%3E')).toBe(true);
    expect(isUsableImageSrc('https://example.com/a.png')).toBe(true);
    expect(isUsableImageSrc('http://example.com/a.png')).toBe(true);
  });
  it('rejects empty, blob:, file:, relative and non-image data URLs', () => {
    for (const s of ['', '   ', 'blob:https://x/abc', 'file:///tmp/a.png', 'a.png', '/img/a.png', 'data:text/html,<b>', 'data:image/png;base64,', null, undefined, 42]) {
      expect(isUsableImageSrc(s)).toBe(false);
    }
  });
});

describe('normalizeImageWidth / presets', () => {
  it('clamps to an integer percentage in [10,100]', () => {
    expect(normalizeImageWidth(35)).toBe(35);
    expect(normalizeImageWidth(5)).toBe(10);
    expect(normalizeImageWidth(250)).toBe(100);
    expect(normalizeImageWidth(59.6)).toBe(60);
  });
  it('treats anything non-numeric as Auto (undefined)', () => {
    for (const v of [undefined, null, '60', NaN, Infinity]) expect(normalizeImageWidth(v)).toBeUndefined();
  });
  it('maps stored widths to preset keys', () => {
    expect(imageWidthPresetKey(undefined)).toBe('auto');
    expect(imageWidthPresetKey(35)).toBe('small');
    expect(imageWidthPresetKey(60)).toBe('medium');
    expect(imageWidthPresetKey(100)).toBe('full');
    expect(imageWidthPresetKey(47)).toBeNull();
    expect(IMAGE_WIDTH_PRESETS.map((p) => p.key)).toEqual(['auto', 'small', 'medium', 'full']);
  });
});

describe('normalizeNodeImages', () => {
  it('returns [] for anything that is not an array', () => {
    expect(normalizeNodeImages(undefined, 1, idMaker())).toEqual([]);
    expect(normalizeNodeImages({}, 1, idMaker())).toEqual([]);
  });
  it('keeps valid entries in order, filling defaults', () => {
    const out = normalizeNodeImages(
      [
        { id: 'a', src: 'data:image/png;base64,AAAA', caption: 'One', width: 60, annotations: [{ id: 'm', type: 'rect', x: 0.1, y: 0.1, w: 0.2, h: 0.2, color: '#2f7cf6', strokeWidth: 0.004 }], createdAt: 5 },
        { src: 'data:image/webp;base64,BBBB' }
      ],
      100,
      idMaker()
    );
    expect(out).toEqual([
      { id: 'a', src: 'data:image/png;base64,AAAA', caption: 'One', width: 60, annotations: [{ id: 'm', type: 'rect', x: 0.1, y: 0.1, w: 0.2, h: 0.2, color: '#2f7cf6', strokeWidth: 0.004 }], createdAt: 5 },
      { id: 'img1', src: 'data:image/webp;base64,BBBB', caption: '', annotations: [], createdAt: 100 }
    ]);
    expect('width' in out[1]).toBe(false);
  });
  it('drops entries with no src and non-objects', () => {
    const out = normalizeNodeImages([null, 'x', { src: '' }, { src: '  ' }, { caption: 'no src' }, { src: 'https://e.com/a.png' }], 1, idMaker());
    expect(out.map((i) => i.src)).toEqual(['https://e.com/a.png']);
  });
  it('replaces duplicate ids so every image in a node is addressable', () => {
    const out = normalizeNodeImages([{ id: 'x', src: 'https://e/a' }, { id: 'x', src: 'https://e/b' }], 1, idMaker());
    expect(out[0].id).toBe('x');
    expect(out[1].id).toBe('img1');
  });
  it('keeps valid annotations as-is (a copy) and drops malformed ones', () => {
    const ann = [{ id: 'a1', type: 'arrow', x1: 0.1, y1: 0.2, x2: 0.5, y2: 0.5, color: '#e8384f', strokeWidth: 0.004 }];
    const out = normalizeNodeImages([{ id: 'a', src: 'https://e/a', annotations: [...ann, { type: 'arrow', from: [0.1, 0.2] }] }], 1, idMaker());
    expect(out[0].annotations).toEqual(ann);
    expect(out[0].annotations).not.toBe(ann);
  });
  it('flattens line breaks in captions and caps their length', () => {
    const out = normalizeNodeImages([{ src: 'https://e/a', caption: 'a\nb\tc' }, { src: 'https://e/b', caption: 'x'.repeat(900) }], 1, idMaker());
    expect(out[0].caption).toBe('a b c');
    expect(out[1].caption.length).toBe(500);
  });
});

describe('cloneNodeImagesWithNewIds', () => {
  it('copies everything but the id, deep-copying annotations', () => {
    const ann = { id: 't', type: 'text', x: 0.1, y: 0.2, text: 'Hi', size: 0.03, color: '#ffffff' };
    const src = [{ id: 'a', src: 'https://e/a', caption: 'C', width: 35, annotations: [ann], createdAt: 7 }];
    const out = cloneNodeImagesWithNewIds(src, 99, idMaker());
    expect(out).toEqual([{ id: 'img1', src: 'https://e/a', caption: 'C', width: 35, annotations: [ann], createdAt: 7 }]);
    (out[0].annotations[0] as { text: string }).text = 'changed';
    expect(ann.text).toBe('Hi');
  });
});

describe('computeImageTargetSize', () => {
  it('leaves an image that already fits alone', () => {
    expect(computeImageTargetSize(1200, 800)).toEqual({ width: 1200, height: 800, scaled: false });
    expect(computeImageTargetSize(1600, 1600)).toEqual({ width: 1600, height: 1600, scaled: false });
  });
  it('scales the long side down to the max, keeping aspect ratio', () => {
    expect(computeImageTargetSize(3200, 1800)).toEqual({ width: 1600, height: 900, scaled: true });
    expect(computeImageTargetSize(1000, 4000)).toEqual({ width: 400, height: 1600, scaled: true });
    expect(computeImageTargetSize(2880, 1800, NODE_IMAGE_MAX_LONG_SIDE)).toEqual({ width: 1600, height: 1000, scaled: true });
  });
  it('never returns a zero-sized target', () => {
    expect(computeImageTargetSize(0, 0)).toEqual({ width: 1, height: 1, scaled: false });
    expect(computeImageTargetSize(100000, 1).height).toBe(1);
  });
});

describe('isAnimatedGif', () => {
  it('detects multiple frames', () => {
    expect(isAnimatedGif(animatedGif)).toBe(true);
  });
  it('treats a single-frame GIF as static', () => {
    expect(isAnimatedGif(singleGif)).toBe(false);
  });
  it('is false for non-GIF or truncated data', () => {
    expect(isAnimatedGif(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBe(false);
    expect(isAnimatedGif(new Uint8Array(0))).toBe(false);
    expect(isAnimatedGif(animatedGif.slice(0, 30))).toBe(false);
  });
});

describe('shouldReencodeImage', () => {
  it('skips SVG and animated GIF, re-encodes other raster types', () => {
    expect(shouldReencodeImage('image/svg+xml', false)).toBe(false);
    expect(shouldReencodeImage('image/gif', true)).toBe(false);
    expect(shouldReencodeImage('image/gif', false)).toBe(true);
    expect(shouldReencodeImage('image/png', false)).toBe(true);
    expect(shouldReencodeImage('IMAGE/JPEG', false)).toBe(true);
    expect(shouldReencodeImage('application/pdf', false)).toBe(false);
  });
});

describe('dataUrlByteLength / dataUrlMime', () => {
  it('measures base64 payloads exactly', () => {
    expect(dataUrlByteLength('data:image/png;base64,AAAA')).toBe(3);
    expect(dataUrlByteLength('data:image/png;base64,AAA=')).toBe(2);
    expect(dataUrlByteLength('data:image/png;base64,AA==')).toBe(1);
  });
  it('measures percent-encoded payloads', () => {
    expect(dataUrlByteLength('data:image/svg+xml,%3Csvg%3E')).toBe(5);
  });
  it('is 0 for non-data URLs', () => {
    expect(dataUrlByteLength('https://e/a.png')).toBe(0);
  });
  it('reads the real MIME type (webp support check)', () => {
    expect(dataUrlMime('data:image/webp;base64,UklG')).toBe('image/webp');
    expect(dataUrlMime('data:image/png;base64,iVBO')).toBe('image/png');
    expect(dataUrlMime('data:,')).toBe('');
    expect(dataUrlMime('https://x')).toBe('');
  });
});

describe('pickEncodedImage', () => {
  it('always takes the re-encode when the picture was downscaled', () => {
    expect(pickEncodedImage({ bytes: 100, mime: 'image/png' }, { bytes: 900, mime: 'image/webp' }, true)).toBe('encoded');
  });
  it('keeps an already-smaller PNG/JPEG/WebP original', () => {
    expect(pickEncodedImage({ bytes: 100, mime: 'image/png' }, { bytes: 900, mime: 'image/webp' }, false)).toBe('original');
    expect(pickEncodedImage({ bytes: 900, mime: 'image/png' }, { bytes: 100, mime: 'image/webp' }, false)).toBe('encoded');
  });
  it('never keeps a non-web-safe original (e.g. BMP) even if smaller', () => {
    expect(pickEncodedImage({ bytes: 10, mime: 'image/bmp' }, { bytes: 900, mime: 'image/jpeg' }, false)).toBe('encoded');
  });
  it('falls back to the original when encoding failed', () => {
    expect(pickEncodedImage({ bytes: 10, mime: 'image/png' }, null, true)).toBe('original');
  });
});

describe('captionFromLegacyAlt', () => {
  it('uses real alt text as the caption', () => {
    expect(captionFromLegacyAlt('  Login screen  ')).toBe('Login screen');
  });
  it('ignores empty alt and bare file names', () => {
    expect(captionFromLegacyAlt('')).toBe('');
    expect(captionFromLegacyAlt('image.png')).toBe('');
    expect(captionFromLegacyAlt('Screenshot 2026-01-01 at 10.00.00.png')).toBe('');
    expect(captionFromLegacyAlt(undefined)).toBe('');
  });
});

describe('image annotations (markup)', () => {
  it('normalizes each shape type, keeping ids and clamping to the image', () => {
    const mk = idMaker();
    expect(normalizeImageAnnotation({ id: 'r1', type: 'rect', x: 0.1, y: 0.2, w: 0.3, h: 0.4, color: '#2F7CF6', strokeWidth: 0.006 }, mk)).toEqual({
      id: 'r1', type: 'rect', x: 0.1, y: 0.2, w: 0.3, h: 0.4, color: '#2f7cf6', strokeWidth: 0.006
    });
    expect(normalizeImageAnnotation({ type: 'highlight', x: 0.8, y: -0.5, w: 0.5, h: 1, color: '#ff0' }, mk)).toEqual({
      id: 'img1', type: 'highlight', x: 0.8, y: 0, w: 0.2, h: 0.5, color: '#ffff00'
    });
    expect(normalizeImageAnnotation({ id: 'a', type: 'arrow', x1: -1, y1: 0.5, x2: 2, y2: 0.123456789 }, mk)).toEqual({
      id: 'a', type: 'arrow', x1: 0, y1: 0.5, x2: 1, y2: 0.1235, color: DEFAULT_ANNOTATION_COLOR, strokeWidth: DEFAULT_ANNOTATION_STROKE
    });
    expect(normalizeImageAnnotation({ id: 't', type: 'text', x: 0.5, y: 1.5, text: '  Click\nhere  ', size: 9 }, mk)).toEqual({
      id: 't', type: 'text', x: 0.5, y: 1, text: 'Click here', size: 0.25, color: DEFAULT_ANNOTATION_COLOR
    });
  });
  it('flips a negative width/height into a proper box', () => {
    const a = normalizeImageAnnotation({ id: 'r', type: 'rect', x: 0.5, y: 0.5, w: -0.2, h: -0.1 }, idMaker());
    expect(a).toMatchObject({ x: 0.3, y: 0.4, w: 0.2, h: 0.1 });
  });
  it('drops malformed marks: unknown type, missing/NaN coordinates, zero size, empty text, non-objects', () => {
    const mk = idMaker();
    for (const bad of [null, 1, 'x', [], { keep: 1 }, { type: 'blur', x: 0, y: 0, w: 1, h: 1 }, { type: 'rect', x: 0, y: 0, w: 0, h: 0.2 },
      { type: 'rect', x: 'a', y: 0, w: 0.1, h: 0.1 }, { type: 'rect', x: NaN, y: 0, w: 0.1, h: 0.1 }, { type: 'highlight', x: 2, y: 0, w: 0.1, h: 0.1 },
      { type: 'arrow', x1: 0.2, y1: 0.2, x2: 0.2, y2: 0.2 }, { type: 'arrow', x1: 0, y1: 0 }, { type: 'text', x: 0, y: 0, text: '   ' }, { type: 'text', x: 0, y: 0 }]) {
      expect(normalizeImageAnnotation(bad, mk)).toBeNull();
    }
  });
  it('colours: only hex survives (it goes straight into SVG attributes)', () => {
    expect(normalizeAnnotationColor('#ABCDEF')).toBe('#abcdef');
    expect(normalizeAnnotationColor('#abc')).toBe('#aabbcc');
    for (const bad of ['red', 'url(#x)', '" onload="x', '#12345', 5, null]) expect(normalizeAnnotationColor(bad)).toBe(DEFAULT_ANNOTATION_COLOR);
    expect(ANNOTATION_COLORS.length).toBeGreaterThanOrEqual(5);
    expect(ANNOTATION_COLORS.every((c) => normalizeAnnotationColor(c.hex) === c.hex)).toBe(true);
  });
  it('clamps stroke width and text size, defaulting when missing', () => {
    const mk = idMaker();
    expect(normalizeImageAnnotation({ type: 'rect', x: 0, y: 0, w: 0.1, h: 0.1, strokeWidth: 5 }, mk)).toMatchObject({ strokeWidth: 0.05 });
    expect(normalizeImageAnnotation({ type: 'rect', x: 0, y: 0, w: 0.1, h: 0.1, strokeWidth: -1 }, mk)).toMatchObject({ strokeWidth: DEFAULT_ANNOTATION_STROKE });
    expect(normalizeImageAnnotation({ type: 'text', x: 0, y: 0, text: 'a', size: 0.00001 }, mk)).toMatchObject({ size: 0.004 });
    expect(normalizeImageAnnotation({ type: 'text', x: 0, y: 0, text: 'a' }, mk)).toMatchObject({ size: DEFAULT_ANNOTATION_TEXT_SIZE });
    expect((normalizeImageAnnotation({ type: 'text', x: 0, y: 0, text: 'x'.repeat(500) }, mk) as { text: string }).text).toHaveLength(ANNOTATION_TEXT_MAX);
  });
  it('normalizeImageAnnotations drops junk, de-duplicates ids, caps the count and is idempotent', () => {
    const mk = idMaker();
    const raw = [{ id: 'a', type: 'rect', x: 0, y: 0, w: 0.1, h: 0.1 }, { keep: 1 }, { id: 'a', type: 'highlight', x: 0, y: 0, w: 0.1, h: 0.1 }];
    const once = normalizeImageAnnotations(raw, mk);
    expect(once.map((a) => a.id)).toEqual(['a', 'img1']);
    expect(normalizeImageAnnotations(once, mk)).toEqual(once);
    expect(normalizeImageAnnotations('nope', mk)).toEqual([]);
    const many = Array.from({ length: 500 }, (_, i) => ({ id: 'm' + i, type: 'rect', x: 0, y: 0, w: 0.1, h: 0.1 }));
    expect(normalizeImageAnnotations(many, mk)).toHaveLength(MAX_IMAGE_ANNOTATIONS);
  });
  it('normalizeNodeImages normalizes annotations; cloneNodeImagesWithNewIds deep-copies them', () => {
    const mk = idMaker();
    const imgs = normalizeNodeImages([{ id: 'i', src: 'data:image/png;base64,AAA=', annotations: [{ junk: true }, { id: 'r', type: 'rect', x: 0.1, y: 0.1, w: 0.2, h: 0.2 }] }], 1, mk);
    expect(imgs[0].annotations).toEqual([{ id: 'r', type: 'rect', x: 0.1, y: 0.1, w: 0.2, h: 0.2, color: DEFAULT_ANNOTATION_COLOR, strokeWidth: DEFAULT_ANNOTATION_STROKE }]);
    const copies = cloneNodeImagesWithNewIds(imgs, 1, mk);
    expect(copies[0].annotations).toEqual(imgs[0].annotations);
    expect(copies[0].annotations[0]).not.toBe(imgs[0].annotations[0]);
  });
  it('boxFromPoints accepts corners in any order', () => {
    expect(boxFromPoints(0.6, 0.7, 0.2, 0.1)).toEqual({ x: 0.2, y: 0.1, w: 0.4, h: 0.6 });
    expect(boxFromPoints(-1, -1, 2, 2)).toEqual({ x: 0, y: 0, w: 1, h: 1 });
  });
  it('translateAnnotation moves marks but keeps them inside the image', () => {
    const box = normalizeImageAnnotation({ id: 'b', type: 'rect', x: 0.7, y: 0.1, w: 0.2, h: 0.2 }, idMaker())!;
    expect(translateAnnotation(box, 0.5, -0.5)).toMatchObject({ x: 0.8, y: 0, w: 0.2, h: 0.2 });
    const arrow = normalizeImageAnnotation({ id: 'a', type: 'arrow', x1: 0.1, y1: 0.1, x2: 0.3, y2: 0.4 }, idMaker())!;
    expect(translateAnnotation(arrow, -0.5, 0.1)).toMatchObject({ x1: 0, y1: 0.2, x2: 0.2, y2: 0.5 });
    const text = normalizeImageAnnotation({ id: 't', type: 'text', x: 0.9, y: 0.5, text: 'hi' }, idMaker())!;
    expect(translateAnnotation(text, 0.5, 0.1)).toMatchObject({ x: 1, y: 0.6 });
  });
  it('arrowGeometry puts the tip at the end point and the shaft stops inside the head', () => {
    const g = arrowGeometry(0, 0, 100, 0, 4);
    expect(g.points[0]).toEqual([100, 0]);
    expect(g.base[0]).toBeLessThan(100);
    expect(g.base[0]).toBeGreaterThan(80);
    expect(g.points[1][1]).toBeCloseTo(-g.points[2][1]);
    // a very short arrow gets a proportionally smaller head
    const s = arrowGeometry(0, 0, 5, 0, 4);
    expect(s.points[1][0]).toBeGreaterThanOrEqual(0);
  });
  it('text halos contrast with the label colour', () => {
    expect(annotationHaloColor('#ffffff')).toBe('#1b1b1f');
    expect(annotationHaloColor('#f5b800')).toBe('#1b1b1f');
    expect(annotationHaloColor('#1b1b1f')).toBe('#ffffff');
    expect(annotationHaloColor('#e8384f')).toBe('#ffffff');
  });
  it('annotationsToSvg renders every type in pixel space, escaping text and skipping junk', () => {
    const svg = annotationsToSvg([
      { id: 'r', type: 'rect', x: 0.1, y: 0.2, w: 0.3, h: 0.4, color: '#2f7cf6', strokeWidth: 0.01 },
      { id: 'h', type: 'highlight', x: 0, y: 0, w: 0.5, h: 0.1, color: '#f5b800' },
      { id: 'a', type: 'arrow', x1: 0.1, y1: 0.1, x2: 0.9, y2: 0.9 },
      { id: 't', type: 'text', x: 0.5, y: 0.5, text: '<script>&"x"', size: 0.05, color: '#ffffff' },
      { type: 'blur', x: 0, y: 0, w: 1, h: 1 }
    ], 1000, 500);
    expect(svg.match(/<g data-annot-id/g)).toHaveLength(4);
    expect(svg).toContain('<rect x="100" y="100" width="300" height="200"');
    expect(svg).toContain('stroke-width="10"');
    expect(svg).toContain('fill-opacity="0.35"');
    expect(svg).toContain('<polygon points="900,450');
    expect(svg).toContain('font-size="50"');
    expect(svg).toContain('&lt;script&gt;&amp;&quot;x&quot;');
    expect(svg).not.toContain('<script>');
    expect(svg).not.toContain('annot-hit');
    expect(annotationsToSvg([{ id: 'r', type: 'rect', x: 0, y: 0, w: 0.5, h: 0.5 }], 100, 100, { hitAreas: true })).toContain('annot-hit');
  });
  it('annotationsToSvg applies a minimum stroke (for tiny thumbnails)', () => {
    const svg = annotationsToSvg([{ id: 'r', type: 'rect', x: 0, y: 0, w: 0.5, h: 0.5, strokeWidth: 0.001 }], 1000, 1000, { minStroke: 12 });
    expect(svg).toContain('stroke-width="12"');
  });
});
