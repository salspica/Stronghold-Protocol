import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseAssetPack, createAssetPackDownload } from '../../public/js/assetPackDownload.js';

const PACK = 'https://modelscope.cn/datasets/dmdcnm/ark9ts-0.3.1-pack/resolve/abc123/Stronghold-Protocol-v0.3.1-assets.zip';

test('parseAssetPack accepts only an HTTPS ModelScope dataset file', () => {
  assert.deepEqual(parseAssetPack({ url: PACK, size: 12, version: '0.3.1' }), {
    url: PACK,
    size: 12,
    version: '0.3.1',
  });
  assert.equal(parseAssetPack({ url: PACK })?.size, 0);
  for (const url of [
    'http://modelscope.cn/datasets/a/b/resolve/master/x.zip',
    'https://example.com/datasets/a/b/resolve/master/x.zip',
    'https://evil-modelscope.cn/datasets/a/b/resolve/master/x.zip',
    'https://modelscope.cn/models/a/b/x.zip',
    'https://user:pass@modelscope.cn/datasets/a/b/x.zip',
    'not a url',
  ]) {
    assert.equal(parseAssetPack({ url }), null, url);
  }
  assert.equal(parseAssetPack(null), null);
  assert.equal(parseAssetPack([]), null);
});

function fakeOpfs() {
  const files = new Map();
  const root = {
    async getFileHandle(name, { create } = {}) {
      if (!files.has(name) && create) files.set(name, { chunks: [], aborted: false });
      const entry = files.get(name);
      return {
        async createWritable() {
          return {
            async write(part) { entry.chunks.push(new Uint8Array(part)); },
            async close() {},
            async abort() { entry.aborted = true; },
          };
        },
        async getFile() { return new Blob(entry.chunks); },
      };
    },
    async removeEntry(name) { files.delete(name); },
  };
  return {
    files,
    storage: {
      async getDirectory() { return root; },
      async estimate() { return { quota: 1024 * 1024 * 1024, usage: 0 }; },
      async persist() { return true; },
    },
  };
}

function streamResponse(bytes, status = 200) {
  return new Response(new Blob([bytes]), {
    status,
    headers: { 'content-length': String(bytes.byteLength) },
  });
}

test('streams the zip into OPFS, imports it and removes the temporary file', async () => {
  const bytes = new Uint8Array([1, 2, 3, 4, 5]);
  const { storage, files } = fakeOpfs();
  const states = [];
  const download = createAssetPackDownload({
    storage,
    fetch: async () => streamResponse(bytes),
  });
  download.subscribe((state) => states.push(state));
  let imported = null;
  const out = await download.start({ url: PACK, size: bytes.byteLength }, {
    importPack: async (file) => { imported = file; return 'imported'; },
  });
  assert.equal(out, 'imported');
  assert.equal(imported.size, bytes.byteLength);
  assert.equal(new Uint8Array(await imported.arrayBuffer()).join(','), '1,2,3,4,5');
  assert.equal(files.size, 0, 'the OPFS copy is removed after import');
  assert.equal(states.at(-1).phase, 'done');
  assert.equal(states.at(-1).bytes, bytes.byteLength);
});

test('an HTTP failure reports the error and leaves no OPFS file', async () => {
  const { storage, files } = fakeOpfs();
  const download = createAssetPackDownload({ storage, fetch: async () => streamResponse(new Uint8Array(), 403) });
  await assert.rejects(download.start({ url: PACK, size: 1 }), (err) => err.code === 'http');
  assert.equal(download.get().phase, 'error');
  assert.equal(download.get().error, 'http');
  assert.equal(files.size, 0);
});

test('an undersized body is rejected before import', async () => {
  const bytes = new Uint8Array([1, 2, 3]);
  const { storage } = fakeOpfs();
  const download = createAssetPackDownload({
    storage,
    fetch: async () => new Response(new Blob([bytes]), { headers: { 'content-length': '10' } }),
  });
  await assert.rejects(download.start({ url: PACK, size: 10 }), (err) => err.code === 'size');
  assert.equal(download.get().error, 'size');
});
