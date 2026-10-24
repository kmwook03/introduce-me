import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';
import { readConfig } from '../src/config.js';

const silent = { error() {}, warn() {} };

export async function listen(app) {
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
  return { url: `http://127.0.0.1:${server.address().port}`, close: () => new Promise(resolve => server.close(resolve)) };
}

test('configuration rejects missing credentials, invalid ports, and broad proxy trust', () => {
  assert.throws(() => readConfig({}), /DB_PASSWORD/);
  for (const PORT of ['0', '-1', '65536', '4.2', 'bad']) assert.throws(() => readConfig({ DB_PASSWORD: 'test', PORT }));
  for (const TRUST_PROXY of ['true', '1', 'loopback', '999.1.1.1', '10.0.0.0/33', '::1/129', '10.0.0.1/-1']) assert.throws(() => readConfig({ DB_PASSWORD: 'test', TRUST_PROXY }));
  assert.equal(readConfig({ DB_PASSWORD: 'test' }).trustProxy, false);
  assert.deepEqual(readConfig({ DB_PASSWORD: 'test', TRUST_PROXY: '10.0.0.0/24, ::1' }).trustProxy, ['10.0.0.0/24', '::1']);
});

test('static pages and liveness survive DB outage; readiness and API return 503', async () => {
  let queries = 0;
  const pool = { async query() { queries++; throw new Error('private database details'); } };
  const state = { ready: false };
  const server = await listen(createApp({ pool, state, logger: silent }));
  try {
    assert.equal((await fetch(`${server.url}/health/live`)).status, 200);
    const page = await fetch(server.url);
    assert.equal(page.status, 200);
    assert.match(await page.text(), /guestbook-form/);
    assert.equal(queries, 0);
    for (const path of ['/health/ready', '/api/guestbook']) {
      const response = await fetch(server.url + path);
      assert.equal(response.status, 503);
      assert.equal((await response.json()).error.code, 'DB_UNAVAILABLE');
    }
    state.ready = true;
    for (const path of ['/health/ready', '/api/guestbook']) {
      const response = await fetch(server.url + path);
      assert.equal(response.status, 503);
      assert.doesNotMatch(await response.text(), /private database details/);
    }
    state.stopping = true;
    assert.equal((await fetch(`${server.url}/health/ready`)).status, 503);
  } finally { await server.close(); }
});

test('write rate limit ignores forged forwarded headers when proxy is untrusted', async () => {
  const pool = { async query(_sql, values) { return { rows: [{ id: '1', name: values[0], message: values[1] }] }; } };
  const server = await listen(createApp({ pool, state: { ready: true }, rateLimit: { writeLimit: 2 }, logger: silent }));
  try {
    for (let i = 0; i < 3; i++) {
      const response = await fetch(server.url + '/api/guestbook', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': `192.0.2.${i + 1}` },
        body: JSON.stringify({ name: '방문자', message: '안녕하세요' }),
      });
      assert.equal(response.status, i < 2 ? 201 : 429);
      if (i === 2) { assert.ok(response.headers.get('retry-after')); assert.equal((await response.json()).error.code, 'RATE_LIMITED'); }
    }
  } finally { await server.close(); }
});
