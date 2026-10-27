// test/content/diy_effects.test.js — the two 自选 operators added on 2026-10-27 draw their effects from the OFFICIAL
// battle effects, not from kit placeholders.
//
// Their prefabs are not part of the repository (game art is never committed): a machine either has the local fx
// extraction under public/assets/local/fx/ + data/local-fx.json (the maintainer's, or the two-operator fx pack) or it
// does not. When it does, this test checks that both units and all six skills are in the index and that the prefabs
// they reference are listed and present on disk. Without the extraction the index tests skip: CI has no game art.
// Run: node --test test/content/diy_effects.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const INDEX = path.join(ROOT, 'public/assets/local/fx/index.json');
const LIST = path.join(ROOT, 'data/local-fx.json');
const HAS_FX = existsSync(INDEX) && existsSync(LIST);
const OPS = [
  { char: 'char_4217_makoto', name: '结城理', skills: ['skchr_makoto_1', 'skchr_makoto_2', 'skchr_makoto_3'] },
  { char: 'char_4182_oblvns', name: '丰川祥子', skills: ['skchr_oblvns_1', 'skchr_oblvns_2', 'skchr_oblvns_3'] },
];
const skip = HAS_FX ? false : 'no local fx extraction (public/assets/local/fx/index.json + data/local-fx.json)';
/** Every string in a JSON value (an index entry nests effects under modes / abilities / talents / roles / uses). */
const strings = (v, out = []) => {
  if (typeof v === 'string') out.push(v);
  else if (Array.isArray(v)) v.forEach((x) => strings(x, out));
  else if (v && typeof v === 'object') Object.values(v).forEach((x) => strings(x, out));
  return out;
};

test('the two operators and their six skills are in the official fx index', { skip }, () => {
  const idx = JSON.parse(readFileSync(INDEX, 'utf8'));
  assert.equal(idx.version, 3, 'index version');
  assert.ok(Object.keys(idx.units).length > 500 && Object.keys(idx.skills).length > 500, 'the extraction is the used set');
  for (const op of OPS) {
    const u = idx.units[op.char];
    assert.ok(u, `${op.name} is in the fx index`);
    assert.ok(Object.keys(u.modes || {}).length > 0, `${op.name}: attack modes`);
    assert.ok(u.talentKeys && Object.keys(u.talentKeys).length > 0, `${op.name}: talent effect keys`);
    for (const s of op.skills) assert.ok(idx.skills[s], `${s} is in the fx index`);
  }
});

test('the prefabs the two operators reference are extracted and on disk', { skip }, () => {
  const idx = JSON.parse(readFileSync(INDEX, 'utf8'));
  const list = JSON.parse(readFileSync(LIST, 'utf8'));
  const prefabs = list.groups?.['fx/prefabs'] ?? {};
  let checked = 0;
  for (const op of OPS) {
    const keys = new Set(strings([idx.units[op.char], ...op.skills.map((s) => idx.skills[s])]).filter((k) => idx.prefabs[k]));
    assert.ok(keys.size >= 5, `${op.name}: references extracted prefabs (${keys.size})`);
    for (const k of keys) {
      const e = prefabs[k];
      assert.ok(e, `${op.name}: ${k} is listed in data/local-fx.json`);
      assert.ok(existsSync(path.join(ROOT, 'public', String(e.path).replace(/^\//, ''))), `${op.name}: ${k} file exists`);
      checked++;
    }
  }
  assert.ok(checked >= 20, `checked ${checked} prefabs across the two operators`);
});

test('the kits no longer carry the procedural placeholder effects', () => {
  const kit = readFileSync(path.join(ROOT, 'server/sim/content/kits/ops/op-makoto.js'), 'utf8');
  const oblvns = readFileSync(path.join(ROOT, 'server/sim/content/kits/ops/op-oblvns.js'), 'utf8');
  for (const k of ['personaCast', 'personaHit', 'personaFear']) assert.ok(!kit.includes(k), `${k} is gone from the kit`);
  for (const k of ["battle.fx('note'", 'noteFx']) assert.ok(!oblvns.includes(k), `${k} is gone from the kit`);
  // her ranged attacks still name the procedural fallback projectile (a machine without the fx pack draws it)
  const notes = readFileSync(path.join(ROOT, 'server/sim/content/notes.js'), 'utf8');
  assert.match(notes, /\['atk', unit\.id, target\.id, 'note'\]/);
});
