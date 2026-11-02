import { describe, it, expect } from 'vitest';
import { stripPastedColours } from '../../src/utils/pastedColours';

describe('stripPastedColours', () => {
  it('drops colours a pasted page brought with it', () => {
    expect(stripPastedColours('<span style="color: rgb(0, 0, 0); font-weight: 700">Bold</span>')).toBe('<span style="font-weight: 700">Bold</span>');
    expect(stripPastedColours('<a href="https://x.com" style="color:#0000ee">x</a>')).toBe('<a href="https://x.com">x</a>');
    expect(stripPastedColours('<p style="background-color: rgb(255, 255, 255);">t</p>')).toBe('<p>t</p>');
    expect(stripPastedColours('<font color="#000">t</font><td bgcolor=white>c</td>')).toBe('<font>t</font><td>c</td>');
  });
  it("keeps Sakura's own colours", () => {
    const hl = '<span style="background-color: rgba(234, 179, 8, 0.35);">h</span>';
    expect(stripPastedColours(hl)).toBe(hl);
    expect(stripPastedColours('<span style="color:var(--fc-red)">r</span>')).toBe('<span style="color:var(--fc-red)">r</span>');
    expect(stripPastedColours('<span style="background-color: transparent;">t</span>')).toBe('<span style="background-color: transparent;">t</span>');
  });
  it('leaves everything else alone', () => {
    const plain = '<p><b>Bold</b> <a href="https://colour.example/background">link</a></p>';
    expect(stripPastedColours(plain)).toBe(plain);
    expect(stripPastedColours('')).toBe('');
  });
});
