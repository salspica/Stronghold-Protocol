// The room's 最终首领血量 experimental option: R14 Final Assault and R15 Hidden Core pool × 1–100 (integer dial). It is a
// room rule (shared/experimental.js), snapshotted at launch, and only the leader's pool — the sim reads that pool as the
// leader's HP (server/match/finalAssault.js bossPoolHp; server/match/match/bossRounds.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeMatch, DATA } from './harness.js';
import { GameData } from '../../server/match/gamedata.js';
import { bossPoolHp } from '../../server/match/finalAssault.js';
import { BOSS_HP_MIN, BOSS_HP_MAX, experimentalOptions, isExperimental, experimentalKey, sameExperimental } from '../../shared/experimental.js';

test('shared schema: bossHpMul is any integer 1..100 and omitted at ×1', () => {
  assert.equal(BOSS_HP_MIN, 1);
  assert.equal(BOSS_HP_MAX, 100);
  for (const n of [1, 2, 7, 37, 99, 100]) {
    const v = { revivalEnabled: false, disableSharedPool: false, bossHpMul: n };
    assert.equal(isExperimental(v), true, `×${n}`);
    assert.deepEqual(experimentalOptions(v), n > 1 ? { revivalEnabled: false, disableSharedPool: false, bossHpMul: n } : { revivalEnabled: false, disableSharedPool: false });
  }
  for (const bad of [0, 101, -5, 1.5, '10', true, NaN]) {
    assert.equal(isExperimental({ revivalEnabled: false, disableSharedPool: false, bossHpMul: bad }), false, String(bad));
  }
  // the canonical key distinguishes the multiplier, for the room's rule comparison
  const a = { revivalEnabled: false, disableSharedPool: false }, b = { ...a, bossHpMul: 37 };
  assert.notEqual(experimentalKey(a), experimentalKey(b));
  assert.equal(sameExperimental(a, b), false);
  assert.equal(sameExperimental(b, { ...b }), true);
});

test('bossPoolHp: the multiplier scales the leader pool (all difficulties, alive counts and >4 seats)', () => {
  for (const difficulty of ['FUNNY', 'NORMAL', 'HARD', 'ABYSS']) {
    const gd = new GameData(DATA, `mode_multi_${difficulty.toLowerCase()}`);
    for (const n of [1, 2, 3, 4, 8]) {
      const base = bossPoolHp(gd, 'boss_1', n);
      for (const mul of [2, 37, 100]) {
        assert.equal(bossPoolHp(gd, 'boss_1', n, { bossHpMul: mul }), base * mul, `${difficulty} ×${n} ×${mul}`);
      }
      assert.equal(bossPoolHp(gd, 'boss_1', n, { bossHpMul: 1 }), base, '×1 unchanged');
    }
  }
  const solo = new GameData(DATA, 'mode_single_hard');
  assert.equal(bossPoolHp(solo, 'boss_1', 1, { bossHpMul: 37 }), solo.bossPoolHp('boss_1', 1) * 37);
});

for (const hidden of [false, true]) {
  test(`R${hidden ? 15 : 14}: a ×37 room starts its ${hidden ? 'Hidden Core' : 'Final Assault'} pool 37 times the official one`, () => {
    for (const mul of [1, 2, 37, 100]) {
      const experimental = mul > 1 ? { revivalEnabled: false, disableSharedPool: false, bossHpMul: mul } : undefined;
      const h = makeMatch({ humans: 2, difficulty: 'HARD', fake: true, instant: false, experimental }).start();
      h.toPrep(1);
      const m = h.m;
      m.round = hidden ? 15 : 14;
      m.teamLp = 50;
      m.bossId = 'boss_1';
      m.hiddenBossId = 'boss_9';
      m._planBossWaves();
      m.startFinalAssault(hidden);
      const id = hidden ? m.hiddenBossId : m.bossId;
      const want = DATA.bosses[id].bloodPoint.HARD * m.alivePlayers().length * mul;
      assert.equal(m.bossPool.maxHp, want, `×${mul}`);
      assert.equal(m.bossHpMul, mul);
      m.dispose();
    }
  });
}

test('the default room keeps the official pool and the option reaches the lobby DTO', () => {
  const h = makeMatch({ humans: 4, difficulty: 'HARD', fake: true, instant: false }).start();
  h.toPrep(1);
  h.m.round = 14;
  h.m._planBossWaves();
  h.m.startFinalAssault(false);
  assert.equal(h.m.bossHpMul, 1);
  assert.equal(h.m.bossPool.maxHp, DATA.bosses[h.m.bossId].bloodPoint.HARD * 4);
  h.m.dispose();
});
