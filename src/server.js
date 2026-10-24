import { readConfig } from './config.js';
import { createPool } from './db.js';
import { createApp } from './app.js';
import { prepareDatabase } from './migrate.js';

async function main() {
  const config = readConfig();
  const pool = createPool(config.db);
  const state = { ready: false, stopping: false };
  const controller = new AbortController();
  const app = createApp({ pool, state, trustProxy: config.trustProxy });
  // Start liveness immediately while database startup and migrations are still pending.
  const server = app.listen(config.port, '0.0.0.0');
  server.requestTimeout = 10000;
  server.headersTimeout = 10000;
  server.keepAliveTimeout = 5000;
  const shutdown = async (exitCode = 0) => {
    if (state.stopping) return;
    state.stopping = true;
    state.ready = false;
    controller.abort();
    const force = setTimeout(() => process.exit(exitCode || 1), 10000);
    force.unref();
    await new Promise(resolve => server.close(resolve));
    await preparation.catch(() => {});
    await pool.end();
    clearTimeout(force);
    process.exitCode = exitCode;
  };
  process.once('SIGTERM', () => void shutdown());
  process.once('SIGINT', () => void shutdown());
  server.once('error', error => {
    console.error({ event: 'listen_failed', code: error.code ?? 'LISTEN_ERROR' });
    void shutdown(1);
  });
  const preparation = prepareDatabase(pool, { timeoutMs: config.startupTimeoutMs, signal: controller.signal });
  try {
    await preparation;
    if (!state.stopping) {
      state.ready = true;
      console.info({ event: 'ready', port: config.port });
    }
  } catch (error) {
    if (!state.stopping) {
      console.error({ event: 'startup_failed', code: error.code ?? 'MIGRATION_FAILED' });
      await shutdown(1);
    }
  }
}

main().catch(() => {
  console.error({ event: 'fatal', code: 'CONFIG_OR_STARTUP_ERROR' });
  process.exitCode = 1;
});
