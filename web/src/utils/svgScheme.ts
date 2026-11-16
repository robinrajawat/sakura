/**
 * A draw.io picture follows the app's Light/Dark, not the device's (owner 2026-11-16: "diagram
 * previews in mobile ... always come in dark mode"; first fixed for the old phone page on
 * 2026-11-03 and lost with it in phase 5 of docs/mobile-plan.md). draw.io exports declare
 * `color-scheme: light dark` and colour with light-dark(), so the picture follows the system
 * setting, and Safari does that even inside an <img> on a light page. This pins the declared
 * scheme to the app's. Anything that isn't an SVG data URL, or declares no scheme, comes back
 * unchanged. Results are remembered (the outline redraws often and pictures can be large).
 *
 * Wired into index.html via scripts/generate-index-blocks.mjs's `svgScheme` block.
 */

const _svgSchemeCache = new Map<string, string>();

export function svgForScheme(dataUrl: string, scheme: 'light' | 'dark'): string {
  const url = String(dataUrl || '');
  const m = /^data:image\/svg\+xml([^,]*),/i.exec(url);
  if (!m) return url;
  const key = scheme + '|' + url;
  const hit = _svgSchemeCache.get(key);
  if (hit !== undefined) return hit;
  const body = url.slice(m[0].length);
  let text: string;
  try {
    text = /;base64$/i.test(m[1])
      ? new TextDecoder().decode(Uint8Array.from(atob(body), (c) => c.charCodeAt(0)))
      : decodeURIComponent(body);
  } catch {
    return url;
  }
  const pinned = text.replace(/color-scheme\s*:\s*(light\s+dark|dark\s+light|normal)/gi, 'color-scheme: ' + scheme);
  const out = pinned === text ? url : 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(pinned);
  if (_svgSchemeCache.size >= 40) _svgSchemeCache.delete(_svgSchemeCache.keys().next().value as string);
  _svgSchemeCache.set(key, out);
  return out;
}
