// server/sim/content/kits/ops/op-oblvns.js — 丰川祥子 (char_4182_oblvns) 自选 operator kit: 6★ 领主 (WARRIOR / lord),
// an owned-6★ pick of the tier-5 and tier-6 自选 slots. Kit contract: ../README.md ("How to add an operator (自选)").
//
// Forms: data/backups.json units.char_4182_oblvns — normal = E2 Lv1 rank 4, no module; elite = E2 Lv60 rank 7, the
// picked module at stage 1 (tier 5) or 3 (tier 6). Full potential (the owner's decision of 2026-10-07).
// Sources: character_table / skill_table / uniequip_table (zh_CN, built into backups.json) and the client prefabs read by
// docs/research/15-collab-operators-official.md §3 (.cache/collab-abilities/char_4182_oblvns.json). AM01 collab unit, so
// there is no PRTS 卫戍协议 record: the 自选 adaptation is ours (the owner's decision of 2026-10-27).
//
// The 音符 (a projectile that keeps homing after it leaves her attack range) is content/notes.js. What each part does:
// - T1 颂乐音符: every live note is a stack — `min(cnt, max_cnt)` notes give every allied operator (the mode's mujica
//   squad; [ASSUMED] the client's `mujica` group tag is the player's squad here) +def_penetrate_ratio / +magic_resist_
//   penetrate_ratio DEF / RES ignore (3 % / 2 % at E2, max 10, module 12). The aura is recomputed every 0.2 s from the
//   live 'note' projectiles, matching `oblvns_t_1`'s ON_BUFF_TRIGGER interval.
// - Normal attacks are notes themselves (`trait.projectile`): with a target a homing `projectile_chr_oblvns`, without one
//   the client fires at the input tile — [ASSUMED] this mode has no input tile, so no shot is made.
// - S1 新月的苏醒 (2 charges, instant): EIGHT notes every NOTE_GAP (0.1 s), each choosing its own target, with the damage
//   falling attack@atk_scale … attack@atk_scale_8 (arts).
// - S2 满月的舞会 (instant, toggles the timbre): 钢琴 first — attack@atk ATK (75 % at L7), physical notes — then 风琴:
//   attack@attack_speed ASPD (110), arts notes. The timbre changes her normal attack's damage type and projectile speed;
//   S1/S3 fire their own projectile sets and are unaffected (docs/research/15 §3.4).
// - S3 残月的余响 (25 s, data range 3-21): no normal attack; each of her attack intervals plays 2 物理 notes on the
//   highest-DEF enemy and 2 法术 notes on the highest-RES one, attack@atk_scale each. There is NO P1/P2 in her S3 — that
//   is 结城理's S3_1→S3_2 (docs/research/15 §3.5). The notes are the attack (unit.atkCd, the 'attack' hook).
// - T2 毋畏遗忘: Fever +3 on damage dealt — this mode has no Fever resource at all (it is the collab event's own gauge),
//   so it stays unimplemented and [ASSUMED] inert here. The in-range +16 attack speed is Fever's own line; not added.
//   Recorded so the omission is deliberate.
import { num, skillRec, talentBb, instantKind } from '../shared/tier1.js';
import { playNotes, fireNote, noteTargets, highestOf } from '../../notes.js';

const S1 = 'skchr_oblvns_1';
const S2 = 'skchr_oblvns_2';
const S3 = 'skchr_oblvns_3';
const bbOf = (chess, id) => skillRec(chess, id)?.bb ?? {};
/** S1's eight note multipliers, in order (attack@atk_scale … attack@atk_scale_8). */
const NOTE_KEYS = ['atk_scale', 'atk_scale_2', 'atk_scale_3', 'atk_scale_4', 'atk_scale_5', 'atk_scale_6', 'atk_scale_7', 'atk_scale_8'];
const NOTE_FALLBACK = [0.8, 0.73, 0.6, 0.47, 0.33, 0.27, 0.13, 0.04];
/** S1's interval between two notes (MultiRangedAttack `_triggerDelta=0.1`). */
const NOTE_GAP = 0.1;
/** The timbre buff: 钢琴 (+ATK, physical) or 风琴 (+ASPD, arts). */
const TIMBRE_KEY = 'oblvns:timbre';
/** T1's live-note aura. */
const AURA_KEY = 'oblvns:t1';
const AURA_INTERVAL = 0.2;

export default {
  char_4182_oblvns: (bb, chess, def) => {
    const b1 = bbOf(chess, S1), b2 = bbOf(chess, S2), b3 = bbOf(chess, S3);
    const r3 = skillRec(chess, S3);
    const t1 = talentBb(chess, 0);
    const selected = def?.skill?.skillId ?? chess?.skill?.skillId ?? null;
    const kind = instantKind(def);
    const noteMax = num(t1.max_cnt, 10);
    const defPen = num(t1.def_penetrate_ratio, 0.03), resPen = num(t1.magic_resist_penetrate_ratio, 0.02);
    const atkPct = num(b2['attack@atk'], 0.75), aspd = num(b2['attack@attack_speed'], 110);
    return {
      skills: {
        // 新月的苏醒: the eight notes are the skill (they outlive her range — content/notes.js)
        [S1]: {
          kind: 'charges',
          mods: {},
          onStart({ battle, unit }) {
            const scales = NOTE_KEYS.map((k, i) => num(b1[k], NOTE_FALLBACK[i]));
            playNotes(battle, unit, scales, { gap: NOTE_GAP, skill: 'oblvns:s1' });
          },
        },
        // 满月的舞会: flips the timbre — 钢琴 (+attack@atk ATK) ⇄ 风琴 (+attack@attack_speed ASPD, arts)
        [S2]: {
          kind,
          mods: {},
          onStart({ battle, unit }) {
            const organ = unit.mem.timbre !== 'organ';
            unit.mem.timbre = organ ? 'organ' : 'piano';
            battle.removeBuff(unit, TIMBRE_KEY);
            battle.addBuff(unit, {
              key: TIMBRE_KEY, persist: true, allowDead: true,
              mods: organ ? { aspd } : { atkPct },
            });
          },
        },
        // 残月的余响: the notes are the attack — 2 物理 on the highest DEF, 2 法术 on the highest RES, each attack interval
        [S3]: {
          kind: 'duration',
          mods: {},
          ...(r3?.rangeGrid ? { targeting: { rangeGrid: r3.rangeGrid } } : {}),
          attack: { noAttack: true },
          onTick({ battle, unit }) {
            if (unit.atkCd > 0 || !unit.canAct || unit.s.flags.disarm) return;
            const foes = noteTargets(battle, unit);
            if (!foes.length) return;
            unit.atkCd = unit.s.interval;
            unit.lastAttackAt = battle.time;
            unit.stats.attacks++;
            const scale = num(b3['attack@atk_scale'], 1);
            const piano = highestOf(foes, 'def'), organ = highestOf(foes, 'res');
            for (let i = 0; i < 2; i++) {
              if (piano) fireNote(battle, unit, piano, { atkScale: scale, dmgType: 'phys', skill: 'oblvns:s3' });
              if (organ) fireNote(battle, unit, organ, { atkScale: scale, dmgType: 'arts', skill: 'oblvns:s3' });
            }
            if (battle.hasHook('attack')) battle.emit('attack', { attacker: unit, targets: foes.slice(0, 1), isSkill: true });
          },
        },
      },
      talents: [
        {
          install(battle, unit) {
            // S2 equipped: 钢琴 is the initial timbre (ATK +attack@atk from deployment)
            if (selected === S2) {
              unit.mem.timbre = 'piano';
              battle.addBuff(unit, { key: TIMBRE_KEY, mods: { atkPct }, persist: true, allowDead: true });
            }
            // T1: every live note gives the squad DEF / RES ignore, recomputed every 0.2 s
            unit.mem.noteAura = battle.every(AURA_INTERVAL, () => {
              if (!unit.alive || !unit.deployed) return;
              const n = Math.min(noteMax, battle.projectiles.list.filter((p) => p.source === unit && p.visual === 'note').length);
              for (const a of battle.alliesFor(unit)) {
                if (!a.alive) continue;
                const mods = { defIgnorePct: n * defPen, resIgnorePct: n * resPen };
                const b = a.findBuff(AURA_KEY);
                if (!b) battle.addBuff(a, { key: AURA_KEY, mods, persist: true, allowDead: true });
                else if (b.mods?.defIgnorePct !== mods.defIgnorePct || b.mods?.resIgnorePct !== mods.resIgnorePct) { b.mods = mods; a.markDirty(); }
              }
            }, { owner: unit, immediate: true });
          },
        },
        { install() {} }, // T2: Fever — inert in this mode (header)
      ],
      /** 风琴 turns her normal attack into arts with the slower note (`projectile_chr_oblvns_s2_slow`). */
      profileFor(unit) {
        if (unit.mem.timbre !== 'organ') return null;
        return { dmgType: 'arts', projectile: 'noteSlow' };
      },
      // T1: her own ranged attacks are notes — they keep flying and homing (content/notes.js; the client draws 'note')
      trait: { projectile: 'note' },
    };
  },
};
