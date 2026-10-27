// GET /asset-pack.zip — a same-origin alias for the private asset-pack zip on ModelScope.
//
// The zip is one large LFS object. Its public resolve URL is served inline by the edge (200
// without Access-Control-Allow-Origin), which a browser fetch cannot read. A private dataset's
// resolve URL, requested with the owner's session cookie, always answers 302 to the signed CDN;
// that CDN sends `Access-Control-Allow-Origin: *` and supports Range. This route performs that
// one authenticated HEAD, caches the signed URL for 20 minutes, and sends the browser there.
// The zip body never passes through this server, and the token never reaches the browser.
//
// Where the upstream URL comes from (it is deployment material and never lives in the repository):
//   1. SP_ASSET_PACK_UPSTREAM — an explicit override for a host that sets no file;
//   2. <root>/asset-pack.local.json `{ "upstream": "…" }` — the per-host private file, git-ignored
//      and deliberately OUTSIDE data/: /data/ is a plain directory mount, so a file in it would be
//      served to every browser;
//   3. data/asset-pack.json `upstream` or an absolute `url` — kept so an older config still works.
// data/asset-pack.json itself carries only what the browser may see (version, the /asset-pack.zip
// alias, size). Resolution 1 and 2 are opt-in through `localConfig`, so a unit test's fixture in a
// temporary data directory is never shadowed by this machine's private file.
import fsp from 'node:fs/promises';
import path from 'node:path';
import { ROOT } from './config.js';
import { sendError } from './common.js';

/** The per-host private upstream file, beside the checkout's data/ (never served). */
export const LOCAL_ASSET_PACK = path.join(ROOT, 'asset-pack.local.json');

const CACHE_MS = 20 * 60 * 1000;
const PROBE_ATTEMPTS = 3;
const PROBE_TIMEOUT_MS = 8000;
const CDN_HOST = /^cdn-lfs[A-Za-z0-9-]*\.modelscope\.cn$/i;
const MODEL_HOST = /(^|\.)modelscope\.cn$/i;

/** @type {{ source: string, location: string, until: number } | null} */
let cached = null;

function modelUrl(value) {
  let url;
  try { url = new URL(value); } catch { return null; }
  if (url.protocol !== 'https:' || url.username || url.password || url.hash) return null;
  if (!MODEL_HOST.test(url.hostname) || !url.pathname.startsWith('/datasets/')) return null;
  return url;
}

async function readJson(file) {
  try { return JSON.parse(await fsp.readFile(file, 'utf8')); } catch { return null; }
}

/**
 * The private upstream URL: the environment override first, then the per-host file, then the
 * tracked data/asset-pack.json (whose `url` may be an absolute ModelScope file in an older setup).
 * `localConfig` is null for a test fixture, which keeps the temporary data directory authoritative.
 * @param {string} dataDir
 * @param {string | null} localConfig
 */
async function readConfig(dataDir, localConfig) {
  if (localConfig) {
    const envValue = typeof process.env.SP_ASSET_PACK_UPSTREAM === 'string'
      ? process.env.SP_ASSET_PACK_UPSTREAM.trim() : '';
    if (envValue) {
      const fromEnv = modelUrl(envValue);
      if (fromEnv) return fromEnv;
    }
    const local = await readJson(localConfig);
    const fromLocal = modelUrl(local?.upstream);
    if (fromLocal) return fromLocal;
  }
  const json = await readJson(path.join(dataDir, 'asset-pack.json'));
  if (!json) return null;
  // `url` is what the browser asks for (normally /asset-pack.zip); `upstream` is the private
  // ModelScope file this route probes. A config that still puts the absolute URL in `url` works.
  return modelUrl(json?.upstream) || (typeof json?.url === 'string' && json.url.startsWith('https://') ? modelUrl(json.url) : null);
}

/**
 * The signed CDN URL for the configured pack, or null.
 * @param {string} dataDir
 * @param {{ fetch?: typeof fetch, log?: object, token?: string, localConfig?: string | null }} [opts]
 */
export async function resolveAssetPack(dataDir, {
  fetch: doFetch = (...args) => globalThis.fetch(...args),
  log = null,
  token = process.env.MS_TOKEN,
  localConfig = null,
} = {}) {
  const source = await readConfig(dataDir, localConfig);
  if (!source) return null;
  if (!token) {
    log?.warn?.('[asset-pack] MS_TOKEN is not set; the private pack cannot be resolved');
    return null;
  }
  if (cached && cached.source === source.href && cached.until > Date.now()) return cached.location;
  for (let attempt = 0; attempt < PROBE_ATTEMPTS; attempt++) {
    let res;
    try {
      res = await doFetch(source, {
        method: 'HEAD',
        redirect: 'manual',
        cache: 'no-store',
        headers: { Origin: 'http://localhost', Cookie: `m_session_id=${token}` },
        signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
      });
    } catch { continue; }
    const location = res.headers.get('location');
    if (res.status >= 300 && res.status < 400 && location) {
      let target;
      try { target = new URL(location, source); } catch { continue; }
      if (target.protocol !== 'https:' || !CDN_HOST.test(target.hostname)) continue;
      cached = { source: source.href, location: target.href, until: Date.now() + CACHE_MS };
      return target.href;
    }
    // 404: the token is wrong/expired or the dataset is not private; retrying cannot help.
    if (res.status === 404 || res.status === 401 || res.status === 403) break;
  }
  log?.warn?.('[asset-pack] no signed CDN redirect; check MS_TOKEN and the private dataset');
  return null;
}

/** The route itself: 302 to the signed CDN URL, or 503 when no edge could be resolved. */
export async function serveAssetPack(req, res, dataDir, { fetch: doFetch = (...args) => globalThis.fetch(...args), log = null, localConfig = LOCAL_ASSET_PACK } = {}) {
  const location = await resolveAssetPack(dataDir, { fetch: doFetch, log, localConfig });
  if (!location) {
    sendError(req, res, 503, '素材包下载源暂时不可用 · Asset pack source unavailable');
    return;
  }
  res.writeHead(302, {
    Location: location,
    'Cache-Control': 'private, max-age=60',
    'Content-Length': 0,
  });
  res.end();
}
