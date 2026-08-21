#!/usr/bin/env python3
"""
Guards against the exact issue found and fixed on 2026-07-15: a stray literal
"<Title>" used as a plain-English placeholder in help prose got parsed by the
browser as a real opening <title> tag. <title> is a RAWTEXT element (same
category as <script>, <style>, <textarea>, <xmp>, <plaintext>) — once opened,
the browser's tokenizer stops recognizing any tags at all and just reads raw
characters until it finds a literal closing tag, wherever that happens to be.
With no nearby "</title>", it swallowed ~9,000 lines including the entire
main <script> block, corrupting it, before finally closing on an unrelated
"</title>" deep inside unrelated JS.

`node --check` cannot catch this class of bug — it only validates JS syntax
within whatever boundaries the *browser's HTML tokenizer* decides are actually
inside a <script> tag, and this bug is precisely about the tokenizer drawing
those boundaries in the wrong place. This script parses the file with
html5lib, a real WHATWG-spec-compliant parser, and checks the resulting DOM
against a handful of structural invariants that would only fail if this class
of hijack occurred somewhere in the file.

Run manually:
    python3 scripts/validate_html_structure.py

Wired into .githooks/pre-commit to run automatically on every commit.
"""
import sys

try:
    import html5lib
except ImportError:
    print("✖ html5lib not installed. Install with:")
    print("    pip install html5lib --break-system-packages")
    sys.exit(1)

FILE = "index.html"

# Any single real inline <script> block in this app is expected to be large
# (tens of KB at minimum for the small early-boot scripts, well over 1MB for
# the main app script). A RAWTEXT hijack truncates whichever script it
# interrupts, so an unexpectedly short "main" script is the clearest signal.
MIN_MAIN_SCRIPT_CHARS = 1_000_000

# RAWTEXT element tags (per the HTML5 spec, these consume everything after
# them as literal text until a matching close tag turns up, however far away
# that is): title, script, style, textarea, xmp, plaintext. This app has
# legitimate real <textarea> elements (code editor, task input, etc.), so
# only <title> — which should appear exactly once, the real one in <head> —
# is checked directly; <xmp>/<plaintext> are obsolete/never used here, so any
# appearance at all is suspicious.
MAX_TITLE_ELEMENTS = 1
UNEXPECTED_RAWTEXT_TAGS = ("xmp", "plaintext")


def fail(msg):
    print(f"✖ {msg}")
    return False


def main():
    with open(FILE, "rb") as f:
        content = f.read()

    doc = html5lib.parse(content, namespaceHTMLElements=False)

    ok = True

    # 1. No orphaned/duplicate <title> elements.
    titles = [el for el in doc.iter() if el.tag == "title"]
    if len(titles) > MAX_TITLE_ELEMENTS:
        ok = fail(
            f"Found {len(titles)} <title> elements, expected at most "
            f"{MAX_TITLE_ELEMENTS}. A stray literal '<title'/'<Title>' "
            f"(case-insensitive) somewhere in body text is the usual cause — "
            f"search for it and escape as &lt;Title&gt;."
        )

    # 2. No unexpected RAWTEXT elements at all.
    for tag in UNEXPECTED_RAWTEXT_TAGS:
        hits = [el for el in doc.iter() if el.tag == tag]
        if hits:
            ok = fail(
                f"Found {len(hits)} unexpected <{tag}> element(s). A literal "
                f"'<{tag}' in body text will hijack parsing the same way the "
                f"<Title> incident did — search for it and escape the angle "
                f"brackets."
            )

    # 3. The main app script must be intact, not truncated by a hijack.
    scripts = [el for el in doc.iter() if el.tag == "script"]
    lengths = [len(s.text) if s.text else 0 for s in scripts]
    if not any(length >= MIN_MAIN_SCRIPT_CHARS for length in lengths):
        ok = fail(
            f"No <script> block reached the expected minimum size "
            f"({MIN_MAIN_SCRIPT_CHARS:,} chars) — largest found was "
            f"{max(lengths) if lengths else 0:,}. The main script is likely "
            f"truncated by a RAWTEXT hijack (see <title> check above) or a "
            f"literal '<script'/'</script' inside a JS string/comment/regex."
        )

    # 4. No broken, unevaluated template-literal artifacts leaked into the
    #    DOM as literal text (the direct symptom this bug produces).
    suspects = []
    for el in doc.iter():
        for attr_val in el.attrib.values():
            if "${" in attr_val:
                suspects.append((el.tag, attr_val[:80]))
    if suspects:
        ok = fail(
            f"Found {len(suspects)} element attribute(s) containing literal "
            f"'${{...}}' — an un-interpolated JS template literal leaked into "
            f"the DOM as plain text. Example: <{suspects[0][0]} ...="
            f"{suspects[0][1]!r}>. This is the direct symptom of a RAWTEXT "
            f"hijack corrupting a <script> block."
        )

    if ok:
        print(f"✓ HTML structure OK — {len(scripts)} <script> elements, "
              f"main script {max(lengths):,} chars, {len(titles)} <title>, "
              f"no leaked template literals.")
        return 0
    else:
        print("\nRun with real browser devtools open on a fresh (cache-busted) "
              "load to confirm before assuming this is a false positive.")
        return 1


if __name__ == "__main__":
    sys.exit(main())
