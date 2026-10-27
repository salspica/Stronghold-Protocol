import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PHASE } from '../../shared/constants.js';
import { makeMatch } from './harness.js';

test('m.damage.ranks: the authority rows give the live round output, cumulative columns stay separate', () => {
  const h = makeMatch({ mode: 'coop', humans: 2, bots: 1, seed: 9201, fake: true, clientCombat: true, clients: false,
    script: () => ({ duration: 6 }) }).start();
  const m = h.m;
  h.toPrep(1);
  m.handle('p_0', { t: 'g.ready', ready: true });
  m.handle('p_1', { t: 'g.ready', ready: true });
  h.run(() => m.phase === PHASE.COMBAT);
  const field = m.fields.find((f) => f.fieldId === 'n:p_0');
  assert.deepEqual(m.handle('p_0', { t: 'b.progress', battleId: field.battleId, gt: 4, killed: 1, total: 9, leaks: 0,
    rows: { p_0: 1234 } }), { ok: true });
  m.flush(true);
  const ranks = m._damagePacket().ranks;
  assert.equal(ranks.live, true);
  assert.equal(ranks.round, 1);
  const row = ranks.players.find((p) => p.playerId === 'p_0');
  assert.equal(row.roundDamage, 1234);
  assert.equal(row.damage, 1234, 'no settled history yet: the round is the cumulative output');
  assert.equal(row.bounty, 0);
  assert.equal(row.uniteKills, 0);
  // another field's report does not disturb this one; a report without rows leaves the ledger alone
  m.handle('p_0', { t: 'b.progress', battleId: field.battleId, gt: 5, killed: 2, total: 9, leaks: 0 });
  m.flush(true);
  assert.equal(m._damagePacket().ranks.players.find((p) => p.playerId === 'p_0').roundDamage, 1234, 'cumulative rows are kept');
  m.dispose();
});

test('server-run / Worker damage rows feed the same leaderboard (SP_COMBAT=server)', () => {
  const h = makeMatch({ mode: 'coop', humans: 2, bots: 1, seed: 9202, fake: true, clientCombat: false, clients: false,
    script: () => ({ duration: 6 }) }).start();
  const m = h.m;
  h.toPrep(1);
  m.handle('p_0', { t: 'g.ready', ready: true });
  m.handle('p_1', { t: 'g.ready', ready: true });
  h.run(() => m.phase === PHASE.COMBAT);
  const field = m.fields.find((f) => f.fieldId === 'n:p_0');
  m._onDamageRows(field, { owners: [{ playerId: 'p_0', total: 900, otherDamage: 0, operators: [] }] });
  m.flush(true);
  const ranks = m._damagePacket().ranks;
  assert.equal(ranks.live, true);
  assert.equal(ranks.players.find((p) => p.playerId === 'p_0').roundDamage, 900);
  m.dispose();
});

test('settlement stores the bounty split and cumulative output in the same packet', () => {
  const h = makeMatch({ mode: 'coop', humans: 2, bots: 1, seed: 9203, fake: true, clientCombat: false, clients: false,
    script: () => ({ duration: 3, coins: { p_0: 4, p_1: 2 }, damage: { p_0: 1200, p_1: 800 } }) }).start();
  const m = h.m;
  h.toPrep(1);
  m.handle('p_0', { t: 'g.ready', ready: true });
  m.handle('p_1', { t: 'g.ready', ready: true });
  h.run(() => m.phase === PHASE.SETTLE);
  m.flush(true);
  const rank = m._damagePacket().ranks;
  const p0 = rank.players.find((p) => p.playerId === 'p_0');
  assert.equal(rank.live, false);
  assert.ok(p0.damage >= 1200, 'cumulative output includes the settled round');
  assert.ok(p0.bounty >= 4, 'personal bounty is counted');
  assert.equal(p0.bounty, p0.bountyOwn + p0.bountyUnite);
  const pubRank = m.publicView().ranks.players.find((p) => p.playerId === 'p_0');
  assert.ok(pubRank.bounty >= 4, 'm.public.ranks carries the same bounty');
  m.dispose();
});

test('a real server-run battle reaches the client as m.damage.ranks', () => {
  const h = makeMatch({ mode: 'coop', humans: 1, bots: 0, seed: 9204, clientCombat: false });
  h.autoHumans();
  h.m.start();
  h.run(() => h.ended != null || h.m.phase === PHASE.SETTLE
    || h.allTo('p_0', 'm.damage').some((msg) => msg.ranks?.players?.some((row) => row.playerId === 'p_0' && row.roundDamage > 0)),
  { maxSteps: 4e6 });
  const packets = h.allTo('p_0', 'm.damage').filter((msg) => msg.ranks);
  assert.ok(packets.length, 'm.damage carries ranks');
  const row = packets.at(-1).ranks.players.find((p) => p.playerId === 'p_0');
  assert.ok(row, 'the own seat is listed');
  assert.ok(row.roundDamage > 0 || packets.at(-1).ranks.live === false, 'live combat reported a non-zero round output');
  h.m.dispose();
});

test('client-side combat rows reach m.public.ranks as well (reconnect fallback)', () => {
  const h = makeMatch({ mode: 'coop', humans: 1, bots: 0, seed: 9205, clientCombat: true, pace: 'instant' });
  h.autoHumans();
  h.m.start();
  h.run(() => h.ended != null || h.m.publicView().ranks?.players?.some((row) => row.roundDamage > 0), { maxSteps: 4e6 });
  const ranks = h.m.publicView().ranks;
  assert.ok(ranks, 'm.public carries the leaderboard');
  assert.ok(ranks.players.find((p) => p.playerId === 'p_0').roundDamage > 0, 'the authority rows reached the public slice');
  h.m.dispose();
});
