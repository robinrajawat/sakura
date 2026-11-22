import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import { TOUCH_INPUT_QUERY } from '../../src/ui/phoneEditing';

// docs/mobile-plan.md, ground rule 1: a computer never sees a touch rule. Every top-level
// statement in touch.css must be the one touch @media block.
const css = readFileSync(path.resolve(__dirname, '../../src/styles/index/touch.css'), 'utf8');

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
      if (depth < 0) throw new Error('Unbalanced } in touch.css');
      if (depth === 0) { out.push(s.slice(start, i + 1).trim()); start = i + 1; }
    } else if (c === ';' && depth === 0) { out.push(s.slice(start, i + 1).trim()); start = i + 1; }
  }
  if (depth !== 0) throw new Error('Unbalanced { in touch.css');
  if (s.slice(start).trim()) out.push(s.slice(start).trim());
  return out.filter(Boolean);
}

describe('touch.css', () => {
  it('puts every rule inside the touch media query', () => {
    const norm = (q: string) => q.replace(/\s+/g, '').toLowerCase();
    for (const st of topLevelStatements(css)) {
      const head = st.slice(0, st.indexOf('{'));
      expect(head.trim().startsWith('@media'), `outside the touch query: ${st.slice(0, 80)}`).toBe(true);
      expect(norm(head.replace('@media', ''))).toBe(norm(TOUCH_INPUT_QUERY));
    }
  });
});
