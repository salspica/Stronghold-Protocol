// Regression: the custom-DIY bond package must actually load and apply. A wrong relative import in
// bonds/addon/battle.js once made every add-on bond activate but do nothing (the content loader swallowed the module
// error), which is exactly the "盟约激活了但不生效" report. These use the real custom-DIY records.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeBattle } from '../helpers/battleHarness.js';

const six = (charId) => Array.from({ length: 6 }, (_, i) => ({
  uid: i + 1, diy: { slot: 5, charId, skillIndex: 0 }, row: 10, col: 4 + i,
}));
const start = (bondId, layers, charId) => {
  const h = makeBattle({ customDiy: true, autoFinish: false, timeLimit: 10, seed: 3,
    bonds: { [bondId]: { count: 6, active: true, tier: 1, layers } }, units: six(charId) });
  h.step();
  return h;
};

test('add-on bond effects load for a custom-DIY unit (skillfulShip aura)', () => {
  const h = start('skillfulShip', 10, 'char_4231_clemnt');
  const u = h.unit(1);
  assert.ok(u.def.bonds.includes('skillfulShip'));
  assert.ok(u.buffs.some((b) => b.key === 'bond:skillfulShip'));
});

test('6 萨尔贡 at 1000/9999 applies final damage ×1→×5', () => {
  const low = start('sargonShip', 1000, 'char_4138_narant');
  assert.equal(low.unit(1).buffs.some((b) => b.key === 'bond:sargon:final'), false);
  const high = start('sargonShip', 9999, 'char_4138_narant');
  const buff = high.unit(1).buffs.find((b) => b.key === 'bond:sargon:final');
  assert.equal(buff.mods.dmgDealtMul, 5);
});

test('6 拉特兰 at 9999 ignores 70 % DEF and gains +2000 flat ATK; 999 keeps neither', () => {
  const low = start('lateranoShip', 999, 'char_4217_makoto');
  assert.equal(low.unit(1).buffs.some((b) => b.key.startsWith('bond:laterano:pen')), false);
  const high = start('lateranoShip', 9999, 'char_4217_makoto');
  const pen = high.unit(1).buffs.find((b) => b.key === 'bond:laterano:pen');
  const flat = high.unit(1).buffs.find((b) => b.key === 'bond:laterano:flat');
  assert.equal(pen.mods.defIgnorePct, 0.7);
  assert.equal(flat.mods.atkFinal, 2000);
});
