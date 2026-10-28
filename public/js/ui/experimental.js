import { html, Button, Modal } from './components.js';
import { t, tc } from '../../../shared/i18n.js';
import { MAX_SEATS } from '../../../shared/constants.js';
import { PLAYER_CAPACITIES, isPlayerCapacity, roomCapacity } from '../../../shared/playerCapacity.js';
import { isBossHpMul } from '../../../shared/experimental.js';
import { BossHpKnob } from './knob.js';

export function experimentalOptions(input) {
  const capacity = roomCapacity('coop', input);
  return { revivalEnabled: input?.revivalEnabled === true, disableSharedPool: input?.disableSharedPool === true,
    ...(capacity > MAX_SEATS && input?.disableDuckLord === true ? { disableDuckLord: true } : {}),
    ...(input?.customDiy === true ? { customDiy: true } : {}),
    ...(isBossHpMul(input?.bossHpMul) && input.bossHpMul > 1 ? { bossHpMul: input.bossHpMul } : {}),
    ...(capacity === MAX_SEATS ? {} : { playerCapacity: capacity }) };
}

/** Whether any option differs from a standard room's (the room's 实验性选项 button is then marked). */
export function experimentalChanged(input) {
  const options = experimentalOptions(input);
  return options.revivalEnabled || options.disableSharedPool || !!options.disableDuckLord || !!options.customDiy
    || !!options.playerCapacity || !!options.bossHpMul;
}

export function experimentalSummary(input) {
  const options = experimentalOptions(input);
  const summary = t('复活 {0} · 共享卡池 {1}', { 0: options.revivalEnabled ? t('开启') : tc('toggle', '关闭'), 1: options.disableSharedPool ? tc('toggle', '关闭') : t('开启') });
  const rules = options.disableDuckLord ? `${summary} · ${t('禁用鸭爵策略')}` : summary;
  const diy = options.customDiy ? t('{rules} · 自选干员自定义', { rules }) : rules;
  const boss = options.bossHpMul ? t('{rules} · 最终首领 ×{n}', { rules: diy, n: options.bossHpMul }) : diy;
  return options.playerCapacity ? t('{rules} · {n} 人模式', { rules: boss, n: options.playerCapacity }) : boss;
}

export function ExperimentalSummary({ value }) {
  return html`<span class="experimental-summary">${experimentalSummary(value)}</span>`;
}

export function ExperimentalOptions({ open, value, mode = 'coop', source = 'private', editable = false, busy = false, onChange, onClose }) {
  const options = experimentalOptions(value);
  const capacity = roomCapacity(mode, options);
  const change = (field, checked) => {
    if (editable && !busy) onChange?.({ ...options, [field]: checked });
  };
  const setCapacity = next => {
    if (!editable || busy || mode !== 'coop' || source === 'matchmaking' || !isPlayerCapacity(next)) return;
    const { playerCapacity, ...rules } = options;
    if (next === MAX_SEATS) {
      const { disableDuckLord, ...ordinary } = rules;
      onChange?.(ordinary);
    } else onChange?.({ ...rules, playerCapacity: next });
  };
  // 最终首领血量: every room (solo too), ×1 canonically omitted from the DTO
  const setBossHp = next => {
    if (!editable || busy || !isBossHpMul(next)) return;
    const { bossHpMul, ...rules } = options;
    onChange?.(next > 1 ? { ...rules, bossHpMul: next } : rules);
  };
  return html`<${Modal} open=${open} title=${t('实验性选项')} micro="EXPERIMENTAL" ariaLabel=${t('实验性选项')} trapFocus=${true}
      class="experimental-modal" onClose=${onClose}
      actions=${html`<${Button} icon="check" onClick=${onClose}>${t('完成')}<//>`}>
    <div class="experimental-options">
      <label class="experimental-option" for="experimental-revival">
        <span><strong>${t('队友复活')}</strong><small>${t('符合救援条件的队友可支付 10 生命抵消死亡，每人每局一次。')}</small></span>
        <input id="experimental-revival" type="checkbox" role="switch" checked=${options.revivalEnabled}
          disabled=${!editable || busy} onChange=${e => change('revivalEnabled', e.currentTarget.checked)} />
      </label>
      <label class="experimental-option" for="experimental-pool">
        <span><strong>${t('禁用共享卡池')}</strong><small>${t('每位博士使用独立卡池，不再争用同一干员库存。')}</small></span>
        <input id="experimental-pool" type="checkbox" role="switch" checked=${options.disableSharedPool}
          disabled=${!editable || busy} onChange=${e => change('disableSharedPool', e.currentTarget.checked)} />
      </label>
      <label class="experimental-option" for="experimental-custom-diy">
        <span><strong>${t('自选干员自定义改动')}</strong><small>${t('结城理、丰川祥子等 8 名干员使用自定义盟约与特质；关闭时恢复其原本盟约且没有特质。')}</small></span>
        <input id="experimental-custom-diy" type="checkbox" role="switch" checked=${options.customDiy === true}
          disabled=${!editable || busy} onChange=${e => change('customDiy', e.currentTarget.checked)} />
      </label>
      <div class="experimental-option experimental-option--knob">
        <span><strong>${t('最终首领血量')}</strong><small>${t('拖动旋钮，在 1–100 倍之间自由调节第 14 / 15 回合的首领生命值；默认 ×1 保持官方数值。')}</small></span>
        <${BossHpKnob} id="experimental-boss-hp" label=${t('最终首领血量')} value=${options.bossHpMul ?? 1}
          disabled=${!editable || busy} onChange=${setBossHp} />
      </div>
      ${mode === 'coop' && source !== 'matchmaking' ? html`<label class="experimental-option" for="experimental-multiplayer">
        <span><strong>${t('扩展同盟人数')}</strong><small>${t('可直接开局，或整队匹配相同人数模式的房间。所有成员需更新页面，人数较多时等待与演算时间可能增加。')}</small></span>
        <input id="experimental-multiplayer" type="checkbox" role="switch" checked=${capacity > MAX_SEATS}
          disabled=${!editable || busy} onChange=${e => setCapacity(e.currentTarget.checked ? 8 : MAX_SEATS)} />
      </label>` : null}
      ${mode === 'coop' && source !== 'matchmaking' && capacity > MAX_SEATS ? html`<label class="experimental-capacity" for="experimental-capacity">
        <span>${t('同盟人数模式')}</span>
        <select id="experimental-capacity" value=${capacity} disabled=${!editable || busy} onChange=${e => setCapacity(Number(e.currentTarget.value))}>
          ${PLAYER_CAPACITIES.map(n => html`<option key=${n} value=${n}>${t('{n} 人', { n })}</option>`)}
        </select>
      </label>` : null}
      ${mode === 'coop' && capacity > MAX_SEATS ? html`<label class="experimental-option" for="experimental-ducklord">
        <span><strong>${t('禁用鸭爵策略')}</strong><small>${t('勾选后，本局无法选择鸭爵策略；不影响其他策略。')}</small></span>
        <input id="experimental-ducklord" type="checkbox" checked=${options.disableDuckLord === true}
          disabled=${!editable || busy} onChange=${e => change('disableDuckLord', e.currentTarget.checked)} />
      </label>` : null}
    </div>
    <p class="experimental-options__note">${editable ? t('开局后不可更改') : t('由房间创建者设置')}</p>
  <//>`;
}
