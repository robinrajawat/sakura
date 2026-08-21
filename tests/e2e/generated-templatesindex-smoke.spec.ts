import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

// See tests/e2e/generated-presence-smoke.spec.ts for why these are expected/benign here.
const KNOWN_NOISE = /ServiceWorker|cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net|CORS policy|Failed to load resource/i;

// Phase 3's first feature-domain slice. Lower risk than any Phase 1 cutover — the extracted
// functions kept their original names and signatures exactly, so zero call sites needed to
// change — but this still exercises the real generated block against real localStorage and
// the real markMetaChanged/scheduleBackupWrite wiring, not a mock, and specifically checks for
// the "entire script silently died" failure mode the serializeMarkdown cutover found (an
// unrelated later function still being callable is proof the whole script executed).
test.describe('generated templatesIndex block (src/state/templatesIndex.ts spliced into index.html)', () => {
  test('index CRUD and trash/restore round-trip against real localStorage', async ({ page }) => {
    const unexpectedErrors: string[] = [];
    page.on('pageerror', (err) => {
      if (!KNOWN_NOISE.test(err.message)) unexpectedErrors.push('pageerror: ' + err.message);
    });
    page.on('console', (msg) => {
      if (msg.type() === 'error' && !KNOWN_NOISE.test(msg.text())) {
        unexpectedErrors.push('console.error: ' + msg.text());
      }
    });

    await page.goto('file://' + indexPath);

    const landing = page.locator('#sakura-landing-overlay');
    if (await landing.isVisible().catch(() => false)) {
      await page.evaluate(() => {
        const el = document.getElementById('sakura-landing-overlay');
        if (el) el.style.display = 'none';
      });
    }
    const welcome = page.locator('#welcome-overlay');
    if (await welcome.isVisible().catch(() => false)) {
      await page.evaluate(() => document.getElementById('welcome-overlay')?.classList.remove('open'));
    }

    // 1. Pure helpers — real string output, not just "is a function".
    const pureResults = await page.evaluate(() => ({
      // @ts-expect-error — bare globals from index.html
      key: templateKey('abc123'),
      // @ts-expect-error
      builtinId: builtinTemplateId('meeting-notes'),
      // @ts-expect-error
      icon: getBuiltinTemplateIconById('anything')
    }));
    expect(pureResults.key).toBe('sakura_template_v1_abc123');
    expect(pureResults.builtinId).toBe('t_builtin_meeting-notes_v10');
    expect(pureResults.icon).toBeNull();

    // 2. Full index lifecycle against REAL localStorage: create two entries via
    // touchTemplateIndex, verify loadActiveTemplatesIndex/loadTrashedTemplatesIndex split
    // correctly, trash one, verify it moved, restore it, verify it moved back — and set an
    // icon along the way. Clears any pre-existing state under this key first so the test is
    // deterministic regardless of what else has run in this page.
    const lifecycle = await page.evaluate(() => {
      // @ts-expect-error
      localStorage.removeItem('sakura_templates_index_v1');

      // @ts-expect-error
      touchTemplateIndex('t1', 'First Template');
      // @ts-expect-error
      touchTemplateIndex('t2', 'Second Template');
      // @ts-expect-error
      setTemplateIcon('t1', 'star');

      // @ts-expect-error
      const afterCreate = { active: loadActiveTemplatesIndex().map((t: any) => t.id).sort(), trashed: loadTrashedTemplatesIndex().map((t: any) => t.id) };

      // @ts-expect-error
      const t1IconAfterCreate = loadTemplatesIndex().find((t: any) => t.id === 't1')?.icon;

      // @ts-expect-error
      moveTemplateToTrashCore('t1');
      // @ts-expect-error
      const afterTrash = { active: loadActiveTemplatesIndex().map((t: any) => t.id), trashed: loadTrashedTemplatesIndex().map((t: any) => t.id) };

      // @ts-expect-error
      const restored = restoreTemplateFromTrashCore('t1');
      // @ts-expect-error
      const afterRestore = { active: loadActiveTemplatesIndex().map((t: any) => t.id).sort(), trashed: loadTrashedTemplatesIndex().map((t: any) => t.id) };

      // Confirm the real localStorage entry itself, not just the in-memory return values.
      // @ts-expect-error
      const rawPersisted = JSON.parse(localStorage.getItem('sakura_templates_index_v1'));

      return { afterCreate, t1IconAfterCreate, afterTrash, restored, afterRestore, rawPersisted };
    });

    expect(lifecycle.afterCreate).toEqual({ active: ['t1', 't2'], trashed: [] });
    expect(lifecycle.t1IconAfterCreate).toBe('star');
    expect(lifecycle.afterTrash).toEqual({ active: ['t2'], trashed: ['t1'] });
    expect(lifecycle.restored).toBe(true);
    expect(lifecycle.afterRestore).toEqual({ active: ['t1', 't2'], trashed: [] });
    expect(lifecycle.rawPersisted).toHaveLength(2);
    expect(lifecycle.rawPersisted.find((t: any) => t.id === 't1').trashedAt).toBeUndefined();

    // 3. Proof the rest of the script still runs — an unrelated, physically-distant function
    // (defined tens of thousands of characters later in the file) is still callable. This is
    // exactly the check that would have caught the serializeMarkdown import-statement bug:
    // a syntax error anywhere in the script kills everything after it, not just the broken
    // block, so a working call here rules that failure mode out for this cutover too.
    const restOfScriptWorks = await page.evaluate(() => {
      // @ts-expect-error
      return typeof getSelectionRangeIds === 'function' && typeof esc === 'function';
    });
    expect(restOfScriptWorks).toBe(true);

    expect(unexpectedErrors).toEqual([]);
  });

  test('stampTemplateDateAuthor fills in Date:/Author:/Date · Author placeholders via the real wrapper function', async ({ page }) => {
    const unexpectedErrors: string[] = [];
    page.on('pageerror', (err) => {
      if (!KNOWN_NOISE.test(err.message)) unexpectedErrors.push('pageerror: ' + err.message);
    });
    page.on('console', (msg) => {
      if (msg.type() === 'error' && !KNOWN_NOISE.test(msg.text())) {
        unexpectedErrors.push('console.error: ' + msg.text());
      }
    });

    await page.goto('file://' + indexPath);

    const landing = page.locator('#sakura-landing-overlay');
    if (await landing.isVisible().catch(() => false)) {
      await page.evaluate(() => {
        const el = document.getElementById('sakura-landing-overlay');
        if (el) el.style.display = 'none';
      });
    }
    const welcome = page.locator('#welcome-overlay');
    if (await welcome.isVisible().catch(() => false)) {
      await page.evaluate(() => document.getElementById('welcome-overlay')?.classList.remove('open'));
    }

    // Real stampTemplateDateAuthor() call, through the real (unchanged) wrapper — builds a real
    // `nodes` array with placeholder lines, sets the real #doc-author input's value (the DOM
    // read the wrapper itself still owns), and confirms the placeholders get filled correctly.
    const result = await page.evaluate(() => {
      // @ts-expect-error — bare globals from index.html
      nodes = [
        { id: 1, text: 'Date:', depth: 0, parentId: null, styles: {}, note: '', noteTitle: '', codeBlock: null, decisionLog: null, tags: [], checked: false, isCheckbox: false, marker: '', slideDivider: false },
        { id: 2, text: 'Author:', depth: 0, parentId: null, styles: {}, note: '', noteTitle: '', codeBlock: null, decisionLog: null, tags: [], checked: false, isCheckbox: false, marker: '', slideDivider: false },
        { id: 3, text: 'Unrelated line', depth: 0, parentId: null, styles: {}, note: '', noteTitle: '', codeBlock: null, decisionLog: null, tags: [], checked: false, isCheckbox: false, marker: '', slideDivider: false }
      ];
      const authorInput = document.getElementById('doc-author') as HTMLInputElement | null;
      if (authorInput) authorInput.value = 'Ajay';
      // @ts-expect-error
      stampTemplateDateAuthor();
      // @ts-expect-error
      return { dateLine: nodes[0].text, authorLine: nodes[1].text, unrelatedLine: nodes[2].text };
    });

    expect(result.dateLine).toMatch(/^Date: /);
    expect(result.authorLine).toBe('Author: Ajay');
    expect(result.unrelatedLine).toBe('Unrelated line');

    // Proof the rest of the script still runs — an unrelated, physically-distant function
    // (defined tens of thousands of characters later in the file) is still callable.
    const restOfScriptWorks = await page.evaluate(() => {
      // @ts-expect-error
      return typeof getSelectionRangeIds === 'function' && typeof esc === 'function';
    });
    expect(restOfScriptWorks).toBe(true);

    expect(unexpectedErrors).toEqual([]);
  });
});
