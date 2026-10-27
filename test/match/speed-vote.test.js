// 战斗二倍速 (server/match/match/speedVote.js, a remake feature): each alive connected human toggles it freely; at a
// battle phase's start at least half of them (rounded up) having it on doubles that battle's pace for the whole match,
// otherwise the normal pace stays. A change made during a battle applies from the next battle phase.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PHASE, ERR } from '../../shared/constants.js';
import { validateC2S } from '../../shared/protocol.js';
import { speedVoteNeed, isBattlePhase, MatchSpeedVote } from '../../server/match/match/speedVote.js';
import { MATCH_FIELDS } from '../../server/match/snapshot.js';
import { makeMatch } from './harness.js';

test('protocol and thresholds: g.speedVote { on }, half rounded up, the toggle fields are checkpointed', () => {
  assert.equal(validateC2S({ t: 'g.speedVote', on: true }), null);
  assert.equal(validateC2S({ t: 'g.speedVote', on: false }), null);
  for (const msg of [{ t: 'g.speedVote' }, { t: 'g.speedVote', on: 1 }, { t: 'g.speedVote', on: 'true' }]) {
    assert.notEqual(validateC2S(msg), null, JSON.stringify(msg));
  }
  assert.deepEqual([0, 1, 2, 3, 4, 5, 7].map(speedVoteNeed), [0, 1, 1, 2, 2, 3, 4]);
  for (const p of [PHASE.COMBAT, PHASE.UNITE, PHASE.FINAL_ASSAULT, PHASE.HIDDEN_CORE]) assert.equal(isBattlePhase(p), true, p);
  for (const p of [PHASE.PREP, PHASE.SETTLE, PHASE.RESULT]) assert.equal(isBattlePhase(p), false, p);
  for (const k of ['_speedVotes', '_speedBoost', '_speedBase']) assert.ok(MATCH_FIELDS.saved.includes(k), k);
  assert.ok(typeof MatchSpeedVote.prototype.setSpeedVote === 'function');
});

test('only half of the humans doubles the next battle; a toggle during a battle waits for the next one', (t) => {
  const h = makeMatch({ mode: 'coop', humans: 4, seed: 4242, fake: true, script: () => ({ duration: 3 }) }).start();
  t.after(() => h.m.dispose());
  const m = h.m;
  h.toPrep(1);
  assert.equal(m.gameSpeed, 2, 'the normal pace without a toggle');

  assert.deepEqual(m.handle('p_0', { t: 'g.speedVote', on: true }), { ok: true });
  assert.equal(m.publicView().speedVote.count, 1, 'the toggle is visible and countable already in PREP');
  h.drive(() => m.phase === PHASE.COMBAT && m.round === 1);
  assert.equal(m.gameSpeed, 2, 'one of four is below half');
  assert.equal(m.publicView().speedVote.count, 1);

  assert.deepEqual(m.handle('p_1', { t: 'g.speedVote', on: true }), { ok: true });
  assert.equal(m.gameSpeed, 2, 'the running battle keeps the pace it started with');
  h.toPrep(2);
  h.drive(() => m.phase === PHASE.COMBAT && m.round === 2);
  assert.equal(m.gameSpeed, 4, 'two of four doubles the next battle');
  assert.equal(m.publicView().speedVote.doubled, true);

  m.handle('p_0', { t: 'g.speedVote', on: false });
  m.handle('p_1', { t: 'g.speedVote', on: false });
  assert.equal(m.gameSpeed, 4, 'switching off during a battle keeps that battle doubled');
  h.toPrep(3);
  h.drive(() => m.phase === PHASE.COMBAT && m.round === 3);
  assert.equal(m.gameSpeed, 2, 'the next battle returns to the normal pace');
});

test('client-side combat receives the doubled speed in b.start; eliminated / spectator seats cannot vote', (t) => {
  const h = makeMatch({ mode: 'coop', humans: 2, seed: 4243, fake: true, clientCombat: true, pace: 'instant',
    spectators: ['viewer'], script: () => ({ duration: 3 }) }).start();
  t.after(() => h.m.dispose());
  const m = h.m;
  h.toPrep(1);
  assert.deepEqual(m.handle('p_0', { t: 'g.speedVote', on: true }), { ok: true });
  h.drive(() => m.phase === PHASE.COMBAT && m.round === 1);
  assert.equal(h.lastTo('p_0', 'b.start').speed, 4);
  assert.equal(h.lastTo('p_1', 'b.start').speed, 4);
  assert.equal(m.handle('viewer', { t: 'g.speedVote', on: true }).error, ERR.SPECTATOR);
  const dead = m.players.get('p_1');
  dead.alive = false;
  assert.equal(m.handle('p_1', { t: 'g.speedVote', on: true }).error, ERR.ELIMINATED);
});
