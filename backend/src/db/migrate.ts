import 'dotenv/config'

import { createHash } from 'node:crypto'
import { readdir, readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { Client } from 'pg'

import { loadConfig } from '../config.js'

const migrationsDirectory = join(dirname(fileURLToPath(import.meta.url)), '../../migrations')
const migrationPattern = /^\d+_[a-z0-9_]+\.sql$/

async function migrations() {
  const filenames = await readdir(migrationsDirectory)
  return filenames.filter((filename) => migrationPattern.test(filename)).sort()
}

async function migrate() {
  const { databaseUrl } = loadConfig()
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required to run migrations.')
  }

  const client = new Client({ connectionString: databaseUrl })
  await client.connect()

  try {
    await client.query("SELECT pg_advisory_lock(hashtext('shopping_recorder_migrations'))")
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename text PRIMARY KEY,
        checksum text NOT NULL,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `)

    const applied = await client.query<{ filename: string; checksum: string }>(
      'SELECT filename, checksum FROM schema_migrations',
    )
    const appliedByFilename = new Map(applied.rows.map((migration) => [migration.filename, migration.checksum]))

    for (const filename of await migrations()) {
      const sql = await readFile(join(migrationsDirectory, filename), 'utf8')
      const checksum = createHash('sha256').update(sql).digest('hex')
      const priorChecksum = appliedByFilename.get(filename)

      if (priorChecksum && priorChecksum !== checksum) {
        throw new Error(`Migration ${filename} has changed after being applied.`)
      }
      if (priorChecksum) {
        continue
      }

      await client.query('BEGIN')
      try {
        await client.query(sql)
        await client.query('INSERT INTO schema_migrations (filename, checksum) VALUES ($1, $2)', [filename, checksum])
        await client.query('COMMIT')
        console.info(`Applied migration ${filename}`)
      } catch (error) {
        await client.query('ROLLBACK')
        throw error
      }
    }
  } finally {
    await client.query("SELECT pg_advisory_unlock(hashtext('shopping_recorder_migrations'))").catch(() => undefined)
    await client.end()
  }
}

void migrate().catch((error: unknown) => {
  console.error(error)
  process.exitCode = 1
})
