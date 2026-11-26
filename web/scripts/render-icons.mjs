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

// Design (owner 2026-11-26): the overlapping-translucent-petal effect of Apple's Photos icon, in
// Sakura's own greys (no colour). Five petals, Sakura's glyph pulled in so neighbours overlap; each
// overlap multiplies into a deeper grey, which is where the depth comes from. Petal tones differ
// slightly, as in flower-glyph.svg, so every overlap reads. Dark: light petals with a screen blend.
// [inner, outer] per petal, clockwise from the top; light and dark sets.
const PETALS = {
  light: [['#e2e1de', '#5f5e5b'], ['#e8e7e4', '#7b7a77'], ['#e5e4e1', '#6d6c69'], ['#ecebe8', '#8c8b87'], ['#eae9e6', '#81807c']],
  dark: [['#5a5a5c', '#e9e8e5'], ['#4e4e50', '#cfcecb'], ['#545456', '#dbdad7'], ['#474749', '#bdbcb9'], ['#4b4b4d', '#c6c5c2']],
};

const THEMES = {
  light: { top: '#ffffff', bottom: '#eeede9', edge: 'rgba(0,0,0,0.08)', hi: 'rgba(255,255,255,1)',
    blend: 'multiply', alpha: 0.78, stamen: '#a3a29e', stamenEdge: '#6f6e6b' },
  dark: { top: '#2b2b2d', bottom: '#111112', edge: 'rgba(255,255,255,0.08)', hi: 'rgba(255,255,255,0.10)',
    blend: 'screen', alpha: 0.62, stamen: '#8c8b88', stamenEdge: '#5e5d5b' },
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
  PETALS[theme].forEach(([inner, outer], i) => {
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
      <stop offset="0" stop-color="${t.stamen}" stop-opacity="0.6"/><stop offset="0.6" stop-color="${t.stamen}"/><stop offset="1" stop-color="${t.stamenEdge}"/>
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
