import { useOutlineStore } from '../store/outlineStore';
import { serializeMarkdown } from '../utils/serializeMarkdown';
import { serializeOpmlCore } from '../utils/serializeOpml';

/**
 * Phase 3 slice (docs/framework-migration-plan.md): exports. Markdown and OPML only for this
 * slice -- both reuse serializeMarkdown.ts/serializeOpml.ts, already ported in Phase 1 and
 * otherwise unused until now. Word/PDF/PowerPoint deferred: each needs a real document-
 * generation library (docx/pdf-lib/pptxgenjs) wired into the build, a meaningfully bigger and
 * separately-scoped follow-up rather than something this slice should absorb.
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

  return (
    <div style={{ display: 'flex', gap: 6, fontFamily: 'sans-serif', fontSize: 12 }}>
      <button type="button" onClick={exportMarkdown}>
        Export .md
      </button>
      <button type="button" onClick={exportOpml}>
        Export .opml
      </button>
    </div>
  );
}
