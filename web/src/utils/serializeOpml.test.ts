import { describe, it, expect, beforeAll } from 'vitest';
import { serializeOpmlCore, nodesToOutlineXmlCore, type OpmlNode } from './serializeOpml';
import { escapeHtml } from './escapeHtml';
import { getNodePlainText } from './stripSemanticMarkers';

// serializeOpml.ts references escapeHtml/getNodePlainText as ambient globals (declare function,
// erased at compile time — see the module's own header for why). In the real app those globals
// are provided by their own already-spliced generated blocks sharing the same script scope; in
// this Node test environment there is no such shared scope, so they're wired up explicitly here
// from the real implementations — not mocks, the actual tested code.
beforeAll(() => {
  const g = globalThis as unknown as {
    escapeHtml: typeof escapeHtml;
    getNodePlainText: typeof getNodePlainText;
  };
  g.escapeHtml = escapeHtml;
  g.getNodePlainText = getNodePlainText;
});

function node(depth: number, text: string, extra: Partial<OpmlNode> = {}): OpmlNode {
  return { id: depth * 1000 + text.length, depth, text, ...extra };
}

describe('nodesToOutlineXmlCore', () => {
  it('renders a leaf node as a self-closing <outline>', () => {
    const xml = nodesToOutlineXmlCore([node(0, 'Root')], 0, -1, true);
    expect(xml).toBe('<outline text="Root"/>');
  });

  it('renders a node with children as a wrapping <outline>', () => {
    const tree = [node(0, 'Root'), node(1, 'Child')];
    const xml = nodesToOutlineXmlCore(tree, 0, -1, true);
    expect(xml).toBe('<outline text="Root"><outline text="Child"/></outline>');
  });

  it('escapes HTML-special and quote characters in node text', () => {
    const xml = nodesToOutlineXmlCore([node(0, `<a> & "quote" 'apos'`)], 0, -1, true);
    expect(xml).toBe('<outline text="&lt;a&gt; &amp; &quot;quote&quot; &#39;apos&#39;"/>');
  });

  it('strips semantic markers from node text via getNodePlainText', () => {
    const xml = nodesToOutlineXmlCore([node(0, '[Section] title')], 0, -1, true);
    expect(xml).toBe('<outline text="Section title"/>');
  });

  it('prefixes checkbox nodes with [x] or [ ] based on checked state', () => {
    const checked = nodesToOutlineXmlCore([node(0, 'Done', { isCheckbox: true, checked: true })], 0, -1, true);
    const unchecked = nodesToOutlineXmlCore([node(0, 'Todo', { isCheckbox: true, checked: false })], 0, -1, true);
    expect(checked).toBe('<outline text="[x] Done"/>');
    expect(unchecked).toBe('<outline text="[ ] Todo"/>');
  });

  it('includes a _note attribute when nodeContentExportEnabled is true and the note is non-blank', () => {
    const xml = nodesToOutlineXmlCore([node(0, 'Root', { note: 'a note' })], 0, -1, true);
    expect(xml).toBe('<outline text="Root" _note="a note"/>');
  });

  it('omits the _note attribute when nodeContentExportEnabled is false', () => {
    const xml = nodesToOutlineXmlCore([node(0, 'Root', { note: 'a note' })], 0, -1, false);
    expect(xml).toBe('<outline text="Root"/>');
  });

  it('omits the _note attribute for a blank/whitespace-only note', () => {
    const xml = nodesToOutlineXmlCore([node(0, 'Root', { note: '   ' })], 0, -1, true);
    expect(xml).toBe('<outline text="Root"/>');
  });

  it('renders siblings at the same depth as separate top-level outlines', () => {
    const tree = [node(0, 'A'), node(0, 'B')];
    const xml = nodesToOutlineXmlCore(tree, 0, -1, true);
    expect(xml).toBe('<outline text="A"/><outline text="B"/>');
  });

  it('renders a deeper multi-level tree with correct nesting', () => {
    const tree = [node(0, 'Root'), node(1, 'Mid'), node(2, 'Leaf'), node(1, 'Sibling')];
    const xml = nodesToOutlineXmlCore(tree, 0, -1, true);
    expect(xml).toBe(
      '<outline text="Root"><outline text="Mid"><outline text="Leaf"/></outline><outline text="Sibling"/></outline>'
    );
  });
});

describe('serializeOpmlCore', () => {
  const fixedDate = new Date('2026-01-15T12:00:00.000Z');

  it('produces a valid empty OPML document for an empty node list', () => {
    const xml = serializeOpmlCore([], 'My Doc', true, fixedDate);
    expect(xml).toBe(
      '<?xml version="1.0" encoding="UTF-8"?>\n<opml version="2.0">\n<head><title>My Doc</title></head>\n<body></body>\n</opml>'
    );
  });

  it('falls back to "Untitled" for a blank title', () => {
    const xml = serializeOpmlCore([], '', true, fixedDate);
    expect(xml).toContain('<title>Untitled</title>');
  });

  it('escapes the title', () => {
    const xml = serializeOpmlCore([], 'A & B', true, fixedDate);
    expect(xml).toContain('<title>A &amp; B</title>');
  });

  it('includes a dateCreated header formatted as a UTC string', () => {
    const xml = serializeOpmlCore([node(0, 'Root')], 'Doc', true, fixedDate);
    expect(xml).toContain(`<dateCreated>${fixedDate.toUTCString()}</dateCreated>`);
  });

  it('does not include dateCreated for an empty document', () => {
    const xml = serializeOpmlCore([], 'Doc', true, fixedDate);
    expect(xml).not.toContain('dateCreated');
  });

  it('rebases depth so the shallowest node sits at the OPML root', () => {
    const subtree = [node(2, 'Parent'), node(3, 'Child')];
    const xml = serializeOpmlCore(subtree, 'Doc', true, fixedDate);
    expect(xml).toContain('<body>\n<outline text="Parent"><outline text="Child"/></outline>\n</body>');
  });

  it('defaults dateCreated to the current time when not provided', () => {
    const before = Date.now();
    const xml = serializeOpmlCore([node(0, 'Root')], 'Doc', true);
    const after = Date.now();
    const match = xml.match(/<dateCreated>(.+)<\/dateCreated>/);
    expect(match).not.toBeNull();
    const parsed = new Date(match![1]).getTime();
    expect(parsed).toBeGreaterThanOrEqual(before - 1000);
    expect(parsed).toBeLessThanOrEqual(after + 1000);
  });

  it('produces a well-formed document with real content end to end', () => {
    const tree = [node(0, '[Section] Todos'), node(1, 'Buy milk', { isCheckbox: true, checked: false, note: 'urgent' })];
    const xml = serializeOpmlCore(tree, 'My List', true, fixedDate);
    expect(xml).toBe(
      '<?xml version="1.0" encoding="UTF-8"?>\n<opml version="2.0">\n<head>\n<title>My List</title>\n<dateCreated>' +
        fixedDate.toUTCString() +
        '</dateCreated>\n</head>\n<body>\n<outline text="Section Todos"><outline text="[ ] Buy milk" _note="urgent"/></outline>\n</body>\n</opml>'
    );
  });
});
