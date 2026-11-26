# Markdown import and export — spec

Status: **built (2026-11-19)**. Owner decisions on review: build what's standard; one file at a time; Share shows one **Export as** group (PDF, Markdown, OPML), as Google Docs/Notion/Bear do, as a labelled group rather than a submenu so each format is one tap on a phone.

## Why

Owner, 2026-11-19: the biggest adoption risk is switching cost, and Markdown is what outliners and
note apps in this category import and export (Workflowy, Dynalist, Logseq, Obsidian, Notion). Today
Sakura imports only OPML, and its exports (PDF, OPML, the Download all data backup) aren't something
a person opens in another notes app. Goal: **simple and robust**, nothing beyond what that needs.
Word/OneNote are handled by checking paste afterwards, not by file import (outliners don't import
those).

## Scope

In:
- **Import a `.md` file** as a new document: File Explorer **+ → Import (.md, .opml)…**, or drop a
  `.md` file on the File Explorer or the page (same places OPML works today). One file = one new
  document; it never merges into the open one.
- **Export the open document as `.md`**: **Share → Export as → Markdown**, with PDF and OPML in the same group.

Out (on purpose):
- Importing a folder or zip (an Obsidian vault, a Notion export with sub-pages and assets). People
  import one page at a time; a folder import is a different, bigger feature.
- Pictures inside the `.md` file. Sakura stores pictures inside the document, so a plain `.md` can't
  carry them without a zip of asset files.
- Markdown as an editing mode, or live sync with a Markdown folder.

## Dialect

CommonMark plus the two GitHub extensions everyone produces: **tables** and **task lists**
(`- [ ]`). Anything else (footnotes, math, wiki links, HTML blocks) imports as its plain text.

## Import: Markdown → rows

| Markdown | Becomes |
|---|---|
| `# Title` as the file's first line | the document's title (not a row) |
| otherwise, file name | the document's title |
| `## Heading` … `######` | a row with a heading style; each heading level nests under the one above it (H2 at the top, H3 inside it, …) |
| `- item`, `* item`, `+ item`, `1. item` | a row, nested by indentation, under the heading it follows; `1.` items make their parent row a numbered list (2026-11-26), and numbers typed into the words ("1. Step") are moved off them the same way. Export writes a numbered list's rows as `1.` items |
| `- [ ] item` / `- [x] item` | a To-Do (checkbox) row, unchecked / checked |
| prose right under a heading (before any list) | that heading's note |
| any other paragraph that isn't a list item | a row under the current heading |
| text indented under a list item (more lines of the same item) | that row's note |
| a fenced code block (` ``` `) | a note on the row above, kept as monospaced text |
| a GitHub table | a table on the row above (or on a new row if there is none) |
| `**bold**`, `*italic*`, `~~strike~~`, `[text](https://…)` | the row's own bold, italic, strikethrough and link formatting |
| `` `code` `` | its text, without the backticks (rows have no code formatting) |
| `![alt](url)` | a link with the alt text (pictures aren't fetched) |
| `> quote` | a row with the quoted text |
| `---`, front matter (`---` block at the top), HTML comments | skipped |
| raw HTML | its text only; nothing is rendered |

Heading styles size by nesting: a top-level heading is Heading 1, the next level Heading 2, deeper
ones Heading 3 (the nesting still follows the real level).

Robustness rules:
- Tabs or 2/4-space indentation, CRLF line endings and a byte-order mark all work.
- Everything goes through the same cleaning as OPML import (`sakuraSanitizeRichHtml`); no HTML from
  the file is ever rendered.
- A file that yields no rows says so and creates nothing. Files over 5 MB are refused with a
  message (a long Markdown note is well under 1 MB).
- After import, a toast says how many rows were added, and, if anything was turned into plain
  text (math, footnotes, HTML), says that too.

## Export: rows → Markdown

| Sakura | Markdown |
|---|---|
| document title | `# Title` |
| a top-level row with a heading style, and heading rows directly inside it | `##`, `###`, … by depth (up to `######`) |
| every other row | a `- ` list item, indented two spaces per level under its nearest heading |
| To-Do row | `- [ ]` or `- [x]` |
| note | paragraphs indented under the row's list item (under a heading: right after it); note lists as `• ` lines so they don't read back as rows; code as a fenced block |
| table | a GitHub table under the row; merged or multi-line cells are flattened to one line |
| bold, italic, strikethrough, web link | `**…**`, `*…*`, `~~…~~`, `[…](…)` |
| underline, highlight, text colour | dropped (the words stay) |
| link to another row | its text |
| picture | `*[Picture: caption]*` |
| chart, KPI card, status board, API request | their table, as a GitHub table (they are displays of a row's table) |
| diagram, thread, remark | `*[Diagram: title]*` etc. — one line naming what's there |
| rows marked "not exported" | left out, as in OPML and PDF |

Characters that Markdown would read as formatting (`*`, `_`, `` ` ``, `[`, `#` at line start, …)
are escaped, so the words come out exactly as typed.

The export toast says what couldn't be included, e.g. "Exported. 2 diagrams and 1 picture are
listed by name only — Download PDF keeps them." Download all data remains the complete backup.

## Round trip

Export then import gives back the same rows, nesting, headings, To-Dos, notes, tables, bold,
italic, strikethrough and links. Not the dropped formatting (underline, highlight, colour), and not
pictures or objects. This is checked by tests.

## How it's built (for the robustness bar)

- Two pure modules, `web/src/utils/markdownImport.ts` and `markdownExport.ts`, with no DOM access,
  generated into `index.html` like the other `src/` modules. No new library (no third-party code,
  nothing loaded from another site).
- Unit tests: every row of both tables above, the robustness rules, round trips, and fixture files
  shaped like real exports from Obsidian, Notion (single page), Logseq and GitHub READMEs, plus
  malformed input (unclosed code fence, ragged table, mixed indentation) that must import without
  losing text.
- E2E: import a file through the File Explorer and by dropping it; export through Share and check
  the downloaded file.
- Docs: feature reference, help panel, README.

