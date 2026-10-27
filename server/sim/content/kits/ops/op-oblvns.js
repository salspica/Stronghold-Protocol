// server/sim/content/kits/ops/op-oblvns.js — 丰川祥子 (char_4182_oblvns) 自选 operator kit: 6★ 领主 (WARRIOR / lord),
// an owned-6★ pick of the tier-5 and tier-6 自选 slots. Kit contract: ../README.md ("How to add an operator (自选)").
//
// Forms: data/backups.json units.char_4182_oblvns — normal = E2 Lv1 rank 4, no module; elite = E2 Lv60 rank 7, the
// picked module at stage 1 (tier 5) or 3 (tier 6). Full potential (the owner's decision of 2026-10-07).
// Sources: character_table / skill_table / uniequip_table (zh_CN, built into backups.json). AM01 collab unit, so there
// is no PRTS 卫戍协议 record: the 自选 adaptation is ours (the owner's decision of 2026-10-27).
//
// The 音符 (a projectile that keeps homing after it leaves her attack range) is content/notes.js. What each part does:
// - S1 新月的苏醒 (MANUAL, 2 charges, data -1 = instant): plays EIGHT notes, one every NOTE_GAP s, whose damage falls
//   from attack@atk_scale (65 %) to attack@atk_scale_8 (4 %) — each note is its own homing projectile (arts).
// - S2 满月的舞会 (toggle): 钢琴 is the equipped timbre — ATK +attack@atk (60 %) from deployment — and casting switches to
//   风琴, attack speed +attack@attack_speed (80) with the piano bonus gone. [ASSUMED] the toggle cannot switch back
//   (skills.js toggles stay on until death), and the timbres' note behaviour (piano notes pierce for 物理, organ notes are
//   法术 and slower) is not modelled: every note keeps its skill's own damage type and NOTE_SPEED.
// - S3 残月的余响 (25 s, data range 3-21): no normal attack; each of her attack intervals plays a piano and an organ note
//   pair — 2 物理 notes on the highest-DEF enemy and 2 法术 notes on the highest-RES one, attack@atk_scale (155 %) each.
//   The notes are the attack (unit.atkCd, the 'attack' hook), as 赫亚克 S3 does (op-heyak.js).
// - T1 颂乐音符: her ranged attacks are notes (trait.projectile 'note' — the shot keeps flying and homing, and the
//   projectile's lifetime is the "飘出攻击范围一段时间后消失" clock). TODO(note-aura): the per-note 3 % DEF / 2 % RES
//   penetration for Ave Mujica members (max 10) needs the band's membership in this mode; it is not modelled.
// - T2 毋畏遗忘: Fever +3 on damage dealt — this mode has no Fever resource at all (it is the collab event's own gauge),
//   so it stays unimplemented and [ASSUMED] inert here. The in-range +16 attack speed is Fever's own line; not added.
//   Recorded so the omission is deliberate.
import { num, skillRec } from '../shared/tier1.js';
import { playNotes, fireNote, noteTargets, highestOf } from '../../notes.js';

const S1 = 'skchr_oblvns_1';
const S2 = 'skchr_oblvns_2';
const S3 = 'skchr_oblvns_3';
const bbOf = (chess, id) => skillRec(chess, id)?.bb ?? {};
/** S1's eight note multipliers, in order (attack@atk_scale … attack@atk_scale_8). */
const NOTE_KEYS = ['atk_scale', 'atk_scale_2', 'atk_scale_3', 'atk_scale_4', 'atk_scale_5', 'atk_scale_6', 'atk_scale_7', 'atk_scale_8'];
const NOTE_FALLBACK = [0.65, 0.6, 0.49, 0.38, 0.27, 0.22, 0.11, 0.04];
/** Seconds between two of S1's notes [ASSUMED: no source; short enough to read as one phrase, long enough to home]. */
const NOTE_GAP = 0.08;
/** 钢琴's persistent ATK bonus while S2 is equipped (removed when the cast switches to 风琴). */
const PIANO_KEY = 'oblvns:piano';

export default {
  char_4182_oblvns: (bb, chess, def) => {
    const b1 = bbOf(chess, S1), b2 = bbOf(chess, S2), b3 = bbOf(chess, S3);
    const r3 = skillRec(chess, S3);
    const selected = def?.skill?.skillId ?? chess?.skill?.skillId ?? null;
    const noteFx = (battle, unit, skill, extra = {}) => battle.fx('note', { x: unit.x, y: unit.y, id: unit.id, skill, ...extra });
    return {
      skills: {
        // 新月的苏醒: the eight notes are the skill (they outlive her range — content/notes.js)
        [S1]: {
          kind: 'charges',
          mods: {},
          onStart({ battle, unit }) {
            const scales = NOTE_KEYS.map((k, i) => num(b1[k], NOTE_FALLBACK[i]));
            playNotes(battle, unit, scales, { gap: NOTE_GAP, skill: 'oblvns:s1' });
            noteFx(battle, unit, 'oblvns:1', { n: scales.length });
          },
        },
        // 满月的舞会: 钢琴 (equipped, +ATK) → 风琴 (+attack speed) on the cast
        [S2]: {
          kind: 'toggle',
          mods: { aspd: num(b2['attack@attack_speed'], 0) },
          onStart({ battle, unit }) {
            battle.removeBuff(unit, PIANO_KEY);
            noteFx(battle, unit, 'oblvns:2', { timbre: 'organ' });
          },
        },
        // 残月的余响: the notes are the attack — 2 物理 on the highest DEF, 2 法术 on the highest RES, each attack interval
        [S3]: {
          kind: 'duration',
          mods: {},
          ...(r3?.rangeGrid ? { targeting: { rangeGrid: r3.rangeGrid } } : {}),
          attack: { noAttack: true },
          onStart({ battle, unit }) {
            noteFx(battle, unit, 'oblvns:3', { timbre: 'both' });
          },
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
            noteFx(battle, unit, 'oblvns:3', { n: 4 });
            if (battle.hasHook('attack')) battle.emit('attack', { attacker: unit, targets: foes.slice(0, 1), isSkill: true });
          },
        },
      },
      talents: [
        { install(battle, unit) { // T1 颂乐音符: 钢琴 is the equipped timbre, so its ATK bonus is on from deployment
          if (selected !== S2) return;
          battle.addBuff(unit, { key: PIANO_KEY, mods: { atkPct: num(b2['attack@atk'], 0) }, persist: true, allowDead: true });
        } },
        { install() {} }, // T2: Fever — inert in this mode (header)
      ],
      // T1: her own ranged attacks are notes — they keep flying and homing (content/notes.js; the client draws 'note')
      trait: { projectile: 'note' },
    };
  },
};
