# Third-Party Notices

Sakura is all-rights-reserved (see [LICENSE](LICENSE)), but it relies on a
few third-party open-source projects for optional features. Three are
CDN-loaded libraries whose code runs inside Sakura's own page — none of
their source is vendored into this repository, Sakura links to the exact
pinned versions below via Subresource Integrity, but their licenses are
reproduced here regardless, since that's what each one asks for. A fourth,
draw.io, is a genuinely different relationship — see its own entry below.

---

## SheetJS (xlsx.full.min.js)

Used for: Decision Log export to `.xlsx`.

- Version: 0.18.5
- License: Apache License 2.0
- Homepage: https://sheetjs.com/
- Repository: https://github.com/SheetJS/sheetjs
- Full license text: https://www.apache.org/licenses/LICENSE-2.0

Copyright SheetJS LLC and contributors.

## mammoth.js (mammoth.browser.min.js)

Used for: importing `.docx` Word documents into the Pad.

- Version: 1.11.0
- License: BSD-2-Clause
- Repository: https://github.com/mwilliamson/mammoth.js

Copyright (c) Michael Williamson and contributors. Redistribution and use
in source and binary forms, with or without modification, are permitted
provided that the copyright notice, this list of conditions, and the
following disclaimer are retained. See the repository's LICENSE file for
the complete text.

## PptxGenJS (pptxgen.bundle.js)

Used for: exporting to PowerPoint `.pptx`.

- Version: 4.0.1
- License: MIT
- Homepage: https://gitbrent.github.io/PptxGenJS/
- Repository: https://github.com/gitbrent/PptxGenJS

Copyright (c) 2015-present Brent Ely and contributors. Permission is
hereby granted, free of charge, to any person obtaining a copy of this
software and associated documentation files, to deal in the software
without restriction, subject to the copyright notice and this permission
notice being included in all copies or substantial portions of the
software. See the repository's LICENSE file for the complete text.

---

## draw.io / diagrams.net (Diagrams tab, Whiteboard)

Used for: the diagram editor in the Pad's Diagrams tab, and Presenter mode's
Whiteboard.

- License: Apache License 2.0
- Homepage: https://www.drawio.com/
- Repository: https://github.com/jgraph/drawio

This one is a different relationship from the three above: Sakura embeds
`embed.diagrams.net` in an iframe and talks to it via `postMessage` — the
same integration method draw.io's own documentation recommends for
third-party embedding. No draw.io source is loaded into or bundled with
Sakura's own code; it's a link to their hosted editor, not a library
Sakura executes. Included here for accuracy and courtesy regardless.

Copyright draw.io AG / draw.io Ltd (formerly JGraph Ltd).
