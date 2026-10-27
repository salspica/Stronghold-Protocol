import { html } from './components.js';
import { t } from '../../../shared/i18n.js';

/** 反馈群已停用（2026-10-18）：不再展示群号，也不再提供复制。 */
export function LobbyFeedback() {
  return html`<span class="lobby-feedback">${t('反馈群：已跑路')}</span>`;
}
