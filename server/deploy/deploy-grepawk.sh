#!/usr/bin/env bash
# Deploy the Temple of the High Priestess API to grepawk.com (https://grepawk.com/high-priestess/api/).
#   - code:    /var/www/temple-api (src/, lib/, migrations/, production node_modules)
#   - service: temple-api.service (www-data, 127.0.0.1:8791, BASE_PATH=/high-priestess); migrations run on start
#   - secrets: /etc/temple.env (root:www-data 640) - created once by --bootstrap, never overwritten
#   - nginx:   location blocks inserted once into /etc/nginx/sites-available/finalcut before "# Serve static files"
#              (backup in /root, nginx -t before reload; restored automatically if the test fails)
# Usage: server/deploy/deploy-grepawk.sh [--bootstrap]
set -euo pipefail
HOST="${TEMPLE_API_HOST:-root@grepawk.com}"
DEST=/var/www/temple-api
here="$(cd "$(dirname "$0")/.." && pwd)"
cd "$here"
mkdir -p lib && cp ../js/content-core.js lib/content-core.cjs
ssh -o BatchMode=yes "$HOST" "mkdir -p $DEST"
rsync -rlptz --delete --chmod=D755,F644 --exclude node_modules --exclude test src lib migrations package.json package-lock.json "$HOST:$DEST/"
scp -q deploy/temple-api.service "$HOST:/etc/systemd/system/temple-api.service"
scp -q deploy/nginx-temple-api.conf "$HOST:/tmp/nginx-temple-api.conf"
if [ "${1:-}" = "--bootstrap" ]; then
  scp -q deploy/bootstrap-remote.sh "$HOST:/tmp/temple-bootstrap.sh"
  ssh "$HOST" "bash /tmp/temple-bootstrap.sh && rm -f /tmp/temple-bootstrap.sh"
fi
ssh -o BatchMode=yes "$HOST" 'set -e
cd /var/www/temple-api && npm ci --omit=dev --silent
test -f /etc/temple.env || { echo "missing /etc/temple.env (run with --bootstrap)"; exit 1; }
C=/etc/nginx/sites-available/finalcut
if ! grep -q "location ^~ /high-priestess/api/" $C; then
  BAK=/root/finalcut.nginx.bak-$(date +%Y%m%d-%H%M%S)-temple-api
  cp -p $C $BAK
  python3 - "$C" <<"PY"
import sys
p = sys.argv[1]; s = open(p).read()
anchor = "    # Serve static files\n"
assert s.count(anchor) == 1, "anchor not found"
open(p, "w").write(s.replace(anchor, open("/tmp/nginx-temple-api.conf").read() + anchor))
PY
  if nginx -t; then systemctl reload nginx; else cp -p $BAK $C; echo "nginx -t failed; restored $BAK"; exit 1; fi
fi
rm -f /tmp/nginx-temple-api.conf
systemctl daemon-reload && systemctl enable -q temple-api && systemctl restart temple-api
sleep 2; systemctl is-active temple-api'
curl -fsS https://grepawk.com/high-priestess/api/health; echo
