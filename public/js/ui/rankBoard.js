// In-match leaderboard (right edge, collapsible): every player's current-scope output, cumulative output, bounty coins
// (own battle + 联防) and 联防 kills. Data comes from m.damage.ranks (server/match/rankBoard.js): the live round totals
// are reported by the field authority (b.progress rows) or sampled from a server-run Battle; the cumulative columns are
// the server's own PlayerState.stats at settlement time.
import { useEffect, useMemo, useRef, useState } from '../../vendor/hooks.module.js';
import { html, Icon } from './components.js';
import { t } from '../../../shared/i18n.js';
import { damageNumber } from './damageBoard.js';

export const RANK_TABS = Object.freeze([
  { id: 'round', value: 'roundDamage', kind: 'damage' },
  { id: 'total', value: 'damage', kind: 'damage' },
  { id: 'bounty', value: 'bounty', kind: 'coin' },
  { id: 'unite', value: 'uniteKills', kind: 'count' },
]);

function tabLabel(id) {
  switch (id) {
    case 'total': return t('全局输出');
    case 'bounty': return t('赏金');
    case 'unite': return t('联防击杀');
    default: return t('本回合输出');
  }
}

const amount = (value) => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
};
const tabOf = (id) => RANK_TABS.find((tab) => tab.id === id) || RANK_TABS[0];

/** Display text of one leaderboard value. */
export function rankText(value, kind = 'damage') {
  const n = amount(value);
  if (kind === 'damage') return damageNumber(n);
  return String(Math.round(n));
}

/**
 * Ranked rows of one tab, stable for equal values by seat. Missing server rows read as 0, so a reconnect or a phase
 * without a ledger never hides a player.
 * @param {any} ranks m.damage.ranks
 * @param {any[]} players m.public.players
 * @param {'round'|'total'|'bounty'|'unite'} tab
 */
export function rankRows(ranks, players = [], tab = 'round') {
  const byId = new Map();
  for (const row of Array.isArray(ranks?.players) ? ranks.players : []) {
    if (row && typeof row.playerId === 'string') byId.set(row.playerId, row);
  }
  const rows = (Array.isArray(players) ? players : []).filter((p) => p && typeof p.playerId === 'string').map((p, index) => {
    const r = byId.get(p.playerId) || {};
    const bountyOwn = amount(r.bountyOwn);
    const bountyUnite = amount(r.bountyUnite);
    return {
      playerId: p.playerId,
      name: p.name || t('博士'),
      seat: Number.isInteger(p.seat) ? p.seat : index,
      alive: p.alive !== false,
      left: p.left === true,
      roundDamage: amount(r.roundDamage),
      damage: amount(r.damage),
      bountyOwn,
      bountyUnite,
      bounty: Math.max(bountyOwn + bountyUnite, amount(r.bounty)),
      uniteKills: amount(r.uniteKills),
    };
  });
  const key = tabOf(tab).value;
  rows.sort((a, b) => (b[key] - a[key]) || (a.seat - b.seat) || a.playerId.localeCompare(b.playerId));
  return { rows, key, max: Math.max(0, ...rows.map((row) => row[key])), available: !!ranks && rows.length > 0 };
}

/**
 * The floating leaderboard: collapsed it is one small icon on the right edge; open it is a draggable window.
 * @param {{ pub?: any, snapshot?: any, players?: any[], myId?: string, open?: boolean, onToggle?: (open: boolean) => void }} props
 */
export function RankBoard({ pub = null, snapshot = null, players = [], myId = null, open = false, onToggle }) {
  const ranks = pub?.ranks || snapshot?.ranks || null;
  const [tab, setTab] = useState('round');
  const [pos, setPos] = useState(null);
  const [fabPos, setFabPos] = useState(null);
  const [dragging, setDragging] = useState(false);
  const panelRef = useRef(null);
  const fabRef = useRef(null);
  const dragRef = useRef(null);
  const fabDragRef = useRef(null);
  const suppressFabClick = useRef(false);
  const current = tabOf(tab);
  const playersKey = JSON.stringify((Array.isArray(players) ? players : []).map((p) => [p?.playerId, p?.name, p?.seat, p?.alive, p?.left]));
  const model = useMemo(() => rankRows(ranks, players, tab), [ranks, playersKey, tab]);
  const live = ranks?.live === true;
  const round = Number.isInteger(ranks?.round) && ranks.round > 0 ? ranks.round : null;
  const status = !ranks ? t('尚无战斗记录') : live ? t('实时') : t('已结算');
  useEffect(() => {
    if (!open) return undefined;
    setPos((p) => clampPanelPos(p || defaultPanelPos(), panelRef.current));
    const onResize = () => {
      setPos((p) => (p ? clampPanelPos(p, panelRef.current) : p));
      setFabPos((p) => (p ? clampFabPos(p, fabRef.current) : p));
    };
    globalThis.addEventListener('resize', onResize);
    return () => globalThis.removeEventListener('resize', onResize);
  }, [open]);
  const startDrag = (e) => {
    if ((e.button != null && e.button !== 0) || e.target?.closest?.('button')) return;
    const at = pos || defaultPanelPos();
    dragRef.current = { id: e.pointerId, dx: e.clientX - at.left, dy: e.clientY - at.top };
    setDragging(true);
    e.currentTarget?.setPointerCapture?.(e.pointerId);
    e.preventDefault();
  };
  const moveDrag = (e) => {
    const drag = dragRef.current;
    if (!drag || drag.id !== e.pointerId) return;
    setPos(clampPanelPos({ left: e.clientX - drag.dx, top: e.clientY - drag.dy }, panelRef.current));
  };
  const endDrag = (e) => {
    if (!dragRef.current || dragRef.current.id !== e.pointerId) return;
    dragRef.current = null;
    setDragging(false);
    e.currentTarget?.releasePointerCapture?.(e.pointerId);
  };
  const startFabDrag = (e) => {
    if (e.button != null && e.button !== 0) return;
    suppressFabClick.current = false;
    const at = fabPos || defaultFabPos();
    fabDragRef.current = { id: e.pointerId, x: e.clientX, y: e.clientY, left: at.left, top: at.top, moved: false };
    e.currentTarget?.setPointerCapture?.(e.pointerId);
  };
  const moveFabDrag = (e) => {
    const drag = fabDragRef.current;
    if (!drag || drag.id !== e.pointerId) return;
    const dx = e.clientX - drag.x;
    const dy = e.clientY - drag.y;
    if (!drag.moved && Math.hypot(dx, dy) < 4) return;
    drag.moved = true;
    suppressFabClick.current = true;
    setFabPos(clampFabPos({ left: drag.left + dx, top: drag.top + dy }, fabRef.current));
  };
  const endFabDrag = (e) => {
    const drag = fabDragRef.current;
    if (!drag || drag.id !== e.pointerId) return;
    fabDragRef.current = null;
    e.currentTarget?.releasePointerCapture?.(e.pointerId);
  };
  const clickFab = () => {
    if (suppressFabClick.current) { suppressFabClick.current = false; return; }
    onToggle?.(true);
  };
  const at = pos || defaultPanelPos();
  const fab = fabPos || defaultFabPos();
  return html`<aside class="rank-board" aria-label=${t('战场排行')}>
    ${open ? html`<section id="match-rank-board" ref=${panelRef} class=${`rank-board__panel${dragging ? ' is-dragging' : ''}`}
      style=${{ left: `${at.left}px`, top: `${at.top}px` }} aria-label=${t('战场排行')}>
      <header class="rank-board__header" onPointerDown=${startDrag} onPointerMove=${moveDrag} onPointerUp=${endDrag}
        onPointerCancel=${endDrag} onLostPointerCapture=${endDrag}>
        <div class="rank-board__heading"><span class="rank-board__eyebrow">BATTLE RANKING</span><strong>${t('战场排行')}</strong></div>
        <span class="rank-board__status"><${Icon} name=${live ? 'signal' : 'snow'} />${status}</span>
        <button type="button" class="rank-board__close" aria-label=${t('收起战场排行')} onClick=${() => onToggle?.(false)}><${Icon} name="close" /></button>
      </header>
      <div class="rank-board__tabs" role="tablist" aria-label=${t('排行项目')}>
        ${RANK_TABS.map((item) => html`<button key=${item.id} type="button" role="tab" aria-selected=${String(tab === item.id)}
          class=${tab === item.id ? 'is-on' : ''} onClick=${() => setTab(item.id)}>${tabLabel(item.id)}</button>`)}
      </div>
      <div class="rank-board__meta">
        <span>${round ? t('第 {r} 回合', { r: round }) : t('尚无战斗记录')}</span>
        ${current.id === 'bounty' ? html`<small>${t('个人 + 联防')}</small>` : null}
      </div>
      ${model.available ? html`<ol class="rank-board__rows">
        ${model.rows.map((row, index) => {
          const value = row[model.key];
          const share = model.max > 0 ? Math.min(100, value / model.max * 100) : 0;
          return html`<li key=${row.playerId} class=${`rank-board__row${row.playerId === myId ? ' is-me' : ''}${row.alive ? '' : ' is-out'}`}
            aria-label=${t('{name}：{value}', { name: row.name, value: rankText(value, current.kind) })}>
            <span class=${`rank-board__rank num${index < 3 && value > 0 ? ` is-top is-top-${index + 1}` : ''}`}>${index + 1}</span>
            <span class="rank-board__body">
              <span class="rank-board__label"><span class="rank-board__name">${row.name}</span>
                <span class="rank-board__value num">${rankText(value, current.kind)}</span></span>
              <span class="rank-board__meter"><span class="rank-board__bar" aria-hidden="true"><i style=${`transform:scaleX(${share / 100})`}></i></span></span>
              ${current.id === 'bounty' ? html`<span class="rank-board__sub">${t('个人 {own} · 联防 {unite}', {
                own: rankText(row.bountyOwn, 'coin'), unite: rankText(row.bountyUnite, 'coin') })}</span>` : null}
            </span>
          </li>`;
        })}
      </ol>` : html`<div class="rank-board__empty"><${Icon} name="signal" /><strong>${t('尚无战斗记录')}</strong><span>${pub ? t('未收到服务器排行数据，请重启服务端并刷新页面') : t('开战后自动记录干员输出')}</span></div>`}
    </section>` : html`<button type="button" ref=${fabRef} class="rank-board__fab" aria-expanded="false" aria-controls="match-rank-board"
      style=${{ left: `${fab.left}px`, top: `${fab.top}px` }} aria-label=${t('展开战场排行')} title=${t('展开战场排行')}
      onPointerDown=${startFabDrag} onPointerMove=${moveFabDrag} onPointerUp=${endFabDrag} onPointerCancel=${endFabDrag}
      onLostPointerCapture=${endFabDrag} onClick=${clickFab}><${Icon} name="signal" /></button>`}
  </aside>`;
}

const clamp = (value, lo, hi) => Math.min(hi, Math.max(lo, value));

/** The first open position: left of the top-right effects column, vertically around the middle. */
export function defaultPanelPos() {
  const vw = globalThis.innerWidth || 1280;
  const vh = globalThis.innerHeight || 720;
  const w = Math.min(340, vw - 24);
  const h = Math.min(Math.max(300, Math.round(vh * 0.58)), 560);
  return {
    left: Math.max(8, vw - w - (vw > 900 ? 100 : 64)),
    top: Math.max(72, Math.min(vh - h - 80, Math.round(vh * 0.28))),
  };
}

function clampPanelPos(pos, el = null) {
  const vw = globalThis.innerWidth || 1280;
  const vh = globalThis.innerHeight || 720;
  const w = el?.offsetWidth || 340;
  const h = el?.offsetHeight || 480;
  return {
    left: clamp(pos.left, 8, Math.max(8, vw - w - 8)),
    top: clamp(pos.top, 8, Math.max(8, vh - h - 8)),
  };
}

/** The collapsed icon's first position: right edge, below the top-right effects column. */
export function defaultFabPos() {
  const vw = globalThis.innerWidth || 1280;
  const vh = globalThis.innerHeight || 720;
  return { left: Math.max(8, vw - 56), top: Math.max(72, Math.round(vh * 0.48)) };
}

function clampFabPos(pos, el = null) {
  const vw = globalThis.innerWidth || 1280;
  const vh = globalThis.innerHeight || 720;
  const w = el?.offsetWidth || 44;
  const h = el?.offsetHeight || 44;
  return {
    left: clamp(pos.left, 8, Math.max(8, vw - w - 8)),
    top: clamp(pos.top, 8, Math.max(8, vh - h - 8)),
  };
}
