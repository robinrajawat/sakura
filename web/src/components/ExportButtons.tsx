import { useRef } from 'react';
import { useOutlineStore, defaultNodeStyles, type OutlineNode } from '../store/outlineStore';
import { useDocumentsStore } from '../store/documentsStore';
import { usePadStore } from '../store/padStore';
import { rebuildParentIdsCore } from '../core/nodeSelection';
import { serializeMarkdown } from '../utils/serializeMarkdown';
import { serializeOpmlCore } from '../utils/serializeOpml';
import { parseOpmlToTreeNodesCore } from '../utils/parseOpml';
import { serializeTreeTextCore } from '../utils/serializeTreeText';
import { serializeClipboardHtmlCore } from '../utils/serializeClipboardHtml';
import { getNodePlainText } from '../utils/stripSemanticMarkers';
import { Document, HeadingLevel, Packer, Paragraph, TableOfContents, TextRun } from 'docx';
import PptxGenJS from 'pptxgenjs';
import { groupIntoSlides, CLOSING_SLIDE_TEXT, CLOSING_SLIDE_SUBTITLE } from './PresenterMode';

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

export function ExportButtons() {
  const nodes = useOutlineStore((s) => s.nodes);
  const docsIndex = useDocumentsStore((s) => s.docsIndex);
  const activeDocId = useDocumentsStore((s) => s.activeDocId);
  const newDocument = useDocumentsStore((s) => s.newDocument);
  const notesText = usePadStore((s) => s.notesText);
  const qaItems = usePadStore((s) => s.qaItems);
  const opmlFileInputRef = useRef<HTMLInputElement>(null);

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
  // above). The wordmark text ("S A K U R A") is legacy's own real default
  // (`getBrandingDisplayText`'s fallback) -- hardcoded since no Settings panel exists yet to
  // hold `previewBrandingText`/`previewPresenterBranding`, same "no silent default for a live
  // user-preference toggle that doesn't exist here yet" deferral used elsewhere in this file.
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
      <div style="letter-spacing:0.3em;font-size:12px;color:#999;margin-bottom:40px;">S A K U R A</div>
      <div style="font-size:32px;font-weight:700;margin-bottom:16px;">${escapeHtmlForPrint(title)}</div>
      <div style="width:52px;height:3px;background:#c2553d;margin-bottom:16px;"></div>
      <div style="font-size:13px;color:#666;">${escapeHtmlForPrint(metaParts.join(' · '))}</div>
    </div>`;
    const rows = nodes
      .map(
        (node) =>
          `<div style="padding-left:${node.depth * 24}px;margin-bottom:4px;">${
            node.isCheckbox ? `<input type="checkbox" disabled ${node.checked ? 'checked' : ''}/> ` : ''
          }${escapeHtmlForPrint(getNodePlainText(node)) || '<span style="color:#999">(empty)</span>'}</div>`
      )
      .join('');
    printWindow.document.write(
      `<!doctype html><html><head><title>${escapeHtmlForPrint(title)}</title><style>body{font-family:sans-serif;padding:2rem;}</style></head><body>${coverPage}${rows}</body></html>`
    );
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  }

  // Word export -- unlike PDF, there's no browser-native equivalent, so this genuinely needs a
  // real document-generation library. `docx` (npm, MIT-licensed) is the first new runtime
  // dependency this project has added; a plain, well-maintained pure-JS OOXML writer, no native
  // bindings. Scoped way down from legacy's real Word export (no images, tables, decision
  // cards, Notepad/Q&A sections, or branding) -- one paragraph per node, indented via docx's own
  // `indent` property (720 twips = 0.5in per depth level, the standard Word indent unit), with a
  // literal "[ ] "/"[x] " checkbox prefix since a real interactive checkbox isn't something a
  // static Word paragraph can represent.
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
  async function exportWord() {
    const HEADING_LEVELS = [
      HeadingLevel.HEADING_1,
      HeadingLevel.HEADING_2,
      HeadingLevel.HEADING_3,
      HeadingLevel.HEADING_4,
      HeadingLevel.HEADING_5,
      HeadingLevel.HEADING_6
    ] as const;
    const doc = new Document({
      sections: [
        {
          children: [
            new TableOfContents('Table of Contents', { hyperlink: true, headingStyleRange: '1-6' }),
            ...nodes.map((node) => {
              const text = getNodePlainText(node) || '(empty)';
              if (node.styles.heading > 0) {
                const level = HEADING_LEVELS[Math.min(node.styles.heading, 6) - 1];
                return new Paragraph({ heading: level, children: [new TextRun(text)] });
              }
              const prefix = node.isCheckbox ? (node.checked ? '[x] ' : '[ ] ') : '';
              return new Paragraph({
                indent: { left: node.depth * 720 },
                children: [new TextRun(prefix + text)]
              });
            })
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
  // (per-node slides, then Notepad, then Q&A, then closing). Scoped down from legacy's real
  // Notepad/Q&A slides: no pagination/overflow onto a "(cont'd)" slide when content doesn't fit
  // the box (legacy measures real wrapped-line heights against the actual font to decide where
  // to split -- a lot of machinery for a real, separately-scoped follow-up; unusually long
  // content here just overflows its text box visually in the viewer, still fully present and
  // editable in the underlying shape), no table/chart promotion (`web/`'s Notepad is a plain
  // `<textarea>`, not a rich editor with an embeddable table yet), no Q&A section headers
  // (`web/`'s own `QaItem` has no section/title concept, a simpler model than legacy's). Still
  // scoped way down otherwise: no title slide, no images/diagrams, no decision cards, no
  // branding, no marker glyphs.
  async function exportPowerpoint() {
    const pptx = new PptxGenJS();
    const slides = groupIntoSlides(nodes);
    for (const slideNodes of slides) {
      const slide = pptx.addSlide();
      const minDepth = slideNodes[0].depth;
      slide.addText(getNodePlainText(slideNodes[0]) || '(empty)', {
        x: 0.5,
        y: 0.4,
        fontSize: 28,
        bold: true
      });
      const bulletLines = slideNodes.slice(1).map((node) => ({
        text: (node.isCheckbox ? (node.checked ? '[x] ' : '[ ] ') : '') + (getNodePlainText(node) || '(empty)'),
        options: { bullet: true, indentLevel: node.depth - minDepth - 1, fontSize: 16 }
      }));
      if (bulletLines.length) {
        slide.addText(bulletLines, { x: 0.5, y: 1.3, w: '90%', h: '75%' });
      }
    }
    if (notesText.trim()) {
      const notepadSlide = pptx.addSlide();
      notepadSlide.addText('Notepad', { x: 0.5, y: 0.4, fontSize: 28, bold: true });
      const paragraphs = notesText.split('\n').map((line) => ({ text: line, options: { fontSize: 16, breakLine: true } }));
      notepadSlide.addText(paragraphs, { x: 0.5, y: 1.3, w: '90%', h: '75%' });
    }
    const answeredQa = qaItems.filter((item) => item.question.trim());
    if (answeredQa.length) {
      const qaSlide = pptx.addSlide();
      qaSlide.addText('Q&A', { x: 0.5, y: 0.4, fontSize: 28, bold: true });
      const qaLines: { text: string; options: Record<string, unknown> }[] = [];
      for (const item of answeredQa) {
        const answer = item.answer.trim();
        qaLines.push({ text: item.question.trim(), options: { fontSize: 16, bold: true, breakLine: true } });
        qaLines.push({
          text: answer || 'No answer provided',
          options: { fontSize: 14, italic: !answer, color: answer ? undefined : '999999', breakLine: true }
        });
      }
      qaSlide.addText(qaLines, { x: 0.5, y: 1.3, w: '90%', h: '75%' });
    }
    const closingSlide = pptx.addSlide();
    closingSlide.addText(CLOSING_SLIDE_TEXT, { x: 0.5, y: 2.6, w: '90%', h: 1, fontSize: 32, bold: true, align: 'center' });
    if (CLOSING_SLIDE_SUBTITLE) {
      closingSlide.addText(CLOSING_SLIDE_SUBTITLE, { x: 0.5, y: 3.6, w: '90%', h: 0.6, fontSize: 16, align: 'center', color: '666666' });
    }
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
    </div>
  );
}
