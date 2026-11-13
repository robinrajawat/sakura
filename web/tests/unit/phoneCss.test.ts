import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import { PHONE_LAYOUT_QUERY } from '../../src/ui/phoneLayout';

// docs/mobile-plan.md, ground rule 1: the desktop never sees a phone rule. Every top-level
// statement in phone.css must be the one phone @media block.
const css = readFileSync(path.resolve(__dirname, '../../src/styles/index/phone.css'), 'utf8');

function topLevelStatements(src: string): string[] {
  const s = src.replace(/\/\*[\s\S]*?\*\//g, '');
  const out: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth < 0) throw new Error('Unbalanced } in phone.css');
      if (depth === 0) { out.push(s.slice(start, i + 1).trim()); start = i + 1; }
    } else if (c === ';' && depth === 0) { out.push(s.slice(start, i + 1).trim()); start = i + 1; }
  }
  if (depth !== 0) throw new Error('Unbalanced { in phone.css');
  if (s.slice(start).trim()) out.push(s.slice(start).trim());
  return out.filter(Boolean);
}

describe('phone.css', () => {
  it('puts every rule inside the phone media query', () => {
    const norm = (q: string) => q.replace(/\s+/g, '').toLowerCase();
    for (const st of topLevelStatements(css)) {
      const head = st.slice(0, st.indexOf('{'));
      expect(head.trim().startsWith('@media'), `outside the phone query: ${st.slice(0, 80)}`).toBe(true);
      expect(norm(head.replace('@media', ''))).toBe(norm(PHONE_LAYOUT_QUERY));
    }
  });
});
