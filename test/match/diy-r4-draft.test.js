// The custom-DIY room's R4 机变: each seat independently chooses one of two of its own 自选 operators (or 缪尔赛思 when it
// has fewer than two picks). It is a personal PREP choice: no turn order, no shared cards, no timer; Ready waits.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeMatch } from './harness.js';

const T5A = 'chess_char_5_diy1_a';
const T5B = 'chess_char_5_diy2_a';
const MUELSYSE = 'chess_char_6_11_a';

function start(diy, customDiy = true) {
  const seats = [{ seat: 0, playerId: 'p_0', name: 'P0', isBot: false, connected: true, diy }];
  const h = makeMatch({ mode: 'solo', seats, seed: 5,
    experimental: { revivalEnabled: false, disableSharedPool: false, customDiy } }).start();
  h.toPrep(1);
  return h;
}
const r4 = (h) => { h.m.round = 4; h.m.afterRoundStart(); };

test('R4 custom-DIY 机变: two own picks, independent personal choice, picking grants that operator', () => {
  const h = start({ [T5A]: { charId: 'char_4231_clemnt', skillIndex: 0 }, [T5B]: { charId: 'char_4138_narant', skillIndex: 0 } });
  const ps = h.ps('p_0');
  r4(h);
  const pc = ps.personalChoice;
  assert.equal(pc.kind, 'diy');
  assert.equal(pc.cards.length, 2);
  assert.deepEqual(new Set(pc.cards.map((c) => c.slotId)), new Set([T5A, T5B]));
  assert.deepEqual(new Set(pc.cards.map((c) => c.name)), new Set(['克莱门莎', '娜仁图亚']));
  assert.equal(h.m.pickPersonalChoice(ps, 0, pc.id).ok, true);
  assert.equal(ps.personalChoice, null);
  assert.equal(ps.hand.filter(Boolean).length, 1);
  assert.equal(ps.hand.filter(Boolean)[0].id, pc.cards[0].slotId);
  h.m.dispose();
});

test('fewer than two own picks: the missing card is 缪尔赛思; zero picks gives two of her', () => {
  const h = start({ [T5A]: { charId: 'char_4231_clemnt', skillIndex: 0 } });
  const ps = h.ps('p_0');
  r4(h);
  assert.equal(ps.personalChoice.cards.length, 2);
  assert.equal(ps.personalChoice.cards.filter((c) => c.charId === 'char_249_mlyss').length, 1);
  assert.equal(ps.personalChoice.cards.find((c) => c.charId === 'char_249_mlyss').slotId, null);
  h.m.dispose();

  const empty = start({});
  const p2 = empty.ps('p_0');
  r4(empty);
  assert.deepEqual(p2.personalChoice.cards.map((c) => [c.charId, c.slotId]), [['char_249_mlyss', null], ['char_249_mlyss', null]]);
  assert.equal(empty.m.pickPersonalChoice(p2, 0, p2.personalChoice.id).ok, true);
  assert.ok(p2.hand.filter(Boolean).some((p) => p.id === MUELSYSE));
  empty.m.dispose();
});

test('the R4 机变 is off without experimental.customDiy', () => {
  const h = start({ [T5A]: { charId: 'char_4231_clemnt', skillIndex: 0 } }, false);
  r4(h);
  assert.equal(h.ps('p_0').personalChoice, null);
  h.m.dispose();
});
