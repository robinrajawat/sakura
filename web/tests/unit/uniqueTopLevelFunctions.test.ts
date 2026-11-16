import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// index.html is one script: two top-level functions with the same name don't fail, the later one
// silently replaces the earlier everywhere. A generated module once added helpers named like
// existing ones (`plainText`, `same`), and an old `tableColumnCount` had been dead for that reason.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const html = readFileSync(path.resolve(__dirname, '../../index.html'), 'utf8');

// Deliberate: src/core's copy matches index.html's exactly (see that module's header).
const ALLOWED = new Set(['escapeRegExpLiteral']);

describe('index.html top-level functions', () => {
  it('has no two with the same name', () => {
    const names = [...html.matchAll(/^(?:async )?function\s+([A-Za-z0-9_$]+)/gm)].map((m) => m[1]);
    const seen = new Set<string>();
    const dupes = new Set<string>();
    for (const n of names) (seen.has(n) ? dupes : seen).add(n);
    expect([...dupes].filter((n) => !ALLOWED.has(n))).toEqual([]);
  });
});
