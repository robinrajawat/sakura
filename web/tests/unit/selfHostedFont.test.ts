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
