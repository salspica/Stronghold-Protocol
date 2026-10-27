// test/render/makoto-doll.test.js — 结城理 (char_4217_makoto, 自选 6★ 傀儡师) as his <替身>: the sim switches on a lethal
// hit (professions.js installDollkeeper — verified here end to end, DIY pick → Battle → snapshot), and the client draws
// the Persona (render/units.js FORMS `doll`): S1 俄耳甫斯, S2 塔纳托斯, S3's 俄耳甫斯, whose clips the skeleton names
// Doll_Skill_1_* / Doll_Skill_2_* / Doll_Skill_3_P2_* — no *_B clips, so a 傀儡师 form keyed on the *_B convention drew
// nothing (user report 2026-10-27). The variant follows the pick's skill (dollForms, _formSpec). Headless fake PIXI on the
// real manifest (test/render/fakepixi.js); the clip names are checked against its animation list.
// Run: node --test test/render/makoto-doll.test.js

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { installFakePixi, fakeViewCtx } from './fakepixi.js';
import { presetCamera } from '../../public/js/render/projection.js';
import { makeBattle } from '../helpers/battleHarness.js';
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
const variant = (skillIndex) => FORMS[MAKOTO].doll.variants[skillIndex];
const frontAnims = () => assets.chars[MAKOTO].spine.front.animations;

describe('结城理\'s <替身> clip sets', () => {
  test('one set per skill, every clip in the Front skeleton (Doll_*, no *_B)', () => {
    const anims = frontAnims();
    assert.equal(FORMS[MAKOTO].doll.variants.length, 3);
    for (const [skillIndex, want] of [[0, 'Doll_Skill_1_'], [1, 'Doll_Skill_2_'], [2, 'Doll_Skill_3_P2_']]) {
      const f = variant(skillIndex);
      for (const name of [f.roles.idle, f.roles.die, f.roles.attack?.loop, f.roles.stun?.loop]) {
        assert.ok(typeof name === 'string' && name.startsWith(want), `skill ${skillIndex + 1}: ${name} is a ${want} clip`);
      }
      // its switch clips belong to the same skeleton (S3's 俄耳甫斯 reuses the persona's own SwitchIn)
      for (const name of [f.change, f.leave, f.roles.idle, f.roles.die, f.roles.attack?.loop, f.roles.stun?.loop]) {
        assert.ok(typeof name === 'string' && name.startsWith('Doll_'), `skill ${skillIndex + 1}: ${name} is a Doll_ clip`);
        assert.ok(name in anims, `skill ${skillIndex + 1}: ${name} exists in the skeleton`);
      }
    }
  });

  test('the persona the fatal hit summons: S1 俄耳甫斯, S2 塔纳托斯, S3 the 俄耳甫斯 of its P2 phase', async () => {
    const s1 = await op({ skillIndex: 0 });
    s1.setForm('doll', { id: 1, form: 'doll', dur: 21 });
    assert.equal(clip(s1), 'Doll_Skill_1_SwitchIn');
    secs(s1, 1.1);
    assert.equal(clip(s1), 'Doll_Skill_1_Idle');
    s1.onAttack(null, 2);
    assert.equal(clip(s1), 'Doll_Skill_1_Attack');

    const s2 = await op({ skillIndex: 1 });
    s2.setForm('doll', { id: 1, form: 'doll', dur: 21 });
    assert.equal(clip(s2), 'Doll_Skill_2_SwitchIn', '塔纳托斯 fades in');
    secs(s2, 1.1);
    s2.onAttack(null, 2);
    assert.equal(clip(s2), 'Doll_Skill_2_Loop', 'its loop covers the attacks (no attack clip)');

    const s3 = await op({ skillIndex: 2 });
    s3.setForm('doll', { id: 1, form: 'doll', dur: 21 });
    assert.equal(clip(s3), 'Doll_Skill_1_SwitchIn');
    secs(s3, 1.1);
    assert.equal(clip(s3), 'Doll_Skill_3_P2_Loop');
  });

  test('the form\'s switch clips: the 本体 comes back on SwitchOut; knocked out as the 替身 it holds its Die clip', async () => {
    const v = await op({ skillIndex: 0 });
    v.setForm('doll', { id: 1, form: 'doll', dur: 21 });
    secs(v, 2);
    v.setForm(null, { id: 1, form: null });        // the sim's 'swap' fx
    assert.equal(clip(v), 'Doll_Skill_1_SwitchOut');
    secs(v, 1.1);
    assert.equal(clip(v), 'Idle', 'the 本体 again');

    const dead = await op({ skillIndex: 1 });
    dead.setForm('doll', { dur: 21 });
    secs(dead, 2);
    dead.die();
    assert.equal(clip(dead), 'Doll_Skill_2_Die');
    dead.setForm(null, { form: null });            // fx 'dollEnd', after the 'die' event
    assert.equal(clip(dead), 'Doll_Skill_2_Die', 'no switch-back on a knocked-out view');
    assert.equal(dead.form, null);
  });

  test('the Back skeleton lacks the switch clips: facing UP the 替身 is shown without them', async () => {
    const v = await op({ skillIndex: 0, dir: 'UP' });
    assert.ok(v.entryBack, 'the Back model');
    v.setForm('doll', { id: 1, form: 'doll', dur: 21 });
    assert.equal(v.form, 'doll');
    assert.ok(!('Doll_Skill_1_SwitchIn' in assets.chars[MAKOTO].spine.back.animations));
    assert.equal(clip(v), 'Doll_Skill_1_Idle', 'straight to the 替身');
  });
});

describe('the sim switches him and the view follows (DIY pick → Battle → snapshot)', () => {
  /** His <替身> in a real battle: the DIY piece at tier 6, its skill, a lethal true-damage hit. */
  function lethal(skillIndex = 0) {
    const h = makeBattle({
      timeLimit: 600, autoFinish: false, seed: 5, flags: { dpPerSec: 0, dpMax: 999 },
      units: [{ uid: 1, diy: { slot: 6, charId: MAKOTO, skillIndex, uniEquipId: null }, elite: false, row: 10, col: 5 }],
    });
    h.step();
    const u = h.unit(1);
    h.b.drainEvents();
    h.b.dealDamage(null, u, { amount: 1e9, type: 'true' });
    return { h, u };
  }

  test('a lethal hit does not knock him out: form \'doll\', the substitute buff, the fx the client switches on', () => {
    const { h, u } = lethal(1);
    assert.ok(u.alive && u.deployed, 'still on the field');
    assert.equal(u.form, 'doll');
    assert.equal(u.trait.doll, true);
    assert.ok(u.findBuff('trait:substitute'), 'the 20 s <替身>');
    const fx = h.eventsOf('fx').filter((e) => e[1] === 'substitute' || e[1] === 'swap');
    assert.equal(fx.length, 1, JSON.stringify(h.eventsOf('fx')));
    const [kind, x, y, extra] = fx[0].slice(1);
    assert.deepEqual([kind, x, y], ['substitute', 5, 10]);
    assert.deepEqual([fxForm(fx[0]), extra.id, extra.dur], ['doll', u.id, 21], 'the client fades the persona in over the 1 s switch + 20 s');
    // the snapshot a late view or a reconnect starts from
    const info = unitInfo(u);
    assert.deepEqual([info.form, info.skillIndex, info.spine], ['doll', 1, MAKOTO]);
    // and the 20 s form switches him back (fx 'swap' { form: null })
    h.run(21.5);
    assert.deepEqual([u.form, u.trait.doll], [null, false]);
    const back = h.eventsOf('fx').filter((e) => e[1] === 'swap');
    assert.equal(back.length, 1);
    assert.equal(fxForm(back[0]), null);
  });

  test('a view built from that snapshot starts as the 替身 on the skill\'s persona', async () => {
    const { u } = lethal(1);
    const info = unitInfo(u);
    const v = await op({ form: info.form, skillIndex: info.skillIndex });
    assert.equal(clip(v), 'Doll_Skill_2_Loop', '塔纳托斯, no switch clip replayed');
  });
});
