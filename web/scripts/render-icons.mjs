// Renders every app icon PNG in web/public from one design (owner 2026-11-26: keep a background,
// properly rounded, with depth). Run: node web/scripts/render-icons.mjs  (uses the e2e Playwright).
//
// Each surface clips differently, so each gets the shape it needs:
//   full  - opaque square, edge to edge. iOS home screen and Android launchers draw their own
//           rounded mask over it; a pre-rounded icon there shows black/white corners.
//   tile  - Apple-style squircle (superellipse, not a rounded rect) inside a transparent margin,
//           with a soft shadow. Desktop Chrome/Windows/macOS installs and Claude's connector list
//           show the PNG as-is, so the rounding has to be in the image.
// Tab favicons (flower-glyph.svg, favicon-192.png, icon-glyph-192.png) stay the bare glyph.
import { chromium } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');

// Design (owner 2026-11-26, inspired by how Apple's Photos icon gets depth from colour rather than
// shadow): five translucent petals in cherry-blossom tones that overlap and blend, so each overlap
// makes a new, deeper tone, on a white squircle. The five-petal layout is Sakura's own glyph,
// pulled in so neighbours overlap. Dark: the same petals glowing (screen blend) on a near-black tile.
// Petals clockwise from the top: [light-theme colour pair (centre side, outer side)].
const PETALS = [
  ['#ffd0e0', '#ff5f97'], // rose
  ['#ffe0cc', '#ff8a6b'], // peach-coral
  ['#ffd6ec', '#e8508f'], // deep pink
  ['#eadcff', '#a776e6'], // lilac
  ['#ffe6f0', '#ff9cc4'], // blush
];

const THEMES = {
  light: { top: '#ffffff', bottom: '#f1efed', edge: 'rgba(0,0,0,0.08)', hi: 'rgba(255,255,255,1)',
    blend: 'multiply', alpha: 0.82, stamen: '#fff6d8', stamenEdge: '#ffcf7a' },
  dark: { top: '#2b2a2e', bottom: '#111113', edge: 'rgba(255,255,255,0.08)', hi: 'rgba(255,255,255,0.10)',
    blend: 'screen', alpha: 0.78, stamen: '#fff3cf', stamenEdge: '#ffc65c' },
};

// Superellipse |x|^n + |y|^n = 1, the continuous-corner shape Apple's icons use.
function squircle(cx, cy, half, n = 5, steps = 256) {
  let d = '';
  for (let i = 0; i < steps; i++) {
    const t = (i / steps) * Math.PI * 2;
    const c = Math.cos(t), s = Math.sin(t);
    const x = cx + half * Math.sign(c) * Math.abs(c) ** (2 / n);
    const y = cy + half * Math.sign(s) * Math.abs(s) ** (2 / n);
    d += `${i ? 'L' : 'M'}${x.toFixed(2)} ${y.toFixed(2)}`;
  }
  return d + 'Z';
}

// flowerScale: flower size relative to the background it sits on.
function svg({ theme, shape, flowerScale }) {
  const t = THEMES[theme];
  const S = 1024;
  const tile = shape === 'tile';
  const half = tile ? S * 0.41 : S / 2; // tile = 82% of canvas, as macOS's icon grid
  const cy0 = tile ? S / 2 - 6 : S / 2;
  const bgPath = tile ? squircle(S / 2, cy0, half) : `M0 0H${S}V${S}H0Z`;
  const R = half * flowerScale;            // flower radius
  const r = R * 0.52, d = R - r;           // petal radius and distance from centre: neighbours overlap
  const grads = [], petals = [];
  PETALS.forEach(([inner, outer], i) => {
    const a = (-90 + i * 72) * Math.PI / 180;
    const x = S / 2 + d * Math.cos(a), y = cy0 + d * Math.sin(a);
    // Light from the flower's centre outwards: pale where petals meet, saturated at the rim.
    grads.push(`<radialGradient id="g${i}" gradientUnits="userSpaceOnUse" cx="${S / 2}" cy="${cy0}" r="${R}">
      <stop offset="0.15" stop-color="${inner}"/><stop offset="1" stop-color="${outer}"/></radialGradient>`);
    petals.push(`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r.toFixed(1)}" fill="url(#g${i})" fill-opacity="${t.alpha}" style="mix-blend-mode:${t.blend}"/>`);
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}" viewBox="0 0 ${S} ${S}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${t.top}"/><stop offset="1" stop-color="${t.bottom}"/>
    </linearGradient>
    <linearGradient id="rim" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${t.hi}" stop-opacity="0.9"/><stop offset="0.2" stop-color="${t.hi}" stop-opacity="0"/>
    </linearGradient>
    <radialGradient id="stamen" cx="0.4" cy="0.35" r="0.7">
      <stop offset="0" stop-color="#ffffff"/><stop offset="0.6" stop-color="${t.stamen}"/><stop offset="1" stop-color="${t.stamenEdge}"/>
    </radialGradient>
    ${grads.join('')}
    <filter id="drop" x="-20%" y="-20%" width="140%" height="150%">
      <feGaussianBlur in="SourceAlpha" stdDeviation="12"/><feOffset dy="14"/>
      <feComponentTransfer><feFuncA type="linear" slope="0.24"/></feComponentTransfer>
      <feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>
  <g ${tile ? 'filter="url(#drop)"' : ''}><path d="${bgPath}" fill="url(#bg)"/></g>
  <path d="${bgPath}" fill="url(#rim)"/>
  ${tile ? `<path d="${bgPath}" fill="none" stroke="${t.edge}" stroke-width="3"/>` : ''}
  <g style="isolation:isolate">${petals.join('')}</g>
  <circle cx="${S / 2}" cy="${cy0}" r="${(r * 0.34).toFixed(1)}" fill="url(#stamen)"/>
</svg>`;
}

const TARGETS = [
  // file, size, theme, shape, flowerScale
  ['icon-512-pwa.png', 512, 'light', 'tile', 0.74],
  ['icon-192-pwa.png', 192, 'light', 'tile', 0.74],
  ['icon-192.png', 192, 'light', 'tile', 0.74],
  ['icon-192-dark.png', 192, 'dark', 'tile', 0.74],
  ['apple-touch-icon.png', 180, 'light', 'full', 0.70],
  ['apple-touch-icon-dark.png', 180, 'dark', 'full', 0.70],
  ['icon-512-maskable.png', 512, 'light', 'full', 0.62], // inside the 80% safe circle
];

// CHROMIUM_PATH: a browser outside Playwright's own cache (the cloud container's /opt/pw-browsers/chromium).
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const page = await browser.newPage({ deviceScaleFactor: 1 });
for (const [file, size, theme, shape, flowerScale] of TARGETS) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<html><body style="margin:0;background:transparent">
    <img src="data:image/svg+xml;base64,${Buffer.from(svg({ theme, shape, flowerScale })).toString('base64')}"
         width="${size}" height="${size}" style="display:block"></body></html>`);
  await page.waitForFunction(() => document.images[0].complete);
  await page.screenshot({ path: path.join(OUT, file), omitBackground: true });
  console.log('wrote', file);
}
await browser.close();
