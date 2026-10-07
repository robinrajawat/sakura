import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

async function dismissOverlays(page: import('@playwright/test').Page) {
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
}

// Seeds a single node with the given note HTML, expanded inline (inlineExpandNoteNodeIds), and
// renders. Mirrors inline-note-alignment-and-fold-visibility.spec.ts's own setup pattern. A note
// line only renders at all when the note is non-blank OR forceInlineNoteId names this node (see
// render()'s own guard) -- so an empty starting note (testing what gets typed/pasted into a fresh
// note) needs forceInlineNoteId set, the same way openInlineNoteAndFocus's real "Add note" path
// does it.
function seedNodeWithNote(page: import('@playwright/test').Page, note: string, forceInline = false) {
  return page.evaluate(({ note, forceInline }) => {
    // @ts-expect-error -- bare globals from index.html
    nodes = [{ id: 1, depth: 0, text: 'Parent', parentId: null, isCheckbox: false, checked: false, note, tags: [], styles: {} }];
    // @ts-expect-error
    collapsedIds = new Set();
    // @ts-expect-error
    selectedId = null; multiSelectedIds = []; selectAllMode = false; focusedId = null; undoStack = []; editingId = null;
    // @ts-expect-error
    nextId = 2;
    // @ts-expect-error
    inlineExpandNoteNodeIds = new Set([1]);
    // @ts-expect-error
    forceInlineNoteId = forceInline ? 1 : null;
    // @ts-expect-error
    render();
  }, { note, forceInline });
}

// Dispatches a real `contextmenu` event directly on the element, rather than Playwright's own
// click({button:'right'}) -- that performs its own mouse-move/scroll/actionability pass first,
// which (on this nested, scrollable editor layout) can land the real click somewhere else
// entirely by the time it fires, same as this file's paste tests already dispatch a synthetic
// `paste` event directly rather than relying on a real OS clipboard interaction.
function rightClick(page: import('@playwright/test').Page, selector: string) {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel)!;
    const rect = el.getBoundingClientRect();
    const ev = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: rect.x + rect.width / 2, clientY: rect.y + rect.height / 2 });
    el.dispatchEvent(ev);
  }, selector);
}

// A plain click on a table/chart/Cards/picture figure is intentionally a no-op while the note is
// unfocused (clicking a card should never silently drop you into editing it) -- "Edit note" from
// the right-click menu is the one remaining way into the whole note's live/raw edit mode,
// replacing what used to be a plain `page.locator('#note-line-1').click()` throughout this file's
// existing tests.
async function editNote(page: import('@playwright/test').Page) {
  await rightClick(page, '#note-line-1 .pv-diagram-figure');
  await page.locator('.sb-context-menu').getByText('Edit note', { exact: true }).click();
}

// A real right-click fires 'mousedown' BEFORE 'contextmenu' -- and a mousedown's own native
// default action (focusing whatever contenteditable it lands on) happens whether or not the menu
// this test cares about ever opens. rightClick above only dispatches 'contextmenu' in isolation,
// which happens to never exercise that native focus side effect at all -- a real blind spot that
// let a real bug ship without a failing test. This dispatches the real sequence, mousedown(button
// 2) then contextmenu, so a target's own mousedown handler actually runs.
function realRightClick(page: import('@playwright/test').Page, selector: string) {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel)!;
    const rect = el.getBoundingClientRect();
    const opts = { bubbles: true, cancelable: true, button: 2, clientX: rect.x + rect.width / 2, clientY: rect.y + rect.height / 2 };
    el.dispatchEvent(new MouseEvent('mousedown', opts));
    el.dispatchEvent(new MouseEvent('contextmenu', opts));
  }, selector);
}

// Stubs navigator.clipboard.write to record what was written, rather than relying on real OS
// clipboard access -- headless Chromium's clipboard permissions (and file:// being a non-secure
// context) make that unreliable to depend on in a test.
function stubClipboard(page: import('@playwright/test').Page) {
  return page.evaluate(() => {
    // @ts-expect-error
    window.__clipboardWrites = [];
    class FakeClipboardItem {
      data: Record<string, Blob>;
      constructor(data: Record<string, Blob>) { this.data = data; }
    }
    // @ts-expect-error
    window.ClipboardItem = FakeClipboardItem;
    // navigator.clipboard is a getter-only accessor on the real Navigator prototype -- a plain
    // assignment silently no-ops in sloppy mode rather than throwing, leaving the REAL clipboard
    // API in place (which then fails/rejects under headless Chromium + file://'s non-secure
    // context, swallowed by the copy handler's own try/catch). Overriding the property itself via
    // defineProperty is what's actually needed to intercept the call.
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        write: async (items: InstanceType<typeof FakeClipboardItem>[]) => {
          const item = items[0];
          const entry: Record<string, string> = {};
          for (const [type, blob] of Object.entries(item.data)) entry[type] = await blob.text();
          // @ts-expect-error
          window.__clipboardWrites.push(entry);
        },
      },
    });
  });
}

// Inline notes were reverted from plain text (PR #326) back to rich HTML -- .node-note-line is a
// contenteditable div again, same family as remarks/Q&A/Pad, so it can hold pasted images and
// tables (with a chart-featured table rendering as its chart while not focused). These tests
// exercise that contenteditable behavior directly, not through real OS clipboard paste (headless
// Chromium has no accessible system clipboard), by dispatching synthetic paste/keyboard events
// and by seeding node.note with HTML a real paste would have produced.
test.describe('Inline node notes are rich text (contenteditable)', () => {
  // openInlineNoteAndFocus (every "Add/edit note" entry point: keyboard shortcut, context menu,
  // toolbar button, search-reveal) used to rely solely on the transient forceInlineNoteId to keep
  // a brand-new note visible -- that flag clears itself the instant the note-line's input handler
  // sees real content (see its own comment), with nothing else keeping the note expanded
  // afterward. "Add remark"/"Add question"/"Add diagram" all call forceInlineItemExpanded at their
  // own creation point for exactly this reason; openInlineNoteAndFocus never did, so a newly
  // typed note would vanish (while still safely saved in node.note) the moment anything else
  // triggered a render -- switching the selected node, for instance.
  test('typing into a brand-new note keeps it visible across an unrelated render, not just while forceInlineNoteId is still set', async ({ page }) => {
    await page.goto('file://' + indexPath);
    await dismissOverlays(page);
    await page.evaluate(() => {
      // @ts-expect-error
      nodes = [
        { id: 1, depth: 0, text: 'Parent', parentId: null, isCheckbox: false, checked: false, note: '', tags: [], styles: {} },
        { id: 2, depth: 0, text: 'Sibling', parentId: null, isCheckbox: false, checked: false, note: '', tags: [], styles: {} },
      ];
      // @ts-expect-error
      collapsedIds = new Set();
      // @ts-expect-error
      selectedId = null; multiSelectedIds = []; selectAllMode = false; focusedId = null; undoStack = []; editingId = null;
      // @ts-expect-error
      nextId = 3;
      // @ts-expect-error
      inlineExpandNoteNodeIds = new Set();
      // @ts-expect-error
      openInlineNoteAndFocus(1);
    });

    await page.locator('#note-line-1').click();
    await page.keyboard.type('Just typed this');

    // Any unrelated render -- selecting a different node is as ordinary as it gets -- must not
    // make the note that was just typed disappear.
    await page.evaluate(() => {
      // @ts-expect-error
      setSingleSelection(2);
      // @ts-expect-error
      render();
    });

    await expect(page.locator('#note-line-1')).toBeVisible();
    const note = await page.evaluate(() => {
      // @ts-expect-error
      return nodes.find((n: any) => n.id === 1).note;
    });
    expect(note).toContain('Just typed this');
  });

  test('the note line is a contenteditable div, not a textarea', async ({ page }) => {
    await page.goto('file://' + indexPath);
    await dismissOverlays(page);
    await seedNodeWithNote(page, 'Hello');

    const result = await page.evaluate(() => {
      const el = document.getElementById('note-line-1')!;
      return { tag: el.tagName, contentEditable: (el as HTMLElement).contentEditable };
    });
    expect(result.tag).toBe('DIV');
    expect(result.contentEditable).toBe('true');
  });

  test('typing persists real HTML via the input handler, surviving a blur/focus round-trip', async ({ page }) => {
    await page.goto('file://' + indexPath);
    await dismissOverlays(page);
    await seedNodeWithNote(page, '', true);

    await page.locator('#note-line-1').click();
    await page.keyboard.type('Hello world');
    await page.locator('#note-line-1').blur();

    const note = await page.evaluate(() => {
      // @ts-expect-error
      return nodes.find((n: any) => n.id === 1).note;
    });
    expect(note).toContain('Hello world');
  });

  // The note-line's own paste handler intercepts an image-only clipboard item (no text/html at
  // all -- the common screenshot case) and inserts it manually via FileReader + insertImage,
  // since that's the one path native browser paste can't be relied on for in every context. This
  // is the part of the paste handler that's actually our own code (not dependent on the browser's
  // native paste insertion), so it's the part worth exercising directly.
  test('pasting an image-only clipboard item inserts an <img> and persists it', async ({ page }) => {
    await page.goto('file://' + indexPath);
    await dismissOverlays(page);
    await seedNodeWithNote(page, '', true);

    const noteLine = page.locator('#note-line-1');
    await noteLine.click();

    await page.evaluate(() => {
      const el = document.getElementById('note-line-1')!;
      const pngBytes = atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=');
      const bytes = new Uint8Array(pngBytes.length);
      for (let i = 0; i < pngBytes.length; i++) bytes[i] = pngBytes.charCodeAt(i);
      const file = new File([bytes], 'shot.png', { type: 'image/png' });
      const clipboardData = {
        getData: () => '',
        items: [{ type: 'image/png', getAsFile: () => file }],
      };
      const ev = new Event('paste', { bubbles: true, cancelable: true });
      Object.defineProperty(ev, 'clipboardData', { value: clipboardData });
      el.dispatchEvent(ev);
    });
    await page.waitForTimeout(100);

    const result = await page.evaluate(() => {
      const el = document.getElementById('note-line-1')!;
      return {
        hasImg: !!el.querySelector('img'),
        // @ts-expect-error
        noteHasImg: /<img/i.test(nodes.find((n: any) => n.id === 1).note || ''),
      };
    });
    expect(result.hasImg).toBe(true);
    expect(result.noteHasImg).toBe(true);
  });

  // Tables/charts/Cards are no longer embedded in node.note's rich HTML at all -- they're their
  // own first-class node.tables objects, rendered and edited inline right where a table used to
  // sit in the note's reading order (see migrateNoteTablesToNode/buildNodeTableObject in
  // index.html). The tests that exercised the OLD "pasted table inside a note" shape -- right-click
  // a figure, "Edit note"/"Edit card/chart" to enter a scoped session, etc. -- have been replaced by
  // the "Table/chart/Cards objects (node.tables)" describe block further down, which exercises the
  // exact same behaviors (add/delete row & column, feature as chart, chart type picks, Copy/Delete,
  // the resize-handle-leak and delete-row-wipes-the-whole-table regressions) through the new entry
  // point. pickCardIconId/renderCardsHtml's own icon-assignment behavior doesn't depend on where
  // the table lives either way, so those tests stay as they were.
  test.describe('Cards data/icon helpers (not tied to where the table lives)', () => {

    // Cards' offline keyword fallback (pickCardIconId/CARD_ICON_RULES) originally only knew
    // generic KPI categories (security, speed, time, scope, cost, people, growth, quality) --
    // useless for a project-estimate table whose rows are actual system names (ERP, EWM,
    // nShift, webshop, cart, integrations), which all fell back to the same few recycled icons
    // regardless of which system a row was about. Each system name now has its own catalog
    // entry and keyword rule, matched case-insensitively against the row's label.
    test('Cards recognizes common system names (ERP, EWM, nShift, webshop, cart, integrations) and picks a matching icon', async ({ page }) => {
      await page.goto('file://' + indexPath);
      await dismissOverlays(page);

      const ids = await page.evaluate(() => {
        // @ts-expect-error -- bare global from index.html
        return [
          pickCardIconId('ERP - O2C - Functional', '10 days', 0),
          pickCardIconId('ERP - ABAP', '6 days', 1),
          pickCardIconId('EWM - ABAP', '5 days', 2),
          pickCardIconId('EWM - Functional', '5 days', 3),
          pickCardIconId('nShift', '5 days', 4),
          pickCardIconId('Webshop checkout', '3 days', 5),
          pickCardIconId('Cart abandonment flow', '2 days', 6),
          pickCardIconId('Integrations layer', '4 days', 7),
        ];
      });
      // Webshop and cart share one icon/category -- a storefront and its checkout read as the
      // same system on a project-estimate card, not two things worth telling apart visually.
      expect(ids).toEqual(['erp', 'erp', 'ewm', 'ewm', 'nshift', 'cart', 'cart', 'integrations']);
    });

    // CARD_ICON_RULES is generated from src/data/cardIconKeywords.json (see
    // scripts/generate-index-blocks.mjs's cardIconRules data block) specifically so more
    // synonyms for an existing system can be added by editing that JSON file directly, without
    // touching index.html's JS by hand. This locks in the keywords that JSON file actually adds
    // today (CXP, Basket, Frontend, all aliasing the "cart" category) as a real behavioral
    // contract, not just documentation.
    test('CXP, Basket, and Frontend (added via src/data/cardIconKeywords.json) all map to the cart icon', async ({ page }) => {
      await page.goto('file://' + indexPath);
      await dismissOverlays(page);

      const ids = await page.evaluate(() => {
        // @ts-expect-error -- bare global from index.html
        return [
          pickCardIconId('CXP release', '4 days', 0),
          pickCardIconId('Basket & payments', '3 days', 1),
          pickCardIconId('Frontend build', '2 days', 2),
        ];
      });
      expect(ids).toEqual(['cart', 'cart', 'cart']);
    });

    test('a card labeled "Solution Architecture" or "Blueprint" picks the architecture icon', async ({ page }) => {
      await page.goto('file://' + indexPath);
      await dismissOverlays(page);

      const ids = await page.evaluate(() => {
        // @ts-expect-error -- bare global from index.html
        return [
          pickCardIconId('Solution Architecture', '8 days', 0),
          pickCardIconId('Target Landscape Blueprint', '5 days', 1),
        ];
      });
      expect(ids).toEqual(['architecture', 'architecture']);
    });

    test('a Cards table with system-name rows renders each one\'s matching icon, not a generic/recycled one', async ({ page }) => {
      await page.goto('file://' + indexPath);
      await dismissOverlays(page);

      const result = await page.evaluate(() => {
        const container = document.createElement('div');
        container.innerHTML = '<table><tr><th>System</th><th>Estimate</th></tr><tr><td>ERP - ABAP</td><td>6 days</td></tr><tr><td>EWM - Functional</td><td>5 days</td></tr><tr><td>nShift</td><td>5 days</td></tr></table>';
        const table = container.querySelector('table')!;
        // @ts-expect-error -- bare globals from index.html
        const html = renderCardsHtml(table);
        const div = document.createElement('div'); div.innerHTML = html;
        const cards = [...div.querySelectorAll('.pv-table-card')];
        // @ts-expect-error
        const catalog = CARD_ICON_CATALOG;
        // Comparing a card's live (parsed-then-reserialized) SVG innerHTML directly against the
        // catalog's raw self-closing-tag source string would never match -- the DOM serializer
        // always rewrites a childless SVG element as <ellipse ...></ellipse>, not <ellipse .../>.
        // Round-tripping the catalog path through the same div.innerHTML parse/reserialize makes
        // the comparison apples-to-apples.
        const normalize = (path: string) => {
          const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
          svg.innerHTML = path;
          return svg.innerHTML;
        };
        return cards.map(c => ({
          label: c.querySelector('.pv-table-card-label')?.textContent,
          path: c.querySelector('.pv-table-card-icon svg')?.innerHTML,
        })).map(c => ({ ...c, matchesErp: c.path === normalize(catalog.erp.path), matchesEwm: c.path === normalize(catalog.ewm.path), matchesNshift: c.path === normalize(catalog.nshift.path) }));
      });
      expect(result[0]).toMatchObject({ label: 'ERP - ABAP', matchesErp: true });
      expect(result[1]).toMatchObject({ label: 'EWM - Functional', matchesEwm: true });
      expect(result[2]).toMatchObject({ label: 'nShift', matchesNshift: true });
    });

    // node.note is only ever supposed to hold the real table, never the rendered Cards/chart
    // markup (see renderNoteDisplayHtml's own comment) -- but a note saved before that guarantee
    // existed can be stuck holding exactly that: bare .pv-table-cards-grid HTML with no <table>
    // left in it at all. With no <table>/<img> to match, renderNoteDisplayHtml's own fast-path
    // returns such a note's HTML completely unchanged, which (a) shows the stranded cards as
    // directly-editable plain content instead of a read-only figure, and (b) gives the note-line's
    // right-click handler no .pv-diagram-figure to recognize, so it falls back to the generic
    // "nothing under the caret" menu (Insert table / Rewrite with AI / Delete note) instead of
    // Copy/Edit note. repairCorruptedCardsNote reconstructs a real table from each card's own
    // visible label/value text -- the only data actually recoverable from this markup -- the first
    // time such a note renders, after which it behaves like any other Cards-featured note.
    test('a note whose saved HTML is bare rendered Cards markup (no backing table) self-heals into a real table on render', async ({ page }) => {
      await page.goto('file://' + indexPath);
      await dismissOverlays(page);

      const corruptedNote = await page.evaluate(() => {
        const container = document.createElement('div');
        container.innerHTML = '<table><tr><th>Label</th><th>Value</th></tr><tr><td>ERP - O2C - Functional</td><td>10 days</td></tr><tr><td>EWM - ABAP</td><td>5 days</td></tr></table>';
        const table = container.querySelector('table')!;
        // @ts-expect-error -- bare global from index.html
        return renderCardsHtml(table); // bare "<div class="pv-table-cards-grid">...</div>", no <table> at all
      });
      expect(corruptedNote).not.toContain('<table');

      await seedNodeWithNote(page, corruptedNote);

      const result = await page.evaluate(() => {
        // @ts-expect-error
        const note = nodes.find((n: any) => n.id === 1).note;
        const el = document.getElementById('note-line-1')!;
        return {
          repairedNoteHasTable: /<table[^>]*data-feature-chart="1"[^>]*data-chart-type="cards"/.test(note),
          repairedNoteRowText: note,
          displayHasFigure: !!el.querySelector('.pv-diagram-figure'),
          displayHasCardsGrid: !!el.querySelector('.pv-table-cards-grid'),
        };
      });
      expect(result.repairedNoteHasTable).toBe(true);
      expect(result.repairedNoteRowText).toContain('ERP - O2C - Functional');
      expect(result.repairedNoteRowText).toContain('10 days');
      expect(result.repairedNoteRowText).toContain('EWM - ABAP');
      expect(result.displayHasFigure).toBe(true);
      expect(result.displayHasCardsGrid).toBe(true);

      // And now behaves like any ordinary Cards note -- right-click offers the full read-only
      // object menu, not the generic "nothing under the caret" menu the corrupted shape fell into.
      await realRightClick(page, '#note-line-1 .pv-table-card');
      const menu = page.locator('.sb-context-menu');
      await expect(menu.locator('.sb-context-item')).toHaveCount(4);
      await expect(menu.getByText('Copy', { exact: true })).toBeVisible();
      await expect(menu.getByText('Edit note', { exact: true })).toBeVisible();
    });
  });

  test.describe('Table/chart/Cards objects (node.tables)', () => {
    // Seeds node 1 directly with a node.tables array, bypassing migrateNoteTablesToNode entirely --
    // used by tests that aren't themselves testing migration.
    function seedNodeWithTables(page: import('@playwright/test').Page, tables: string[], note = '') {
      return page.evaluate(({ tables, note }) => {
        // @ts-expect-error -- bare globals from index.html
        nodes = [{ id: 1, depth: 0, text: 'Parent', parentId: null, isCheckbox: false, checked: false, note, tables, tags: [], styles: {} }];
        // @ts-expect-error
        collapsedIds = new Set(); selectedId = null; multiSelectedIds = []; selectAllMode = false; focusedId = null; undoStack = []; editingId = null; nextId = 2;
        // @ts-expect-error
        render();
      }, { tables, note });
    }
    const tableNote = '<table><tr><th>Label</th><th>Value</th></tr><tr><td>A</td><td>10</td></tr></table>';

    test('a note with an embedded table migrates it into node.tables, leaving the note as plain text', async ({ page }) => {
      await page.goto('file://' + indexPath);
      await dismissOverlays(page);
      await seedNodeWithNote(page, '<p>Keep this text.</p>' + tableNote);

      const result = await page.evaluate(() => {
        // @ts-expect-error
        const n = nodes.find((x: any) => x.id === 1);
        return { note: n.note, tables: n.tables, hasTableLine: !!document.querySelector('.node-table-line') };
      });
      expect(result.note).not.toContain('<table');
      expect(result.note).toContain('Keep this text.');
      expect(result.tables).toHaveLength(1);
      expect(result.tables[0]).toContain('<table');
      expect(result.hasTableLine).toBe(true);
    });

    test('a plain table object displays as a plain table, a chart-featured one as its chart SVG, a Cards one as a card grid', async ({ page }) => {
      await page.goto('file://' + indexPath);
      await dismissOverlays(page);
      await page.evaluate(() => {
        // @ts-expect-error
        nodes = [
          { id: 1, depth: 0, text: 'Plain', parentId: null, isCheckbox: false, checked: false, note: '', tables: ['<table><tr><th>Label</th><th>Value</th></tr><tr><td>A</td><td>10</td></tr></table>'], tags: [], styles: {} },
          { id: 2, depth: 0, text: 'Chart', parentId: null, isCheckbox: false, checked: false, note: '', tables: ['<table data-feature-chart="1"><tr><th>Label</th><th>Value</th></tr><tr><td>A</td><td>10</td></tr><tr><td>B</td><td>20</td></tr></table>'], tags: [], styles: {} },
          { id: 3, depth: 0, text: 'Cards', parentId: null, isCheckbox: false, checked: false, note: '', tables: ['<table data-feature-chart="1" data-chart-type="cards"><tr><th>Label</th><th>Value</th></tr><tr><td>A</td><td>10</td></tr></table>'], tags: [], styles: {} },
        ];
        // @ts-expect-error
        collapsedIds = new Set(); selectedId = null; multiSelectedIds = []; selectAllMode = false; focusedId = null; undoStack = []; editingId = null; nextId = 4;
        // @ts-expect-error
        render();
      });
      // Not a plain "has an <svg>" check -- a Cards grid has its own small per-card icon <svg>s, so
      // that alone can't tell a real chart apart from Cards. pv-table-chart-figure itself is added
      // for BOTH (same as buildNoteTableFigure's own convention) -- renderTableChartSvg returns
      // Cards' own grid markup for the 'cards' type rather than a literal <svg>, which is what
      // actually distinguishes the two, not the class.
      const result = await page.evaluate(() =>
        [...document.querySelectorAll('.node-table-line')].map(l => ({
          hasTable: !!l.querySelector('table'),
          isChartFigure: l.classList.contains('pv-table-chart-figure'),
          hasCardsGrid: !!l.querySelector('.pv-table-cards-grid'),
        }))
      );
      expect(result[0]).toMatchObject({ hasTable: true, isChartFigure: false, hasCardsGrid: false });
      expect(result[1]).toMatchObject({ isChartFigure: true, hasCardsGrid: false });
      expect(result[2]).toMatchObject({ isChartFigure: true, hasCardsGrid: true });
    });

    test('clicking a table object enters edit mode; typing and blurring persists it and returns to display', async ({ page }) => {
      await page.goto('file://' + indexPath);
      await dismissOverlays(page);
      await seedNodeWithTables(page, [tableNote.match(/<table.*<\/table>/)![0]]);

      await page.locator('.node-table-line td').first().click();
      const whileEditing = await page.evaluate(() => {
        const active = document.activeElement as HTMLElement | null;
        return { activeTag: active?.tagName, isEditing: document.querySelector('.node-table-line.editing') !== null };
      });
      expect(whileEditing.activeTag).toBe('TD');
      expect(whileEditing.isEditing).toBe(true);

      await page.keyboard.press('End');
      await page.keyboard.type('XYZ');
      await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());

      const after = await page.evaluate(() => ({
        // @ts-expect-error
        table: nodes.find((n: any) => n.id === 1).tables[0],
        isEditing: document.querySelector('.node-table-line.editing') !== null,
      }));
      expect(after.table).toContain('AXYZ');
      expect(after.isEditing).toBe(false);
    });

    test('right-clicking an unfocused table object (display mode) offers "Copy", "Feature as chart" and "Delete" -- no row/column edit items', async ({ page }) => {
      await page.goto('file://' + indexPath);
      await dismissOverlays(page);
      await seedNodeWithTables(page, [tableNote.match(/<table.*<\/table>/)![0]]);

      await rightClick(page, '.node-table-line');
      const menu = page.locator('.sb-context-menu');
      await expect(menu.locator('.sb-context-item')).toHaveCount(3);
      await expect(menu.getByText('Copy', { exact: true })).toBeVisible();
      await expect(menu.getByText('Feature as chart', { exact: true })).toBeVisible();
      await expect(menu.getByText('Delete', { exact: true })).toBeVisible();
      await expect(menu.getByText('Add row below', { exact: true })).toHaveCount(0);
    });

    // "How should I feature it as chart or card?" was a real discoverability gap -- this used to
    // only be reachable after clicking into edit mode and right-clicking a specific cell. Letting
    // it work straight from the read-only display-mode menu (above) means a fresh parse of
    // node.tables[tIdx], not the disposable display clone, so this confirms the write-back actually
    // lands on the real node.tables entry, not a throwaway DOM clone.
    test('"Feature as chart" from the display-mode menu persists straight to node.tables, no edit-mode round-trip needed', async ({ page }) => {
      await page.goto('file://' + indexPath);
      await dismissOverlays(page);
      await seedNodeWithTables(page, [tableNote.match(/<table.*<\/table>/)![0]]);

      await rightClick(page, '.node-table-line');
      await page.locator('.sb-context-menu').getByText('Feature as chart', { exact: true }).click();

      const result = await page.evaluate(() => {
        // @ts-expect-error
        const table = nodes.find((n: any) => n.id === 1).tables[0];
        return { table, hasChartFigure: !!document.querySelector('.node-table-line.pv-table-chart-figure svg') };
      });
      expect(result.table).toContain('data-feature-chart="1"');
      expect(result.hasChartFigure).toBe(true);
    });

    test('"Copy" on a table object copies the real table as HTML', async ({ page }) => {
      await page.goto('file://' + indexPath);
      await dismissOverlays(page);
      await seedNodeWithTables(page, ['<table data-feature-chart="1" data-chart-type="cards"><tr><th>Label</th><th>Value</th></tr><tr><td>A</td><td>10</td></tr></table>']);
      await stubClipboard(page);

      await rightClick(page, '.node-table-line');
      await page.locator('.sb-context-menu').getByText('Copy', { exact: true }).click();
      await page.waitForFunction(() => (window as any).__clipboardWrites.length > 0);

      const writes = await page.evaluate(() => (window as any).__clipboardWrites);
      expect(writes).toHaveLength(1);
      expect(writes[0]['text/html']).toContain('<table');
      expect(writes[0]['text/html']).toContain('data-feature-chart');
      expect(writes[0]['text/plain']).toContain('Label');
      expect(writes[0]['text/plain']).toContain('10');
    });

    test('"Delete" on a table object removes just that object, not the whole node', async ({ page }) => {
      await page.goto('file://' + indexPath);
      await dismissOverlays(page);
      await seedNodeWithTables(page, [tableNote.match(/<table.*<\/table>/)![0]]);

      await rightClick(page, '.node-table-line');
      await page.locator('.sb-context-menu').getByText('Delete', { exact: true }).click();

      const result = await page.evaluate(() => ({
        // @ts-expect-error
        tables: nodes.find((n: any) => n.id === 1).tables,
        hasTableLine: !!document.querySelector('.node-table-line'),
        nodeStillExists: document.querySelectorAll('.node-row').length,
      }));
      expect(result.tables).toHaveLength(0);
      expect(result.hasTableLine).toBe(false);
      expect(result.nodeStillExists).toBe(1);
    });

    test('"Add row below" and "Add column right" land the caret in the newly-created cell', async ({ page }) => {
      await page.goto('file://' + indexPath);
      await dismissOverlays(page);
      await seedNodeWithTables(page, [tableNote.match(/<table.*<\/table>/)![0]]);

      await page.locator('.node-table-line td').first().click();
      await page.locator('.node-table-line td').first().click({ button: 'right' });
      await page.locator('.sb-context-menu').getByText('Add row below', { exact: true }).click();

      const afterAddRow = await page.evaluate(() => {
        const rows = [...document.querySelectorAll('.node-table-line tbody tr')];
        const active = document.activeElement;
        return { activeTag: active?.tagName, activeIsInLastRow: rows[rows.length - 1].contains(active) };
      });
      expect(afterAddRow.activeTag).toBe('TD');
      expect(afterAddRow.activeIsInLastRow).toBe(true);

      await page.locator('.node-table-line tbody tr').nth(1).locator('td').last().click({ button: 'right' });
      await page.locator('.sb-context-menu').getByText('Add column right', { exact: true }).click();

      const afterAddColumn = await page.evaluate(() => {
        const active = document.activeElement as HTMLElement | null;
        const row = active?.closest('tr') || null;
        return { activeTag: active?.tagName, isLastCellInItsRow: row ? active === row.lastElementChild : false };
      });
      expect(afterAddColumn.activeTag).toBe('TD');
      expect(afterAddColumn.isLastCellInItsRow).toBe(true);
    });

    // The actual bug report this covers: "Delete row" on the row holding the currently-focused
    // cell (a real click already focused that cell before the menu ever opened) removed the row
    // from the DOM, which forces its own native, synchronous focus change -- firing
    // buildNodeTableObject's own onFocusOut (commit+exit) mid-handler, BEFORE this onClick's own
    // trailing commit() call ran. That second, now-stale commit() saw a liveTable already detached
    // by exit()'s showDisplay() and (without the idempotent-exit guard) would take the "the whole
    // table was removed" branch by mistake, wiping the real table out of node.tables entirely
    // instead of just the one row.
    test('"Delete row" does not wipe the whole table (regression)', async ({ page }) => {
      await page.goto('file://' + indexPath);
      await dismissOverlays(page);
      await seedNodeWithTables(page, ['<table><tr><th>Label</th><th>Value</th></tr><tr><td>A</td><td>10</td></tr><tr><td>B</td><td>20</td></tr></table>']);

      await page.locator('.node-table-line td').first().click();
      await page.locator('.node-table-line td').first().click({ button: 'right' });
      await page.locator('.sb-context-menu').getByText('Delete row', { exact: true }).click();

      const state = await page.evaluate(() => ({
        hasTableLine: !!document.querySelector('.node-table-line'),
        // @ts-expect-error
        table: nodes.find((n: any) => n.id === 1).tables[0],
      }));
      expect(state.hasTableLine).toBe(true);
      expect(state.table).toContain('<table');
      expect(state.table).toContain('B');
      expect(state.table).toContain('20');
      expect(state.table).not.toContain('>A<');
      // _attachTableResizeHandles' own col/row-resize handle <div>s are real children of the live
      // table, not a CSS overlay -- commit() must strip them (via cleanEditorHtml) or they'd get
      // baked straight into node.tables on every edit.
      expect(state.table).not.toContain('col-resize-handle');
      expect(state.table).not.toContain('row-resize-handle');
    });

    test('"Delete column" does not wipe the whole table (regression)', async ({ page }) => {
      await page.goto('file://' + indexPath);
      await dismissOverlays(page);
      await seedNodeWithTables(page, ['<table><tr><th>Label</th><th>Value</th><th>Owner</th></tr><tr><td>A</td><td>10</td><td>Sam</td></tr></table>']);

      await page.locator('.node-table-line td').first().click();
      await page.locator('.node-table-line td').first().click({ button: 'right' });
      await page.locator('.sb-context-menu').getByText('Delete column', { exact: true }).click();

      const state = await page.evaluate(() => ({
        hasTableLine: !!document.querySelector('.node-table-line'),
        // @ts-expect-error
        table: nodes.find((n: any) => n.id === 1).tables[0],
      }));
      expect(state.hasTableLine).toBe(true);
      expect(state.table).toContain('<table');
      expect(state.table).toContain('10');
      expect(state.table).toContain('Sam');
      expect(state.table).not.toContain('>A<');
    });

    test('Feature as chart flags the table and offers chart type picks, with the current type disabled', async ({ page }) => {
      await page.goto('file://' + indexPath);
      await dismissOverlays(page);
      await seedNodeWithTables(page, ['<table><tr><th>Label</th><th>Value1</th><th>Value2</th></tr><tr><td>A</td><td>10</td><td>5</td></tr><tr><td>B</td><td>20</td><td>8</td></tr></table>']);

      await page.locator('.node-table-line td').first().click();
      await page.locator('.node-table-line td').first().click({ button: 'right' });
      await page.locator('.sb-context-menu').getByText('Feature as chart', { exact: true }).click();

      const flagged = await page.evaluate(() => {
        // @ts-expect-error
        return /data-feature-chart="1"/.test(nodes.find((n: any) => n.id === 1).tables[0]);
      });
      expect(flagged).toBe(true);

      await page.locator('.node-table-line td').first().click({ button: 'right' });
      const menu = page.locator('.sb-context-menu');
      await expect(menu.getByText('Bar chart (current)', { exact: true })).toBeVisible();
      await expect(menu.getByText('Stacked bar chart', { exact: true })).toBeVisible();
      const currentItem = menu.locator('.sb-context-item.disabled', { hasText: 'Bar chart (current)' });
      await expect(currentItem).toBeVisible();
    });

    test('a single-data-column chart offers Pie/Doughnut/Cards, and picking Cards offers "Suggest icons with AI"', async ({ page }) => {
      await page.goto('file://' + indexPath);
      await dismissOverlays(page);
      await seedNodeWithTables(page, ['<table data-feature-chart="1"><tr><th>Label</th><th>Value</th></tr><tr><td>A</td><td>10</td></tr><tr><td>B</td><td>20</td></tr></table>']);

      await page.locator('.node-table-line').click();
      await page.locator('.node-table-line td').first().click({ button: 'right' });
      await page.locator('.sb-context-menu').getByText('Cards', { exact: true }).click();

      await page.locator('.node-table-line td').first().click({ button: 'right' });
      const menu = page.locator('.sb-context-menu');
      await expect(menu.getByText('Suggest icons with AI', { exact: true })).toBeVisible();
      const pieItem = menu.locator('.sb-context-item:not(.disabled)', { hasText: 'Pie chart' });
      await expect(pieItem).toBeVisible();
    });

    test('resize handles never leak into the persisted node.tables HTML', async ({ page }) => {
      await page.goto('file://' + indexPath);
      await dismissOverlays(page);
      await seedNodeWithTables(page, ['<table><tr><th>A</th><th>B</th></tr><tr><td>1</td><td>2</td></tr></table>']);

      await page.locator('.node-table-line td').first().click();
      await page.keyboard.type('x');
      await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());

      const table = await page.evaluate(() => {
        // @ts-expect-error
        return nodes.find((n: any) => n.id === 1).tables[0];
      });
      expect(table).not.toContain('col-resize-handle');
      expect(table).not.toContain('row-resize-handle');
    });

    test('an empty table cell is exactly as tall as a cell with real text in it, not a collapsed sliver', async ({ page }) => {
      await page.goto('file://' + indexPath);
      await dismissOverlays(page);
      await seedNodeWithTables(page, ['<table><tr><th>Label</th><th>Value</th></tr><tr><td>A</td><td></td></tr></table>']);

      const heights = await page.evaluate(() => {
        const cells = [...document.querySelectorAll('.node-table-line td')];
        return cells.map(c => c.getBoundingClientRect().height);
      });
      expect(heights[0]).toBeGreaterThan(0);
      expect(Math.abs(heights[0] - heights[1])).toBeLessThan(1);
    });

    test('column resize handles attach, and a row/column can be resized by dragging its handle', async ({ page }) => {
      await page.goto('file://' + indexPath);
      await dismissOverlays(page);
      await seedNodeWithTables(page, [tableNote.match(/<table.*<\/table>/)![0]]);

      await page.locator('.node-table-line td').first().click();
      const colHandle = page.locator('.node-table-line .col-resize-handle').first();
      await expect(colHandle).toHaveCount(1, { timeout: 2000 }).catch(() => {});
      const handleCount = await page.locator('.node-table-line .col-resize-handle').count();
      expect(handleCount).toBeGreaterThan(0);

      const rowHandle = page.locator('.node-table-line .row-resize-handle').first();
      const box = await rowHandle.boundingBox();
      expect(box).not.toBeNull();
      const startHeight = await page.evaluate(() => document.querySelector('.node-table-line tbody tr')!.getBoundingClientRect().height);
      await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
      await page.mouse.down();
      await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2 + 40, { steps: 5 });
      await page.mouse.up();
      const endHeight = await page.evaluate(() => document.querySelector('.node-table-line tbody tr')!.getBoundingClientRect().height);
      expect(endHeight).toBeGreaterThan(startHeight);
    });

    test('"Add table…" quick action adds a blank 2x2 table object to the node', async ({ page }) => {
      await page.goto('file://' + indexPath);
      await dismissOverlays(page);
      await seedNodeWithNote(page, '');

      const row = page.locator('.node-row[data-id="1"]');
      await row.click({ button: 'right' });
      const tableBtn = page.locator('#context-quickbar .pv-qm-btn[data-action="table"]');
      await expect(tableBtn).toBeVisible();
      await tableBtn.click();

      const result = await page.evaluate(() => {
        // @ts-expect-error
        const n = nodes.find((x: any) => x.id === 1);
        return { tablesLen: n.tables.length, hasTableLine: !!document.querySelector('.node-table-line') };
      });
      expect(result.tablesLen).toBe(1);
      expect(result.hasTableLine).toBe(true);
    });

    test('a node-table-dot appears on the row when the node has a table, and clicking it scrolls/flashes the table object into view', async ({ page }) => {
      await page.goto('file://' + indexPath);
      await dismissOverlays(page);
      await seedNodeWithTables(page, [tableNote.match(/<table.*<\/table>/)![0]]);

      const dot = page.locator('.node-row[data-id="1"] .node-table-dot');
      await expect(dot).toBeVisible();
      await dot.click();
      await expect(page.locator('.node-table-line.qa-flash')).toHaveCount(1);
    });

    // A copied Excel/Sheets table's plain-text clipboard representation is tab/newline-separated
    // text -- without the table-detection branch in the global paste handler, parseTextToTreeNodes
    // would treat that as outline content and shred it into one sibling node per row instead of
    // landing it as a real table object.
    test('pasting a table copied from outside (e.g. Excel) while a node is selected adds it as a node.tables object, not shredded into sibling nodes', async ({ page }) => {
      await page.goto('file://' + indexPath);
      await dismissOverlays(page);
      await seedNodeWithTables(page, []);
      await page.evaluate(() => {
        // @ts-expect-error
        selectedId = 1; editingId = null; multiSelectedIds = [];
      });

      await page.evaluate(() => {
        const html = '<table><tr><th>Label</th><th>Value</th></tr><tr><td>A</td><td>10</td></tr></table>';
        const clipboardData = { getData: (type: string) => (type === 'text/html' ? html : 'Label\tValue\nA\t10') };
        const ev = new Event('paste', { bubbles: true, cancelable: true });
        Object.defineProperty(ev, 'clipboardData', { value: clipboardData });
        document.dispatchEvent(ev);
      });

      const result = await page.evaluate(() => {
        // @ts-expect-error
        return { nodeCount: nodes.length, tablesLen: (nodes[0].tables || []).length, hasTableLine: !!document.querySelector('.node-table-line') };
      });
      expect(result.nodeCount).toBe(1);
      expect(result.tablesLen).toBe(1);
      expect(result.hasTableLine).toBe(true);
    });
  });

  test('Backspace on an empty note deletes it and returns focus to the node\'s own text', async ({ page }) => {
    await page.goto('file://' + indexPath);
    await dismissOverlays(page);
    await seedNodeWithNote(page, 'x');
    // Clear it live so the note-line itself is empty but still mounted and focused.
    await page.evaluate(() => { document.getElementById('note-line-1')!.innerHTML = ''; });
    await page.locator('#note-line-1').click();
    await page.keyboard.press('Backspace');
    await page.waitForTimeout(50);

    const result = await page.evaluate(() => ({
      // @ts-expect-error
      note: nodes.find((n: any) => n.id === 1).note,
      editingTheRow: document.querySelector('.node-row[data-id="1"] .node-input') !== null,
    }));
    expect(result.note).toBe('');
    expect(result.editingTheRow).toBe(true);
  });

  // The selection-formatting popover (Bold/Italic/Strikethrough/Link) was previously excluded
  // from notes on the assumption they were plain text with nothing to format -- now that they're
  // rich text again, selectionFmtEditorFor must resolve a note-line to itself (by id, same
  // per-instance pattern as remarks), and applying Bold must actually persist, which needs
  // syncNoteTextFromEditorIfApplicable wired into every selection-popover command path (the
  // AI-rewrite popover's execCommand('insertText') doesn't reliably fire a native input event,
  // so the note-line's own input listener can't be trusted as the only persistence path there).
  test('Bold from the selection-formatting popover wraps the selected text and persists to node.note', async ({ page }) => {
    await page.goto('file://' + indexPath);
    await dismissOverlays(page);
    await seedNodeWithNote(page, 'Hello world');

    await page.evaluate(() => {
      // Focus first -- focusing an unfocused contenteditable can itself reset/collapse a
      // selection set beforehand, so the order matters here.
      const el = document.getElementById('note-line-1')!;
      el.focus();
      const textNode = el.firstChild!;
      const rg = document.createRange();
      rg.setStart(textNode, 6); rg.setEnd(textNode, 11); // "world"
      const sel = window.getSelection()!; sel.removeAllRanges(); sel.addRange(rg);
      // @ts-expect-error -- exercises the same resolution path showSelectionFmtPopoverForRange uses
      window.__resolvedEditorId = selectionFmtEditorFor(sel.anchorNode);
      // @ts-expect-error
      showSelectionFmtPopoverForRange(rg, window.__resolvedEditorId);
    });
    const resolvedId = await page.evaluate(() => (window as any).__resolvedEditorId);
    expect(resolvedId).toBe('note-line-1');

    // A real click (not a synthetic dispatchEvent) -- execCommand's formatting commands require
    // actual user-activation context in some engines, which only a genuine, trusted input event
    // carries. The popover's own mousedown handler (not click) is what runs the command, and
    // preventDefault there is exactly what keeps the note's selection from being lost first.
    await page.locator('.selection-fmt-btn[data-cmd="bold"]').click();

    const note = await page.evaluate(() => {
      // @ts-expect-error
      return nodes.find((n: any) => n.id === 1).note;
    });
    expect(note).toMatch(/<(b|strong)>world<\/(b|strong)>/i);
  });

  // A charted table's rendered chart/Cards display (.pv-table-chart-figure) is disposable,
  // regenerated markup, not the real table data -- selecting its visible text and formatting it
  // would either no-op (tableCardsData reads plain textContent) or, worse, have the table object's
  // own input handler persist this throwaway rendering over the real data. The popover resolves
  // its target editor via selectionFmtEditorFor, which must refuse to match here even though the
  // figure sits nested inside .node-table-line (which carries .pv-diagram-figure, excluded the
  // same way a note-embedded one used to be). selectionFmtEditorFor is called directly against a
  // node reference here, rather than through a real window.getSelection()/addRange() -- setting a
  // Selection inside a contenteditable element that doesn't already have focus has Chromium focus
  // it as a side effect, which would synchronously swap the read-only chart/Cards figure for the
  // real table before the selection ever "lands". The function's own contract (take a node, walk
  // its ancestors) doesn't require a real Selection to exercise correctly.
  test('the selection-formatting popover does not activate inside a rendered chart/Cards figure, a table cell, or an image', async ({ page }) => {
    await page.goto('file://' + indexPath);
    await dismissOverlays(page);
    await page.evaluate(() => {
      // @ts-expect-error -- bare globals from index.html
      nodes = [{ id: 1, depth: 0, text: 'Parent', parentId: null, isCheckbox: false, checked: false, note: '', tables: ['<table data-feature-chart="1" data-chart-type="cards"><tr><th>Label</th><th>Value</th></tr><tr><td>A</td><td>10</td></tr></table>'], tags: [], styles: {} }];
      // @ts-expect-error
      collapsedIds = new Set(); selectedId = null; multiSelectedIds = []; selectAllMode = false; focusedId = null; undoStack = []; editingId = null; nextId = 2;
      // @ts-expect-error
      render();
    });

    const cardsLabelResult = await page.evaluate(() => {
      const label = document.querySelector('.node-table-line .pv-table-card-label')!;
      // @ts-expect-error -- bare global from index.html
      return selectionFmtEditorFor(label.firstChild);
    });
    expect(cardsLabelResult).toBeNull();

    // A real, currently-focused table cell -- not just the disposable read-only display -- since
    // its content is read back as plain text only (tableCardsData, a copied table's own
    // textContent), formatting is pointless there too. Clicking the Cards display itself (there's
    // no td/th visible in Cards' own card-grid markup to click directly) enters edit mode and
    // swaps in the real table underneath.
    await page.locator('.node-table-line').click();
    const tableCellResult = await page.evaluate(() => {
      const cell = document.querySelector('.node-table-line td')!;
      // @ts-expect-error
      return selectionFmtEditorFor(cell.firstChild || cell);
    });
    expect(tableCellResult).toBeNull();
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());

    await seedNodeWithNote(page, '<p><img src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBTAA7" alt="pic"></p>');
    const imageResult = await page.evaluate(() => {
      const img = document.querySelector('#note-line-1 img')!;
      // @ts-expect-error
      return selectionFmtEditorFor(img);
    });
    expect(imageResult).toBeNull();

    // Plain prose text in the SAME note still resolves normally -- this exclusion is scoped to
    // tables/images, not the whole note-line.
    await seedNodeWithNote(page, 'Hello world');
    const textResult = await page.evaluate(() => {
      const el = document.getElementById('note-line-1')!;
      // @ts-expect-error
      return selectionFmtEditorFor(el.firstChild);
    });
    expect(textResult).toBe('note-line-1');
  });

  // Pasted images had no way to resize at all. _setupImageResize/_imgResizeSelect/_imgResizePersist
  // already back Pad's own images (click to select, drag the corner handle, double-click to
  // reset) -- wired into the note-line's own click/dblclick instead of through that function
  // directly, since it looks its editor up by a fixed id and each note-line is a fresh element
  // with a new per-node id every render().
  test('a pasted image can be selected and resized, persisting the new width to node.note', async ({ page }) => {
    await page.goto('file://' + indexPath);
    await dismissOverlays(page);
    await seedNodeWithNote(page, '<img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=">');

    // A standalone picture shows as its own read-only figure while the note is unfocused -- a
    // plain click there is intentionally a no-op now, so "Edit note" first swaps the real <img>
    // back into noteLine directly (matching how a real user would get to resizing it).
    await editNote(page);
    const img = page.locator('#note-line-1 img');
    await img.click();
    await expect(img).toHaveClass(/editor-img-selected/);

    const handle = page.locator('#img-resize-handle');
    await expect(handle).toBeVisible();
    const box = (await img.boundingBox())!;
    await page.mouse.move(box.x + box.width, box.y + box.height);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width + 60, box.y + box.height, { steps: 5 });
    await page.mouse.up();

    const result = await page.evaluate(() => {
      // @ts-expect-error
      const note = nodes.find((n: any) => n.id === 1).note;
      const div = document.createElement('div'); div.innerHTML = note;
      return { styledWidth: div.querySelector('img')?.style.width, stillSelectedInSaved: /editor-img-selected/.test(note) };
    });
    expect(result.styledWidth).toMatch(/^\d+px$/);
    expect(parseInt(result.styledWidth!, 10)).toBeGreaterThan(1);
    expect(result.stillSelectedInSaved).toBe(false); // the transient selection class must never be persisted
  });

  // Was a bare stroked squiggle+dot with no outer circle, unlike every sibling dot icon (note's
  // page shape, remark's person, diagram's rects) which fills a good portion of its 24x24 box --
  // see qaDotIconSvg's own comment. Confirms it now matches the correct version already used by
  // the right-click menu's "Add question…" entry (CTX_ACTION_META.qa).
  test('the Q&A inline dot icon has an outer circle, matching the right-click menu\'s own question icon', async ({ page }) => {
    await page.goto('file://' + indexPath);
    await dismissOverlays(page);

    const result = await page.evaluate(() => {
      // @ts-expect-error
      const dotSvg = qaDotIconSvg(11);
      // @ts-expect-error
      const menuSvg = CTX_ACTION_META.qa.svg;
      return { dotHasCircle: dotSvg.includes('<circle'), menuHasCircle: menuSvg.includes('<circle') };
    });
    expect(result.dotHasCircle).toBe(true);
    expect(result.menuHasCircle).toBe(true);
  });

  // The note-line div is permanently contenteditable, even while just displaying and unfocused
  // (see noteLine.contentEditable='true' at its creation) -- browsers only follow a link clicked
  // inside a contenteditable region on a modifier-click, treating a plain click as "place the
  // caret here" instead, so a real <a href> in a note's rich text was simply unclickable. The
  // very first click into a not-yet-focused note landing on a link is almost always "open this,"
  // not "start editing inside it," so that specific case now opens the link directly.
  test.describe('A link inside an inline note opens on the first click, before the note is focused', () => {
    const linkNote = '<p>Check out <a href="https://example.com" target="_blank" rel="noopener noreferrer">this link</a> please.</p>';

    async function stubWindowOpen(page: import('@playwright/test').Page) {
      await page.evaluate(() => {
        // @ts-expect-error
        window._openCalls = [];
        // @ts-expect-error
        window.open = (...args) => { window._openCalls.push(args); return null; };
      });
    }

    test('a plain click on the link opens it, instead of just placing the caret', async ({ page }) => {
      await page.goto('file://' + indexPath);
      await dismissOverlays(page);
      await stubWindowOpen(page);
      await seedNodeWithNote(page, linkNote);

      await page.locator('#note-line-1 a').click();

      const result = await page.evaluate(() => ({
        // @ts-expect-error
        openCalls: window._openCalls,
        noteIsFocused: document.activeElement?.id === 'note-line-1',
      }));
      expect(result.openCalls).toHaveLength(1);
      expect(result.openCalls[0][0]).toBe('https://example.com/');
      // Focusing the note as a side effect of the click is fine/expected -- the point is the link
      // also actually opened, not that focus is somehow suppressed.
      expect(result.noteIsFocused).toBe(true);
    });

    test('a second click on the link, once the note is already focused, edits normally and does not reopen it', async ({ page }) => {
      await page.goto('file://' + indexPath);
      await dismissOverlays(page);
      await stubWindowOpen(page);
      await seedNodeWithNote(page, linkNote);

      await page.locator('#note-line-1 a').click();
      await page.locator('#note-line-1 a').click();

      const openCallCount = await page.evaluate(() =>
        // @ts-expect-error
        window._openCalls.length
      );
      expect(openCallCount).toBe(1);
    });

    test('ctrl/cmd-click is left to the browser\'s own default link handling, not intercepted', async ({ page }) => {
      await page.goto('file://' + indexPath);
      await dismissOverlays(page);
      await stubWindowOpen(page);
      await seedNodeWithNote(page, linkNote);

      await page.locator('#note-line-1 a').click({ modifiers: ['Control'] });

      // Our own window.open override is never called for a modifier-click -- that path is left
      // alone so the browser's real ctrl/cmd-click-opens-link behavior still applies.
      const openCallCount = await page.evaluate(() =>
        // @ts-expect-error
        window._openCalls.length
      );
      expect(openCallCount).toBe(0);
    });
  });
});
