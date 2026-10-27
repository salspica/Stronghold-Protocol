// server/sim/content/notes.js — 丰川祥子 (char_4182_oblvns)'s 音符: a projectile that keeps homing after it leaves her attack
// range (T1 颂乐音符 "音符飘出攻击范围一段时间后消失"), fired by her skills and, as her ranged attack's shot, by the lord
// profile (kits/ops/op-oblvns.js).
//
// A note is an ordinary homing projectile (sim/projectiles.js re-aims it at its victim every tick) with a 'note' visual the
// client draws (render/style.js PROJ.note) and a lifetime of NOTE_LIFE seconds [ASSUMED: the talent says "一段时间" and
// gives no number; the projectile's own maxAge is the same clock]. It deals its own atk × scale of 物理 / 法术 damage on
// arrival; a victim that dies (or goes 隐匿) mid-flight is not struck — the note lands where it was anyway, so a volley
// never leaves projectiles hanging (hitDead). Nothing here is per-battle state: every note's data lives in the projectile.

/** Tiles/s of a note [ASSUMED: between the bolt (11) and the arrow (14); S2's 钢琴 "飞行速度加快" / 风琴 "飞行速度减缓"
 *  are not modelled]. */
export const NOTE_SPEED = 12;
/** Seconds a note flies before it fizzles (projectiles.js maxAge) [ASSUMED: "飘出攻击范围一段时间后消失"]. */
export const NOTE_LIFE = 4;

/** Targetable enemies on the unit's current range (its skill's grid while one runs), in the engine's order. */
export function noteTargets(battle, unit) {
  if (!unit || !unit.alive || !unit.deployed) return [];
  return battle.enemiesInKeys(unit.rangeKeys, unit, unit.profile);
}

/**
 * One note from `unit` at `target`. `opts`:
 *   atkScale  × the unit's ATK (1)     dmgType  'arts' | 'phys' ('arts')
 *   skill     the fx / damage tag name ('oblvns')   speed  tiles/s (NOTE_SPEED)
 * The client draws the flight from the 'atk' event (tuple ['atk', src, tgt, 'note'], ai.js).
 * @returns {object|null} the projectile (null when there is no living target)
 */
export function fireNote(battle, unit, target, opts = {}) {
  if (!unit || !unit.alive || !target || !target.alive || target.removed) return null;
  const scale = Number.isFinite(opts.atkScale) ? opts.atkScale : 1;
  if (!(scale > 0)) return null;
  const dmgType = opts.dmgType === 'phys' ? 'phys' : 'arts';
  const skill = typeof opts.skill === 'string' ? opts.skill : 'oblvns';
  battle._ev(['atk', unit.id, target.id, 'note']);
  return battle.addProjectile({
    from: unit, target, speed: opts.speed > 0 ? opts.speed : NOTE_SPEED, visual: 'note', source: unit,
    hitDead: true, maxAge: opts.maxAge > 0 ? opts.maxAge : NOTE_LIFE,
    onHit: ({ target: t, x, y }) => {
      battle.fx('noteHit', { x, y, id: unit.id, skill });
      if (!t || !t.alive) return;
      battle.dealDamage(unit, t, { amount: unit.s.atk * scale, type: dmgType, isSkill: true, tags: ['note', 'skill', skill] });
    },
  });
}

/**
 * A volley of `scales.length` notes (S1 新月的苏醒's eight), one every `gap` s. Each note picks the nearest targetable enemy
 * in range at the moment it leaves (`pick(i)` may choose its own), so the whole volley homes to whoever is there when each
 * note is played.
 */
export function playNotes(battle, unit, scales, opts = {}) {
  const gap = Number.isFinite(opts.gap) && opts.gap >= 0 ? opts.gap : 0.08;
  const list = Array.isArray(scales) ? scales : [];
  if (!list.length) return 0;
  const seq = unit.deploySeq;
  list.forEach((scale, i) => {
    battle.after(i * gap, () => {
      if (!unit.alive || !unit.deployed || unit.deploySeq !== seq) return;
      const foes = noteTargets(battle, unit);
      if (!foes.length) return;
      const target = typeof opts.pick === 'function' ? opts.pick(foes, i) : nearestFoe(unit, foes);
      fireNote(battle, unit, target, { ...opts, atkScale: scale });
    });
  });
  return list.length;
}

/** The enemy of `foes` closest to `unit` (ties: the engine's order). */
export function nearestFoe(unit, foes) {
  let best = null, bd = Infinity;
  for (const e of foes) {
    const dx = e.x - unit.x, dy = e.y - unit.y;
    const d = dx * dx + dy * dy;
    if (d < bd) { bd = d; best = e; }
  }
  return best;
}

/** The enemy of `foes` with the highest `stat` ('def' | 'res'; ties: the engine's order). */
export function highestOf(foes, stat) {
  let best = null, bv = -Infinity;
  for (const e of foes) {
    const v = Number.isFinite(e.s?.[stat]) ? e.s[stat] : 0;
    if (v > bv) { bv = v; best = e; }
  }
  return best;
}
