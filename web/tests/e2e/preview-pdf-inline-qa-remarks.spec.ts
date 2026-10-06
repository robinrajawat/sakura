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

function seedDoc(page: import('@playwright/test').Page, opts: { qaItems?: any[]; remarks?: any[] }) {
  return page.evaluate((opts) => {
    // @ts-expect-error
    nodes = [
      { id: 1, depth: 0, text: 'Parent row', parentId: null, isCheckbox: false, checked: false, note: '', noteTitle: '', tags: [], styles: {} },
      { id: 2, depth: 1, text: 'A row with linked content', parentId: 1, isCheckbox: false, checked: false, note: '', noteTitle: '', tags: [], styles: {} },
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

  test('a remark anchored to a node not present in this export falls back to the trailing Remarks section, in the same card shape', async ({ page }) => {
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
        hasBoxedBody: !!section?.querySelector('.pv-inline-remark-body'),
        hasAvatar: !!section?.querySelector('.pv-remark-avatar'),
      };
    });
    expect(result.sectionExists).toBe(true);
    expect(result.hasBoxedBody).toBe(true);
    expect(result.hasAvatar).toBe(true);
  });
});
