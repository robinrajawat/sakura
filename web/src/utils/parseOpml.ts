/**
 * §6.6 slice (docs/phase6-full-parity-plan.md): OPML import, the read side of the already-ported
 * `serializeOpmlCore` (`serializeOpml.ts`). Direct port of legacy's real `parseOpmlToTreeNodes`
 * (legacy/index.html:24560-24580) -- walks an `<opml><body>`'s `<outline>` elements depth-first,
 * reading each one's `text` attribute (falling back to `title`, matching legacy's own OPML-spec
 * leniency: some OPML producers use `title` instead of `text`) and its Sakura-specific `_note`
 * attribute (round-tripping notes through `serializeOpmlCore`'s own `_note` attribute when
 * `nodeContentExportEnabled`). A leading `[ ]`/`[x]` in the text (case-insensitive) is parsed out
 * as a checkbox state, matching `serializeOpmlCore`'s own encoding of checkbox nodes as plain
 * `[ ] `/`[x] ` text prefixes (OPML has no native checkbox concept). Returns `[]` for anything
 * that isn't parseable XML, has no `<body>`, or has no `<outline>` elements at all -- the caller
 * decides what "nothing to import" means (legacy shows a toast; this project has no toast
 * infrastructure yet, so the caller silently no-ops, same convention `ExportButtons.tsx`'s own
 * popup-blocked PDF export already uses).
 */
export interface ParsedOpmlNode {
  text: string;
  depth: number;
  note: string;
  isCheckbox: boolean;
  checked: boolean;
}

/** Pure (aside from using the ambient `DOMParser`, unavoidable for real XML parsing and
 * available in every browser and in this project's jsdom test environment): matches legacy's
 * own `parseOpmlToTreeNodes` exactly. */
export function parseOpmlToTreeNodesCore(xmlText: string): ParsedOpmlNode[] {
  let xmlDoc: Document;
  try {
    xmlDoc = new DOMParser().parseFromString(xmlText, 'application/xml');
  } catch {
    return [];
  }
  if (!xmlDoc || xmlDoc.querySelector('parsererror')) return [];
  const body = xmlDoc.querySelector('opml > body') || xmlDoc.querySelector('body');
  if (!body) return [];
  const out: ParsedOpmlNode[] = [];
  function walk(el: Element, depth: number): void {
    Array.from(el.children).forEach((child) => {
      if (child.tagName && child.tagName.toLowerCase() === 'outline') {
        let text = child.getAttribute('text') || child.getAttribute('title') || '';
        const note = child.getAttribute('_note') || '';
        let isCheckbox = false;
        let checked = false;
        const cbMatch = text.match(/^\[( |x)\]\s?(.*)$/i);
        if (cbMatch) {
          isCheckbox = true;
          checked = cbMatch[1].toLowerCase() === 'x';
          text = cbMatch[2];
        }
        out.push({ text, depth, note, isCheckbox, checked });
        walk(child, depth + 1);
      }
    });
  }
  walk(body, 0);
  return out;
}
