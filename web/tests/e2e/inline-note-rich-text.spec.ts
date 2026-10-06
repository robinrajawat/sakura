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
});
