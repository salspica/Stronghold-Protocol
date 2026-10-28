// Room-owned experimental rules are snapshotted at launch, never player votes.
import { MAX_SEATS } from './constants.js';
import { isPlayerCapacity, roomCapacity } from './playerCapacity.js';

export const EXPERIMENTAL_DEFAULTS = Object.freeze({ revivalEnabled: false, disableSharedPool: false });
/** The 最终首领血量 choices (×1 = the official pool, canonically omitted). */
export const BOSS_HP_MULTIPLIERS = Object.freeze([1, 5, 10, 100]);
export const isBossHpMul = value => BOSS_HP_MULTIPLIERS.includes(value);

export function isExperimental(value) {
  if (!value || typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype) return false;
  const keys = Reflect.ownKeys(value);
  if (keys.length < 2 || keys.length > 5) return false;
  for (const key of Object.keys(EXPERIMENTAL_DEFAULTS)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor?.enumerable !== true || typeof descriptor.value !== 'boolean') return false;
  }
  return keys.every(key => {
    if (Object.hasOwn(EXPERIMENTAL_DEFAULTS, key)) return true;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor?.enumerable !== true) return false;
    return key === 'playerCapacity' ? isPlayerCapacity(descriptor.value)
      : key === 'disableDuckLord' ? typeof descriptor.value === 'boolean'
        : key === 'bossHpMul' && isBossHpMul(descriptor.value);
  });
}

/** @param {{ revivalEnabled: boolean, disableSharedPool: boolean, playerCapacity?: number, disableDuckLord?: boolean, bossHpMul?: number }} [value] */
export function experimentalOptions(value = EXPERIMENTAL_DEFAULTS) {
  if (!isExperimental(value)) throw new TypeError('invalid experimental options');
  const capacity = roomCapacity('coop', value);
  return Object.freeze({ revivalEnabled: value.revivalEnabled, disableSharedPool: value.disableSharedPool,
    ...(capacity === MAX_SEATS ? {} : { playerCapacity: capacity }),
    // Optional and false by default: ordinary rooms and legacy DTOs keep their two-flag shape.
    ...(capacity > MAX_SEATS && value.disableDuckLord === true ? { disableDuckLord: true } : {}),
    // 最终首领血量 (R14 / R15): omitted at ×1, so a standard room's DTO does not grow the key.
    ...(value.bossHpMul > 1 ? { bossHpMul: value.bossHpMul } : {}) });
}

const duckLordDisabled = value => roomCapacity('coop', value) > MAX_SEATS && value.disableDuckLord === true;
const bossHpOf = value => (value?.bossHpMul > 1 ? value.bossHpMul : 1);
export const experimentalKey = value => {
  const key = `${value.revivalEnabled ? 1 : 0}${value.disableSharedPool ? 1 : 0}`;
  const capacity = roomCapacity('coop', value);
  const legacy = capacity === MAX_SEATS ? key : `${key}:${capacity}`;
  const duck = duckLordDisabled(value) ? `${legacy}:duck` : legacy;
  return bossHpOf(value) > 1 ? `${duck}:boss${bossHpOf(value)}` : duck;
};
export const sameExperimental = (a, b) => !!a && !!b
  && a.revivalEnabled === b.revivalEnabled && a.disableSharedPool === b.disableSharedPool
  && roomCapacity('coop', a) === roomCapacity('coop', b)
  && duckLordDisabled(a) === duckLordDisabled(b)
  && bossHpOf(a) === bossHpOf(b);
