#!/usr/bin/env node
/**
 * Phase 2 (docs/architecture-plan.md) codegen: compiles a tested src/state/*.ts (or src/core/,
 * src/utils/) module to plain JS and splices it into a target HTML file (index.html or
 * hub.html — see each block's `targetFile`) between a pair of marker comments, replacing what
 * used to be hand-written code with output mechanically produced from tested source.
 *
 * The target file itself is UNCHANGED as a deployment artifact: still one file, still a classic
 * (non-module) <script>, still served exactly as before. Only how one clearly-marked block
 * within it is produced has changed — from "typed by hand" to "generated from src/, and
 * checked in CI to never silently drift from it again" (see --verify below).
 *
 * How a module reaches the classic script's shared scope: the compiled output keeps its
 * top-level `function`/`let`/`const` declarations exactly as tsc emits them (only the
 * `export ` keyword is stripped) and is spliced in-place, textually, into the SAME <script>
 * tag as the rest of that file — no import/export, no IIFE wrapper, no window.* indirection.
 * Because it's literally sharing the same script-level scope at runtime, it can reference
 * true ambient globals (currentUser, sharedDocMeta, el, loadFirestoreMods, ...) directly, and
 * the rest of the file can keep calling its exported functions (startPresenceTrackingIfShared,
 * stopPresenceTracking, ...) exactly as it always did — this is why every existing external
 * call site needed zero changes.
 *
 * index.html and hub.html are entirely SEPARATE runtime script scopes — a block targeting
 * hub.html can reuse the exact same `sourceFile` as a block targeting index.html (see
 * `hubGenerateId` below reusing generateId.ts) without any collision, since the two compiled
 * copies never coexist in the same <script> tag. Collision-checking is scoped per target file
 * accordingly (see `generate()` below).
 *
 * Usage:
 *   node scripts/generate-index-blocks.mjs           regenerate index.html and hub.html in place
 *   node scripts/generate-index-blocks.mjs --verify   exit 1 if regenerating would change either
 *                                                      file (used by CI)
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync, rmSync, readdirSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const indexPath = path.join(repoRoot, 'index.html');
const hubPath = path.join(repoRoot, 'hub.html');
const TARGET_FILE_PATHS = { 'index.html': indexPath, 'hub.html': hubPath };

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
  },
  {
    name: 'admin',
    sourceFile: 'src/state/admin.ts',
    testFile: 'tests/unit/adminState.test.ts',
    footer: `
// --- production wiring (also generated, not hand-written — see the header above) ---
initAdminState({
  loadFirestoreMods:()=>loadFirestoreMods(),
  getAdminSectionElement:()=>el('settings-section-account-admin'),
  closeFeedbackInboxModal:()=>closeFeedbackInboxModal()
});
`.trim()
  },
  {
    name: 'vault',
    sourceFile: 'src/state/vault.ts',
    testFile: 'tests/unit/vaultState.test.ts',
    footer: `
// --- production wiring (also generated, not hand-written — see the header above) ---
initVaultState({
  getLocalStorage:()=>{ try{ return localStorage; }catch(e){ return null; } }
});
`.trim()
  },
  {
    name: 'nodeQueries',
    sourceFile: 'src/core/nodeQueries.ts',
    testFile: 'tests/unit/nodeQueries.test.ts',
    // No production wiring needed — these are pure functions (no ambient-global side effects
    // to initialize), unlike the Phase 2 state modules above. Every call site elsewhere in
    // index.html was updated in the same commit that wired this block in, to pass the
    // now-required explicit arguments (nodes, collapsedIds, treeIndentWidth,
    // sectionMarkersDepthZero, selectAllMode, multiSelectedIds, selectedId as applicable per
    // function) instead of relying on this block's functions reading those as ambient globals.
    footer: ''
  },
  {
    name: 'escapeHtml',
    sourceFile: 'src/utils/escapeHtml.ts',
    testFile: 'tests/unit/escapeHtml.test.ts',
    // The exported name is `escapeHtml`, but index.html's ~231 real call sites all call the
    // original short name `esc(...)`. Rather than touch every call site for a pure rename,
    // this footer adds a thin wrapper preserving the old name — the same
    // "same-shaped getter when a rename is otherwise wanted" pattern the architecture doc
    // describes for Phase 2 (e.g. isPresenceTrackingDocId()). Zero call sites changed.
    footer: 'function esc(value){return escapeHtml(value);}'
  },
  {
    name: 'generateId',
    sourceFile: 'src/utils/generateId.ts',
    testFile: 'tests/unit/generateId.test.ts',
    // generateId(prefix, randomSuffixLength=5) unifies three near-identical hand-written
    // copies. genDocId's call sites live right where this block splices in, so it gets its
    // wrapper here; genTemplateId and mnUid live elsewhere in index.html and were hand-edited
    // in the same commit to delegate to this generated function too (genTemplateId(){return
    // generateId('t')}, mnUid(){return generateId('mn',6)}) — trivial one-line bodies, not
    // worth their own generated blocks, but no longer duplicating the id-generation logic.
    // Zero call sites of any of the three changed.
    footer: `function genDocId(){return generateId('d');}`
  },
  {
    name: 'formatRelativeTime',
    sourceFile: 'src/utils/formatRelativeTime.ts',
    testFile: 'tests/unit/formatRelativeTime.test.ts',
    // Name and signature both match the original exactly (the added `now` parameter is
    // optional, defaulting to Date.now() — every real call site still passes one argument).
    // Zero call sites changed, no wrapper needed.
    footer: ''
  },
  {
    name: 'stripSemanticMarkers',
    sourceFile: 'src/utils/stripSemanticMarkers.ts',
    testFile: 'tests/unit/stripSemanticMarkers.test.ts',
    // Exports stripSemanticMarkers(text) and getNodePlainText(node) — both names and
    // signatures match the originals exactly. Zero call sites changed, no wrapper needed.
    footer: ''
  },
  {
    name: 'serializeMarkdown',
    sourceFile: 'src/utils/serializeMarkdown.ts',
    testFile: 'tests/unit/serializeMarkdown.test.ts',
    // Exports computeOutlineNumbers(list, outlineNumbering) and
    // serializeMarkdown(scopeNodes, rebaseDepth, outlineNumbering) — both gained a required
    // explicit outlineNumbering parameter in place of an implicit global read (no default,
    // same reasoning as nodeQueries.ts's sectionMarkersDepthZero: no universally-correct
    // default for a user preference). 6 real call sites updated in the same commit that wired
    // this block in (a relocation pass first made the two functions contiguous, since they
    // were originally interleaved with un-extracted sibling functions like serializeTreeText).
    footer: ''
  },
  {
    name: 'templatesIndex',
    sourceFile: 'src/state/templatesIndex.ts',
    testFile: 'tests/unit/templatesIndexState.test.ts',
    footer: `
// --- production wiring (also generated, not hand-written — see the header above) ---
// Real ambient globals, referenced directly since this code shares the classic script's own
// scope at runtime: localStorage, markMetaChanged, scheduleBackupWrite, lastAnyDataChangeAt.
initTemplatesIndexState({
  getLocalStorage:()=>{ try{ return localStorage; }catch(e){ return null; } },
  markMetaChanged:(metaKey)=>markMetaChanged(metaKey),
  scheduleBackupWrite:()=>{ if(typeof scheduleBackupWrite==='function')scheduleBackupWrite(); },
  setLastAnyDataChangeAt:(ts)=>{ lastAnyDataChangeAt=ts; },
  now:()=>Date.now()
});
`.trim()
  },
  {
    name: 'aiProviders',
    sourceFile: 'src/state/aiProviders.ts',
    testFile: 'tests/unit/aiProvidersState.test.ts',
    footer: `
// --- production wiring (also generated, not hand-written — see the header above) ---
// Real ambient global, referenced directly since this code shares the classic script's own
// scope at runtime: localStorage.
initAiProvidersState({
  getLocalStorage:()=>{ try{ return localStorage; }catch(e){ return null; } }
});
`.trim()
  },
  {
    name: 'diagramAnchor',
    sourceFile: 'src/state/diagramAnchor.ts',
    testFile: 'tests/unit/diagramAnchor.test.ts',
    // No production wiring needed — pure functions (reorderDiagramsCore mutates the diagrams
    // array passed to it, same convention as nodeMutations.ts/tabOrder.ts's own in-place-
    // mutation pattern; no DOM/undo-stack/render side effects). The four real call sites
    // (diagramAnchorLabel/reorderDiagramRow/diagramIsOrphaned/diagramNeedsAttention wrapper
    // bodies in index.html) were updated in the same commit that wired this block in.
    footer: ''
  },
  {
    name: 'tabOrder',
    sourceFile: 'src/state/tabOrder.ts',
    testFile: 'tests/unit/tabOrder.test.ts',
    // No production wiring needed — pure functions (reorderTabsCore mutates the openTabs array
    // passed to it, same convention as nodeMutations.ts/nodeSelection.ts's own in-place-mutation
    // pattern; no DOM/localStorage side effects). The two real call sites (cycleOpenTab/
    // reorderTab wrapper bodies in index.html) were updated in the same commit that wired this
    // block in.
    footer: ''
  },
  {
    name: 'nodeSearch',
    sourceFile: 'src/core/nodeSearch.ts',
    testFile: 'tests/unit/nodeSearch.test.ts',
    // No production wiring needed — pure functions, no DOM/undo-stack/render side effects. The
    // one real call site (computeSearchMatches's own wrapper body in index.html) was updated in
    // the same commit that wired this block in.
    footer: ''
  },
  {
    name: 'nodeSelection',
    sourceFile: 'src/core/nodeSelection.ts',
    testFile: 'tests/unit/nodeSelection.test.ts',
    // No production wiring needed — these are pure functions (rebuildParentIdsCore mutates the
    // `nodes` array passed to it, same as nodeMutations.ts's own convention; no DOM/undo-stack/
    // render side effects). The three real call sites (getSelectedIds/getSelectionRootIndexes/
    // rebuildParentIds wrapper bodies in index.html) were updated in the same commit that wired
    // this block in.
    footer: ''
  },
  {
    // First slice of Diagrams' larger remainder (see this module's own header for scope notes).
    name: 'diagramDisplayList',
    sourceFile: 'src/state/diagramDisplayList.ts',
    testFile: 'tests/unit/diagramDisplayList.test.ts',
    // No production wiring needed — pure functions, no DOM/undo-stack/render side effects. The
    // real call sites (getDiagramDisplayList/diagramCanReorder wrapper bodies in index.html)
    // were updated in the same commit that wired this block in.
    footer: ''
  },
  {
    name: 'nodeMutations',
    sourceFile: 'src/core/nodeMutations.ts',
    testFile: 'tests/unit/nodeMutations.test.ts',
    // No production wiring needed — these are pure functions (beyond mutating the nodes array
    // itself; no DOM/undo-stack/render side effects), same reasoning as nodeQueries.ts. Both
    // real call sites (indentSelected/outdentSelected's own bodies) were updated in the same
    // commit that wired this block in.
    footer: ''
  },
  {
    // First of the "most promising, most novel" Phase 3 candidates flagged in
    // templatesIndex.ts's own header: applyTemplateNodes is coupled to the ambient nextId
    // counter via makeNode(). See templatesApply.ts's own header for why this is DI'd
    // (injecting the real, hand-written makeNode/emptyStyles as parameters) rather than
    // referenced via the declare-function ambient pattern used elsewhere.
    name: 'templatesApply',
    sourceFile: 'src/core/templatesApply.ts',
    testFile: 'tests/unit/templatesApply.test.ts',
    // No production wiring needed — pure function, deps passed directly by the one real call
    // site (applyTemplateNodes's own wrapper body in index.html), updated in the same commit
    // that wired this block in.
    footer: ''
  },
  {
    // hub.html's own generated-blocks pilot — the first block targeting a file other than
    // index.html, proving the generator's multi-file support with the lowest possible risk:
    // reusing an ALREADY-TESTED source module (generateId.ts, Phase 1) rather than writing new
    // source, since hub.html's todoUid/jnUid/subUid turned out to be exact matches for
    // generateId(prefix, 6) — same `.slice(2,8)` (suffix length 6), just different prefixes.
    // Zero new tests needed; the existing tests/unit/generateId.test.ts already covers this
    // exact function. See this file's header for why targetFile defaults to 'index.html' and
    // must be set explicitly here.
    name: 'hubGenerateId',
    sourceFile: 'src/utils/generateId.ts',
    testFile: 'tests/unit/generateId.test.ts',
    targetFile: 'hub.html',
    // todoUid/jnUid/subUid all become thin wrappers, same names/signatures — zero call sites
    // in hub.html needed to change.
    footer: `
function todoUid(){return generateId('t',6);}
function jnUid(){return generateId('jn',6);}
function subUid(){return generateId('sub',6);}
`.trim()
  },
  {
    // First Hub FEATURE-DOMAIN slice — see this module's own header for why hubGenerateId
    // (the infrastructure pilot above) doesn't count as one.
    name: 'hubTodos',
    sourceFile: 'src/state/hubTodos.ts',
    testFile: 'tests/unit/hubTodos.test.ts',
    targetFile: 'hub.html',
    footer: `
// --- production wiring (also generated, not hand-written — see the header above) ---
// Real ambient globals, referenced directly since this code shares hub.html's own classic
// script scope at runtime: localStorage, bumpSyncTimestamp, pushMetaToCloud, todoUid.
initHubTodosState({
  getLocalStorage:function(){ try{ return localStorage; }catch(e){ return null; } },
  bumpSyncTimestamp:function(metaKey){ bumpSyncTimestamp(metaKey); },
  pushMetaToCloud:function(metaKey,value){ pushMetaToCloud(metaKey,value); },
  now:function(){ return Date.now(); },
  generateTodoId:function(){ return todoUid(); }
});
`.trim()
  },
  {
    // Second Hub feature-domain slice.
    name: 'hubJournal',
    sourceFile: 'src/state/hubJournal.ts',
    testFile: 'tests/unit/hubJournal.test.ts',
    targetFile: 'hub.html',
    footer: `
// --- production wiring (also generated, not hand-written — see the header above) ---
// Real ambient globals, referenced directly since this code shares hub.html's own classic
// script scope at runtime: idbGet, idbSet, bumpSyncTimestamp, pushMetaToCloud, jnUid, todayStr.
initHubJournalState({
  idbGet:function(key){ return idbGet(key); },
  idbSet:function(key,value){ return idbSet(key,value); },
  bumpSyncTimestamp:function(metaKey){ bumpSyncTimestamp(metaKey); },
  pushMetaToCloud:function(metaKey,value){ pushMetaToCloud(metaKey,value); },
  now:function(){ return Date.now(); },
  today:function(){ return todayStr(); },
  generateJournalId:function(){ return jnUid(); }
});
`.trim()
  },
  {
    // Third Hub feature-domain slice — subtask CRUD, flagged as "genuinely separate... not
    // investigated" in hubTodos.ts's own header. subUid comes from the already-generated
    // hubGenerateId block (declare function, not DI — see this module's own header for why).
    name: 'hubSubtasks',
    sourceFile: 'src/state/hubSubtasks.ts',
    testFile: 'tests/unit/hubSubtasks.test.ts',
    targetFile: 'hub.html',
    // No production wiring needed — pure functions (mutate the passed-in task in place, same
    // convention as nodeMutations.ts/tabOrder.ts/diagramAnchor.ts; no DOM/storage side effects
    // of their own). The three real call sites (the subtask toggle/remove click handler and the
    // subtask-input keydown handler) were updated in the same commit that wired this block in.
    footer: ''
  },
  {
    // Fourth Hub feature-domain slice — due-date reminder checking, the last domain flagged as
    // "not investigated" in hubTodos.ts's own header.
    name: 'hubReminders',
    sourceFile: 'src/state/hubReminders.ts',
    testFile: 'tests/unit/hubReminders.test.ts',
    targetFile: 'hub.html',
    // No production wiring needed — pure function (no DOM/Notification-API/storage side effects
    // of its own). The one real call site (checkDueReminders's own body) was updated in the
    // same commit that wired this block in.
    footer: ''
  },
  {
    // First slice of the diagramGen* subsystem (see this module's own header for scope notes
    // and why it lives in src/core/ despite not touching `nodes`). The five target functions
    // were ~500 lines apart in index.html — relocated next to each other in a separate
    // pure-code-motion commit first, so this one contiguous block can replace all five.
    name: 'diagramGenDims',
    sourceFile: 'src/core/diagramGenDims.ts',
    testFile: 'tests/unit/diagramGenDims.test.ts',
    // No production wiring needed — pure functions, no DOM/canvas/AI side effects. The five
    // real call sites (diagramGenHardTruncate/diagramGenLighten/diagramGenAdjustDimsForShape/
    // diagramGenBoxDims/diagramGenMergedBoxDims wrapper bodies in index.html) were updated in
    // the same commit that wired this block in.
    footer: ''
  },
  {
    // Second slice of the diagramGen* subsystem — the pure topology/confirmed-nodeMeta query
    // layer (see this module's own header for full scope notes). 15 functions, relocated next to
    // each other in a separate pure-code-motion commit first (diagramGenIsContainer/IsSequence/
    // IsHorizontal were ~320 lines away from the rest).
    name: 'diagramGenTopology',
    sourceFile: 'src/state/diagramGenTopology.ts',
    testFile: 'tests/unit/diagramGenTopology.test.ts',
    // No production wiring needed — pure functions, no DOM/canvas/AI side effects. All 15 real
    // call sites (the original diagramGenIsContainer/IsSequence/IsHorizontal/AllChildIdxs/
    // HasEdgeLabelTag/ChildIdxs/IsLeaf/IsChainGroup/ChainHeaderSuppressed/IsConfirmedEdgeLabel/
    // IsPassthrough/IsMergeCandidate/RenderChildIdxs/ChainTailIdx/EdgeLabelBefore wrapper bodies
    // in index.html) were updated in the same commit that wired this block in.
    footer: ''
  },
  {
    // Third slice of the diagramGen* subsystem — the nodeMeta classification-proposal and
    // plain-object (de)serialization layer (see this module's own header for full scope notes).
    // Already contiguous in index.html, no pure-code-motion commit needed.
    name: 'diagramGenNodeMeta',
    sourceFile: 'src/state/diagramGenNodeMeta.ts',
    testFile: 'tests/unit/diagramGenNodeMeta.test.ts',
    // No production wiring needed — pure functions, no DOM/canvas/AI side effects. The three
    // real call sites (diagramGenProposeNodeMeta/NodeMetaFromPlain/NodeMetaToPlain wrapper
    // bodies in index.html) were updated in the same commit that wired this block in.
    footer: ''
  }
];

function findFileRecursive(dir, targetName) {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      const found = findFileRecursive(full, targetName);
      if (found) return found;
    } else if (entry === targetName) {
      return full;
    }
  }
  return null;
}

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
    // tsc places the output flat in tmpDir only when the source file has no imports at all
    // (true for every Phase 2 state module). nodeQueries.ts has a `import type` reference to
    // serializeMarkdown.ts — fully erased from the emitted JS (verified: no import statement
    // in output), but its presence makes tsc infer a shared rootDir across both files, so the
    // output lands at <tmpDir>/core/nodeQueries.js, mirroring the source's path under src/,
    // rather than flat. Search for it instead of assuming the flat path.
    const targetName = path.basename(sourceFile).replace(/\.ts$/, '.js');
    const outFile = findFileRecursive(tmpDir, targetName);
    if (!outFile) {
      throw new Error(`Could not find compiled output "${targetName}" anywhere under ${tmpDir}`);
    }
    const compiled = readFileSync(outFile, 'utf8');
    // Two post-processing steps, both safe specifically because every generated block shares
    // ONE script scope with every other block and the rest of index.html at runtime (see the
    // file header) — there is no real module graph here, so anything a real ES module system
    // would need an import for is already available as a bare global once the block that
    // declares it is spliced in, regardless of which physical block appears first (function
    // declarations hoist within the shared script anyway).
    //   1. Strip the `export ` keyword from top-level declarations.
    //   2. Strip any surviving `import ... from '...';` lines. TS erases `import type` entirely
    //      (verified for nodeQueries.ts's reference to serializeMarkdown.ts's types), but a
    //      genuine VALUE import — like serializeMarkdown.ts's `import { getNodePlainText } from
    //      './stripSemanticMarkers'` — survives compilation as a literal top-level `import`
    //      statement. Spliced into the classic (non-module) script, that's a syntax error that
    //      silently kills the ENTIRE script block (not just this one function) — the actual
    //      cause of a real regression caught during this cutover (esc/genDocId/every other
    //      generated function all went undefined at once, because the whole script never ran).
    //      Stripping the import line is correct: getNodePlainText is already declared as a
    //      bare top-level function by the time this code runs, exactly the "no imports, no
    //      re-exports" constraint the Phase 2 module header comments describe — this file just
    //      wasn't fully consistent with its own stated constraint. TS already fully erases
    //      `interface`/`type` declarations from JS output, so there's nothing to do about those.
    return compiled
      .replace(/^export (?=(?:async function|function|const)\b)/gm, '')
      .replace(/^import\s.*$\n?/gm, '');
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
}

function buildGeneratedBlock(block, compiled) {
  const startMarker = `/* GENERATED:${block.name}:START — DO NOT EDIT BY HAND. Source of truth: ${block.sourceFile} (tests: ${block.testFile}). Regenerate with \`npm run generate\` after changing the source; CI fails if this block drifts from what the generator produces (see .github/workflows/ci.yml and scripts/generate-index-blocks.mjs). */`;
  const endMarker = `/* GENERATED:${block.name}:END */`;
  const footerPart = block.footer ? `\n${block.footer}` : '';
  return `${startMarker}\n${compiled}${footerPart}\n${endMarker}`;
}

function spliceBlock(html, block, compiled) {
  const startTag = `GENERATED:${block.name}:START`;
  const endTag = `GENERATED:${block.name}:END`;
  const startIdx = html.indexOf(startTag);
  const endIdx = html.indexOf(endTag);
  if (startIdx === -1 || endIdx === -1) {
    throw new Error(
      `Marker comments for block "${block.name}" not found in ${block.targetFile || 'index.html'} (looked for ${startTag} / ${endTag}). ` +
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
  // Blocks are grouped by targetFile since each HTML file has its own independent classic
  // <script> scope — a name collision only matters between blocks sharing the SAME file, not
  // across files (hub.html's block reusing generateId.ts's `generateId` identifier is not a
  // collision with index.html's own `generateId` block, since they're never in the same
  // runtime scope together).
  const byFile = new Map(); // targetFile -> block[]
  for (const block of BLOCKS) {
    const targetFile = block.targetFile || 'index.html';
    if (!byFile.has(targetFile)) byFile.set(targetFile, []);
    byFile.get(targetFile).push(block);
  }

  const htmlByFile = new Map();
  for (const [targetFile, blocks] of byFile) {
    const filePath = TARGET_FILE_PATHS[targetFile];
    if (!filePath) {
      throw new Error(`Unknown targetFile "${targetFile}" — add it to TARGET_FILE_PATHS at the top of this script.`);
    }
    let html = readFileSync(filePath, 'utf8');
    const compiledByBlock = blocks.map((block) => ({ name: block.name, compiled: compileToPlainJs(block.sourceFile) }));
    checkForCrossBlockNameCollisions(compiledByBlock);
    for (let i = 0; i < blocks.length; i++) {
      html = spliceBlock(html, blocks[i], compiledByBlock[i].compiled);
    }
    htmlByFile.set(targetFile, html);
  }
  return htmlByFile;
}

const verifyMode = process.argv.includes('--verify');
const newHtmlByFile = generate();

if (verifyMode) {
  let anyDrift = false;
  for (const [targetFile, newHtml] of newHtmlByFile) {
    const filePath = TARGET_FILE_PATHS[targetFile];
    const currentHtml = readFileSync(filePath, 'utf8');
    if (currentHtml !== newHtml) {
      console.error(
        `✖ ${targetFile} has drifted from what scripts/generate-index-blocks.mjs would produce ` +
          `from the tested source. Run \`npm run generate\` and commit the result.`
      );
      anyDrift = true;
    }
  }
  if (anyDrift) process.exit(1);
  console.log('✓ index.html and hub.html both match the generated output — no drift.');
} else {
  for (const [targetFile, newHtml] of newHtmlByFile) {
    writeFileSync(TARGET_FILE_PATHS[targetFile], newHtml, 'utf8');
  }
  console.log('✓ Regenerated index.html and hub.html from src/.');
}
