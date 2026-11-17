/// <reference types="vite/client" />
import { describe, it, expect } from 'vitest';

// Inter ships with the app and is preloaded (owner 2026-11-02: text shifted 1-2px on load when a
// Google-hosted copy arrived half a second in). The service worker precaches the same files.
const PAGE = Object.values(import.meta.glob('../../index.html', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)[0];
const FONTS = Object.keys(import.meta.glob('../../public/fonts/*.woff2', { query: '?url', import: 'default', eager: true }));
const SW = Object.values(import.meta.glob('../../public/sw.js', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)[0];

describe('Inter is self-hosted', () => {
  it('is preloaded and declared locally, and not fetched from Google Fonts', () => {
    expect(PAGE).toContain('<link rel="preload" href="fonts/inter-latin.woff2" as="font" type="font/woff2" crossorigin>');
    expect(PAGE).toMatch(/@font-face\{font-family:'Inter';[^}]*src:url\(fonts\/inter-latin\.woff2\)/);
    expect(PAGE).not.toMatch(/fonts\.googleapis\.com\/css2\?[^"]*family=Inter/);
  });
  it('ships the files and the service worker precaches them', () => {
    for (const f of ['inter-latin.woff2', 'inter-latin-ext.woff2']) {
      expect(FONTS).toContain('../../public/fonts/' + f);
      expect(SW).toContain("'./fonts/" + f + "'");
    }
    expect(SW).not.toMatch(/family=Inter/);
  });
});

// Fira Code ships with the app too (owner 2026-11-17, for the privacy policy): Google Fonts gave
// Google every visitor's IP address. Public Sans, only a fallback behind Inter, was dropped the same
// day. Nothing may load from Google Fonts again.
describe('every font is self-hosted', () => {
  it('declares each Fira Code face from fonts/ and each file exists', () => {
    const faces = [...PAGE.matchAll(/@font-face\{font-family:'Fira Code';[^}]*src:url\(fonts\/([^)]+\.woff2)\)/g)];
    expect(faces.length).toBe(3 * 3); // 400/500/700 x latin, latin-ext, box drawing
    for (const m of faces) expect(FONTS).toContain('../../public/fonts/' + m[1]);
  });
  it('nothing loads from Google Fonts, the page policy no longer allows it, and Public Sans is gone', () => {
    for (const src of [PAGE, SW]) expect(src).not.toMatch(/fonts\.(googleapis|gstatic)\.com/);
    expect(PAGE).toContain("font-src 'self';");
    expect(PAGE).not.toContain('Public Sans');
    expect(FONTS.some((f) => f.includes('public-sans'))).toBe(false);
  });
});
