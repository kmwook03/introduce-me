import { isIP } from 'node:net';

function integer(env, name, fallback, min, max) {
  const raw = env[name] ?? String(fallback);
  const value = Number(raw);
  if (!/^\d+$/.test(raw) || !Number.isSafeInteger(value) || value < min || value > max) {
    throw new Error(`Invalid ${name}`);
  }
  return value;
}

export function readConfig(env = process.env) {
  const required = (name, fallback) => {
    const value = env[name] ?? fallback;
    if (typeof value !== 'string' || !value.trim() || value.includes('\0')) throw new Error(`Invalid ${name}`);
    return value;
  };
  const proxy = env.TRUST_PROXY ?? 'false';
  const validProxy = value => {
    const parts = value.trim().split('/');
    const family = isIP(parts[0]);
    return family !== 0 && parts.length <= 2 && (parts.length === 1 ||
      /^\d+$/.test(parts[1]) && Number(parts[1]) <= (family === 4 ? 32 : 128));
  };
  if (proxy !== 'false' && !proxy.split(',').every(validProxy)) {
    throw new Error('TRUST_PROXY must be false or explicit router IPs/CIDRs');
  }
  return {
    port: integer(env, 'PORT', 8080, 1, 65535),
    db: {
      host: required('DB_HOST', '127.0.0.1'),
      port: integer(env, 'DB_PORT', 5432, 1, 65535),
      database: required('DB_NAME', 'portfolio'),
      user: required('DB_USER', 'portfolio'),
      password: required('DB_PASSWORD'),
    },
    startupTimeoutMs: integer(env, 'DB_STARTUP_TIMEOUT_MS', 90000, 1000, 300000),
    trustProxy: proxy === 'false' ? false : proxy.split(',').map(value => value.trim()),
  };
}
