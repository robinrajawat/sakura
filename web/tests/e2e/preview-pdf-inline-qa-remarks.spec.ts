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

// Mirrors what exportPdfDirect/exportPptx actually do: force-open the note/Q&A export state,
// then re-render the Preview body from it -- the same mechanism a real "Export as PDF" click
// goes through, without needing to drive window.print().
function applyExportStateAndRender(page: import('@playwright/test').Page) {
  return page.evaluate(() => {
    // @ts-expect-error -- bare globals from index.html
    _applyNodeContentExportState();
    // @ts-expect-error
    previewActive = true;
    // @ts-expect-error
    renderPreviewBody();
    document.getElementById('preview-overlay')?.classList.add('open');
  });
}

function seedDoc(page: import('@playwright/test').Page, opts: { qaItems?: any[]; remarks?: any[]; note?: string }) {
  return page.evaluate((opts) => {
    // @ts-expect-error
    nodes = [
      { id: 1, depth: 0, text: 'Parent row', parentId: null, isCheckbox: false, checked: false, note: '', noteTitle: '', tags: [], styles: {} },
      { id: 2, depth: 1, text: 'A row with linked content', parentId: 1, isCheckbox: false, checked: false, note: opts.note || '', noteTitle: '', tags: [], styles: {} },
    ];
    // @ts-expect-error
    collapsedIds = new Set();
    // @ts-expect-error
    selectedId = null; multiSelectedIds = []; selectAllMode = false; focusedId = null; undoStack = []; editingId = null;
    // @ts-expect-error
    qaItems = opts.qaItems || [];
    // @ts-expect-error
    remarks = opts.remarks || [];
  }, opts);
}

// Q&A linked to a node used to only ever appear in one flat "Q&A" list at the very end of the
// document, disconnected from the node it was actually about -- the per-node inline Q&A card
// already existed in the renderer but was gated behind previewOpenQaIds, an ephemeral on-screen
// toggle that PDF/PPTX export never force-populated (unlike notes, via previewOpenNoteIds).
// _applyNodeContentExportState now does the same force-open for Q&A that it already did for notes.
test.describe('Linked Q&A prints inline under its node in PDF/PPTX export, not just in a disconnected trailing list', () => {
  test('a question linked to a node renders as its own inline card under that node', async ({ page }) => {
    await page.goto('file://' + indexPath);
    await dismissOverlays(page);
    await seedDoc(page, { qaItems: [{ id: 'q1', question: 'Why this approach?', answer: 'Because it scales.', sourceNodeId: 2 }] });
    await applyExportStateAndRender(page);

    const result = await page.evaluate(() => {
      const body = document.getElementById('preview-body')!;
      const card = body.querySelector('.pv-inline-qa-body');
      return {
        hasInlineCard: !!card,
        questionText: body.querySelector('.pv-inline-qa-question')?.textContent,
        answerText: body.querySelector('.pv-inline-qa-answer')?.textContent,
        labelHasQaColorClass: !!body.querySelector('.pv-inline-label-qa'),
      };
    });
    expect(result.hasInlineCard).toBe(true);
    expect(result.questionText).toBe('Why this approach?');
    expect(result.answerText).toBe('Because it scales.');
    expect(result.labelHasQaColorClass).toBe(true);
  });

  test('a question rendered inline is NOT duplicated into the trailing Q&A section', async ({ page }) => {
    await page.goto('file://' + indexPath);
    await dismissOverlays(page);
    await seedDoc(page, { qaItems: [{ id: 'q1', question: 'Why this approach?', answer: 'Because it scales.', sourceNodeId: 2 }] });
    await applyExportStateAndRender(page);

    // The only question that exists was rendered inline under node 2 -- nothing is left over for
    // the trailing section, so it shouldn't exist at all.
    await expect(page.locator('#pv-qa-section')).toHaveCount(0);
  });

  test('a question with no linked node still falls back to the trailing Q&A section', async ({ page }) => {
    await page.goto('file://' + indexPath);
    await dismissOverlays(page);
    await seedDoc(page, {
      qaItems: [
        { id: 'q1', question: 'Linked question', answer: 'Linked answer', sourceNodeId: 2 },
        { id: 'q2', question: 'Orphan question', answer: '', sourceNodeId: null },
      ],
    });
    await applyExportStateAndRender(page);

    const result = await page.evaluate(() => {
      const section = document.getElementById('pv-qa-section');
      return {
        sectionExists: !!section,
        sectionText: section?.textContent || '',
        inlineCardCount: document.querySelectorAll('#preview-body .pv-inline-qa-body').length,
      };
    });
    expect(result.sectionExists).toBe(true);
    expect(result.sectionText).toContain('Orphan question');
    expect(result.sectionText).not.toContain('Linked question');
    expect(result.inlineCardCount).toBe(1);
  });

  test('turning off "Include Q&A in exports" hides both the inline card and the trailing section', async ({ page }) => {
    await page.goto('file://' + indexPath);
    await dismissOverlays(page);
    await seedDoc(page, { qaItems: [{ id: 'q1', question: 'Why this approach?', answer: '', sourceNodeId: 2 }] });
    await page.evaluate(() => {
      // @ts-expect-error
      qaExportEnabled = false;
    });
    await applyExportStateAndRender(page);

    await expect(page.locator('#preview-body .pv-inline-qa-body')).toHaveCount(0);
    await expect(page.locator('#pv-qa-section')).toHaveCount(0);
  });
});

// Remarks previously rendered as plain italic text with a "— Name · date" line and no box at all,
// visually inconsistent with the boxed note/Q&A cards right next to it, and dropped the colored
// author avatar the rest of the app already uses for remarks (REMARK_AVATAR_PALETTE).
test.describe('Remarks render as the same kind of boxed inline card as notes/Q&A, with the author avatar', () => {
  test('a remark anchored to a node renders inside the shared .pv-inline-block card shell', async ({ page }) => {
    await page.goto('file://' + indexPath);
    await dismissOverlays(page);
    await seedDoc(page, { remarks: [{ id: 'r1', anchorNodeId: 2, person: 'Jane Doe', text: 'Looks good to me.', date: '2024-01-01' }] });
    await page.evaluate(() => {
      // @ts-expect-error
      previewActive = true;
      // @ts-expect-error
      renderPreviewBody();
      document.getElementById('preview-overlay')?.classList.add('open');
    });

    const result = await page.evaluate(() => {
      const body = document.getElementById('preview-body')!;
      const block = body.querySelector('.pv-remark-block');
      const avatar = body.querySelector('.pv-remark-avatar') as HTMLElement | null;
      return {
        isInlineBlock: !!block?.classList.contains('pv-inline-block'),
        hasBoxedBody: !!block?.querySelector('.pv-inline-remark-body'),
        hasLabelColorClass: !!block?.querySelector('.pv-inline-label-remark'),
        avatarText: avatar?.textContent,
        avatarHasBackground: !!avatar && avatar.style.background.length > 0,
      };
    });
    expect(result.isInlineBlock).toBe(true);
    expect(result.hasBoxedBody).toBe(true);
    expect(result.hasLabelColorClass).toBe(true);
    expect(result.avatarText).toBe('JD');
    expect(result.avatarHasBackground).toBe(true);
  });

  // The trailing section already has its own "Remarks" heading grouping these -- a repeated
  // per-item label+card (previewRenderRemarkGroup's shell) would say "Remark" a second,
  // redundant time per orphaned entry, so these render as flat entries instead, same as the
  // equally flat #pv-qa-section list right above it in renderPreviewBody.
  test('a remark anchored to a node not present in this export falls back to the trailing Remarks section, as a flat entry (no repeated per-item label)', async ({ page }) => {
    await page.goto('file://' + indexPath);
    await dismissOverlays(page);
    await seedDoc(page, { remarks: [{ id: 'r1', anchorNodeId: 999, person: 'Jane Doe', text: 'Orphaned remark.', date: '2024-01-01' }] });
    await page.evaluate(() => {
      // @ts-expect-error
      previewActive = true;
      // @ts-expect-error
      renderPreviewBody();
      document.getElementById('preview-overlay')?.classList.add('open');
    });

    const result = await page.evaluate(() => {
      const section = document.getElementById('pv-remarks-section');
      return {
        sectionExists: !!section,
        hasEntry: !!section?.querySelector('.pv-remark-entry'),
        hasAvatar: !!section?.querySelector('.pv-remark-avatar'),
        hasRepeatedLabel: !!section?.querySelector('.pv-inline-label-remark'),
      };
    });
    expect(result.sectionExists).toBe(true);
    expect(result.hasEntry).toBe(true);
    expect(result.hasAvatar).toBe(true);
    expect(result.hasRepeatedLabel).toBe(false);
  });

  // Previously every remark anchored to a node got its own repeated "Remark" label+card, so two
  // or three remarks on the same node read as that many separate, seemingly unrelated cards
  // stacked back to back -- mirrors the single-card/multiple-rows pattern the inline Q&A card
  // already uses for several questions linked to one node.
  test('several remarks anchored to the same node group under one shared "Remarks" card, not one card each', async ({ page }) => {
    await page.goto('file://' + indexPath);
    await dismissOverlays(page);
    await seedDoc(page, {
      remarks: [
        { id: 'r1', anchorNodeId: 2, person: 'Jane Doe', text: 'First remark.', date: '2024-01-01' },
        { id: 'r2', anchorNodeId: 2, person: 'John Smith', text: 'Second remark.', date: '2024-01-02' },
      ],
    });
    await page.evaluate(() => {
      // @ts-expect-error
      previewActive = true;
      // @ts-expect-error
      renderPreviewBody();
      document.getElementById('preview-overlay')?.classList.add('open');
    });

    const result = await page.evaluate(() => {
      const body = document.getElementById('preview-body')!;
      return {
        blockCount: body.querySelectorAll('.pv-remark-block').length,
        labelCount: body.querySelectorAll('.pv-inline-label-remark').length,
        entryCount: body.querySelectorAll('.pv-remark-entry').length,
        labelText: body.querySelector('.pv-inline-label-remark span')?.textContent,
      };
    });
    expect(result.blockCount).toBe(1);
    expect(result.labelCount).toBe(1);
    expect(result.entryCount).toBe(2);
    expect(result.labelText).toBe('Remarks');
  });
});

// On-screen Preview/Presenter deliberately renders a plain single-line note inline right after
// the node's own text (to stay compact while browsing), and a multi-line-but-still-plain note as
// a thin unboxed rule -- only a richer note (table/image/heading/etc.) gets the full bordered
// card. That meant an exported PDF/PPTX's own note output looked inconsistent from one node to
// the next, with no way for a reader to tell "notes render differently" from "these are
// different kinds of content." _pvForceFullNoteCard makes every note use the same full card
// during an export pass specifically, without changing the on-screen behavior.
test.describe('Every note renders the same way in PDF/PPTX export, regardless of length or formatting', () => {
  test('a one-line plain note still renders inline next to the node text during ordinary on-screen Preview (unaffected)', async ({ page }) => {
    await page.goto('file://' + indexPath);
    await dismissOverlays(page);
    await seedDoc(page, { note: '<p>A short plain note.</p>' });
    await page.evaluate(() => {
      // @ts-expect-error
      previewActive = true;
      // @ts-expect-error
      renderPreviewBody();
      document.getElementById('preview-overlay')?.classList.add('open');
    });

    const result = await page.evaluate(() => ({
      hasInlineTeaser: !!document.querySelector('#preview-body .pv-note-inline-full'),
      hasFullCard: !!document.querySelector('#preview-body .pv-inline-note-body'),
    }));
    expect(result.hasInlineTeaser).toBe(true);
    expect(result.hasFullCard).toBe(false);
  });

  test('that same one-line plain note renders as the full boxed card during a PDF/PPTX export pass instead', async ({ page }) => {
    await page.goto('file://' + indexPath);
    await dismissOverlays(page);
    await seedDoc(page, { note: '<p>A short plain note.</p>' });
    await applyExportStateAndRender(page);

    const result = await page.evaluate(() => {
      const card = document.querySelector('#preview-body .pv-inline-note-body');
      return {
        hasInlineTeaser: !!document.querySelector('#preview-body .pv-note-inline-full'),
        hasFullCard: !!card,
        isPlainVariant: !!card?.classList.contains('pv-note-plain'),
        labelHasNoteColorClass: !!document.querySelector('#preview-body .pv-inline-label-note'),
      };
    });
    expect(result.hasInlineTeaser).toBe(false);
    expect(result.hasFullCard).toBe(true);
    expect(result.isPlainVariant).toBe(false);
    expect(result.labelHasNoteColorClass).toBe(true);
  });

  test('a multi-paragraph plain note, which normally gets the thin unboxed "plain card" rule on screen, gets the full box during export too', async ({ page }) => {
    await page.goto('file://' + indexPath);
    await dismissOverlays(page);
    const note = '<p>First paragraph.</p><p>Second paragraph.</p>';
    await seedDoc(page, { note });

    // On screen: full card path already (not single-line), but the lighter "plain card" variant.
    await page.evaluate(() => {
      // @ts-expect-error
      previewActive = true;
      // @ts-expect-error
      renderPreviewBody();
      document.getElementById('preview-overlay')?.classList.add('open');
    });
    const onScreen = await page.evaluate(() => !!document.querySelector('#preview-body .pv-inline-note-body.pv-note-plain'));
    expect(onScreen).toBe(true);

    // During export: same note, full box instead, no pv-note-plain.
    await applyExportStateAndRender(page);
    const exported = await page.evaluate(() => {
      const card = document.querySelector('#preview-body .pv-inline-note-body');
      return { hasCard: !!card, isPlainVariant: !!card?.classList.contains('pv-note-plain') };
    });
    expect(exported.hasCard).toBe(true);
    expect(exported.isPlainVariant).toBe(false);
  });
});
