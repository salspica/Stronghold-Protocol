// test/content/op_oblvns.test.js — the 自选 operator kit of 丰川祥子 (char_4182_oblvns, 6★ 领主; kit
// server/sim/content/kits/ops/op-oblvns.js) and the 音符 projectile it shares (server/sim/content/notes.js).
// Fielded the production way: a DIY slot + its `diy` pick (E2 Lv1, rank 4). Numbers are read back from
// data/backups.json. Run: node --test test/content/op_oblvns.test.js

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeBattle, enemyRec, checkInvariants } from '../helpers/battleHarness.js';

const load = (f) => JSON.parse(readFileSync(new URL(`../../data/${f}.json`, import.meta.url), 'utf8'));
const BACKUPS = load('backups');
const CHAR = 'char_4182_oblvns';
const FORM = BACKUPS.units[CHAR].forms['2/1/4/0'];
const skillOf = (id) => FORM.skills.find((s) => s.skillId === id);
const S1 = 'skchr_oblvns_1', S3 = 'skchr_oblvns_3';
const SCALES = ['atk_scale', 'atk_scale_2', 'atk_scale_3', 'atk_scale_4', 'atk_scale_5', 'atk_scale_6', 'atk_scale_7', 'atk_scale_8']
  .map((k) => skillOf(S1).bb[k]);
const approx = (a, b, msg, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps * Math.max(1, Math.abs(b)), `${msg}: ${a} vs ${b}`);
const dummy = (key, o = {}) => enemyRec({ key, hp: 1e9, speed: 0, mass: 0, ...o });
const ENEMIES = {
  enemy_dummy: dummy('enemy_dummy'),
  enemy_walk: enemyRec({ key: 'enemy_walk', hp: 1e9, speed: 0, mass: 0 }),
  enemy_def: dummy('enemy_def', { def: 800, res: 0 }),
  enemy_res: dummy('enemy_res', { def: 0, res: 80 }),
};

/** A battle with 丰川祥子 as uid 1 at (row, col) facing RIGHT, the picked skill, and `others` (the flat stage). */
function field({ skill = 0, row = 10, col = 5 } = {}) {
  const h = makeBattle({
    defs: { enemies: ENEMIES }, timeLimit: 600, autoFinish: false, seed: 5,
    flags: { dpPerSec: 0, dpMax: 999 }, hooks: ['damaged', 'attack', 'skillStart', 'skillEnd'], captureNoisy: true,
    units: [{ uid: 1, diy: { slot: 6, charId: CHAR, skillIndex: skill, uniEquipId: null }, elite: false, row, col }],
  });
  h.step();
  return { h, u: h.unit(1) };
}
const noteHits = (h, u) => h.hooksOf('damaged').filter((c) => c.source === u && (c.dmg?.tags || []).includes('note'));
function done(h) {
  checkInvariants(h.b);
  assert.equal(h.b.errors.length, 0, JSON.stringify(h.b.errors[0]));
}

test('S1 新月的苏醒: eight notes, one per charge, damage falling 65 % → 4 % ATK (arts), each a homing note projectile', () => {
  const { h, u } = field({ skill: 0 });
  const e = h.spawn('enemy_dummy', { pos: [10, 7] });
  assert.equal(u.skill.maxCharges, 2, 'data: 可充能2次');
  u.skill.gainSp(999);
  assert.ok(h.runUntil(() => u.skill.activations === 1, 3), 'cast at full SP');
  h.run(0.65); // every note is out (the volley spans 8 × 0.08 s)
  // move the victim well outside her range — the notes in flight keep homing (T1) and still land
  e.x = 16; e.y = 12;
  h.run(3);
  const hits = noteHits(h, u);
  assert.equal(hits.length, 8, 'eight notes');
  for (let i = 0; i < 8; i++) approx(hits[i].amount, u.s.atk * SCALES[i], `note ${i + 1} at ${SCALES[i] * 100} % ATK`);
  for (const c of hits) assert.deepEqual([c.type, !!c.dmg.isSkill], ['arts', true]);
  assert.ok(hits[0].amount > hits[7].amount, 'the sequence falls');
  assert.equal(h.eventsOf('atk').filter((ev) => ev[3] === 'note' && ev[1] === u.id).length >= 8, true, 'the client sees the notes');
  done(h);
});

test('T1 颂乐音符: her normal ranged attacks are note projectiles too (the shot keeps flying after leaving the range)', () => {
  const { h, u } = field({ skill: 0 });
  h.spawn('enemy_dummy', { pos: [10, 7] });
  assert.equal(u.profile.projectile, 'note');
  assert.ok(h.runUntil(() => h.eventsOf('atk').some((ev) => ev[1] === u.id && ev[3] === 'note'), 5), 'a normal attack flies as a note');
  assert.ok(h.runUntil(() => h.hooksOf('damaged').filter((c) => c.source === u).length >= 1, 5), 'the note lands');
  const hit = h.hooksOf('damaged').filter((c) => c.source === u)[0];
  approx(hit.amount, u.s.atk * 0.8, 'the lord ranged attack scale (PRTS 特性 80 %)');
  done(h);
});

test('S2 满月的舞会: 钢琴 is the equipped timbre (+60 % ATK from deployment); the cast switches to 风琴 (+80 attack speed)', () => {
  const { h, u } = field({ skill: 1 });
  h.spawn('enemy_dummy', { pos: [10, 7] });
  assert.deepEqual(u.findBuff('oblvns:piano')?.mods, { atkPct: 0.6 }, 'piano');
  approx(u.s.atk, u.base.atk * 1.6, 'the ATK bonus is live');
  const baseAspd = u.s.aspd;
  u.skill.gainSp(999);
  assert.ok(h.runUntil(() => u.skill.active, 3), 'organ on');
  assert.equal(u.findBuff('oblvns:piano'), null, 'piano off');
  approx(u.s.aspd, baseAspd + 80, 'organ: +80 attack speed');
  done(h);
});

test('S3 残月的余响: every attack plays 2 物理 notes at the highest-DEF enemy and 2 法术 notes at the highest-RES one, 155 % ATK each', () => {
  const { h, u } = field({ skill: 2 });
  const def = h.spawn('enemy_def', { pos: [10, 8] });
  const res = h.spawn('enemy_res', { pos: [9, 8] });
  u.skill.gainSp(999);
  assert.ok(h.runUntil(() => u.skill.active, 3), 'cast');
  assert.equal(h.b.effectiveProfile(u).noAttack, true, 'the notes are the attack');
  const n0 = noteHits(h, u).length;
  assert.ok(h.runUntil(() => noteHits(h, u).length >= n0 + 4, 4), 'one volley of four');
  const volley = noteHits(h, u).slice(n0, n0 + 4);
  const scale = skillOf(S3).bb['attack@atk_scale'];
  // post-mitigation: 物理 goes through the 800 DEF enemy, 法术 through the 80 RES one
  const A = u.s.atk * scale;
  const phys = Math.max(A - 800, 0.05 * A), arts = Math.max(A * (1 - 80 / 100), 0.05 * A);
  assert.deepEqual(volley.filter((c) => c.type === 'phys').map((c) => c.target), [def, def], 'piano tracks the highest DEF');
  assert.deepEqual(volley.filter((c) => c.type === 'arts').map((c) => c.target), [res, res], 'organ tracks the highest RES');
  for (const c of volley.filter((x) => x.type === 'phys')) approx(c.amount, phys, '155 % ATK 物理 through 800 DEF');
  for (const c of volley.filter((x) => x.type === 'arts')) approx(c.amount, arts, '155 % ATK 法术 through 80 RES');
  const n1 = noteHits(h, u).length;
  assert.ok(h.runUntil(() => noteHits(h, u).length >= n1 + 4, 4), 'the next attack interval plays again');
  done(h);
});
