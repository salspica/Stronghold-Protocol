// 一次性补齐缺失时装：骨骼走 fexli/ArknightsResource，头像/半身像/立绘仍走 PRTS。
// 只把源文件落到独立缓存目录，随后调用 prepare-operator-skins.mjs 的 prepareSkins()，
// 复用原有的 Spine 3.8、atlas 区域、PNG 完整性、manifest 原子写入与统计校验。
//
// 用法：
//   node tools/import-fexli-missing-skins.mjs --dry-run
//   node tools/import-fexli-missing-skins.mjs --limit 1
//   node tools/import-fexli-missing-skins.mjs
//   node tools/import-fexli-missing-skins.mjs --force --concurrency 4
//
// 默认把下载缓存放在 .cache/fexli-skins/，不写入 public/assets，直到 prepareSkins() 校验通过。

import { createHash, randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { OPERATOR_SKINS } from '../shared/skins.js';
import { prepareSkins, skinResourceFiles } from './prepare-operator-skins.mjs';
import { atlasInfo } from './assets/atlas.mjs';
import { parseSkel } from './assets/skel.mjs';
import { validateSkinPng } from './assets/skin-battle-source.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MANIFEST = join(ROOT, 'data/assets.json');
const ASSET_ROOT = join(ROOT, 'public/assets');
const FEXLI = 'https://raw.githubusercontent.com/fexli/ArknightsResource/main/spine';
const PRTS_API = 'https://prts.wiki/api.php';
const PRTS_PREFIX = (charId) => `https://torappu.prts.wiki/assets/char_spine/${charId}/`;
const UA = 'Stronghold-Protocol-skin-import/1.0 (+https://github.com/sganggs/Stronghold-Protocol)';

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  return i < 0 ? null : args[i + 1] ?? null;
};
const has = (name) => args.includes(name);
const source = resolve(flag('--source') || join(ROOT, '.cache/fexli-skins'));
const force = has('--force');
const dryRun = has('--dry-run');
const limit = Math.max(0, Number(flag('--limit') || 0));
const concurrency = Math.max(1, Math.min(6, Number(flag('--concurrency') || 3)));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function complete(rec) {
  if (!rec) return false;
  const rels = [...skinResourceFiles({ [rec.charId]: rec })]; // 键名无关，只取记录里的路径
  return rels.length > 0 && rels.every((rel) => existsSync(join(ASSET_ROOT, rel)));
}

/** 有上限、带重试的下载；404 返回 null（用于探测 Front/Back/Spine）。 */
async function get(url, max, { json = false, retries = 4 } = {}) {
  let last;
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { 'user-agent': UA },
        signal: AbortSignal.timeout(60000),
        redirect: 'follow',
      });
      if (res.status === 404) return null;
      if (!res.ok) {
        if ([403, 429, 500, 502, 503, 504].includes(res.status)) {
          last = new Error(`HTTP ${res.status}`);
          await sleep(700 * (attempt + 1));
          continue;
        }
        throw new Error(`HTTP ${res.status}: ${url}`);
      }
      const declared = Number(res.headers.get('content-length'));
      if (declared && declared > max) throw new Error(`too large (${declared} bytes): ${url}`);
      const bytes = Buffer.from(await res.arrayBuffer());
      if (bytes.length > max) throw new Error(`too large (${bytes.length} bytes): ${url}`);
      return json ? JSON.parse(bytes.toString('utf8')) : bytes;
    } catch (error) {
      last = error;
      if (attempt === retries - 1) break;
      await sleep(700 * (attempt + 1));
    }
  }
  throw last;
}

function safePage(name) {
  return typeof name === 'string'
    && /^[A-Za-z0-9_-][A-Za-z0-9_#.-]*\.png$/.test(name)
    && !name.includes('..');
}

/** 读取 fexli 的一套 Front/Back/Spine；不存在返回 null，存在但不合规则抛错。 */
async function readModel(skin, folder, stem) {
  const base = `${FEXLI}/${skin.charId}/${skin.id}/${folder}/`;
  const atlas = await get(base + encodeURIComponent(stem + '.atlas'), 512 * 1024);
  if (!atlas) return null;
  const text = atlas.toString('utf8');
  const info = atlasInfo(text);
  if (!info.pages.length || info.pages.length > 8 || info.pages.some((page) => !safePage(page))) {
    throw new Error(`不安全的 atlas 页面: ${skin.id} ${folder}`);
  }
  const skel = await get(base + encodeURIComponent(stem + '.skel'), 8 * 1024 * 1024);
  if (!skel) throw new Error(`atlas 存在但缺少 skel: ${skin.id} ${folder}/${stem}`);
  const parsed = parseSkel(skel, info.regions);
  if (!parsed.version.startsWith('3.8.') || parsed.missingRegions.length || !parsed.animations.length) {
    throw new Error(`骨骼不兼容 (${parsed.version}, missing=${parsed.missingRegions.length}): ${skin.id} ${folder}`);
  }
  const pages = [];
  for (const page of info.pages) {
    const bytes = await get(base + encodeURIComponent(page), 16 * 1024 * 1024);
    if (!bytes) throw new Error(`缺少贴图 ${page}: ${skin.id} ${folder}`);
    validateSkinPng(bytes);
    pages.push({ name: page, bytes });
  }
  return { atlas: text, skel, pages, version: parsed.version };
}

async function tryFolders(skin, folders, stems, side) {
  for (const folder of folders) {
    for (const stem of stems) {
      const model = await readModel(skin, folder, stem);
      if (model) return { side, folder, stem, model };
    }
  }
  return null;
}

async function stageModel(skin, sideDir, model) {
  const dir = join(source, skin.id, sideDir);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, skin.id + '.atlas'), model.atlas);
  await writeFile(join(dir, skin.id + '.skel'), model.skel);
  for (const page of model.pages) await writeFile(join(dir, page.name), page.bytes);
}

function modelMeta(skin, unified, hasBack) {
  const entry = {};
  if (unified) entry['战斗'] = { file: `${skin.id}/spine/${skin.id}` };
  else {
    entry['正面'] = { file: `${skin.id}/front/${skin.id}` };
    if (hasBack) entry['背面'] = { file: `${skin.id}/back/${skin.id}` };
  }
  return { prefix: PRTS_PREFIX(skin.charId), skin: { [skin.name]: entry } };
}

async function stageImages(skin) {
  const dir = join(source, skin.id);
  const types = ['头像', '半身像', '立绘'];
  const titles = types.map((type) => `文件:${type} ${skin.charName} skin${skin.wikiIndex}.png`);
  const api = new URL(PRTS_API);
  for (const [key, value] of Object.entries({
    action: 'query', format: 'json', prop: 'imageinfo', titles: titles.join('|'), iiprop: 'url|size|sha1',
  })) api.searchParams.set(key, value);
  const meta = await get(api.href, 256 * 1024, { json: true });
  if (!meta?.query?.pages) throw new Error(`PRTS 图片信息缺失: ${skin.id}`);
  await writeFile(join(dir, 'imageinfo.json'), JSON.stringify(meta));
  for (const [i, field] of ['avatar', 'portrait', 'illustration'].entries()) {
    const info = Object.values(meta.query.pages).find((page) => page.title === titles[i])?.imageinfo?.[0];
    if (!info?.url || !Number.isSafeInteger(info.size) || info.size > 16 * 1024 * 1024 || !info.sha1) {
      throw new Error(`缺少图片: ${titles[i]}`);
    }
    const bytes = await get(info.url, 16 * 1024 * 1024);
    if (!bytes) throw new Error(`图片下载失败: ${titles[i]}`);
    if (bytes.length !== info.size || createHash('sha1').update(bytes).digest('hex') !== info.sha1) {
      throw new Error(`图片校验失败: ${titles[i]}`);
    }
    validateSkinPng(bytes);
    await writeFile(join(dir, field + '.png'), bytes);
  }
}

async function stage(skin, rec) {
  const dir = join(source, skin.id);
  const ready = join(dir, '.ready.json');
  if (!force && existsSync(ready)) return { id: skin.id, skipped: true };
  await mkdir(dir, { recursive: true });

  const idLower = skin.id.toLowerCase();
  const manifestStem = rec?.spine?.front?.atlas?.split('/').pop()?.replace(/\.atlas$/, '');
  const frontStems = [...new Set([skin.id, manifestStem, idLower].filter(Boolean))];

  const front = await tryFolders(skin, ['Front'], frontStems, 'front');
  const unified = front ? null : await tryFolders(skin, ['Spine'], frontStems, 'front');
  if (!front && !unified) throw new Error('fexli 中找不到 Front/Spine');
  const back = front ? await tryFolders(skin, ['Back'], frontStems, 'back') : null;

  if (unified) await stageModel(skin, 'front', unified.model);
  else {
    await stageModel(skin, 'front', front.model);
    if (back) await stageModel(skin, 'back', back.model);
  }
  await writeFile(join(dir, 'model-meta.json'), JSON.stringify(modelMeta(skin, !!unified, !!back)));
  await stageImages(skin);
  await writeFile(ready, JSON.stringify({
    id: skin.id, mode: unified ? 'unified' : back ? 'front-and-back' : 'front-only',
    spine: (unified || front).model.version, at: new Date().toISOString(),
  }));
  return { id: skin.id, mode: unified ? 'unified' : back ? 'front-and-back' : 'front-only', skipped: false };
}

async function main() {
  const manifest = JSON.parse(await readFile(MANIFEST, 'utf8'));
  const missing = OPERATOR_SKINS.filter((skin) => !complete(manifest.skins?.[skin.id]));
  const picked = limit ? missing.slice(0, limit) : missing;
  console.log(`catalogue=${OPERATOR_SKINS.length} missing=${missing.length} picked=${picked.length} source=${source}`);
  if (dryRun) {
    for (const skin of picked) console.log(`missing ${skin.id} ${skin.charName} / ${skin.name}`);
    return;
  }

  await mkdir(source, { recursive: true });
  const failures = [];
  let index = 0;
  const run = async () => {
    while (index < picked.length) {
      const skin = picked[index++];
      try {
        const result = await stage(skin, manifest.skins?.[skin.id]);
        console.log(`${result.skipped ? 'cached' : 'staged'} ${skin.id}${result.mode ? ` (${result.mode})` : ''}`);
      } catch (error) {
        failures.push({ id: skin.id, name: skin.name, reason: error.message });
        console.error(`FAIL ${skin.id} ${skin.name}: ${error.message}`);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, picked.length || 1) }, run));

  if (failures.length) {
    console.error(`\n${failures.length} 套未能落盘，未修改 data/assets.json：`);
    for (const failure of failures) console.error(`- ${failure.id}: ${failure.reason}`);
    process.exitCode = 1;
    return;
  }

  // prepareSkins() 的 metadata 模式会跳过 manifest 里已有的条目；先用临时 manifest 去掉缺失条目，
  // 让它真正重新导入，成功后再原子替换真实 manifest。
  const realPrior = await readFile(MANIFEST);
  const stripped = JSON.parse(realPrior.toString('utf8'));
  stripped.skins = { ...(stripped.skins || {}) };
  for (const skin of picked) delete stripped.skins[skin.id];
  const tempManifest = join(source, 'assets.base.json');
  await writeFile(tempManifest, JSON.stringify(stripped) + '\n');

  const result = await prepareSkins({
    sourceDir: source,
    fetchSources: false,
    catalogue: picked,
    manifestPath: tempManifest,
    assetRoot: ASSET_ROOT,
    modelSource: 'metadata',
  });
  console.log(JSON.stringify(result));

  const now = await readFile(MANIFEST);
  if (!now.equals(realPrior)) throw new Error('导入期间 data/assets.json 被其他进程修改，已停止写回');
  const tmp = MANIFEST + '.part-' + randomUUID();
  try {
    await writeFile(tmp, await readFile(tempManifest), { flag: 'wx' });
    await rename(tmp, MANIFEST);
  } finally {
    await rm(tmp, { force: true });
  }
  console.log(`wrote ${MANIFEST}`);
}

await main();
