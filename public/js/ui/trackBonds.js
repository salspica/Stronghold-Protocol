// 盟约追踪 (bond tracking): a personal, client-only display filter for the shop and merge-reward operator cards. In the
// prep phase a player opens the picker from the shop bar and marks any bonds; every card of an operator that carries one
// of them shows a 追踪 badge (ui/shopBar.js ChessCard) so a wanted operator is hard to miss while refreshing / buying.
// It changes nothing in the match and is never sent to the server (a display preference, like the collapsed panels).
// Texts go through t() (docs/I18N.md).

import { html, Button, Icon, Modal } from './components.js';
import { BondGlyph } from './gameComponents.js';
import { t } from '../../../shared/i18n.js';

const cx = (...a) => a.filter(Boolean).join(' ');

/**
 * Every bond of a match, in the official identifier order (the picker's card order; core and regular alike).
 * @param {any[]} bonds gd.list('bonds')
 * @returns {any[]}
 */
export function trackableBonds(bonds) {
  return (Array.isArray(bonds) ? bonds : [])
    .filter((b) => b && typeof b.bondId === 'string')
    .sort((a, b) => (Number(a.identifier) || 0) - (Number(b.identifier) || 0));
}

/** Whether a card's bond list carries a tracked bond. @param {string[]|null} bonds @param {Set<string>|null} tracked */
export function hasTrackedBond(bonds, tracked) {
  if (!tracked || !tracked.size || !Array.isArray(bonds)) return false;
  return bonds.some((b) => tracked.has(b));
}

/**
 * The 盟约追踪 picker: one toggle per bond (multi-select), a 清空追踪 and a 关闭 action. A bond the mode switches off is
 * still selectable but reads 本局禁用, exactly like the 预选盟约 picker (ui/bondPlan.js).
 * @param {{ open: boolean, onClose: Function, bonds: any[], values: Set<string>, off: Set<string>,
 *   onToggle: (bondId: string) => void, onClear: () => void }} props
 */
export function BondTrackPicker({ open, onClose, bonds, values, off, onToggle, onClear }) {
  const picked = values instanceof Set ? values : new Set();
  const offSet = off instanceof Set ? off : new Set();
  const list = trackableBonds(bonds);
  return html`<${Modal} open=${open} onClose=${onClose} title=${t('盟约追踪')} micro="BOND TRACK" class="bplan-dlg"
    actions=${html`
      <${Button} variant="ghost" icon="close" disabled=${!picked.size} onClick=${onClear}>${t('清空追踪')}<//>
      <${Button} variant="secondary" data-autofocus onClick=${onClose}>${t('关闭')}<//>`}>
    <p class="bplan-dlg__tip t-dim">${t('选择要追踪的盟约；商店和奖励中属于这些盟约的干员会标记「追踪」。只影响你自己的显示。已追踪 {n} 个。', { n: picked.size })}</p>
    <div class="bplan-dlg__grid" role="group" aria-label=${t('盟约追踪')}>${list.map((b) => {
      const sel = picked.has(b.bondId);
      const isOff = offSet.has(b.bondId);
      return html`<button key=${b.bondId} type="button" aria-pressed=${sel ? 'true' : 'false'}
          class=${cx('bplan-card', 'btrack-card', sel && 'is-sel', isOff && 'is-off')}
          data-bond=${b.bondId} onClick=${() => onToggle(b.bondId)}>
        <${BondGlyph} bondId=${b.bondId} class="bplan-card__glyph" />
        <span class="bplan-card__name">${b.name}</span>
        ${isOff ? html`<span class="bplan-card__off">${t('本局禁用')}</span>` : null}
        ${sel ? html`<span class="bplan-card__mine"><${Icon} name="check" /></span>` : null}
      </button>`;
    })}</div>
  <//>`;
}
