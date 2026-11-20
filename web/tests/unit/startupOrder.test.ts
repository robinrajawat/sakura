import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Standard practice: declare everything, then start. index.html's main script used to start the app
// two thirds of the way down, so whatever the first draw reached further down wasn't set up yet. On
// the owner's iPhone an open thread did ("Cannot access '_threadKeptQuestions' before
// initialization"): startup stopped and the app froze (2026-11-20). Startup now runs last; this keeps
// it there.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const html = fs.readFileSync(path.resolve(__dirname, '../../index.html'), 'utf8');

describe('startup order in index.html', () => {
  const bootAt = html.indexOf('\nloadPrefs(); migrateStaleModelIds();');
  const doneAt = html.indexOf('\nwindow.__sakuraMainDone=true;');
  const scriptEnd = html.indexOf('</script>', doneAt);

  it('starts the app exactly once', () => {
    expect(bootAt).toBeGreaterThan(0);
    expect(html.indexOf('\nloadPrefs(); migrateStaleModelIds();', bootAt + 1)).toBe(-1);
  });

  it('starts it last in the main script: nothing but the "finished" marker follows', () => {
    const bootLineEnd = html.indexOf('\n', bootAt + 1);
    const code = (t: string) => t.split('\n').filter((l) => l.trim() && !l.trim().startsWith('//')).join('\n');
    expect(code(html.slice(bootLineEnd, doneAt))).toBe('');
    expect(html.slice(doneAt, scriptEnd).trim()).toBe('window.__sakuraMainDone=true;');
  });

  it('the main script really ends there (the start is not inside some earlier block)', () => {
    const mainStart = html.lastIndexOf('<script>', bootAt);
    expect(html.indexOf('</script>', mainStart)).toBe(scriptEnd);
  });
});
