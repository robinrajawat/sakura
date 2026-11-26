// Renders every Sakura icon file in web/public from one design: the original flower (flower-glyph.svg's
// five petals and centre, geometry unchanged), soft-lit (owner 2026-11-26: "keep the background,
// properly rounded, with a 3D feel"; variant A of three). Each petal is gently lit from above, a thin
// highlight runs along its upper edge, and the flower casts a soft shadow onto what it sits on.
//
//   CHROMIUM_PATH=/opt/pw-browsers/chromium node web/scripts/render-icons.mjs   (cloud container)
//   node web/scripts/render-icons.mjs                                            (Playwright's own browser)
//
// Each surface clips differently, so each gets the shape it needs:
//   tile  - Apple-style squircle (superellipse, not a rounded rect) inside a transparent margin, with
//           a soft shadow. Desktop Chrome/Windows/macOS installs and Claude's connector list show the
//           PNG as-is, so the rounding has to be in the image.
//   full  - opaque square, edge to edge. iOS home screen and Android launchers draw their own mask
//           over it; a pre-rounded icon there shows black or white corners.
//   glyph - the soft-lit flower alone on transparent, for tab favicons. Safari on an iPad draws its own
//           rounded plate behind a tab icon, so a baked-in tile there shows as a tile within a tile.
//           PNGs can't follow the tab bar's theme, so they use a mid-grey that reads on light and dark.
// flower-glyph.svg is written as text: a vector that switches ink on dark tab bars by itself.
// The flower drawn inside the app (the .sakura-mark SVGs in index.html) gets the same light from
// src/styles/index/sakura-mark.css and the #sakura-mark-light gradient.
import { chromium } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');

// flower-glyph.svg geometry on a 512 grid: cx, cy, r, ink strength.
const PETALS = [
  [256, 152, 71, 0.72], [122, 240, 67, 0.62], [390, 240, 67, 0.64],
  [166, 360, 63, 0.56], [346, 360, 67, 0.56], [256, 256, 37, 0.40],
];

const THEMES = {
  light: { top: '#ffffff', bottom: '#ebe9e4', ink: '34,34,34', edge: 'rgba(0,0,0,0.09)', rimAlpha: 0.9, shine: 0.28, shadow: 0.28 },
  dark: { top: '#38383b', bottom: '#131315', ink: '236,236,234', edge: 'rgba(255,255,255,0.08)', rimAlpha: 0.12, shine: 0.35, shadow: 0.7 },
  // Transparent PNG favicons: no theme switching, so a grey that holds up on white and on near-black.
  neutral: { ink: '84,83,80', shine: 0.35, shadow: 0.3 },
};

// Superellipse |x|^n + |y|^n = 1, the continuous-corner shape Apple's icons use.
function squircle(cx, cy, half, n = 5, steps = 256) {
  let d = '';
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    const c = Math.cos(a), s = Math.sin(a);
    const x = cx + half * Math.sign(c) * Math.abs(c) ** (2 / n);
    const y = cy + half * Math.sign(s) * Math.abs(s) ** (2 / n);
    d += `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`;
  }
  return d + 'Z';
}

// The soft-lit flower on the 512 grid. `ink(i)` gives each stop's colour attribute(s) so the same
// code serves fixed-colour PNGs and the CSS-variable tab SVG.
function flower({ ink, shadow, shine, strokeAttr }) {
  const defs = PETALS.map(([, , , a], i) => `<linearGradient id="g${i}" x1="0" y1="0" x2="0" y2="1">`
    + `<stop offset="0" ${ink((a * 0.72).toFixed(3))}/><stop offset="1" ${ink(Math.min(1, a * 1.18).toFixed(3))}/></linearGradient>`).join('')
    + `<filter id="sh" x="-30%" y="-30%" width="160%" height="170%"><feGaussianBlur in="SourceAlpha" stdDeviation="6.5"/>`
    + `<feOffset dy="7"/><feComponentTransfer><feFuncA type="linear" slope="${shadow}"/></feComponentTransfer>`
    + `<feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge></filter>`;
  const body = '<g filter="url(#sh)">'
    + PETALS.map(([x, y, r], i) => `<circle cx="${x}" cy="${y}" r="${r}" fill="url(#g${i})" ${strokeAttr} stroke-width="2.2"/>`).join('')
    + '</g>'
    // A thin highlight along each petal's upper-left edge: light from above.
    + PETALS.slice(0, 5).map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r - 2}" fill="none" stroke="#fff" stroke-opacity="${shine}" stroke-width="2.2" stroke-linecap="round" stroke-dasharray="${(r * 1.2).toFixed(1)} ${(r * 9).toFixed(1)}" transform="rotate(200 ${x} ${y})"/>`).join('');
  return { defs, body };
}

const fixedInk = (t) => flower({
  ink: (op) => `stop-color="rgb(${t.ink})" stop-opacity="${op}"`,
  shadow: t.shadow, shine: t.shine, strokeAttr: `stroke="rgba(${t.ink},0.35)"`,
});

// The flower alone, filling a 512 box with room for its shadow.
const GLYPH_FIT = 'translate(256 256) scale(0.94) translate(-256 -262)';

// shape: tile | full | glyph. flowerScale: flower width relative to the background it sits on.
function iconSvg({ theme, shape, flowerScale }) {
  const t = THEMES[theme];
  const f = fixedInk(t);
  if (shape === 'glyph') {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><defs>${f.defs}</defs><g transform="${GLYPH_FIT}">${f.body}</g></svg>`;
  }
  const S = 1024;
  const tile = shape === 'tile';
  const half = tile ? S * 0.41 : S / 2; // tile = 82% of the canvas, as macOS's icon grid
  const cy = tile ? S / 2 - 6 : S / 2;
  const bg = tile ? squircle(S / 2, cy, half) : `M0 0H${S}V${S}H0Z`;
  const k = (half * 2 * flowerScale) / 512;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${S} ${S}"><defs>`
    + `<linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${t.top}"/><stop offset="1" stop-color="${t.bottom}"/></linearGradient>`
    + `<linearGradient id="rim" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity="${t.rimAlpha}"/><stop offset="0.2" stop-color="#fff" stop-opacity="0"/></linearGradient>`
    + `<filter id="drop" x="-20%" y="-20%" width="140%" height="150%"><feGaussianBlur in="SourceAlpha" stdDeviation="12"/><feOffset dy="14"/>`
    + `<feComponentTransfer><feFuncA type="linear" slope="0.24"/></feComponentTransfer><feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge></filter>`
    + `${f.defs}</defs>`
    + `<g${tile ? ' filter="url(#drop)"' : ''}><path d="${bg}" fill="url(#bg)"/></g>`
    + `<path d="${bg}" fill="url(#rim)"/>`
    + (tile ? `<path d="${bg}" fill="none" stroke="${t.edge}" stroke-width="3"/>` : '')
    + `<g transform="translate(${S / 2} ${cy + 6}) scale(${k.toFixed(4)}) translate(-256 -256)">${f.body}</g></svg>`;
}

// flower-glyph.svg, the tab favicon: ink #222, switching to #ececea on dark tab bars through its own
// prefers-color-scheme rule (a CSS variable drives the gradient stops and outlines).
function tabSvg() {
  const f = flower({
    ink: (op) => `style="stop-color:var(--ink);stop-opacity:${op}"`,
    shadow: 0.3, shine: 0.3, strokeAttr: 'class="p"',
  });
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><style>svg{--ink:#222}'
    + '@media (prefers-color-scheme:dark){svg{--ink:#ececea}}.p{stroke:var(--ink);stroke-opacity:.35}</style>'
    + `<defs>${f.defs}</defs><g transform="${GLYPH_FIT}">${f.body}</g></svg>\n`;
}

const TARGETS = [
  // file, size, theme, shape, flowerScale
  ['icon-512-pwa.png', 512, 'light', 'tile', 0.70],
  ['icon-192-pwa.png', 192, 'light', 'tile', 0.70],
  ['icon-192.png', 192, 'light', 'tile', 0.70],
  ['icon-192-dark.png', 192, 'dark', 'tile', 0.70],
  ['apple-touch-icon.png', 180, 'light', 'full', 0.62],
  ['apple-touch-icon-dark.png', 180, 'dark', 'full', 0.62],
  ['icon-512-maskable.png', 512, 'light', 'full', 0.52], // inside the 80% safe circle
  ['favicon-192.png', 192, 'neutral', 'glyph'],
  ['icon-glyph-192.png', 192, 'neutral', 'glyph'],
];

writeFileSync(path.join(OUT, 'flower-glyph.svg'), tabSvg());
console.log('wrote flower-glyph.svg');

// CHROMIUM_PATH: a browser outside Playwright's own cache (the cloud container's /opt/pw-browsers/chromium).
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const page = await browser.newPage({ deviceScaleFactor: 1 });
for (const [file, size, theme, shape, flowerScale] of TARGETS) {
  await page.setViewportSize({ width: size, height: size });
  const src = Buffer.from(iconSvg({ theme, shape, flowerScale })).toString('base64');
  await page.setContent(`<html><body style="margin:0;background:transparent"><img src="data:image/svg+xml;base64,${src}" width="${size}" height="${size}" style="display:block"></body></html>`);
  await page.waitForFunction(() => document.images[0].complete);
  await page.screenshot({ path: path.join(OUT, file), omitBackground: true });
  console.log('wrote', file);
}
await browser.close();
