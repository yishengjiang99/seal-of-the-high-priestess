#!/usr/bin/env bash
# Deploy the Temple of the High Priestess support/privacy/terms pages to https://grepawk.com/high-priestess/
# (static, /var/www/high-priestess; nginx location added by server/deploy/deploy-grepawk.sh).
# Env: HP_DEPLOY_HOST (default root@grepawk.com; use root@<ip> if DNS is wrong), CURL_OPTS (e.g. "--resolve grepawk.com:443:<ip>")
# Nothing here may be named api* (that prefix belongs to the Node service).
set -euo pipefail
HOST="${HP_DEPLOY_HOST:-root@grepawk.com}"
DEST=/var/www/high-priestess
root="$(cd "$(dirname "$0")/../.." && pwd)"
src="$root/docs/legal/high-priestess"
if ls "$src" | grep -qi '^api'; then echo "refusing: name collides with /high-priestess/api" >&2; exit 1; fi
ssh -o BatchMode=yes "$HOST" "mkdir -p '$DEST'"
rsync -rlptz --delete --chmod=D755,F644 "$src/" "$HOST:$DEST/"
for p in "" support admin privacy terms privacy.html api/health; do
  printf '%s  %s\n' "$(curl -s ${CURL_OPTS:-} -o /dev/null -w '%{http_code} %{content_type}' "https://grepawk.com/high-priestess/$p")" "/high-priestess/$p"
done
