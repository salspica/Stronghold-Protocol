// test/content/diy_effects.test.js — every skill of the two 自选 operators added on 2026-10-27 has a client-visible effect.
// Their official battle prefabs are NOT in the local fx index (public/assets/local/fx/index.json: no char_4217_makoto /
// char_4182_oblvns), so render/vfx has nothing to draw and the kits' own `battle.fx` events are the only effects — a
// skill that emits none looks broken (user report 2026-10-27). Run: node --test test/content/diy_effects.test.js

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeBattle, enemyRec, checkInvariants } from '../helpers/battleHarness.js';

const ENEMIES = { enemy_dummy: enemyRec({ key: 'enemy_dummy', hp: 1e9, speed: 0, mass: 0 }) };
const OPS = [
  { char: 'char_4217_makoto', name: '结城理', cast: 'personaCast' },
  { char: 'char_4182_oblvns', name: '丰川祥子', cast: 'note' },
];

/** Cast the picked skill on a DIY 6★ piece facing one dummy and return the cast's fx tuples. */
function cast(charId, skillIndex) {
  const h = makeBattle({
    defs: { enemies: ENEMIES }, timeLimit: 600, autoFinish: false, seed: 5,
    flags: { dpPerSec: 0, dpMax: 999 }, hooks: ['skillStart', 'skillEnd'],
    units: [{ uid: 1, diy: { slot: 6, charId, skillIndex, uniEquipId: null }, elite: false, row: 10, col: 5 }],
  });
  h.step();
  const u = h.unit(1);
  h.spawn('enemy_dummy', { pos: [10, 7] });
  u.skill.gainSp(999);
  assert.ok(h.runUntil(() => u.skill.activations >= 1, 3), `${charId} skill ${skillIndex + 1}: cast`);
  h.run(2.5);
  checkInvariants(h.b);
  assert.equal(h.b.errors.length, 0, JSON.stringify(h.b.errors[0]));
  return h.eventsOf('fx');
}

for (const op of OPS) {
  for (let skill = 0; skill < 3; skill++) {
    test(`${op.name} skill ${skill + 1}: the client gets an effect`, () => {
      const fx = cast(op.char, skill);
      assert.ok(fx.length > 0, 'some fx');
      for (const e of fx) {
        assert.ok(Number.isFinite(e[2]) && Number.isFinite(e[3]), `fx ${e[1]} has a position`);
        assert.ok(e[4] && e[4].id != null, `fx ${e[1]} names its owner`);
      }
      assert.ok(fx.some((e) => e[1] === op.cast), `the cast's own ${op.cast} fx`);
    });
  }
}

test('结城理: every attack of a running skill sparks on its target too (not only the cast)', () => {
  const fx = cast('char_4217_makoto', 0);
  assert.ok(fx.some((e) => e[1] === 'personaHit' && e[4]?.target != null), 'a hit spark');
});
