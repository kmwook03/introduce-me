import pg from 'pg';

export function createPool(config, logger = console) {
  const pool = new pg.Pool({
    ...config,
    max: 5,
    connectionTimeoutMillis: 2000,
    idleTimeoutMillis: 10000,
    statement_timeout: 3000,
    query_timeout: 4000,
    application_name: 'personal-portfolio',
  });
  pool.on('error', error => logger.error({ event: 'db_pool_error', code: error.code ?? 'DB_ERROR' }));
  return pool;
}
