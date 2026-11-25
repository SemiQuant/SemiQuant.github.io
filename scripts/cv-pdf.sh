#!/usr/bin/env bash
# Print /cv/ to public/files/Jason-Limberis-CV.pdf with headless Chrome.
#
# Usage: scripts/cv-pdf.sh [base-url]
#   base-url  Site to print from. Default http://127.0.0.1:4321 (astro dev or
#             astro preview). For the launch PDF, run it against a production
#             build: npm run build && npx astro preview, then this script.
# Env:
#   CHROME    Path to the Chrome or Chromium binary.
#   OUT       Output file. Default public/files/Jason-Limberis-CV.pdf.
set -euo pipefail

BASE="${1:-http://127.0.0.1:4321}"
BASE="${BASE%/}"
URL="$BASE/cv/"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="${OUT:-$ROOT/public/files/Jason-Limberis-CV.pdf}"
CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"

if [ ! -x "$CHROME" ] && ! command -v "$CHROME" >/dev/null 2>&1; then
  echo "cv-pdf: Chrome not found at: $CHROME" >&2
  echo "cv-pdf: set CHROME to the Chrome or Chromium binary." >&2
  exit 1
fi

STATUS="$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 "$URL" || true)"
if [ "$STATUS" != "200" ]; then
  echo "cv-pdf: $URL is not reachable (HTTP ${STATUS:-none})." >&2
  echo "cv-pdf: start the site first (npm run dev, or npm run build && npx astro preview) or pass its base URL." >&2
  exit 1
fi

PROFILE_DIR="$(mktemp -d "${TMPDIR:-/tmp}/cv-pdf-chrome.XXXXXX")"
TMP_PDF="$PROFILE_DIR/cv.pdf"
trap 'rm -rf "$PROFILE_DIR"' EXIT

mkdir -p "$(dirname "$OUT")"

"$CHROME" \
  --headless=new \
  --disable-gpu \
  --hide-scrollbars \
  --no-first-run \
  --no-default-browser-check \
  --user-data-dir="$PROFILE_DIR/profile" \
  --no-pdf-header-footer \
  --virtual-time-budget=12000 \
  --print-to-pdf="$TMP_PDF" \
  "$URL" >/dev/null 2>&1 || true

if [ ! -s "$TMP_PDF" ]; then
  echo "cv-pdf: Chrome did not write a PDF." >&2
  exit 1
fi

mv "$TMP_PDF" "$OUT"
echo "cv-pdf: wrote $OUT from $URL"
if command -v pdfinfo >/dev/null 2>&1; then
  pdfinfo "$OUT" | grep -E '^(Pages|Page size):' || true
fi
