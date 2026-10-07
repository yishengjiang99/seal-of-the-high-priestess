#!/usr/bin/env bash
# Copy the web game into the iOS app bundle source (ios/WebBundle/Web, git-ignored).
# Ships: index.html, css/, js/, assets/ (minus reference art + store screenshots), audio/.
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
dest="$root/ios/WebBundle/Web"
rm -rf "$dest"
mkdir -p "$dest"
rsync -a --delete \
  --exclude 'lina-ref.jpg' --exclude 'screenshots/' --exclude '.DS_Store' \
  "$root/index.html" "$root/css" "$root/js" "$root/assets" "$root/audio" "$dest/"
test -f "$dest/index.html" && test -f "$dest/js/game.js" && test -f "$dest/audio/voice/index.json"
test ! -e "$dest/assets/lina-ref.jpg"
echo "web bundle: $(find "$dest" -type f | wc -l | tr -d ' ') files, $(du -sh "$dest" | cut -f1)"
