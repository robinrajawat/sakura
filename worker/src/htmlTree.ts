/**
 * A small HTML reader for the MCP server (docs/mcp-plan.md): Workers have no DOMParser, and the
 * Markdown export code (web/src/utils/markdownExport.ts) reads notes and tables through a minimal
 * DOM-like tree. Notes and tables are stored already sanitized (sakuraSanitizeRichHtml in the app),
 * so this only needs elements, text, entities and void tags, never scripts or comments' contents.
 * It builds a tree and never renders anything.
 */

export interface HtmlNode {
  nodeType: number; // 1 element, 3 text
  nodeName: string;
  textContent: string | null;
  childNodes: HtmlNode[];
  attrs?: Record<string, string>;
  getAttribute?: (n: string) => string | null;
}

const VOID = new Set(['BR', 'HR', 'IMG', 'INPUT', 'META', 'LINK', 'COL', 'WBR', 'SOURCE', 'AREA', 'BASE', 'EMBED', 'TRACK']);
const SKIP_CONTENT = new Set(['SCRIPT', 'STYLE', 'TEMPLATE']);
const NAMED: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : m;
    }
    return NAMED[e.toLowerCase()] ?? m;
  });
}

function textOf(n: HtmlNode): string {
  if (n.nodeType === 3) return n.textContent || '';
  return n.childNodes.map(textOf).join('');
}

function element(name: string, attrs: Record<string, string>): HtmlNode {
  const node: HtmlNode = { nodeType: 1, nodeName: name, textContent: null, childNodes: [], attrs };
  node.getAttribute = (a: string) => (a.toLowerCase() in attrs ? attrs[a.toLowerCase()] : null);
  Object.defineProperty(node, 'textContent', { get: () => textOf(node), enumerable: true });
  return node;
}

function parseAttrs(src: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) out[m[1].toLowerCase()] = decodeEntities(m[2] ?? m[3] ?? m[4] ?? '');
  return out;
}

/** Parses an HTML fragment into a BODY element holding its nodes. Unclosed tags close at the end. */
export function parseHtmlFragment(html: string): HtmlNode {
  const root = element('BODY', {});
  const stack: HtmlNode[] = [root];
  const top = () => stack[stack.length - 1];
  const re = /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<!(?:[^>]*)>|<\/\s*([a-zA-Z][\w:-]*)\s*>|<([a-zA-Z][\w:-]*)((?:"[^"]*"|'[^']*'|[^'">])*)>|([^<]+|<)/g;
  let m: RegExpExecArray | null;
  let skipping: string | null = null;
  while ((m = re.exec(String(html || '')))) {
    const [, close, open, attrSrc, text] = m;
    if (skipping) {
      if (close && close.toUpperCase() === skipping) skipping = null;
      continue;
    }
    if (text !== undefined) {
      top().childNodes.push({ nodeType: 3, nodeName: '#text', textContent: decodeEntities(text), childNodes: [] });
    } else if (open) {
      const name = open.toUpperCase();
      if (SKIP_CONTENT.has(name)) { skipping = name; continue; }
      const el = element(name, parseAttrs(attrSrc || ''));
      top().childNodes.push(el);
      if (!VOID.has(name) && !/\/\s*$/.test(attrSrc || '')) stack.push(el);
    } else if (close) {
      const name = close.toUpperCase();
      for (let i = stack.length - 1; i > 0; i--) {
        if (stack[i].nodeName === name) { stack.length = i; break; }
      }
    }
  }
  return root;
}

/** The first element with this tag name, depth first. */
export function findFirst(node: HtmlNode, tag: string): HtmlNode | null {
  for (const c of node.childNodes) {
    if (c.nodeType !== 1) continue;
    if (c.nodeName === tag) return c;
    const f = findFirst(c, tag);
    if (f) return f;
  }
  return null;
}

/** Visible text of an HTML fragment, lines kept apart, spaces tidied. */
export function htmlToText(html: string): string {
  const withBreaks = String(html || '').replace(/<(br|\/p|\/div|\/li|\/h[1-6]|\/tr)\b[^>]*>/gi, '$&\n');
  return textOf(parseHtmlFragment(withBreaks)).replace(/[ \t ]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}
