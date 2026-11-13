import { describe, it, expect, afterEach, vi } from 'vitest';
import { PHONE_LAYOUT_QUERY, isPhoneLayout, syncPhoneLayoutClass, wantsPhoneLayoutPreview } from '../../src/ui/phoneLayout';

const withWidth = (width: number) => {
  vi.stubGlobal('window', {
    matchMedia: (q: string) => ({ matches: q === PHONE_LAYOUT_QUERY && width < 768 })
  });
};

describe('phoneLayout', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('is the phone layout below 768px only', () => {
    withWidth(390);
    expect(isPhoneLayout()).toBe(true);
    withWidth(767);
    expect(isPhoneLayout()).toBe(true);
    withWidth(768);
    expect(isPhoneLayout()).toBe(false);
    withWidth(1280);
    expect(isPhoneLayout()).toBe(false);
  });

  it('is never the phone layout when matchMedia is missing or throws', () => {
    vi.stubGlobal('window', {});
    expect(isPhoneLayout()).toBe(false);
    vi.stubGlobal('window', { matchMedia: () => { throw new Error('no'); } });
    expect(isPhoneLayout()).toBe(false);
  });

  it('keeps html.phone in step', () => {
    const classes = new Set<string>(['theme-light']);
    const root = { classList: { toggle: (c: string, on: boolean) => { if (on) classes.add(c); else classes.delete(c); } } } as unknown as HTMLElement;
    withWidth(390);
    syncPhoneLayoutClass(root);
    expect([...classes]).toEqual(['theme-light', 'phone']);
    withWidth(1280);
    syncPhoneLayoutClass(root);
    expect([...classes]).toEqual(['theme-light']);
  });

  it('reads the ?layout=phone preview switch', () => {
    expect(wantsPhoneLayoutPreview('?layout=phone')).toBe(true);
    expect(wantsPhoneLayoutPreview('?x=1&layout=phone')).toBe(true);
    expect(wantsPhoneLayoutPreview('?layout=phone&x=1')).toBe(true);
    expect(wantsPhoneLayoutPreview('?layout=phones')).toBe(false);
    expect(wantsPhoneLayoutPreview('')).toBe(false);
  });
});
