import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { createPool } from '../src/db.js';
import { readConfig } from '../src/config.js';
import { migrate } from '../src/migrate.js';
import { createApp } from '../src/app.js';

test('PostgreSQL guestbook integration', { skip: !process.env.TEST_DB_NAME && 'Set TEST_DB_NAME to a separate *_test database' }, async t => {
  const config = readConfig();
  const database = process.env.TEST_DB_NAME;
  assert.match(database, /_test$/, 'Only a database ending in _test can be used');
  assert.notEqual(database, config.db.database, 'The application database must never be used for tests');
  const schema = `test_${randomBytes(8).toString('hex')}`;
  const admin = createPool({ ...config.db, database });
  const pool = createPool({ ...config.db, database, options: `-c search_path=${schema}` });
  let server;
  let url;
  const start = async () => {
    const app = createApp({ pool, state: { ready: true }, rateLimit: { writeLimit: 1000 }, logger: { error() {} } });
    server = app.listen(0, '127.0.0.1');
    await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
    url = `http://127.0.0.1:${server.address().port}`;
  };
  const post = body => fetch(url + '/api/guestbook', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  try {
    await admin.query(`CREATE SCHEMA ${schema}`);
    await t.test('concurrent migration calls serialize and repeated migrations preserve data', async () => {
      await Promise.all([migrate(pool), migrate(pool)]);
      assert.equal((await pool.query('SELECT * FROM schema_migrations')).rowCount, 1);
    });
    await start();
    await t.test('empty list and health endpoints', async () => {
      assert.deepEqual(await (await fetch(url + '/api/guestbook')).json(), { items: [], nextCursor: null });
      for (const path of ['/health/ready', '/health/live']) assert.equal((await fetch(url + path)).status, 200);
    });
    const original = { name: "김민욱 ' 방문자", message: "한글 😀\n<script>alert(1)</script> '); DROP TABLE guestbook_entries; --" };
    let entry;
    await t.test('create preserves Korean, emoji, newlines, SQL punctuation and plain HTML text', async () => {
      const response = await post(original);
      assert.equal(response.status, 201);
      entry = await response.json();
      assert.equal(typeof entry.id, 'string');
      assert.match(entry.id, /^\d+$/);
      assert.equal(entry.name, original.name);
      assert.equal(entry.message, original.message);
      assert.ok(Number.isFinite(Date.parse(entry.created_at)));
    });
    await t.test('trims leading and trailing whitespace', async () => {
      const response = await post({ name: '  방문자\u3000', message: '\n 메시지 \t' });
      assert.equal(response.status, 201);
      const body = await response.json();
      assert.equal(body.name, '방문자'); assert.equal(body.message, '메시지');
    });
    await t.test('accepts exact code point limits for Korean and emoji', async () => {
      for (const char of ['한', '😀']) {
        const response = await post({ name: char.repeat(40), message: char.repeat(1000) });
        assert.equal(response.status, 201);
      }
    });
    await t.test('rejects missing, blank, invalid Unicode, null byte, wrong types and overlength input', async () => {
      const invalid = [null, [], {}, { name: '이름' }, { message: '메시지' },
        ...['', ' \t\n', '\u00a0\u3000\ufeff', '한'.repeat(41), '😀'.repeat(41), '\0', '\ud800', 123, {}].map(name => ({ name, message: '메시지' })),
        ...['', '\n\t', '\u00a0\u3000\ufeff', '한'.repeat(1001), '😀'.repeat(1001), '\0', '\ud800', 123].map(message => ({ name: '이름', message }))];
      for (const body of invalid) {
        const response = await post(body);
        assert.equal(response.status, 400, JSON.stringify(body)?.slice(0, 100));
        assert.ok((await response.json()).error.code);
      }
    });
    await t.test('DB enforces whitespace and length constraints independently of API', async () => {
      for (const [name, message] of [['\t\n\u3000\ufeff', 'valid'], ['valid', '\t\u00a0\u3000'], ['😀'.repeat(41), 'valid'], ['valid', '😀'.repeat(1001)]]) {
        await assert.rejects(pool.query('INSERT INTO guestbook_entries (name, message) VALUES ($1, $2)', [name, message]), e => ['23514', '22001'].includes(e.code));
      }
    });
    await t.test('rejects malformed JSON, oversized payload, wrong content type and encoding', async () => {
      for (const [body, contentType] of [['{bad', 'application/json'], ['"string"', 'application/json'], ['x'.repeat(13000), 'application/json'], ['name=test', 'text/plain'], ['{}', 'application/json; charset=iso-8859-1']]) {
        const response = await fetch(url + '/api/guestbook', { method: 'POST', headers: { 'Content-Type': contentType }, body });
        assert.equal(response.status, 400);
        assert.ok((await response.json()).error.code);
      }
    });
    await t.test('query validation rejects duplicates, unknown fields, invalid cursor and limits', async () => {
      for (const query of ['limit=0', 'limit=51', 'limit=-1', 'limit=1.5', 'limit=x', 'limit=2&limit=3', 'limit=', 'before=0', 'before=-2', 'before=1.2', 'before=9223372036854775808', 'before=1&before=2', 'before=1%3BDROP', 'unknown=1']) {
        assert.equal((await fetch(url + '/api/guestbook?' + query)).status, 400, query);
      }
    });
    await t.test('cursor pagination is descending and stable across new inserts', async () => {
      for (let i = 0; i < 23; i++) assert.equal((await post({ name: '방문자', message: `글 ${i}` })).status, 201);
      const initial = await (await fetch(url + '/api/guestbook')).json();
      assert.equal(initial.items.length, 20);
      assert.equal(initial.nextCursor, initial.items.at(-1).id);
      const extra = await (await post({ name: '새 방문자', message: '페이지 조회 사이 새 글' })).json();
      const ids = initial.items.map(row => row.id);
      let cursor = initial.nextCursor;
      while (cursor) {
        const page = await (await fetch(url + `/api/guestbook?limit=3&before=${cursor}`)).json();
        ids.push(...page.items.map(row => row.id)); cursor = page.nextCursor;
      }
      assert.equal(new Set(ids).size, ids.length);
      assert.ok(ids.includes(entry.id));
      assert.ok(!ids.includes(extra.id));
      assert.ok(ids.every((id, i) => i === 0 || BigInt(ids[i - 1]) > BigInt(id)));
      assert.equal(ids.length, Number((await pool.query('SELECT count(*) FROM guestbook_entries')).rows[0].count) - 1);
    });
    await t.test('application restart and migration rerun preserve rows', async () => {
      await new Promise(resolve => server.close(resolve));
      server = null;
      await migrate(pool);
      await start();
      const response = await fetch(url + '/api/guestbook?limit=50');
      assert.ok((await response.json()).items.some(row => row.id === entry.id));
    });
    await t.test('public paths expose only static files', async () => {
      for (const path of ['/src/server.js', '/.env', '/package.json', '/migrations/001-create-guestbook.sql']) assert.equal((await fetch(url + path)).status, 404);
    });
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    await pool.end();
    await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await admin.end();
  }
});
