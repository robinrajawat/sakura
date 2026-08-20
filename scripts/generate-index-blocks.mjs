#!/usr/bin/env node
/**
 * Phase 2 (docs/architecture-plan.md) codegen: compiles a tested src/state/*.ts module to
 * plain JS and splices it into index.html between a pair of marker comments, replacing what
 * used to be hand-written code with output mechanically produced from tested source.
 *
 * index.html itself is UNCHANGED as a deployment artifact: still one file, still a classic
 * (non-module) <script>, still served exactly as before. Only how one clearly-marked block
 * within it is produced has changed — from "typed by hand" to "generated from src/, and
 * checked in CI to never silently drift from it again" (see --verify below).
 *
 * How a module reaches the classic script's shared scope: the compiled output keeps its
 * top-level `function`/`let`/`const` declarations exactly as tsc emits them (only the
 * `export ` keyword is stripped) and is spliced in-place, textually, into the SAME <script>
 * tag as the rest of the app — no import/export, no IIFE wrapper, no window.* indirection.
 * Because it's literally sharing the same script-level scope at runtime, it can reference
 * true ambient globals (currentUser, sharedDocMeta, el, loadFirestoreMods, ...) directly, and
 * the rest of the file can keep calling its exported functions (startPresenceTrackingIfShared,
 * stopPresenceTracking, ...) exactly as it always did — this is why every existing external
 * call site in index.html needed zero changes.
 *
 * Usage:
 *   node scripts/generate-index-blocks.mjs           regenerate index.html in place
 *   node scripts/generate-index-blocks.mjs --verify   exit 1 if regenerating would change
 *                                                      index.html (used by CI)
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const indexPath = path.join(repoRoot, 'index.html');

/**
 * One entry per generated block. Each block owns a contiguous region of index.html between
 * `GENERATED:<name>:START` and `GENERATED:<name>:END` marker comments, compiled from exactly
 * one source module, with a footer that wires the compiled functions up to real ambient
 * globals (see each block's `footer`).
 */
const BLOCKS = [
  {
    name: 'presence',
    sourceFile: 'src/state/presence.ts',
    testFile: 'tests/unit/presenceState.test.ts',
    footer: `
// --- production wiring (also generated, not hand-written — see the header above) ---
// Real ambient globals, referenced directly since this code shares the classic script's own
// scope at runtime: currentUser, sharedDocMeta, docShareStatusCache, loadFirestoreMods, el.
initPresenceState({
  getCurrentUser:()=>currentUser,
  getSharedDocMeta:(docId)=>sharedDocMeta[docId],
  getDocShareStatusCache:(docId)=>docShareStatusCache[docId],
  loadFirestoreMods:()=>loadFirestoreMods(),
  getChipElement:()=>el('doc-presence-chip'),
  setInterval:(fn,ms)=>setInterval(fn,ms),
  clearInterval:(id)=>clearInterval(id),
  now:()=>Date.now()
});
window.addEventListener('beforeunload',handlePresenceBeforeUnload);
`.trim()
  },
  {
    name: 'notifications',
    sourceFile: 'src/state/notifications.ts',
    testFile: 'tests/unit/notificationsState.test.ts',
    footer: `
// --- production wiring (also generated, not hand-written — see the header above) ---
// renderNotifList itself stays hand-written just below this block (see the file header on
// src/state/notifications.ts for why) — referenced here only as an injected callback.
initNotificationsState({
  getCurrentUser:()=>currentUser,
  loadFirestoreMods:()=>loadFirestoreMods(),
  getLocalStorage:()=>{ try{ return localStorage; }catch(e){ return null; } },
  getBadgeElement:()=>el('notif-badge'),
  getMenuElement:()=>el('notif-menu'),
  getToggleElement:()=>el('notif-toggle'),
  showToast:(msg)=>showToast(msg),
  renderNotifList:()=>renderNotifList(),
  now:()=>Date.now(),
  randomId:()=>Math.random().toString(36).slice(2,8)
});
bootLocalNotifications();
el('notif-clear-all-btn')?.addEventListener('click',e=>{ e.stopPropagation(); clearAllNotifications(); });
el('notif-toggle')?.addEventListener('click',e=>{ e.stopPropagation(); el('settings-panel')?.classList.remove('open'); el('help-panel')?.classList.remove('open'); el('export-menu')?.classList.remove('open'); el('more-menu')?.classList.remove('open'); el('appbar-more-menu')?.classList.remove('open'); el('scale-popover')?.classList.remove('open'); el('account-menu')?.classList.remove('open'); toggleNotifMenu(); });
document.addEventListener('click',e=>{ if(isNotifMenuOpen()&&!e.target.closest('#notif-wrap'))toggleNotifMenu(false); });
`.trim()
  }
];

function compileToPlainJs(sourceFile) {
  const tmpDir = mkdtempSync(path.join(tmpdir(), 'sakura-codegen-'));
  try {
    execFileSync(
      process.platform === 'win32' ? 'npx.cmd' : 'npx',
      [
        'tsc',
        path.join(repoRoot, sourceFile),
        '--outDir', tmpDir,
        '--target', 'ES2020',
        '--module', 'ESNext',
        '--moduleResolution', 'Bundler',
        '--lib', 'ES2020,DOM',
        '--skipLibCheck',
        '--strict', 'false'
      ],
      { cwd: repoRoot, stdio: ['ignore', 'pipe', 'pipe'] }
    );
    const outFile = path.join(tmpDir, path.basename(sourceFile).replace(/\.ts$/, '.js'));
    const compiled = readFileSync(outFile, 'utf8');
    // The only post-processing needed: strip the `export ` keyword from top-level
    // declarations. Safe and simple specifically because these source modules are written
    // with NO imports and NO re-exports (a deliberate constraint — see each module's own
    // header comment) — a more complex module graph would need real bundling, not a text
    // strip. TS already fully erases `interface`/`type` declarations from JS output, so
    // there's nothing to do about those.
    return compiled.replace(/^export (?=(?:async function|function|const)\b)/gm, '');
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
}

function buildGeneratedBlock(block, compiled) {
  const startMarker = `/* GENERATED:${block.name}:START — DO NOT EDIT BY HAND. Source of truth: ${block.sourceFile} (tests: ${block.testFile}). Regenerate with \`npm run generate\` after changing the source; CI fails if this block drifts from what the generator produces (see .github/workflows/ci.yml and scripts/generate-index-blocks.mjs). */`;
  const endMarker = `/* GENERATED:${block.name}:END */`;
  return `${startMarker}\n${compiled}\n${block.footer}\n${endMarker}`;
}

function spliceBlock(html, block, compiled) {
  const startTag = `GENERATED:${block.name}:START`;
  const endTag = `GENERATED:${block.name}:END`;
  const startIdx = html.indexOf(startTag);
  const endIdx = html.indexOf(endTag);
  if (startIdx === -1 || endIdx === -1) {
    throw new Error(
      `Marker comments for block "${block.name}" not found in index.html (looked for ${startTag} / ${endTag}). ` +
        `These must exist already — this script replaces content BETWEEN existing markers, it doesn't create them.`
    );
  }
  // Find the actual start/end of the marker COMMENTS themselves (the /* ... */ they're inside),
  // not just the tag text, so the whole old comment+code+comment gets replaced cleanly.
  const commentStart = html.lastIndexOf('/*', startIdx);
  const commentEnd = html.indexOf('*/', endIdx) + 2;
  const generated = buildGeneratedBlock(block, compiled);
  return html.slice(0, commentStart) + generated + html.slice(commentEnd);
}

function extractTopLevelIdentifiers(compiledJs) {
  // Matches this project's actual compiled shape (tsc target ES2020, no minification): each
  // top-level declaration starts at column 0. Covers what these modules use: `function name`,
  // `async function name`, `let name`, `const name`, and comma-joined `let a = 1, b = 2;`.
  const names = new Set();
  const declRe = /^(?:async function|function)\s+([A-Za-z_$][\w$]*)/gm;
  let m;
  while ((m = declRe.exec(compiledJs))) names.add(m[1]);
  const varRe = /^(?:let|const)\s+(.+);$/gm;
  while ((m = varRe.exec(compiledJs))) {
    for (const part of m[1].split(',')) {
      const nameMatch = part.trim().match(/^([A-Za-z_$][\w$]*)/);
      if (nameMatch) names.add(nameMatch[1]);
    }
  }
  return names;
}

/**
 * All generated blocks share ONE script scope at runtime (see the file header) — a top-level
 * `let`/`const`/`function` name reused across two blocks is a duplicate declaration, which is a
 * hard SyntaxError for `let`/`const` (and silent, order-dependent shadowing for `function`,
 * which is barely better). This caught a real instance of exactly that bug during development
 * (both presence.ts and notifications.ts independently declared `deps`/`requireDeps`) — that
 * was found by manually grepping the generated output; this check makes it impossible to miss
 * again, for this block or any future one.
 */
function checkForCrossBlockNameCollisions(compiledByBlock) {
  const ownerOf = new Map(); // name -> block name that declared it first
  const collisions = [];
  for (const { name: blockName, compiled } of compiledByBlock) {
    for (const identifier of extractTopLevelIdentifiers(compiled)) {
      const existingOwner = ownerOf.get(identifier);
      if (existingOwner && existingOwner !== blockName) {
        collisions.push(`"${identifier}" declared by both "${existingOwner}" and "${blockName}"`);
      } else {
        ownerOf.set(identifier, blockName);
      }
    }
  }
  if (collisions.length) {
    throw new Error(
      'Top-level identifier collision(s) between generated blocks — these share one script ' +
        'scope at runtime, so this would be a duplicate declaration (SyntaxError for let/const):\n' +
        collisions.map((c) => '  - ' + c).join('\n') +
        '\nRename the colliding identifier(s) in the source module(s) (e.g. prefix module-' +
        'private internals with the domain name, as notifications.ts does with notifDeps/' +
        'requireNotifDeps) and regenerate.'
    );
  }
}

function generate() {
  let html = readFileSync(indexPath, 'utf8');
  const compiledByBlock = BLOCKS.map((block) => ({ name: block.name, compiled: compileToPlainJs(block.sourceFile) }));
  checkForCrossBlockNameCollisions(compiledByBlock);
  for (let i = 0; i < BLOCKS.length; i++) {
    html = spliceBlock(html, BLOCKS[i], compiledByBlock[i].compiled);
  }
  return html;
}

const verifyMode = process.argv.includes('--verify');
const newHtml = generate();

if (verifyMode) {
  const currentHtml = readFileSync(indexPath, 'utf8');
  if (currentHtml !== newHtml) {
    console.error(
      '✖ index.html has drifted from what scripts/generate-index-blocks.mjs would produce ' +
        'from the tested source in src/state/. Run `npm run generate` and commit the result.'
    );
    process.exit(1);
  }
  console.log('✓ index.html matches the generated output — no drift.');
} else {
  writeFileSync(indexPath, newHtml, 'utf8');
  console.log('✓ Regenerated index.html from src/state/.');
}
