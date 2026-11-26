import { describe, it, expect } from 'vitest';
import { parseMarkdown, mdParseInline } from '../../src/utils/markdownImport';

// Markdown import (docs/markdown-plan.md). The bar: no words are ever lost, nothing from the file is
// rendered as HTML, and real-world files from other apps come in with their structure.

const rows = (md: string) => parseMarkdown(md).rows;
const shape = (md: string) => rows(md).map((r) => [r.depth, r.text, r.heading, r.isCheckbox ? (r.checked ? 'x' : ' ') : '']);

describe('inline', () => {
  const m = (s: string) => {
    const r = mdParseInline(s);
    return { text: r.text, marks: r.marks.map((k) => [k.k, r.text.slice(k.s, k.e), k.v].filter((x) => x !== undefined)) };
  };
  it('bold, italic, strikethrough, both, and underscores', () => {
    expect(m('a **b** c')).toEqual({ text: 'a b c', marks: [['b', 'b']] });
    expect(m('a *b* _c_')).toEqual({ text: 'a b c', marks: [['i', 'b'], ['i', 'c']] });
    expect(m('~~gone~~')).toEqual({ text: 'gone', marks: [['s', 'gone']] });
    expect(m('***both***').text).toBe('both');
    expect(m('***both***').marks.map((x) => x[0]).sort()).toEqual(['b', 'i']);
    expect(m('__strong__').marks).toEqual([['b', 'strong']]);
  });
  it('nested emphasis keeps the right ranges', () => {
    expect(m('**a *b* c**')).toEqual({ text: 'a b c', marks: [['b', 'a b c'], ['i', 'b']] });
  });
  it('unmatched markers stay as typed, with no words lost', () => {
    expect(m('2 * 3 = 6').text).toBe('2 * 3 = 6');
    expect(m('**bold*').text).toBe('**bold*');
    // CommonMark closes the innermost marker first: *c* wins, the ** pair stays literal.
    expect(m('a **b *c** d')).toEqual({ text: 'a **b c* d', marks: [['i', 'c']] });
    expect(m('snake_case_name').text).toBe('snake_case_name');
    expect(m('~single~ ~~~triple~~~').text).toBe('~single~ ~~~triple~~~');
  });
  it('links: web and mail only; other schemes keep their words', () => {
    expect(m('see [docs](https://x.co/a_b) now')).toEqual({ text: 'see docs now', marks: [['a', 'docs', 'https://x.co/a_b']] });
    expect(m('[me](mailto:a@b.co)').marks).toEqual([['a', 'me', 'mailto:a@b.co']]);
    expect(m('[x](javascript:alert(1))')).toEqual({ text: 'x', marks: [] });
    expect(m('[t](https://x.co "Title")').marks).toEqual([['a', 't', 'https://x.co']]);
    expect(m('<https://x.co>')).toEqual({ text: 'https://x.co', marks: [['a', 'https://x.co', 'https://x.co']] });
    expect(m('[**bold link**](https://x.co)').marks).toEqual([['b', 'bold link'], ['a', 'bold link', 'https://x.co']]);
  });
  it('images become their alt text (linked); pictures are not fetched', () => {
    expect(m('![a chart](https://x.co/c.png)')).toEqual({ text: 'a chart', marks: [['a', 'a chart', 'https://x.co/c.png']] });
    expect(m('![](data:image/png;base64,AAAA)').text).toBe('');
  });
  it('code spans keep their words literally, without backticks', () => {
    expect(m('run `npm *test*` now')).toEqual({ text: 'run npm *test* now', marks: [] });
    expect(m('`` a`b ``').text).toBe('a`b');
    expect(m('unclosed `tick').text).toBe('unclosed `tick');
  });
  it('escapes, entities, wiki links', () => {
    expect(m('\\*not bold\\* \\# \\[x\\]').text).toBe('*not bold* # [x]');
    expect(m('a &amp; b &lt;c&gt; &#169; &#x2014;').text).toBe('a & b <c> © —');
    expect(m('[[Some Page]] and [[Page|Alias]]').text).toBe('Some Page and Alias');
  });
  it('raw HTML is reduced to its words and flagged', () => {
    const r = mdParseInline('a <span style="x">b</span> <script>alert(1)</script><br>c');
    expect(r.text).toBe('a b alert(1) c');
    expect(r.simplified).toBe(true);
    expect(r.text).not.toContain('<');
  });
});

describe('blocks', () => {
  it('a leading H1 is the title; H2/H3 nest; lists sit under their heading', () => {
    const r = parseMarkdown('# Plan\n\n## Goals\n\n- one\n- two\n  - two a\n\n### Detail\n\ntext\n\n## Risks\n\n- r1\n');
    expect(r.title).toBe('Plan');
    expect(shape('# Plan\n\n## Goals\n\n- one\n- two\n  - two a\n\n### Detail\n\ntext\n\n## Risks\n\n- r1\n')).toEqual([
      [0, 'Goals', 1, ''], [1, 'one', 0, ''], [1, 'two', 0, ''], [2, 'two a', 0, ''],
      [1, 'Detail', 2, ''], [0, 'Risks', 1, ''], [1, 'r1', 0, '']
    ]);
    expect(r.rows[4].note).toBe('<p>text</p>');
  });
  it('without a leading H1 the title is empty and H1 is a heading row', () => {
    const r = parseMarkdown('intro\n\n# A\n\n# B\n');
    expect(r.title).toBe('');
    expect(r.rows.map((x) => [x.depth, x.text, x.heading])).toEqual([[0, 'intro', 0], [0, 'A', 1], [0, 'B', 1]]);
  });
  it('deep headings use Heading 3 but keep their nesting', () => {
    expect(shape('# T\n## a\n### b\n#### c\n##### d')).toEqual([[0, 'a', 1, ''], [1, 'b', 2, ''], [2, 'c', 3, ''], [3, 'd', 3, '']]);
  });
  it('setext headings', () => {
    expect(parseMarkdown('Title\n=====\n\nPart\n----\n\n- x').title).toBe('Title');
    expect(shape('Title\n=====\n\nPart\n----\n\n- x')).toEqual([[0, 'Part', 1, ''], [1, 'x', 0, '']]);
  });
  it('task lists, ordered lists, * and + bullets, tabs and 4-space nesting', () => {
    expect(shape('- [ ] todo\n- [x] done\n- [X] Done too\n1. first\n2) second\n* star\n+ plus\n\t- tabbed child\n    - four-space child')).toEqual([
      [0, 'todo', 0, ' '], [0, 'done', 0, 'x'], [0, 'Done too', 0, 'x'], [0, 'first', 0, ''], [0, 'second', 0, ''],
      [0, 'star', 0, ''], [0, 'plus', 0, ''], [1, 'tabbed child', 0, ''], [1, 'four-space child', 0, '']
    ]);
  });
  it('a dedent returns to the right level', () => {
    expect(shape('- a\n  - b\n    - c\n  - d\n- e')).toEqual([[0, 'a', 0, ''], [1, 'b', 0, ''], [2, 'c', 0, ''], [1, 'd', 0, ''], [0, 'e', 0, '']]);
  });
  it('more lines of an item: lazy lines join its text; a later paragraph is its note', () => {
    const r = rows('- first line\n  still first\n\n  A note paragraph\n  over two lines.\n\n  Second note para.\n- next');
    expect(r[0].text).toBe('first line still first');
    expect(r[0].note).toBe('<p>A note paragraph over two lines.</p><p>Second note para.</p>');
    expect(r[1].text).toBe('next');
  });
  it('prose right under a heading is its note; other paragraphs are rows; text after a blank ends a list', () => {
    const r = rows('intro\n\n## H\n\npara one\ncontinues\n\nsecond para\n\n- item\n\nafter list');
    expect(r.map((x) => [x.depth, x.text, x.heading])).toEqual([[0, 'intro', 0], [0, 'H', 1], [1, 'item', 0], [1, 'after list', 0]]);
    expect(r[1].note).toBe('<p>para one continues</p><p>second para</p>');
  });
  it('fenced code becomes a monospaced note on the row it belongs to, escaped', () => {
    const r = rows('- step\n\n  ```js\n  if (a < b) run();\n  ```\n- next');
    expect(r[0].note).toBe('<pre><code>if (a &lt; b) run();</code></pre>');
    const r2 = rows('## Setup\n\n```\n<script>x</script>\n```');
    expect(r2[0].note).toBe('<pre><code>&lt;script&gt;x&lt;/script&gt;</code></pre>');
    expect(r2).toHaveLength(1);
  });
  it('an unclosed fence keeps everything after it as code, losing nothing', () => {
    const r = rows('intro\n\n```\nline 1\nline 2');
    expect(r[0].note).toBe('<pre><code>line 1\nline 2</code></pre>');
  });
  it('GitHub tables attach to the row above, in Sakura\'s table shape, escaped and squared up', () => {
    const r = rows('## Prices\n\n| Item | Price |\n|:--|--:|\n| A <b> | 1 |\n| B | 2 | extra |\n| C |\n');
    expect(r).toHaveLength(1);
    expect(r[0].tables[0]).toBe('<table><thead><tr><th>Item</th><th>Price</th></tr></thead><tbody><tr><td>A</td><td>1</td></tr><tr><td>B</td><td>2</td></tr><tr><td>C</td><td></td></tr></tbody></table>');
  });
  it('a table inside a list item belongs to that item; escaped pipes stay in the cell', () => {
    const r = rows('- item\n\n  | a | b |\n  |---|---|\n  | x \\| y | z |\n- next');
    expect(r[0].tables[0]).toContain('<td>x | y</td>');
    expect(r[1].tables).toEqual([]);
  });
  it('a table at the very top gets its own row', () => {
    const r = rows('| a |\n|---|\n| 1 |');
    expect(r).toHaveLength(1);
    expect(r[0].text).toBe('');
    expect(r[0].tables).toHaveLength(1);
  });
  it('a pipe in a sentence followed by a rule is not a table', () => {
    expect(rows('a | b\n\n---\n\nc').map((x) => x.text)).toEqual(['a | b', 'c']);
  });
  it('quotes and Obsidian callouts keep their words', () => {
    expect(rows('> quoted *text*\n> [!note] Callout title').map((x) => x.text)).toEqual(['quoted text', 'Callout title']);
  });
  it('front matter, rules, comments and Logseq properties are skipped', () => {
    expect(rows('---\ntitle: x\ntags: [a]\n---\n\n<!-- hidden -->\n\n- block\n  id:: 64a1-2\n  collapsed:: true\n\n***\n\nend').map((x) => x.text)).toEqual(['block', 'end']);
  });
  it('a numbered line inside a paragraph is not a list (only 1. starts one)', () => {
    expect(rows('Founded in\n2019. Still going.').map((x) => x.text)).toEqual(['Founded in 2019. Still going.']);
  });
  it('CRLF, a byte-order mark and trailing spaces', () => {
    expect(parseMarkdown('﻿# T\r\n\r\n- a  \r\n- b\r\n')).toMatchObject({ title: 'T', rows: [{ text: 'a' }, { text: 'b' }] });
  });
  it('empty or whitespace-only input yields nothing', () => {
    expect(parseMarkdown('')).toEqual({ title: '', rows: [], simplified: false });
    expect(parseMarkdown('\n  \n\t\n').rows).toEqual([]);
    expect(parseMarkdown('# Only a title').rows).toEqual([]);
  });
  it('raw HTML blocks are flagged as simplified and never pass through', () => {
    const r = parseMarkdown('<div align="center"><img src=x onerror=alert(1)>Hello</div>');
    expect(r.simplified).toBe(true);
    expect(r.rows[0].text).toBe('Hello');
  });
  it('every word of a messy file survives', () => {
    const md = '# T\n\n- a **b\n  c* d\n\n| x |\n|---|\n\n```\nz\n';
    const all = parseMarkdown(md).rows.map((r) => r.text + ' ' + r.note + ' ' + r.tables.join(' ')).join(' ');
    for (const w of ['a', 'b', 'c', 'd', 'x', 'z']) expect(all).toContain(w);
  });
});

describe('files shaped like other apps\' exports', () => {
  it('Obsidian note', () => {
    const md = '---\naliases: [plan]\n---\n# Q1 plan\n\nLinks to [[Roadmap]] and #planning.\n\n## Goals\n- [x] Hire **two** engineers\n- [ ] Ship v2 ^block-id\n\n> [!warning] Budget is tight\n';
    const r = parseMarkdown(md);
    expect(r.title).toBe('Q1 plan');
    expect(r.rows.map((x) => [x.depth, x.text, x.isCheckbox && x.checked])).toEqual([
      [0, 'Links to Roadmap and #planning.', false], [0, 'Goals', false], [1, 'Hire two engineers', true],
      [1, 'Ship v2 ^block-id', false], [1, 'Budget is tight', false]
    ]);
  });
  it('Notion page export', () => {
    const md = '# Meeting notes\n\nDate: November 3, 2026\n\n## Attendees\n\n- Alex\n- Sam\n\n## Decisions\n\n1. Go with vendor B\n    1. Sign by Friday\n\n<aside>\n💡 Remember the budget\n</aside>\n\n| Owner | Task |\n| --- | --- |\n| Alex | Contract |\n';
    const r = parseMarkdown(md);
    expect(r.title).toBe('Meeting notes');
    expect(r.rows.map((x) => [x.depth, x.text])).toEqual([
      [0, 'Date: November 3, 2026'], [0, 'Attendees'], [1, 'Alex'], [1, 'Sam'], [0, 'Decisions'], [1, 'Go with vendor B'], [2, 'Sign by Friday'],
      [1, '💡 Remember the budget']
    ]);
    expect(r.rows[7].tables).toHaveLength(1);
    expect(r.simplified).toBe(true);
  });
  it('Logseq page', () => {
    const md = 'title:: Project X\n\n- Kickoff\n  collapsed:: true\n\t- Agenda\n\t\t- Intro\n- TODO Book room\n';
    expect(rows(md).map((x) => [x.depth, x.text])).toEqual([[0, 'title:: Project X'], [0, 'Kickoff'], [1, 'Agenda'], [2, 'Intro'], [0, 'TODO Book room']]);
  });
  it('GitHub README', () => {
    const md = '# Tool\n\n[![build](https://x.co/b.svg)](https://x.co/ci)\n\n## Install\n\n```sh\nnpm i tool\n```\n\n## Usage\n\nRun `tool --help`.\n';
    const r = parseMarkdown(md);
    expect(r.title).toBe('Tool');
    expect(r.rows.map((x) => x.text)).toEqual(['build', 'Install', 'Usage']);
    expect(r.rows[1].note).toBe('<pre><code>npm i tool</code></pre>');
    expect(r.rows[2].note).toBe('<p>Run tool --help.</p>');
  });
});

describe('numbered lists', () => {
  it('numbers the parent of a 1. 2. list, under a heading or an item', () => {
    const r = parseMarkdown('## Steps\n\n1. One\n2. Two\n   - a\n   - b\n\n## Notes\n\n- x\n  1) y\n  2) z\n').rows;
    expect(r.map((x) => [x.text, x.depth, !!x.numbered])).toEqual([
      ['Steps', 0, true], ['One', 1, false], ['Two', 1, false], ['a', 2, false], ['b', 2, false],
      ['Notes', 0, false], ['x', 1, true], ['y', 2, false], ['z', 2, false],
    ]);
  });

  it('a numbered list at the very top has no parent row and comes in as bullets', () => {
    const r = parseMarkdown('1. One\n2. Two\n').rows;
    expect(r.map((x) => [x.text, !!x.numbered])).toEqual([['One', false], ['Two', false]]);
  });

  it('repairs numbers typed into bullet items', () => {
    const r = parseMarkdown('## Runtime flow\n\n- 1. Warehouse document is created\n- 2. EWM determines the process\n').rows;
    expect(r.map((x) => [x.text, !!x.numbered])).toEqual([
      ['Runtime flow', true], ['Warehouse document is created', false], ['EWM determines the process', false],
    ]);
  });
});
