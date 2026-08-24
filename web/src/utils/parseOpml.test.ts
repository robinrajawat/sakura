import { describe, it, expect } from 'vitest';
import { parseOpmlToTreeNodesCore } from './parseOpml';

function opml(bodyXml: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?><opml version="2.0"><head><title>Tree</title></head><body>${bodyXml}</body></opml>`;
}

describe('parseOpmlToTreeNodesCore', () => {
  it('parses a flat list of outline elements at depth 0', () => {
    const xml = opml('<outline text="First"/><outline text="Second"/>');
    expect(parseOpmlToTreeNodesCore(xml)).toEqual([
      { text: 'First', depth: 0, note: '', isCheckbox: false, checked: false },
      { text: 'Second', depth: 0, note: '', isCheckbox: false, checked: false }
    ]);
  });

  it('parses nested outline elements with increasing depth', () => {
    const xml = opml('<outline text="Parent"><outline text="Child"><outline text="Grandchild"/></outline></outline>');
    const parsed = parseOpmlToTreeNodesCore(xml);
    expect(parsed.map((n) => [n.text, n.depth])).toEqual([
      ['Parent', 0],
      ['Child', 1],
      ['Grandchild', 2]
    ]);
  });

  it('falls back to the title attribute when text is absent', () => {
    const xml = opml('<outline title="Untitled Node"/>');
    expect(parseOpmlToTreeNodesCore(xml)[0].text).toBe('Untitled Node');
  });

  it('reads the Sakura-specific _note attribute', () => {
    const xml = opml('<outline text="Node" _note="a note"/>');
    expect(parseOpmlToTreeNodesCore(xml)[0].note).toBe('a note');
  });

  it('parses a leading "[ ]" as an unchecked checkbox and strips it from the text', () => {
    const xml = opml('<outline text="[ ] Buy milk"/>');
    expect(parseOpmlToTreeNodesCore(xml)[0]).toEqual({
      text: 'Buy milk',
      depth: 0,
      note: '',
      isCheckbox: true,
      checked: false
    });
  });

  it('parses a leading "[x]" (case-insensitive) as a checked checkbox', () => {
    const xml = opml('<outline text="[X] Done already"/>');
    const parsed = parseOpmlToTreeNodesCore(xml)[0];
    expect(parsed.isCheckbox).toBe(true);
    expect(parsed.checked).toBe(true);
    expect(parsed.text).toBe('Done already');
  });

  it('returns [] for malformed XML', () => {
    expect(parseOpmlToTreeNodesCore('<opml><body><outline text="unclosed"</body></opml>')).toEqual([]);
  });

  it('returns [] when there is no <body> element', () => {
    expect(parseOpmlToTreeNodesCore('<?xml version="1.0"?><opml><head/></opml>')).toEqual([]);
  });

  it('returns [] for a body with no outline elements', () => {
    expect(parseOpmlToTreeNodesCore(opml(''))).toEqual([]);
  });
});
