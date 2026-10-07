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

  test.describe('Table context menu (right-click inside a pasted table)', () => {
    const tableNote = '<table><tr><th>Label</th><th>Value</th></tr><tr><td>A</td><td>10</td></tr></table>';

    test('Add row below inserts a new row with the same column count', async ({ page }) => {
      await page.goto('file://' + indexPath);
      await dismissOverlays(page);
      await seedNodeWithNote(page, tableNote);

      const cell = page.locator('#note-line-1 td').first();
      await cell.click({ button: 'right' });
      await page.locator('.sb-context-menu').getByText('Add row below', { exact: true }).click();

      const rowCount = await page.evaluate(() => document.querySelectorAll('#note-line-1 table tr').length);
      expect(rowCount).toBe(3); // header + original row + new row
    });

    test('Add column right inserts a new cell in every row', async ({ page }) => {
      await page.goto('file://' + indexPath);
      await dismissOverlays(page);
      await seedNodeWithNote(page, tableNote);

      const cell = page.locator('#note-line-1 td').first();
      await cell.click({ button: 'right' });
      await page.locator('.sb-context-menu').getByText('Add column right', { exact: true }).click();

      const colCounts = await page.evaluate(() =>
        [...document.querySelectorAll('#note-line-1 table tr')].map(r => r.children.length)
      );
      expect(colCounts).toEqual([3, 3]);
    });

    test('Delete row removes the clicked row but keeps the table', async ({ page }) => {
      await page.goto('file://' + indexPath);
      await dismissOverlays(page);
      await seedNodeWithNote(page, '<table><tr><th>Label</th><th>Value</th></tr><tr><td>A</td><td>10</td></tr><tr><td>B</td><td>20</td></tr></table>');

      const cell = page.locator('#note-line-1 td').first();
      await cell.click({ button: 'right' });
      await page.locator('.sb-context-menu').getByText('Delete row', { exact: true }).click();

      const rowCount = await page.evaluate(() => document.querySelectorAll('#note-line-1 table tr').length);
      expect(rowCount).toBe(2); // header + the one remaining row
    });

    // Delete row used to only count rows inside <tbody> -- a header row in a REAL <thead> (as
    // "Insert table" always produces, and as "Toggle header row" moves a row into) resolves
    // row.closest('tbody') to null, so the deletion silently never ran at all, no matter how many
    // rows the table actually had. A plain pasted table with no explicit thead/tbody tags doesn't
    // reproduce this -- the HTML parser auto-wraps every bare <tr> (header-looking <th> row
    // included) into one shared implicit <tbody>, which already has a real tbody ancestor. Only a
    // genuine <thead> hits the bug, so this table spells it out explicitly. table.rows (thead+
    // tbody together) fixes it.
    test('Delete row also works on a real header row (inside <thead>), not just body rows', async ({ page }) => {
      await page.goto('file://' + indexPath);
      await dismissOverlays(page);
      await seedNodeWithNote(page, '<table><thead><tr><th>Label</th><th>Value</th></tr></thead><tbody><tr><td>A</td><td>10</td></tr></tbody></table>');

      const headerCell = page.locator('#note-line-1 th').first();
      await headerCell.click({ button: 'right' });
      await page.locator('.sb-context-menu').getByText('Delete row', { exact: true }).click();

      const result = await page.evaluate(() => {
        const table = document.querySelector('#note-line-1 table')!;
        return { rowCount: table.querySelectorAll('tr').length, hasHeaderCell: !!table.querySelector('th') };
      });
      expect(result.rowCount).toBe(1);
      expect(result.hasHeaderCell).toBe(false);
    });

    test('Delete column removes that column from every row', async ({ page }) => {
      await page.goto('file://' + indexPath);
      await dismissOverlays(page);
      await seedNodeWithNote(page, tableNote);

      const cell = page.locator('#note-line-1 td').first();
      await cell.click({ button: 'right' });
      await page.locator('.sb-context-menu').getByText('Delete column', { exact: true }).click();

      const colCounts = await page.evaluate(() =>
        [...document.querySelectorAll('#note-line-1 table tr')].map(r => r.children.length)
      );
      expect(colCounts).toEqual([1, 1]);
    });

    test('Delete table removes the whole table from the note', async ({ page }) => {
      await page.goto('file://' + indexPath);
      await dismissOverlays(page);
      await seedNodeWithNote(page, tableNote);

      const cell = page.locator('#note-line-1 td').first();
      await cell.click({ button: 'right' });
      await page.locator('.sb-context-menu').getByText('Delete table', { exact: true }).click();

      const hasTable = await page.evaluate(() => !!document.querySelector('#note-line-1 table'));
      expect(hasTable).toBe(false);
    });

    test('Feature as chart flags the table, and its label flips to "Remove chart feature"', async ({ page }) => {
      await page.goto('file://' + indexPath);
      await dismissOverlays(page);
      // A 2-column table with numeric data in the second column is chartable (tableChartability).
      await seedNodeWithNote(page, '<table><tr><th>Label</th><th>Value</th></tr><tr><td>A</td><td>10</td></tr><tr><td>B</td><td>20</td></tr></table>');

      const cell = page.locator('#note-line-1 td').first();
      await cell.click({ button: 'right' });
      await page.locator('.sb-context-menu').getByText('Feature as chart', { exact: true }).click();

      const flagged = await page.evaluate(() => document.querySelector('#note-line-1 table')?.getAttribute('data-feature-chart'));
      expect(flagged).toBe('1');

      await page.locator('#note-line-1 td').first().click({ button: 'right' });
      await expect(page.locator('.sb-context-menu').getByText('Remove chart feature', { exact: true })).toBeVisible();
    });

    // Once a table is charted, the right-click menu picks up the same per-type options (Bar,
    // Stacked bar, Line, Pie, Doughnut, Cards) the Pad's own table menu and the chart's own
    // right-click menu in Preview/Presenter already offer -- so the type can be set without
    // leaving the note to go find the chart in Preview first (see tableChartTypeAvailability).
    test('once charted, the menu offers every chart type, with the current one disabled', async ({ page }) => {
      await page.goto('file://' + indexPath);
      await dismissOverlays(page);
      // Two DATA columns (Label + Value1 + Value2 -- seriesCount 2) so Pie/Doughnut/Cards, which
      // only make sense for a single data column, show up disabled rather than being hidden.
      await seedNodeWithNote(page, '<table data-feature-chart="1"><tr><th>Label</th><th>Value1</th><th>Value2</th></tr><tr><td>A</td><td>10</td><td>5</td></tr><tr><td>B</td><td>20</td><td>8</td></tr></table>');

      // A charted table renders as its chart SVG while unfocused -- clicking into the note first
      // (same as a real user would) swaps it back to the real, editable table underneath.
      await page.locator('#note-line-1').click();
      await page.locator('#note-line-1 td').first().click({ button: 'right' });
      const menu = page.locator('.sb-context-menu');
      await expect(menu.getByText('Bar chart (current)', { exact: true })).toBeVisible();
      await expect(menu.getByText('Stacked bar chart', { exact: true })).toBeVisible();
      await expect(menu.getByText('Line chart', { exact: true })).toBeVisible();
      const pieItem = menu.locator('.sb-context-item.disabled', { hasText: 'Pie chart' });
      await expect(pieItem).toBeVisible();

      const currentItem = menu.locator('.sb-context-item.disabled', { hasText: 'Bar chart (current)' });
      await expect(currentItem).toBeVisible();
      // Stacked bar is enabled here (2+ data columns) -- unlike the single-data-column case.
      const stackedItem = menu.locator('.sb-context-item:not(.disabled)', { hasText: 'Stacked bar chart' });
      await expect(stackedItem).toBeVisible();
    });

    test('picking a chart type persists it to the table\'s data-chart-type attribute', async ({ page }) => {
      await page.goto('file://' + indexPath);
      await dismissOverlays(page);
      await seedNodeWithNote(page, '<table data-feature-chart="1"><tr><th>Label</th><th>Value</th></tr><tr><td>A</td><td>10</td></tr><tr><td>B</td><td>20</td></tr></table>');

      await page.locator('#note-line-1').click();
      await page.locator('#note-line-1 td').first().click({ button: 'right' });
      await page.locator('.sb-context-menu').getByText('Line chart', { exact: true }).click();

      const result = await page.evaluate(() => {
        const table = document.querySelector('#note-line-1 table')!;
        // @ts-expect-error
        return { liveType: table.getAttribute('data-chart-type'), noteType: /data-chart-type="(\w+)"/.exec(nodes.find((n: any) => n.id === 1).note)?.[1] };
      });
      expect(result.liveType).toBe('line');
      expect(result.noteType).toBe('line');
    });

    test('a single-data-column chart offers Pie/Doughnut/Cards enabled, and picking Cards offers "Suggest icons with AI"', async ({ page }) => {
      await page.goto('file://' + indexPath);
      await dismissOverlays(page);
      await seedNodeWithNote(page, '<table data-feature-chart="1"><tr><th>Label</th><th>Value</th></tr><tr><td>A</td><td>10</td></tr><tr><td>B</td><td>20</td></tr></table>');

      await page.locator('#note-line-1').click();
      await page.locator('#note-line-1 td').first().click({ button: 'right' });
      await page.locator('.sb-context-menu').getByText('Cards', { exact: true }).click();

      await page.locator('#note-line-1 td').first().click({ button: 'right' });
      const menu = page.locator('.sb-context-menu');
      await expect(menu.getByText('Suggest icons with AI', { exact: true })).toBeVisible();
      const pieItem = menu.locator('.sb-context-item:not(.disabled)', { hasText: 'Pie chart' });
      await expect(pieItem).toBeVisible();
    });

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
  });

  test('Tab from the last cell adds a new row and moves the caret into it', async ({ page }) => {
    await page.goto('file://' + indexPath);
    await dismissOverlays(page);
    await seedNodeWithNote(page, '<table><tr><td>A</td><td>B</td></tr></table>');

    await page.evaluate(() => {
      // Focus first, then set the selection -- focusing an unfocused contenteditable can itself
      // reset/collapse a selection set beforehand, so the order matters here.
      document.getElementById('note-line-1')!.focus();
      const lastCell = document.querySelector('#note-line-1 td:last-child')!;
      const rg = document.createRange(); rg.selectNodeContents(lastCell); rg.collapse(true);
      const sel = window.getSelection()!; sel.removeAllRanges(); sel.addRange(rg);
    });
    await page.keyboard.press('Tab');

    const rowCount = await page.evaluate(() => document.querySelectorAll('#note-line-1 table tr').length);
    expect(rowCount).toBe(2);
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

  // renderNoteDisplayHtml swaps a chart-featured table for its rendered chart SVG while the note
  // isn't focused, and the focus handler restores the real editable table -- node.note itself
  // always keeps the real <table> markup either way (see the focus handler setting innerHTML
  // straight from node.note, not from the displayed chart).
  test('a chart-featured table shows as a chart when unfocused, and as a real editable table when focused', async ({ page }) => {
    await page.goto('file://' + indexPath);
    await dismissOverlays(page);
    await seedNodeWithNote(page, '<table data-feature-chart="1"><tr><th>Label</th><th>Value</th></tr><tr><td>A</td><td>10</td></tr><tr><td>B</td><td>20</td></tr></table>');

    const unfocused = await page.evaluate(() => {
      const el = document.getElementById('note-line-1')!;
      return { hasChart: !!el.querySelector('.pv-table-chart-figure'), hasTable: !!el.querySelector('table') };
    });
    expect(unfocused.hasChart).toBe(true);
    expect(unfocused.hasTable).toBe(false);

    await page.locator('#note-line-1').click();
    const focused = await page.evaluate(() => {
      const el = document.getElementById('note-line-1')!;
      return { hasChart: !!el.querySelector('.pv-table-chart-figure'), hasTable: !!el.querySelector('table[data-feature-chart="1"]') };
    });
    expect(focused.hasChart).toBe(false);
    expect(focused.hasTable).toBe(true);

    await page.locator('#note-line-1').blur();
    const reblurred = await page.evaluate(() => {
      const el = document.getElementById('note-line-1')!;
      return { hasChart: !!el.querySelector('.pv-table-chart-figure') };
    });
    expect(reblurred.hasChart).toBe(true);
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

  // The note's own right-click menu had no way to add a table at all -- only a paste could put
  // one there. "Insert table" builds the exact same 2x2-to-start shape (real <thead><th> header,
  // contentEditable cells) as Pad's own "Insert table" toolbar button, at the caret position the
  // right-click itself landed on.
  test('"Insert table" from the note\'s own right-click menu adds an editable 2x2 table at the caret', async ({ page }) => {
    await page.goto('file://' + indexPath);
    await dismissOverlays(page);
    await seedNodeWithNote(page, 'Before text', true);

    await page.evaluate(() => {
      const el = document.getElementById('note-line-1')!;
      const textNode = el.firstChild!;
      const rg = document.createRange(); rg.setStart(textNode, textNode.textContent!.length); rg.collapse(true);
      const sel = window.getSelection()!; sel.removeAllRanges(); sel.addRange(rg);
    });
    await page.locator('#note-line-1').click({ button: 'right' });
    await page.locator('.sb-context-menu').getByText('Insert table', { exact: true }).click();

    const result = await page.evaluate(() => {
      const el = document.getElementById('note-line-1')!;
      const table = el.querySelector('table');
      return {
        hasThead: !!table?.querySelector('thead th'),
        rowCount: table?.querySelectorAll('tr').length,
        cellsEditable: table ? [...table.querySelectorAll('td,th')].every(c => c.getAttribute('contenteditable') === 'true') : false,
        // @ts-expect-error
        noteHasTable: /<table/i.test(nodes.find((n: any) => n.id === 1).note || ''),
      };
    });
    expect(result.hasThead).toBe(true);
    expect(result.rowCount).toBe(3); // header + 2 body rows
    expect(result.cellsEditable).toBe(true);
    expect(result.noteHasTable).toBe(true);
  });

  // _attachTableResizeHandles only ever looked inside <thead> for header cells to attach a handle
  // to -- a pasted table (unlike one built via Pad's or the note's own "Insert table") commonly
  // has no <thead> wrapper at all, leaving it with zero resize handles. Falls back to the first
  // row's own cells (th or td alike) when there's no thead.
  test('column resize handles attach even to a pasted table with no <thead>', async ({ page }) => {
    await page.goto('file://' + indexPath);
    await dismissOverlays(page);
    // A plain table with no <thead> -- exactly what a simple paste commonly produces.
    await seedNodeWithNote(page, '<table><tr><td>A</td><td>B</td></tr><tr><td>1</td><td>2</td></tr></table>');

    const handleCount = await page.evaluate(() => {
      const table = document.querySelector('#note-line-1 table')!;
      // @ts-expect-error
      _attachTableResizeHandles(table);
      return table.querySelectorAll('.col-resize-handle').length;
    });
    expect(handleCount).toBe(2);
  });

  // The resize handle itself had no CSS anywhere -- a bare, unstyled <div> renders at its default
  // content-based size (0x0, since it has no content), making the real drag logic behind it
  // functionally invisible and ungrabbable. This isn't a note-only fix (the same handles back
  // Pad's own tables), just exercised here since a note's table is the easiest to set up.
  test('the column resize handle actually has a visible, grabbable size', async ({ page }) => {
    await page.goto('file://' + indexPath);
    await dismissOverlays(page);
    await seedNodeWithNote(page, '<table><tr><th>A</th><th>B</th></tr><tr><td>1</td><td>2</td></tr></table>');

    const rect = await page.evaluate(() => {
      const handle = document.querySelector('#note-line-1 .col-resize-handle')!;
      const r = handle.getBoundingClientRect();
      return { width: r.width, height: r.height };
    });
    expect(rect.width).toBeGreaterThan(0);
    expect(rect.height).toBeGreaterThan(0);
  });

  // Only a table's column WIDTH was ever adjustable -- row height had no equivalent at all.
  // Same drag pattern as the column handles, just along each row's bottom edge, setting an
  // explicit height on the <tr> instead of a <col>.
  test('a table row can be resized taller by dragging its row-resize handle', async ({ page }) => {
    await page.goto('file://' + indexPath);
    await dismissOverlays(page);
    await seedNodeWithNote(page, '<table><tr><th>A</th><th>B</th></tr><tr><td>1</td><td>2</td></tr></table>');

    const handle = page.locator('#note-line-1 .row-resize-handle').first();
    const handleRect = await handle.boundingBox();
    expect(handleRect).not.toBeNull();
    expect(handleRect!.width).toBeGreaterThan(0);
    expect(handleRect!.height).toBeGreaterThan(0);

    const rowBefore = await page.evaluate(() => document.querySelector('#note-line-1 tr')!.getBoundingClientRect().height);
    await page.mouse.move(handleRect!.x + handleRect!.width / 2, handleRect!.y + handleRect!.height / 2);
    await page.mouse.down();
    await page.mouse.move(handleRect!.x + handleRect!.width / 2, handleRect!.y + 60, { steps: 5 });
    await page.mouse.up();

    const result = await page.evaluate(() => {
      const row = document.querySelector('#note-line-1 tr') as HTMLElement;
      return { height: row.getBoundingClientRect().height, styleHeight: row.style.height };
    });
    expect(result.styleHeight).toMatch(/^\d+px$/);
    expect(result.height).toBeGreaterThan(rowBefore + 30);
  });

  // The column handle had the same bug the row handle just had (see above): a negative CSS offset
  // (right:-3px) spilled it 3px into the next column's own cell, so under border-collapse a real
  // click there hit the neighboring <th> instead of the handle, silently doing nothing -- the only
  // existing coverage checked the handle's bounding-box size, never an actual drag. Fixed by
  // keeping the handle fully inside its own cell's box (right:0), mirroring bottom:-3px -> bottom:0.
  test('a table column can be resized wider by dragging its col-resize handle', async ({ page }) => {
    await page.goto('file://' + indexPath);
    await dismissOverlays(page);
    await seedNodeWithNote(page, '<table><tr><th>A</th><th>B</th></tr><tr><td>1</td><td>2</td></tr></table>');

    const handle = page.locator('#note-line-1 .col-resize-handle').first();
    const handleRect = await handle.boundingBox();
    expect(handleRect).not.toBeNull();

    const widthBefore = await page.evaluate(() => document.querySelector('#note-line-1 th')!.getBoundingClientRect().width);
    await page.mouse.move(handleRect!.x + handleRect!.width / 2, handleRect!.y + handleRect!.height / 2);
    await page.mouse.down();
    await page.mouse.move(handleRect!.x + 60, handleRect!.y + handleRect!.height / 2, { steps: 5 });
    await page.mouse.up();

    const result = await page.evaluate(() => {
      const th = document.querySelector('#note-line-1 th') as HTMLElement;
      const col = document.querySelector('#note-line-1 col') as HTMLElement;
      return { width: th.getBoundingClientRect().width, colStyleWidth: col?.style.width };
    });
    expect(result.colStyleWidth).toMatch(/^\d+px$/);
    expect(result.width).toBeGreaterThan(widthBefore + 30);
  });

  // Column/row resize handles are real appended <div>s inside each cell, not a CSS-only overlay --
  // left unstripped, they'd get saved as empty, non-editable elements baked into node.note itself
  // (re-exported to Word/PPTX/Preview, and sitting in the way of the caret next time this exact
  // HTML loads without going through _attachTableResizeHandles' own cleanup first). Every path
  // that persists a note-line's HTML (typing, blur, the selection-formatting popover, image
  // resize) must strip them via cleanEditorHtml first.
  test('resize handles never leak into the persisted node.note HTML', async ({ page }) => {
    await page.goto('file://' + indexPath);
    await dismissOverlays(page);
    await seedNodeWithNote(page, '<table><tr><th>A</th><th>B</th></tr><tr><td>1</td><td>2</td></tr></table>');

    // Typing (the 'input' listener's own persistence path) is enough to attach handles (via the
    // initial render) and exercise the save path that used to skip cleanEditorHtml entirely.
    await page.locator('#note-line-1 td').first().click();
    await page.keyboard.type('x');

    const note = await page.evaluate(() => {
      // @ts-expect-error
      return nodes.find((n: any) => n.id === 1).note;
    });
    expect(note).not.toContain('col-resize-handle');
    expect(note).not.toContain('row-resize-handle');
  });

  // An empty cell (a freshly inserted row/column, or a table pasted with blank cells) had no
  // min-height at all -- with no text to establish a line box, it could render far shorter than a
  // cell that actually has content, reading as a squashed sliver of a row. min-height turned out
  // not to fix this on its own (Chromium ignores min-height on a cell with no line box, which
  // includes a cell holding only the row-resize-handle's own absolutely-positioned div -- see
  // the CSS comment above .node-note-line table td's own rule); height+box-sizing:border-box does.
  test('an empty table cell is exactly as tall as a cell with real text in it, not a collapsed sliver', async ({ page }) => {
    await page.goto('file://' + indexPath);
    await dismissOverlays(page);
    await seedNodeWithNote(page, '<table><tr><th>A</th><th>B</th></tr><tr><td></td><td>populated</td></tr></table>');

    const result = await page.evaluate(() => {
      const cells = [...document.querySelectorAll('#note-line-1 td')];
      return cells.map(c => c.getBoundingClientRect().height);
    });
    const [emptyHeight, populatedHeight] = result;
    expect(emptyHeight).toBeGreaterThan(20);
    expect(emptyHeight).toBe(populatedHeight);
  });

  // The actual bug report this came from: right-clicking a table and choosing "Add row below"
  // inserted a new, genuinely empty row -- exactly the collapsed-sliver case the test above
  // covers, just reached through the real menu action instead of a hand-written empty <td>.
  test('a row inserted via "Add row below" renders at the same height as the existing rows, not collapsed', async ({ page }) => {
    await page.goto('file://' + indexPath);
    await dismissOverlays(page);
    await seedNodeWithNote(page, '<table><thead><tr><th>Label</th><th>Value</th></tr></thead><tbody><tr><td>A</td><td>10</td></tr></tbody></table>');

    const existingRowHeight = await page.evaluate(() => document.querySelector('#note-line-1 tbody tr')!.getBoundingClientRect().height);

    const cell = page.locator('#note-line-1 td').first();
    await cell.click({ button: 'right' });
    await page.locator('.sb-context-menu').getByText('Add row below', { exact: true }).click();

    const rowHeights = await page.evaluate(() => [...document.querySelectorAll('#note-line-1 tbody tr')].map(tr => tr.getBoundingClientRect().height));
    expect(rowHeights).toHaveLength(2);
    expect(rowHeights[1]).toBe(existingRowHeight);
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
