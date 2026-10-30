import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

// Cutdown item 8: Export ▾ is trimmed to PDF + OPML and Import ▾ to OPML only. Word/.docx,
// PowerPoint, Markdown, plain-text, Copy as Text/Image, and Sakura Document (.json share) export,
// the Sakura Document / Word / pasted-text Import-menu entries, the To-Dos share export/import, and
// the Print button are all gone. These tests pin what's left (and that it still works), that the
// in-editor Ctrl/Cmd+C → paste node copy survived (it's editing, not export), and that prefs
// saved by an older build load harmlessly.

// The welcome modal opens on a ~500ms timer whenever no documents exist yet, so it could appear
// mid-test and intercept clicks. Marking it as already seen before the page loads removes that race.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => { try { localStorage.setItem('sakura_welcome_seen', '1'); } catch { /* storage unavailable */ } });
});

// See tests/e2e/generated-notifications-smoke.spec.ts for why these are expected/benign here.
const KNOWN_NOISE = /ServiceWorker|cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net|embed\.diagrams\.net|CORS policy|Failed to load resource|net::ERR/i;

function trackErrors(page: import('@playwright/test').Page) {
  const errors: string[] = [];
  page.on('pageerror', (err) => { if (!KNOWN_NOISE.test(err.message)) errors.push('pageerror: ' + err.message); });
  page.on('console', (msg) => { if (msg.type() === 'error' && !KNOWN_NOISE.test(msg.text())) errors.push('console.error: ' + msg.text()); });
  return errors;
}

async function dismissOverlays(page: import('@playwright/test').Page) {
  await page.evaluate(() => {
    const landing = document.getElementById('sakura-landing-overlay');
    if (landing) landing.style.display = 'none';
    document.getElementById('welcome-overlay')?.classList.remove('open');
  });
}

async function seedNodes(page: import('@playwright/test').Page) {
  await page.evaluate(() => {
    // @ts-expect-error -- bare globals from index.html
    nodes = [
      { id: 1, depth: 0, text: 'Alpha root', parentId: null, isCheckbox: false, checked: false, note: '', tags: [], styles: {} },
      { id: 2, depth: 1, text: 'Bravo child', parentId: 1, isCheckbox: false, checked: false, note: '', tags: [], styles: {} },
      { id: 3, depth: 1, text: 'Charlie child', parentId: 1, isCheckbox: false, checked: false, note: '', tags: [], styles: {} }
    ];
    // @ts-expect-error
    collapsedIds = new Set(); selectedId = null; multiSelectedIds = []; selectAllMode = false; focusedId = null; undoStack = []; editingId = null; nextId = 4;
    // @ts-expect-error
    qaItems = []; diagrams = []; remarks = [];
    // @ts-expect-error
    render();
  });
}

async function openExportMenu(page: import('@playwright/test').Page) {
  // Share holds Download PDF and Export (.opml); Import (.opml) is in the File Explorer header.
  await page.locator('#doc-share-chip').click();
  await expect(page.locator('#share-menu')).toBeVisible();
}

test.describe('Export/Import trim (PDF under Share; OPML export and import)', () => {
  test('Share holds Download PDF and Export (.opml); Import is on the File Explorer right-click', async ({ page }) => {
    const errors = trackErrors(page);
    await page.goto('file://' + indexPath);
    await dismissOverlays(page);

    // Share is always there; signed out it offers Download PDF and Export (inviting needs an account).
    await expect(page.locator('#doc-share-chip')).toBeVisible();
    await openExportMenu(page);
    const items = page.locator('#share-menu .sb-context-item');
    await expect(items.locator('.sb-context-label')).toHaveText(['Download PDF', 'Export']);
    expect(await items.evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.save))).toEqual(['pdf', 'opml']);
    await expect(page.locator('#share-menu .sb-context-submenu, #share-menu .sb-context-heading')).toHaveCount(0);
    await page.keyboard.press('Escape');
    await expect(page.locator('#appbar-more-toggle')).toHaveCount(0);
    // The Import ▾ button opens the same items.
    await page.evaluate(() => document.getElementById('import-toggle')?.click());
    await expect(page.locator('#import-menu .sb-context-item')).toHaveText([/OPML/, /Postman/]);
    await page.keyboard.press('Escape');

    // Removed surfaces are really gone, not just hidden.
    for (const sel of ['#print-btn', '#appbar-more-print-btn', '#abhsec-print', '#sakura-doc-file-input', '#sakura-docx-file-input',
      '#import-ai-restructure', '#export-menu-buttons-field', '#diagram-export-toggle', '#preview-closing-slide-toggle',
      '#todos-export-sakura-item', '#todos-import-btn', '#todos-share-file-input']) {
      await expect(page.locator(sel), sel).toHaveCount(0);
    }
    const gone = await page.evaluate(() => ['exportDocx', 'exportPptx', 'exportMarkdown', 'exportTreeFormat', 'exportTreeAsImage',
      'exportToClipboard', 'exportSakuraDocumentFile', 'importSakuraDocumentFile', 'importDocxFile', 'handlePrint']
      .filter((n) => typeof (window as unknown as Record<string, unknown>)[n] !== 'undefined'));
    expect(gone).toEqual([]);
    expect(await page.evaluate(() => typeof (window as unknown as { PptxGenJS?: unknown }).PptxGenJS)).toBe('undefined');

    // The To-Dos panel exports PDF only — one "Export as PDF" item in its ⋯ menu.
    await page.evaluate(() => (document.getElementById('todos-more-trigger') as HTMLElement | null)?.click());
    await expect(page.locator('#todos-more-menu [id^="todos-export"]')).toHaveCount(1);
    await expect(page.locator('#todos-more-menu #todos-export-pdf-item')).toHaveCount(1);

    expect(errors).toEqual([]);
  });

  test('Share → Download PDF still renders the document headlessly and calls print()', async ({ page }) => {
    const errors = trackErrors(page);
    await page.goto('file://' + indexPath);
    await dismissOverlays(page);
    await seedNodes(page);
    await page.evaluate(() => {
      (window as unknown as { __printCalls: number }).__printCalls = 0;
      window.print = () => { (window as unknown as { __printCalls: number }).__printCalls++; };
    });

    await page.locator('#doc-share-chip').click();
    await page.locator('#share-menu .sb-context-item[data-save="pdf"]').click();

    await expect.poll(() => page.evaluate(() => (window as unknown as { __printCalls: number }).__printCalls)).toBe(1);
    expect(await page.evaluate(() => document.body.classList.contains('printing-preview'))).toBe(true);
    const bodyText = await page.locator('#preview-body').textContent();
    expect(bodyText).toContain('Alpha root');
    expect(bodyText).toContain('Bravo child');
    expect(bodyText).toContain('Charlie child');

    // headless print() has no real lifecycle -- fire afterprint to run the export's own cleanup.
    await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
    await expect.poll(() => page.evaluate(() => document.body.classList.contains('printing-preview'))).toBe(false);
    expect(errors).toEqual([]);
  });

  test('Share → Export still produces a valid OPML file', async ({ page }) => {
    const errors = trackErrors(page);
    await page.goto('file://' + indexPath);
    await dismissOverlays(page);
    await seedNodes(page);

    await openExportMenu(page);
    const downloadPromise = page.waitForEvent('download');
    await page.locator('#share-menu .sb-context-item[data-save="opml"]').click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/\.opml$/);
    const filePath = await download.path();
    const fs = await import('fs');
    const xml = fs.readFileSync(filePath!, 'utf8');

    const parsed = await page.evaluate((text) => {
      const doc = new DOMParser().parseFromString(text, 'application/xml');
      const err = doc.getElementsByTagName('parsererror').length;
      const root = doc.querySelector('opml > body > outline');
      return { err, rootText: root?.getAttribute('text'), childTexts: [...(root?.children || [])].map((c) => c.getAttribute('text')) };
    }, xml);
    expect(parsed.err).toBe(0);
    expect(parsed.rootText).toBe('Alpha root');
    expect(parsed.childTexts).toEqual(['Bravo child', 'Charlie child']);
    expect(errors).toEqual([]);
  });

  test('Import ▾ → OPML still imports a file as a new document', async ({ page }) => {
    const errors = trackErrors(page);
    await page.goto('file://' + indexPath);
    await dismissOverlays(page);

    const opml = '<?xml version="1.0" encoding="UTF-8"?><opml version="2.0"><head><title>Imported outline</title></head><body>'
      + '<outline text="Delta root"><outline text="Echo child"/><outline text="Foxtrot child"/></outline></body></opml>';
    await page.locator('#sakura-opml-file-input').setInputFiles({ name: 'outline.opml', mimeType: 'text/x-opml', buffer: Buffer.from(opml, 'utf8') });

    await expect.poll(() => page.evaluate(() => (
      // @ts-expect-error -- bare global
      nodes.map((n) => `${n.depth}:${n.text}`)
    ))).toEqual(['0:Delta root', '1:Echo child', '1:Foxtrot child']);
    expect(errors).toEqual([]);
  });

  test('Ctrl/Cmd+C copies selected nodes and pasting them back inserts them (editing, not export)', async ({ page }) => {
    const errors = trackErrors(page);
    await page.goto('file://' + indexPath);
    await dismissOverlays(page);
    await seedNodes(page);

    // Capture what the copy writes instead of depending on real clipboard permissions on file://.
    await page.evaluate(() => {
      const w = window as unknown as { __clip: Record<string, string> | null };
      w.__clip = null;
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: {
          write: async (items: ClipboardItem[]) => {
            const out: Record<string, string> = {};
            for (const it of items) for (const t of it.types) out[t] = await (await it.getType(t)).text();
            w.__clip = out;
          },
          writeText: async (t: string) => { w.__clip = { 'text/plain': t }; }
        }
      });
      // @ts-expect-error -- bare globals
      selectedId = 1; editingId = null; render();
    });
    await page.locator('body').click({ position: { x: 5, y: 5 } }).catch(() => {});
    await page.evaluate(() => {
      // @ts-expect-error
      selectedId = 1; editingId = null; render();
      (document.activeElement as HTMLElement | null)?.blur?.();
    });
    await page.keyboard.press('ControlOrMeta+c');

    await expect.poll(() => page.evaluate(() => (window as unknown as { __clip: Record<string, string> | null }).__clip)).not.toBeNull();
    const clip = await page.evaluate(() => (window as unknown as { __clip: Record<string, string> }).__clip);
    expect(clip['text/plain']).toContain('Alpha root');
    expect(clip['text/plain']).toContain('Bravo child');
    expect(clip['text/html']).toContain('Charlie child');

    // Paste the copied tree back onto a selected node through the same document paste handler a
    // real Ctrl/Cmd+V hits, replaying both halves exactly as a real clipboard carries them. The
    // paste handler prefers text/html, which used to collapse Sakura's own copy into one node.
    await page.evaluate((data) => {
      const dt = new DataTransfer();
      dt.setData('text/plain', data['text/plain']);
      dt.setData('text/html', data['text/html']);
      // @ts-expect-error
      selectedId = 3; editingId = null;
      document.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
    }, clip);

    const texts = await page.evaluate(() => (
      // @ts-expect-error
      nodes.map((n) => n.text)
    ));
    expect(texts.length).toBe(6);
    expect(texts.filter((t: string) => t === 'Alpha root').length).toBe(2);
    expect(texts.filter((t: string) => t === 'Bravo child').length).toBe(2);
    // The pasted copy keeps its shape: a root with two children one level below it.
    const pasted = await page.evaluate(() => {
      // @ts-expect-error
      const all = nodes as Array<{ text: string; depth: number }>;
      const at = all.map((n) => n.text).lastIndexOf('Alpha root');
      return all.slice(at, at + 3).map((n) => ({ text: n.text, rel: n.depth - all[at].depth }));
    });
    expect(pasted).toEqual([
      { text: 'Alpha root', rel: 0 },
      { text: 'Bravo child', rel: 1 },
      { text: 'Charlie child', rel: 1 }
    ]);
    expect(errors).toEqual([]);
  });

  test('pasting multi-line HTML from outside Sakura gives one node per line, not one collapsed node', async ({ page }) => {
    const errors = trackErrors(page);
    await page.goto('file://' + indexPath);
    await dismissOverlays(page);
    await page.evaluate(() => {
      // @ts-expect-error -- bare globals from index.html
      ensureDocumentForEditing();
    });
    await seedNodes(page);
    const texts = await page.evaluate(() => {
      const dt = new DataTransfer();
      const html = '<html><body>\n  <p>First <b>idea</b></p>\n  <div>Second line</div>Third<br>Fourth\n</body></html>';
      dt.setData('text/html', html);
      dt.setData('text/plain', 'First idea Second line Third Fourth');
      // @ts-expect-error
      selectedId = 3; editingId = null;
      document.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
      // @ts-expect-error
      return (nodes as Array<{ text: string }>).map((n) => n.text);
    });
    expect(texts.slice(3)).toEqual(['First idea', 'Second line', 'Third', 'Fourth']);
    expect(errors).toEqual([]);
  });

  test('prefs saved by an older build (removed export/print settings) load harmlessly and are dropped', async ({ page }) => {
    const errors = trackErrors(page);
    await page.addInitScript(() => {
      try {
        localStorage.setItem('sakura_v001_prefs', JSON.stringify({
          exportHiddenButtons: ['clipboard', 'image', 'md', 'txt', 'opml'],
          appbarHiddenButtons: ['print', 'help'],
          diagramExportEnabled: false,
          previewClosingSlideEnabled: true, previewClosingSlideText: 'Thanks!', previewClosingSlideSubtitle: 'Q&A',
          skipFoldedInExports: false
        }));
        localStorage.setItem('sakura-shortcut-overrides', JSON.stringify({ copyAsImage: 'mod+alt+i' }));
      } catch { /* storage unavailable */ }
    });
    await page.goto('file://' + indexPath);
    await dismissOverlays(page);

    // (skipFoldedInExports was removed later, in cutdown 9b — exports and copy now always include
    // folded sections; App bar items were removed in item 14 — Help/Import/Export always show.)
    await expect(page.locator('#help-toggle')).toHaveCount(1);
    // OPML is always in the Export menu now, even though the old prefs had hidden it.
    await openExportMenu(page);
    await expect(page.locator('#share-menu .sb-context-item[data-save="opml"]')).toBeVisible();

    // The next save writes no removed keys back.
    const saved = await page.evaluate(() => {
      // @ts-expect-error
      savePrefs();
      return JSON.parse(localStorage.getItem('sakura_v001_prefs') || '{}');
    });
    for (const k of ['exportHiddenButtons', 'appbarHiddenButtons', 'diagramExportEnabled', 'previewClosingSlideEnabled', 'previewClosingSlideText', 'previewClosingSlideSubtitle', 'skipFoldedInExports']) {
      expect(saved, k).not.toHaveProperty(k);
    }
    expect(await page.evaluate(() => (
      // @ts-expect-error
      Object.prototype.hasOwnProperty.call(shortcutOverrides, 'copyAsImage')
    ))).toBe(false);
    expect(errors).toEqual([]);
  });
});
