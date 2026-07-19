#!/bin/sh
# Run once after cloning (including at the start of any AI coding session
# working on this repo) to lock in the correct git identity and enable the
# pre-commit guard in .githooks/pre-commit.
#
#   sh scripts/setup-git-identity.sh

set -e
git config user.name "Robin Singh Rajawat"
git config user.email "robinsinghrajawat@gmail.com"
git config core.hooksPath .githooks
echo "✓ Git identity set to Robin Singh Rajawat <robinsinghrajawat@gmail.com>"
echo "✓ core.hooksPath set to .githooks (pre-commit guard active)"
