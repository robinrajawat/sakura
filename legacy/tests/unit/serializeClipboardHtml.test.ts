import { describe, it, expect, beforeAll } from 'vitest';
import {
  getClipboardExportColorsCore,
  softenCore,
  depthTextColorCore,
  parseStyledTextForClipboardCore,
  serializeClipboardHtmlCore,
  type ClipboardNode,
  type ClipboardColors,
} from '../../src/utils/serializeClipboardHtml';
import { buildPrefix } from '../../src/core/nodeQueries';
import { computeOutlineNumbers } from '../../src/utils/serializeMarkdown';
import { escapeHtml } from '../../src/utils/escapeHtml';

// serializeClipboardHtml.ts references buildPrefix/computeOutlineNumbers/escapeHtml as ambient
// globals (declare function, erased at compile time — see the module's own header for why). In
// the real app those globals are provided by their own already-spliced generated blocks sharing
// the same script scope; in this Node test environment there is no such shared scope, so they're
// wired up explicitly here from the real implementations — not mocks, the actual tested code.
beforeAll(() => {
  const g = globalThis as unknown as {
    buildPrefix: typeof buildPrefix;
    computeOutlineNumbers: typeof computeOutlineNumbers;
    escapeHtml: typeof escapeHtml;
  };
  g.buildPrefix = buildPrefix;
  g.computeOutlineNumbers = computeOutlineNumbers;
  g.escapeHtml = escapeHtml;
});

function node(depth: number, text: string, styles: ClipboardNode['styles'] = {}): ClipboardNode {
  return { id: depth * 1000 + text.length, depth, text, styles };
}

describe('softenCore', () => {
  it('returns pure base at ratio 0 and pure color at ratio 1', () => {
    expect(softenCore('#ff0000', '#0000ff', 0)).toBe('rgb(0, 0, 255)');
    expect(softenCore('#ff0000', '#0000ff', 1)).toBe('rgb(255, 0, 0)');
  });

  it('mixes proportionally at an intermediate ratio', () => {
    expect(softenCore('#ffffff', '#000000', 0.5)).toBe('rgb(128, 128, 128)');
  });

  it('expands a 3-digit hex color before mixing', () => {
    expect(softenCore('#fff', '#000', 1)).toBe('rgb(255, 255, 255)');
  });

  it('falls back to color or base when one fails to parse', () => {
    expect(softenCore('not-a-color', '#000000')).toBe('not-a-color');
    expect(softenCore(null, '#000000')).toBe('#000000');
  });

  it('falls back to "#777" when neither color nor base parses', () => {
    expect(softenCore(null, undefined)).toBe('#777');
  });
});

describe('depthTextColorCore', () => {
  it('returns fg at depth 0 or negative', () => {
    expect(depthTextColorCore(0, '#111111', '#999999')).toBe('#111111');
    expect(depthTextColorCore(-1, '#111111', '#999999')).toBe('#111111');
  });

  it('fades progressively toward muted as depth increases', () => {
    const d1 = depthTextColorCore(1, '#000000', '#ffffff');
    const d2 = depthTextColorCore(2, '#000000', '#ffffff');
    const d3 = depthTextColorCore(3, '#000000', '#ffffff');
    expect(d3).toBe('#ffffff');
    // d1 should be closer to fg (darker) than d2 (68% vs 38% muted mix toward white)
    const d1Val = parseInt(d1.match(/\d+/)![0], 10);
    const d2Val = parseInt(d2.match(/\d+/)![0], 10);
    expect(d1Val).toBeLessThan(d2Val);
  });
});

describe('getClipboardExportColorsCore', () => {
  it('always returns the same fixed light-mode palette', () => {
    const colors = getClipboardExportColorsCore();
    expect(colors.fg).toBe('#1a1a1a');
    expect(colors.muted).toBe('#6b7280');
    expect(Object.keys(colors).length).toBeGreaterThan(5);
  });
});

describe('parseStyledTextForClipboardCore', () => {
  const colors: ClipboardColors = getClipboardExportColorsCore();

  it('renders a [section] = description semantic guide', () => {
    const html = parseStyledTextForClipboardCore('[Setup] = install dependencies', colors);
    expect(html).toContain('Setup');
    expect(html).toContain('install dependencies');
    expect(html).toContain('<span');
  });

  it('renders a (note) = description semantic guide in italic', () => {
    const html = parseStyledTextForClipboardCore('(aside) = extra context', colors);
    expect(html).toContain('font-style:italic');
  });

  it('renders a !alert = description semantic guide', () => {
    const html = parseStyledTextForClipboardCore('!warning = be careful', colors);
    expect(html).toContain('font-weight:600');
  });

  it('renders a `code` = description semantic guide with monospace styling', () => {
    const html = parseStyledTextForClipboardCore('`npm test` = run the suite', colors);
    expect(html).toContain('Consolas');
  });

  it('renders inline `code` spans within ordinary text', () => {
    const html = parseStyledTextForClipboardCore('run `npm test` now', colors);
    expect(html).toContain('run ');
    expect(html).toContain('Consolas');
    expect(html).toContain('npm test');
  });

  it('renders inline [bracket] spans within ordinary text', () => {
    const html = parseStyledTextForClipboardCore('see [Section] below', colors);
    expect(html).toContain('Section');
  });

  it('escapes plain text with no special markers', () => {
    const html = parseStyledTextForClipboardCore('<script>alert(1)</script>', colors);
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('returns an empty string for empty input', () => {
    expect(parseStyledTextForClipboardCore('', colors)).toBe('');
  });
});

describe('serializeClipboardHtmlCore', () => {
  it('returns an empty string for an empty node list', () => {
    expect(serializeClipboardHtmlCore([], false, false, 4, false)).toBe('');
  });

  it('renders a full self-contained HTML document', () => {
    const html = serializeClipboardHtmlCore([node(0, 'Root')], false, false, 4, false);
    expect(html).toContain('<!doctype html>');
    expect(html).toContain('<body');
    expect(html).toContain('Root');
  });

  it('renders one <div> row per node', () => {
    const tree = [node(0, 'Root'), node(1, 'Child A'), node(1, 'Child B')];
    const html = serializeClipboardHtmlCore(tree, false, false, 4, false);
    expect(html.match(/<div /g)?.length).toBe(3);
  });

  it('applies bold/italic/underline/strike inline styles from node.styles', () => {
    const html = serializeClipboardHtmlCore(
      [node(0, 'Styled', { bold: true, italic: true, underline: true, strike: true })],
      false,
      false,
      4,
      false
    );
    expect(html).toContain('font-weight:700');
    expect(html).toContain('font-style:italic');
    expect(html).toContain('underline');
    expect(html).toContain('line-through');
  });

  it('prepends dotted outline numbers when outlineNumbering is true', () => {
    const html = serializeClipboardHtmlCore([node(0, 'Root'), node(1, 'Child')], false, true, 4, false);
    expect(html).toContain('1&nbsp;');
    expect(html).toContain('1.1&nbsp;');
  });

  it('renders &nbsp; placeholder for a node with empty text', () => {
    const html = serializeClipboardHtmlCore([node(0, '')], false, false, 4, false);
    expect(html).toContain('&nbsp;</span></div>');
  });

  it('rebases depth to 0 for the shallowest node when rebaseDepth is true', () => {
    const subtree = [node(2, 'Parent'), node(3, 'Child')];
    const html = serializeClipboardHtmlCore(subtree, true, false, 4, false);
    // rebased: parent row has no leading tree-connector prefix span content (empty vert/conn)
    expect(html.indexOf('Parent')).toBeLessThan(html.indexOf('Child'));
  });

  it('strips the vertical continuation column when hideTreeLines is true', () => {
    const tree = [node(0, 'Root'), node(1, 'A'), node(2, 'A1'), node(1, 'B')];
    const shown = serializeClipboardHtmlCore(tree, false, false, 4, false);
    const hidden = serializeClipboardHtmlCore(tree, false, false, 4, true);
    expect(shown).toContain('│');
    expect(hidden).not.toContain('│');
  });
});
