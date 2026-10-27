// Per-round damage ledger for the in-match leaderboard. The complete operator ledger stays in damageBoard.js; this keeps
// only each player's current-scope total, which client-side combat reports through b.progress rows (the server-run mode
// samples the same number from its Battle). Nothing here is used for an outcome: the per-player cumulative totals,
// bounty and Unite kills come from PlayerState.stats at settlement time.
const PHASES = new Set(['normal', 'unite', 'boss', 'hidden']);
const scoped = (phase) => phase === 'boss' || phase === 'hidden';
const amount = (value) => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
};

export class RankBoard {
  constructor() {
    this.round = null;
    this.phase = null;
    this.live = false;
    /** fieldId -> Map(playerId -> cumulative damage of that field) */
    this.fields = new Map();
    /** fieldId -> Map(playerId -> bounty coins paid by that field), split by own battle / 联防 */
    this.coins = new Map();
    this.uniteCoins = new Map();
  }

  /**
   * Call on actual battle start. Normal and Unite share one round scope; Boss and Hidden Core are their own scopes.
   * `reset` covers a forced phase replacement that reuses the same round/field ids.
   */
  begin(round, phase, { reset = false } = {}) {
    if (!Number.isInteger(round) || round < 1 || !PHASES.has(phase)) throw new TypeError('rank board round/phase required');
    if (reset || this.round !== round || (scoped(phase) && !(this.round === round && this.phase === phase))) {
      this.fields.clear();
      this.coins.clear();
      this.uniteCoins.clear();
    }
    this.round = round;
    this.phase = phase;
    this.live = true;
  }

  /** Replace one field's cumulative rows. Reports are cumulative, so a value may only grow. */
  put(fieldId, rows) {
    if (!this.live || typeof fieldId !== 'string' || !fieldId || fieldId.length > 64
      || !rows || typeof rows !== 'object' || Array.isArray(rows)) return false;
    let next = this.fields.get(fieldId);
    if (!next) { next = new Map(); this.fields.set(fieldId, next); }
    for (const [playerId, value] of Object.entries(rows)) {
      if (typeof playerId !== 'string' || !playerId || playerId.length > 64) continue;
      next.set(playerId, Math.max(next.get(playerId) || 0, amount(value)));
    }
    return true;
  }

  /** A finished field's bounty coins per player: the own battle's payout or a 联防 field's kills. */
  putCoins(fieldId, rows, { unite = false } = {}) {
    if (typeof fieldId !== 'string' || !fieldId || fieldId.length > 64
      || !rows || typeof rows !== 'object' || Array.isArray(rows)) return false;
    const target = unite ? this.uniteCoins : this.coins;
    let next = target.get(fieldId);
    if (!next) { next = new Map(); target.set(fieldId, next); }
    for (const [playerId, value] of Object.entries(rows)) {
      if (typeof playerId !== 'string' || !playerId || playerId.length > 64) continue;
      next.set(playerId, Math.max(next.get(playerId) || 0, amount(value)));
    }
    return true;
  }

  /** The combat scope is over: keep the last values for display, stop accepting late reports. */
  freeze() { this.live = false; }

  /** Current-scope damage per player, summed over every field they fought on. @returns {Map<string, number>} */
  totals() {
    const out = new Map();
    for (const rows of this.fields.values()) {
      for (const [playerId, damage] of rows) out.set(playerId, (out.get(playerId) || 0) + damage);
    }
    return out;
  }

  _coinTotals(source) {
    const out = new Map();
    for (const rows of source.values()) for (const [playerId, coins] of rows) out.set(playerId, (out.get(playerId) || 0) + coins);
    return out;
  }

  /** The public current-round slice: `players` follows the match seat order it is given. */
  packet(playerIds = []) {
    const totals = this.totals();
    const own = this._coinTotals(this.coins);
    const unite = this._coinTotals(this.uniteCoins);
    return {
      round: this.round, phase: this.phase, live: this.live,
      players: playerIds.map((playerId) => ({
        playerId,
        roundDamage: totals.get(playerId) || 0,
        roundBountyOwn: own.get(playerId) || 0,
        roundBountyUnite: unite.get(playerId) || 0,
      })),
    };
  }
}

export const createRankBoard = () => new RankBoard();
