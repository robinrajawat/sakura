/**
 * Guards a document field (the title, the author) against changes that neither the person nor the
 * app made (owner 2026-11-16: Download PDF in iPhone Safari left the title empty; "we need to be
 * extremely careful about these data loss issues"). It didn't reproduce in Chrome. The leading
 * Safari-only cause is form restoration: when Safari reloads a page it left (for example after
 * showing the downloaded PDF), it can put an old value back into a text field after the app has
 * loaded the document, and the next save would store it. Whatever the cause, the field may only
 * change through the app (set) or while the person is using it (focus, typing, paste…); any other
 * change is put back before it can be saved, and logged.
 *
 * Wired into index.html via scripts/generate-index-blocks.mjs's `fieldGuard` block.
 */

export interface GuardedField {
  value: string;
  addEventListener: (type: string, fn: () => void) => void;
}

export interface FieldGuard {
  /** The app sets the field (a document opened, a version restored…). */
  set(value: string): void;
  /** Before a save: puts back a change nobody made. Returns true when it did. */
  check(): boolean;
  /** The value the guard trusts. */
  known(): string;
}

export function createFieldGuard(field: GuardedField, name: string, onRestore?: (name: string, unexpected: string, kept: string) => void): FieldGuard {
  let known = String(field.value ?? '');
  let touched = false;
  // Inside the function, not a module constant: a document can open before this block's place in
  // the page's script has run.
  for (const t of ['focus', 'input', 'keydown', 'paste', 'cut', 'drop', 'compositionend', 'beforeinput']) field.addEventListener(t, () => { touched = true; });
  field.addEventListener('input', () => { known = String(field.value ?? ''); });
  return {
    set(value: string) { known = String(value ?? ''); field.value = known; touched = false; },
    check() {
      const now = String(field.value ?? '');
      if (now === known) return false;
      if (touched) { known = now; return false; }
      field.value = known;
      if (onRestore) onRestore(name, now, known);
      return true;
    },
    known() { return known; }
  };
}
