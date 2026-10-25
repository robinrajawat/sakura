// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { showSbContextMenu, closeSbContextMenu, openSbMenuUnder, sbMenuOpener } from '../../src/ui/contextMenu';

// The app's menu system (src/ui/contextMenu.ts, moved from index.html 2026-10-25). In the page these
// come from elsewhere in index.html's script; here they are stand-ins.
const g = globalThis as Record<string, unknown>;
g.closeMoveMenu = () => {};
g.hideLinkCard = () => {};
g.esc = (v: unknown) => String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
g.closeAllPanelsExceptGlobalSearch = undefined;

const menu = () => document.querySelector('.sb-context-menu:not(.sb-context-submenu)') as HTMLElement | null;
const items = () => [...document.querySelectorAll('.sb-context-menu:not(.sb-context-submenu) > .sb-context-item')] as HTMLElement[];
const active = () => document.querySelector('.sb-context-active')?.textContent || null;
const key = (k: string) => document.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));
const tick = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  closeSbContextMenu();
  document.body.innerHTML = '';
});

describe('showSbContextMenu', () => {
  it('renders items, a divider and escaped labels, as a role=menu', () => {
    showSbContextMenu(10, 10, [{ label: 'Open', onClick: () => {} }, { divider: true }, { label: '<b>x</b>', onClick: () => {} }], { id: 'm1', label: 'Row' });
    const m = menu()!;
    expect(m.id).toBe('m1');
    expect(m.getAttribute('role')).toBe('menu');
    expect(m.getAttribute('aria-label')).toBe('Row');
    expect(items().map((b) => b.textContent)).toEqual(['Open', '<b>x</b>']);
    expect(m.querySelector('.sb-context-divider')).not.toBeNull();
    expect(m.querySelector('b')).toBeNull();
  });

  it('arrow keys move the highlight and wrap; Enter runs the item and closes the menu', async () => {
    const run = vi.fn();
    showSbContextMenu(10, 10, [{ label: 'A', onClick: () => {} }, { label: 'B', onClick: run }]);
    key('ArrowDown');
    expect(active()).toBe('A');
    key('ArrowDown');
    expect(active()).toBe('B');
    key('ArrowDown');
    expect(active()).toBe('A');
    key('ArrowUp');
    expect(active()).toBe('B');
    key('Enter');
    await tick();
    expect(run).toHaveBeenCalledTimes(1);
    expect(menu()).toBeNull();
  });

  it('Escape closes it', () => {
    showSbContextMenu(10, 10, [{ label: 'A', onClick: () => {} }]);
    key('Escape');
    expect(menu()).toBeNull();
  });

  it('a click on an item runs it once and closes the menu; a disabled item is a disabled button', async () => {
    const run = vi.fn();
    showSbContextMenu(10, 10, [{ label: 'A', onClick: run }, { label: 'Off', disabled: true, title: 'Not now' }]);
    const [a, off] = items();
    expect((off as HTMLButtonElement).disabled).toBe(true);
    a.click();
    await tick();
    expect(run).toHaveBeenCalledTimes(1);
    expect(menu()).toBeNull();
  });

  it('a submenu opens with ArrowRight and hands the highlight back with ArrowLeft', () => {
    showSbContextMenu(10, 10, [{ label: 'Insert', submenu: [{ label: 'Table', onClick: () => {} }, { label: 'Image', onClick: () => {} }] }]);
    key('ArrowDown');
    expect(active()).toBe('Insert');
    key('ArrowRight');
    const sub = document.querySelector('.sb-context-submenu')!;
    expect(sub).not.toBeNull();
    // The parent stays highlighted (it shows which flyout is open); the flyout's first item takes the keys.
    expect(sub.querySelector('.sb-context-active')?.textContent).toBe('Table');
    key('ArrowLeft');
    expect(document.querySelector('.sb-context-submenu')).toBeNull();
    expect(active()).toBe('Insert');
  });

  it('a fold row unfolds its items in place and they join the arrow-key order', () => {
    showSbContextMenu(10, 10, [{ label: 'More', fold: [{ label: 'One', onClick: () => {} }] }, { label: 'Last', onClick: () => {} }]);
    const fold = items()[0];
    expect(fold.getAttribute('aria-expanded')).toBe('false');
    fold.click();
    expect(fold.getAttribute('aria-expanded')).toBe('true');
    expect(menu()!.querySelector('.sb-context-fold-body')?.textContent).toContain('One');
    key('ArrowDown');
    key('ArrowDown');
    expect(active()).toBe('One');
    fold.click();
    expect(menu()!.querySelector('.sb-context-fold-body')).toBeNull();
  });

  it('remembers what had focus; sbMenuOpener() hands it out only while an item click runs', async () => {
    const opener = document.createElement('button');
    document.body.appendChild(opener);
    opener.focus();
    let seen: Element | null = null;
    showSbContextMenu(10, 10, [{ label: 'A', onClick: () => { seen = sbMenuOpener(); } }]);
    expect(sbMenuOpener()).toBeNull();
    items()[0].click();
    expect(seen).toBe(opener);
    await tick();
    expect(sbMenuOpener()).toBeNull();
  });
});

describe('openSbMenuUnder', () => {
  it('opens a dropdown under its button, marks it expanded, and a second call closes it', () => {
    const btn = document.createElement('button');
    document.body.appendChild(btn);
    openSbMenuUnder(btn, [{ label: 'A', onClick: () => {} }], { keyboard: true });
    expect(menu()!.classList.contains('sb-dropdown')).toBe(true);
    expect(btn.getAttribute('aria-expanded')).toBe('true');
    expect(active()).toBe('A');
    openSbMenuUnder(btn, [{ label: 'A', onClick: () => {} }]);
    expect(menu()).toBeNull();
    expect(btn.getAttribute('aria-expanded')).toBe('false');
  });
});
