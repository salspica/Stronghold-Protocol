// test/render/makoto-doll.test.js — 结城理 (char_4217_makoto, 自选 6★ 傀儡师) as his <替身> personas: the sim switches on a
// lethal hit / a skill cast and names the UnitMode's persona in `unit.form` (professions.js dollForm, docs/research/15
// §2.1: Stand_S1 俄耳甫斯, Stand_S2 塔纳托斯, Stand_S3_1 塔纳托斯, Stand_S3_2 俄耳甫斯), and render/units.js FORMS draws
// the matching clips (Doll_Skill_1_* / 2_* / 3_P1_* / 3_P2_* — no *_B clips). Headless fake PIXI on the real manifest;
// the clip names are checked against its animation list.
// Run: node --test test/render/makoto-doll.test.js
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { installFakePixi, fakeViewCtx } from './fakepixi.js';
import { presetCamera } from '../../public/js/render/projection.js';
import { makeBattle, enemyRec } from '../helpers/battleHarness.js';
import { unitInfo } from '../../server/sim/snapshot.js';
import { fxForm } from '../../shared/protocol.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const assets = JSON.parse(readFileSync(path.join(ROOT, 'data/assets.json'), 'utf8'));
const MAKOTO = 'char_4217_makoto';

let fake, UnitView, FORMS;
before(async () => {
  fake = installFakePixi();
  ({ UnitView, FORMS } = await import('../../public/js/render/units.js'));
});
after(() => fake.restore());

const tick = () => new Promise((r) => setImmediate(r));
const cam = () => presetCamera('normal', { width: 1280, height: 720 });
/** Asset store on the real manifest (Front / Back entries, their animation names). */
function store() {
  const entry = (id) => assets.chars[id].spine;
  return {
    picture: () => null,
    image: async () => null,
    hasBack: (id) => !!entry(id).back,
    spineEntry: (id, o) => (o && o.back && entry(id).back ? entry(id).back : entry(id).front),
    spine: { acquire: async (e) => ({ animations: Object.keys(e.animations || {}).map((name) => ({ name })) }), release() {} },
  };
}
async function op(info = {}) {
  const ctx = fakeViewCtx(fake.P, { assets: store(), cam });
  const v = new UnitView(ctx, { id: 1, side: 'ally', kind: 'op', defId: MAKOTO, spine: MAKOTO, tier: 6, x: 5, y: 9, maxHp: 2215, dir: 'RIGHT', ...info });
  await tick(); await tick();
  assert.ok(v.actor, 'Spine model built');
  return v;
}
const clip = (v) => v.actor.current;
const frames = (v, n, dt = 1 / 60) => { for (let i = 0; i < n; i++) v.update(dt, cam(), i * dt); };
const secs = (v, s) => frames(v, Math.round(s * 60));
const form = (name) => FORMS[MAKOTO][name];
const frontAnims = () => assets.chars[MAKOTO].spine.front.animations;

describe('结城理\'s <替身> persona clip sets', () => {
  test('one form per persona; every clip exists in the Front skeleton (Doll_*, no *_B)', () => {
    const anims = frontAnims();
    for (const [name, want] of [['Stand_S1', 'Doll_Skill_1_'], ['Stand_S2', 'Doll_Skill_2_'], ['Stand_S3_1', 'Doll_Skill_3_P1_'], ['Stand_S3_2', 'Doll_Skill_3_P2_']]) {
      const f = form(name);
      assert.ok(f, `${name} is a form`);
      for (const role of [f.roles.idle, f.roles.attack?.loop, f.roles.stun?.loop]) {
        if (role == null) continue; // P2 does not attack
        assert.ok(role.startsWith(want), `${name}: ${role} is a ${want} clip`);
      }
      // S3 P1 has no death clip of its own: it dies on the P2 model
      assert.ok(f.roles.die.startsWith('Doll_Skill_3_') || f.roles.die.startsWith(want), `${name}: death clip`);
      for (const k of [f.change, f.leave, f.roles.idle, f.roles.die, f.roles.attack?.loop, f.roles.stun?.loop]) {
        if (k == null) continue;
        assert.ok(k in anims, `${name}: ${k} exists in the skeleton`);
      }
    }
    assert.equal(form('doll').variants.length, 3, 'the generic fallback still has the three personas');
  });

  test('each persona plays its own clips, S3 P2 turns over on the P1→P2 change clip', async () => {
    const s1 = await op({ form: 'Stand_S1' });
    assert.equal(clip(s1), 'Doll_Skill_1_Idle', 'a late view starts on the persona without the switch clip');
    s1.onAttack(null, 2);
    assert.equal(clip(s1), 'Doll_Skill_1_Attack');

    const s2 = await op({ form: 'Stand_S2' });
    assert.equal(clip(s2), 'Doll_Skill_2_Loop', '塔纳托斯');
    s2.onAttack(null, 2);
    assert.equal(clip(s2), 'Doll_Skill_2_Loop', 'its loop covers the attacks (no attack clip)');

    const s3 = await op({ form: 'Stand_S3_1' });
    assert.equal(clip(s3), 'Doll_Skill_3_P1_Idle');
    s3.onAttack(null, 2);
    assert.equal(clip(s3), 'Doll_Skill_3_P1_Attack_A');

    const p2 = await op({ form: 'Stand_S3_2' });
    assert.equal(clip(p2), 'Doll_Skill_3_P2_Loop', 'P2 俄耳甫斯 does not attack');
    const change = await op();
    change.setForm('Stand_S3_2', { id: 1, form: 'Stand_S3_2' });
    assert.equal(clip(change), 'Doll_Skill_3_P1toP2_ChangeBegin', 'the P1→P2 change clip');
    secs(change, 0.6);
    assert.equal(clip(change), 'Doll_Skill_3_P2_Loop');
  });

  test('the form\'s switch clips: the 本体 comes back on the persona\'s SwitchOut; knocked out it holds its Die clip', async () => {
    const v = await op();
    v.setForm('Stand_S1', { id: 1, form: 'Stand_S1', dur: 21 });
    secs(v, 2);
    v.setForm(null, { id: 1, form: null });        // the sim's 'swap' fx
    assert.equal(clip(v), 'Doll_Skill_1_SwitchOut');
    secs(v, 1.1);
    assert.equal(clip(v), 'Idle', 'the 本体 again');

    const dead = await op();
    dead.setForm('Stand_S2', { dur: 21 });
    secs(dead, 2);
    dead.die();
    assert.equal(clip(dead), 'Doll_Skill_2_Die');
    dead.setForm(null, { form: null });            // fx 'dollEnd', after the 'die' event
    assert.equal(clip(dead), 'Doll_Skill_2_Die', 'no switch-back on a knocked-out view');
    assert.equal(dead.form, null);
  });

  test('the Back skeleton lacks the persona clips: facing UP it is shown without them', async () => {
    const v = await op({ dir: 'UP' });
    assert.ok(v.entryBack, 'the Back model');
    v.setForm('Stand_S1', { id: 1, form: 'Stand_S1', dur: 21 });
    assert.equal(v.form, 'Stand_S1');
    assert.ok(!('Doll_Skill_1_SwitchIn' in assets.chars[MAKOTO].spine.back.animations));
    assert.equal(clip(v), 'Doll_Skill_1_Idle', 'straight to the persona');
  });
});

describe('the sim names the persona and the view follows (DIY pick → Battle → snapshot)', () => {
  /** A battle with him at (10, 5); the selected skill sends the persona to the standin. */
  function field(skillIndex = 0) {
    const h = makeBattle({
      timeLimit: 600, autoFinish: false, seed: 5, flags: { dpPerSec: 0, dpMax: 999 },
      defs: { enemies: { enemy_dummy: enemyRec({ key: 'enemy_dummy', hp: 1e9, speed: 0, mass: 0 }) } },
      units: [{ uid: 1, diy: { slot: 6, charId: MAKOTO, skillIndex, uniEquipId: null }, elite: false, row: 10, col: 5 }],
    });
    h.step();
    h.spawn('enemy_dummy', { pos: [10, 7] });
    return { h, u: h.unit(1) };
  }
  const cast = (h, u) => { u.skill.gainSp(999); h.runUntil(() => u.trait.doll, 3); };

  test('a lethal hit on the body switches to the equipped skill\'s persona; fx and snapshot carry it', () => {
    const { h, u } = field(1);
    h.b.drainEvents();
    h.b.dealDamage(null, u, { amount: 1e9, type: 'true' });
    assert.ok(u.alive && u.deployed, 'still on the field');
    assert.equal(u.form, 'Stand_S2', 'S2 equips 塔纳托斯');
    assert.equal(u.trait.doll, true);
    assert.ok(u.findBuff('trait:substitute'), 'the 20 s <替身>');
    const fx = h.eventsOf('fx').filter((e) => e[1] === 'substitute');
    assert.equal(fx.length, 1, JSON.stringify(h.eventsOf('fx')));
    assert.deepEqual([fxForm(fx[0]), fx[0][4].id, fx[0][4].dur], ['Stand_S2', u.id, 21]);
    assert.deepEqual([unitInfo(u).form, unitInfo(u).skillIndex, unitInfo(u).spine], ['Stand_S2', 1, MAKOTO]);
    h.run(21.5);
    assert.deepEqual([u.form, u.trait.doll], [null, false]);
  });

  test('casting S1/S2/S3 switches to that persona; T1 buffs the standin', () => {
    for (const [skill, want] of [[0, 'Stand_S1'], [1, 'Stand_S2'], [2, 'Stand_S3_1']]) {
      const { h, u } = field(skill);
      cast(h, u);
      assert.equal(u.form, want, `skill ${skill + 1}`);
      assert.equal(!!u.findBuff('makoto:t1'), true, `skill ${skill + 1}: T1`);
    }
  });

  test('a view built from that snapshot starts on the skill\'s persona', async () => {
    const { h, u } = field(1);
    cast(h, u);
    const v = await op({ form: unitInfo(u).form });
    assert.equal(clip(v), 'Doll_Skill_2_Loop', '塔纳托斯, no switch clip replayed');
  });
});
