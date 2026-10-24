import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';

test('runtime ConfigMaps fit ordinary oc apply annotation limits and match the deployment checksum', async () => {
  const text = await readFile(new URL('../deploy/k8s/runtime-configmap.yaml', import.meta.url), 'utf8');
  const parts = text.replace(/^#.*\n/, '').trim().split('\n---\n').map(part => JSON.parse(part));
  const deployment = await readFile(new URL('../deploy/k8s/web-deployment.yaml', import.meta.url), 'utf8');
  const buffers = [];
  for (const part of parts) {
    // Leave space for the last-applied annotation's escaping and other annotations.
    assert.ok(Buffer.byteLength(JSON.stringify(part)) < 200 * 1024);
    assert.equal(part.kind, 'ConfigMap');
    assert.ok(deployment.includes(`name: ${part.metadata.name}\n`));
    const keys = Object.keys(part.binaryData);
    assert.equal(keys.length, 1);
    assert.match(keys[0], /^runtime-\d+\.part$/);
    buffers.push(Buffer.from(part.binaryData[keys[0]], 'base64'));
  }
  const payload = Buffer.concat(buffers);
  const checksum = createHash('sha256').update(payload).digest('hex');
  assert.ok(deployment.includes(`portfolio/runtime-sha256: "${checksum}"`));
  for (const part of parts) assert.equal(part.metadata.annotations['portfolio/runtime-sha256'], checksum);
  const files = JSON.parse(gunzipSync(payload));
  for (const required of ['src/server.mjs', 'public/index.html', 'public/js/guestbook.js', 'public/images/profile.jpg', 'migrations/001-create-guestbook.sql']) assert.ok(files[required]);
  for (const path of Object.keys(files)) assert.ok(!path.includes('..') && /^(src|public|migrations)\//.test(path));
});
