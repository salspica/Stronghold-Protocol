import test from 'node:test';
import assert from 'node:assert/strict';
import { rankRows, rankText } from '../../public/js/ui/rankBoard.js';

const players = [
  { playerId: 'p1', name: '左侧博士', seat: 0 },
  { playerId: 'p2', name: '右侧博士', seat: 1 },
  { playerId: 'p3', name: '三号博士', seat: 2 },
];
const ranks = {
  round: 2, phase: 'normal', live: true,
  players: [
    { playerId: 'p1', roundDamage: 1200, damage: 5000, bounty: 9, bountyOwn: 6, bountyUnite: 3, uniteKills: 4 },
    { playerId: 'p2', roundDamage: 3000, damage: 3000, bounty: 9, bountyOwn: 9, bountyUnite: 0, uniteKills: 7 },
  ],
};

test('each tab ranks all players, ties by seat and a missing row reads as zero', () => {
  assert.deepEqual(rankRows(ranks, players, 'round').rows.map((r) => [r.playerId, r.roundDamage]),
    [['p2', 3000], ['p1', 1200], ['p3', 0]]);
  assert.deepEqual(rankRows(ranks, players, 'total').rows.map((r) => [r.playerId, r.damage]),
    [['p1', 5000], ['p2', 3000], ['p3', 0]]);
  assert.deepEqual(rankRows(ranks, players, 'bounty').rows.map((r) => [r.playerId, r.bounty, r.bountyOwn, r.bountyUnite]),
    [['p1', 9, 6, 3], ['p2', 9, 9, 0], ['p3', 0, 0, 0]], 'equal bounty keeps seat order');
  assert.deepEqual(rankRows(ranks, players, 'unite').rows.map((r) => [r.playerId, r.uniteKills]),
    [['p2', 7], ['p1', 4], ['p3', 0]]);
  assert.equal(rankRows(null, players, 'round').available, false);
  assert.equal(rankRows(null, players, 'round').rows.length, 3, 'players without a ledger still occupy their seats');
});

test('values are formatted as damage or plain counts', () => {
  assert.equal(rankText(12345, 'damage'), '1.23万');
  assert.equal(rankText(42, 'count'), '42');
  assert.equal(rankText(Infinity, 'coin'), '0');
});
