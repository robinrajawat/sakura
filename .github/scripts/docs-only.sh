#!/bin/sh
# Prints docs_only=true when every file changed between BASE and HEAD is under docs/ or ends in
# .md; otherwise docs_only=false. Anything unclear (manual run, unknown base, empty diff) runs
# the full checks. Used by .github/workflows/ci.yml.
docs_only=false
if [ "$EVENT" != "workflow_dispatch" ] && [ -n "$BASE" ] && git cat-file -e "$BASE^{commit}" 2>/dev/null; then
  files=$(git diff --name-only "$BASE...$HEAD") || files=""
  if [ -n "$files" ] && ! printf '%s\n' "$files" | grep -vE '^docs/|\.md$' >/dev/null; then
    docs_only=true
  fi
  printf '%s\n' "$files" | sed 's/^/changed: /' >&2
fi
echo "docs_only=$docs_only"
