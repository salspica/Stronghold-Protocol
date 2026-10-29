// The sim's BattleSpec sanitizer must keep a 自选 pick's `custom` flag (experimental.customDiy): drops it, the worker /
// client-side battle composes the derived bonds and no 特质 even though the room chose the custom set.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildBattleSpec, sanitizeUnitLoadout } from '../../server/sim/spec.js';

const u = (diy) => ({ kind: 'op', chessId: 'chess_char_5_diy1_a', diy });

test('sanitizeUnitLoadout keeps a well-formed DIY pick and its custom flag', () => {
  const kept = sanitizeUnitLoadout(u({ charId: 'char_4231_clemnt', skillIndex: 0, custom: true }));
  assert.deepEqual(kept.diy, { charId: 'char_4231_clemnt', skillIndex: 0, custom: true });
  const plain = sanitizeUnitLoadout(u({ charId: 'char_4231_clemnt', custom: false }));
  assert.deepEqual(plain.diy, { charId: 'char_4231_clemnt' }, 'false is omitted');
  const bad = sanitizeUnitLoadout(u({ charId: 'char_4231_clemnt', custom: 'yes' }));
  assert.deepEqual(bad.diy, { charId: 'char_4231_clemnt' }, 'only true is a flag');
});

test('buildBattleSpec carries the flag to the battle spec', () => {
  const spec = buildBattleSpec({
    seed: 1, players: [{ playerId: 'p_0', units: [u({ charId: 'char_4231_clemnt', skillIndex: 0, custom: true })] }],
  });
  assert.equal(spec.players[0].units[0].diy.custom, true);
});
