// test/match/diy-bonds.test.js — 0.2.0 自选编队: a 自选 piece is a member of each of its derived bonds (data/backups.json
// diy.operators[charId].bonds — its factions, else 协防; "甄选加入的干员会根据其实际阵营所属分配核心盟约…一个或数个", PRTS 卫戍协议：
// 盟约 下半/PRTS盟约记录) in every place membership is decided: the match's bond counts (bondsMeta through the player's
// data view — BOARD / BOARD_AND_DECK distinct pieces: the normal and elite copies of one slot count once; 煌 counts for
// 炎 and 维多利亚; 绝技 counts a 自选 elite like any elite), the views (m.private / m.public bonds), the battle input's
// bond snapshot, and the sim's bond effects (they read the unit's def.bonds: 叙拉古 on deployment, 协防 ×1.2 / elite ×1.4).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { KITTED_CHARS } from '../../server/sim/content/kits/index.js';
import { hasGeneratedData } from '../../server/sim/simdata.js';
import { makeBattle, checkInvariants as checkBattle, enemyRec } from '../helpers/battleHarness.js';
import { DATA, makeMatch, legalTileFor, giveItem } from './harness.js';

const REAL = { skip: !hasGeneratedData() };
const T5A = 'chess_char_5_diy1_a';
const T5B = 'chess_char_5_diy2_a';
const T6A = 'chess_char_6_diy1_a';
const HUANG = 'char_017_huang'; // 煌: 炎 + 维多利亚 (both from her 隐藏势力)
const CROSLY = 'char_1502_crosly'; // 弑君者: 叙拉古
const SHARP = 'char_609_acguad'; // a prototype: 协防
const OPS = DATA.backups?.diy?.operators ?? {};

function soloMatch() {
  const seats = [{ seat: 0, playerId: 'p_0', name: 'P0', isBot: false, connected: true }];
  const h = makeMatch({ mode: 'solo', seats, seed: 21 }).start();
  h.toPrep(1);
  return h;
}
/** Slot `picks` for p_0 now (kit list widened for operators whose kit is still being written) and give it stock. */
function slot(h, picks) {
  const p0 = h.ps('p_0');
  assert.equal(p0.setDiy(picks, { kitted: [...KITTED_CHARS, HUANG, CROSLY] }), true);
  p0.initDiyStock(new Set());
  p0.recompute();
  return p0;
}
function deploy(h, ps, id) {
  const p = ps.acquireChess(id, { source: 'buy' });
  const t = legalTileFor(h.m, ps, p.id);
  assert.ok(t, `a tile for ${id}`);
  assert.deepEqual(h.m.handle(ps.playerId, { t: 'g.move', uid: p.uid, to: { area: 'board', row: t[0], col: t[1] } }), { ok: true });
  return p;
}

test('the derived bonds of the data: each owned pick its core bonds or 协防, 煌 and the three hand-designed picks several, every prototype 协防 (read from the data)', REAL, () => {
  const owned = DATA.backups.diy.ownedPool; // never hard-coded: the pool changes (焰狐龙梓兰 left it as a collab operator)
  const core = new Set(Object.entries(DATA.bonds).filter(([, b]) => b && b.isCore).map(([id]) => id));
  // tools/build-data.mjs DIY_BOND_OVERRIDES: a hand-designed set (the owner's decisions of 2026-10-27); their add-on
  // bonds have an empty powerIdList and cannot be derived
  const HAND = {
    char_4182_oblvns: ['siracusaShip', 'swiftShip', 'arcaneShip'],
    char_4217_makoto: ['lateranoShip', 'visiShip', 'miraShip'],
    char_4231_clemnt: ['egirShip', 'swiftShip', 'indomShip'],
  };
  for (const id of owned) {
    const b = OPS[id].bonds;
    assert.ok(b.length >= 1, id);
    if (HAND[id]) { assert.deepEqual(b, HAND[id], `${id}: hand-designed`); continue; }
    assert.ok((b.length === 1 && b[0] === 'emptyShip') || b.every((x) => core.has(x)), `${id}: ${b.join(', ')}`);
  }
  assert.deepEqual(OPS[HUANG].bonds, ['yanShip', 'victoriaShip']);
  assert.deepEqual(owned.filter((id) => OPS[id].bonds.length > 1).sort(), [HUANG, 'char_4182_oblvns', 'char_4217_makoto', 'char_4231_clemnt'].sort(), '煌 + the three hand-designed picks');
  assert.deepEqual(OPS.char_300_phenxi.bonds, ['lateranoShip']);
  assert.deepEqual(OPS.char_4098_vvana.bonds, ['kazimierzShip']);
  assert.deepEqual(OPS[CROSLY].bonds, ['siracusaShip']);
  for (const id of [...DATA.backups.diy.prototypes[5], ...DATA.backups.diy.prototypes[6]]) assert.deepEqual(OPS[id].bonds, ['emptyShip'], id);
  // the three hand-designed picks carry one 卫戍特质 id per form (DIY_GARRISON_IDS); no other pick carries one
  for (const [id, g] of Object.entries(OPS)) {
    if (id === 'char_4182_oblvns') assert.deepEqual(g.garrisons, { normal: ['garrison_901_a'], elite: ['garrison_901_b'] });
    else if (id === 'char_4217_makoto') assert.deepEqual(g.garrisons, { normal: ['garrison_900_a'], elite: ['garrison_900_b'] });
    else if (id === 'char_4231_clemnt') assert.deepEqual(g.garrisons, { normal: ['garrison_902_a'], elite: ['garrison_902_b'] });
    else assert.equal(g.garrisons, undefined, `${id}: no 特质 (PRTS 甄选加入的干员不会拥有任何特质)`);
  }
});

test('煌 counts for 炎 and 维多利亚; its normal and elite copies count once; views and the battle input agree', REAL, () => {
  const h = soloMatch();
  const p0 = slot(h, { [T5A]: { charId: HUANG, skillIndex: 0 } });
  const before = { yan: p0.bonds.yanShip?.count ?? 0, vic: p0.bonds.victoriaShip?.count ?? 0 };
  deploy(h, p0, T5A);
  assert.equal(p0.bonds.yanShip.count, before.yan + 1, '炎');
  assert.equal(p0.bonds.victoriaShip.count, before.vic + 1, '维多利亚');
  // a second copy in the hand: still one distinct member (BOARD counts the slot once)
  p0.acquireChess(T5A, { source: 'buy' });
  assert.equal(p0.bonds.yanShip.count, before.yan + 1);
  h.m.flush(true);
  const priv = h.lastTo('p_0', 'm.private');
  assert.equal(priv.bonds.find((b) => b.bondId === 'yanShip').count, before.yan + 1);
  assert.equal(priv.bonds.find((b) => b.bondId === 'victoriaShip').count, before.vic + 1);
  const pub = h.lastBc('m.public');
  assert.equal(pub.players[0].bonds.find((b) => b.bondId === 'victoriaShip').count, before.vic + 1, 'm.public (a teammate\'s strip)');
  const input = p0.battleInput();
  assert.equal(input.bonds.yanShip.count, before.yan + 1, 'the battle input\'s bond snapshot');
  h.invariants();
  h.m.dispose();
});

test('协防: two 自选 prototypes (a tier-5 and a tier-6 slot) enable it; a preset 协防 chess with one too; 绝技 counts 自选 elites', REAL, () => {
  const h = soloMatch();
  const p0 = slot(h, { [T5B]: { charId: SHARP }, [T6A]: { charId: SHARP } });
  assert.ok(!p0.bonds.emptyShip?.active);
  deploy(h, p0, T5B);
  assert.equal(p0.bonds.emptyShip.count, 1);
  deploy(h, p0, T6A);
  assert.equal(p0.bonds.emptyShip.count, 2, 'two slots = two chess (like any operator who is two chess) [ASSUMED]');
  assert.equal(p0.bonds.emptyShip.active, true);
  // 绝技 (BOARD_ALL_CHESS): every elite on the board — a 自选 elite included
  const sunt0 = p0.bonds.suntShip?.count ?? 0;
  deploy(h, p0, 'chess_char_5_diy2_b');
  assert.equal(p0.bonds.suntShip.count, sunt0 + 1);
  h.invariants();
  h.m.dispose();
});

test('sim: a 叙拉古 自选 piece gets 叙拉古\'s deployment buff; a 协防 one the ×1.2 damage (elite ×1.4)', REAL, () => {
  const bonds = { siracusaShip: { count: 3, active: true, tier: 1, layers: 10 }, emptyShip: { count: 2, active: true, tier: 1, layers: 0 } };
  const h = makeBattle({
    units: [
      { diy: { slot: 5, charId: CROSLY, skillIndex: 0 }, row: 10, col: 4 },
      { diy: { slot: T5B, charId: SHARP }, row: 10, col: 6 },
      { diy: { slot: 6, charId: SHARP }, elite: true, row: 11, col: 6 },
    ],
    bonds,
    timeLimit: 10,
  });
  h.run(1);
  const crosly = h.allies().find((u) => u.def?.charId === CROSLY);
  const [normal, elite] = [h.allies().find((u) => u.def?.charId === SHARP && !u.def.golden), h.allies().find((u) => u.def?.charId === SHARP && u.def.golden)];
  assert.ok(crosly && normal && elite, 'the three 自选 pieces are fielded');
  assert.deepEqual(crosly.def.bonds, ['siracusaShip']);
  assert.ok(crosly.hasBuff('bond:siracusa'), '叙拉古: ASPD on deployment');
  assert.ok(!normal.hasBuff('bond:siracusa'), 'not for a non-member');
  const scale = (u) => u.buffs.filter((b) => /empty/i.test(b.key)).map((b) => b.mods?.dmgDealtMul).find((x) => x != null);
  const bb = DATA.bonds.emptyShip;
  assert.ok(bb);
  assert.equal(scale(normal), 1.2, '协防 member ×1.2');
  assert.equal(scale(elite), 1.4, '协防 elite member ×1.4');
  assert.equal(scale(crosly), undefined, '弑君者 is no 协防 member');
  checkBattle(h.b);
});

// ---------------------------------------------------------------------------------------------------------------
// the two hand-designed picks' 卫戍特质 (tools/build-data.mjs DIY_GARRISON_IDS, docs/DATA.md §18)

const MAKOTO = 'char_4217_makoto';
const OBLVNS = 'char_4182_oblvns';
const B = (layers = 0) => ({ count: 3, active: true, tier: 1, layers });
const layersOf = (h) => h.result().perPlayer.p1.layerGains;

test('结城理 的特质: 每次切换 <替身> 或被击倒，使已激活的自身盟约 +10（精锐 +20）', REAL, () => {
  for (const [elite, want] of [[false, 10], [true, 20]]) {
    const h = makeBattle({
      autoFinish: false, timeLimit: 200, seed: 3,
      bonds: { lateranoShip: B(), visiShip: B(), miraShip: B(), yanShip: B() },
      units: [{ uid: 1, diy: { slot: 5, charId: MAKOTO, skillIndex: 0, uniEquipId: null }, elite, row: 10, col: 5 }],
    });
    h.step();
    const u = h.unit(1);
    const own = { lateranoShip: want, visiShip: want, miraShip: want };
    h.b.dealDamage(null, u, { amount: 1e9, type: 'true' });
    h.step(1);
    assert.deepEqual([u.alive, u.trait.doll], [true, true], `elite ${elite}: the <替身> took the hit`);
    assert.deepEqual(layersOf(h), own, `elite ${elite}: body → <替身>`);
    // knocked out as the <替身> → the second trigger (after the 1 s switch, whose 不死 absorbs hits)
    h.run(1.2);
    h.b.dealDamage(null, u, { amount: 1e9, type: 'true' });
    h.step(1);
    assert.equal(u.alive, false, `elite ${elite}: knocked out`);
    assert.deepEqual(layersOf(h), { lateranoShip: 2 * want, visiShip: 2 * want, miraShip: 2 * want }, `elite ${elite}: + ${want} on the knock-out`);
    // 炎 is active but not one of his bonds
    assert.equal(layersOf(h).yanShip, undefined);
    checkBattle(h.b);
  }
  // the switch back is a trigger too: a lethal hit, then the standin's expiry
  const h = makeBattle({
    autoFinish: false, timeLimit: 200, seed: 3,
    bonds: { lateranoShip: B(), visiShip: B(), miraShip: B() },
    units: [{ uid: 1, diy: { slot: 5, charId: MAKOTO, skillIndex: 0, uniEquipId: null }, elite: false, row: 10, col: 5 }],
  });
  h.step();
  const u = h.unit(1);
  h.b.dealDamage(null, u, { amount: 1e9, type: 'true' });
  h.step(1);
  h.run(21.5);
  assert.deepEqual([u.alive, u.trait.doll], [true, false]);
  assert.deepEqual(layersOf(h), { lateranoShip: 20, visiShip: 20, miraShip: 20 }, '<替身> → body');
  checkBattle(h.b);
});

test('丰川祥子 的特质: 休整期结束时，本回合每刷新过 1 次，使已激活的自身盟约 +15（精锐 +30）', REAL, () => {
  for (const [elite, want] of [[false, 15], [true, 30]]) {
    const h = soloMatch();
    const p0 = slot(h, { [T5A]: { charId: OBLVNS, skillIndex: 0 } });
    p0.bandId = null; // isolate from the band's own prep effects
    deploy(h, p0, elite ? T5A.replace(/_a$/, '_b') : T5A);
    for (const b of ['siracusaShip', 'swiftShip', 'arcaneShip']) p0.bondCountBonus[b] = 20;
    p0.recompute();
    assert.deepEqual(['siracusaShip', 'swiftShip', 'arcaneShip'].map((b) => !!p0.bonds[b]?.active), [true, true, true], 'her three bonds are active');
    p0.round.refreshes = 2;
    h.m.dispatch(p0, 'onPrepEnd', { round: h.m.round });
    for (const b of ['siracusaShip', 'swiftShip', 'arcaneShip']) assert.equal(p0.layers[b], 2 * want, `elite ${elite}: ${b} + ${2 * want}`);
  }
  // only for the copy on the board (character_target_inboard): in hand it does not fire
  const h = soloMatch();
  const p0 = slot(h, { [T5A]: { charId: OBLVNS, skillIndex: 0 } });
  p0.bandId = null;
  p0.acquireChess(T5A, { source: 'buy' });
  for (const b of ['siracusaShip', 'swiftShip', 'arcaneShip']) p0.bondCountBonus[b] = 20;
  p0.recompute();
  p0.round.refreshes = 2;
  h.m.dispatch(p0, 'onPrepEnd', { round: h.m.round });
  for (const b of ['siracusaShip', 'swiftShip', 'arcaneShip']) assert.equal(p0.layers[b] || 0, 0, `${b}: only on the board`);
});

test('克莱门莎 的特质: 每击杀 1 名敌人，阿戈尔 +10、迅捷 +5、不屈 +5（精锐翻倍）', REAL, () => {
  for (const [elite, want] of [[false, { egirShip: 10, swiftShip: 5, indomShip: 5 }], [true, { egirShip: 20, swiftShip: 10, indomShip: 10 }]]) {
    const h = makeBattle({
      autoFinish: false, timeLimit: 200, seed: 3,
      defs: { enemies: { e1: enemyRec({ key: 'e1', hp: 100, speed: 0, mass: 0 }) } },
      bonds: { egirShip: B(), swiftShip: B(), indomShip: B(), yanShip: B() },
      units: [{ uid: 1, diy: { slot: 5, charId: 'char_4231_clemnt', skillIndex: 0, uniEquipId: null }, elite, row: 10, col: 5 }],
    });
    h.step();
    const u = h.unit(1);
    const e = h.spawn('e1', { pos: [10, 6] });
    h.b.dealDamage(u, e, { amount: 1e9, type: 'true' });
    h.step(1);
    assert.equal(e.alive, false, `elite ${elite}: the enemy is killed`);
    assert.deepEqual(h.result().perPlayer.p1.layerGains, want, `elite ${elite}`);
    // 炎 is active but not one of hers
    assert.equal(h.result().perPlayer.p1.layerGains.yanShip, undefined);
    checkBattle(h.b);
  }
});

test('结城理 的特质 counts a 变形同构体-granted bond (自身盟约 is read at runtime, not a fixed list)', REAL, () => {
  const h = makeBattle({
    autoFinish: false, timeLimit: 200, seed: 3,
    bonds: { lateranoShip: B(), visiShip: B(), miraShip: B(), yanShip: B() },
    units: [{
      uid: 1, diy: { slot: 5, charId: MAKOTO, skillIndex: 0, uniEquipId: null }, elite: false, row: 10, col: 5,
      items: ['chess_item_6_09_e_a', 'chess_item_3_04_e_a'], // 变形同构体 + 炎国短刀 → 视为【炎】成员
    }],
  });
  h.step();
  const u = h.unit(1);
  assert.ok(u.def.bonds.includes('lateranoShip'));
  h.b.dealDamage(null, u, { amount: 1e9, type: 'true' });
  h.step(1);
  assert.deepEqual(h.result().perPlayer.p1.layerGains, { lateranoShip: 10, visiShip: 10, miraShip: 10, yanShip: 10 }, '炎 gains too');
  checkBattle(h.b);
});

test('丰川祥子 的特质 reads 自身盟约 at runtime: a 变形同构体-granted bond gains at 休整期结束 too', REAL, () => {
  const h = soloMatch();
  const p0 = slot(h, { [T5A]: { charId: OBLVNS, skillIndex: 0 } });
  p0.bandId = null;
  const p = deploy(h, p0, T5A);
  for (const id of ['chess_item_6_09_e_a', 'chess_item_4_08_e_b']) { // 变形同构体 + 拉特兰桥夹 → 视为【拉特兰】成员
    const it = giveItem(h.m, p0, id);
    assert.deepEqual(h.m.handle('p_0', { t: 'g.equip', itemUid: it.uid, targetUid: p.uid }), { ok: true });
  }
  for (const b of ['siracusaShip', 'swiftShip', 'arcaneShip', 'lateranoShip']) p0.bondCountBonus[b] = 20;
  p0.recompute();
  assert.deepEqual(['siracusaShip', 'swiftShip', 'arcaneShip', 'lateranoShip'].map((b) => !!p0.bonds[b]?.active), [true, true, true, true], 'all four are active');
  p0.round.refreshes = 2;
  h.m.dispatch(p0, 'onPrepEnd', { round: h.m.round });
  for (const b of ['siracusaShip', 'swiftShip', 'arcaneShip', 'lateranoShip']) assert.equal(p0.layers[b], 30, `${b}: +30 (15 × 2)`);
});
