// MySQL pool + forward-only SQL migrations (migrations/*.sql, recorded in schema_migrations).
import fs from 'node:fs'
import path from 'node:path'
import mysql from 'mysql2/promise'

export function createPool(env = process.env) {
  const common = { waitForConnections: true, connectionLimit: 6, enableKeepAlive: true, timezone: 'Z' }
  if (env.MYSQL_URL) return mysql.createPool({ uri: env.MYSQL_URL, ...common })
  return mysql.createPool({
    host: env.MYSQL_HOST || '127.0.0.1',
    port: Number(env.MYSQL_PORT || 3306),
    socketPath: env.MYSQL_SOCKET || undefined,
    user: env.MYSQL_USER || 'temple',
    password: env.MYSQL_PASSWORD ?? '',
    database: env.MYSQL_DATABASE || 'temple',
    ...common,
  })
}

export const MIGRATIONS_DIR = new URL('../migrations/', import.meta.url).pathname

export function splitSql(sql) {
  return sql.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n')
    .split(/;\s*(?:\n|$)/).map((s) => s.trim()).filter(Boolean)
}

export async function migrate(db, dir = MIGRATIONS_DIR) {
  await db.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    name VARCHAR(128) NOT NULL PRIMARY KEY,
    applied_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
  ) ENGINE=InnoDB`)
  const [rows] = await db.query('SELECT name FROM schema_migrations')
  const done = new Set(rows.map((r) => r.name))
  const applied = []
  for (const f of fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
    if (done.has(f)) continue
    for (const stmt of splitSql(fs.readFileSync(path.join(dir, f), 'utf8'))) await db.query(stmt)
    await db.query('INSERT INTO schema_migrations (name) VALUES (?)', [f])
    applied.push(f)
  }
  return applied
}
