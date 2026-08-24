import { useRef } from 'react';
import { useOutlineStore, defaultNodeStyles, type OutlineNode } from '../store/outlineStore';
import { useDocumentsStore } from '../store/documentsStore';
import { usePadStore } from '../store/padStore';
import { rebuildParentIdsCore } from '../core/nodeSelection';
import { serializeMarkdown } from '../utils/serializeMarkdown';
import { serializeOpmlCore } from '../utils/serializeOpml';
import { parseOpmlToTreeNodesCore } from '../utils/parseOpml';
import { parseSakuraDocumentCore } from '../utils/parseSakuraDocument';
import { parseDocxHtmlToTreeNodesCore } from '../utils/parseDocxHtml';
import { extractFirstImageDataUrl } from '../utils/extractNoteImage';
import { sanitizeRichHtml } from '../utils/sanitizeRichHtml';
import { wrapLineCount, pptxLineHeightIn } from '../utils/wrapLineCount';
import mammoth from 'mammoth';
import { serializeTreeTextCore } from '../utils/serializeTreeText';
import { serializeClipboardHtmlCore } from '../utils/serializeClipboardHtml';
import { getNodePlainText } from '../utils/stripSemanticMarkers';
import { AlignmentType, Document, Footer, HeadingLevel, ImageRun, Packer, Paragraph, TableOfContents, TextRun } from 'docx';
import PptxGenJS from 'pptxgenjs';
import { groupIntoSlides, CLOSING_SLIDE_TEXT, CLOSING_SLIDE_SUBTITLE, BRANDING_TEXT } from './PresenterMode';

/**
 * Plain-text/clipboard export options shared by `exportPlainText`/`exportClipboard` below.
 * Matches legacy's own real defaults for a brand-new user with no saved prefs yet
 * (index.html's top-level `let treeIndentWidth=3` / `let hideTreeLines=true`) -- web/ has no
 * settings panel for either yet, same "no silent default for a live user-preference toggle
 * that doesn't exist here yet" deferral `exportMarkdown`/`exportOpml` already use for
 * `outlineNumbering` above. `rebaseDepth` is always false: legacy only rebases when exporting a
 * subset (Focus mode / a partial selection), and web/ has no such subset concept for these two
 * exports yet -- always the whole tree, depths as stored.
 */
const TREE_INDENT_WIDTH = 3;
const HIDE_TREE_LINES = true;
const OUTLINE_NUMBERING = false;

/**
 * Phase 3 slice (docs/framework-migration-plan.md): exports. Markdown, OPML, and this slice's
 * addition, PDF -- all reuse existing logic/browser capability rather than adding a new
 * document-generation dependency for this one format. PDF specifically uses the browser's own
 * print-to-PDF via window.print() over a temporary print-only window rendering the same node
 * list PreviewPane.tsx renders, rather than a PDF-generation library (jsPDF/pdf-lib) -- every
 * modern browser's native print dialog already produces a real, selectable-text PDF this way,
 * so pulling in a whole PDF-rendering library for this slice would be solving an already-solved
 * problem. Word/PowerPoint remain deferred: unlike PDF, there's no browser-native equivalent,
 * so those genuinely need a real document-generation library (docx/pptxgenjs) wired into the
 * build -- a meaningfully bigger, separately-scoped follow-up.
 */
function download(filename: string, mimeType: string, content: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function escapeHtmlForPrint(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// A CSS margin-box `content: "..."` value is a plain generated-content string, not HTML/JS --
// needs its own escaping (backslash, the quote that would otherwise end the string early, and
// no raw newlines since a margin box renders on one line anyway), matching legacy's own real
// `cssStr` helper (legacy/index.html:39514) exactly.
function cssStr(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\r?\n/g, ' ');
}

// §6.6 fidelity upgrade: Word image embedding (see `exportWord` below and
// `utils/extractNoteImage.ts`'s own header for the full picture). `docx`'s `ImageRun` needs real
// decoded bytes (not a data: URI string) and an explicit `type` from a fixed enum -- these two
// helpers do that decoding/type-mapping/dimension-reading, matching the same kind of real
// (not-guessed) image handling legacy's own hand-rolled `pptxImageDims` does for its own export.
const DATA_URL_TO_DOCX_IMAGE_TYPE: Record<string, 'png' | 'jpg' | 'gif' | 'bmp'> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/bmp': 'bmp'
};

function decodeImageDataUrl(dataUrl: string): { bytes: Uint8Array; type: 'png' | 'jpg' | 'gif' | 'bmp' } | null {
  const match = dataUrl.match(/^data:([^;]+);base64,(.*)$/s);
  if (!match) return null;
  const type = DATA_URL_TO_DOCX_IMAGE_TYPE[match[1].toLowerCase()];
  if (!type) return null; // an unsupported format (svg, webp, ...) -- docx's ImageRun only accepts these four
  const binary = atob(match[2]);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return { bytes, type };
}

// Reads an image's real pixel dimensions by actually loading it -- simpler and more reliable
// than legacy's own hand-rolled PNG/JPEG/GIF header parsing (`pptxImageDims`), since `web/` can
// just ask the browser's own decoder, which every format it accepts already supports natively.
function loadImageDimensions(dataUrl: string): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth || 1, height: img.naturalHeight || 1 });
    img.onerror = () => resolve(null);
    img.src = dataUrl;
  });
}

const MAX_DOCX_IMAGE_WIDTH_PX = 400;

async function buildDocxImageParagraph(dataUrl: string): Promise<Paragraph | null> {
  const decoded = decodeImageDataUrl(dataUrl);
  if (!decoded) return null;
  const dims = await loadImageDimensions(dataUrl);
  if (!dims) return null;
  const scale = Math.min(1, MAX_DOCX_IMAGE_WIDTH_PX / dims.width);
  const width = Math.round(dims.width * scale);
  const height = Math.round(dims.height * scale);
  return new Paragraph({
    children: [new ImageRun({ type: decoded.type, data: decoded.bytes, transformation: { width, height } })]
  });
}

export function ExportButtons() {
  const nodes = useOutlineStore((s) => s.nodes);
  const docsIndex = useDocumentsStore((s) => s.docsIndex);
  const activeDocId = useDocumentsStore((s) => s.activeDocId);
  const newDocument = useDocumentsStore((s) => s.newDocument);
  const notesText = usePadStore((s) => s.notesText);
  const qaItems = usePadStore((s) => s.qaItems);
  const opmlFileInputRef = useRef<HTMLInputElement>(null);
  const sakuraDocFileInputRef = useRef<HTMLInputElement>(null);
  const docxFileInputRef = useRef<HTMLInputElement>(null);

  // OPML import -- direct port of legacy's real `importOpmlText` (legacy/index.html:24581-
  // 24601), the read side of the already-ported `serializeOpmlCore`/`exportOpml`. Always lands
  // in a brand-new document (`newDocument()`), matching legacy's own real guarantee: an import
  // can never silently merge into whatever document happens to already be open. Node ids are
  // assigned from the outline store's own `nextId` counter (matching every other node-creation
  // path in this store, e.g. `duplicateRootIndexesCore`) rather than restarting from 1, and
  // `rebuildParentIdsCore` derives `parentId` from the parsed `depth` values afterward -- the
  // same "build flat with parentId:null, then rebuild" convention `insertParsedNodesCore`'s own
  // callers already use. No toast on "nothing to import" (malformed/empty OPML) -- this project
  // has no toast infrastructure yet, so it silently no-ops, same convention this file's own
  // popup-blocked PDF export already uses.
  async function importOpml(file: File) {
    const text = await file.text();
    const parsed = parseOpmlToTreeNodesCore(text);
    if (!parsed.length) return;
    newDocument();
    let id = useOutlineStore.getState().nextId;
    const mapped: OutlineNode[] = parsed.map((n) => ({
      id: id++,
      depth: n.depth,
      text: n.text,
      parentId: null,
      isCheckbox: n.isCheckbox,
      checked: n.isCheckbox && n.checked,
      note: n.note,
      codeBlock: null,
      tags: [],
      styles: defaultNodeStyles()
    }));
    rebuildParentIdsCore(mapped);
    useOutlineStore.setState({
      nodes: mapped,
      selectedId: mapped[0]?.id ?? null,
      editingId: null,
      multiSelectedIds: [],
      selectionAnchorId: mapped[0]?.id ?? null,
      nextId: id
    });
  }

  // Sakura Document (.sakura.json) export -- direct port of legacy's real
  // `exportSakuraDocumentFile` (legacy/index.html:22038-22075), scoped to what's genuinely real
  // and document-scoped in `web/` today: the outline itself, full-fidelity (unlike OPML, which
  // loses `styles`/`tags`/`codeBlock` -- this payload IS the store's own `OutlineNode[]` shape,
  // not a lossy text encoding of it). Legacy's real payload also bundles Pad content (`pad`/
  // `qa`/`diagrams`/`mindMaps`/`decisionLogs`/`attachments`/`remarks`) -- deliberately NOT
  // included here, since none of that is document-scoped (or even persisted at all) in `web/`
  // yet; see `parseSakuraDocument.ts`'s own header for the full explanation of that real
  // architectural gap.
  function exportSakuraDocument() {
    const activeDoc = docsIndex.find((d) => d.id === activeDocId);
    const title = activeDoc?.title || 'Untitled';
    const payload = { v: 1, kind: 'sakura-document', exportedAt: Date.now(), title, nodes };
    const safeTitle = title.replace(/[\\/:*?"<>|]+/g, '_') || 'document';
    download(`${safeTitle}.sakura.json`, 'application/json;charset=utf-8', JSON.stringify(payload));
  }

  // Sakura Document (.sakura.json) import -- the read side of `exportSakuraDocument` above, via
  // `parseSakuraDocumentCore`. Always lands in a brand-new document (`newDocument()`), matching
  // legacy's own real guarantee that an import can never silently merge into whatever document
  // happens to be open already, same convention this file's own OPML import uses. Node ids are
  // NOT remapped -- unlike OPML import (which builds fresh ids since OPML carries no ids of its
  // own), a Sakura Document payload's node ids are real ids already, so they're kept exactly as
  // exported (matching legacy's own real behavior: "no collision risk to remap away" since this
  // is always a brand-new document); the outline store's own `nextId` counter is bumped past
  // the highest imported id afterward, matching the "`nextId` only ever moves up" convention
  // this store already documents for undo/redo snapshot restores.
  async function importSakuraDocument(file: File) {
    const text = await file.text();
    const parsed = parseSakuraDocumentCore(text);
    if (!parsed) return;
    newDocument();
    rebuildParentIdsCore(parsed.nodes);
    const maxId = parsed.nodes.reduce((max, n) => Math.max(max, n.id), 0);
    useOutlineStore.setState({
      nodes: parsed.nodes,
      selectedId: parsed.nodes[0]?.id ?? null,
      editingId: null,
      multiSelectedIds: [],
      selectionAnchorId: parsed.nodes[0]?.id ?? null,
      nextId: Math.max(useOutlineStore.getState().nextId, maxId + 1)
    });
  }

  // Word (.docx) import -- direct port of legacy's real `importDocxFile` (legacy/index.html:
  // 24688-24731), minus the AI-restructure fallback branch (§6.9 not started -- `web/` has no
  // AI capability to fall back to at all yet) and the tree-connector-character detection (see
  // `parseDocxHtml.ts`'s own header for why). `mammoth` (npm, MIT-licensed, pinned to the same
  // 1.11.0 version legacy loads from its CDN) converts the real .docx bytes to HTML exactly the
  // way legacy's own browser build does; `parseDocxHtmlToTreeNodesCore` then walks that HTML
  // into `{text,depth}` nodes via real heading/list/table structure. Always lands in a
  // brand-new document, same convention every other import path in this file already uses --
  // including the flat-list case (no heading structure found): legacy's own real behavior for a
  // user with AI Capabilities turned off is to import the flat list anyway with an explanatory
  // toast, not refuse the import, and that's the one real behavior this port can match without
  // an AI pipeline to fall back to.
  async function importDocx(file: File) {
    let html: string;
    try {
      const buf = await file.arrayBuffer();
      const result = await mammoth.convertToHtml({ arrayBuffer: buf });
      html = result.value;
    } catch {
      return;
    }
    const parsed = parseDocxHtmlToTreeNodesCore(html);
    if (!parsed.length) return;
    newDocument();
    let id = useOutlineStore.getState().nextId;
    const mapped: OutlineNode[] = parsed.map((n) => ({
      id: id++,
      depth: n.depth,
      text: n.text,
      parentId: null,
      isCheckbox: false,
      checked: false,
      note: '',
      codeBlock: null,
      tags: [],
      styles: defaultNodeStyles()
    }));
    rebuildParentIdsCore(mapped);
    useOutlineStore.setState({
      nodes: mapped,
      selectedId: mapped[0]?.id ?? null,
      editingId: null,
      multiSelectedIds: [],
      selectionAnchorId: mapped[0]?.id ?? null,
      nextId: id
    });
  }

  function exportMarkdown() {
    // rebaseDepth=false, outlineNumbering=false -- matches legacy's exportMarkdown call's own
    // defaults (outlineNumbering off unless the user has that preference on; web/ has no such
    // preference yet, deferred alongside the other export formats' own settings).
    download('outline.md', 'text/markdown;charset=utf-8', serializeMarkdown(nodes, false, false));
  }

  function exportOpml() {
    // nodeContentExportEnabled=true -- include notes in the export by default; web/ has no
    // settings panel yet to toggle this, same deferred-preference reasoning as above.
    download('outline.opml', 'text/x-opml;charset=utf-8', serializeOpmlCore(nodes, 'Untitled', true));
  }

  // Plain text export -- direct port of legacy's real `exportTreeFormat` (the "Tree .txt" menu
  // item), reusing `serializeTreeTextCore` exactly as ported in Phase 1 (previously unwired to
  // any UI). No scope deferrals here: unlike Word/PDF/PowerPoint, the ASCII-tree format has no
  // richer fidelity to defer -- this is a full-parity export.
  function exportPlainText() {
    download(
      'outline.txt',
      'text/plain;charset=utf-8',
      serializeTreeTextCore(nodes, false, OUTLINE_NUMBERING, TREE_INDENT_WIDTH, HIDE_TREE_LINES)
    );
  }

  // "Copy as Text" -- direct port of legacy's real `exportToClipboard(forceFull=true)`: writes
  // both a plain-text (`serializeTreeTextCore`) and a rich-text (`serializeClipboardHtmlCore`)
  // payload to the system clipboard via `ClipboardItem`, so pasting into a plain-text field gets
  // the ASCII tree while pasting into a rich editor (email, Slack, Word, Notion) gets colored,
  // styled HTML. Falls back to `execCommand('copy')` on a plain-text-only textarea when the
  // Clipboard API/`ClipboardItem` isn't available, same as legacy. Scoped down from legacy's own
  // version: no subset/selection support yet (web/ has no multi-node selection concept for
  // export), so always copies the whole tree, and no Sakura-specific decision-log/diagram
  // clip-payload comment embedded in the HTML (Decision Log/Diagrams aren't ported to web/ yet).
  async function exportClipboard() {
    const plain = serializeTreeTextCore(nodes, false, OUTLINE_NUMBERING, TREE_INDENT_WIDTH, HIDE_TREE_LINES);
    const html = serializeClipboardHtmlCore(nodes, false, OUTLINE_NUMBERING, TREE_INDENT_WIDTH, HIDE_TREE_LINES);
    try {
      if (navigator.clipboard && window.ClipboardItem && navigator.clipboard.write) {
        const item = new ClipboardItem({
          'text/plain': new Blob([plain], { type: 'text/plain' }),
          'text/html': new Blob([html], { type: 'text/html' })
        });
        await navigator.clipboard.write([item]);
      } else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(plain);
      } else {
        throw new Error('Clipboard API unavailable');
      }
    } catch {
      const ta = document.createElement('textarea');
      ta.value = plain;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
  }

  // §6.6 fidelity upgrade: a cover page, direct port of legacy's real `printHtmlAsPdf`
  // cover-page block (legacy/index.html:39681-39702) -- wordmark, document title, an accent
  // rule, and a meta line (word count, estimated read time, last-modified date). `page-break-
  // after: always` puts the outline itself on its own page after it, same as legacy's own
  // `.has-cover-page` CSS. Scoped down: no author line (web/'s `DocSummary` has no author field
  // yet, a document-model gap, not a small omission) and no decision-count in the meta line
  // (Decision Log has no store/panel in web/ yet, same blocker documented for Excel export
  // above). The wordmark (`BRANDING_TEXT`, shared with `PresenterMode.tsx`'s own presenter-bar
  // mark and the Word/PowerPoint exports below) is legacy's own real default
  // (`getBrandingDisplayText`'s fallback) -- hardcoded since no Settings panel exists yet to
  // hold `previewBrandingText`/`previewPresenterBranding`, same "no silent default for a live
  // user-preference toggle that doesn't exist here yet" deferral used elsewhere in this file.
  // Also shows the same mark in the bottom-right corner of every printed page via a real
  // `@page{@bottom-right{...}}` CSS Paged Media rule (see the `printWindow.document.write` call
  // below), not just the cover page.
  //
  // §6.6 fidelity upgrade: real page margins and a footer, direct port of legacy's real
  // `printHtmlAsPdf` `@page` block (legacy/index.html:39518-39533). Margin is hardcoded to
  // `PDF_MARGIN_MM.normal` (20mm) -- legacy's own real default (`previewPdfMargin='normal'`),
  // no Settings panel exists yet to hold the narrow/wide alternatives. The footer (today's date,
  // bottom-left; "Page X of Y" via real CSS `counter(page)`/`counter(pages)`, bottom-center) is
  // always on, matching legacy's own real `previewPdfFooterEnabled` default. Chrome 131+
  // supports these margin-box at-rules natively -- Firefox (as of this writing) just renders no
  // footer, a safe fallback, not a broken one.
  //
  // §6.6 fidelity upgrade: a node's note (sanitized rich HTML, muted italic, matching
  // `PreviewPane.tsx`'s own note-row styling) and code block (a `<pre>`, matching
  // `PreviewPane.tsx`'s own code-row styling) now render beneath its own row, same content
  // `PreviewPane.tsx` already shows on screen -- `sanitizeRichHtml` runs again here (a fresh
  // parse, belt-and-suspenders on top of the sanitize-on-write in `NotePanel.tsx`) since this is
  // a second real place `node.note` gets embedded as raw HTML, this time via
  // `printWindow.document.write`. Every node still renders regardless of fold state, same as
  // `PreviewPane.tsx`'s own deliberate choice (a folded subtree still belongs in the printed
  // document) -- not a gap to close, unlike the note/code omission this fixes. Decision-card
  // rendering remains a real, separately-scoped follow-up: Decision Log has no store/panel in
  // `web/` yet, same blocker documented for Excel export and the cover page's meta line above.
  function exportPdf() {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return; // popup blocked -- nothing more to do without a fallback UI here
    const activeDoc = docsIndex.find((d) => d.id === activeDocId);
    const title = activeDoc?.title || 'Untitled';
    const wordCount = nodes.reduce((sum, node) => {
      const text = getNodePlainText(node).trim();
      return sum + (text ? text.split(/\s+/).length : 0);
    }, 0);
    const readMins = Math.max(1, Math.round(wordCount / 200));
    const metaParts = [`${wordCount.toLocaleString()} word${wordCount === 1 ? '' : 's'}`, `${readMins} min read`];
    if (activeDoc?.modifiedAt) {
      metaParts.push(
        `Updated ${new Date(activeDoc.modifiedAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}`
      );
    }
    const coverPage = `<div style="page-break-after:always;display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;text-align:center;font-family:sans-serif;">
      <div style="letter-spacing:0.3em;font-size:12px;color:#999;margin-bottom:40px;">${BRANDING_TEXT}</div>
      <div style="font-size:32px;font-weight:700;margin-bottom:16px;">${escapeHtmlForPrint(title)}</div>
      <div style="width:52px;height:3px;background:#c2553d;margin-bottom:16px;"></div>
      <div style="font-size:13px;color:#666;">${escapeHtmlForPrint(metaParts.join(' · '))}</div>
    </div>`;
    const rows = nodes
      .map((node) => {
        const textRow = `<div style="text-decoration:${node.isCheckbox && node.checked ? 'line-through' : 'none'};">${
          node.isCheckbox ? `<input type="checkbox" disabled ${node.checked ? 'checked' : ''}/> ` : ''
        }${escapeHtmlForPrint(getNodePlainText(node)) || '<span style="color:#999">(empty)</span>'}</div>`;
        const noteRow = node.note
          ? `<div style="font-size:13px;color:#666;font-style:italic;">${sanitizeRichHtml(node.note)}</div>`
          : '';
        const codeRow = node.codeBlock
          ? `<pre style="background:#f0eee5;padding:6px;border-radius:4px;font-size:13px;overflow-x:auto;white-space:pre-wrap;">${escapeHtmlForPrint(node.codeBlock.code)}</pre>`
          : '';
        return `<div style="padding-left:${node.depth * 24}px;margin-bottom:4px;">${textRow}${noteRow}${codeRow}</div>`;
      })
      .join('');
    // §6.6 fidelity upgrade: the branding wordmark in the bottom-right corner of every printed
    // page, direct port of legacy's real `@page{@bottom-right{...}}` print rule
    // (legacy/index.html:39517-39532) -- the CSS Paged Media spec's own margin-box mechanism,
    // which Chromium's print pipeline (what `window.print()` below drives) honors natively.
    const footerDate = new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
    printWindow.document.write(
      `<!doctype html><html><head><title>${escapeHtmlForPrint(title)}</title><style>body{font-family:sans-serif;padding:2rem;}@page{margin:20mm;@bottom-left{content:"${cssStr(footerDate)}";font-family:sans-serif;font-size:8pt;color:#a3a099;}@bottom-center{content:"Page " counter(page) " of " counter(pages);font-family:sans-serif;font-size:8pt;color:#a3a099;}@bottom-right{content:"${cssStr(BRANDING_TEXT)}";font-family:sans-serif;font-size:8pt;letter-spacing:.15em;color:#a3a099;}}</style></head><body>${coverPage}${rows}</body></html>`
    );
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  }

  // Word export -- unlike PDF, there's no browser-native equivalent, so this genuinely needs a
  // real document-generation library. `docx` (npm, MIT-licensed) is the first new runtime
  // dependency this project has added; a plain, well-maintained pure-JS OOXML writer, no native
  // bindings. Scoped way down from legacy's real Word export (no tables or decision cards) --
  // one paragraph per node, indented via docx's own `indent` property (720 twips = 0.5in per
  // depth level, the standard Word indent unit), with a literal "[ ] "/"[x] " checkbox prefix
  // since a real interactive checkbox isn't something a static Word paragraph can represent.
  //
  // §6.6 fidelity upgrade: a node with `styles.heading` set (1-6, already a real field since
  // §6.2's rich-formatting slice) now renders as a genuine Word heading paragraph
  // (`HeadingLevel.HEADING_1`..`HEADING_6`, docx's own built-in heading styles) instead of a
  // flat indented line, plus a real Word TOC field (`TableOfContents`, `headingStyleRange:
  // '1-6'`) referencing those same heading styles -- the same field-based TOC mechanism Word's
  // own "Insert > Table of Contents" produces. Like any Word TOC field, it shows placeholder
  // text ("Right-click and select Update Field") until the reader updates it in Word (F9, or
  // Word's own "Update Table" prompt on open with automatic-update settings) -- a real,
  // documented Word behavior, not a bug in this export. A heading node's checkbox
  // prefix/indent-by-depth are dropped for that paragraph (a Word heading style already carries
  // its own visual weight/spacing; combining it with a manual indent would fight the style).
  // Also adds the branding wordmark as a real page footer (see the `footers` option below).
  async function exportWord() {
    const HEADING_LEVELS = [
      HeadingLevel.HEADING_1,
      HeadingLevel.HEADING_2,
      HeadingLevel.HEADING_3,
      HeadingLevel.HEADING_4,
      HeadingLevel.HEADING_5,
      HeadingLevel.HEADING_6
    ] as const;
    // §6.6 fidelity upgrade: a node's note image now rides along right after its own paragraph,
    // direct port of legacy's real "a node's Note image becomes a picture" behavior
    // (buildDocxPackage). `extractFirstImageDataUrl` confirms a real image-in-note pathway
    // already exists (`NotePanel.tsx`'s own "Insert image from file" action) -- see that file's
    // header for the full scoping story. A plain `for` loop (not `.map()`) since embedding needs
    // a real `await` per node (decoding + measuring the image), not just synchronous mapping.
    const nodeParagraphs: Paragraph[] = [];
    for (const node of nodes) {
      const text = getNodePlainText(node) || '(empty)';
      if (node.styles.heading > 0) {
        const level = HEADING_LEVELS[Math.min(node.styles.heading, 6) - 1];
        nodeParagraphs.push(new Paragraph({ heading: level, children: [new TextRun(text)] }));
      } else {
        const prefix = node.isCheckbox ? (node.checked ? '[x] ' : '[ ] ') : '';
        nodeParagraphs.push(new Paragraph({ indent: { left: node.depth * 720 }, children: [new TextRun(prefix + text)] }));
      }
      const imageDataUrl = extractFirstImageDataUrl(node.note);
      if (imageDataUrl) {
        const imageParagraph = await buildDocxImageParagraph(imageDataUrl);
        if (imageParagraph) nodeParagraphs.push(imageParagraph);
      }
    }
    // §6.6 fidelity upgrade: a Notepad section (Pad's plain-text `notesText`, if non-empty) and
    // a Q&A section (Pad's `qaItems` -- question bold, answer below in a muted color, "No answer
    // provided" in italic muted for an unanswered one) now follow the main outline content,
    // direct ports of legacy's real `docxBuildNotepadSection`/`docxBuildQaSection`
    // (legacy/index.html:24765-24824) -- same section headings, same content/wording, same
    // "Heading1 + bookmarked so Word's own TOC/Navigation Pane picks it up" structure (the TOC
    // field this export already builds has `headingStyleRange:'1-6'`, so these sections appear
    // in it automatically without any extra bookmark plumbing -- `docx`'s own `heading` paragraph
    // option already does that). Scoped down from legacy's real sections: no left-border accent
    // rule on Q&A answers (a cosmetic flourish; `docx`'s current paragraph-border API doesn't
    // expose a plain single-side border the way legacy's own hand-rolled OOXML does) -- color and
    // indent alone still distinguish an answer from its question.
    const sectionParagraphs: Paragraph[] = [];
    if (notesText.trim()) {
      sectionParagraphs.push(new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: 'Notepad', bold: true })] }));
      notesText.split('\n').forEach((line) => sectionParagraphs.push(new Paragraph({ children: [new TextRun(line)] })));
    }
    const answeredQaForWord = qaItems.filter((item) => item.question.trim());
    if (answeredQaForWord.length) {
      sectionParagraphs.push(new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: 'Q&A', bold: true })] }));
      for (const item of answeredQaForWord) {
        const answer = item.answer.trim();
        sectionParagraphs.push(new Paragraph({ spacing: { before: 120 }, children: [new TextRun({ text: item.question.trim(), bold: true })] }));
        sectionParagraphs.push(
          new Paragraph({
            indent: { left: 120 },
            children: [
              answer
                ? new TextRun({ text: answer, color: '5C584F' })
                : new TextRun({ text: 'No answer provided', italics: true, color: 'A3A099' })
            ]
          })
        );
      }
    }
    const doc = new Document({
      sections: [
        {
          // §6.6 fidelity upgrade: a page footer showing the branding wordmark, direct port of
          // legacy's real `buildDocxPackage` footer (legacy/index.html:25247-25248) -- small,
          // muted, right-aligned, on every page. Always on (see `BRANDING_TEXT`'s own header for
          // why), unlike legacy where it's gated by `previewPresenterBranding`.
          footers: {
            default: new Footer({
              children: [
                new Paragraph({
                  alignment: AlignmentType.RIGHT,
                  children: [new TextRun({ text: BRANDING_TEXT, size: 14, color: 'A3A099' })]
                })
              ]
            })
          },
          children: [
            new TableOfContents('Table of Contents', { hyperlink: true, headingStyleRange: '1-6' }),
            ...nodeParagraphs,
            ...sectionParagraphs
          ]
        }
      ]
    });
    const blob = await Packer.toBlob(doc);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'outline.docx';
    a.click();
    URL.revokeObjectURL(url);
  }

  // PowerPoint export -- reuses the same slide breakdown as Presenter Mode (groupIntoSlides:
  // one slide per top-level/depth-0 node plus its whole subtree), matching legacy's own
  // PowerPoint export's stated approach ("same slide breakdown as Preview's Presenter mode").
  // pptxgenjs (npm, MIT-licensed) is the same library legacy itself uses, pinned to the same
  // 4.0.1 version, so this genuinely produces the same kind of native, fully-editable OOXML
  // slide deck legacy's own export does -- text boxes and bullets are real shapes, not a
  // flattened image.
  //
  // §6.6 fidelity upgrade: a Notepad slide (Pad's plain-text `notesText`, if non-empty) and
  // Q&A slide(s) (Pad's `qaItems` -- question bold, answer below, "No answer provided" for an
  // unanswered one, matching legacy's own real wording) now follow the per-node slides, and a
  // real closing slide (reusing `PresenterMode.tsx`'s own `CLOSING_SLIDE_TEXT`/
  // `CLOSING_SLIDE_SUBTITLE` constants -- the same defaults Presenter Mode's own closing slide
  // uses) is always the genuine last slide in the deck, matching legacy's own real ordering
  // (per-node slides, then Notepad, then Q&A, then closing). Notepad/Q&A slides now paginate
  // onto "(cont'd)" slides too, same real-measurement approach as the per-node slides (see
  // `measureWrappedLines`'s own comment below). Still scoped down from legacy's real
  // Notepad/Q&A slides: no table/chart promotion (`web/`'s Notepad is a plain `<textarea>`, not
  // a rich editor with an embeddable table yet), no Q&A section headers (`web/`'s own `QaItem`
  // has no section/title concept, a simpler model than legacy's). Still scoped way down
  // otherwise: no title slide, no images/diagrams (see `Word note-image embedding` above for why
  // PPTX images are a separate, bigger follow-up), no decision cards, no marker glyphs. Also
  // adds the branding wordmark to every slide's bottom-right corner (see `addBranding` below).
  async function exportPowerpoint() {
    const pptx = new PptxGenJS();
    // §6.6 fidelity upgrade: the branding wordmark in the bottom-right corner of every slide,
    // direct port of legacy's real `pptxApplyBranding` (legacy/index.html:25554-25566).
    // Positioned against pptxgenjs's own default `LAYOUT_16x9` slide size (10in x 5.625in) --
    // this export has never matched legacy's own custom `LAYOUT_WIDE` (13.333in x 7.5in) sizing,
    // a separate, pre-existing gap outside this slice's scope, so the corner offset is measured
    // against the real slide size this export actually produces rather than legacy's.
    function addBranding(slide: PptxGenJS.Slide): void {
      slide.addText(BRANDING_TEXT, {
        x: 10 - 2.0,
        y: 5.625 - 0.3,
        w: 2.0,
        h: 0.24,
        fontFace: 'Inter',
        fontSize: 7,
        color: '999999',
        align: 'right',
        valign: 'middle',
        charSpacing: 2
      });
    }
    // §6.6 fidelity upgrade: overflow onto a "<Title> (cont'd)" slide when a node's bullets
    // don't fit the box, direct port of legacy's real per-slide pagination (legacy's own
    // `pptxPaginateBullets`, using `pptxMeasureWrappedLines`/`pptxLineHeightIn` -- both ported
    // to `utils/wrapLineCount.ts`). Measured against a real canvas 2D context (Calibri, Office's
    // own default body font, not this app's UI font -- same reasoning legacy's own comment
    // gives: Inter is a web font that won't actually be installed wherever the file is opened)
    // with the same deliberately-oversized ~24% width buffer legacy's own comment documents,
    // so the measurement stays an under-estimate of available width across whatever font a
    // reader's copy of PowerPoint/Keynote/Google Slides actually substitutes. `BOX_WIDTH_IN`/
    // `AVAIL_H` are measured against THIS export's own real default slide size (10in x
    // 5.625in) -- see `addBranding`'s own comment above for why that's not legacy's 13.333x7.5.
    const measureCtx = document.createElement('canvas').getContext('2d');
    function measureWrappedLines(text: string, boxWidthIn: number, fontSizePt: number, bold: boolean): number {
      if (!text || !measureCtx) return 1;
      measureCtx.font = `${bold ? '700' : '400'} ${fontSizePt}pt Calibri, Carlito, Arial, sans-serif`;
      const boxWidthPx = Math.max(1, boxWidthIn * 96 * 0.76);
      return wrapLineCount(text, boxWidthPx, (s) => measureCtx.measureText(s).width);
    }
    const BOX_WIDTH_IN = 9; // matches the bullet text box's own w:'90%' of a 10in-wide slide
    const AVAIL_H = 5.625 - 0.4 - 1.3; // slide height, minus a bottom margin, minus the title's own bodyTop
    const slides = groupIntoSlides(nodes);
    for (const slideNodes of slides) {
      const minDepth = slideNodes[0].depth;
      const title = getNodePlainText(slideNodes[0]) || '(empty)';
      const bullets = slideNodes.slice(1).map((node) => ({
        text: (node.isCheckbox ? (node.checked ? '[x] ' : '[ ] ') : '') + (getNodePlainText(node) || '(empty)'),
        indentLevel: node.depth - minDepth - 1
      }));
      const pages: (typeof bullets)[] = [];
      let page: typeof bullets = [];
      let usedH = 0;
      for (const b of bullets) {
        const h = measureWrappedLines(b.text, BOX_WIDTH_IN, 16, false) * pptxLineHeightIn(16, 1.3);
        if (page.length && usedH + h > AVAIL_H) {
          pages.push(page);
          page = [];
          usedH = 0;
        }
        page.push(b);
        usedH += h;
      }
      pages.push(page); // always at least one page, even with zero bullets (a leaf/title-only node)
      pages.forEach((pageBullets, pi) => {
        const slide = pptx.addSlide();
        slide.addText(pi === 0 ? title : `${title} (cont'd)`, { x: 0.5, y: 0.4, fontSize: 28, bold: true });
        const bulletLines = pageBullets.map((b) => ({
          text: b.text,
          options: { bullet: true, indentLevel: b.indentLevel, fontSize: 16 }
        }));
        if (bulletLines.length) {
          slide.addText(bulletLines, { x: 0.5, y: 1.3, w: '90%', h: '75%' });
        }
        addBranding(slide);
      });
    }
    // §6.6 fidelity upgrade: Notepad/Q&A slides now paginate onto "(cont'd)" slides too, direct
    // port of legacy's real `pptxPaginateBullets`-style measure-then-pack loop (legacy's own
    // Notepad/Q&A section builders, legacy/index.html:26567-26586 and :26622-26633) reusing the
    // same `measureWrappedLines`/`AVAIL_H`/`BOX_WIDTH_IN` the per-node slides above already use.
    // A Q&A question and its own answer are measured and packed as one combined unit (legacy's
    // own choice too) so a page break never separates a question from its answer, unless that
    // pair alone is taller than a full page.
    if (notesText.trim()) {
      const notepadLines = notesText.split('\n').map((line) => ({
        text: line,
        h: measureWrappedLines(line, BOX_WIDTH_IN, 16, false) * pptxLineHeightIn(16, 1.3)
      }));
      const notepadPages: (typeof notepadLines)[] = [];
      let npage: typeof notepadLines = [];
      let nUsedH = 0;
      for (const line of notepadLines) {
        if (npage.length && nUsedH + line.h > AVAIL_H) {
          notepadPages.push(npage);
          npage = [];
          nUsedH = 0;
        }
        npage.push(line);
        nUsedH += line.h;
      }
      notepadPages.push(npage);
      notepadPages.forEach((pageLines, pi) => {
        const notepadSlide = pptx.addSlide();
        notepadSlide.addText(pi === 0 ? 'Notepad' : "Notepad (cont'd)", { x: 0.5, y: 0.4, fontSize: 28, bold: true });
        const paragraphs = pageLines.map((line) => ({ text: line.text, options: { fontSize: 16, breakLine: true } }));
        if (paragraphs.length) {
          notepadSlide.addText(paragraphs, { x: 0.5, y: 1.3, w: '90%', h: '75%' });
        }
        addBranding(notepadSlide);
      });
    }
    const answeredQa = qaItems.filter((item) => item.question.trim());
    if (answeredQa.length) {
      const qaBlocks = answeredQa.map((item) => {
        const question = item.question.trim();
        const answer = item.answer.trim();
        const h =
          measureWrappedLines(question, BOX_WIDTH_IN, 16, true) * pptxLineHeightIn(16, 1.25) +
          measureWrappedLines(answer || 'No answer provided', BOX_WIDTH_IN, 14, false) * pptxLineHeightIn(14, 1.25) +
          0.18;
        return { question, answer, h };
      });
      const qaPages: (typeof qaBlocks)[] = [];
      let qpage: typeof qaBlocks = [];
      let qUsedH = 0;
      for (const b of qaBlocks) {
        if (qpage.length && qUsedH + b.h > AVAIL_H) {
          qaPages.push(qpage);
          qpage = [];
          qUsedH = 0;
        }
        qpage.push(b);
        qUsedH += b.h;
      }
      qaPages.push(qpage);
      qaPages.forEach((pageItems, pi) => {
        const qaSlide = pptx.addSlide();
        qaSlide.addText(pi === 0 ? 'Q&A' : "Q&A (cont'd)", { x: 0.5, y: 0.4, fontSize: 28, bold: true });
        const qaLines: { text: string; options: Record<string, unknown> }[] = [];
        for (const item of pageItems) {
          qaLines.push({ text: item.question, options: { fontSize: 16, bold: true, breakLine: true } });
          qaLines.push({
            text: item.answer || 'No answer provided',
            options: { fontSize: 14, italic: !item.answer, color: item.answer ? undefined : '999999', breakLine: true }
          });
        }
        qaSlide.addText(qaLines, { x: 0.5, y: 1.3, w: '90%', h: '75%' });
        addBranding(qaSlide);
      });
    }
    const closingSlide = pptx.addSlide();
    closingSlide.addText(CLOSING_SLIDE_TEXT, { x: 0.5, y: 2.6, w: '90%', h: 1, fontSize: 32, bold: true, align: 'center' });
    if (CLOSING_SLIDE_SUBTITLE) {
      closingSlide.addText(CLOSING_SLIDE_SUBTITLE, { x: 0.5, y: 3.6, w: '90%', h: 0.6, fontSize: 16, align: 'center', color: '666666' });
    }
    addBranding(closingSlide);
    await pptx.writeFile({ fileName: 'outline.pptx' });
  }

  return (
    <div style={{ display: 'flex', gap: 6, fontFamily: 'sans-serif', fontSize: 12 }}>
      <button type="button" onClick={exportClipboard}>
        Copy as Text
      </button>
      <button type="button" onClick={exportMarkdown}>
        Export .md
      </button>
      <button type="button" onClick={exportPlainText}>
        Export .txt
      </button>
      <button type="button" onClick={exportOpml}>
        Export .opml
      </button>
      <button type="button" onClick={exportPdf}>
        Export .pdf
      </button>
      <button type="button" onClick={exportWord}>
        Export .docx
      </button>
      <button type="button" onClick={exportPowerpoint}>
        Export .pptx
      </button>
      <button type="button" onClick={exportSakuraDocument}>
        Export .sakura.json
      </button>
      <input
        ref={opmlFileInputRef}
        type="file"
        accept=".opml,text/x-opml"
        style={{ display: 'none' }}
        onChange={(e) => {
          const file = e.currentTarget.files?.[0];
          e.currentTarget.value = ''; // allow re-selecting the same file next time
          if (file) importOpml(file);
        }}
      />
      <button type="button" onClick={() => opmlFileInputRef.current?.click()}>
        Import .opml
      </button>
      <input
        ref={sakuraDocFileInputRef}
        type="file"
        accept=".json,application/json"
        style={{ display: 'none' }}
        onChange={(e) => {
          const file = e.currentTarget.files?.[0];
          e.currentTarget.value = '';
          if (file) importSakuraDocument(file);
        }}
      />
      <button type="button" onClick={() => sakuraDocFileInputRef.current?.click()}>
        Import .sakura.json
      </button>
      <input
        ref={docxFileInputRef}
        type="file"
        accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        style={{ display: 'none' }}
        onChange={(e) => {
          const file = e.currentTarget.files?.[0];
          e.currentTarget.value = '';
          if (file) importDocx(file);
        }}
      />
      <button type="button" onClick={() => docxFileInputRef.current?.click()}>
        Import .docx
      </button>
    </div>
  );
}
