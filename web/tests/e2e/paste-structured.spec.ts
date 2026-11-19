import { test, expect, type Page } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

// Paste review (owner 2026-11-19: "make sure this whole paste functionality is robust"). Formatted
// text from Word, Notion and Google Docs keeps headings, nesting, checkboxes and formatting; a table
// with text around it keeps the text; every table on the clipboard is kept; a pasted table can't run
// script; Word's plain-text bullets are bullets. Smart pastes (tables, trees, Markdown) still win.

const SAMPLES: Record<string, { html: string; text: string }> = {
  "word": {
    "html": "<html xmlns:o=\"urn:schemas-microsoft-com:office:office\" xmlns:w=\"urn:schemas-microsoft-com:office:word\"><head><meta name=Generator content=\"Microsoft Word 15\"><style><!-- p.MsoListParagraph{margin-left:.5in} --></style></head><body lang=EN-US style='tab-interval:.5in'>\n<!--StartFragment--><h1>Project plan<o:p></o:p></h1>\n<p class=MsoNormal>Intro paragraph with <b>bold</b> text.<o:p></o:p></p>\n<h2>Goals<o:p></o:p></h2>\n<p class=MsoListParagraphCxSpFirst style='text-indent:-.25in;mso-list:l0 level1 lfo1'><![if !supportLists]><span style='font-family:Symbol;mso-fareast-font-family:Symbol'><span style='mso-list:Ignore'>·<span style='font:7.0pt \"Times New Roman\"'>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; </span></span></span><![endif]>Hire two engineers<o:p></o:p></p>\n<p class=MsoListParagraphCxSpMiddle style='margin-left:1.0in;mso-add-space:auto;text-indent:-.25in;mso-list:l0 level2 lfo1'><![if !supportLists]><span style='font-family:\"Courier New\"'><span style='mso-list:Ignore'>o<span style='font:7.0pt \"Times New Roman\"'>&nbsp;&nbsp; </span></span></span><![endif]>Backend<o:p></o:p></p>\n<p class=MsoListParagraphCxSpLast style='text-indent:-.25in;mso-list:l0 level1 lfo1'><![if !supportLists]><span style='font-family:Symbol'><span style='mso-list:Ignore'>·<span style='font:7.0pt \"Times New Roman\"'>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; </span></span></span><![endif]>Ship v2<o:p></o:p></p>\n<h2>Steps<o:p></o:p></h2>\n<p class=MsoListParagraphCxSpFirst style='text-indent:-.25in;mso-list:l1 level1 lfo2'><![if !supportLists]><span><span style='mso-list:Ignore'>1.<span style='font:7.0pt \"Times New Roman\"'>&nbsp;&nbsp;&nbsp;&nbsp; </span></span></span><![endif]>First step<o:p></o:p></p>\n<p class=MsoListParagraphCxSpLast style='text-indent:-.25in;mso-list:l1 level1 lfo2'><![if !supportLists]><span><span style='mso-list:Ignore'>2.<span style='font:7.0pt \"Times New Roman\"'>&nbsp;&nbsp;&nbsp;&nbsp; </span></span></span><![endif]>Second step<o:p></o:p></p>\n<!--EndFragment--></body></html>",
    "text": "Project plan\r\nIntro paragraph with bold text.\r\nGoals\r\n·         Hire two engineers\r\no   Backend\r\n·         Ship v2\r\nSteps\r\n1.     First step\r\n2.     Second step\r\n"
  },
  "notion": {
    "html": "<meta charset=\"utf-8\"><h1>Project plan</h1><p>Intro with <strong>bold</strong></p><h2>Goals</h2><ul><li>Hire two engineers<ul><li>Backend</li></ul></li><li>Ship v2</li></ul><ul class=\"to-do-list\"><li><div class=\"checkbox checkbox-on\"></div> <span class=\"to-do-children-checked\">Done thing</span></li><li><div class=\"checkbox checkbox-off\"></div> <span class=\"to-do-children-unchecked\">Open thing</span></li></ul>",
    "text": "# Project plan\n\nIntro with **bold**\n\n## Goals\n\n- Hire two engineers\n    - Backend\n- Ship v2\n- [x] Done thing\n- [ ] Open thing\n"
  },
  "googleDocs": {
    "html": "<meta charset=\"utf-8\"><b style=\"font-weight:normal;\" id=\"docs-internal-guid-1a2b3c\"><h1 dir=\"ltr\" style=\"line-height:1.38;\"><span style=\"font-size:20pt;font-weight:400;\">Project plan</span></h1><p dir=\"ltr\"><span style=\"font-weight:400;\">Intro with </span><span style=\"font-weight:700;\">bold</span><span style=\"font-weight:400;\"> and </span><a href=\"https://x.co\" style=\"text-decoration:none;\"><span style=\"color:#1155cc;text-decoration:underline;\">a link</span></a></p><h2 dir=\"ltr\"><span style=\"font-weight:400;\">Goals</span></h2><ul style=\"margin-top:0;margin-bottom:0;\"><li dir=\"ltr\" style=\"list-style-type:disc;\" aria-level=\"1\"><p dir=\"ltr\" role=\"presentation\"><span>Hire two engineers</span></p></li><ul style=\"margin-top:0;margin-bottom:0;\"><li dir=\"ltr\" style=\"list-style-type:circle;\" aria-level=\"2\"><p dir=\"ltr\" role=\"presentation\"><span>Backend</span></p></li></ul><li dir=\"ltr\" style=\"list-style-type:disc;\" aria-level=\"1\"><p dir=\"ltr\" role=\"presentation\"><span style=\"font-style:italic;\">Ship v2</span></p></li></ul></b>",
    "text": "Project plan\nIntro with bold and a link\nGoals\n* Hire two engineers\n   * Backend\n* Ship v2\n"
  }
};

for (const mode of ['editing', 'selected'] as const) {
  test.describe(`pasting into a ${mode} row`, () => {
    test.beforeEach(async ({ page }) => {
      await page.addInitScript(() => { localStorage.setItem('sakura_welcome_seen', '1'); sessionStorage.setItem('sakura_landing_dismissed', 'true'); });
      await page.setViewportSize({ width: 1400, height: 900 });
      await page.goto('file://' + indexPath);
      await page.waitForFunction('typeof render === "function" && typeof nodes !== "undefined"');
      await page.evaluate(() => {
        const w = window as any;
        w.eval('ensureDocumentForEditing();');
        w.eval(`nodes = [{ id: 1, depth: 0, text: '', parentId: null, isCheckbox: false, checked: false, note: '', tables: [], images: [], tags: [], styles: {} }]; rebuildParentIds(); nextId = 2; render();`);
      });
      if (mode === 'editing') {
        await page.locator('.node-row[data-id="1"] .node-label').click();
        await expect(page.locator('.node-row[data-id="1"] .node-input')).toBeVisible();
      } else {
        await page.evaluate(() => (window as any).eval('selectedId = 1; editingId = null; render();'));
      }
    });
    async function paste(page: Page, text: string, html = '') {
      await page.evaluate(([text, html, mode]) => {
        const dt = new DataTransfer(); dt.setData('text/plain', text); if (html) dt.setData('text/html', html);
        const target = mode === 'editing' ? (document.activeElement || document.body) : document.body;
        target.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
      }, [text, html, mode]);
    }
    // The pasted rows (the empty starting row is left out when pasting after a selected row).
    async function rows(page: Page) {
      const all = await page.evaluate(() => {
        const w = window as any; if (w.eval('editingId') !== null) w.eval('commitEdit()');
        return w.eval('nodes').map((n: any) => ({ d: n.depth, t: n.text, h: (n.styles && n.styles.heading) || 0, m: (n.marks || []).map((x: any) => x.k).join(''), tb: (n.tables || []).length, cb: n.isCheckbox ? (n.checked ? 'x' : ' ') : '' }));
      });
      if (mode === 'selected' && all[0] && all[0].t === '' && !all[0].tb) { const [, ...rest] = all; return rest.map((r: any) => ({ ...r, d: r.d })); }
      return all;
    }

    test('Word: headings, nested list levels, bold; no bullet glyphs in the text', async ({ page }) => {
      await paste(page, SAMPLES.word.text, SAMPLES.word.html);
      const r = await rows(page);
      expect(r.map((x: any) => x.t)).toEqual(['Project plan', 'Intro paragraph with bold text.', 'Goals', 'Hire two engineers', 'Backend', 'Ship v2', 'Steps', 'First step', 'Second step']);
      const d0 = r[0].d;
      expect(r.map((x: any) => x.d - d0)).toEqual([0, 1, 1, 2, 3, 2, 1, 2, 2]);
      expect(r.map((x: any) => x.h)).toEqual([1, 0, 2, 0, 0, 0, 2, 0, 0]);
      expect(r[1].m).toBe('b');
    });
    test('Notion: To-Do boxes come through ticked and unticked', async ({ page }) => {
      await paste(page, SAMPLES.notion.text, SAMPLES.notion.html);
      const r = await rows(page);
      expect(r.slice(-2).map((x: any) => [x.t, x.cb])).toEqual([['Done thing', 'x'], ['Open thing', ' ']]);
    });
    test('Google Docs: no stray bold from its wrapper; italic and link kept', async ({ page }) => {
      await paste(page, SAMPLES.googleDocs.text, SAMPLES.googleDocs.html);
      const r = await rows(page);
      expect(r.map((x: any) => [x.t, x.m])).toEqual([['Project plan', ''], ['Intro with bold and a link', 'ba'], ['Goals', ''], ['Hire two engineers', ''], ['Backend', ''], ['Ship v2', 'i']]);
    });
    test('a table with text around it keeps the text, with the table on the row it follows', async ({ page }) => {
      await paste(page, 'Intro\nA\tB', '<p>Intro</p><p>More words</p><table><tr><td>A</td><td>B</td></tr></table>');
      expect((await rows(page)).map((x: any) => [x.t, x.tb])).toEqual([['Intro', 0], ['More words', 1]]);
    });
    test('a table on its own is still a table on this row, and every table on the clipboard is kept', async ({ page }) => {
      await paste(page, 't1\tx\nt2\ty', '<style>td{}</style><table><tr><td>t1</td><td>x</td></tr></table><table><tr><td>t2</td><td>y</td></tr></table>');
      expect(await page.evaluate('nodes.length')).toBe(1);
      expect(await page.evaluate('nodes[0].tables.length')).toBe(2);
    });
    test('a pasted table cannot run script', async ({ page }) => {
      await paste(page, 'a\tb', '<img src=x onerror="window.__pwned=1"><table><tr><td>a<img src=y onerror="window.__pwned=2"></td><td>b</td></tr></table>');
      await page.waitForTimeout(300);
      expect(await page.evaluate(() => (window as any).__pwned)).toBeUndefined();
      expect(await page.evaluate('nodes[0].tables[0]')).not.toMatch(/onerror/i);
    });
    test('formatted lists can\'t run script either', async ({ page }) => {
      await paste(page, 'x\ny', '<ul><li><img src=x onerror="window.__pwned=3">x</li><li><script>window.__pwned=4</script>y</li></ul><table><tr><td><img src=z onerror="window.__pwned=5">t</td></tr></table>');
      await page.waitForTimeout(300);
      expect(await page.evaluate(() => (window as any).__pwned)).toBeUndefined();
    });
    test('Word\'s plain-text bullets (· and o) are bullets, not words', async ({ page }) => {
      await paste(page, '·         Hire two engineers\no   Backend\n·         Ship v2');
      expect((await rows(page)).map((x: any) => x.t)).toEqual(['Hire two engineers', 'Backend', 'Ship v2']);
    });
    test('smart pastes still win: a ├── tree, Markdown and tab-separated text', async ({ page }) => {
      await paste(page, 'Root\n├── A\n└── B', '<ul><li>Root</li></ul>');
      expect((await rows(page)).map((x: any) => x.t).slice(-3)).toEqual(['Root', 'A', 'B']);
    });
  });
}

test('pasting a heading with a table into an empty row keeps the table on that row', async ({ page }) => {
  await page.addInitScript(() => { localStorage.setItem('sakura_welcome_seen', '1'); sessionStorage.setItem('sakura_landing_dismissed', 'true'); });
  await page.goto('file://' + indexPath);
  await page.waitForFunction('typeof render === "function" && typeof nodes !== "undefined"');
  await page.evaluate(() => { const w = window as any; w.eval('ensureDocumentForEditing();'); w.eval(`nodes = [{ id: 1, depth: 0, text: '', parentId: null, isCheckbox: false, checked: false, note: '', tables: [], images: [], tags: [], styles: {} }]; rebuildParentIds(); nextId = 2; render();`); });
  await page.locator('.node-row[data-id="1"] .node-label').click();
  await page.evaluate(() => {
    const dt = new DataTransfer(); dt.setData('text/plain', 'Prices'); dt.setData('text/html', '<h2>Prices</h2><table><tr><td>A</td><td>1</td></tr></table><p>Note after</p>');
    (document.activeElement || document.body).dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
  });
  expect(await page.evaluate('nodes.map(n => [n.text, n.tables.length])')).toEqual([['Prices', 1], ['Note after', 0]]);
});
