// server/sim/content/kits/ops/op-oblvns.js — 丰川祥子 (char_4182_oblvns) 自选 operator kit: 6★ 领主 (WARRIOR / lord),
// an owned-6★ pick of the tier-5 and tier-6 自选 slots. Kit contract: ../README.md ("How to add an operator (自选)").
//
// Forms: data/backups.json units.char_4182_oblvns — normal = E2 Lv1 rank 4, no module; elite = E2 Lv60 rank 7, the
// picked module at stage 1 (tier 5) or 3 (tier 6). Full potential (the owner's decision of 2026-10-07).
// Sources: character_table / skill_table / uniequip_table (zh_CN, built into backups.json). AM01 collab unit, so there
// is no PRTS 卫戍协议 record: the 自选 adaptation is ours (the owner's decision of 2026-10-27).
//
// Increment 1 — the skill numbers are the data's; the two new mechanics are documented, not faked:
// - S1 新月的苏醒: her notes' damage falls from attack@atk_scale to attack@atk_scale_8 over eight notes, 2 charges.
//   TODO(notes): the 音符 (a projectile that outlives the attack and keeps homing) does not exist in the engine yet.
//   Until it does the skill lands one hit at the first note's multiplier, so the damage scale is right and the rest of
//   the sequence is missing. [ASSUMED] the charge count (2) is left to the data's maxChargeTime.
// - S2 满月的舞会: attack@atk as an ATK % buff (+75 % at rank 7). [ASSUMED] the 钢琴/风琴 timbre switch and the
//   piercing notes belong to the same TODO(notes).
// - S3 残月的余响: the skill's own range (3-21 from the data), attack@atk_scale × ATK. [ASSUMED] the two notes per
//   timbre and the physical/arts split are TODO(notes) as well.
// - T1 颂乐音符 (notes that keep tracking after leaving the range) — TODO(notes).
// - T2 毋畏遗忘 (Fever +1 on damage dealt): this mode has no Fever resource at all (it is the collab event's own
//   gauge), so it stays unimplemented and [ASSUMED] inert here. Recorded so the omission is deliberate.
import { num, skillRec } from '../shared/tier1.js';

const S1 = 'skchr_oblvns_1';
const S2 = 'skchr_oblvns_2';
const S3 = 'skchr_oblvns_3';
const bbOf = (chess, id) => skillRec(chess, id)?.bb ?? {};

export default {
  char_4182_oblvns: (bb, chess) => {
    const b1 = bbOf(chess, S1), b2 = bbOf(chess, S2), b3 = bbOf(chess, S3);
    const r3 = skillRec(chess, S3);
    return {
      skills: {
        // the first note's multiplier; the eight-note sequence is TODO(notes)
        [S1]: { kind: 'duration', mods: {}, attack: { atkScale: num(b1.atk_scale, 1) } },
        // 钢琴: ATK +attack@atk; the timbre switch itself is TODO(notes)
        [S2]: { kind: 'duration', mods: { atkPct: num(b2['attack@atk'], 0) }, attack: { atkScale: 1 } },
        // 3-21 range in the data; both timbres' notes are TODO(notes)
        [S3]: {
          kind: 'duration',
          mods: {},
          attack: { atkScale: num(b3['attack@atk_scale'], 1) },
          ...(r3?.rangeGrid ? { targeting: { rangeGrid: r3.rangeGrid, allInRange: true } } : {}),
        },
      },
      // T1 / T2: TODO(notes) and the [ASSUMED] inert Fever above. The lord trait (canHitFly, ranged ATK scale) is the
      // engine's professions.js default.
      talents: [{ install() {} }, { install() {} }],
    };
  },
};
