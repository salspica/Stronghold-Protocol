// server/match/match/speedVote.js — Match methods: 战斗二倍速 (a remake feature, no official counterpart). Every alive,
// connected human seat owns one freely switchable toggle (g.speedVote { on }). It is not a timed vote: the decision is
// taken when a battle phase starts, so a change during a battle applies from the next one.
//
// "Half of the players" means the connected, alive human seats (bots and spectators cannot toggle; a disconnected or
// eliminated seat leaves the denominator), rounded up: need = ceil(voters / 2). With need reached, the whole match fights
// that battle at twice the normal pace: the match's game speed (2 by default, `opts.combatSpeed` in tools) is multiplied
// by 2 for the phase — 30 ticks per game second stay untouched, so the simulation and the golden results do not move.
// The speed is restored to the normal one at the next battle phase start when the toggle count falls back.
//
// Applied by MatchCombat.startCombat (normal rounds) and MatchBoss.startFinalAssault (最终攻势 / 隐秘核心); a 联防 that
// follows a round's combat keeps the round's pace. m.public carries `speedVote` in PREP and the battle phases, so the
// button lets a player pre-set the next battle there and shows the count that will decide it.
// Installed on Match.prototype by server/match/Match.js (a method container: never instantiated; `this` is the match).

import { PHASE, ERR } from '../../../shared/constants.js';
import { OK, fail } from './common.js';

/** Yes toggles a doubled battle needs of `n` voters: at least half, rounded up. */
export const speedVoteNeed = (n) => (n > 0 ? Math.ceil(n / 2) : 0);

/** The phases whose battles can be doubled. */
export function isBattlePhase(phase) {
  return phase === PHASE.COMBAT || phase === PHASE.UNITE || phase === PHASE.FINAL_ASSAULT || phase === PHASE.HIDDEN_CORE;
}

export class MatchSpeedVote {
  /** g.speedVote { on } */
  setSpeedVote(ps, on) {
    if (ps.left || !ps.connected) return fail(ERR.NOT_IN_ROOM);
    if (!ps.alive) return fail(ERR.ELIMINATED);
    if (on) this._speedVotes.add(ps.playerId); else this._speedVotes.delete(ps.playerId);
    this.markPublic();
    return OK;
  }

  /** The seats that count: connected, alive humans (bots and spectator seats never vote). */
  _speedVoterIds() {
    return this.humans().filter((p) => p.connected && p.alive).map((p) => p.playerId);
  }

  /** Whether the next battle phase starts doubled (at least half of the voters toggled on). */
  _speedVoteDoubled() {
    const voters = this._speedVoterIds();
    if (!voters.length) return false;
    let on = 0;
    for (const id of voters) if (this._speedVotes.has(id)) on++;
    return on >= speedVoteNeed(voters.length);
  }

  /**
   * The next battle's pace, decided now: base × 2 when the toggles reach half, else the base. Never changes the game
   * speed while no toggle was ever used (tools/tests set `gameSpeed` directly); the base is captured before the first
   * override so a custom `opts.combatSpeed` keeps working.
   */
  _applyCombatSpeed() {
    const want = this._speedVoteDoubled() ? 2 : 1;
    if (want === this._speedBoost) {
      if (this._speedBase != null) this.gameSpeed = this._speedBase * want;
      return;
    }
    if (this._speedBase == null) this._speedBase = this.gameSpeed;
    this._speedBoost = want;
    this.gameSpeed = this._speedBase * want;
  }

  /** m.public.speedVote (PREP and the battle phases): the toggles, the threshold, and the pace the next battle will use. */
  speedVoteView() {
    if (this.phase !== PHASE.PREP && !isBattlePhase(this.phase)) return null;
    const voters = this._speedVoterIds();
    const on = voters.filter((id) => this._speedVotes.has(id));
    const need = speedVoteNeed(voters.length);
    return { on, count: on.length, voters: voters.length, need, doubled: need > 0 && on.length >= need, active: this._speedBoost > 1, boost: this._speedBoost };
  }
}
