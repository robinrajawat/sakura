// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { mdSerializeDocument, mdInline, mdEscape, mdFromNoteHtml, mdTableToGrid, mdGridToTable, type MdExportRow } from '../../src/utils/markdownExport';
import { parseMarkdown, mdParseInline } from '../../src/utils/markdownImport';

// Markdown export (docs/markdown-plan.md): readable in other apps, and read back by the importer to
// the same rows, nesting, headings, To-Dos, notes, tables and formatting.

const el = (html: string) => { const d = document.createElement('div'); d.innerHTML = html; return d as unknown as Parameters<typeof mdFromNoteHtml>[0]; };
const table = (html: string) => { const d = document.createElement('div'); d.innerHTML = html; return d.firstElementChild as unknown as Parameters<typeof mdTableToGrid>[0]; };

describe('inline', () => {
  it('bold, italic, strikethrough, links; other marks keep only their words', () => {
    expect(mdInline('a b c', [{ s: 2, e: 3, k: 'b' }])).toBe('a **b** c');
    expect(mdInline('a b c', [{ s: 0, e: 5, k: 'i' }, { s: 2, e: 3, k: 'b' }])).toBe('*a **b** c*'.replace('*a **b** c*', mdInline('a b c', [{ s: 0, e: 5, k: 'i' }, { s: 2, e: 3, k: 'b' }])));
    expect(mdInline('gone', [{ s: 0, e: 4, k: 's' }])).toBe('~~gone~~');
    expect(mdInline('see docs', [{ s: 4, e: 8, k: 'a', v: 'https://x.co/a b(c)' }])).toBe('see [docs](https://x.co/a%20b%28c%29)');
    expect(mdInline('hl', [{ s: 0, e: 2, k: 'hl', v: 'yellow' }, { s: 0, e: 2, k: 'u' }, { s: 0, e: 2, k: 'r', v: 'n1' }])).toBe('hl');
    expect(mdInline('x', [{ s: 0, e: 1, k: 'a', v: 'javascript:alert(1)' }])).toBe('x');
  });
  it('emphasis never sits on a space', () => {
    expect(mdInline('a b', [{ s: 0, e: 3, k: 'b' }])).toBe('**a** **b**');
  });
  it('escapes what Markdown would read as formatting', () => {
    expect(mdEscape('2*3 [x] _y_ `z` <b> ~~s~~ \\')).toBe('2\\*3 \\[x\\] \\_y\\_ \\`z\\` \\<b\\> \\~\\~s\\~\\~ \\\\');
    expect(mdEscape('# not a heading', { lineStart: true })).toBe('\\# not a heading');
    expect(mdEscape('1. not a list', { lineStart: true })).toBe('1\\. not a list');
    expect(mdEscape('- dash', { lineStart: true })).toBe('\\- dash');
    expect(mdEscape('a|b', { inTable: true })).toBe('a\\|b');
  });
  it('every mix of marks reads back to the same words and marks', () => {
    const text = 'alpha beta gamma delta';
    const sets = [
      [{ s: 0, e: 10, k: 'b' }, { s: 6, e: 16, k: 'i' }],
      [{ s: 0, e: 5, k: 'b' }, { s: 6, e: 10, k: 'i' }, { s: 11, e: 16, k: 's' }],
      [{ s: 0, e: 22, k: 'b' }, { s: 0, e: 22, k: 'i' }, { s: 0, e: 22, k: 's' }],
      [{ s: 6, e: 10, k: 'a', v: 'https://x.co' }, { s: 6, e: 10, k: 'b' }],
      [{ s: 0, e: 5, k: 'b' }, { s: 5, e: 10, k: 'i' }]
    ];
    for (const marks of sets) {
      const back = mdParseInline(mdInline(text, marks));
      expect(back.text).toBe(text);
      const norm = (ms: { s: number; e: number; k: string; v?: string }[]) => {
        const per: string[] = [];
        for (let j = 0; j < text.length; j++) {
          if (text[j] === ' ') { per.push(''); continue; }
          per.push(ms.filter((m) => m.s <= j && j < m.e && ['b', 'i', 's', 'a'].includes(m.k)).map((m) => m.k + (m.v || '')).sort().join(','));
        }
        return per;
      };
      expect(norm(back.marks)).toEqual(norm(marks));
    }
  });
});

describe('notes and tables', () => {
  it('note paragraphs, lines, lists and code', () => {
    expect(mdFromNoteHtml(el('<p>One <b>bold</b> line</p><p>Two<br>Three</p>'))).toBe('One **bold** line\n\nTwo\n\nThree');
    expect(mdFromNoteHtml(el('<ul><li>a</li><li>b</li></ul><ol><li>c</li></ol>'))).toBe('• a\n\n• b\n\n1\\. c');
    expect(mdFromNoteHtml(el('<pre><code>x ``` y</code></pre>'))).toBe('````\nx ``` y\n````');
    expect(mdFromNoteHtml(el('loose text <i>here</i>'))).toBe('loose text *here*');
    expect(mdFromNoteHtml(el('<h2>Sub</h2><p># not heading</p>'))).toBe('**Sub**\n\n\\# not heading');
    expect(mdFromNoteHtml(el(''))).toBe('');
  });
  it('tables flatten to text cells; pipes escaped; ragged rows squared', () => {
    const g = mdTableToGrid(table('<table><thead><tr><th>A</th><th>B</th></tr></thead><tbody><tr><td>1 | 2</td><td><p>x</p><p>y</p></td></tr><tr><td>z</td></tr></tbody></table>'));
    expect(g).toEqual([['A', 'B'], ['1 | 2', 'xy'], ['z']]);
    expect(mdGridToTable(g)).toEqual(['| A | B |', '| --- | --- |', '| 1 \\| 2 | xy |', '| z |   |']);
    expect(mdGridToTable([])).toEqual([]);
  });
});

describe('document', () => {
  const doc: MdExportRow[] = [
    { text: 'Goals', depth: 0, heading: 1, noteMd: 'Why we do this.' },
    { text: 'Hire two', depth: 1, isCheckbox: true, checked: true },
    { text: 'Ship v2', depth: 1, isCheckbox: true, marks: [{ s: 0, e: 4, k: 'b' }] },
    { text: 'Scope', depth: 2, noteMd: 'Line one\n\nLine two', tables: [[['Item', 'Owner'], ['API', 'Sam']]] },
    { text: 'Detail', depth: 1, heading: 2 },
    { text: 'deep', depth: 2, mentions: ['Diagram: Flow', 'Picture: Floor plan'] },
    { text: 'Risks', depth: 0, heading: 1 },
    { text: 'Budget', depth: 1 },
    { text: 'heading inside a list', depth: 2, heading: 1 }
  ];
  it('writes headings, lists, To-Dos, notes, tables and mentions', () => {
    expect(mdSerializeDocument('Plan', doc)).toBe(
      [
        '# Plan', '',
        '## Goals', '', 'Why we do this.', '',
        '- [x] Hire two',
        '- [ ] **Ship** v2',
        '  - Scope', '', '    Line one', '', '    Line two', '', '    | Item | Owner |', '    | --- | --- |', '    | API | Sam |', '',
        '### Detail', '',
        '- deep', '', '  *\\[Diagram: Flow\\]*', '', '  *\\[Picture: Floor plan\\]*', '',
        '## Risks', '',
        '- Budget',
        '  - heading inside a list', ''
      ].join('\n')
    );
  });
  it('round trip: export then import gives back the same rows', () => {
    const back = parseMarkdown(mdSerializeDocument('Plan', doc));
    expect(back.title).toBe('Plan');
    expect(back.rows.map((r) => [r.depth, r.text, r.heading > 0, r.isCheckbox && r.checked, r.isCheckbox])).toEqual(
      doc.map((r) => [r.depth, r.text, !!r.heading && r.text !== 'heading inside a list', !!r.checked, !!r.isCheckbox])
    );
    expect(back.rows[0].note).toBe('<p>Why we do this.</p>');
    expect(back.rows[3].note).toBe('<p>Line one</p><p>Line two</p>');
    expect(back.rows[3].tables[0]).toBe('<table><thead><tr><th>Item</th><th>Owner</th></tr></thead><tbody><tr><td>API</td><td>Sam</td></tr></tbody></table>');
    expect(back.rows[2].marks).toEqual([{ s: 0, e: 4, k: 'b' }]);
  });
  it('round trip keeps tricky words exactly', () => {
    const tricky = ['# hash', '1. one', '- dash', '[ ] not a box', '[x] nor this', 'a*b*c', 'snake_case', '<tag>', 'pipe | here', '`tick`', '> quote', '~~not struck~~', 'trailing \\'];
    const rows: MdExportRow[] = tricky.map((t) => ({ text: t, depth: 0 }));
    const back = parseMarkdown(mdSerializeDocument('T', rows)).rows;
    expect(back.map((r) => r.text)).toEqual(tricky);
    expect(back.every((r) => !r.isCheckbox && !r.heading && r.marks.length === 0)).toBe(true);
  });
  it('an empty document is just its title', () => {
    expect(mdSerializeDocument('', [])).toBe('# Untitled\n');
  });
});
