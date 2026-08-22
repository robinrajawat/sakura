import { useOutlineStore } from '../store/outlineStore';
import { serializeMarkdown } from '../utils/serializeMarkdown';
import { serializeOpmlCore } from '../utils/serializeOpml';
import { getNodePlainText } from '../utils/stripSemanticMarkers';
import { Document, Packer, Paragraph, TextRun } from 'docx';
import PptxGenJS from 'pptxgenjs';
import { groupIntoSlides } from './PresenterMode';

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

  function exportPdf() {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return; // popup blocked -- nothing more to do without a fallback UI here
    const rows = nodes
      .map(
        (node) =>
          `<div style="padding-left:${node.depth * 24}px;margin-bottom:4px;">${
            node.isCheckbox ? `<input type="checkbox" disabled ${node.checked ? 'checked' : ''}/> ` : ''
          }${escapeHtmlForPrint(getNodePlainText(node)) || '<span style="color:#999">(empty)</span>'}</div>`
      )
      .join('');
    printWindow.document.write(
      `<!doctype html><html><head><title>Outline</title><style>body{font-family:sans-serif;padding:2rem;}</style></head><body>${rows}</body></html>`
    );
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  }

  // Word export -- unlike PDF, there's no browser-native equivalent, so this genuinely needs a
  // real document-generation library. `docx` (npm, MIT-licensed) is the first new runtime
  // dependency this project has added; a plain, well-maintained pure-JS OOXML writer, no native
  // bindings. Scoped way down from legacy's real Word export (no images, tables, decision
  // cards, Notepad/Q&A sections, branding, or heading-level styling by depth) -- one paragraph
  // per node, indented via docx's own `indent` property (720 twips = 0.5in per depth level,
  // the standard Word indent unit), with a literal "[ ] "/"[x] " checkbox prefix since a real
  // interactive checkbox isn't something a static Word paragraph can represent.
  async function exportWord() {
    const doc = new Document({
      sections: [
        {
          children: nodes.map((node) => {
            const prefix = node.isCheckbox ? (node.checked ? '[x] ' : '[ ] ') : '';
            return new Paragraph({
              indent: { left: node.depth * 720 },
              children: [new TextRun(prefix + (getNodePlainText(node) || '(empty)'))]
            });
          })
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
  // flattened image. Scoped way down from legacy's real PowerPoint export otherwise: no title
  // slide, no images/diagrams, no decision cards, no Notepad/Q&A sections, no branding, no
  // marker glyphs, no auto-overflow onto a "(cont'd)" slide, no closing slide. Each a real,
  // separately-scoped follow-up.
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
    await pptx.writeFile({ fileName: 'outline.pptx' });
  }

  return (
    <div style={{ display: 'flex', gap: 6, fontFamily: 'sans-serif', fontSize: 12 }}>
      <button type="button" onClick={exportMarkdown}>
        Export .md
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
    </div>
  );
}
