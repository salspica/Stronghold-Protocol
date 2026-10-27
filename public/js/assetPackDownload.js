// Stream an asset-pack zip from a public CDN into OPFS, then hand the local File to the importer.
//
// The zip is one large file on the host: fetch() follows the host's redirect to its signed CDN
// (that response carries Access-Control-Allow-Origin), the body is written in 8 MiB blocks, and
// the finished OPFS File is a Blob the existing openZip() reader can slice. The zip is deleted
// as soon as the import ends; the imported bytes live in Cache Storage (assetPack.js).
//
// No token or signed URL is kept here: the URL comes from /data/asset-pack.json and is a plain
// HTTPS ModelScope dataset file. A page on plain http:// (not localhost) cannot use OPFS and the
// dialog already refuses to import there.

export const ASSET_PACK_CONFIG_URL = '/data/asset-pack.json';
/** One OPFS file name; a second download replaces the first. */
export const ASSET_PACK_FILE = 'stronghold-assets-pack.zip';
const BLOCK_BYTES = 8 * 1024 * 1024;
const NOTICE_MS = 100;

/**
 * `{ version?, url, size }` from /data/asset-pack.json, or null. Only an HTTPS ModelScope dataset
 * file is accepted: a page must not be turned into an open downloader by a edited JSON.
 * @param {unknown} json
 */
export function parseAssetPack(json) {
  if (!json || typeof json !== 'object' || Array.isArray(json)) return null;
  if (typeof json.url !== 'string' || json.url.length > 4096) return null;
  const size = Number(json.size);
  const version = typeof json.version === 'string' ? json.version : null;
  // The served config normally uses this server's 302 alias, so the browser's fetch starts
  // same-origin and only the final CDN response is cross-origin.
  if (json.url === '/asset-pack.zip') {
    return { url: json.url, size: Number.isFinite(size) && size > 0 ? size : 0, version };
  }
  let url;
  try { url = new URL(json.url); } catch { return null; }
  if (url.protocol !== 'https:' || url.username || url.password || url.hash) return null;
  if (!/(^|\.)modelscope\.cn$/i.test(url.hostname)) return null;
  if (!url.pathname.startsWith('/datasets/')) return null;
  return {
    url: url.href,
    size: Number.isFinite(size) && size > 0 ? size : 0,
    version,
  };
}

/** Read and validate the served download config; throws `{ code: 'config' }` when it is unusable. */
export async function readAssetPackConfig({ fetch: doFetch = (...args) => globalThis.fetch(...args) } = {}) {
  const res = await doFetch(ASSET_PACK_CONFIG_URL, { cache: 'no-store', credentials: 'same-origin' });
  if (!res?.ok) throw Object.assign(new Error('asset pack config'), { code: 'config' });
  let json;
  try { json = await res.json(); } catch { throw Object.assign(new Error('asset pack config'), { code: 'config' }); }
  const config = parseAssetPack(json);
  if (!config) throw Object.assign(new Error('asset pack config'), { code: 'config' });
  return config;
}

const idleState = () => ({ phase: 'idle', bytes: 0, total: 0, error: null });

function errorCode(err) {
  if (err?.name === 'AbortError') return 'aborted';
  return typeof err?.code === 'string' ? err.code : 'unknown';
}

function joinChunks(chunks, size) {
  const out = new Uint8Array(size);
  let at = 0;
  for (const chunk of chunks) { out.set(chunk, at); at += chunk.byteLength; }
  return out;
}

/**
 * One cancellable download. `start(config, { importPack })` resolves to the downloaded File (or
 * whatever importPack returns) and deletes the OPFS copy afterwards. `importPack` is the existing
 * assetImport.start({ type: 'zip', data: file }) promise.
 */
export function createAssetPackDownload({
  fetch: doFetch = (...args) => globalThis.fetch(...args),
  storage = globalThis.navigator?.storage,
} = {}) {
  let state = idleState();
  let controller = null;
  let running = null;
  const listeners = new Set();
  let lastNotice = 0;

  const emit = (patch, force = false) => {
    state = { ...state, ...patch };
    const now = Date.now();
    if (!force && now - lastNotice < NOTICE_MS) return;
    lastNotice = now;
    for (const listener of listeners) listener(state);
  };

  async function quotaFor(size) {
    if (!storage?.estimate) return;
    let estimate;
    try { estimate = await storage.estimate(); } catch { return; }
    if (!estimate || !Number.isFinite(estimate.quota) || !Number.isFinite(estimate.usage)) return;
    const free = estimate.quota - estimate.usage;
    // Keep room for the import's Cache Storage entries as well as the zip itself (the same bytes
    // are briefly present twice). A host that reports no size skips this pre-check.
    if (size > 0 && free < size * 2.1) throw Object.assign(new Error('quota'), { code: 'quota' });
  }

  async function run(config, importPack) {
    let root = null;
    let writable = null;
    emit({ ...idleState(), phase: 'checking', total: config.size || 0 }, true);
    try {
      if (!storage?.getDirectory) throw Object.assign(new Error('opfs'), { code: 'opfs' });
      root = await storage.getDirectory();
      await quotaFor(config.size);
      try { await storage.persist?.(); } catch { /* not granted; the import still works */ }

      const handle = await root.getFileHandle(ASSET_PACK_FILE, { create: true });
      writable = await handle.createWritable();
      // Same-origin (the gate cookie must go to /asset-pack.zip); the redirect to the CDN drops
      // credentials by itself, and the signed CDN URL needs none.
      const res = await doFetch(config.url, { cache: 'no-store', credentials: 'same-origin', signal: controller.signal });
      if (!res?.ok || !res.body?.getReader) {
        throw Object.assign(new Error('download'), { code: res?.ok ? 'stream' : 'http', status: res?.status });
      }
      const total = Number(res.headers.get('content-length')) || config.size || 0;
      emit({ phase: 'downloading', bytes: 0, total }, true);

      const reader = res.body.getReader();
      const chunks = [];
      let blockBytes = 0;
      let bytes = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!value?.byteLength) continue;
        chunks.push(value);
        blockBytes += value.byteLength;
        bytes += value.byteLength;
        if (blockBytes >= BLOCK_BYTES) {
          await writable.write(joinChunks(chunks, blockBytes));
          chunks.length = 0;
          blockBytes = 0;
        }
        emit({ phase: 'downloading', bytes, total });
      }
      if (blockBytes) await writable.write(joinChunks(chunks, blockBytes));
      await writable.close();
      writable = null;

      const file = await handle.getFile();
      if (!file || !Number.isFinite(file.size) || file.size <= 0) throw Object.assign(new Error('size'), { code: 'size' });
      if (total > 0 && file.size !== total) throw Object.assign(new Error('size'), { code: 'size' });
      emit({ phase: 'importing', bytes: file.size, total: file.size }, true);
      const result = importPack ? await importPack(file) : file;
      emit({ phase: 'done', bytes: file.size, total: file.size }, true);
      return result;
    } catch (err) {
      const code = errorCode(err);
      emit({ phase: code === 'aborted' ? 'cancelled' : 'error', error: code === 'aborted' ? null : code }, true);
      throw err;
    } finally {
      if (writable) {
        try { await writable.abort(); } catch { /* already closed */ }
      }
      try { await root?.removeEntry?.(ASSET_PACK_FILE); } catch { /* best effort */ }
    }
  }

  return {
    get: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    start(config, { importPack } = {}) {
      if (running) return running;
      controller = new AbortController();
      running = run(config, importPack).finally(() => { running = null; controller = null; });
      return running;
    },
    cancel() { controller?.abort(); },
  };
}

export const assetPackDownload = createAssetPackDownload();
