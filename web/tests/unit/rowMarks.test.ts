import { describe, expect, it } from 'vitest';
import {
  adjustRowMarksForText,
  convertLegacyRowLinks,
  convertLegacyRowMarkup,
  isRowLinkUrl,
  concatRowMarks,
  normalizeRowMarks,
  readRowMarksFromDom,
  rowMarksOf,
  setRowMarksOn,
  rowMarkCovers,
  rowMarkRuns,
  rowMarksToHtml,
  setRowMark,
  sliceRowMarks,
  type RowMarkDomNode,
  type RowMarksHolder
} from '../../src/utils/rowMarks';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

describe('normalizeRowMarks', () => {
  it('drops invalid, empty and out-of-range marks and clamps to the text', () => {
    expect(
      normalizeRowMarks(
        [
          { s: 0, e: 3, k: 'b' },
          { s: 2, e: 2, k: 'i' },
          { s: 1, e: 99, k: 'u' },
          { s: 0, e: 2, k: 'zz' },
          { s: 0, e: 2, k: 'hl', v: 'Bad Value!' },
          null
        ],
        5
      )
    ).toEqual([
      { s: 0, e: 3, k: 'b' },
      { s: 1, e: 5, k: 'u' }
    ]);
  });

  it('merges touching and overlapping ranges of the same kind', () => {
    expect(
      normalizeRowMarks(
        [
          { s: 0, e: 2, k: 'b' },
          { s: 2, e: 4, k: 'b' },
          { s: 3, e: 6, k: 'b' }
        ],
        10
      )
    ).toEqual([{ s: 0, e: 6, k: 'b' }]);
  });

  it('returns [] for no marks or empty text', () => {
    expect(normalizeRowMarks(undefined, 5)).toEqual([]);
    expect(normalizeRowMarks([{ s: 0, e: 1, k: 'b' }], 0)).toEqual([]);
  });
});

describe('split and merge', () => {
  const marks = [
    { s: 0, e: 5, k: 'b' as const },
    { s: 3, e: 8, k: 'hl' as const, v: 'yellow' }
  ];
  it('slices marks for each half of a split', () => {
    expect(sliceRowMarks(marks, 10, 0, 4)).toEqual([
      { s: 0, e: 4, k: 'b' },
      { s: 3, e: 4, k: 'hl', v: 'yellow' }
    ]);
    expect(sliceRowMarks(marks, 10, 4, 10)).toEqual([
      { s: 0, e: 1, k: 'b' },
      { s: 0, e: 4, k: 'hl', v: 'yellow' }
    ]);
  });
  it('concatenates the halves back to the original', () => {
    const a = sliceRowMarks(marks, 10, 0, 4);
    const b = sliceRowMarks(marks, 10, 4, 10);
    expect(concatRowMarks(a, 4, b, 6)).toEqual(normalizeRowMarks(marks, 10));
  });
});

describe('setRowMark / rowMarkCovers', () => {
  it('adds and removes an on/off kind on a range', () => {
    const bold = setRowMark([], 10, 2, 6, 'b', true);
    expect(bold).toEqual([{ s: 2, e: 6, k: 'b' }]);
    expect(rowMarkCovers(bold, 10, 2, 6, 'b')).toBe(true);
    expect(rowMarkCovers(bold, 10, 1, 6, 'b')).toBe(false);
    expect(setRowMark(bold, 10, 3, 5, 'b', false)).toEqual([
      { s: 2, e: 3, k: 'b' },
      { s: 5, e: 6, k: 'b' }
    ]);
  });
  it('a new highlight colour replaces the old one on those characters', () => {
    const y = setRowMark([], 10, 0, 6, 'hl', 'yellow');
    expect(setRowMark(y, 10, 2, 4, 'hl', 'green')).toEqual([
      { s: 0, e: 2, k: 'hl', v: 'yellow' },
      { s: 2, e: 4, k: 'hl', v: 'green' },
      { s: 4, e: 6, k: 'hl', v: 'yellow' }
    ]);
    expect(setRowMark(y, 10, 0, 6, 'hl', false)).toEqual([]);
  });
});

describe('adjustRowMarksForText', () => {
  it('shifts marks after an insertion and extends a mark the insertion falls inside', () => {
    const marks = [
      { s: 0, e: 4, k: 'b' as const },
      { s: 6, e: 9, k: 'i' as const }
    ];
    // "bold, ita" -> "bolder, ita": 2 chars inserted inside the bold word
    expect(adjustRowMarksForText(marks, 'bold, ita', 'bolder, ita')).toEqual([
      { s: 0, e: 6, k: 'b' },
      { s: 8, e: 11, k: 'i' }
    ]);
  });
  it('a replaced word takes the formatting of what it replaced', () => {
    const marks = [{ s: 4, e: 11, k: 'b' as const }];
    expect(adjustRowMarksForText(marks, 'See [[Old]] now', 'See [[Newer]] now')).toEqual([{ s: 4, e: 13, k: 'b' }]);
  });
  it('returns [] when there were no marks', () => {
    expect(adjustRowMarksForText(undefined, 'a', 'b')).toEqual([]);
  });
});

describe('rowMarkRuns / rowMarksToHtml', () => {
  it('renders plain text unchanged without marks', () => {
    expect(rowMarksToHtml('a < b', [], esc)).toBe('a &lt; b');
  });
  it('wraps each run in its formatting tags', () => {
    const html = rowMarksToHtml(
      'one two three',
      [
        { s: 0, e: 3, k: 'b' },
        { s: 4, e: 7, k: 'c', v: 'red' },
        { s: 8, e: 13, k: 'hl', v: 'yellow' }
      ],
      esc
    );
    expect(html).toBe(
      '<b>one</b> <span class="row-fc" data-c="red" style="color:var(--fc-red)">two</span> ' +
        '<mark class="row-hl hl-mark hl-mark-yellow" data-hl="yellow">three</mark>'
    );
  });
  it('typed [[ ]] is plain text, cut like any other words', () => {
    const runs = rowMarkRuns('see [[Row name]] ok', [{ s: 0, e: 9, k: 'b' }]);
    expect(runs.map((r) => r.text)).toEqual(['see [[Row', ' name]] ok']);
  });
  it('renders a row link as a link span holding the row id', () => {
    const html = rowMarksToHtml('see Plan ok', [{ s: 4, e: 8, k: 'r', v: '12' }, { s: 4, e: 6, k: 'b' }], (t) => t);
    expect(html).toBe('see <span class="bl-link" data-r="12"><b>Pl</b></span><span class="bl-link" data-r="12">an</span> ok');
  });
});

describe('readRowMarksFromDom', () => {
  const t = (s: string): RowMarkDomNode => ({ nodeType: 3, nodeValue: s });
  const el = (tag: string, kids: RowMarkDomNode[], attrs: Record<string, string> = {}): RowMarkDomNode => ({
    nodeType: 1,
    tagName: tag.toUpperCase(),
    childNodes: kids,
    getAttribute: (n: string) => attrs[n] ?? null
  });
  it('reads text and formatting from the tags the editor writes', () => {
    const root = el('div', [
      el('b', [t('Bold')]),
      t(' and '),
      el('mark', [el('i', [t('both')])], { 'data-hl': 'yellow' }),
      el('span', [t('!')], { 'data-c': 'red' })
    ]);
    expect(readRowMarksFromDom(root)).toEqual({
      text: 'Bold and both!',
      marks: [
        { s: 0, e: 4, k: 'b' },
        { s: 9, e: 13, k: 'i' },
        { s: 9, e: 13, k: 'hl', v: 'yellow' },
        { s: 13, e: 14, k: 'c', v: 'red' }
      ]
    });
  });
  it('ignores tags it does not know (pasted styles, the whole-row highlight wrapper)', () => {
    const root = el('div', [el('span', [el('font', [t('plain')])], { class: 'hl-mark hl-mark-yellow' }), el('br', [])]);
    expect(readRowMarksFromDom(root)).toEqual({ text: 'plain', marks: [] });
  });
});

describe('rowMarksOf / setRowMarksOn', () => {
  it('stores marks with the text they cover, and nothing when empty', () => {
    const node: RowMarksHolder = { text: 'hello world' };
    setRowMarksOn(node, [{ s: 0, e: 5, k: 'b' }]);
    expect(node).toEqual({ text: 'hello world', marks: [{ s: 0, e: 5, k: 'b' }], marksText: 'hello world' });
    setRowMarksOn(node, []);
    expect(node).toEqual({ text: 'hello world' });
  });
  it('moves marks to text changed elsewhere and stores the result', () => {
    const node = { text: 'hello world', marks: [{ s: 6, e: 11, k: 'i' as const }], marksText: 'hello world' };
    node.text = 'oh hello world';
    expect(rowMarksOf(node)).toEqual([{ s: 9, e: 14, k: 'i' }]);
    expect(node.marksText).toBe('oh hello world');
  });
});

describe('convertLegacyRowMarkup', () => {
  it('turns **bold** and __italic__ into formatting and removes the markers', () => {
    expect(convertLegacyRowMarkup('A **bold** and __it__ word')).toEqual({
      text: 'A bold and it word',
      marks: [
        { s: 2, e: 6, k: 'b' },
        { s: 11, e: 13, k: 'i' }
      ],
      changed: true
    });
  });
  it('leaves text without markup alone, and an unmatched ** literal', () => {
    expect(convertLegacyRowMarkup('2 ** 3 = 8')).toEqual({ text: '2 ** 3 = 8', marks: [], changed: false });
    expect(convertLegacyRowMarkup('snake__case')).toEqual({ text: 'snake__case', marks: [], changed: false });
  });
  it('reads like the old renderer: no nesting, nearest closing pair', () => {
    expect(convertLegacyRowMarkup('**a __b__ c**').text).toBe('a __b__ c');
  });
  it('never touches a [[link]]', () => {
    expect(convertLegacyRowMarkup('see [[**Row**]] and **this**')).toEqual({
      text: 'see [[**Row**]] and this',
      marks: [{ s: 20, e: 24, k: 'b' }],
      changed: true
    });
  });
  it('keeps existing formatting on the characters it moves', () => {
    expect(convertLegacyRowMarkup('**x** red', [{ s: 6, e: 9, k: 'c', v: 'red' }]).marks).toEqual([
      { s: 0, e: 1, k: 'b' },
      { s: 2, e: 5, k: 'c', v: 'red' }
    ]);
  });
});

describe('web links (k: a)', () => {
  it('keeps a safe address and drops script, data and multi-line ones', () => {
    expect(isRowLinkUrl('https://example.com/a?b=1')).toBe(true);
    expect(isRowLinkUrl('mailto:x@y.z')).toBe(true);
    expect(isRowLinkUrl('javascript:alert(1)')).toBe(false);
    expect(isRowLinkUrl(' data:text/html,x')).toBe(false);
    expect(isRowLinkUrl('https://a\nb')).toBe(false);
    expect(normalizeRowMarks([{ s: 0, e: 3, k: 'a', v: 'javascript:x' }], 5)).toEqual([]);
  });
  it('renders as a link with the address escaped, and reads back from the editor', () => {
    const html = rowMarksToHtml('see docs', [{ s: 4, e: 8, k: 'a', v: 'https://x.y/?a="1"&b' }], esc);
    expect(html).toBe(
      'see <a class="row-weblink" href="https://x.y/?a=&quot;1&quot;&amp;b" data-a="https://x.y/?a=&quot;1&quot;&amp;b" target="_blank" rel="noopener noreferrer">docs</a>'
    );
    const root: RowMarkDomNode = {
      nodeType: 1,
      tagName: 'DIV',
      childNodes: [
        { nodeType: 3, nodeValue: 'see ' },
        { nodeType: 1, tagName: 'A', childNodes: [{ nodeType: 3, nodeValue: 'docs' }], getAttribute: (n) => (n === 'data-a' ? 'https://x.y' : null) }
      ]
    };
    expect(readRowMarksFromDom(root)).toEqual({ text: 'see docs', marks: [{ s: 4, e: 8, k: 'a', v: 'https://x.y' }] });
  });
  it('a new address replaces the old one; false removes it', () => {
    const one = setRowMark([], 8, 0, 8, 'a', 'https://a.b');
    expect(setRowMark(one, 8, 0, 4, 'a', 'https://c.d')).toEqual([
      { s: 0, e: 4, k: 'a', v: 'https://c.d' },
      { s: 4, e: 8, k: 'a', v: 'https://a.b' }
    ]);
    expect(setRowMark(one, 8, 0, 8, 'a', false)).toEqual([]);
  });
});

describe('row links (kind r)', () => {
  const t = (x: string): RowMarkDomNode => ({ nodeType: 3, nodeValue: x });
  const el = (tag: string, kids: RowMarkDomNode[], attrs: Record<string, string> = {}): RowMarkDomNode => ({
    nodeType: 1,
    tagName: tag.toUpperCase(),
    childNodes: kids,
    getAttribute: (n: string) => attrs[n] ?? null
  });
  it('keeps a row id and drops anything else as the value', () => {
    expect(normalizeRowMarks([{ s: 0, e: 4, k: 'r', v: '17' }], 4)).toEqual([{ s: 0, e: 4, k: 'r', v: '17' }]);
    expect(normalizeRowMarks([{ s: 0, e: 4, k: 'r', v: '" onclick="x' }], 4)).toEqual([]);
    expect(normalizeRowMarks([{ s: 0, e: 4, k: 'r' }], 4)).toEqual([]);
  });
  it('words link to a web address or a row, never both', () => {
    const web = setRowMark([], 4, 0, 4, 'a', 'https://example.com');
    expect(setRowMark(web, 4, 0, 4, 'r', '3')).toEqual([{ s: 0, e: 4, k: 'r', v: '3' }]);
    expect(setRowMark([{ s: 0, e: 4, k: 'r', v: '3' }], 4, 0, 2, 'a', 'https://example.com')).toEqual([
      { s: 0, e: 2, k: 'a', v: 'https://example.com' },
      { s: 2, e: 4, k: 'r', v: '3' }
    ]);
  });
  it('reads a row link back from the editor', () => {
    const root = el('div', [t('see '), el('span', [t('Plan')], { class: 'bl-link', 'data-r': '9' }), t(' ok')]);
    expect(readRowMarksFromDom(root)).toEqual({ text: 'see Plan ok', marks: [{ s: 4, e: 8, k: 'r', v: '9' }] });
  });
  it('a renamed link keeps pointing at its row', () => {
    const marks = adjustRowMarksForText([{ s: 4, e: 8, k: 'r', v: '9' }], 'see Plan ok', 'see Plans ok');
    expect(marks).toEqual([{ s: 4, e: 9, k: 'r', v: '9' }]);
  });
});

describe('convertLegacyRowLinks', () => {
  const ids: Record<string, string> = { plan: '4', 'route determination': '7' };
  const resolve = (name: string) => ids[name.trim().toLowerCase()] ?? null;
  it('turns [[Name]] into the linked words', () => {
    expect(convertLegacyRowLinks('See [[Plan]] first', [], resolve)).toEqual({
      text: 'See Plan first',
      marks: [{ s: 4, e: 8, k: 'r', v: '4' }],
      changed: true
    });
  });
  it('a name no row has any more becomes plain words', () => {
    expect(convertLegacyRowLinks('See [[Gone]]', [], resolve)).toEqual({ text: 'See Gone', marks: [], changed: true });
  });
  it('keeps formatting around and on the link', () => {
    const r = convertLegacyRowLinks('**[[Route Determination]]** ok', [{ s: 0, e: 27, k: 'b' }], resolve);
    expect(r.text).toBe('**Route Determination** ok');
    expect(r.marks).toEqual([
      { s: 0, e: 23, k: 'b' },
      { s: 2, e: 21, k: 'r', v: '7' }
    ]);
  });
  it('reads names the old way: nearest ]] not followed by a third ]', () => {
    expect(convertLegacyRowLinks('[[a]]] and [[Plan]]', [], resolve).text).toBe('a] and Plan');
  });
  it('leaves rows without [[ alone', () => {
    expect(convertLegacyRowLinks('plain [x]', [{ s: 0, e: 5, k: 'i' }], resolve)).toEqual({
      text: 'plain [x]',
      marks: [{ s: 0, e: 5, k: 'i' }],
      changed: false
    });
  });
});
