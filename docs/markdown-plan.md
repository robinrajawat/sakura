# Markdown import and export — spec

Status: **draft for owner review (2026-11-19). Nothing is built yet.**

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
- **Export the open document as `.md`**: **Share → Export Markdown (.md)**, next to Export (.opml).

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
| `- item`, `* item`, `+ item`, `1. item` | a row, nested by indentation, under the heading it follows |
| `- [ ] item` / `- [x] item` | a To-Do (checkbox) row, unchecked / checked |
| a paragraph that isn't a list item | a row under the current heading |
| text indented under a list item (more lines of the same item) | that row's note |
| a fenced code block (` ``` `) | a note on the row above, kept as monospaced text |
| a GitHub table | a table on the row above (or on a new row if there is none) |
| `**bold**`, `*italic*`, `~~strike~~`, `[text](https://…)` | the row's own bold, italic, strikethrough and link formatting |
| `` `code` `` | its text, without the backticks (rows have no code formatting) |
| `![alt](url)` | a link with the alt text (pictures aren't fetched) |
| `> quote` | a row with the quoted text |
| `---`, front matter (`---` block at the top), HTML comments | skipped |
| raw HTML | its text only; nothing is rendered |

Heading styles: Sakura rows have three heading sizes, so H2→Heading 1, H3→Heading 2, H4 and
deeper→Heading 3 (the nesting still follows the real level).

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
| note | indented lines under the row's list item (the standard "more lines of the same item") |
| table | a GitHub table under the row; merged or multi-line cells are flattened to one line |
| bold, italic, strikethrough, web link | `**…**`, `*…*`, `~~…~~`, `[…](…)` |
| underline, highlight, text colour | dropped (the words stay) |
| link to another row | its text |
| picture | `*[Picture: caption]*` |
| diagram, chart, KPI card, status board, thread, API request | `*[Diagram: title]*` etc. — one line naming what's there |
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

## Open questions for the owner

1. Menu wording: **Share → Export Markdown (.md)** and **Export OPML (.opml)** (renaming today's
   "Export"), or keep "Export" for OPML and add "Export Markdown"?
2. Is "one file at a time, no folders or zips" right for now?
