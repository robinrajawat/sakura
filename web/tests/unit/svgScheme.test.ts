import { describe, it, expect } from 'vitest';
import { svgForScheme } from '../../src/utils/svgScheme';

const svg = '<svg xmlns="http://www.w3.org/2000/svg" style="color-scheme: light dark"><rect fill="light-dark(#fff,#000)"/></svg>';
const decode = (u: string) => decodeURIComponent(u.slice(u.indexOf(',') + 1));

describe('svgForScheme', () => {
  it('pins a draw.io picture to the app\'s scheme (plain and base64 data URLs)', () => {
    const plain = 'data:image/svg+xml,' + encodeURIComponent(svg);
    expect(decode(svgForScheme(plain, 'light'))).toContain('color-scheme: light"');
    expect(decode(svgForScheme(plain, 'dark'))).toContain('color-scheme: dark"');
    const b64 = 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64');
    expect(decode(svgForScheme(b64, 'light'))).toContain('color-scheme: light"');
  });
  it('leaves other pictures and pictures with no scheme as they are', () => {
    expect(svgForScheme('data:image/png;base64,AAAA', 'dark')).toBe('data:image/png;base64,AAAA');
    const none = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg"/>');
    expect(svgForScheme(none, 'dark')).toBe(none);
    expect(svgForScheme('', 'light')).toBe('');
  });
  it('gives the same answer the second time (remembered)', () => {
    const plain = 'data:image/svg+xml,' + encodeURIComponent(svg);
    expect(svgForScheme(plain, 'dark')).toBe(svgForScheme(plain, 'dark'));
  });
});
