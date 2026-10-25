// @vitest-environment happy-dom
import { describe, it, expect, beforeAll, vi } from 'vitest';

// The app's dialog engine (src/ui/dialogs.ts, moved from index.html 2026-10-25). The module wires
// the backdrop listeners when it loads, so the modal markup (as in index.html) goes in first.
const MARKUP = `
  <div id="sakura-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="sakura-modal-title">
    <div id="sakura-modal">
      <div id="sakura-modal-icon"></div>
      <div id="sakura-modal-title"></div>
      <div id="sakura-modal-body"></div>
      <div id="sakura-modal-warning" role="alert" hidden></div>
      <div id="sakura-modal-input-wrap"><span id="sakura-modal-input-label" style="display:none"></span><input id="sakura-modal-input" type="text" /></div>
      <div id="sakura-modal-input2-wrap" style="display:none"><span id="sakura-modal-input2-label" style="display:none"></span><input id="sakura-modal-input2" type="text" /></div>
      <div id="sakura-modal-actions"></div>
    </div>
  </div>`;

type Dialogs = typeof import('../../src/ui/dialogs');
let d: Dialogs;
const $ = (id: string) => document.getElementById(id) as HTMLElement;
const overlay = () => $('sakura-modal-overlay');
const buttons = () => [...$('sakura-modal-actions').querySelectorAll('button')] as HTMLButtonElement[];
const key = (target: Element, k: string, extra: KeyboardEventInit = {}) =>
  target.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...extra }));
const settle = () => new Promise((r) => setTimeout(r, 200));

beforeAll(async () => {
  document.body.innerHTML = MARKUP;
  (globalThis as Record<string, unknown>).el = (id: string) => document.getElementById(id);
  d = await import('../../src/ui/dialogs');
});

describe('sakuraConfirm', () => {
  it('shows title, body and warning, with Cancel then the confirm button', async () => {
    const p = d.sakuraConfirm({ title: 'Delete?', body: 'Gone for good', warning: 'No undo', confirmLabel: 'Delete', confirmCls: 'danger' });
    expect(overlay().classList.contains('open')).toBe(true);
    expect($('sakura-modal-title').textContent).toBe('Delete?');
    expect($('sakura-modal-body').textContent).toBe('Gone for good');
    expect(($('sakura-modal-warning') as HTMLElement).hidden).toBe(false);
    expect($('sakura-modal-input-wrap').style.display).toBe('none');
    expect(buttons().map((b) => [b.textContent, b.className])).toEqual([['Cancel', 'smodal-btn '], ['Delete', 'smodal-btn danger']]);
    buttons()[1].click();
    expect(await p).toBe(true);
    expect(overlay().classList.contains('open')).toBe(false);
  });

  it('Cancel, Escape and a backdrop click all resolve false', async () => {
    let p = d.sakuraConfirm({ title: 'A' });
    buttons()[0].click();
    expect(await p).toBe(false);

    p = d.sakuraConfirm({ title: 'B' });
    key(overlay(), 'Escape');
    expect(await p).toBe(false);

    p = d.sakuraConfirm({ title: 'C' });
    overlay().dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    overlay().click();
    expect(await p).toBe(false);
  });

  it('a drag that starts inside the box and ends on the backdrop does not cancel', async () => {
    const p = d.sakuraConfirm({ title: 'Drag' });
    $('sakura-modal').dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    overlay().click();
    await settle();
    expect(overlay().classList.contains('open')).toBe(true);
    buttons()[1].click();
    expect(await p).toBe(true);
  });

  it('Tab and Shift+Tab move focus between the buttons', async () => {
    const p = d.sakuraConfirm({ title: 'Tab' });
    const [cancel, ok] = buttons();
    cancel.focus();
    key(overlay(), 'Tab');
    expect(document.activeElement).toBe(ok);
    key(overlay(), 'Tab', { shiftKey: true });
    expect(document.activeElement).toBe(cancel);
    buttons()[0].click();
    await p;
  });

  it('Tab wraps from the last button to the first, skipping the hidden input boxes', async () => {
    const p = d.sakuraConfirm({ title: 'Wrap' });
    const [cancel, ok] = buttons();
    ok.focus();
    key(overlay(), 'Tab');
    expect(document.activeElement).toBe(cancel);
    key(overlay(), 'Tab', { shiftKey: true });
    expect(document.activeElement).toBe(ok);
    buttons()[0].click();
    await p;
  });

  it('in a prompt, Tab includes the shown input', async () => {
    const p = d.sakuraPrompt({ title: 'Rename', defaultValue: 'x' });
    const input = $('sakura-modal-input');
    const ok = buttons()[1];
    ok.focus();
    key(overlay(), 'Tab');
    expect(document.activeElement).toBe(input);
    key(input, 'Escape');
    await p;
  });
});

describe('sakuraPrompt', () => {
  it('shows the input with the default value; Enter returns what was typed', async () => {
    const p = d.sakuraPrompt({ title: 'Rename', defaultValue: 'Old' });
    const input = $('sakura-modal-input') as HTMLInputElement;
    expect($('sakura-modal-input-wrap').style.display).toBe('block');
    expect(input.value).toBe('Old');
    input.value = 'New';
    key(input, 'Enter');
    expect(await p).toBe('New');
  });

  it('Escape in the input returns null', async () => {
    const p = d.sakuraPrompt({ title: 'Rename', defaultValue: 'Old' });
    key($('sakura-modal-input'), 'Escape');
    expect(await p).toBeNull();
  });

  it('sakuraPasswordPrompt masks the input only while it is open', async () => {
    const input = $('sakura-modal-input') as HTMLInputElement;
    const p = d.sakuraPasswordPrompt({ title: 'Key' });
    expect(input.classList.contains('key-masked')).toBe(true);
    expect(input.type).toBe('text');
    input.value = 'secret';
    key(input, 'Enter');
    expect(await p).toBe('secret');
    expect(input.classList.contains('key-masked')).toBe(false);
  });
});

describe('onOverlayBackdropClick', () => {
  it('closes only on a click that started and ended on the backdrop', () => {
    const o = document.createElement('div');
    const inner = document.createElement('div');
    o.appendChild(inner);
    document.body.appendChild(o);
    const close = vi.fn();
    d.onOverlayBackdropClick(o, close);
    inner.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    o.click();
    expect(close).not.toHaveBeenCalled();
    o.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    o.click();
    expect(close).toHaveBeenCalledTimes(1);
    d.onOverlayBackdropClick(null, close); // no overlay: no-op
  });
});
