import { describe, it, expect } from 'vitest';
import { buildDraft, cleanDrawioXml, toolSendDocument, INBOX_SCOPE, ASSISTANT_NAME } from '../src/mcpSend';
import type { FirestoreReader, FirestoreWriter } from '../src/firestoreRest';

const NOW = 1_800_000_000_000;
const MD = `# Kickoff notes

## Decisions
- Use SSO via Entra [agreed]
- Migrate CRM data [follow-up]

  Owner to confirm the cut-over window.

## Systems
| System | Owner |
| --- | --- |
| SAP | Ana |
| <img src=x onerror=alert(1)> | Bo |

- [ ] Send the deck
`;

describe('building a draft', () => {
  it('turns Markdown into Sakura rows: headings, notes, tables, checkboxes, statuses, Draft', () => {
    const r = buildDraft({ title: '', markdown: MD }, NOW);
    if (typeof r === 'string') throw new Error(r);
    expect(r.title).toBe('Kickoff notes');
    expect(r.doc.docStatus).toBe('draft');
    const nodes = r.doc.nodes as Array<Record<string, unknown>>;
    expect(nodes.map((n) => n.text)).toEqual(['Decisions', 'Use SSO via Entra', 'Migrate CRM data', 'Systems', 'Send the deck']);
    expect(nodes[1].marker).toBe('confirmed');
    expect(nodes[2].marker).toBe('followup');
    expect(String(nodes[2].note)).toContain('cut-over window');
    expect(nodes[2].parentId).toBe(1);
    const table = String((nodes[3].tables as string[])[0]);
    expect(table).toContain('<td>SAP</td>');
    expect(table).not.toContain('<img'); // escaped, never markup
    expect(table).toContain('<td></td><td>Bo</td>'); // raw HTML is dropped by the import, never kept
    expect(nodes[4].isCheckbox).toBe(true);
    expect(r.stats).toEqual({ rows: 5, tables: 1, diagrams: 0, followUps: 1 });
  });
  it('places a diagram under the row it names; refuses anything that is not draw.io', () => {
    const xml = '<mxfile><diagram><mxGraphModel><root><mxCell id="0"/></root></mxGraphModel></diagram></mxfile>';
    const r = buildDraft({ title: 'T', markdown: MD, diagrams: [{ title: 'Flow', xml, under: 'systems' }, { title: 'Bad', xml: '<html><script>x</script></html>' }] }, NOW);
    if (typeof r === 'string') throw new Error(r);
    const d = (r.doc.diagrams as Array<Record<string, unknown>>);
    expect(d).toHaveLength(1);
    expect(d[0].anchorNodeId).toBe(4);
    expect(r.notes.join(' ')).toMatch(/Diagram 2 \("Bad"\) was left out/);
  });
  it('cleans draw.io XML', () => {
    expect(cleanDrawioXml('<mxfile><script>alert(1)</script><mxCell value="a" onclick="x()" link="javascript:alert(1)"/></mxfile>'))
      .toBe('<mxfile><mxCell value="a" link="#"/></mxfile>');
    expect(cleanDrawioXml('<!DOCTYPE x [<!ENTITY e "y">]><mxfile/>')).toBeNull();
    expect(cleanDrawioXml('<mxfile>' + 'a'.repeat(200_001) + '</mxfile>')).toBeNull();
    expect(cleanDrawioXml('<svg/>')).toBeNull();
  });
  it('needs content', () => {
    expect(buildDraft({ title: 'x', markdown: '  ' }, NOW)).toMatch(/Give the document/);
  });
});

function fakes(existing: Record<string, Record<string, unknown>> = {}) {
  const created: Array<[string, Record<string, unknown>]> = [];
  const removed: string[] = [];
  const read: FirestoreReader = {
    async get() { throw new Error('a replaced draft is checked by its sender only, never downloaded whole'); },
    async list() { return []; },
    async batchGet(paths, fields) { expect(fields).toEqual(['fromUid']); return paths.filter((p) => existing[p]).map((p) => [p.split('/').pop() as string, existing[p]]); }
  };
  const write: FirestoreWriter = {
    async create(c, f) { created.push([c, f]); return c.includes('copies') ? 'copy' + created.length : 'note' + created.length; },
    async remove(p) { removed.push(p); },
    async findIds(c, field, v) { return field === 'docId' && v === 'old1' ? ['n9'] : []; }
  };
  return { read, write, created, removed };
}

describe('sending a draft', () => {
  it('without the permission it says how to grant it, and writes nothing', async () => {
    const f = fakes();
    const r = await toolSendDocument(f.read, f.write, 'u1', { title: 'x', markdown: '- a' }, ['notes:read']);
    expect(r.isError).toBe(true);
    expect(r.text).toMatch(/can only read/);
    expect(f.created).toHaveLength(0);
  });
  it('puts the draft and a notice in your own inbox, marked as sent by you', async () => {
    const f = fakes();
    const r = await toolSendDocument(f.read, f.write, 'u1', { title: 'Kickoff', markdown: MD }, ['notes:read', INBOX_SCOPE], () => NOW);
    expect(r.isError).toBe(false);
    expect(f.created.map(([c]) => c)).toEqual(['copies/u1/items', 'notifications/u1/items']);
    expect(f.created[0][1]).toMatchObject({ fromUid: 'u1', fromDisplayName: ASSISTANT_NAME, title: 'Kickoff', createdAt: NOW });
    expect(Object.keys(f.created[0][1]).sort()).toEqual(['createdAt', 'doc', 'fromDisplayName', 'fromEmail', 'fromUid', 'title']); // the rules' allowed keys
    expect(f.created[1][1]).toMatchObject({ type: 'doc_copy', fromUid: 'u1', docId: 'copy1', read: false });
    expect(Object.keys(f.created[1][1]).sort()).toEqual(['createdAt', 'docId', 'docTitle', 'fromDisplayName', 'fromEmail', 'fromUid', 'read', 'type']);
    expect(r.text).toMatch(/replaces: "copy1"/);
    expect(f.removed).toEqual([]);
  });
  it('replaces a pending draft it sent, never someone else\'s copy', async () => {
    const mine = fakes({ 'copies/u1/items/old1': { fromUid: 'u1' } });
    const r = await toolSendDocument(mine.read, mine.write, 'u1', { title: 'v2', markdown: '- a', replaces: 'old1' }, [INBOX_SCOPE], () => NOW);
    expect(r.isError).toBe(false);
    expect([...mine.removed].sort()).toEqual(['copies/u1/items/old1', 'notifications/u1/items/n9']);
    const theirs = fakes({ 'copies/u1/items/old1': { fromUid: 'colleague' } });
    const r2 = await toolSendDocument(theirs.read, theirs.write, 'u1', { title: 'v2', markdown: '- a', replaces: 'old1' }, [INBOX_SCOPE], () => NOW);
    expect(r2.isError).toBe(true);
    expect(theirs.created).toHaveLength(0);
    expect(theirs.removed).toHaveLength(0);
  });
});

describe('numbered lists in a draft', () => {
  it('a 1. 2. list, or numbers typed into bullets, becomes a numbered list', () => {
    const r = buildDraft({ title: 'T', markdown: '## Steps\n\n1. Create\n2. Confirm\n\n## Flow\n\n- 1. Read\n- 2. Write\n' }, NOW);
    if (typeof r === 'string') throw new Error(r);
    const nodes = r.doc.nodes as Array<Record<string, unknown>>;
    expect(nodes.map((n) => [n.text, !!n.numbered])).toEqual([
      ['Steps', true], ['Create', false], ['Confirm', false], ['Flow', true], ['Read', false], ['Write', false],
    ]);
  });
});

