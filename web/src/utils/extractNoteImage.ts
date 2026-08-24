/**
 * §6.6 slice (docs/phase6-full-parity-plan.md): Word export image embedding. `NotePanel.tsx`'s
 * own real "Insert image from file" action (legacy/index.html:33946-33967's `ntb-image` handler,
 * already ported) stores a picked image as a `data:` URI `<img>` tag directly inside a node's
 * `note` field (rich HTML) -- a genuine, existing image-in-note pathway, confirmed by reading
 * `NotePanel.tsx`'s `insertImageFromFile` in full before scoping this slice. This function pulls
 * the first such image back out so `ExportButtons.tsx`'s Word export can embed it as a real
 * picture.
 *
 * Deliberately first-image-only, not every image in a note: legacy's own real Word export has
 * the same "one picture, the node's own featured diagram" model for note images (a node's note
 * can hold more than one image, but only one is ever exported), so this isn't a new scope
 * reduction invented for this port -- it matches what legacy already does.
 */

/** Pure (aside from using the ambient DOM APIs this project's other HTML-walking utilities
 * already rely on, e.g. `parseDocxHtml.ts`): returns the first `<img>` tag's `data:` URI `src`
 * found anywhere in `noteHtml`, or `null` if there is none (no image, or an image whose `src`
 * isn't a `data:` URI -- e.g. a `blob:`/`http(s):` reference, which this slice doesn't attempt
 * to fetch, matching the scope this file's own header describes). */
export function extractFirstImageDataUrl(noteHtml: string | null | undefined): string | null {
  if (!noteHtml) return null;
  const container = document.createElement('div');
  container.innerHTML = noteHtml;
  const img = container.querySelector('img');
  const src = img?.getAttribute('src') || '';
  return src.startsWith('data:') ? src : null;
}
