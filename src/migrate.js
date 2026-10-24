import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';

const migrationDir = new URL('../migrations/', import.meta.url);

export async function migrate(pool) {
  const files = (await readdir(migrationDir)).filter(name => /^\d+.*\.sql$/.test(name)).sort();
  const client = await pool.connect();
  let committed = false;
  try {
    await client.query('BEGIN');
    await client.query("SET LOCAL lock_timeout = '3s'");
    await client.query('SELECT pg_advisory_xact_lock(202255521)');
    await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY, checksum TEXT NOT NULL, applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);
    for (const name of files) {
      const sql = await readFile(new URL(name, migrationDir), 'utf8');
      const checksum = createHash('sha256').update(sql).digest('hex');
      const existing = await client.query('SELECT checksum FROM schema_migrations WHERE name = $1', [name]);
      if (existing.rowCount) {
        if (existing.rows[0].checksum !== checksum) throw new Error('Applied migration checksum mismatch');
        continue;
      }
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (name, checksum) VALUES ($1, $2)', [name, checksum]);
    }
    await client.query('COMMIT');
    committed = true;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    // Discard a connection after a failed transaction or query timeout.
    client.release(!committed);
  }
}

export async function prepareDatabase(pool, { timeoutMs = 90000, signal, logger = console } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (true) {
    signal?.throwIfAborted();
    try {
      await migrate(pool);
      return;
    } catch (error) {
      const retryable = ['ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN', 'ETIMEDOUT', 'ECONNRESET', '57P03', '53300', '55P03', '57014'].includes(error.code)
        || error.code?.startsWith('08') || /timeout|Connection terminated/i.test(error.message);
      if (!retryable || Date.now() >= deadline) throw error;
      logger.warn({ event: 'db_startup_retry', code: error.code ?? 'DB_TIMEOUT' });
      await delay(Math.min(1000, Math.max(1, deadline - Date.now())), undefined, { signal });
    }
  }
}
