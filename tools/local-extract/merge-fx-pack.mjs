#!/usr/bin/env node
// tools/local-extract/merge-fx-pack.mjs — merge an operator FX pack (someone else's extraction) into this checkout's local
// official-effects install (public/assets/local/fx + data/local-fx.json). DESIGN §33.
//
// A pack is a folder whose `data/` holds what §33's extractor writes per operator:
//   data/fx-index-unit.json      { units: {…}, skills: {…} }  (the entries to replace)
//   data/fx-prefabs/<key>.json   the prefabs those entries play (format fx-prefab v1, same as ours)
//   data/fx-assets/tex/<key>.webp, data/fx-assets/mesh/<key>.json  their dependencies
// It merges by replacing the units/skills entries, adding missing prefabs / textures / meshes, and updating
// index.json, textures.json and the serve manifest (data/local-fx.json) counts. Idempotent; game art stays out of git
// (public/assets is ignored).
//
// Why a pack can be needed: an index entry is only as complete as the extraction that produced it. The delta pack that
// first supplied 结城理 / 丰川祥子 came from an older extractor: it had the unit's cast rows but no `hit` rows, no
// LocalEffectRows kind and no skill-prefab / buff-template wiring (`skills[id].uses` empty) — so the client drew the
// Persona switch but almost none of the attack / skill light effects even though every prefab was on disk.
//
// Usage: node tools/local-extract/merge-fx-pack.mjs --pack "<folder with data/>" [--root <repo>] [--dry]
import { readFile, writeFile, readdir, mkdir, copyFile } from 'node:fs/promises';
import { join, dirname, resolve, basename } from 'node:path';
import { existsSync } from 'node:fs';

const args = process.argv.slice(2);
const arg = (name, dflt = null) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : dflt;
};
const ROOT = resolve(arg('root', join(dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '../..')));
const PACK = arg('pack');
const DRY = args.includes('--dry');
if (!PACK) { console.error('usage: node tools/local-extract/merge-fx-pack.mjs --pack "<folder with data/>" [--root <repo>] [--dry]'); process.exit(2); }

const FX = join(ROOT, 'public', 'assets', 'local', 'fx');
const MANIFEST = join(ROOT, 'data', 'local-fx.json');
const PACK_DATA = join(PACK, 'data');
const lower = (s) => String(s || '').toLowerCase();
const readJson = async (p) => JSON.parse(await readFile(p, 'utf8'));
const list = async (p) => (existsSync(p) ? (await readdir(p)).filter((f) => !f.startsWith('.')) : []);

/** WebP pixel size from the file header (VP8 / VP8L / VP8X), else null. */
function webpSize(buf) {
  if (buf.length < 30 || buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WEBP') return null;
  const kind = buf.toString('ascii', 12, 16);
  if (kind === 'VP8 ') {
    const i = buf.indexOf(Buffer.from([0x9d, 0x01, 0x2a]), 20);
    return i < 0 ? null : [buf.readUInt16LE(i + 3) & 0x3fff, buf.readUInt16LE(i + 5) & 0x3fff];
  }
  if (kind === 'VP8L' && buf[20] === 0x2f) {
    const b = buf.readUInt32LE(21);
    return [(b & 0x3fff) + 1, ((b >> 14) & 0x3fff) + 1];
  }
  if (kind === 'VP8X') return [buf.readUIntLE(24, 3) + 1, buf.readUIntLE(27, 3) + 1];
  return null;
}

async function main() {
  const packIndex = await readJson(join(PACK_DATA, 'fx-index-unit.json')).catch(() => null);
  if (!packIndex) throw new Error(`${PACK_DATA}/fx-index-unit.json missing`);
  const index = await readJson(join(FX, 'index.json'));
  const textures = await readJson(join(FX, 'textures.json'));
  const manifest = await readJson(MANIFEST);
  const prefabsDir = join(FX, 'prefabs');
  const texDir = join(FX, 'tex');
  const meshDir = join(FX, 'mesh');
  const report = { units: [], skills: [], prefabs: [], textures: [], meshes: [], missing: [] };

  // 1. prefabs (copy; index.prefabs + manifest entries)
  for (const file of await list(join(PACK_DATA, 'fx-prefabs'))) {
    if (!file.endsWith('.json')) continue;
    const key = lower(basename(file, '.json'));
    const desc = await readJson(join(PACK_DATA, 'fx-prefabs', file));
    const dest = join(prefabsDir, `${key}.json`);
    if (!DRY) { await mkdir(prefabsDir, { recursive: true }); await copyFile(join(PACK_DATA, 'fx-prefabs', file), dest); }
    if (!index.prefabs[key]) {
      const s = desc.stats || {};
      index.prefabs[key] = {
        file: `prefabs/${key}.json`, bundle: desc.bundle ?? null,
        nodes: s.nodes ?? (desc.nodes || []).length, particleSystems: s.particleSystems ?? 0,
        liveParticles: s.liveParticles ?? 0, duration: s.duration ?? null, looping: !!s.looping,
        refs: Array.isArray(desc.refs) ? desc.refs : [],
      };
      manifest.groups['fx/prefabs'][key] = { path: `/assets/local/fx/prefabs/${key}.json`, kind: 'FxPrefab' };
      report.prefabs.push(key);
    }
  }

  // 2. textures (copy; manifest entry; a textures.json entry when the size is readable)
  for (const file of await list(join(PACK_DATA, 'fx-assets', 'tex'))) {
    if (!/\.(webp|png)$/i.test(file)) continue;
    const key = baseline(file);
    const dest = join(texDir, file);
    if (!DRY) { await mkdir(texDir, { recursive: true }); await copyFile(join(PACK_DATA, 'fx-assets', 'tex', file), dest); }
    if (!manifest.groups['fx/tex'][key]) {
      const size = file.toLowerCase().endsWith('.webp') ? webpSize(await readFile(dest).catch(() => Buffer.alloc(0))) : null;
      const entry = { path: `/assets/local/fx/tex/${file}`, kind: 'Texture2D' };
      if (size) { entry.w = size[0]; entry.h = size[1]; }
      manifest.groups['fx/tex'][key] = entry;
      if (size && !textures.textures[key]) {
        textures.textures[key] = {
          name: key, w: size[0], h: size[1], format: 'RGBA32', mips: 1, srgb: true, alpha: true,
          file: `tex/${file}`, wrapU: 'repeat', wrapV: 'repeat', filter: 'bilinear', aniso: 0,
        };
      }
      report.textures.push(key);
    }
  }

  // 3. meshes (copy; manifest entry)
  for (const file of await list(join(PACK_DATA, 'fx-assets', 'mesh'))) {
    if (!file.endsWith('.json')) continue;
    const key = baseline(file);
    const dest = join(meshDir, file);
    if (!DRY) { await mkdir(meshDir, { recursive: true }); await copyFile(join(PACK_DATA, 'fx-assets', 'mesh', file), dest); }
    if (!manifest.groups['fx/mesh'][key]) {
      const mesh = await readJson(join(PACK_DATA, 'fx-assets', 'mesh', file));
      manifest.groups['fx/mesh'][key] = {
        path: `/assets/local/fx/mesh/${file}`, kind: 'FxMesh',
        verts: Array.isArray(mesh.verts) ? mesh.verts.length : Array.isArray(mesh.vertices) ? mesh.vertices.length : 0,
      };
      report.meshes.push(key);
    }
  }

  // 4. the entries themselves (replace per unit / skill)
  for (const [id, entry] of Object.entries(packIndex.units || {})) {
    index.units[id] = entry;
    report.units.push(id);
  }
  for (const [id, entry] of Object.entries(packIndex.skills || {})) {
    index.skills[id] = entry;
    report.skills.push(id);
  }
  for (const [id, entry] of Object.entries(packIndex.skins || {})) {
    index.skins[id] = entry;
  }

  // 5. counts
  manifest.groups.fx.index.prefabs = Object.keys(index.prefabs).length;
  manifest.groups.fx.textures.count = Object.keys(textures.textures).length;
  manifest.count = Object.values(manifest.groups).reduce((n, g) => n + Object.keys(g).length, 0);

  // 6. validate every effect key the merged entries name has a prefab
  const named = new Set();
  for (const id of report.units) {
    const u = index.units[id];
    for (const k of u.refs || []) named.add(lower(k));
    for (const m of u.modes || []) for (const r of [...(m.attack?.cast || []), ...(m.attack?.hit || [])]) for (const k of r.effects || []) named.add(lower(k));
    for (const s of Object.values(u.skills || {})) for (const k of s.effects || []) named.add(lower(k));
  }
  for (const id of report.skills) {
    const s = index.skills[id];
    for (const k of [...(s.effects || []), ...(s.uses || []).flatMap((u) => u.keys || [])]) named.add(lower(k));
  }
  for (const k of named) if (k && !index.prefabs[k]) report.missing.push(k);

  if (!DRY) {
    await writeFile(join(FX, 'index.json'), JSON.stringify(index));
    await writeFile(join(FX, 'textures.json'), JSON.stringify(textures));
    await writeFile(MANIFEST, JSON.stringify(manifest));
  }
  const fmt = (a) => (a.length ? a.join(', ') : '0');
  console.log(`${DRY ? 'would merge' : 'merged'}: units ${fmt(report.units)} | skills ${fmt(report.skills)}`);
  console.log(`  new prefabs ${report.prefabs.length}: ${fmt(report.prefabs)}`);
  console.log(`  new textures ${report.textures.length}: ${fmt(report.textures)}`);
  console.log(`  new meshes ${report.meshes.length}: ${fmt(report.meshes)}`);
  console.log(`  prefabs now ${Object.keys(index.prefabs).length}, textures ${Object.keys(textures.textures).length}, manifest ${manifest.count}`);
  if (report.missing.length) {
    console.log(`  MISSING prefabs for ${report.missing.length} key(s): ${fmt(report.missing)}`);
    process.exitCode = 1;
  }
}
const baseline = (file) => lower(file.replace(/\.[^.]+$/, ''));
main().catch((e) => { console.error(e.stack || e.message || e); process.exit(1); });
