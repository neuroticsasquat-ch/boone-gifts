#!/usr/bin/env bash
# Run by the shared python.yml after install, before the checks. The SQLite files in
# .github/ci/env live under ./data, which is gitignored, so a fresh checkout has none.
set -euo pipefail
mkdir -p data
