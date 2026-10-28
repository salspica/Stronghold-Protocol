// The 最终首领血量 thunder knob of the room's 实验性选项 (public/js/ui/experimental.js + ui/knob.js): a free 1–100×
// dial, available to every room (solo too), only the host's page may change it, and ×1 is removed from the DTO.
import test from 'node:test';
import assert from 'node:assert/strict';
import { ExperimentalOptions, experimentalOptions, experimentalSummary, experimentalChanged } from '../../public/js/ui/experimental.js';
import { BossHpKnob, bossHpAngle, bossHpFromAngle, clampBossHp, pointerAngle } from '../../public/js/ui/knob.js';

const walk = node => Array.isArray(node) ? node.flatMap(walk) : node?.props ? [node, ...walk(node.props.children)] : [];
const rules = (bossHpMul) => ({ revivalEnabled: false, disableSharedPool: false, ...(bossHpMul > 1 ? { bossHpMul } : {}) });
const control = (value, props = {}) => walk(ExperimentalOptions({ open: true, value, editable: true, ...props }))
  .find(n => n.props.id === 'experimental-boss-hp');

test('the thunder knob is in every room, shows the room value and is a 1–100 dial', () => {
  for (const mode of ['coop', 'solo']) {
    const c = control(rules(1), { mode });
    assert.ok(c, `knob in ${mode}`);
    assert.equal(c.type, BossHpKnob, `knob component in ${mode}`);
    assert.equal(c.props.value, 1);
    assert.equal(control(rules(37), { mode }).props.value, 37, 'the room value is shown');
  }
  const knob = BossHpKnob({ value: 50 });
  assert.equal(knob.props['aria-valuemin'], 1);
  assert.equal(knob.props['aria-valuemax'], 100);
  assert.equal(knob.props['aria-valuenow'], 50);
  assert.equal(knob.props['aria-label'], '最终首领血量');
});

test('the dial maps 1..100 to -135°..+135°, clamps the dead zone and snaps integers', () => {
  assert.equal(bossHpAngle(1), -135);
  assert.equal(bossHpAngle(100), 135);
  assert.equal(Math.round(bossHpAngle(50)), -1);
  assert.equal(bossHpFromAngle(-135), 1);
  assert.equal(bossHpFromAngle(135), 100);
  assert.equal(bossHpFromAngle(0), 51);
  assert.equal(bossHpFromAngle(bossHpAngle(50)), 50);
  assert.equal(bossHpFromAngle(179), 100, 'bottom-right gap snaps to 100');
  assert.equal(bossHpFromAngle(-179), 1, 'bottom-left gap snaps to 1');
  assert.equal(clampBossHp(-5), 1);
  assert.equal(clampBossHp(101), 100);
  assert.equal(clampBossHp(1.6), 2);
  assert.equal(clampBossHp('37'), 37);
  // the pointer angle is 0 above the centre, +90 right, 180 below
  const rect = { left: 0, top: 0, width: 100, height: 100 };
  assert.equal(pointerAngle(50, 0, rect), 0);
  assert.equal(pointerAngle(100, 50, rect), 90);
  assert.equal(pointerAngle(50, 100, rect), 180);
});

test('turning the knob reports the whole rule set; ×1 removes the key', () => {
  const changes = [], value = { revivalEnabled: true, disableSharedPool: false, bossHpMul: 10 };
  const c = control(value, { onChange: x => changes.push(x) });
  c.props.onChange(100);
  assert.deepEqual(changes.at(-1), { revivalEnabled: true, disableSharedPool: false, bossHpMul: 100 });
  c.props.onChange(7);
  assert.deepEqual(changes.at(-1), { revivalEnabled: true, disableSharedPool: false, bossHpMul: 7 });
  c.props.onChange(1);
  assert.deepEqual(changes.at(-1), { revivalEnabled: true, disableSharedPool: false });
  assert.deepEqual(experimentalOptions(rules(1)), { revivalEnabled: false, disableSharedPool: false }, '×1 omitted');
  assert.deepEqual(experimentalOptions(rules(37)), { revivalEnabled: false, disableSharedPool: false, bossHpMul: 37 });
  assert.equal(experimentalChanged(rules(10)), true);
  assert.equal(experimentalChanged(rules(1)), false);
});

test('a non-editable or busy host page cannot turn it; the summary names the multiplier', () => {
  const changes = [];
  for (const props of [{ editable: false }, { busy: true }]) {
    const c = control(rules(10), { ...props, onChange: x => changes.push(x) });
    assert.equal(c.props.disabled, true);
    c.props.onChange(100);
  }
  assert.equal(changes.length, 0);
  assert.match(experimentalSummary(rules(37)), /最终首领 ×37/);
  assert.doesNotMatch(experimentalSummary(rules(1)), /最终首领/);
});
