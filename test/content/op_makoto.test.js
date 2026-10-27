// test/content/op_makoto.test.js — 结城理 (char_4217_makoto) 自选 kit, against docs/research/15-collab-operators-official.md
// §2: the persona switch (skill / lethal), S1's heal-instead-of-attack, S2's fear + 0.1 s execute, S3 P1→P2 (second cast
// or a lethal hit on P1), T1's standin-only stats and T2's end-of-standin all-out damage. Fielded the production way (DIY
// slot + pick, E2 Lv1 rank 4). Run: node --test test/content/op_makoto.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeBattle, enemyRec, checkInvariants } from '../helpers/battleHarness.js';

const load = (f) => JSON.parse(readFileSync(new URL(`../../data/${f}.json`, import.meta.url), 'utf8'));
const BACKUPS = load('backups');
const MAKOTO = 'char_4217_makoto';
const FORM = BACKUPS.units[MAKOTO].forms['2/1/4/0'];
const skillOf = (id) => FORM.skills.find((s) => s.skillId === id);
const S2 = 'skchr_makoto_2', S3 = 'skchr_makoto_3';
const approx = (a, b, msg, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps * Math.max(1, Math.abs(b)), `${msg}: ${a} vs ${b}`);
const dummy = (key, o = {}) => enemyRec({ key, hp: 1e9, speed: 0, mass: 0, ...o });
const ENEMIES = { enemy_dummy: dummy('enemy_dummy'), enemy_soft: dummy('enemy_soft', { hp: 5000 }) };

function field(skillIndex = 0, enemyKey = 'enemy_dummy') {
  const h = makeBattle({
    defs: { enemies: ENEMIES }, timeLimit: 600, autoFinish: false, seed: 5,
    flags: { dpPerSec: 0, dpMax: 999 }, hooks: ['damaged', 'skillStart'], captureNoisy: true,
    units: [{ uid: 1, diy: { slot: 6, charId: MAKOTO, skillIndex, uniEquipId: null }, elite: false, row: 10, col: 5 }],
  });
  h.step();
  const e = h.spawn(enemyKey, { pos: [10, 6] });
  return { h, u: h.unit(1), e };
}
const cast = (h, u) => {
  const n = u.skill.activations ?? 0;
  u.skill.gainSp(999);
  assert.ok(h.runUntil(() => (u.skill.activations ?? 0) > n, 3), 'cast');
};
const attacks = (h, u) => h.hooksOf('damaged').filter((c) => c.source === u && c.dmg?.isSkill);
function done(h) { checkInvariants(h.b); assert.equal(h.b.errors.length, 0, JSON.stringify(h.b.errors[0])); }

test('casting a skill switches to that persona; a lethal hit on the body uses the equipped skill\'s persona', () => {
  for (const [skill, form] of [[0, 'dollS1'], [1, 'dollS2'], [2, 'dollS3']]) {
    const { h, u } = field(skill);
    cast(h, u);
    assert.deepEqual([u.form, u.trait.doll], [form, true], `skill ${skill + 1}`);
    done(h);
  }
  const { h, u } = field(1);
  h.b.dealDamage(null, u, { amount: 1e9, type: 'true' });
  assert.deepEqual([u.alive, u.form], [true, 'dollS2']);
  done(h);
});

test('S1 俄耳甫斯: a wounded ally (<50 %) is healed for 50 % ATK instead of attacked', () => {
  const { h, u, e } = field(0);
  cast(h, u);
  h.run(1.2); // the switch ends at full HP
  u.hp = u.s.maxHp * 0.3;
  const hpBefore = u.hp;
  h.run(2.5);
  assert.ok(u.hp > hpBefore, 'healed itself (the only ally in range)');
  const note = attacks(h, u).filter((c) => c.target === e);
  assert.equal(note.length, 0, 'no attack landed while the heal replaced it');
  done(h);
});

test('S2 塔纳托斯: fear (35 %) with attack@atk_scale arts damage, and the 0.1 s aura executes feared enemies under 2.5×ATK', () => {
  const { h, u, e } = field(1, 'enemy_soft');
  cast(h, u);
  h.run(8);
  const hits = attacks(h, u).filter((c) => c.target === e && c.amount > 0);
  assert.ok(hits.length > 0, 'the fear damage lands');
  approx(hits[hits.length - 1].amount, u.s.atk * skillOf(S2).bb['attack@atk_scale'], 'attack@atk_scale arts (def 0, res 0)');
  // the aura: a feared enemy below kill_atk_scale × ATK is executed even at high HP
  const low = e.alive ? e : h.spawn('enemy_soft', { pos: [10, 6] });
  assert.ok(low && low.alive, 'a target to execute');
  low.hp = u.s.atk * 2; // < 2.5 × ATK
  h.b.applyStatus(low, 'fear', { duration: 10, source: u });
  h.run(0.3);
  assert.equal(low.alive, false, 'executed by the 9,999,999 aura');
  done(h);
});

test('S3 P1 → P2: a second cast inside the standin gives block 2, 35 % dodge, no attacks and the heal aura', () => {
  const { h, u } = field(2);
  cast(h, u);
  assert.equal(u.form, 'dollS3');
  assert.ok(u.findBuff('makoto:s3'), 'P1 attack speed buff');
  h.run(1.2); // the switch buff (阻回) has ended: the second cast can take its SP
  cast(h, u);
  assert.equal(u.form, 'dollS3P2', 'P2');
  assert.equal(u.findBuff('makoto:s3'), null, 'P1 buff dropped');
  assert.equal(u.s.blockCnt, 2, 'block 2');
  approx(u.s.dodgePhys, skillOf(S3).bb['attack@prob']);
  approx(u.s.dodgeArts, skillOf(S3).bb['attack@prob']);
  assert.equal(h.b.effectiveProfile(u).noAttack, true, 'P2 does not attack');
  const before = attacks(h, u).length;
  h.run(3);
  assert.equal(attacks(h, u).length, before, 'still no attack');
  // the 4-ally heal: makoto himself, wounded
  u.hp = u.s.maxHp * 0.4;
  const hp = u.hp;
  h.run(1.2);
  assert.ok(u.hp > hp, 'P2 heals every second');
  done(h);
});

test('a lethal hit on P1 turns it into P2 instead of knocking him out; the standin keeps its remaining time', () => {
  const { h, u } = field(2);
  cast(h, u);
  h.run(1.2); // the switch buff (不死) is over, the P1 persona is up
  const sub = u.findBuff('trait:substitute');
  const left = sub.timeLeft;
  h.b.dealDamage(null, u, { amount: 1e9, type: 'true' });
  assert.ok(u.alive, 'not knocked out');
  assert.equal(u.form, 'dollS3P2');
  assert.ok(u.findBuff('trait:substitute').timeLeft <= left + 1e-6, 'the same standin, not refreshed');
  done(h);
});

test('T1 buffs the standin only (+ATK / +HP / interval); T2 hits around every ally when the standin ends', () => {
  const { h, u } = field(0);
  const atk0 = u.s.atk, hp0 = u.s.maxHp;
  cast(h, u);
  const t1 = u.findBuff('makoto:t1');
  assert.ok(t1, 'T1 is on the standin');
  assert.deepEqual(t1.mods, { atkPct: 0.85, hpPct: 0.35, batPct: 0.4 });
  approx(u.s.atk, atk0 * 1.85, 'ATK +85 %');
  approx(u.s.maxHp, hp0 * 1.35, 'max HP +35 %');
  // T2: true damage around the allied operator when the standin ends
  const e = h.spawn('enemy_dummy', { pos: [10, 6] });
  h.b.dealDamage(null, u, { amount: 1, type: 'true' }); // keep him in the standin, then let it expire
  h.run(21);
  assert.deepEqual([u.form, u.trait.doll], [null, false]);
  assert.ok(e.hp < 1e9, 'T2 dealt damage around him');
  assert.equal(h.hooksOf('damaged').some((c) => (c.dmg?.tags || []).includes('makoto:t2')), true);
  assert.equal(u.findBuff('makoto:t1'), null, 'T1 removed with the standin');
  done(h);
});
