import { describe, it, expect } from 'vitest';
import { trimCss, splitCssRules, splitSelectorList, testableSelector } from '../../src/utils/cssTrim';

const on = (present: string[]) => (sel: string) => present.some((p) => sel === p || sel === '*');

describe('splitCssRules', () => {
  it('splits top-level rules, honouring strings, comments and nesting', () => {
    const css = `a{content:"}"} /* x{} */ @media print{b{c:d}} @import url(x.css);`;
    expect(splitCssRules(css).map((r) => r.prelude)).toEqual(['a', '@media print', '@import url(x.css);']);
  });
});

describe('splitSelectorList', () => {
  it('splits at top-level commas only', () => {
    expect(splitSelectorList('a, :is(b, c) d, [title="x,y"]')).toEqual(['a', ':is(b, c) d', '[title="x,y"]']);
  });
});

describe('testableSelector', () => {
  it('drops states and pseudo-elements but keeps structure', () => {
    expect(testableSelector('.row:hover > .dot::before')).toBe('.row > .dot');
    expect(testableSelector('li:first-child:not(.x)')).toBe('li:first-child:not(.x)');
    expect(testableSelector('::selection')).toBe('*');
  });
});

describe('trimCss', () => {
  it('keeps rules that apply, with their original text, and drops the rest', () => {
    const css = '.used{color:red}\n.unused{color:blue}\n.a,.b{margin:0}';
    expect(trimCss(css, on(['.used', '.b']))).toBe('.used{color:red}\n.a,.b{margin:0}');
  });
  it('keeps at-rules that always matter and trims inside @media', () => {
    const css = '@font-face{font-family:X;src:url(x.woff2)}@page{margin:1cm}@media print{.used{a:b}.unused{c:d}}@media (max-width:600px){.unused{e:f}}';
    expect(trimCss(css, on(['.used']))).toBe('@font-face{font-family:X;src:url(x.woff2)}\n@page{margin:1cm}\n@media print{.used{a:b}}');
  });
  it('keeps a rule whose selector cannot be tested', () => {
    const throwing = () => { throw new Error('bad selector'); };
    expect(trimCss('.x:-weird-thing{a:b}', throwing)).toBe('.x:-weird-thing{a:b}');
  });
});
