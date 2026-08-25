import type { OutlineNode } from '../store/outlineStore';
import { stripSemanticMarkers } from '../utils/stripSemanticMarkers';

/**
 * Pure slide-deck logic and shared constants, originally defined directly inside
 * `PresenterMode.tsx` and moved here in the §6.6 Audience View slice that added
 * `PresenterSlideView.tsx` -- that new component needs these same pure helpers, and having it
 * import them from `PresenterMode.tsx` (which itself needs to import `PresenterSlideView.tsx` to
 * render it) would create a circular module dependency. `PresenterMode.tsx` re-exports
 * everything below unchanged, so nothing importing from it (`ExportButtons.tsx`,
 * `PresenterMode.test.ts`'s successor `presenterSlides.test.ts`) needed to change.
 */
export function groupIntoSlides(nodes: OutlineNode[]): OutlineNode[][] {
  const slides: OutlineNode[][] = [];
  for (const node of nodes) {
    if (node.depth === 0 || slides.length === 0) slides.push([node]);
    else slides[slides.length - 1].push(node);
  }
  return slides;
}

// Legacy's own real closing-slide defaults (`previewClosingSlideText`/`previewClosingSlideSubtitle`
// top-level globals) -- hardcoded here since no Settings panel exists yet to hold them. Exported so
// `ExportButtons.tsx`'s PowerPoint export can append the same real closing slide legacy's own
// `buildPptxPresentation` does (as the genuine last slide in the deck), without duplicating
// these two strings in a second place.
export const CLOSING_SLIDE_TEXT = 'Thank you';
export const CLOSING_SLIDE_SUBTITLE = 'Questions?';

// Legacy's own real branding wordmark default (`getBrandingDisplayText`'s fallback when no
// custom `previewBrandingText` is set) -- exported so `ExportButtons.tsx`'s Word/PDF/PowerPoint
// exports show the exact same mark as PresenterMode's own presenter-bar branding, one source of
// truth instead of four hardcoded copies. Legacy's real `previewPresenterBranding` toggle
// defaults to `true` in the code (`let previewPresenterBranding=true`, and `loadPrefs`'s own
// `d.previewPresenterBranding===undefined?true:...` fallback agrees) -- the Settings panel's own
// description text claims "Off by default," a real, pre-existing doc/code mismatch in legacy
// itself; the actual code default (on) is what this hardcodes, same "trust the real behavior,
// not the description" precedent already used elsewhere in this port. No Settings panel exists
// in `web/` yet to make this toggleable or to hold a custom `previewBrandingText` override.
export const BRANDING_TEXT = 'S A K U R A';

/** Pure: matches legacy's own real per-slide label logic exactly (legacy/index.html:37507) --
 * the slide's first node's text, semantic markers stripped, brackets stripped (a `[Section]`
 * node's own label shouldn't keep its brackets), falling back to "Untitled" when empty. */
export function slideLabel(node: OutlineNode): string {
  const bracketless = String(node.text || '').trim().replace(/^\[|\]$/g, '');
  return stripSemanticMarkers(bracketless).trim() || 'Untitled';
}

/** Pure: matches legacy's own real `updatePresenterTimerDisplay` format exactly -- h:mm:ss once
 * past an hour, m:ss before that. */
export function formatElapsed(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}
