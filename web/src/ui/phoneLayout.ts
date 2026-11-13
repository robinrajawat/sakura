/**
 * The phone layout switch (docs/mobile-plan.md, ground rule 1). One media query decides it, by
 * width, never by browser: below 768px the page is in its phone layout, and `html.phone` is set
 * so CSS and code agree. Everything phone-only is gated on `isPhoneLayout()` or lives in
 * src/styles/index/phone.css inside the same query, so the desktop never sees it.
 *
 * Wired into index.html via scripts/generate-index-blocks.mjs's `phoneLayout` block, in the
 * first <head> script, so `html.phone` is set before the first paint.
 */

/**
 * Must match the `@media` query every rule in src/styles/index/phone.css sits in. `screen` keeps it
 * off printouts and PDFs: a page's printable width can be under 768px, and a PDF made on a phone
 * must look the same as one made on a computer.
 */
export const PHONE_LAYOUT_QUERY = 'screen and (max-width: 767.98px)';

/** True when the page is in its phone layout. */
export function isPhoneLayout(): boolean {
  try {
    return window.matchMedia(PHONE_LAYOUT_QUERY).matches;
  } catch {
    return false;
  }
}

/** Puts `phone` on <html> exactly while the page is in its phone layout. */
export function syncPhoneLayoutClass(root: HTMLElement = document.documentElement): void {
  root.classList.toggle('phone', isPhoneLayout());
}

/** Phase 0 preview: `?layout=phone` keeps a phone-sized screen on this page instead of hub.html. */
export function wantsPhoneLayoutPreview(search: string): boolean {
  return /[?&]layout=phone(?:&|$)/.test(search);
}
