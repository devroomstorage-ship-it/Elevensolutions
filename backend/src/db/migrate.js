/**
 * Simple, dependency-free migration runner.
 *
 *   npm run migrate
 *
 * Runs every .sql file in this directory in filename order that has not yet
 * been recorded in the schema_migrations table. schema.sql is treated as the
 * baseline and is applied first if the database is empty.
 *
 * Files are matched by name: anything ending in `.sql` is a candidate.
 * `seed.sql` is skipped here (run it manually with `psql -f seed.sql`).
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { pool } = require('./index');

const DIR = __dirname;
const SKIP = new Set(['seed.sql']);

async function ensureTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename   VARCHAR(255) PRIMARY KEY,
      applied_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
}

async function alreadyApplied(client, filename) {
  const { rows } = await client.query(
    'SELECT 1 FROM schema_migrations WHERE filename = $1',
    [filename]
  );
  return rows.length > 0;
}

async function markApplied(client, filename) {
  await client.query(
    'INSERT INTO schema_migrations (filename) VALUES ($1) ON CONFLICT DO NOTHING',
    [filename]
  );
}

async function tableExists(client, tableName) {
  const { rows } = await client.query('SELECT to_regclass($1) AS table_name', [
    `public.${tableName}`,
  ]);
  return Boolean(rows[0]?.table_name);
}

async function run() {
  // schema.sql is the baseline; apply it first (and only once), then all
  // migration_*.sql files in alphabetical order. seed.sql is run manually.
  const all = fs
    .readdirSync(DIR)
    .filter((f) => f.endsWith('.sql') && !SKIP.has(f));
  const files = [];
  if (all.includes('schema.sql')) files.push('schema.sql');
  for (const f of all.filter((f) => f !== 'schema.sql').sort()) files.push(f);

  const client = await pool.connect();
  try {
    await ensureTable(client);

    // Docker Compose can initialize a fresh database with schema.sql + seed.sql
    // before the backend starts. In that case schema_migrations is empty even
    // though the baseline tables already exist. Mark schema.sql as applied so
    // the runner can safely apply only the additive migration_*.sql files.
    if (files.includes('schema.sql') && !(await alreadyApplied(client, 'schema.sql'))) {
      const baselineAlreadyPresent = await tableExists(client, 'users');
      if (baselineAlreadyPresent) {
        await markApplied(client, 'schema.sql');
        console.log('✓ baseline detected  schema.sql');
      }
    }

    for (const file of files) {
      if (await alreadyApplied(client, file)) {
        console.log(`✓ already applied   ${file}`);
        continue;
      }
      const sql = fs.readFileSync(path.join(DIR, file), 'utf8');
      console.log(`→ applying          ${file}`);
      // Each file manages its own transaction (schema.sql / migration files
      // contain BEGIN/COMMIT or standalone statements), so we run the whole
      // file as a single multi-statement query.
      await client.query(sql);
      await markApplied(client, file);
      console.log(`✓ applied           ${file}`);
    }

    console.log('\nAll migrations up to date.');
  } catch (err) {
    console.error('\nMigration failed:', err.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

run();
