import { describe, it, expect } from 'vitest';
import { createFieldGuard } from '../../src/ui/fieldGuard';

function fakeField(value = '') {
  const listeners: Record<string, (() => void)[]> = {};
  return {
    value,
    addEventListener(t: string, fn: () => void) { (listeners[t] ||= []).push(fn); },
    fire(t: string) { (listeners[t] || []).forEach((f) => f()); }
  };
}

describe('createFieldGuard', () => {
  it('puts back a change nobody made (a browser restoring an old value) and reports it', () => {
    const f = fakeField(); const seen: string[] = [];
    const g = createFieldGuard(f, 'title', (n, bad, kept) => seen.push(`${n}:${bad}->${kept}`));
    g.set('My Title');
    f.value = '';
    expect(g.check()).toBe(true);
    expect(f.value).toBe('My Title');
    expect(seen).toEqual(['title:->My Title']);
  });
  it('keeps what the person typed, including clearing the field', () => {
    const f = fakeField(); const g = createFieldGuard(f, 'title');
    g.set('My Title');
    f.fire('focus'); f.value = 'New'; f.fire('input');
    expect(g.check()).toBe(false);
    expect(f.value).toBe('New');
    f.value = ''; f.fire('input');
    expect(g.check()).toBe(false);
    expect(f.value).toBe('');
  });
  it('keeps a change made while the person is using the field, even without an input event (the "/" menu)', () => {
    const f = fakeField(); const g = createFieldGuard(f, 'title');
    g.set('Plan');
    f.fire('keydown'); f.value = 'Plan 2026-11-16';
    expect(g.check()).toBe(false);
    expect(g.known()).toBe('Plan 2026-11-16');
  });
  it('a document opened by the app is trusted, and earlier use of the field no longer counts', () => {
    const f = fakeField(); const g = createFieldGuard(f, 'title');
    f.fire('focus');
    g.set('Other doc');
    f.value = '';
    expect(g.check()).toBe(true);
    expect(f.value).toBe('Other doc');
  });
});
