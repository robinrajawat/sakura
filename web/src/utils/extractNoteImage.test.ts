import { describe, it, expect } from 'vitest';
import { extractFirstImageDataUrl } from './extractNoteImage';

const PNG_DATA_URL = 'data:image/png;base64,iVBORw0KGgo=';

describe('extractFirstImageDataUrl', () => {
  it('returns the data: URI src of the first <img> tag', () => {
    expect(extractFirstImageDataUrl(`<p>Some note text</p><img src="${PNG_DATA_URL}">`)).toBe(PNG_DATA_URL);
  });

  it('returns the FIRST image when a note has more than one', () => {
    const second = 'data:image/png;base64,zzzzzz==';
    expect(extractFirstImageDataUrl(`<img src="${PNG_DATA_URL}"><img src="${second}">`)).toBe(PNG_DATA_URL);
  });

  it('returns null for a note with no image', () => {
    expect(extractFirstImageDataUrl('<p>Just text, no image.</p>')).toBeNull();
  });

  it('returns null for empty/null/undefined note HTML', () => {
    expect(extractFirstImageDataUrl('')).toBeNull();
    expect(extractFirstImageDataUrl(null)).toBeNull();
    expect(extractFirstImageDataUrl(undefined)).toBeNull();
  });

  it('returns null for an <img> whose src is not a data: URI (blob:/http(s):)', () => {
    expect(extractFirstImageDataUrl('<img src="blob:http://localhost/abc">')).toBeNull();
    expect(extractFirstImageDataUrl('<img src="https://example.com/pic.png">')).toBeNull();
  });

  it('returns null for an <img> with no src attribute at all', () => {
    expect(extractFirstImageDataUrl('<img alt="no src">')).toBeNull();
  });
});
