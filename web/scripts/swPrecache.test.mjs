import { describe, expect, it } from 'vitest';
import { FIXED_PRECACHE_URLS, hashedAssetUrlsFromManifest, buildPrecacheUrls, templateServiceWorker } from './swPrecache.mjs';

const REAL_SW_SOURCE = `const CACHE_NAME = 'sakura-web-shell-v2';\nconst PRECACHE_URLS = ['./', './index.html', './manifest.json']; // GENERATED:precacheUrls\n`;

describe('hashedAssetUrlsFromManifest', () => {
  it('extracts each entry\'s own .file, deduplicated and sorted', () => {
    const manifest = {
      'index.html': { file: 'assets/index-abc123.js', isEntry: true },
      dep: { file: 'assets/dep-def456.js' }
    };
    expect(hashedAssetUrlsFromManifest(manifest)).toEqual(['./assets/dep-def456.js', './assets/index-abc123.js']);
  });

  it('also pulls in each entry\'s own .css and .assets sub-lists', () => {
    const manifest = {
      'index.html': { file: 'assets/index-abc123.js', css: ['assets/index-xyz.css'], assets: ['assets/font-ghi.woff2'] }
    };
    expect(hashedAssetUrlsFromManifest(manifest)).toEqual(['./assets/font-ghi.woff2', './assets/index-abc123.js', './assets/index-xyz.css']);
  });

  it('returns an empty array for an empty manifest', () => {
    expect(hashedAssetUrlsFromManifest({})).toEqual([]);
  });

  it('deduplicates a file referenced by more than one manifest entry', () => {
    const manifest = {
      a: { file: 'assets/shared-abc.js' },
      b: { file: 'assets/shared-abc.js' }
    };
    expect(hashedAssetUrlsFromManifest(manifest)).toEqual(['./assets/shared-abc.js']);
  });
});

describe('buildPrecacheUrls', () => {
  it('puts the fixed unhashed files first, then the real hashed assets', () => {
    const manifest = { 'index.html': { file: 'assets/index-abc123.js' } };
    const urls = buildPrecacheUrls(manifest);
    expect(urls.slice(0, FIXED_PRECACHE_URLS.length)).toEqual(FIXED_PRECACHE_URLS);
    expect(urls).toContain('./assets/index-abc123.js');
  });

  it('includes the real icon files and app shell, matching legacy\'s own real equivalent list shape', () => {
    const urls = buildPrecacheUrls({});
    expect(urls).toEqual(['./', './index.html', './manifest.json', './icon-192-pwa.png', './icon-512-pwa.png', './icon-512-maskable.png']);
  });
});

describe('templateServiceWorker', () => {
  it('replaces the PRECACHE_URLS placeholder with the real, JSON-serialized list', () => {
    const sw = templateServiceWorker(REAL_SW_SOURCE, ['./', './assets/index-abc123.js'], 'deadbeef01');
    expect(sw).toContain('const PRECACHE_URLS = ["./","./assets/index-abc123.js"]; // GENERATED:precacheUrls');
  });

  it('appends the content-hash suffix onto CACHE_NAME, preserving the base string', () => {
    const sw = templateServiceWorker(REAL_SW_SOURCE, [], 'deadbeef01');
    expect(sw).toContain("const CACHE_NAME = 'sakura-web-shell-v2-deadbeef01';");
  });

  it('a different precache list (different build) produces a different, deterministic-looking hash suffix in the output', () => {
    const swA = templateServiceWorker(REAL_SW_SOURCE, ['./a.js'], 'hash0000aa');
    const swB = templateServiceWorker(REAL_SW_SOURCE, ['./b.js'], 'hash0000bb');
    expect(swA).toContain('hash0000aa');
    expect(swB).toContain('hash0000bb');
    expect(swA).not.toContain('hash0000bb');
  });

  it('throws a clear error when the PRECACHE_URLS marker line is missing', () => {
    const broken = REAL_SW_SOURCE.replace('// GENERATED:precacheUrls', '');
    expect(() => templateServiceWorker(broken, [], 'x')).toThrow(/PRECACHE_URLS marker/);
  });

  it('throws a clear error when the CACHE_NAME line is missing', () => {
    const broken = REAL_SW_SOURCE.replace(/const CACHE_NAME = '[^']+';\n/, '');
    expect(() => templateServiceWorker(broken, [], 'x')).toThrow(/CACHE_NAME line/);
  });

  it('round-trips against the real checked-in public/sw.js template without throwing', async () => {
    const { readFileSync } = await import('node:fs');
    const { fileURLToPath } = await import('node:url');
    const path = await import('node:path');
    const swPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'sw.js');
    const realSource = readFileSync(swPath, 'utf8');
    expect(() => templateServiceWorker(realSource, ['./', './index.html'], 'testhash01')).not.toThrow();
  });
});
