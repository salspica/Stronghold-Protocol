// server/sim/content/kits/ops/op-makoto.js — 结城理 (char_4217_makoto) 自选 operator kit: 6★ 傀儡师 (SPECIAL /
// dollkeeper), an owned-6★ pick of the tier-5 and tier-6 自选 slots. Kit contract: ../README.md ("How to add an
// operator (自选)").
//
// Forms: data/backups.json units.char_4217_makoto — normal = E2 Lv1 rank 4, no module; elite = E2 Lv60 rank 7, the
// picked module at stage 1 (tier 5) or 3 (tier 6). Full potential (the owner's decision of 2026-10-07).
// Sources: character_table / skill_table / uniequip_table (zh_CN, built into backups.json). AM/PS collab unit, so
// there is no PRTS 卫戍协议 record: the 自选 adaptation is ours (the owner's decision of 2026-10-27).
//
// Increment 1 — what is here and what is not:
// - The <替身> switch is the engine's (professions.js installDollkeeper: trait "受到致命伤时不撤退，切换成<替身>作战",
//   the 20 s duration, the switch animations, the 替身 blocking nothing). Nothing to reimplement, and no `dollNoAttack`:
//   unlike 归溟幽灵鲨, his 替身 fights (that is what S1/S2/S3 change).
// - The three skills carry their own data numbers (attack multiplier, attack speed, fear chance) so the pick is
//   playable with the official figures. [ASSUMED] that a "被动" persona skill runs as a timed state in this mode — the
//   mode has no SP-free permanent buff, and an AUTO skill acting on itself fires at full SP (checklist 5).
// - TODO(doll-talent) T1 不羁之力 (+40 % ATK / +35 % HP / longer interval while the 替身 fights) and T2 S.E.E.S.队长
//   (the squad's total attack when the 替身 ends): both need a harness-verified doll-state hook before they are added;
//   an unverified approximation would be worse than none. Documented, not silently dropped.
// - The persona model: his skeleton names the 替身 clips Doll_Skill_1_* / Doll_Skill_2_* / Doll_Skill_3_P2_* (no *_B
//   clips), and the <替身> is a Persona that follows the equipped skill — S1 俄耳甫斯, S2 塔纳托斯, S3's 俄耳甫斯 that
//   its text summons on a doomed hit. render/units.js FORMS carries one `doll` clip set per skill variant (dollForms,
//   picked by the pick's skillIndex), so the switch plays the persona's own clips; see test/render/makoto-doll.test.js.
import { num, skillRec } from '../shared/tier1.js';

const S1 = 'skchr_makoto_1';
const S2 = 'skchr_makoto_2';
const S3 = 'skchr_makoto_3';
const bbOf = (chess, id) => skillRec(chess, id)?.bb ?? {};

// The official battle effects of char_4217_makoto / char_4182_oblvns are in the local fx index once the operator fx
// pack is deployed (public/assets/local/fx/index.json — units, skills, talents and projectiles; docs/ASSETS.md
// "Official battle effects"). The kit therefore emits no visual fx of its own: the client's official layer draws the
// casts, hits, projectiles and talent effects, while a 2D/simplified board or an install without the effects keeps
// the procedural fallbacks (the `note` projectile kind still names her shot). The kits' `battle.fx` calls are gameplay
// only where they carry a heal (S3 below).

export default {
  char_4217_makoto: (bb, chess) => {
    const b1 = bbOf(chess, S1), b2 = bbOf(chess, S2), b3 = bbOf(chess, S3);
    const r1 = skillRec(chess, S1), r2 = skillRec(chess, S2), r3 = skillRec(chess, S3);
    const target = (rec) => (rec?.rangeGrid ? { rangeGrid: rec.rangeGrid, allInRange: true } : { allInRange: true });
    return {
      skills: {
        // 俄耳甫斯的竖琴 — 替身 attacks for attack@atk_scale × ATK (arts). The "wounded ally instead" branch is
        // TODO(orpheus-heal): it needs a per-attack target rewrite the harness has to confirm.
        [S1]: {
          kind: 'duration',
          mods: {},
          attack: { atkScale: num(b1['attack@atk_scale'], 1) },
          targeting: target(r1),
        },
        // 塔纳托斯的囚锁 — attack@atk_scale × ATK (arts) with attack@prob to fear for attack@fear s. The execute
        // (attack@kill_damage 9 999 999 is the official "non-boss only" marker) is TODO(thanatos-execute).
        [S2]: {
          kind: 'duration',
          mods: {},
          attack: {
            atkScale: num(b2['attack@atk_scale'], 1),
            onHit({ battle, unit, target: t }) {
              if (!t || !t.alive || t.side !== 'enemy') return;
              if (battle.rng.chance(num(b2['attack@prob'], 0.35))) {
                battle.applyStatus(t, 'fear', { duration: num(b2['attack@fear'], 1.5), source: unit });
              }
            },
          },
          targeting: target(r2),
        },
        // 开辟明日的剑刃 — attack speed +talent@attack_speed, attack@atk_scale × ATK, and on activation one heal of
        // attack@heal_scale × ATK to each wounded ally (up to max_target_heal). [ASSUMED] the heal is a burst at the
        // skill's start rather than riding every attack.
        [S3]: {
          kind: 'duration',
          mods: { aspd: num(b3['talent@attack_speed'], 0) },
          attack: { atkScale: num(b3['attack@atk_scale'], 1) },
          targeting: target(r3),
          onStart({ battle, unit }) {
            const cap = num(b3['attack@max_target_heal'], 4), scale = num(b3['attack@heal_scale'], 0.3);
            for (const a of battle.alliesFor(unit).filter((x) => x.alive && x.hp > 0 && x.hpRatio < 1).slice(0, cap)) {
              battle.heal(unit, a, unit.s.atk * scale, { isSkill: true });
              battle.fx('heal', { x: a.x, y: a.y, id: unit.id, to: a.id, skill: 'makoto:thanatos' });
            }
          },
        },
      },
      // TODO(doll-talent): T1 / T2, see the header. The trait is the engine's installDollkeeper.
      talents: [{ install() {} }, { install() {} }],
    };
  },
};
