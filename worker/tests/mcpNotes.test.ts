import { describe, it, expect } from 'vitest';
import { parseHtmlFragment, htmlToText, findFirst } from '../src/htmlTree';
import { decodeFields } from '../src/firestoreRest';
import { buildDocList, documentToMarkdown, searchDocument, folderPath, toolGetDocument, toolSearch, toolListDocuments } from '../src/mcpNotes';
import type { FirestoreReader } from '../src/firestoreRest';

describe('htmlTree', () => {
  it('reads elements, text, entities and void tags', () => {
    const root = parseHtmlFragment('<p>A &amp; <b>B</b><br>C&nbsp;&#x41;</p><script>x</script>');
    expect(root.childNodes).toHaveLength(1);
    const p = root.childNodes[0];
    expect(p.nodeName).toBe('P');
    expect(p.textContent).toBe('A & BC A');
    expect(p.childNodes.map((c) => c.nodeName)).toEqual(['#text', 'B', 'BR', '#text']);
  });
  it('finds a table and keeps unclosed tags inside their parent', () => {
    const t = findFirst(parseHtmlFragment('<div><table><tr><td>1<td>2</tr></table></div>'), 'TABLE');
    expect(t?.nodeName).toBe('TABLE');
  });
  it('htmlToText keeps lines apart', () => {
    expect(htmlToText('<p>One</p><p>Two <i>three</i></p>')).toBe('One\nTwo three');
  });
});

describe('firestore values', () => {
  it('decodes typed JSON', () => {
    expect(decodeFields({ a: { stringValue: 'x' }, n: { integerValue: '3' }, l: { arrayValue: { values: [{ booleanValue: true }, { mapValue: { fields: { k: { nullValue: null } } } }] } }, e: { arrayValue: {} } }))
      .toEqual({ a: 'x', n: 3, l: [true, { k: null }], e: [] });
  });
});

const folders = [{ id: 'f1', name: 'Work' }, { id: 'f2', name: 'Clients', parentId: 'f1' }];
const index = [
  { id: 'd1', title: 'Auth design', updatedAt: 2000 },
  { id: 'd2', title: 'Old', updatedAt: 3000, trashedAt: 3100 },
  { id: 'd3', title: '', updatedAt: 1000 },
  { id: 'd4', title: 'Gone', updatedAt: 4000 }
];
const doc1 = {
  title: 'Auth design', author: 'Robin', docStatus: 'review', updatedAt: 2000,
  nodes: [
    { id: 1, text: 'Decisions', depth: 0, styles: { heading: 1 } },
    { id: 2, text: 'Use OAuth 2.1 with PKCE', depth: 1, marker: 'confirmed', note: '<p>Because the <b>MCP spec</b> asks for it</p>', tables: ['<table><tr><th>A</th><th>B</th></tr><tr><td>1</td><td>2</td></tr></table>'], images: [{ src: 'data:x', caption: 'Flow' }] },
    { id: 3, text: 'Hidden', depth: 1, noExport: true }
  ],
  remarks: [{ id: 'r1', anchorNodeId: 2, person: 'Ana', text: '<p>What about refresh tokens?</p>' }],
  diagrams: [{ id: 'g1', title: 'Sequence', anchorNodeId: 2 }]
};

describe('mcpNotes', () => {
  it('folder paths and the document list leave out Trash and deleted documents', () => {
    expect(folderPath('f2', folders)).toBe('Work › Clients');
    const list = buildDocList(index, folders, { d1: 'f2' }, new Set(['d4']));
    expect(list.map((d) => d.id)).toEqual(['d1', 'd3']);
    expect(list[0]).toEqual({ id: 'd1', title: 'Auth design', folder: 'Work › Clients', updated: new Date(2000).toISOString() });
    expect(list[1].title).toBe('Untitled');
  });

  it('a document reads as Markdown with notes, tables, status, threads and named pictures', () => {
    const md = documentToMarkdown(doc1);
    expect(md).toContain('# Auth design');
    expect(md).toContain('Author: Robin · Status: Review');
    expect(md).toContain('## Decisions');
    expect(md).toContain('- Use OAuth 2.1 with PKCE');
    expect(md).toContain('Because the **MCP** **spec** asks for it');
    expect(md).toContain('| A | B |');
    expect(md).toContain('Status: Agreed');
    expect(md).toContain('Picture: Flow');
    expect(md).toContain('Diagram: Sequence');
    expect(md).toContain('Thread (Ana): What about refresh tokens?');
    expect(md).not.toContain('Hidden');
  });

  it('search finds words across rows, notes and threads, with the rows above', () => {
    const entry = { id: 'd1', title: 'Auth design', folder: '', updated: '' };
    expect(searchDocument(entry, doc1, 'pkce oauth')?.matches).toEqual(['Decisions › Use OAuth 2.1 with PKCE']);
    expect(searchDocument(entry, doc1, 'refresh tokens')?.matches[0]).toMatch(/^Decisions › Use OAuth 2.1 with PKCE — .*refresh tokens/);
    expect(searchDocument(entry, doc1, 'design')?.matches).toEqual([]);
    expect(searchDocument(entry, doc1, 'nowhere')).toBeNull();
  });

  const fakeDb: FirestoreReader = {
    async get(path) {
      if (path === 'users/u1/meta/docsIndex') return { value: index };
      if (path === 'users/u1/meta/folders') return { value: folders };
      if (path === 'users/u1/meta/docFolderMap') return { value: {} };
      if (path === 'users/u1/docs/d1') return doc1;
      if (path === 'users/u1/docs/d2') return { title: 'Old', nodes: [{ id: 1, text: 'OAuth in trash', depth: 0 }] };
      return null;
    },
    async list(path) {
      if (path === 'users/u1/deletedDocs') return [['d4', {}]];
      if (path === 'users/u1/docs') return [['d1', doc1], ['d2', { title: 'Old', nodes: [{ id: 1, text: 'OAuth in trash', depth: 0 }] }]];
      return [];
    }
  };

  it('tools read only listed documents', async () => {
    expect(JSON.parse(await toolListDocuments(fakeDb, 'u1')).map((d: { id: string }) => d.id)).toEqual(['d1', 'd3']);
    expect(await toolGetDocument(fakeDb, 'u1', 'd1')).toContain('# Auth design');
    expect(await toolGetDocument(fakeDb, 'u1', 'd2')).toMatch(/No document/);
    expect(await toolGetDocument(fakeDb, 'u1', '../x')).toMatch(/Give the id/);
    const hits = JSON.parse(await toolSearch(fakeDb, 'u1', 'oauth'));
    expect(hits.map((h: { id: string }) => h.id)).toEqual(['d1']);
  });
});
