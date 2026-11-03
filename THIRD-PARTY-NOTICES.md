# Third-Party Notices

Sakura is all-rights-reserved (see [LICENSE](LICENSE)), but it relies on a
third-party open-source projects: draw.io, embedded for diagram editing,
DOMPurify, which ships inside the app to clean stored HTML, and the Inter
typeface, which ships with the app — see their entries below. (Earlier versions also loaded
CDN libraries for Word import/export, PowerPoint export, and Excel export;
those features and libraries have been removed.)

---

## draw.io / diagrams.net (diagram editor)

Used for: the diagram editor for diagrams linked to outline nodes.

- License: Apache License 2.0
- Homepage: https://www.drawio.com/
- Repository: https://github.com/jgraph/drawio

Sakura embeds
`embed.diagrams.net` in an iframe and talks to it via `postMessage` — the
same integration method draw.io's own documentation recommends for
third-party embedding. No draw.io source is loaded into or bundled with
Sakura's own code; it's a link to their hosted editor, not a library
Sakura executes. Included here for accuracy and courtesy regardless.

Copyright draw.io AG / draw.io Ltd (formerly JGraph Ltd).

---

## DOMPurify (HTML sanitizer)

Used for: cleaning the HTML of notes, tables and threads before it is shown, so a document from
another account, a file or sync can't run script inside Sakura.

- Version: 3.4.17 (pinned in web/package.json; copied into web/index.html by
  web/scripts/generate-index-blocks.mjs, with its license header kept)
- License: Mozilla Public License 2.0 OR Apache License 2.0 (Sakura uses it under Apache 2.0)
- Repository: https://github.com/cure53/DOMPurify

Copyright Cure53 and other contributors.

---

## Inter (typeface)

Used for: the app's interface and document text. The variable font files
(Latin and Latin Extended subsets) ship with Sakura in `web/public/fonts/`.

- License: SIL Open Font License 1.1
- Homepage: https://rsms.me/inter/
- Repository: https://github.com/rsms/inter

Copyright 2016 The Inter Project Authors (https://github.com/rsms/inter).
