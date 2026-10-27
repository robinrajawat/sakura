import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

// Rewrite used to send a row's plain words and put plain text back, dropping bold, web links and
// @row links. A row with formatting now goes to the AI as small HTML and comes back with its marks.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('sakura_welcome_seen', '1'));
  await page.goto('file://' + indexPath);
  await page.evaluate(() => {
    const l = document.getElementById('sakura-landing-overlay');
    if (l) l.style.display = 'none';
    // @ts-ignore -- bare globals from index.html
    nodes = [makeNode('Release notes', 0, null), makeNode('we will ship the release today, see docs', 0, null), makeNode('plain row here', 0, null)];
    // @ts-ignore
    const n = nodes[1];
    // @ts-ignore
    setRowMarksOn(n, [{ s: 17, e: 24, k: 'b' }, { s: 36, e: 40, k: 'a', v: 'https://example.com/docs' }, { s: 0, e: 2, k: 'r', v: String(nodes[0].id) }]);
    // @ts-ignore
    rebuildParentIds(); collapsedIds = new Set(); selectedId = null; editingId = null; render();
    // A stand-in AI: capitalises the first word and swaps "we will" for "We'll", keeping tags.
    (window as unknown as { __prompts: string[] }).__prompts = [];
    // @ts-ignore
    requireAiKey = () => 'test-key';
    // @ts-ignore
    callAiByShapeWithFallback = async (_s: string, _u: string, _k: string, _m: string, system: string, user: string) => {
      (window as unknown as { __prompts: string[] }).__prompts.push(system + '\n---\n' + user);
      const fix = (t: string) => t.replace('we</span> will', "We'll</span>").replace('plain row', 'Plain row');
      if (user.startsWith('Text: ')) return fix(user.slice(6));
      return user.split('\n').filter(l => l.startsWith('<<<SAKURA-ITEM-') || !/^You will receive/.test(l)).map(fix).join('\n');
    };
  });
});

const rowState = (page: import('@playwright/test').Page, i: number) =>
  page.evaluate(i => {
    // @ts-expect-error -- bare globals from index.html
    const n = nodes[i]; const m = rowMarksOf(n) as { s: number; e: number; k: string; v?: string }[];
    return { text: n.text as string, marks: m.map(x => `${n.text.slice(x.s, x.e)}:${x.k}${x.v ? '=' + x.v : ''}`).sort() };
  }, i);

test('rewriting one row keeps its bold, web link and row link', async ({ page }) => {
  // @ts-expect-error -- bare globals from index.html
  const rowLinkId = await page.evaluate(() => String(nodes[0].id));
  // @ts-expect-error -- bare globals from index.html
  await page.evaluate(() => rewriteNodeText(nodes[1].id));
  const r = await rowState(page, 1);
  expect(r.text).toBe("We'll ship the release today, see docs");
  expect(r.marks).toEqual(["We'll:r=" + rowLinkId, 'docs:a=https://example.com/docs', 'release:b'].sort());
  const prompt = await page.evaluate(() => (window as unknown as { __prompts: string[] }).__prompts[0]);
  expect(prompt).toContain('Keep every tag');
  expect(prompt).toContain('<b>release</b>');
});

test('rewriting several rows keeps formatting, and plain rows stay plain', async ({ page }) => {
  // @ts-expect-error -- bare globals from index.html
  await page.evaluate(() => rewriteMultipleNodes([nodes[1].id, nodes[2].id]));
  const formatted = await rowState(page, 1);
  expect(formatted.text).toBe("We'll ship the release today, see docs");
  expect(formatted.marks).toContain('release:b');
  expect(formatted.marks).toContain('docs:a=https://example.com/docs');
  const plain = await rowState(page, 2);
  expect(plain).toEqual({ text: 'Plain row here', marks: [] });
});

test('a row with no formatting is sent as plain text, as before', async ({ page }) => {
  // @ts-expect-error -- bare globals from index.html
  await page.evaluate(() => rewriteNodeText(nodes[2].id));
  const prompt = await page.evaluate(() => (window as unknown as { __prompts: string[] }).__prompts[0]);
  expect(prompt).not.toContain('Keep every tag');
  expect(prompt.endsWith('Text: plain row here')).toBe(true);
  expect((await rowState(page, 2)).text).toBe('Plain row here');
});
