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
const CSS = raw(import.meta.glob('../../public/legal.css', { query: '?raw', import: 'default', eager: true }));

describe('privacy policy and terms', () => {
  it('name the operator, a contact and an effective date', () => {
    for (const p of [PRIVACY, TERMS]) {
      expect(p).toContain('Robin Singh Rajawat');
      expect(p).toContain('mailto:robinsinghrajawat@gmail.com');
      expect(p).toMatch(/Effective \d{1,2} \w+ 20\d\d/);
    }
    expect(PRIVACY).toContain('Datatilsynet');
    expect(TERMS).toContain('Danish law');
  });
  it('link to each other and load nothing from another site', () => {
    expect(PRIVACY).toContain('href="terms.html"');
    expect(TERMS).toContain('href="privacy.html"');
    for (const p of [PRIVACY, TERMS]) {
      expect(p).not.toMatch(/<(script|img|iframe)\b/i);
      expect(p).not.toMatch(/<link[^>]+href="https?:/i);
    }
    expect(CSS).not.toMatch(/url\(\s*['"]?https?:/i);
  });
  it('name the site at the top instead of a "Back" link', () => {
    for (const p of [PRIVACY, TERMS]) {
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
});
