import { describe, it, expect, afterEach, vi } from 'vitest';
import { isPhoneDrawerOpen, setPhoneDrawerOpen } from '../../src/ui/phoneDrawer';

function fakeRoot() {
  const classes = new Set<string>();
  return {
    classes,
    root: { classList: { contains: (c: string) => classes.has(c), toggle: (c: string, on: boolean) => { if (on) classes.add(c); else classes.delete(c); } } } as unknown as HTMLElement
  };
}

describe('phoneDrawer', () => {
  afterEach(() => vi.unstubAllGlobals());

  const setup = (phone: boolean) => {
    const btn = { attrs: {} as Record<string, string>, setAttribute(k: string, v: string) { this.attrs[k] = v; } };
    const backdrop = { hidden: true };
    vi.stubGlobal('isPhoneLayout', () => phone);
    vi.stubGlobal('document', { getElementById: (id: string) => (id === 'phone-menu-btn' ? btn : id === 'phone-drawer-backdrop' ? backdrop : null) });
    return { btn, backdrop };
  };

  it('opens and closes on a phone, with the button and backdrop in step', () => {
    const { btn, backdrop } = setup(true);
    const { root, classes } = fakeRoot();
    expect(setPhoneDrawerOpen(true, root)).toBe(true);
    expect(classes.has('phone-drawer-open')).toBe(true);
    expect(isPhoneDrawerOpen(root)).toBe(true);
    expect(btn.attrs['aria-expanded']).toBe('true');
    expect(backdrop.hidden).toBe(false);
    expect(setPhoneDrawerOpen(false, root)).toBe(false);
    expect(isPhoneDrawerOpen(root)).toBe(false);
    expect(btn.attrs['aria-expanded']).toBe('false');
    expect(backdrop.hidden).toBe(true);
  });

  it('never opens outside the phone layout', () => {
    setup(false);
    const { root } = fakeRoot();
    expect(setPhoneDrawerOpen(true, root)).toBe(false);
    expect(isPhoneDrawerOpen(root)).toBe(false);
  });
});
