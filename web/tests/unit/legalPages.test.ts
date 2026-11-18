/// <reference types="vite/client" />
import { describe, it, expect } from 'vitest';

// Privacy policy and terms (owner 2026-11-17, before public launch): plain pages in web/public/,
// linked from the sign-in screen and Settings → About → Privacy & data. They must load nothing from
// another site (the policy itself says no third party sees a plain visit). Their one script, legal.js,
// is same-origin: opened from the app (?from=app), "Back" closes the tab instead of opening a second app.
const raw = (g: Record<string, unknown>) => Object.values(g)[0] as string;
const PAGE = raw(import.meta.glob('../../index.html', { query: '?raw', import: 'default', eager: true }));
const PRIVACY = raw(import.meta.glob('../../public/privacy.html', { query: '?raw', import: 'default', eager: true }));
const TERMS = raw(import.meta.glob('../../public/terms.html', { query: '?raw', import: 'default', eager: true }));
const CSS = raw(import.meta.glob('../../public/legal.css', { query: '?raw', import: 'default', eager: true }));
const JS = raw(import.meta.glob('../../public/legal.js', { query: '?raw', import: 'default', eager: true }));

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
      expect(p).not.toMatch(/<(img|iframe)\b/i);
      expect(p.match(/<script\b[^>]*>/gi)).toEqual(['<script src="legal.js" defer>']);
      expect(p).not.toMatch(/<link[^>]+href="https?:/i);
    }
    expect(CSS).not.toMatch(/url\(\s*['"]?https?:/i);
    expect(JS).not.toMatch(/https?:|fetch\(|XMLHttpRequest|import\(|createElement/);
  });
  it('close the tab on Back when the app opened them, and only then', () => {
    for (const p of [PRIVACY, TERMS]) expect(p).toContain('<p class="back"><a href="./">');
    expect(JS).toContain("get('from') !== 'app'");
    expect(JS).toContain('window.close()');
  });
  it('are linked from the sign-in screen and Settings', () => {
    expect(PAGE.match(/href="privacy\.html\?from=app" target="_blank"/g)?.length).toBe(2);
    expect(PAGE.match(/href="terms\.html\?from=app" target="_blank"/g)?.length).toBe(2);
  });
  it('keep the hosted AI providers the app names in step with the policy', () => {
    expect(PAGE).toContain('(currently Groq or Gemini)');
    expect(PRIVACY).toContain('currently Groq or Google (Gemini)');
  });
});
