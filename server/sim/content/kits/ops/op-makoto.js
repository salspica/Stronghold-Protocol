// server/sim/content/kits/ops/op-makoto.js — 结城理 (char_4217_makoto) 自选 operator kit: 6★ 傀儡师 (SPECIAL /
// dollkeeper), an owned-6★ pick of the tier-5 and tier-6 自选 slots. Kit contract: ../README.md ("How to add an
// operator (自选)").
//
// Forms: data/backups.json units.char_4217_makoto — normal = E2 Lv1 rank 4, no module; elite = E2 Lv60 rank 7, the
// picked module at stage 1 (tier 5) or 3 (tier 6). Full potential (the owner's decision of 2026-10-07).
// Sources: character_table / skill_table / uniequip_table (zh_CN, built into backups.json) and the client prefabs read by
// docs/research/15-collab-operators-official.md (.cache/collab-abilities/char_4217_makoto.json): the five UnitModes,
// the makoto_switchbegin / switchend / standin buff templates and each mode's attack / ability nodes. AM/PS collab
// unit, so there is no PRTS 卫戍协议 record: the 自选 adaptation is ours (the owner's decision of 2026-10-27).
//
// What the client shows (docs/research/15 §2):
// - The <替身> is the SAME unit switched into a UnitMode, not a token: Default(0) → Stand_S1(1) / Stand_S2(2) /
//   Stand_S3_1(3) / Stand_S3_2(4) → Switch2Normal(5). All three skills switch it, and a lethal hit that finds the body
//   (or P1) switches it too. The switch clears buffs (the switch/standin/talent buffs stay), resets SP and the HP.
// - The persona fights with its own mode: S1 heals a wounded ally (<50 % HP, 0.5×ATK) INSTEAD of attacking, else an arts
//   hit at attack@atk_scale; S2 attacks for 0 damage and applies fear (35 %) + attack@atk_scale arts, with a 0.1 s aura
//   executing feared enemies under attack@kill_atk_scale×ATK (9,999,999 pure — a boss leader's ≥300000 cap cancels it);
//   S3 P1 has 4 targets, attack@atk_scale, +attack speed and weak damage; S3 P2 (a second S3 cast, or a lethal hit on
//   P1) does not attack: block 2, 35 % physical/arts dodge and a 4-ally 30 % ATK/s heal, all inside the SAME 20 s
//   standin (no refresh).
// - T1 不羁之力 buffs the standin only (+atk / +max HP / longer interval) and slows enemies around the switch point;
//   T2 S.E.E.S.队长 deals attack@atk_scale true damage around every ally when the standin ends.
// [ASSUMED] (documented in docs/research/15 §5): the switch-slow radius (1.5 tiles), P2's net block 2, P1's "weak
// damage" as arts, and T2's "S.E.E.S. member" as every allied operator of this mode (no group tag is modelled here).
import { num, skillRec, talentBb, instantKind } from '../shared/tier1.js';

const S1 = 'skchr_makoto_1';
const S2 = 'skchr_makoto_2';
const S3 = 'skchr_makoto_3';
const bbOf = (chess, id) => skillRec(chess, id)?.bb ?? {};
/** The client form of each persona (render/units.js FORMS). */
const PERSONA_FORM = { s1: 'dollS1', s2: 'dollS2', s3: 'dollS3', s3p2: 'dollS3P2' };
/** The persona the equipped skill summons (the client's makoto_tr / switch2stand_* read the skill index). */
const PERSONA_OF_SKILL = { [S1]: 's1', [S2]: 's2', [S3]: 's3' };
const at = (unit, extra) => ({ x: unit.x, y: unit.y, id: unit.id, ...extra });

export default {
  char_4217_makoto: (bb, chess, def) => {
    const b1 = bbOf(chess, S1), b2 = bbOf(chess, S2), b3 = bbOf(chess, S3);
    const t1 = talentBb(chess, 0), t2 = talentBb(chess, 1);
    const kind = instantKind(def);
    const selected = def?.skill?.skillId ?? null;
    /** The persona in force: what a skill cast put on, else the equipped skill's (a trait-triggered switch). */
    const personaOf = (u) => u.mem.makotoPersona ?? PERSONA_OF_SKILL[u.skill?.id ?? selected] ?? null;
    const isFear = (e) => Array.isArray(e.buffs) && e.buffs.some((b) => b && b.status === 'fear');

    /** Drop the persona's temporary buffs and timers (a persona change or the switch back). */
    const clearPersona = (battle, unit, { t1 = true } = {}) => {
      for (const key of ['makoto:s3', 'makoto:p2']) battle.removeBuff(unit, key);
      if (t1) battle.removeBuff(unit, 'makoto:t1');
      for (const key of ['makotoP2Timer', 'makotoExecTimer']) {
        const h = unit.mem[key];
        if (h && typeof h.cancel === 'function') h.cancel();
        unit.mem[key] = null;
      }
    };

    /** The buffs / timers a persona carries (also used when the switch entered it). */
    const applyPersona = (battle, unit, persona, prev) => {
      unit.mem.makotoPersona = persona;
      if (prev) clearPersona(battle, unit, { t1: false });
      unit.form = PERSONA_FORM[persona] ?? 'doll';
      unit.markDirty();
      battle.fx('swap', at(unit, { form: unit.form }));
      if (persona === 's3') {
        // P1 塔纳托斯: +talent@attack_speed; block stays 0 (the substitute buff)
        battle.addBuff(unit, { key: 'makoto:s3', mods: { aspd: num(b3['talent@attack_speed'], 45) }, persist: true, allowDead: true });
      } else if (persona === 's3p2') {
        // P2 俄耳甫斯: block 2 inside the SAME standin; 35 % physical/arts dodge; 4 wounded allies healed per second
        const sub = unit.findBuff('trait:substitute');
        if (sub) sub.mods = { ...(sub.mods || {}), blockCnt: num(b3['attack@block_cnt'], 2) - (unit.base.blockCnt ?? 0) };
        battle.addBuff(unit, {
          key: 'makoto:p2', persist: true, allowDead: true,
          mods: { dodgePhys: num(b3['attack@prob'], 0.35), dodgeArts: num(b3['attack@prob'], 0.35) },
        });
        unit.mem.makotoP2Timer = battle.every(1, () => {
          if (!unit.alive || !unit.trait.doll || personaOf(unit) !== 's3p2') return;
          const cap = num(b3['attack@max_target_heal'], 4), sc = num(b3['attack@heal_scale'], 0.3);
          for (const a of battle.alliesFor(unit).filter((x) => x.alive && x.hp > 0 && x.hpRatio < 1).slice(0, cap)) {
            battle.heal(unit, a, unit.s.atk * sc, { isSkill: true });
          }
        }, { owner: unit });
      } else if (persona === 's2') {
        // 塔纳托斯的囚锁: the 0.1 s aura executes feared enemies below attack@kill_atk_scale × ATK
        unit.mem.makotoExecTimer = battle.every(0.1, () => {
          if (!unit.alive || !unit.trait.doll || personaOf(unit) !== 's2') return;
          const cap = num(b2['attack@kill_atk_scale'], 2.5);
          for (const e of battle.enemiesInKeys(unit.rangeKeys, unit, unit.profile)) {
            if (!e.alive || !isFear(e) || e.hp >= unit.s.atk * cap) continue;
            battle.dealDamage(unit, e, { amount: num(b2['attack@kill_damage'], 9999999), type: 'true', isSkill: true, tags: ['makoto:s2', 'execute'] });
          }
        }, { owner: unit });
      }
    };

    /** A skill cast: enter the <替身> if the body still fights, else swap the persona in place (same standin). */
    const enterPersona = (battle, unit, persona) => {
      const prev = personaOf(unit);
      unit.mem.makotoPersona = persona;
      if (unit.trait.doll) {
        if (prev !== persona) applyPersona(battle, unit, persona, prev);
        return true;
      }
      // body → standin: T1's switch slow (8 s; [ASSUMED] radius 1.5)
      for (const e of battle.foesInRadius(unit.x, unit.y, 1.5)) {
        battle.applyStatus(e, 'sluggish', { duration: num(t1.sluggish, 8), source: unit });
      }
      battle.emit('dollSwitch', { unit, reason: 'skill', done: false });
      return true;
    };

    return {
      skills: {
        // 俄耳甫斯的竖琴: switch to 俄耳甫斯; its attacks heal a wounded ally instead of striking (the beforeAttack hook)
        [S1]: {
          kind,
          mods: {},
          onStart({ battle, unit }) { enterPersona(battle, unit, 's1'); },
        },
        // 塔纳托斯的囚锁: switch to 塔纳托斯; its attack carries fear + the fear damage, the aura executes
        [S2]: {
          kind,
          mods: {},
          onStart({ battle, unit }) { enterPersona(battle, unit, 's2'); },
        },
        // 开辟明日的剑刃: P1 on the first cast; a second cast while P1 (or a lethal hit on P1) turns it into P2
        [S3]: {
          kind,
          mods: {},
          onStart({ battle, unit }) {
            if (unit.trait.doll && personaOf(unit) === 's3') applyPersona(battle, unit, 's3p2', 's3');
            else enterPersona(battle, unit, 's3');
          },
        },
      },
      /**
       * The attack each persona fights with (ai.js effectiveProfile → kit.profileFor). `onHit` becomes the profile's
       * skill-on-hit: the S2 fear and the S2 damage ride on the 0-scale attack, exactly as the client's buff carriers
       * do — the direct hit itself must stay at 0 (no second atk_scale damage).
       */
      profileFor(unit) {
        if (!unit.trait.doll) return null;
        const p = personaOf(unit);
        if (p === 's1') {
          return { attack: 'ranged', dmgType: 'arts', atkScale: num(b1['attack@atk_scale'], 2.1), maxTargets: 1, projectile: 'orb' };
        }
        if (p === 's2') {
          return {
            attack: 'ranged', dmgType: 'arts', atkScale: 0, projectile: 'orb',
            maxTargets: num(b2['attack@max_target'], 3),
            onHit({ battle, unit: u, target: t }) {
              if (!t || !t.alive) return;
              battle.dealDamage(u, t, { amount: u.s.atk * num(b2['attack@atk_scale'], 2.2), type: 'arts', isSkill: true, tags: ['makoto:s2'] });
              if (battle.rng.chance(num(b2['attack@prob'], 0.35))) {
                battle.applyStatus(t, 'fear', { duration: num(b2['attack@fear'], 1.5), source: u });
              }
            },
          };
        }
        if (p === 's3') {
          return {
            attack: 'ranged', dmgType: 'arts', atkScale: num(b3['attack@atk_scale'], 2), projectile: 'orb',
            maxTargets: num(b3['attack@max_target'], 4),
          };
        }
        if (p === 's3p2') return { noAttack: true };
        return null;
      },
      // the <替身> form per persona (professions.js installDollkeeper reads dollForm on enter) and SP gain inside the
      // standin (a second S3 cast turns P1 into P2)
      trait: { dollForm: (u) => PERSONA_FORM[personaOf(u)] ?? 'doll', dollNoSp: false },
      talents: [
        {
          install(battle, unit) {
            // T1: the standin's own buff; T2 + the persona cleanup when the switch ends
            battle.on('dollSwap', (ctx) => {
              if (ctx.unit !== unit) return;
              if (ctx.form) {
                const persona = personaOf(unit);
                unit.mem.makotoPersona = persona;
                battle.addBuff(unit, {
                  key: 'makoto:t1', persist: true, allowDead: true,
                  mods: { atkPct: num(t1.atk, 0.85), hpPct: num(t1.max_hp_t1, 0.35), batPct: num(t1.base_attack_time, 0.4) },
                });
                applyPersona(battle, unit, persona, null);
              } else {
                clearPersona(battle, unit);
                unit.mem.makotoPersona = null;
                // T2: attack@atk_scale true damage around every allied operator (the mode's S.E.E.S. members [ASSUMED])
                const scale = num(t2.atk_scale, 0);
                if (scale > 0) {
                  for (const a of battle.alliesFor(unit)) {
                    if (!a.alive) continue;
                    for (const e of battle.foesInRadius(a.x, a.y, 1.5)) {
                      if (e.alive) battle.dealDamage(unit, e, { amount: unit.s.atk * scale, type: 'true', isSkill: true, tags: ['makoto:t2'] });
                    }
                  }
                }
              }
            }, { owner: unit });
            // a lethal hit on P1 turns it into P2 (the client's makoto_tr is_trans_to_s3_2); the engine's dollkeeper
            // would otherwise knock the 替身 out
            battle.on('fatal', (ctx) => {
              if (ctx.unit !== unit || ctx.prevented) return;
              if (!unit.trait.doll || personaOf(unit) !== 's3') return;
              if (unit.trait.dollSwitching) return;
              ctx.prevented = true;
              applyPersona(battle, unit, 's3p2', 's3');
            }, { owner: unit, priority: 50 });
            // S1: a wounded ally (<50 % HP, the skill's range) is healed for attack@heal_scale × ATK INSTEAD of attacked
            battle.on('beforeAttack', (ctx) => {
              if (ctx.attacker !== unit || !unit.trait.doll || personaOf(unit) !== 's1') return;
              const allies = battle.alliesInGrid(unit).filter((a) => a.alive && a.hp > 0 && a.hpRatio < 0.5);
              if (!allies.length) return;
              allies.sort((a, b) => a.hpRatio - b.hpRatio || a.id - b.id);
              ctx.targets = [allies[0]];
              ctx.profile.dmgType = 'heal';
              ctx.profile.heal = { mode: 'single' };
              ctx.profile.atkScale = num(b1['attack@heal_scale'], 0.5);
            }, { owner: unit });
          },
        },
        { install() {} }, // T2's passive is handled by the dollSwap hook above
      ],
    };
  },
};
