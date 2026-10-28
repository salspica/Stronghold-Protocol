// The 最终首领血量 select of the room's 实验性选项 (public/js/ui/experimental.js): 默认 ×1 / ×5 / ×10 / ×100, available
// to every room (solo too), only the host's page may change it, and ×1 is removed from the DTO.
import test from 'node:test';
import assert from 'node:assert/strict';
import { ExperimentalOptions, experimentalOptions, experimentalSummary, experimentalChanged } from '../../public/js/ui/experimental.js';

const walk = node => Array.isArray(node) ? node.flatMap(walk) : node?.props ? [node, ...walk(node.props.children)] : [];
const rules = (bossHpMul) => ({ revivalEnabled: false, disableSharedPool: false, ...(bossHpMul > 1 ? { bossHpMul } : {}) });
const control = (value, props = {}) => walk(ExperimentalOptions({ open: true, value, editable: true, ...props }))
  .find(n => n.props.id === 'experimental-boss-hp');
const choose = (c, n) => c.props.onChange({ currentTarget: { value: String(n) } });

test('the boss-HP select offers 1 / 5 / 10 / 100 in every room and starts at ×1', () => {
  for (const mode of ['coop', 'solo']) {
    const c = control(rules(1), { mode });
    assert.ok(c, `select in ${mode}`);
    const values = walk(c).filter(n => n.type === 'option').map(n => String(n.props.value));
    assert.deepEqual(values, ['1', '5', '10', '100'], `options ${mode}`);
    assert.equal(String(c.props.value), '1');
    assert.equal(String(control(rules(10), { mode }).props.value), '10', 'the room value is shown');
  }
});

test('choosing a multiplier reports the whole rule set; ×1 removes the key', () => {
  const changes = [], value = { revivalEnabled: true, disableSharedPool: false, bossHpMul: 10 };
  const c = control(value, { onChange: x => changes.push(x) });
  choose(c, 100);
  assert.deepEqual(changes.at(-1), { revivalEnabled: true, disableSharedPool: false, bossHpMul: 100 });
  choose(c, 5);
  assert.deepEqual(changes.at(-1), { revivalEnabled: true, disableSharedPool: false, bossHpMul: 5 });
  choose(c, 1);
  assert.deepEqual(changes.at(-1), { revivalEnabled: true, disableSharedPool: false });
  assert.deepEqual(experimentalOptions(rules(1)), { revivalEnabled: false, disableSharedPool: false }, '×1 omitted');
  assert.deepEqual(experimentalOptions(rules(100)), { revivalEnabled: false, disableSharedPool: false, bossHpMul: 100 });
  assert.equal(experimentalChanged(rules(10)), true);
  assert.equal(experimentalChanged(rules(1)), false);
});

test('a non-editable or busy host page cannot change it; the summary names the multiplier', () => {
  const changes = [];
  for (const props of [{ editable: false }, { busy: true }]) {
    const c = control(rules(10), { ...props, onChange: x => changes.push(x) });
    assert.equal(c.props.disabled, true);
    choose(c, 100);
  }
  assert.equal(changes.length, 0);
  assert.match(experimentalSummary(rules(10)), /最终首领 ×10/);
  assert.doesNotMatch(experimentalSummary(rules(1)), /最终首领/);
});
