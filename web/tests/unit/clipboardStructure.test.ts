// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { readClipboardStructure, clipWordCount } from '../../src/utils/clipboardStructure';

// Pasted formatted text keeps its structure (owner 2026-11-19). The samples are each app's clipboard
// HTML format: Word desktop (mso-list paragraphs), OneNote (lists inside lists), Word on the web,
// Google Docs (a not-bold <b> wrapper), Notion (checkboxes), a web article and an Outlook email.

const SAMPLES: Record<string, string> = {
  "wordDesktop": "<html xmlns:o=\"urn:schemas-microsoft-com:office:office\" xmlns:w=\"urn:schemas-microsoft-com:office:word\"><head><meta name=Generator content=\"Microsoft Word 15\"><style><!-- p.MsoListParagraph{margin-left:.5in} --></style></head><body lang=EN-US style='tab-interval:.5in'>\n<!--StartFragment--><h1>Project plan<o:p></o:p></h1>\n<p class=MsoNormal>Intro paragraph with <b>bold</b> text.<o:p></o:p></p>\n<h2>Goals<o:p></o:p></h2>\n<p class=MsoListParagraphCxSpFirst style='text-indent:-.25in;mso-list:l0 level1 lfo1'><![if !supportLists]><span style='font-family:Symbol;mso-fareast-font-family:Symbol'><span style='mso-list:Ignore'>·<span style='font:7.0pt \"Times New Roman\"'>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; </span></span></span><![endif]>Hire two engineers<o:p></o:p></p>\n<p class=MsoListParagraphCxSpMiddle style='margin-left:1.0in;mso-add-space:auto;text-indent:-.25in;mso-list:l0 level2 lfo1'><![if !supportLists]><span style='font-family:\"Courier New\"'><span style='mso-list:Ignore'>o<span style='font:7.0pt \"Times New Roman\"'>&nbsp;&nbsp; </span></span></span><![endif]>Backend<o:p></o:p></p>\n<p class=MsoListParagraphCxSpLast style='text-indent:-.25in;mso-list:l0 level1 lfo1'><![if !supportLists]><span style='font-family:Symbol'><span style='mso-list:Ignore'>·<span style='font:7.0pt \"Times New Roman\"'>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; </span></span></span><![endif]>Ship v2<o:p></o:p></p>\n<h2>Steps<o:p></o:p></h2>\n<p class=MsoListParagraphCxSpFirst style='text-indent:-.25in;mso-list:l1 level1 lfo2'><![if !supportLists]><span><span style='mso-list:Ignore'>1.<span style='font:7.0pt \"Times New Roman\"'>&nbsp;&nbsp;&nbsp;&nbsp; </span></span></span><![endif]>First step<o:p></o:p></p>\n<p class=MsoListParagraphCxSpLast style='text-indent:-.25in;mso-list:l1 level1 lfo2'><![if !supportLists]><span><span style='mso-list:Ignore'>2.<span style='font:7.0pt \"Times New Roman\"'>&nbsp;&nbsp;&nbsp;&nbsp; </span></span></span><![endif]>Second step<o:p></o:p></p>\n<!--EndFragment--></body></html>",
  "oneNoteDesktop": "<html xmlns:o=\"urn:schemas-microsoft-com:office:office\"><head><meta name=Generator content=\"Microsoft OneNote 15\"></head><body lang=en-US style='font-family:Calibri;font-size:11.0pt'>\n<!--StartFragment--><div style='direction:ltr'>\n<p style='margin:0in;font-family:\"Calibri Light\";font-size:20.0pt'>Meeting notes</p>\n<p style='margin:0in;font-family:Calibri;font-size:11.0pt'>Some text before the list</p>\n<ul style='direction:ltr;unicode-bidi:embed;margin-top:0in;margin-bottom:0in' type=disc>\n <li style='margin-top:0;margin-bottom:0;vertical-align:middle'><span style='font-family:Calibri;font-size:11.0pt'>Item one</span></li>\n <ul style='direction:ltr;unicode-bidi:embed;margin-top:0in;margin-bottom:0in' type=circle>\n  <li style='margin-top:0;margin-bottom:0;vertical-align:middle'><span style='font-family:Calibri;font-size:11.0pt'>Sub item</span></li>\n </ul>\n <li style='margin-top:0;margin-bottom:0;vertical-align:middle'><span style='font-family:Calibri;font-size:11.0pt'>Item <span style='font-weight:bold'>two</span></span></li>\n</ul>\n<p style='margin:0in;font-family:Calibri;font-size:14.0pt;color:#2E75B5'>Decisions</p>\n<p style='margin:0in;font-family:Calibri;font-size:11.0pt'>Go with vendor B</p>\n</div><!--EndFragment--></body></html>",
  "wordWeb": "<meta charset=\"utf-8\"><h1>Project plan</h1><p>Intro paragraph with <strong>bold</strong> text.</p><h2>Goals</h2><ul><li><p>Hire two engineers</p><ul><li><p>Backend</p></li></ul></li><li><p>Ship v2</p></li></ul><h2>Steps</h2><ol><li><p>First step</p></li><li><p>Second step</p></li></ol>",
  "googleDocs": "<meta charset=\"utf-8\"><b style=\"font-weight:normal;\" id=\"docs-internal-guid-1a2b3c\"><h1 dir=\"ltr\" style=\"line-height:1.38;\"><span style=\"font-size:20pt;font-weight:400;\">Project plan</span></h1><p dir=\"ltr\"><span style=\"font-weight:400;\">Intro with </span><span style=\"font-weight:700;\">bold</span><span style=\"font-weight:400;\"> and </span><a href=\"https://x.co\" style=\"text-decoration:none;\"><span style=\"color:#1155cc;text-decoration:underline;\">a link</span></a></p><h2 dir=\"ltr\"><span style=\"font-weight:400;\">Goals</span></h2><ul style=\"margin-top:0;margin-bottom:0;\"><li dir=\"ltr\" style=\"list-style-type:disc;\" aria-level=\"1\"><p dir=\"ltr\" role=\"presentation\"><span>Hire two engineers</span></p></li><ul style=\"margin-top:0;margin-bottom:0;\"><li dir=\"ltr\" style=\"list-style-type:circle;\" aria-level=\"2\"><p dir=\"ltr\" role=\"presentation\"><span>Backend</span></p></li></ul><li dir=\"ltr\" style=\"list-style-type:disc;\" aria-level=\"1\"><p dir=\"ltr\" role=\"presentation\"><span style=\"font-style:italic;\">Ship v2</span></p></li></ul></b>",
  "notion": "<meta charset=\"utf-8\"><h1>Project plan</h1><p>Intro with <strong>bold</strong></p><h2>Goals</h2><ul><li>Hire two engineers<ul><li>Backend</li></ul></li><li>Ship v2</li></ul><ul class=\"to-do-list\"><li><div class=\"checkbox checkbox-on\"></div> <span class=\"to-do-children-checked\">Done thing</span></li><li><div class=\"checkbox checkbox-off\"></div> <span class=\"to-do-children-unchecked\">Open thing</span></li></ul>",
  "webArticle": "<meta charset=\"utf-8\"><article><h2>Why outlines work</h2><p>Outlines help you think. They <em>force</em> structure.</p><h3>Benefits</h3><ol><li>Clarity</li><li>Speed<ol><li>Less rework</li></ol></li></ol><p>Read more on <a href=\"https://example.com\">our blog</a>.</p></article>",
  "outlookEmail": "<html><head><meta name=Generator content=\"Microsoft Word 15 (filtered medium)\"></head><body><div class=WordSection1><p class=MsoNormal>Hi team,<o:p></o:p></p><p class=MsoNormal>Action items:<o:p></o:p></p><ul style='margin-top:0in' type=disc><li class=MsoListParagraph style='margin-left:0in;mso-list:l0 level1 lfo1'>Send the contract<o:p></o:p></li><li class=MsoListParagraph style='margin-left:0in;mso-list:l0 level1 lfo1'>Book the room<o:p></o:p></li></ul><p class=MsoNormal>Thanks<o:p></o:p></p></div></body></html>"
};

const read = (html: string) => readClipboardStructure(new DOMParser().parseFromString(html, 'text/html').body as never);
const shape = (html: string) => read(html).map((r) => [r.depth, r.text, r.heading, r.isCheckbox ? (r.checked ? 'x' : ' ') : '', r.marks.map((m) => m.k + ':' + r.text.slice(m.s, m.e)).join(',')]);
describe('apps', () => {
  it('Word desktop: headings nest, list levels from mso-list, bullet glyphs gone, numbers gone, bold kept', () => {
    expect(shape(SAMPLES.wordDesktop)).toEqual([
      [0, 'Project plan', 1, '', ''],
      [1, 'Intro paragraph with bold text.', 0, '', 'b:bold'],
      [1, 'Goals', 2, '', ''],
      [2, 'Hire two engineers', 0, '', ''],
      [3, 'Backend', 0, '', ''],
      [2, 'Ship v2', 0, '', ''],
      [1, 'Steps', 2, '', ''],
      [2, 'First step', 0, '', ''],
      [2, 'Second step', 0, '', '']
    ]);
  });
  it('OneNote: a list inside a list nests under the item before it', () => {
    expect(shape(SAMPLES.oneNoteDesktop)).toEqual([
      [0, 'Meeting notes', 0, '', ''], [0, 'Some text before the list', 0, '', ''],
      [0, 'Item one', 0, '', ''], [1, 'Sub item', 0, '', ''], [0, 'Item two', 0, '', 'b:two'],
      [0, 'Decisions', 0, '', ''], [0, 'Go with vendor B', 0, '', '']
    ]);
  });
  it('Word on the web: paragraphs inside items, numbered lists', () => {
    expect(shape(SAMPLES.wordWeb).map((r) => [r[0], r[1], r[2]])).toEqual([
      [0, 'Project plan', 1], [1, 'Intro paragraph with bold text.', 0], [1, 'Goals', 2], [2, 'Hire two engineers', 0], [3, 'Backend', 0],
      [2, 'Ship v2', 0], [1, 'Steps', 2], [2, 'First step', 0], [2, 'Second step', 0]
    ]);
  });
  it('Google Docs: the not-bold wrapper adds no bold; real bold, italic and links survive', () => {
    expect(shape(SAMPLES.googleDocs)).toEqual([
      [0, 'Project plan', 1, '', ''],
      [1, 'Intro with bold and a link', 0, '', 'b:bold,a:a link'],
      [1, 'Goals', 2, '', ''],
      [2, 'Hire two engineers', 0, '', ''],
      [3, 'Backend', 0, '', ''],
      [2, 'Ship v2', 0, '', 'i:Ship v2']
    ]);
    expect(read(SAMPLES.googleDocs)[1].marks.find((m) => m.k === 'a')?.v).toBe('https://x.co');
  });
  it('Notion: checkboxes come through ticked and unticked', () => {
    const r = shape(SAMPLES.notion);
    expect(r.slice(-2)).toEqual([[2, 'Done thing', 0, 'x', ''], [2, 'Open thing', 0, ' ', '']]);
    expect(r.slice(0, 3).map((x) => x[1])).toEqual(['Project plan', 'Intro with bold', 'Goals']);
  });
  it('web article: h2/h3 nest, ordered lists inside lists, links', () => {
    expect(shape(SAMPLES.webArticle)).toEqual([
      [0, 'Why outlines work', 1, '', ''], [1, 'Outlines help you think. They force structure.', 0, '', 'i:force'],
      [1, 'Benefits', 2, '', ''], [2, 'Clarity', 0, '', ''], [2, 'Speed', 0, '', ''], [3, 'Less rework', 0, '', ''],
      [2, 'Read more on our blog.', 0, '', 'a:our blog']
    ]);
  });
  it('Outlook email: Word-style list items inside a real list', () => {
    expect(shape(SAMPLES.outlookEmail).map((r) => [r[0], r[1]])).toEqual([[0, 'Hi team,'], [0, 'Action items:'], [0, 'Send the contract'], [0, 'Book the room'], [0, 'Thanks']]);
  });
});

describe('edge cases', () => {
  it('a table in mixed content attaches to the row above, or gets its own row at the top', () => {
    const r = read('<p>Intro</p><table><tr><td>a</td></tr></table><p>After</p>');
    expect(r.map((x) => [x.text, x.tables.length])).toEqual([['Intro', 1], ['After', 0]]);
    expect(r[0].tables[0]).toContain('<td>a</td>');
    expect(read('<table><tr><td>a</td></tr></table><p>x</p>').map((x) => [x.text, x.tables.length])).toEqual([['', 1], ['x', 0]]);
  });
  it('a table inside a list item belongs to that item; two tables both stay', () => {
    const r = read('<ul><li>Item<table><tr><td>a</td></tr></table></li></ul><p>P</p><table><tr><td>1</td></tr></table><table><tr><td>2</td></tr></table>');
    expect(r.map((x) => [x.text, x.tables.length])).toEqual([['Item', 1], ['P', 2]]);
  });
  it('line breaks split rows; empty paragraphs and Word\'s <o:p> make none', () => {
    expect(read('<p>one<br>two</p><p class=MsoNormal><o:p>&nbsp;</o:p></p><p>three</p>').map((x) => x.text)).toEqual(['one', 'two', 'three']);
  });
  it('checkbox glyphs and <input type=checkbox>', () => {
    expect(read('<ul><li>☐ open</li><li>☑ done</li><li><input type="checkbox" checked> ticked</li></ul>').map((x) => [x.text, x.isCheckbox, x.checked])).toEqual([
      ['open', true, false], ['done', true, true], ['ticked', true, true]
    ]);
    expect(read('<ul><li role="checkbox" aria-checked="true">GDocs done</li></ul>')[0]).toMatchObject({ isCheckbox: true, checked: true });
  });
  it('scripts, styles, hidden text and images add no words', () => {
    expect(read('<style>p{}</style><p>a<script>evil()</script><img src=x onerror=1><span style="display:none">hidden</span> b</p>').map((x) => x.text)).toEqual(['a b']);
  });
  it('only web and mail links become links', () => {
    const r = read('<p><a href="javascript:alert(1)">js</a> <a href="https://ok.co">ok</a> <a href="mailto:a@b.co">mail</a></p>')[0];
    expect(r.marks.filter((m) => m.k === 'a').map((m) => m.v)).toEqual(['https://ok.co', 'mailto:a@b.co']);
  });
  it('bold set by style weight, cancelled by a normal weight inside', () => {
    const r = read('<p><span style="font-weight:700">bold <span style="font-weight:400">plain</span></span></p>')[0];
    expect(r.marks.map((m) => r.text.slice(m.s, m.e))).toEqual(['bold']);
  });
  it('spaces collapse and marks stay on their words', () => {
    const r = read('<p>  a  <b>  big  </b>  word </p>')[0];
    expect(r.text).toBe('a big word');
    expect(r.marks.map((m) => r.text.slice(m.s, m.e))).toEqual(['big']);
  });
  it('empty input', () => {
    expect(read('')).toEqual([]);
    expect(read('<p> </p><br>')).toEqual([]);
  });
  it('word count ignores bullets and punctuation', () => {
    // Bullet glyphs and single letters aren't words; numbers are.
    expect(clipWordCount('·  Hire two engineers, o   Backend; 1. x 42')).toBe(6);
  });
});
