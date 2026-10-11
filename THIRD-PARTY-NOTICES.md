# Third-Party Notices

Sakura is all-rights-reserved (see [LICENSE](LICENSE)), but it relies on a
third-party open-source project for an optional feature: draw.io, embedded
for diagram editing — see its entry below. (Earlier versions also loaded
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
