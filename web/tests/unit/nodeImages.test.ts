import { describe, it, expect } from 'vitest';
import {
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
        { id: 'a', src: 'data:image/png;base64,AAAA', caption: 'One', width: 60, annotations: [{ t: 'rect', x: 0.1 }], createdAt: 5 },
        { src: 'data:image/webp;base64,BBBB' }
      ],
      100,
      idMaker()
    );
    expect(out).toEqual([
      { id: 'a', src: 'data:image/png;base64,AAAA', caption: 'One', width: 60, annotations: [{ t: 'rect', x: 0.1 }], createdAt: 5 },
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
  it('passes annotations through untouched (future markup data round-trips)', () => {
    const ann = [{ type: 'arrow', from: [0.1, 0.2], to: [0.5, 0.5], color: 'red', future: { anything: true } }];
    const out = normalizeNodeImages([{ id: 'a', src: 'https://e/a', annotations: ann }], 1, idMaker());
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
    const src = [{ id: 'a', src: 'https://e/a', caption: 'C', width: 35, annotations: [{ k: [1, 2] }], createdAt: 7 }];
    const out = cloneNodeImagesWithNewIds(src, 99, idMaker());
    expect(out).toEqual([{ id: 'img1', src: 'https://e/a', caption: 'C', width: 35, annotations: [{ k: [1, 2] }], createdAt: 7 }]);
    (out[0].annotations[0] as { k: number[] }).k.push(3);
    expect(src[0].annotations[0].k).toEqual([1, 2]);
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
