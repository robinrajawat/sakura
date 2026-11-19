/// <reference types="vite/client" />
import { describe, it, expect } from 'vitest';

// Privacy policy and terms (owner 2026-11-17, before public launch): plain pages in web/public/,
// linked from the sign-in screen and Settings → About → Privacy & data. They must load nothing from
// another site (the policy itself says no third party sees a plain visit). They follow the usual web
// pattern: opened in a new tab, a plain "Sakura Notes" link at the top, no "Back" (owner 2026-11-18).
const raw = (g: Record<string, unknown>) => Object.values(g)[0] as string;
const PAGE = raw(import.meta.glob('../../index.html', { query: '?raw', import: 'default', eager: true }));
const PRIVACY = raw(import.meta.glob('../../public/privacy.html', { query: '?raw', import: 'default', eager: true }));
const TERMS = raw(import.meta.glob('../../public/terms.html', { query: '?raw', import: 'default', eager: true }));
const NOTICES = raw(import.meta.glob('../../public/third-party-notices.html', { query: '?raw', import: 'default', eager: true }));
const NOTICES_MD = raw(import.meta.glob('../../../THIRD-PARTY-NOTICES.md', { query: '?raw', import: 'default', eager: true }));
const NOT_FOUND = raw(import.meta.glob('../../public/404.html', { query: '?raw', import: 'default', eager: true }));
const SECURITY = raw(import.meta.glob('../../public/.well-known/security.txt', { query: '?raw', import: 'default', eager: true }));
const ROBOTS = raw(import.meta.glob('../../public/robots.txt', { query: '?raw', import: 'default', eager: true }));
const HUB = raw(import.meta.glob('../../hub.html', { query: '?raw', import: 'default', eager: true }));
const CSS = raw(import.meta.glob('../../public/legal.css', { query: '?raw', import: 'default', eager: true }));

describe('privacy policy and terms', () => {
  it('name the operator, a contact and an effective date', () => {
    for (const p of [PRIVACY, TERMS]) {
      expect(p).toContain('Robin Singh Rajawat');
      // Role addresses on the domain (Cloudflare Email Routing forwards them), never a personal inbox.
      expect(p).not.toContain('@gmail.com');
      expect(p).toMatch(/Effective \d{1,2} \w+ 20\d\d/);
    }
    expect(PRIVACY).toContain('mailto:privacy@sakura-notes.com');
    expect(TERMS).toContain('mailto:hello@sakura-notes.com');
    expect(TERMS).toContain('mailto:security@sakura-notes.com');
    expect(PRIVACY).toContain('Datatilsynet');
    expect(TERMS).toContain('Danish law');
  });
  it('link to each other and load nothing from another site', () => {
    expect(PRIVACY).toContain('href="terms.html"');
    expect(TERMS).toContain('href="privacy.html"');
    for (const p of [PRIVACY, TERMS, NOTICES, NOT_FOUND]) {
      expect(p).not.toMatch(/<(script|img|iframe)\b/i);
      // rel="canonical" only names the page's address; it loads nothing.
      expect(p).not.toMatch(/<link(?![^>]*rel="canonical")[^>]+href="https?:/i);
    }
    expect(CSS).not.toMatch(/url\(\s*['"]?https?:/i);
  });
  it('name the site at the top instead of a "Back" link', () => {
    for (const p of [PRIVACY, TERMS, NOTICES]) {
      expect(p).toContain('<p class="site"><a href="./">Sakura Notes</a></p>');
      expect(p).not.toMatch(/Back to/);
    }
  });
  it('are linked from the sign-in screen and Settings', () => {
    expect(PAGE.match(/href="privacy\.html" target="_blank"/g)?.length).toBe(2);
    expect(PAGE.match(/href="terms\.html" target="_blank"/g)?.length).toBe(2);
  });
  it('keep the hosted AI providers the app names in step with the policy', () => {
    expect(PAGE).toContain('(currently Groq or Gemini)');
    expect(PRIVACY).toContain('currently Groq or Google (Gemini)');
  });
  it('publish the open-source notices on the site, in step with THIRD-PARTY-NOTICES.md', () => {
    // Standard practice (owner 2026-11-18): notices live on the site, not only in the repo, and
    // Settings has no "License" row (users are governed by the Terms, which say who owns Sakura).
    expect(PAGE).toContain('href="third-party-notices.html" target="_blank"');
    expect(PAGE).not.toContain('settings-switch-text">License<');
    expect(PAGE).not.toContain('github.com/robinrajawat/sakura/blob/');
    const entries = [...NOTICES_MD.matchAll(/^## (.+?)(?: \(|$)/gm)].map(m => m[1].trim());
    expect(entries.length).toBeGreaterThanOrEqual(4);
    for (const name of entries) expect(NOTICES).toContain(`<h2>${name}</h2>`);
    for (const line of NOTICES_MD.match(/^Copyright .+$/gm) ?? []) expect(NOTICES).toContain(line.replace(/\s+$/, ''));
    expect(NOTICES).toContain('TERMS AND CONDITIONS FOR USE, REPRODUCTION, AND DISTRIBUTION');
    expect(NOTICES).toContain('SIL OPEN FONT LICENSE');
    for (const p of [PRIVACY, TERMS]) expect(p).toContain('href="third-party-notices.html"');
    expect(TERMS).toContain('<h2>Sakura itself</h2>');
  });
  it('cover the standard site basics (owner 2026-11-19)', () => {
    // Privacy policy names what is kept on the device and why no consent is asked.
    expect(PRIVACY).toContain('<h2>Cookies and storage on your device</h2>');
    expect(PRIVACY).toContain('Sakura sets no cookies.');
    // Each policy page has its own canonical address and link-preview tags.
    for (const [p, name] of [[PRIVACY, 'privacy'], [TERMS, 'terms'], [NOTICES, 'third-party-notices']] as const) {
      expect(p).toContain(`<link rel="canonical" href="https://www.sakura-notes.com/${name}.html">`);
      expect(p).toContain('<meta property="og:title"');
    }
    // A PNG icon for browsers without SVG icons, after the SVG one.
    for (const p of [PAGE, HUB, PRIVACY, TERMS, NOTICES, NOT_FOUND]) expect(p).toMatch(/rel="icon" type="image\/png"/);
    // Branded 404 (GitHub Pages serves /404.html), kept out of search, with a way into the app.
    expect(NOT_FOUND).toContain('<meta name="robots" content="noindex">');
    expect(NOT_FOUND).toContain('<a href="/">Open Sakura Notes</a>');
    // security.txt (RFC 9116): a contact and an expiry no more than a year ahead. When this fails
    // because Expires has passed, renew the date — an expired file tells researchers to ignore it.
    expect(SECURITY).toContain('Contact: mailto:security@sakura-notes.com');
    const expires = Date.parse(SECURITY.match(/^Expires: (\S+)$/m)?.[1] ?? '');
    expect(expires).toBeGreaterThan(Date.now());
    expect(expires - Date.now()).toBeLessThan(366 * 24 * 3600 * 1000);
    expect(SECURITY).toContain('Canonical: https://www.sakura-notes.com/.well-known/security.txt');
    expect(ROBOTS).toContain('User-agent: *');
  });
});
