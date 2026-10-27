# 15 · 结城理 / 丰川祥子：客户端里的技能、天赋与傀儡师实现

Read from the local official PC client, 2026-10-27. Client bundle version
`26-09-13-15-28-10-30688348`; AB root
`D:\Hypergryph Launcher\games\Arknights\Arknights_Data\StreamingAssets\AB\Windows`.

Tags: **[DATA]** serialized client prefab or official data table · **[VERIFIED]** the official
skill/talent text (the `description` strings in `skill_table.json` / `character_table.json`) · **[ASSUMED]**
our reading where the client only names an enum, a buff key or a node.

The full per-operator dump (all serialized fields, every referenced buff template and projectile, plus
the readable node tree) is local only and **not** committed:

```text
.cache/collab-abilities/char_4217_makoto.json / .txt
.cache/collab-abilities/char_4182_oblvns.json / .txt
```

It is produced by `tools/local-extract/abilities.py` (UnityPy + the extractor's own `fx.AssetEnv`; see
`--game` / `--ids` / `--out`). The JSON below (`15-collab-operators-official.json`) keeps only the
numbers and keys derived here, not the raw dump.

> **Checkout caveat.** This checkout's `data/backups.json` puts both operators in `diy.excluded`, not
> `units`; there is no `op-makoto.js` / `op-oblvns.js` / `notes.js` here. The numbers below therefore
> come from `.cache/gamedata/excel/skill_table.json`, `character_table.json`, `uniequip_table.json` and
> `battle_equip_table.json`, cross-checked against the client prefabs. The "current kit" column of §4
> can only use the task's description of the private fork; it is not a source diff.

---

## 0. TL;DR

**结城理**

1. 傀儡师替换是**同一个单位切换 `UnitMode`**，不是另一个 token：Default(0) → S1(1)/S2(2)/S3_1(3)/S3_2(4)，
   S3_2 再回 Switch2Normal(5)。切换由 `makoto_switchbegin` / `makoto_switchend` /
   `makoto_switchend2normal` 三个 buff 模板完成：清 buff、`OnRallyPointLikeReborn`、清 SP、按技能切模式。
   **S1/S2/S3 都会主动切换**，不是只有特性；T1 的致命伤分支也走同一个入口。 **[DATA]**
2. S1 是“**受伤友方优先**”：`GroupSelector` 先试 `Heal50`（友方且 HP<50%，最多 1 个），否则
   `AtkEnemy`（敌方，最多 1 个）。所以治疗**替代**该次攻击，不是额外治疗；治疗量 `attack@heal_scale`。 **[DATA]**
3. S2 的实际伤害不在 `MeleeAttack` 上（`_atkScale=0`）：攻击施加 `makoto_s2_fear_possibility`
   （35% 恐惧 1.5 s）和 `makoto_s2_fear_damage`（2.2×ATK 法术）。范围光环 `makoto_s2_fear_aura_inst_kill`
   每 **0.1 s** 检查：带 `fear` 且当前 HP < `kill_atk_scale`(2.5)×ATK 的目标吃 **9,999,999 纯伤害**，
   `instantKillLikeDamage=true`。 **[DATA]**
4. S3 先召唤塔纳托斯（Stand_S3_1，4 目标、2.0×ATK、+45 ASPD、弱点伤害、阻挡 0）；再次开技能或致命伤切
   俄耳甫斯（Stand_S3_2，**不攻击**，阻挡 2、35% 物法闪避、每秒治疗 4 人 30% ATK）。**P2 用的是同一次
   standin 的剩余 20 s，不刷新**。 **[DATA]** + **[VERIFIED]**
5. T2 的总攻击不是 S3 的攻击动画：它在 standin 结束、且单位有 `makoto_talent_2` 时触发
   `makoto[switch2normal_allout]`，模板按 E2 rank2 **450% 真实伤害**、`multi_attack_total_cnt=1`，
   在每名 S.E.E.S. 成员周围结算，可叠加。 **[DATA]** + **[VERIFIED]**

**丰川祥子**

1. T1 的“一个音符”是**每点音符资源**：全局 `cnt` 由音符投射物生成/命中/消失增减，`cur_cnt=min(cnt,10)`
   （模组 12）；每点给所有 `mujica` 成员 **3% 无视防御 / 2% 无视法抗**，不是只给攻击者。 **[DATA]**
2. 普通攻击是“**有目标时追踪音符，没目标时朝地块继续演奏**”：Default 的
   `AbilitySelectableGroup` = `MultiRangedAttack`（`projectile_chr_oblvns`）或
   `ProjectileToTileAbility`（`projectile_chr_oblvns_talent`），后者 `AlwaysTrigger`。 **[DATA]**
3. S1 的 8 个音符按 **0.1 s** 间隔依次发射（`_additionalTimes=7`），每个独立选目标（
   `_limitToOneTargetAfterFirstRound=0`），无目标时朝输入地块发射；8 段伤害就是
   `atk_scale..atk_scale_8`（L7 0.8→0.04）。 **[DATA]** + **[VERIFIED]**
4. S2 是**切换音色**，不是每次造成不同伤害段：初始 mode 2 钢琴（+75% ATK、物理、`_s2` 弹道、
   `_stopAfterFirstHit=0` 可穿过），再按一次切 mode 1 风琴（+110 ASPD、法术、`_s2_slow` 慢弹道、
   命中即停）。 **[DATA]** + **[VERIFIED]**
5. S3 **没有 P1/P2**：客户端只有 1 个 `S3` UnitMode（index 4），没有第二个 S3 阶段；P1→P2 是
   结城理 S3 的 S3_1→S3_2。S3 每次攻击 = 2 个物理音符 + 2 个法术音符，范围 3-21，25 s；物理/法术选择器
   的 `_postFilter` 分别是 68/8（官方文字说分别追防御/法抗最高，见 §3.5）。 **[DATA]** + **[VERIFIED]** + **[ASSUMED]**

---

## 1. 读取方法与证据层级

| 层 | 位置 | 用途 |
|---|---|---|
| 单位 prefab | `charpack/<charId>.ab` 的 `<charId>.prefab` | `Character._modes`、每个 `UnitMode` 的 `_attack`、`_generalAbilities`、`Talents/*`、`CommonAbilities/*` |
| 技能 prefab | `battle/prefabs/[uc]skills.ab` 的 `skchr_*` | `CastSkill`、`ActiveBuffAbility`、`ToggleSkillWithEndAnimation`、`ExtraAbilities` |
| buff 模板 | `config/buff_template_holder.ab` 的 `_templates` | 事件→动作图（`SerializedState`）、buff 生命周期、模式切换、清 buff、治疗/伤害/处决 |
| 投射物 | `battle/prefabs/[uc]projectiles.ab` 的 `projectile_*` | `SimpleProjectile`、`AdvancedMovement`、`MovementSwitchControllerOblvns`、`ProjectileActionBehaviour` |
| 数值 | `.cache/gamedata/excel/*.json` | `skill_table` levels、`character_table` talents/trait、`battle_equip_table` 模组 |
| 已有 FX 图 | `public/assets/local/fx/index.json` | `units[charId].modes/abilities/talents`、`skills[skillId].abilities/uses/roles/projectiles`；只作交叉索引 |

`fx.index.json` 已经把能力图挑了一部分出来；本文所有结论仍回到 prefab / holder 的原始节点，
因为 FX index 不含 `SerializedState` 的动作图，也不含 `ClearAllBuffs` 的保留列表和 `SwitchMode` 的索引。

---

## 2. 结城理 `char_4217_makoto`

### 2.1 单位模式

`Character._modes`（**DATA**；按数组顺序解析 GameObject 名）：

| index | GameObject | 作用 |
|---:|---|---|
| 0 | `Default` | 本体，近战 `Attack_A/Attack_B` |
| 1 | `Stand_S1` | 俄耳甫斯：Heal/RangedAttack 二选一 |
| 2 | `Stand_S2` | 塔纳托斯：恐惧/处决光环 |
| 3 | `Stand_S3_1` | S3 P1 塔纳托斯：4 目标、弱点伤害、+45 ASPD |
| 4 | `Stand_S3_2` | S3 P2 俄耳甫斯：不攻击、阻挡 2、闪避/治疗 |
| 5 | `Switch2Normal` | 切回本体的过渡模式（`Skill_AllOutAttack_Loop` 等） |

`Character._commonAbilities` 依次是
`makoto[switch2normal]`、`makoto[switch2stand_s3_1]`、`makoto[switch2stand_s3_2]`、
`makoto[switch2normal_allout]`、`makoto[switch2stand_s2]`、`makoto[switch2stand_s1]`。
这些是 `AbilitySequenceGroup`（`SwitchBegin` → `Die2Stand`/`SwitchEnd` → 可选 `StandBorn`）。 **[DATA]**

### 2.2 傀儡师替换：谁触发、清什么、HP/阻挡怎么变

**触发入口有三类，不只是特性：**

1. **T1 致命伤**：`makoto_tr` 在 `ON_BEFORE_TRY_SET_HP_ZERO`（event 27）读当前模式： **[DATA]**
   - mode 0（本体）→ `can_trans_to_stand=1`；
   - mode 3（S3_1 塔纳托斯）→ `can_trans_to_stand=1` 且 `is_trans_to_s3_2=1`；
   - 其他模式不加。随后 `ConsumeTrySetHpZeroModifier`（拦住这次致死）、给 `makoto_tr_undead`
     （`UNDEADABLE`），再按 `CheckSkillIndex` 触发：
     `makoto[switch2stand_s1]` / `[switch2stand_s2]` /
     `is_trans_to_s3_2 ? makoto[switch2stand_s3_2] : makoto[switch2stand_s3_1]`。
2. **技能主动**：`skchr_makoto_1/2/3` 的 `ActiveBuffAbility` 分别带 `makoto_s1_trigger` /
   `makoto_s2_trigger` / `makoto_s3_trigger`，都是先确认没有 `makoto_tr_undead`，再触发对应
   `makoto[switch2stand_*]`。所以“开技能立即切替身”是技能自己的 buff，不是特性。 **[DATA]**
3. **S3 再开一次**：`makoto_s3_trigger` 先看 `CheckUnitCurrentMode 0`；若已在 standin
   （`makoto_standin` 剩余 >0.01 s），触发 `makoto[switch2stand_s3_2]`，这就是 P1→P2。 **[DATA]**

**切换过程**（`makoto_switchbegin` / `makoto_switchend` / `makoto_switchend2normal`）： **[DATA]**

| 步骤 | 节点/字段 | 结果 |
|---|---|---|
| 进入切换 | `makoto_switchbegin`：`CreateBuff makoto_assign_standing_time`、`ClearAllBuffs`、`OnRallyPointLikeReborn`、`ClearCharacterSp` | 清掉自身一切 buff、SP 清零、HP 按 reborn 节点重设；把 T1 黑board 写进 snapshot |
| 切换目标模式 | `makoto_switchend`：`ClearAllBuffs` 后 `SwitchMode` | 按 `CheckSkillIndex`：S1→mode1、S2→mode2、S3→mode3（P1）或 mode4（P2）；S3 P1 额外 `SwitchSkillRangeIdModeIndex 4` |
| 保留列表 | `makoto_switchend` 的 `_retainedBuffsWhenClear` | `makoto_switchend, makoto_tr, makoto_stand[block_zero], makoto_standin, makoto_talent_1, makoto_talent_2, makoto_skill_2, makoto_allout_attack_allow_effect, makoto_s3_1_forbid_turn` — **不是无脑清光**，与现有 `installDollkeeper` 只清 status buff 不同 |
| 替身持续 | `makoto_standin` buff，`durationKey=makoto_standin_duration`，来源 T1 的 `duration=20` | 20 s；`makoto_assign_standing_time` 记录 `standing_remaining_time`，P1→P2 继承剩余时间，不刷新 |
| 切回 | `makoto_standin` 的 `ON_BUFF_FINISH`：有 `makoto_talent_2` → `makoto[switch2normal_allout]`，否则 `makoto[switch2normal]` | 回 mode 0（`makoto_switchend2normal` 再 `OnRallyPointLikeReborn`） |
| 阻挡 | 切替身时 `makoto_stand[block_zero]` 被保留；S3 P2 的 `makoto_s3_2_mod_block_cnt` 先 `FinishBuffsById block_zero`，再加 `makoto_stand[block_dec]`（`BLOCK_CNT -2`）和 `makoto_stand[s3_2_block]`（`BLOCK_CNT += attack@block_cnt`） | 普通替身/本体切替身 **阻挡 0**；P2 为 **2**（技能文本 `+2`）。[ASSUMED: 净值为 2，按 `attack@block_cnt=2` 与文本] |
| HP | `OnRallyPointLikeReborn` | 切换开始/结束重设到当前形态最大 HP；S3 P2 的 `max_hp_t1`/模组 `max_hp` 乘区同时生效。[VERIFIED: PRTS “切换途中重设自身生命至最大值”；DATA: reborn 节点] |

**结论：** 不是独立召唤物，没有单独的 token；是同一单位的 `SwitchMode`。切换会清 buff（保留上述白名单）、
清 SP、按 reborn 节点重设 HP、普通替身阻挡 0；S3 P2 是唯一阻挡 2 的替身。 **[DATA]**

### 2.3 S1 俄耳甫斯的竖琴 `skchr_makoto_1`

| 项 | 值（L7） | 证据 |
|---|---|---|
| SP | cost 8 / init 4 / 1 charge / time recovery | `skill_table.levels[6].spData` |
| 技能类型 | `MANUAL`，`duration=0`（开技能只负责切替身） | `skill_table` |
| 攻击 | 1 段、1 目标；法术；`attack@atk_scale=2.1` | `Stand_S1/Body/Attack/MagicAttack`：`RangedAttack` `_damageType=2`、`_atkScaleKey=atk_scale`、`_maxNum=1` |
| 治疗 | 1 目标、`attack@heal_scale=0.5`（50% ATK） | `HealAlly_Lt50Per`：`Heal` `_animKey=Doll_Skill_1_Attack`；`attack@heal_scale` |
| 治疗条件 | **友方 HP < 50%**，严格低于（`_maxHpRatio=0.5`, `_maxHpExcludeEqual=0`） | `HealAlly_Lt50Per/Selector`：`AdvancedSelectorWithinHpRatio` |
| 选择规则 | GroupSelector 的列表顺序 `[Heal50, AtkEnemy]`，`_maxNum=1`；有可治疗友方就选 Heal，否则选敌人 | `Stand_S1/Body/Attack/Selector`：`GroupSelector._rangeSelectorsList` |
| 触发时机 | 每次攻击判定；Heal 与 RangedAttack 是二选一，**治疗替代该次伤害** | `AbilitySelectableGroup._abilityConfigs` 两路 + `SelectorTrigger` |
| 范围 | `rangeId=x-1`（自身范围；本体 `character_table` range 1-1），S1 没有额外扩范围 | `skill_table`、`character_table.phases[].rangeId` |

`Heal` 没有单独的 `_healScale` 字段；它读技能的 `attack@heal_scale`（`Heal` 的 `_isHpRatio=0`，
`_applyEPHeal=0`，`_animKey=Doll_Skill_1_Attack`）。**[DATA]**

### 2.4 S2 塔纳托斯的囚锁 `skchr_makoto_2`

| 项 | 值（L7） | 证据 |
|---|---|---|
| SP | cost 12 / init 6 / 1 charge / time | `skill_table` |
| 目标数 | L1 **3**，L7 **4**，L10 4 | `attack@max_target`；`AdvancedSelector._maxNum=4`、`_maxTargetKey=max_target` |
| 直接攻击 | `MeleeAttack` `_atkScale=0`、`_damageType=2`、`_preDelay=0.8`、`_animKey=""` | `Stand_S2/Body/Attack` |
| 实际伤害 | `makoto_s2_fear_damage`：`AdvancedApplyDamage` `MAGICAL`，`_atkScaleVar=atk_scale`，L7 2.2 | buff 模板 event 0（ON_BUFF_START） |
| 恐惧 | `Dice _probKey=prob`（35%），成功创建 `fear` 1.5 s（`_durationKey=fear`） | `makoto_s2_fear_possibility` / `makoto_s2_fear_impl`；`attack@prob=0.35`、`attack@fear=1.5` |
| 处决 | 目标带 `fear` 且当前 HP < `kill_atk_scale`(2.5)×结城理 ATK 时，`NoSourceDamageNew` `PURE`、`_damageKey=kill_damage`(9,999,999)、`instantKillLikeDamage=true` | `makoto_s2_fear_aura_inst_kill` event 2（ON_BUFF_TRIGGER） |
| 处决判定时点 | S2 的 `AuraAbility` 给范围内目标挂 `makoto_s2_fear_aura_inst_kill`，`_triggerInterval=0.1`、`_triggerCnt=9999999`；即每 0.1 s 检查一次 | `Stand_S2/Body/GeneralAbilities/Ability0` |
| 对 boss/精英 | 没有 `IsBoss`/rank 过滤节点；`NoSourceDamageNew` 的 `_ignoreCancelReasonMask` 只忽略 NONE/MISS/BLOCKED/…，不含模式限伤。本模式的领袖 ≥300000 单次伤害会被取消（`11-limits-official.md`），所以 **9,999,999 处决对 boss 领袖大概率无效**；精英非领袖有效。**[ASSUMED]** | `README` §0 + `makoto_s2_fear_aura_inst_kill` |

S2 的 `MeleeAttack` 只是“施加两个 buff 的载体”：`_activeBuffs` 正是
`makoto_s2_fear_possibility` 和 `makoto_s2_fear_damage`。不要同时再给一次 `atk_scale` 伤害，否则双倍。 **[DATA]**

### 2.5 S3 开辟明日的剑刃 `skchr_makoto_3`

| 项 | 值（L7） | 证据 |
|---|---|---|
| SP | cost 15 / init 7 / 1 charge / time | `skill_table` |
| 形态 | P1 `Stand_S3_1`（塔纳托斯）→ P2 `Stand_S3_2`（俄耳甫斯） | `Character._modes`；`makoto_switchend` |
| P1 攻速 | `talent@attack_speed=45`（L4 30 / L10 60） | `skill_table`；`makoto_s3_1_standin` 的 `ATTACK_SPEED` modifier |
| P1 目标 | 4；`attack@max_target=4`；`AdvancedSelector._maxNum=4` | `Stand_S3_1/Body/Attack/Selector` |
| P1 倍率 | `attack@atk_scale=2.0`（L1 1.4 / L10 2.3） | `MeleeAttack._atkScaleKey=atk_scale` |
| P1 伤害类型 | `_damageType=2`（法术底）+ `makoto_s3_1_standin` 创建 `common_weak_damage`（游戏内置 buff，`loadFromDB`，官方文本称“弱点伤害”） | `Stand_S3_1/Body/Attack`；`makoto_s3_1_standin` |
| P1 阻挡 | `makoto_stand[block_zero]`（0） | §2.2 |
| P2 攻击 | **没有 `_attack`**；`Stand_S3_2._attack=null`，只有 `AuraAbility` + `Heal` + `PassiveBuffAbility` | `Character._modes[4]` |
| P2 阻挡 | 2（`attack@block_cnt=2`；见 §2.2） | `makoto_s3_2_mod_block_cnt` |
| P2 闪避 | 35% 物理/法术（`attack@prob=0.35`；`evade` 模板 `Evade PHYSICAL_AND_MAGICAL`） | `makoto_s3_2_aura` → `evade`；技能文本 |
| P2 治疗 | 每秒、最多 4 名友方、`attack@heal_scale=0.3`（30% ATK）；`Heal` 的 `_maxNum=4`、`_maxTargetKey=max_target_heal` | `makoto[s3_heal_others]`；`Stand_S3_2/Body/GeneralAbilities/Ability0/2` |
| P2 持续 | 同一次 standin 的剩余时间（总 20 s，不刷新） | `makoto_standin` / `makoto_assign_standing_time` |
| P1→P2 触发 | 再开一次 S3（`makoto_s3_trigger` 检测 `makoto_standin` 剩余 >0.01 s）或 P1 受到致命伤（`makoto_tr` 设 `is_trans_to_s3_2`） | `makoto_s3_trigger`、`makoto_tr` |
| 转换时长 | 没有独立的“P2 duration”节点；只有切换动画（`SwitchBegin`/`SwitchEnd`）和剩余 standin；动画长度不在 prefab 数值字段里，按客户端切换动画 [ASSUMED 1 s，与现有 `DOLL_SWITCH` 一致] | `makoto[switch2stand_s3_2]` |

**AllOutAttack 修正：** `Skill_AllOutAttack_Loop/End` 与 `makoto[switch2normal_allout]` 属于 **T2**，
在 standin 结束时触发，不是 S3 的攻击动画。S3 P1 的实际攻击动画是
`Doll_Skill_3_P1_Attack_A`（`MeleeAttack._animKey`）；P2 没有攻击动画。 **[DATA]**

### 2.6 天赋

#### T1 不羁之力

| 阶段/潜 | ATK | 攻击间隔 | 停顿 | 最大 HP | range |
|---|---:|---:|---:|---:|---|
| E2 rank0 | +80% | +40% (`base_attack_time=0.4`) | 8 s | +35% (`max_hp_t1=0.35`) | `x-1` |
| E2 rank4 | +85% | +40% | 8 s | +35% | `x-1` |
| 模组 L2 | +88% | +40% | 9 s | +38% | `x-1` |
| 模组 L3 | +95% | +40% | 10 s | +40% | `x-1` |

来源：`character_table.char_4217_makoto.talents[0].candidates[*].blackboard`；模组
`battle_equip_table.uniequip_002_makoto.phases[1/2].parts[TALENT_DATA_ONLY]`。 **[DATA]**

- 作用对象：**自身，且只在 `<替身>` 状态**（`makoto_standin` 把 T1 黑board 复制到替身，乘区
  `ATK`/`BASE_ATTACK_TIME`/`MAX_HP`）。 **[DATA]**
- 切换时停顿：`makoto_switchbegin` 在 `sluggish>0` 且当前 mode 0 时 `CreateBuffInRange`，
  即对切换点周围敌人施加 `sluggish` 秒停顿；这就是“切换时停顿周围敌人 8 秒”。 **[DATA]**
- 叠层：单 buff，`maxStackCnt=1`；不叠加。 **[DATA]**

#### T2 S.E.E.S.队长

| 阶段/潜 | 真实伤害倍率 | 段数 | 最终段系数 |
|---|---:|---:|---:|
| E2 rank0 | 430% | 1 | 1 |
| E2 rank2 | 450% | 1 | 1 |
| E1 rank0 / rank2 | 280% / 300% | 1 | 1 |

来源：`character_table...talents[1].candidates[*].blackboard`；`atk_scale`, `multi_attack_total_cnt`,
`final_damage_different_ratio`, `range_id=x-1`。 **[DATA]**；真实伤害类型见官方文本 **[VERIFIED]**。

实现细节： **[DATA]**

- standin 结束且单位有 `makoto_talent_2` → `makoto[switch2normal_allout]`（`makoto_standin` 的
  `ON_BUFF_FINISH`）。
- `makoto_allout_attack_damage` 从 `makoto_talent_2` 复制黑board，`FilterId char_4217_makoto`，
  用 `SplitDamageByMultiAttack`（`multi_attack_total_cnt=1`）结算；`makoto_allout_attack_effect`
  在每个 S.E.E.S. 成员位置创建 `makoto_talent_finish_01`。
- `makoto_on_enter_normal` 用 `CreateBuffToCertainGroupId groupId="sees"` 给 S.E.E.S. 成员；
  因此是“每名成员周围一次、可叠加”，不是只在结城理脚下一次。 **[DATA]** + **[VERIFIED: 官方“可叠加”]**
- T2 的 `makoto_talent_2` 是 `PassiveBuffAbility`，`Talents/2/PassiveT2` 挂到单位；`makoto_standin`
  的结束分支只检查这个 buff 是否存在。

### 2.7 模组

`uniequip_002_makoto`（彼此的声音）三段： **[DATA]**

| 等级 | 平属性 | 特性/天赋 |
|---|---|---|
| L1 | +200 HP / +18 ATK / +18 DEF | 特性 `duration=20`, `max_hp=0.2`（替身 HP +20%） |
| L2 | +257 / +27 / +27 | T1 升级为 `atk=0.88`, `sluggish=9`, `max_hp_t1=0.38` |
| L3 | +304 / +34 / +34 | T1 升级为 `atk=0.95`, `sluggish=10`, `max_hp_t1=0.4` |

`uniequip_001_makoto` 是证章，无战斗效果。 **[DATA]**

### 2.8 数值速查（L7 / E2）

| 技能 | cost/init | 目标 | 倍率 | 关键 |
|---|---|---|---:|---|
| S1 俄耳甫斯的竖琴 | 8/4 | 1 | 2.1 法术 / 0.5 治疗 | 友方<50% 时治疗替代攻击 |
| S2 塔纳托斯的囚锁 | 12/6 | 4（L1 3） | 2.2 法术（fear_damage） | 35%/1.5 s 恐惧；<2.5×ATK 处决 9,999,999 纯 |
| S3 开辟明日的剑刃 | 15/7 | P1 4 / P2 0 | P1 2.0 弱点；P2 0.3 治疗 | P1 +45 ASPD；P2 阻挡2/35%闪避/4目标治疗 |

---

## 3. 丰川祥子 `char_4182_oblvns`

### 3.1 单位模式

`Character._modes`（**DATA**）：

| index | GameObject | 作用 |
|---:|---|---|
| 0 | `Default` | 普通攻击（目标/地块两路） |
| 1 | `S2_AttackSpeed` | S2 风琴（法术、慢音符、+ASPD） |
| 2 | `S2_Atk` | S2 钢琴（物理、快音符、+ATK；初始） |
| 3 | `S2_Fever` | Fever 钢琴二连击 |
| 4 | `S3` | S3（2 物理 + 2 法术） |
| 5 | `S2_Fever_Mag` | Fever 风琴二连击 |

### 3.2 T1 颂乐音符

**普通攻击是“一枚音符”，不是额外演奏第二枚：** Default 的 `AbilitySelectableGroup` 有两路： **[DATA]**

1. `MultiRangedAttack`（`SelectorTrigger`）：有敌人目标时，发射 `projectile_chr_oblvns`；
2. `ProjectileToTileAbility`（`AlwaysTrigger`，`TileSelector`）：没有目标/触发地块时，发射
   `projectile_chr_oblvns_talent`，朝输入地块继续演奏。

两路的 `_damageType=1`（物理）、`_atkScaleKey=atk_scale`；`ProjectileToTileAbility._mountPointType=9`
（SPECIAL_3）。 **[DATA]**

**音符投射物：** `projectile_chr_oblvns` 速度数组 `[2,2,0.1,0.1]`（第一段追踪 2.0），
`MovementSwitchControllerOblvns._switchToTracingTime=0.1 s`，`_stopAfterFirstHit=1`、`_maxHitNum=1`、
寿命 10 s。 **[DATA]**

**离开范围后消失：** 单位 prefab 的 `CommonAbilities/ProjectileElimate` 是
`ProjectileAuraAbility` + `ElimateProjectileByExitRangeTime`（`_keepAliveIfContainsTraceTarget=1`）
+ `ProjectileValidator`（`_onlySourceIsMe=1`）；T1 黑board 另有 `delay=1`。所以是“离开攻击范围后
约 1 s 的宽限，仍追踪目标则保留，否则清除；硬上限 10 s”。 **[DATA]**；`delay` 对应宽限时间是
**[ASSUMED]**（该类没有序列化时间字段，只有 `delay` 黑board）。

**破甲/破抗叠加：** **[DATA]**

- 每个音符投射物有一个 `ProjectileActionBehaviour` 在生成/命中/停止时对
  `oblvns_t_1[cnt]` 做 `AddBuffBlackboard cnt ±1`。
- `oblvns_t_1` 的 `ON_BUFF_TRIGGER`（aura 每 0.2 s）：
  `cur_cnt = min(cnt, max_cnt)`；`def_penetrate = cur_cnt * def_penetrate_ratio`；
  `magic_resist_penetrate = cur_cnt * magic_resist_penetrate_ratio`。
- `oblvns_t_1[attr]` 在 `ON_APPLYING_MODIFIER` / `ON_APPLIED_MODIFIER`（events 14/40）把
  `DEF_PENETRATE` / `MAGIC_RESIST_PENETRATE` 加到 buff owner。
- 目标：`FilterGroupTagTargetValidator._tags=["mujica"]`；即所有 `mujica` 成员（含自身，按 group 标签），
  **不是只给攻击者**。
- 上限：E2 `max_cnt=10`，模组 L2/3 `max_cnt=12`；每点 3%/2%（E2），模组 4%/2% 或 5%/2.5%。
- 刷新/掉层：没有独立持续时间；音符数变化时重算。音符命中/消失即 -1；`cur_cnt` 只在 0..max 之间。

### 3.3 S1 新月的苏醒 `skchr_oblvns_1`

| 项 | 值（L7） | 证据 |
|---|---|---|
| SP | cost 4 / init 0 / **2 charges** / attack recovery | `skill_table.levels[6].spData` |
| 音符数 | 8 | `_additionalTimes=7` + 1；`_additionalProjectiles` 8 个 |
| 间隔 | **0.1 s** | `MultiRangedAttack._triggerDelta=0.1` |
| 选目标 | 每个音符独立（`_limitToOneTargetAfterFirstRound=0`）；`BlockedOrAdvancedSelector`，max 1 | `skchr_oblvns_1/RangedMulti` |
| 无敌人 | `_allowNoTarget=1`，`_emitToInputPosWhenTargetIsInvalid=1` → 朝输入地块发射 | 同上 |
| 伤害 | 8 段法术：0.8, 0.73, 0.6, 0.47, 0.33, 0.27, 0.13, 0.04（L7） | `skill_table` `atk_scale..atk_scale_8` |
| 投射物 | `projectile_chr_oblvns_s1_1..8`；速度 `[2.2,1.7,0.1]`，0.6 s 后追踪，寿命 10 s，单体 | `projectiles.ab` |
| 自动释放 | 2 层充满时自动释放；`oblvns_s_1[self]` 在 SP ratio=1 时触发 | `oblvns_s_1[self]` / `[no_auto_fever]`；官方文本 |

八段与音符序号的对应：客户端把 8 个 projectile key 按 `s1_1..s1_8` 顺序放进
`_additionalProjectiles`，而 `atk_scale..atk_scale_8` 是同一技能黑board 的 8 个键；按官方
“依次从 … 逐渐降低”与 key 命名，**第 N 枚用 `atk_scale[_N]`**。 **[DATA]** + **[ASSUMED: 索引映射]**

### 3.4 S2 满月的舞会 `skchr_oblvns_2`

| 项 | 钢琴（初始） | 风琴 |
|---|---|---|
| Unit mode | 2 `S2_Atk` | 1 `S2_AttackSpeed` |
| 伤害类型 | 物理 (`_damageType=1`) | 法术 (`_damageType=2`) |
| 投射物 | `projectile_chr_oblvns_s2` | `projectile_chr_oblvns_s2_slow` |
| 速度 | `[3.5,1.9,3,0.1]`，0.4 s 追踪 | `[1,0.7,0.1]`，0.4 s 追踪 |
| 命中 | `_stopAfterFirstHit=0`、`_stopAfterMaxHit=1`、`_maxHitNum=1`、`_hitNumType=2`；官方“命中后穿过敌人” | `_stopAfterFirstHit=1`，命中即停 |
| 属性 | `attack@atk=0.75`（+75% ATK，L7） | `attack@attack_speed=110`（+110 ASPD，L7） |
| 额外 | `attack@passby_delay=0.5` | 同 |

**切换机制：** `ToggleSkillWithEndAnimation._defaultModeIndex=2`（钢琴），`_switchToMode=1`（风琴），
`_endAnim=Skill_2_Trans_B`；`oblvns_s_2[switch]` 在 toggle 事件（event 80）和
`ON_BUFF_TRIGGER`（event 2）里按当前 mode 1↔2 切换。初始是钢琴；每次释放切到另一种音色；
技能没有 duration（`duration=-1`），不是 25 s。 **[DATA]**

**音色影响范围：** 仅 S2 的 `S2_Atk` / `S2_AttackSpeed` 模式。S1 的 `skchr_oblvns_1` 自己发
`projectile_chr_oblvns_s1_*`，S3 自己发 `_s3_phy/_s3_mag`；普通攻击在 S2 未开启时走 Default。
**[DATA]**

S2 数值（L1/L4/L7/L10）：

| | L1 | L4 | L7 | L10 |
|---|---:|---:|---:|---:|
| 钢琴 `attack@atk` | 0.40 | 0.60 | 0.75 | 1.10 |
| 风琴 `attack@attack_speed` | 60 | 80 | 110 | 140 |
| `passby_delay` | 0.5 | 0.5 | 0.5 | 0.5 |

### 3.5 S3 残月的余响 `skchr_oblvns_3`

| 项 | 值（L7） | 证据 |
|---|---|---|
| SP | cost 46 / init 30 / 1 charge / attack | `skill_table` |
| 持续 | 25 s | `duration=25` |
| 范围 | `rangeId=3-21` | `skill_table`；`CastSkill._rangeIdModeIndex=4` |
| 倍率 | `attack@atk_scale=1.8`（L1 1.4 / L10 2.2） | `skill_table` |
| 攻击 | 物理 `_s3_phy` ×2 + 法术 `_s3_mag` ×2 | `S3/Body/Attack/RangedMulti` `_additionalTimes=1`；`ExtraAttackMagic/RangedMulti` `_additionalTimes=1` |
| 间隔 | 物理 `_triggerDelta=0.1`；法术 `_triggerDelta=0.05` | 上面两个 `MultiRangedAttack` |
| 目标优先级 | 物理 `BlockedOrAdvancedSelector._postFilter=68`；法术 `_postFilter=8`；官方文本“分别追踪防御/法抗最高” | `S3/Body/Attack/.../Selector`、`ExtraAttackMagic/.../Selector` |
| P1/P2 | **不存在**。只有 mode 4 `S3`；`ExtraAbilities/ActiveAbilityWrapper` 只有一个 `_wrappedAbilities`，`_isInfinity=1`，无 phase 字段 | `Character._modes`；`skchr_oblvns_3/ExtraAbilities` |
| Fever | `FeverCommonBehaviour._feverKey=env_033_fever`、`oblvns_s_3[fever]`、`[fever_undead]` 存在；本模式无 Fever 资源，全部忽略 | `skchr_oblvns_3`；§3.6 |

**P1/P2 结论：** 丰川祥子 S3 **没有 P1→P2**；任务里描述的 P1/P2 是结城理 S3 的
`Stand_S3_1`→`Stand_S3_2`。如果后续 kit 需要“阶段”，只能按 S3 一个 mode + 25 s 实现。 **[DATA]**

**最高防御/法抗目标：** prefab 没有 `sortByDef`/`sortByRes` 这种明文字段；两个选择器唯一的结构差异是
`_postFilter`（68 vs 8）。按官方文本“物理追防御最高、法术追法抗最高”，我们记为
**[ASSUMED: postFilter 68 = highest DEF, 8 = highest RES]**；这需要在游戏里用两个不同防御/法抗的敌人
做一次实测确认。 **[ASSUMED]**

### 3.6 T2 毋畏遗忘

| 项 | 值（E2） | 证据 |
|---|---:|---|
| `enable` | 1 | `character_table` T2 candidates |
| 攻击速度 | +16 | `attack_speed=16`；`oblvns_t_2[attack_speed]` attribute type 7 |
| Fever | +3 / hit | `cnt=3`；`oblvns_t_2[fever]` `AddFeverBySourceIfNotFull` |
| 范围延伸 | 与攻击范围重合的其他 `mujica` 成员的范围取并集 | `ComposedRangeTalent` + `SharedCharacterRangeBehaviour`（`_includeSelf=1`、`OblvnsAttackRangeValidator`） |

**Fever：** 本模式没有 Fever 资源（`T2_Fever` 只存在于卡西米尔等模式）；因此 `cnt=3` 的
“Fever +3”标记为**不实现**。加攻速与范围并集是独立效果，可以保留。 **[VERIFIED: 模式无 Fever] + [DATA]**

### 3.7 投射物对照

| key | 速度序列 | 追踪切换 | 命中 | 伤害 | 备注 |
|---|---|---|---:|---|---|
| `projectile_chr_oblvns` | 2.0, 2.0, 0.1, 0.1 | 0.1 s | 1 次即停 | 物理 | 普通攻击有目标 |
| `projectile_chr_oblvns_talent` | 2.0, 1.3, 0.1 | 0.1 s | 1 次即停 | 物理 | 普通攻击无目标/地块 |
| `projectile_chr_oblvns_s1_1..8` | 2.2, 1.7, 0.1 | 0.6 s | 1 次即停 | 法术 | S1，8 个只差主特效 |
| `projectile_chr_oblvns_s2` | 3.5, 1.9, 3.0, 0.1 | 0.4 s | `_stopAfterFirstHit=0`，`_stopAfterMaxHit=1`，`_maxHitNum=1`，`_hitNumType=2` | 物理 | 钢琴，穿过；`passby_delay=0.5` |
| `projectile_chr_oblvns_s2_slow` | 1.0, 0.7, 0.1 | 0.4 s | 1 次即停 | 法术 | 风琴 |
| `projectile_chr_oblvns_s3_phy` | 1.3, 0.8, 0.1 | 0.8 s | 1 次即停 | 物理 | S3，2 个 |
| `projectile_chr_oblvns_s3_mag` | 1.3, 0.8, 0.1 | 0.8 s | 1 次即停 | 法术 | S3，2 个 |

全部 `_lifeTime=10`、`_forceReachedWhenTimeup=1`；`MovementSwitchControllerOblvns._hitPassbyTimeKey="passby_delay"`。
**[DATA]**

### 3.8 模组

`uniequip_002_oblvns`（无言的约定）三段： **[DATA]**

| 等级 | 平属性 | 特性/天赋 |
|---|---|---|
| L1 | +180 HP / +38 ATK / +5 ASPD | 特性：范围内 ≥2 敌人时 +12 ASPD、`atk_scale=0.8` |
| L2 | +250 / +54 / +6 | T1：4% 破甲、2% 破抗、`max_cnt=12`；技能期间远程攻击不再降低攻击力 |
| L3 | +300 / +63 / +7 | T1：5% 破甲、2.5% 破抗、`max_cnt=12` |

`uniequip_001_oblvns` 是证章，无战斗效果。 **[DATA]**

### 3.9 数值速查（L7 / E2）

| 技能 | cost/init | 目标/段数 | 倍率 | 关键 |
|---|---|---|---:|---|
| S1 新月的苏醒 | 4/0（2 充能） | 8 音符，0.1 s | 0.8→0.04 法术 | 独立目标；无目标也发射 |
| S2 满月的舞会 | 5/0（toggle） | 1 音符 | 钢琴 0.75× / 风琴 +110 ASPD | 钢琴物理可穿；风琴法术慢弹 |
| S3 残月的余响 | 46/30 | 2 物理 + 2 法术 | 1.8× | 3-21；25 s；没有 P1/P2 |

---

## 4. 与当前 kit 的差距表

> **BLOCKED 本 checkout 没有 `server/sim/content/kits/ops/op-makoto.js`、
> `op-oblvns.js`、`server/sim/content/notes.js`。** 下表的“我们现在”只能引用任务描述中的占位
> （`personaCast`/`personaHit`/`personaFear`、`battle.fx('note')`/`noteHit`、`PROJ.note`），
> 不是从本仓库源码读到的行。拿到正确 fork 后应逐行替换本表。

| # | 官方行为（证据） | 我们现在（任务描述） | 需要改的引擎原语 | 风险 |
|---:|---|---|---|---|
| 1 | S1/S2/S3 各自切不同 `UnitMode`；S3 P1→P2；切换清 buff/SP/HP、普通替身阻挡 0、P2 阻挡 2（`makoto_switchbegin`/`switchend`/`standin`） | 通用 `installDollkeeper` 一个 `<替身>` 形态 + `persona*` 占位 | `unit.form` 增加 per-skill 形态；`battle.on('fatal'/'dollSwitch')`；`addBuff` 白名单清理；`hp=max`；`mods.blockCnt` | 改 `professions.js` 会波及所有傀儡师；golden 可能动 |
| 2 | S1 友方 <50% 时 `GroupSelector` 选 Heal（0.5×ATK），替代该次攻击（`Stand_S1/.../Selector`） | `personaCast`/`personaHit` 固定特效 | `attack` 前置目标选择；`attack.heal` + `hpAtMost:0.5`；`onHit` 分支 | 不能让治疗和伤害同时发生 |
| 3 | S2 攻击只挂 fear/damage buff；35%/1.5 s；`fear` + HP<2.5×ATK 时 0.1 s 光环处决 9,999,999 纯（`makoto_s2_fear_*`） | `personaFear` 占位 | `applyStatus('fear')`；`battle.every(0.1)`；`dealDamage` pure + instant；`attack@prob` RNG | boss 300k 限伤；`instantKillLikeDamage` 语义 |
| 4 | S3 P1 4 目标/2.0×/弱点/+45 ASPD；P2 不攻击、阻挡 2、35% 闪避、4 目标 30% ATK/s（`Stand_S3_1/2`） | `personaCast` 单形态 | `unit.form` + `mods` + `every(1)` heal + `addBuff evade`；`range/maxTargets` | P2 持续用剩余 standin，不能刷新 |
| 5 | T1 切换瞬间对周围敌人 `sluggish` 8 s；ATK+65%/interval+40%/HP+35%（`makoto_tr`/`makoto_switchbegin`） | 未见（无 kit） | `addBuff(slow)` / `applyStatus('sluggish')`；`mods` | T1 只在替身状态；切换白名单 |
| 6 | T2 在 standin 结束、有 `makoto_talent_2` 时，每名 S.E.E.S. 成员周围 450% 真伤，可叠加（`makoto_allout_attack_damage`） | 未见（无 kit） | `battle.group('sees')` / `battle.allies` filter；`dealDamage` true；`on doll end` | 多成员叠加；ATK 源是结城理 |
| 7 | T1 每个活音符给所有 `mujica` 3%/2% 破甲破抗，max 10（模组 12）（`oblvns_t_1`） | `PROJ.note` 占位 | 投射物计数；`addBuff` aura to group；每 0.2 s 重算 | 只给攻击者会错；掉层时机 |
| 8 | S1 8 音符 0.1 s 独立目标、0.8→0.04、2 充能自动放（`skchr_oblvns_1`） | 单条 `PROJ.note` | `battle.every(0.1)` / `after`；`addProjectile` ×8；per-note `atkScale` | 自动释放/无目标空放 |
| 9 | S2 toggle 钢琴/风琴；钢琴 +75% ATK 物理可穿，风琴 +110 ASPD 法术慢弹（`oblvns_s_2[switch]`） | `PROJ.note` 单视觉/单弹道 | `kind:'toggle'`；两套 `mods`/`attack`/`projectile`；`passThrough` | 切换状态与弹道切换 |
| 10 | S3 2 物理 + 2 法术、3-21、物理追 DEF 最高/法术追 RES 最高、25 s（`S3` modes） | `notes.js` 单 note | `targeting.priority` 需新增 `highRes`（现只有 `highDef`）；`maxTargets`；`rangeGrid` | postFilter 68/8 的枚举映射未证实 |
| 11 | 音符离开攻击范围约 1 s 宽限、10 s 硬寿命；钢琴弹道 `_stopAfterFirstHit=0`（`ProjectileElimate` / `SimpleProjectile`） | `PROJ.note` 生命周期不受控 | `projectile` 生命周期/出界清理/穿透标志 | 客户端无精确出界时间字段，`delay=1` 是 [ASSUMED] |
| 12 | T2 +16 ASPD、范围并集；Fever +3（`oblvns_t_2*`） | 未见（无 kit） | `mods.attackSpeed`；range union（可能需要引擎新原语）；Fever 忽略 | 本模式无 Fever；范围并集复杂 |

**建议先改的顺序**（拿到正确 fork 后）：

1. **结城理 S1 + S2**：它们是占位 `personaCast`/`personaHit`/`personaFear` 的直接对应，且不依赖 P1/P2
   的复杂形态。S1 的“治疗替代攻击”和 S2 的“fear→0.1 s 处决”是最明显的玩法差距。
2. **傀儡师切换**：把 `installDollkeeper` 的单一 `<替身>` 扩成“按技能选择 mode + 保留白名单 + P2 支持形态”；
   这是 S3 和 T2 的前置。
3. **丰川祥子 T1 + S1**：音符计数/破甲和 8 连音符是普通攻击与主要输出，且 `notes.js` 已有占位可替换。
4. **S2 toggle** 与 **S3 2+2/最高 DEF/RES**：需要新增 `highRes` 优先级或 kit 自定义选择；先做 S2，
   S3 的 postFilter 映射还需实测。

---

## 5. 未解决 / [ASSUMED] / 需要实测

1. **S2 处决对 boss 领袖**：`NoSourceDamageNew` 没有 boss 过滤，但本模式的领袖单次 ≥300000 会被取消
   （`11-limits-official.md`）。9,999,999 是否被 `instantKillLikeDamage` 特殊放行，prefab 不回答；
   需要一次 boss 战实测。 **[ASSUMED: 对 boss 领袖无效]**
2. **S3 P1/P2 转换动画时长**：prefab 只有 `SwitchBegin`/`SwitchEnd` 的 `AnimatedActionToOwnerAbility`，
   没有序列化时长；按 skeleton 的 `Start_B`/`Start_2` 与现有 `DOLL_SWITCH=1 s` 记。 **[ASSUMED]**
3. **S3 P2 阻挡净值**：`block_zero` → `block_dec(-2)` → `s3_2_block(+attack@block_cnt=2)` 的叠加顺序
   在客户端 action graph 里是顺序执行；净值按 2 记，但 `block_dec` 的 -2 是否与 `block_zero` 的 -99
   叠加需要一次实战确认。 **[ASSUMED]**
4. **S3 目标最高 DEF/RES**：prefab 没有 `sortBy*` 字段，只有 `_postFilter` 68/8；官方文本与
   `highDef` 类比支持“physical→highest DEF / magic→highest RES”，但 68/8 的枚举含义未从 il2cpp
   元数据确认。 **[ASSUMED]**
5. **T1 `delay=1` 的语义**：`ElimateProjectileByExitRangeTime` 没有时间字段，只有
   `_keepAliveIfContainsTraceTarget=1`；T1 黑board 的 `delay=1` 很可能是出界宽限，但归因是
   **[ASSUMED]**。
6. **S2 钢琴“穿过敌人”**：`_stopAfterFirstHit=0` 支持穿过，但 `_maxHitNum=1`/`_stopAfterMaxHit=1`
   又像只打一次；官方文本说“命中后穿过敌人造成物理伤害”。按“穿过但每个敌人至多 1 次”实现，
   具体多目标数需实测。 **[ASSUMED]**
7. **`common_weak_damage`**：`makoto_s3_1_standin` 用 `CreateBuffById common_weak_damage`
   （`loadFromDB`，不在 `buff_template_holder`）；“弱点伤害”的具体伤害类型/倍率在客户端 DB 内，
   本 dump 看不到。 **[DATA: buffKey] + [ASSUMED: 伤害类型]**

---

## 6. 证据索引

| 结论 | 文件/节点 |
|---|---|
| 结城理模式顺序 | `charpack/char_4217_makoto.ab` → `Character._modes`（0 Default…5 Switch2Normal） |
| 结城理致命/技能切换 | `config/buff_template_holder.ab`：`makoto_tr`, `makoto_s1_trigger`, `makoto_s2_trigger`, `makoto_s3_trigger` |
| 结城理切换清 buff/HP/阻挡 | 同上：`makoto_switchbegin`, `makoto_switchend`, `makoto_switchend2normal`, `makoto_standin`, `makoto_s3_2_mod_block_cnt` |
| S1 heal 选择 | `charpack/...`：`Modes/Stand_S1/Body/Attack/Selector` (`GroupSelector`)、`HealAlly_Lt50Per`、`MagicAttack` |
| S2 fear/execute | `Modes/Stand_S2/Body/Attack` (`_activeBuffs`)、`GeneralAbilities/Ability0` (`AuraAbility`)、模板 `makoto_s2_fear_*` |
| S3 P1/P2 | `Modes/Stand_S3_1`、`Modes/Stand_S3_2`、`makoto_s3_1_standin`、`makoto_s3_2_*` |
| T1/T2 | `character_table.json` talents；`makoto_talent_1/2`、`makoto_allout_attack_*`、`makoto_on_enter_normal` |
| 祥子模式顺序 | `charpack/char_4182_oblvns.ab` → `Character._modes`（0 Default…5 S2_Fever_Mag） |
| T1 音符计数/破甲 | `oblvns_t_1`, `oblvns_t_1[attr]`；`projectile_chr_oblvns_s1_1` 的 `ProjectileActionBehaviour` |
| 普通攻击两路 | `Modes/Default/Body/Attack` (`AbilitySelectableGroup`) + `RangedMulti` + `RangedAlways` |
| S1 8 音符 | `battle/prefabs/[uc]skills.ab:skchr_oblvns_1` → `MultiRangedAttack._additionalTimes=7`、`_additionalProjectiles` |
| S2 toggle | `skchr_oblvns_2` (`ToggleSkillWithEndAnimation`) + `oblvns_s_2[switch]` |
| S3 2+2 | `Modes/S3/Body/Attack` + `GeneralAbilities/ExtraAttackMagic` |
| 投射物 | `battle/prefabs/[uc]projectiles.ab:projectile_chr_oblvns*` |
| 数值 | `.cache/gamedata/excel/skill_table.json`（levels[6]）、`character_table.json`、`battle_equip_table.json` |

---

## 6. Addendum — what this fork implemented (2026-10-27)

The server fork has the three kits this note was written for (`server/sim/content/kits/ops/op-makoto.js`,
`op-oblvns.js`, `server/sim/content/notes.js`). The second phase landed as:

- **Engine hooks**: `ai.js effectiveProfile` reads an optional `kit.profileFor(unit)` (the form's own attack — the
  persona / timbre) on top of the base profile, and `professions.js installDollkeeper` takes the form name from
  `profile.dollForm(unit)` (default `doll`) and `profile.dollNoSp === false` (the standin keeps gaining SP, so S3 can be
  re-cast inside it). Both are display-free sim hooks; no golden of another operator moved.
- **结城理**: the three skills are instant casts that switch the persona (`Stand_S1` / `Stand_S2` / `Stand_S3_1`); S3's second
  cast — or a lethal hit on P1 — turns it into `Stand_S3_2` inside the same standin (no refresh); S1 heals a <50 % ally
  for `attack@heal_scale` instead of attacking; S2's attack is 0-scale and carries the fear + `attack@atk_scale` arts
  damage, with the 0.1 s aura executing feared enemies below `attack@kill_atk_scale`×ATK for 9,999,999 pure (a boss
  leader's 300,000 cap cancels it); T1 is the standin-only +ATK/+HP/interval buff and the switch slow; T2 hits around
  every allied operator when the standin ends. The view's FORMS keys are `Stand_S1/S2/S3/S3P2`.
- **丰川祥子**: S1 fires its eight notes at 0.1 s intervals with the eight `atk_scale*` steps; S2 is a real timbre
  toggle (钢琴 +`attack@atk` ATK / physical, 风琴 +`attack@attack_speed` ASPD / arts with the slower `noteSlow`
  projectile); S3 stays 2 物理 on highest DEF + 2 法术 on highest RES (no P1/P2 — that is 结城理's S3); T1 counts the
  live `note` projectiles every 0.2 s and gives the squad `cnt × 3 %` DEF / `2 %` RES ignore (max 10; module 12), the
  aura being [ASSUMED] squad-wide for the client's `mujica` group tag.
- **Still open** (§5): S1's no-target shot at the input tile (this mode has no input tile — no shot), S2's piano
  pass-through beyond the first enemy, S3 P1's `common_weak_damage` beyond modelling it as arts, T2's per-S.E.E.S.-member
  placement (approximated around every allied operator), and the boss-leader 300,000 cap as the execute's only guard.

---

*This file is a research note, not a rule change. The kit correction is the separate second phase and
needs the private fork's `op-makoto.js` / `op-oblvns.js` / `notes.js`, absent from this checkout — the addendum above
records what the server fork did with it.*
