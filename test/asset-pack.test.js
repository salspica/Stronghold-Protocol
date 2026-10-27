import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { resolveAssetPack } from '../server/http/assetPack.js';

const UPSTREAM = 'https://www.modelscope.cn/datasets/dmdcnm/pack-private/resolve/abc/Stronghold-Protocol-v0.3.1-assets.zip';
const CDN = 'https://cdn-lfs-cn-1.modelscope.cn/prod/lfs-objects/aa/bb/cc?auth_key=1';

async function dataDir(t, name = 'pack') {
  const dir = await mkdtemp(join(tmpdir(), 'asset-pack-test-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, 'asset-pack.json'), JSON.stringify({ url: '/asset-pack.zip', upstream: UPSTREAM.replace('/pack-private/', `/${name}/`), size: 1 }));
  return dir;
}

test('a private resolve HEAD with the owner cookie returns the signed CDN URL', async (t) => {
  const dir = await dataDir(t, 'one');
  let seen = null;
  const location = await resolveAssetPack(dir, {
    token: 'secret',
    fetch: async (url, init) => {
      seen = { url: String(url), init };
      return new Response(null, { status: 302, headers: { location: CDN } });
    },
  });
  assert.equal(location, CDN);
  assert.equal(seen.init.method, 'HEAD');
  assert.equal(seen.init.redirect, 'manual');
  assert.equal(seen.init.headers.Cookie, 'm_session_id=secret');
  assert.match(seen.url, /\/datasets\/dmdcnm\/one\/resolve\/abc\//);
});

test('no token means no upstream request', async (t) => {
  const dir = await dataDir(t, 'two');
  let called = false;
  const location = await resolveAssetPack(dir, {
    token: '',
    fetch: async () => { called = true; return new Response(null, { status: 302 }); },
  });
  assert.equal(location, null);
  assert.equal(called, false);
});

test('a redirect outside the ModelScope CDN is refused', async (t) => {
  const dir = await dataDir(t, 'three');
  const location = await resolveAssetPack(dir, {
    token: 'secret',
    fetch: async () => new Response(null, { status: 302, headers: { location: 'https://evil.example/x.zip' } }),
  });
  assert.equal(location, null);
});

test('a 404 from the private dataset is not retried into a redirect', async (t) => {
  const dir = await dataDir(t, 'four');
  let calls = 0;
  const location = await resolveAssetPack(dir, {
    token: 'secret',
    fetch: async () => { calls++; return new Response(null, { status: 404 }); },
  });
  assert.equal(location, null);
  assert.equal(calls, 1);
});
