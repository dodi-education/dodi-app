#!/usr/bin/env bash
# Loads the Gemini key from key.env (gitignored) and runs the harness.
# Usage: ./run.sh [--mode=immediate|prompt-suppress|defer] [--gen-ms=3500] [...]
set -euo pipefail
cd "$(dirname "$0")"

if [[ -f key.env ]]; then set -a; . ./key.env; set +a; fi
if [[ -z "${GEMINI_API_KEY:-}" ]]; then
  echo "GEMINI_API_KEY not set. Put it in $(pwd)/key.env :"
  echo "  GEMINI_API_KEY=AIza..."
  exit 2
fi

MODE="${1:---mode=immediate}"
node harness.mjs "$MODE" --out="run-$(echo "$MODE" | sed 's/[^a-zA-Z0-9]//g')" "${@:2}"
