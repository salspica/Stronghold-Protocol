// 最终首领血量: a 1–100× rotary knob for the room's 实验性选项. The dial is stateless (the tests render components
// directly); dragging / wheel / keyboard updates the DOM in place and commits the integer value on release.
import { html } from './components.js';

export const BOSS_KNOB_MIN = 1;
export const BOSS_KNOB_MAX = 100;
const SWEEP = 270; // -135° … +135° (top = 0), the bottom gap is dead
const START = -135;

/** A 1–100 integer, clamped. */
export function clampBossHp(value) {
  const n = Math.round(Number(value));
  return Math.min(BOSS_KNOB_MAX, Math.max(BOSS_KNOB_MIN, Number.isFinite(n) ? n : BOSS_KNOB_MIN));
}

/** The dial angle (degrees, 0 = top, clockwise positive) of a 1–100 value. */
export function bossHpAngle(value) {
  return START + ((clampBossHp(value) - BOSS_KNOB_MIN) / (BOSS_KNOB_MAX - BOSS_KNOB_MIN)) * SWEEP;
}

/** The 1–100 value at a dial angle; the bottom dead zone snaps to the nearer end. */
export function bossHpFromAngle(deg) {
  let a = ((Number(deg) + 180) % 360 + 360) % 360 - 180;
  if (a > 135) a = 135;
  else if (a < -135) a = -135;
  const v = BOSS_KNOB_MIN + ((a - START) / SWEEP) * (BOSS_KNOB_MAX - BOSS_KNOB_MIN);
  return clampBossHp(v);
}

/** The pointer angle around `rect`'s centre, in the dial's coordinates (0 = above the centre). */
export function pointerAngle(clientX, clientY, rect) {
  const dx = clientX - (rect.left + rect.width / 2);
  const dy = clientY - (rect.top + rect.height / 2);
  return (Math.atan2(dx, -dy) * 180) / Math.PI;
}

const ARC_OF = (n) => `${((clampBossHp(n) - BOSS_KNOB_MIN) / (BOSS_KNOB_MAX - BOSS_KNOB_MIN)) * SWEEP}deg`;

function paint(root, n) {
  const v = clampBossHp(n);
  root.dataset.value = String(v);
  root.setAttribute('aria-valuenow', String(v));
  root.style.setProperty('--boss-angle', `${bossHpAngle(v)}deg`);
  root.style.setProperty('--boss-arc', ARC_OF(v));
  const out = root.querySelector('[data-knob-output]');
  if (out) out.textContent = `×${v}`;
}

function fromPointer(root, e) {
  const rect = root.getBoundingClientRect();
  paint(root, bossHpFromAngle(pointerAngle(e.clientX, e.clientY, rect)));
}

const dragOn = (root) => root.dataset.drag === '1';

function endDrag(root, commit, onChange) {
  if (!dragOn(root)) return;
  delete root.dataset.drag;
  if (commit) onChange?.(clampBossHp(root.dataset.value));
}

function onKey(e, root, disabled, onChange) {
  if (disabled) return;
  const cur = clampBossHp(root.dataset.value);
  const step = e.key === 'PageUp' ? 10 : e.key === 'PageDown' ? -10 : 1;
  let next = null;
  if (e.key === 'ArrowUp' || e.key === 'ArrowRight') next = cur + step;
  else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') next = cur - step;
  else if (e.key === 'Home') next = BOSS_KNOB_MIN;
  else if (e.key === 'End') next = BOSS_KNOB_MAX;
  if (next == null) return;
  e.preventDefault();
  paint(root, next);
  onChange?.(clampBossHp(next));
}

/**
 * The 3D thunder dial. Props: `id`, `value` (1–100), `disabled`, `onChange(next)`, `label`.
 * Pointerdown paints the value under the cursor, move follows the angle, pointerup commits (so a drag sends one
 * room.setExperimental); keyboard steps by 1 / 10 and commits at once.
 */
export function BossHpKnob({ id = 'experimental-boss-hp', value = 1, disabled = false, onChange, label = '最终首领血量' }) {
  const v = clampBossHp(value);
  return html`<div id=${id} class=${`boss-knob${disabled ? ' is-disabled' : ''}`} role="slider" tabindex=${disabled ? -1 : 0}
      aria-valuemin=${BOSS_KNOB_MIN} aria-valuemax=${BOSS_KNOB_MAX} aria-valuenow=${v} aria-label=${label}
      data-value=${v} style=${`--boss-angle:${bossHpAngle(v)}deg;--boss-arc:${ARC_OF(v)}`}
      onPointerDown=${(e) => {
        if (disabled) return;
        e.preventDefault();
        const root = e.currentTarget;
        root.setPointerCapture?.(e.pointerId);
        root.dataset.drag = '1';
        fromPointer(root, e);
      }}
      onPointerMove=${(e) => {
        if (disabled) return;
        const root = e.currentTarget;
        if (dragOn(root)) fromPointer(root, e);
      }}
      onPointerUp=${(e) => endDrag(e.currentTarget, true, onChange)}
      onPointerCancel=${(e) => endDrag(e.currentTarget, true, onChange)}
      onKeyDown=${(e) => onKey(e, e.currentTarget, disabled, onChange)}>
    <div class="boss-knob__halo"></div>
    <div class="boss-knob__ring">
      <div class="boss-knob__ticks">
        ${Array.from({ length: 21 }, (_, i) => html`<span key=${i} class=${`boss-knob__tick${i % 2 ? '' : ' is-major'}`}
          style=${`--tick:${i}`}></span>`)}
      </div>
      <div class="boss-knob__arc"></div>
      <div class="boss-knob__cap"></div>
      <div class="boss-knob__face">
        <span class="boss-knob__bolt" aria-hidden="true">⚡</span>
        <span class="boss-knob__value" data-knob-output>×${v}</span>
        <span class="boss-knob__caption">BOSS HP</span>
      </div>
      <span class="boss-knob__needle"></span>
    </div>
    <div class="boss-knob__scale"><span>1</span><span>50</span><span>100</span></div>
  </div>`;
}
