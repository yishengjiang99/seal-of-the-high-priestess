#!/usr/bin/env bash
# One-time, on grepawk.com as root: MySQL database/user + /etc/temple.env. Idempotent; never overwrites an existing env file.
# Secrets are generated here and stay on the server (the content admin token is also stored as the
# CONTENT_ADMIN_TOKEN repo secret; see server/README.md, piped straight from ssh into `gh secret set`, never printed).
set -euo pipefail
ENV=/etc/temple.env
if [ -f "$ENV" ]; then echo "$ENV exists; leaving it alone"; exit 0; fi
DBPW=$(openssl rand -hex 24)
mysql -uroot <<SQL
CREATE DATABASE IF NOT EXISTS temple CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS 'temple'@'localhost' IDENTIFIED BY '$DBPW';
ALTER USER 'temple'@'localhost' IDENTIFIED BY '$DBPW';
GRANT ALL PRIVILEGES ON temple.* TO 'temple'@'localhost';
FLUSH PRIVILEGES;
SQL
umask 027
cat > "$ENV" <<ENVF
# Temple of the High Priestess API (temple-api.service). root:www-data 640. Created $(date -u +%FT%TZ).
MYSQL_HOST=localhost
MYSQL_SOCKET=/var/run/mysqld/mysqld.sock
MYSQL_DATABASE=temple
MYSQL_USER=temple
MYSQL_PASSWORD=$DBPW
# Bearer token for /high-priestess/api/v1/admin/content/* (content base publish + overrides).
CONTENT_ADMIN_TOKEN=$(openssl rand -hex 32)
ENVF
chown root:www-data "$ENV" && chmod 640 "$ENV"
echo "created $ENV and database temple"
