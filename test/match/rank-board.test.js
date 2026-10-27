import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RankBoard, createRankBoard } from '../../server/match/rankBoard.js';
import { validateC2S } from '../../shared/protocol.js';

const players = ['p0', 'p1', 'p2'];
const totals = (b) => Object.fromEntries([...b.totals()].sort(([a], [b]) => a.localeCompare(b)));
const packetPlayer = (b, playerId) => b.packet([playerId]).players[0];

test('normal and unite fields add up in one round; fields keep their own cumulative rows', () => {
  const b = createRankBoard();
  b.begin(1, 'normal');
  assert.ok(b.put('n:p0', { p0: 100 }));
  assert.ok(b.put('n:p1', { p1: 80 }));
  b.begin(1, 'unite');
  assert.ok(b.put('u', { p0: 20, p1: 40 }));
  assert.ok(b.put('u', { p0: 30, p1: 45 }), 'a later report replaces the earlier one');
  assert.deepEqual(totals(b), { p0: 130, p1: 125 });
  assert.deepEqual(b.packet(players).players, [
    { playerId: 'p0', roundDamage: 130, roundBountyOwn: 0, roundBountyUnite: 0 },
    { playerId: 'p1', roundDamage: 125, roundBountyOwn: 0, roundBountyUnite: 0 },
    { playerId: 'p2', roundDamage: 0, roundBountyOwn: 0, roundBountyUnite: 0 },
  ]);
});

test('a new round, a Boss scope and a forced replacement each clear the round rows', () => {
  const b = new RankBoard();
  b.begin(1, 'normal');
  b.put('n:p0', { p0: 10 });
  b.begin(2, 'normal');
  assert.equal(b.totals().size, 0, 'a new round starts from zero');
  b.put('n:p0', { p0: 7 });
  b.begin(2, 'boss', { reset: true });
  assert.equal(b.totals().size, 0, 'a forced phase replacement drops the reused field ids');
  b.put('b1', { p0: 30, p1: 20 });
  b.begin(2, 'hidden');
  assert.equal(b.totals().size, 0, 'the Hidden Core is its own scope');
  b.put('h1', { p0: 50 });
  assert.deepEqual(totals(b), { p0: 50 });
});

test('freeze retains the last values and refuses late reports; nonfinite input cannot enter', () => {
  const b = new RankBoard();
  b.begin(1, 'normal');
  b.put('n:p0', { p0: 10, p1: -5, p2: Infinity });
  b.putCoins('n:p0', { p0: 3, p1: -2 });
  assert.deepEqual(totals(b), { p0: 10, p1: 0, p2: 0 });
  assert.deepEqual([packetPlayer(b, 'p0').roundBountyOwn, packetPlayer(b, 'p1').roundBountyOwn], [3, 0]);
  assert.equal(b.put('n:p0', { p0: 4 }), true);
  assert.deepEqual(totals(b), { p0: 10, p1: 0, p2: 0 }, 'reports are cumulative and may not regress');
  b.freeze();
  assert.equal(b.put('n:p0', { p0: 999 }), false);
  const packet = b.packet(players);
  assert.equal(packet.live, false);
  assert.equal(packet.round, 1);
  assert.equal(packet.players[0].roundDamage, 10);
  assert.throws(() => b.begin(0, 'normal'), /round/);
  assert.throws(() => b.begin(1, 'prep'), /round/);
});

test('b.progress accepts bounded per-player damage rows only', () => {
  const base = { t: 'b.progress', battleId: 'b-1', gt: 1, killed: 0, total: 1 };
  assert.equal(validateC2S({ ...base, rows: { p0: 12, p1: 0 } }), null);
  assert.equal(validateC2S({ ...base, rows: {} }), null);
  assert.match(validateC2S({ ...base, rows: { p0: -1 } }), /rows/);
  assert.match(validateC2S({ ...base, rows: { p0: Infinity } }), /rows/);
  assert.match(validateC2S({ ...base, rows: { p0: '12' } }), /rows/);
  assert.match(validateC2S({ ...base, rows: [] }), /rows/);
});
