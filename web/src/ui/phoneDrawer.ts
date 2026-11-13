/**
 * The phone drawer (docs/mobile-plan.md, phase 1). On a phone the side rail and the File Explorer
 * are one drawer that slides in from the left over the editor, opened by the ☰ button on the top
 * line. Its state is a class on <html>, `phone-drawer-open`, which only ever applies in the phone
 * layout; it is not remembered, and it never touches the desktop's own sidebar setting
 * (`sakura_sidebar_open`).
 *
 * Wired into index.html via scripts/generate-index-blocks.mjs's `phoneDrawer` block. No module-level
 * constants: switchDoc (which closes the drawer) can run before the block's place in the script.
 */

// Defined by the `phoneLayout` block, which runs first in the same page.
declare function isPhoneLayout(): boolean;

/** True while the drawer is open (only ever in the phone layout). */
export function isPhoneDrawerOpen(root: HTMLElement = document.documentElement): boolean {
  return root.classList.contains('phone-drawer-open');
}

/**
 * Opens or closes the drawer. Opening does nothing outside the phone layout. Keeps the ☰ button's
 * aria-expanded and the backdrop in step.
 */
export function setPhoneDrawerOpen(open: boolean, root: HTMLElement = document.documentElement): boolean {
  const on = !!open && isPhoneLayout();
  root.classList.toggle('phone-drawer-open', on);
  const btn = document.getElementById('phone-menu-btn');
  if (btn) btn.setAttribute('aria-expanded', String(on));
  const backdrop = document.getElementById('phone-drawer-backdrop');
  if (backdrop) backdrop.hidden = !on;
  return on;
}
