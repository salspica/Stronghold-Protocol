// The fork's hand-designed 自选 特质 for 娜仁图亚 / 阿斯卡纶 / 斩业星熊 / 望 / 涤火杰西卡 (tools/build-data.mjs
// DIY_GARRISON_IDS + buildDiyGarrisons): on-gain rewards, prep-start random operators, and the battle/meta layer gains.
// The pool numbers and the 结城理 / 丰川祥子 / 克莱门莎 traits live in diy-bonds.test.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { KITTED_CHARS } from '../../server/sim/content/kits/index.js';
import { hasGeneratedData } from '../../server/sim/simdata.js';
import { makeBattle, checkInvariants as checkBattle, enemyRec, chessRec } from '../helpers/battleHarness.js';
import { DATA, makeMatch, legalTileFor } from './harness.js';

const REAL = { skip: !hasGeneratedData() };
const T5A = 'chess_char_5_diy1_a';
const NARANT = 'char_4138_narant';
const ASCLN = 'char_4132_ascln';
const HSGMA2 = 'char_1044_hsgma2';
const WANG = 'char_2027_wang';
const JESCA2 = 'char_1034_jesca2';
const IRENE = 'char_4009_irene';
const B = (layers = 0) => ({ count: 3, active: true, tier: 1, layers });

function solo() {
  const h = makeMatch({ mode: 'solo', seats: [{ seat: 0, playerId: 'p_0', name: 'P0', isBot: false, connected: true }], seed: 21,
    experimental: { revivalEnabled: false, disableSharedPool: false, customDiy: true } }).start();
  h.toPrep(1);
  const p0 = h.ps('p_0');
  // a clean seat (the match's opening hand / layers would blur the trait numbers)
  for (const p of [...p0.board.values(), ...p0.hand.filter(Boolean), ...p0.temp.filter(Boolean)]) if (p.kind === 'chess') p0.returnCopies(p);
  p0.board.clear(); p0.hand.fill(null); p0.temp.fill(null); p0.offers.length = 0;
  p0.funds = 20; p0.layers = {}; p0.pendingFunds = 0; p0.shop.freeRefreshes = 0; p0.bandId = null;
  p0.recompute();
  return { h, p0 };
}
function pick(h, p0, charId, slot = T5A) {
  assert.equal(p0.setDiy({ [slot]: { charId, skillIndex: 0 } }, { kitted: [...KITTED_CHARS] }), true);
  p0.initDiyStock(new Set());
  p0.recompute();
  return p0.acquireChess(slot, { source: 'buy' });
}
function deploy(h, p0, piece) {
  const t = legalTileFor(h.m, p0, piece.id);
  assert.ok(t, `a tile for ${piece.id}`);
  assert.deepEqual(h.m.handle('p_0', { t: 'g.move', uid: piece.uid, to: { area: 'board', row: t[0], col: t[1] } }), { ok: true });
}
const handIds = (p0) => [...p0.hand.filter(Boolean)].map((p) => p.id);
const added = (before, after) => after.filter((id) => !before.includes(id));

test('娜仁图亚: 获取时 黄沙罗盘 + 萨尔贡浓茶 + 迅捷作战粮; 休整期开始 one of 缇缇/佩佩/异客; 萨尔贡技能 +3', REAL, () => {
  const { h, p0 } = solo();
  const before = handIds(p0);
  const p = pick(h, p0, NARANT);
  assert.deepEqual(added(before, handIds(p0)).filter((id) => id.startsWith('chess_item_')).sort(), ['chess_item_2_04_e_a', 'chess_item_3_05_e_a', 'chess_item_6_07_e_a'], 'on gain');
  deploy(h, p0, p);
  const afterGain = handIds(p0);
  h.m.dispatch(p0, 'onRoundStart', { round: h.m.round });
  const got = handIds(p0).filter((id) => !afterGain.includes(id));
  assert.equal(got.length, 1, `one random operator: ${got}`);
  assert.ok(['chess_char_5_02_a', 'chess_char_6_06_a', 'chess_char_6_05_a'].includes(got[0]));
  h.m.dispose?.();

  // battle: a 萨尔贡 ally's skill start (a synthetic bond carrier)
  const b = makeBattle({ customDiy: true,
    autoFinish: false, timeLimit: 200, seed: 3,
    defs: { chess: { allyS: chessRec({ id: 'allyS', name: 'A', bonds: ['sargonShip'] }) } },
    bonds: { sargonShip: B(), swiftShip: B(), preciShip: B() },
    units: [{ uid: 1, diy: { slot: 5, charId: NARANT, skillIndex: 0 }, elite: false, row: 10, col: 5 }, { uid: 2, chessId: 'allyS', row: 10, col: 6 }],
  });
  b.step();
  const ally = b.unit(2);
  b.b.emit('skillStart', { unit: ally, skill: ally.skill });
  b.step(1);
  assert.deepEqual(b.result().perPlayer.p1.layerGains, { sargonShip: 3, swiftShip: 3, preciShip: 3 });
  checkBattle(b.b);
});

test('阿斯卡纶: 获取时 two 谢拉格不融冰; 范围内敌人冻结 +3', REAL, () => {
  const { h, p0 } = solo();
  const before = p0.hand.filter(Boolean).filter((x) => /chess_item_5_02/.test(x.id)).length;
  pick(h, p0, ASCLN);
  const got = p0.hand.filter(Boolean).filter((x) => /chess_item_5_02/.test(x.id)).length;
  // two copies merge into the golden item
  assert.equal(got - before, 1, 'two copies were granted and merged');
  assert.equal(p0.hand.filter(Boolean).filter((x) => x.id === 'chess_item_5_02_e_b').length, 1);
  h.m.dispose?.();

  const b = makeBattle({ customDiy: true,
    autoFinish: false, timeLimit: 200, seed: 3,
    defs: { enemies: { e1: enemyRec({ key: 'e1', hp: 5000, speed: 0, mass: 0 }) } },
    bonds: { kjeragShip: B(), skillfulShip: B(), swiftShip: B() },
    units: [{ uid: 1, diy: { slot: 5, charId: ASCLN, skillIndex: 0 }, elite: false, row: 10, col: 5 }],
  });
  b.step();
  const e = b.spawn('e1', { pos: [10, 6] });
  b.b.applyStatus(e, 'freeze', { duration: 5 });
  b.step(1);
  assert.deepEqual(b.result().perPlayer.p1.layerGains, { kjeragShip: 3, skillfulShip: 3, swiftShip: 3 });
  checkBattle(b.b);
});

test('斩业星熊: 被击倒时自身盟约 +50（精锐 +100）', REAL, () => {
  for (const [elite, want] of [[false, 50], [true, 100]]) {
    const b = makeBattle({ customDiy: true,
      autoFinish: false, timeLimit: 200, seed: 3,
      bonds: { kazimierzShip: B(), indomShip: B(), raidShip: B(), preciShip: B() },
      units: [{ uid: 1, diy: { slot: 5, charId: HSGMA2, skillIndex: 0 }, elite, row: 10, col: 5 }],
    });
    b.step();
    const u = b.unit(1);
    b.b.dealDamage(null, u, { amount: 1e9, type: 'true' });
    b.step(1);
    assert.deepEqual(b.result().perPlayer.p1.layerGains, { kazimierzShip: want, indomShip: want, raidShip: want, preciShip: want });
    checkBattle(b.b);
  }
});

test('艾丽妮: 被击倒时自身盟约 +30（精锐 +60）', REAL, () => {
  for (const [elite, want] of [[false, 30], [true, 60]]) {
    const b = makeBattle({ customDiy: true,
      autoFinish: false, timeLimit: 200, seed: 3,
      bonds: { egirShip: B(), swiftShip: B(), raidShip: B() },
      units: [{ uid: 1, diy: { slot: 5, charId: IRENE, skillIndex: 0 }, elite, row: 10, col: 5 }],
    });
    b.step();
    const u = b.unit(1);
    b.b.dealDamage(null, u, { amount: 1e9, type: 'true' });
    b.step(1);
    assert.deepEqual(b.result().perPlayer.p1.layerGains, { egirShip: want, swiftShip: want, raidShip: want });
    checkBattle(b.b);
  }
});

test('望: 获取时 缪尔赛思 + 炎国短刀; 休整期结束 per gained operator +10', REAL, () => {
  const { h, p0 } = solo();
  const p = pick(h, p0, WANG);
  assert.ok(handIds(p0).includes('chess_char_6_11_a'));
  assert.ok(handIds(p0).includes('chess_item_3_04_e_a'));
  deploy(h, p0, p);
  for (const b of ['yanShip', 'skillfulShip', 'arcaneShip']) p0.bondCountBonus[b] = 20;
  p0.recompute();
  p0.round.gainedChess = 2;
  h.m.dispatch(p0, 'onPrepEnd', { round: h.m.round });
  for (const b of ['yanShip', 'skillfulShip', 'arcaneShip']) assert.equal(p0.layers[b], 20, `${b}: 2 gained × 10`);
  h.m.dispose?.();
});

test('涤火杰西卡: 休整期开始 one of 维娜/号角/烛煌; 休整期结束 per distinct-tier Victoria +10', REAL, () => {
  const { h, p0 } = solo();
  const p = pick(h, p0, JESCA2);
  deploy(h, p0, p);
  h.m.dispatch(p0, 'onRoundStart', { round: h.m.round });
  const got = handIds(p0).filter((id) => id === 'chess_char_6_07_a' || id === 'chess_char_5_08_a' || id === 'chess_char_5_03_a');
  assert.equal(got.length, 1, `one random Victoria operator: ${got}`);
  // the granted operator's own on-gain and the prep-end traits of other pieces would blur the count: drop it and reset
  for (const piece of [...p0.hand.filter(Boolean), ...p0.temp.filter(Boolean)]) if (piece.kind === 'chess') p0.returnCopies(piece);
  p0.layers = {};
  for (const b of ['victoriaShip', 'skillfulShip', 'miraShip']) p0.bondCountBonus[b] = 20;
  p0.recompute();
  // the piece is a tier-5 Victoria member; a tier-6 Victoria (焰影苇草, IN_BATTLE only) on the board makes two tiers
  const vic = p0.acquireChess('chess_char_6_08_a', { source: 'buy' });
  deploy(h, p0, vic);
  p0.layers = {};
  p0.recompute();
  h.m.dispatch(p0, 'onPrepEnd', { round: h.m.round });
  for (const b of ['victoriaShip', 'skillfulShip', 'miraShip']) assert.equal(p0.layers[b], 20, `${b}: 2 tiers × 10`);
  h.m.dispose?.();
});
