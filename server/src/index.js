import { createPool, migrate } from './db.js'
import { createApp } from './app.js'

const port = Number(process.env.PORT || 8791)
const db = createPool()
const applied = await migrate(db)
if (applied.length) console.log('[db] applied migrations:', applied.join(', '))
if (!process.env.CONTENT_ADMIN_TOKEN) console.warn('[content] CONTENT_ADMIN_TOKEN not set: content admin disabled')
createApp({ db }).listen(port, '127.0.0.1', () => console.log(`[temple-api] listening on 127.0.0.1:${port}${process.env.BASE_PATH || ''}/api`))
