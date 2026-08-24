/**
 * §6.6 slice (docs/phase6-full-parity-plan.md): Word (.docx) import, the structural half of
 * legacy's real `parseDocxHtmlToTreeNodes` (legacy/index.html:24611-24687) -- walks Mammoth's
 * HTML output (headings, paragraphs, lists, tables) into the same `{text,depth}` shape used
 * throughout this project's import paths (`parseOpml.ts`, `parseSakuraDocument.ts`). Trusts real
 * structural signals (heading levels, list nesting) over guesswork, matching legacy's own
 * stated philosophy -- a flat result (every node at depth 0) is a legitimate, honest outcome for
 * a document with no heading styles, not an error.
 *
 * Real, deliberate scope cut from legacy's own function: the tree-connector-character fallback
 * (a document that encodes hierarchy as literal `│ ├─ └─` glyphs or hand-indentation rather than
 * real Word structure hands off to `parseTextToTreeNodes`, legacy's own line-based smart-paste
 * parser) is NOT ported here -- `parseTextToTreeNodes`/smart-paste itself isn't ported to `web/`
 * at all yet (checked directly: no `parseTextToTreeNodes` or `parseTreeClipboardHtml` anywhere
 * in `web/src`), so there is nothing for this edge case to hand off to. A `.docx` genuinely
 * using that hand-drawn-tree notation instead of real Word structure will import as a flat list
 * here instead of being detected and rebuilt -- a real, narrow gap, not a silent one.
 */
export interface ParsedDocxNode {
  text: string;
  depth: number;
}

const LEAF_BULLET_RE = /^(?:[-*+•●◦▪▫■□‣⁃◉○→➜➝➞]|(?:\d+|[A-Za-z]|[ivxlcdmIVXLCDM]+)[.)])\s+/;

/** Pure (aside from using the ambient `document`/`DOMParser`-equivalent DOM APIs, unavoidable
 * for real HTML parsing and available in every browser and in this project's jsdom test
 * environment): matches legacy's own `parseDocxHtmlToTreeNodes` exactly, minus the
 * tree-connector fallback documented above. */
export function parseDocxHtmlToTreeNodesCore(html: string): ParsedDocxNode[] {
  const container = document.createElement('div');
  container.innerHTML = html || '';
  const out: ParsedDocxNode[] = [];
  const stack: { level: number; depth: number }[] = [{ level: 0, depth: -1 }];

  function pushHeading(level: number, text: string): void {
    while (stack.length > 1 && level <= stack[stack.length - 1].level) stack.pop();
    const depth = stack[stack.length - 1].depth + 1;
    stack.push({ level, depth });
    const t = String(text || '').trim();
    if (t) out.push({ text: t, depth });
  }

  function pushLeaf(text: string, extraDepth = 0): void {
    let t = String(text || '').trim();
    if (!t) return;
    t = t.replace(LEAF_BULLET_RE, '').trim();
    if (!t) return;
    out.push({ text: t, depth: stack[stack.length - 1].depth + 1 + extraDepth });
  }

  function liOwnText(li: Element): string {
    let t = '';
    Array.from(li.childNodes).forEach((node) => {
      if (node.nodeType === 1 && ((node as Element).tagName === 'UL' || (node as Element).tagName === 'OL')) return;
      t += node.textContent || '';
    });
    return t.trim();
  }

  function walkList(listEl: Element, extraDepth: number): void {
    Array.from(listEl.children).forEach((li) => {
      if (li.tagName !== 'LI') return;
      const nestedLists = Array.from(li.children).filter((c) => c.tagName === 'UL' || c.tagName === 'OL');
      const ownText = liOwnText(li);
      if (ownText) pushLeaf(ownText, extraDepth);
      nestedLists.forEach((nl) => walkList(nl, extraDepth + 1));
    });
  }

  function cellParagraphs(cell: Element): string[] {
    const ps = Array.from(cell.querySelectorAll(':scope > p'));
    if (ps.length) return ps.map((p) => (p.textContent || '').trim()).filter(Boolean);
    const t = (cell.textContent || '').trim();
    return t ? [t] : [];
  }

  function walkTable(tableEl: HTMLTableElement): void {
    Array.from(tableEl.rows || []).forEach((tr) => {
      const cellTexts = Array.from(tr.cells || tr.children)
        .map((td) => cellParagraphs(td))
        .filter((arr) => arr.length);
      if (!cellTexts.length) return;
      const rowDepth = stack[stack.length - 1].depth + 1;
      const [first, ...rest] = cellTexts[0];
      out.push({ text: first, depth: rowDepth });
      rest.forEach((p) => out.push({ text: p, depth: rowDepth + 1 }));
      cellTexts.slice(1).forEach((paras) => paras.forEach((p) => out.push({ text: p, depth: rowDepth + 1 })));
    });
  }

  Array.from(container.children).forEach((elx) => {
    const tag = elx.tagName;
    const hMatch = tag && tag.match(/^H([1-6])$/);
    if (hMatch) {
      pushHeading(Number(hMatch[1]), elx.textContent || '');
      return;
    }
    if (tag === 'UL' || tag === 'OL') {
      walkList(elx, 0);
      return;
    }
    if (tag === 'TABLE') {
      walkTable(elx as HTMLTableElement);
      return;
    }
    if (elx.querySelector && elx.querySelector('img') && !(elx.textContent || '').trim()) {
      pushLeaf('[image]');
      return;
    }
    pushLeaf(elx.textContent || '');
  });

  return out;
}
