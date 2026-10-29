// The client's 自选 record composition must follow the room's experimental.customDiy (m.private.customDiy): with it on,
// the bond popup / detail card see the custom bonds and 特质; off, the derived bonds and no 特质.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DATA } from '../match/harness.js';
import { diyRecordFor, ownDiyRecord, diyPicks, diyGetter } from '../../public/js/ui/gameLogic/diy.js';
import { bondMembers } from '../../public/js/ui/gameLogic/bonds.js';
import { renderInfo } from '../../public/js/render/app/info.js';

const T5A = 'chess_char_5_diy1_a';
const pick = { charId: 'char_4231_clemnt', skillIndex: 0 };
const dd = { chess: DATA.chess, backups: DATA.backups };

test('client: customDiy composes the custom bonds and 特质; off composes the derived set', () => {
  const normal = diyRecordFor(DATA.chess[T5A], pick, dd, false);
  assert.deepEqual(normal.bonds, ['egirShip'], 'default derived bond');
  assert.deepEqual(normal.garrisonIds ?? [], [], 'default: no 特质');
  const custom = diyRecordFor(DATA.chess[T5A], pick, dd, true);
  assert.deepEqual(custom.bonds, ['egirShip', 'indomShip', 'swiftShip', 'raidShip', 'skillfulShip']);
  assert.deepEqual(custom.garrisonIds, ['garrison_902_a']);
  // a pick that carries the flag itself (a watched teammate's UnitInfo) uses it without the room argument
  const fromUnit = diyRecordFor(DATA.chess[T5A], { ...pick, custom: true }, dd);
  assert.deepEqual(fromUnit.garrisonIds, ['garrison_902_a']);
});

test('client: ownDiyRecord reads m.private.customDiy (the room flag)', () => {
  const priv = { diy: { [T5A]: pick }, customDiy: true };
  assert.deepEqual(diyPicks(priv), { [T5A]: pick });
  const rec = ownDiyRecord(DATA.chess[T5A], priv, dd);
  assert.deepEqual(rec.garrisonIds, ['garrison_902_a']);
  const off = ownDiyRecord(DATA.chess[T5A], { ...priv, customDiy: false }, dd);
  assert.deepEqual(off.garrisonIds ?? [], []);
});

test('client: the bond popup lists a custom-bond 自选 operator (the reported bug)', () => {
  const priv = { diy: { [T5A]: pick }, customDiy: true, board: [{ kind: 'chess', id: T5A, items: [] }], hand: [], temp: [] };
  const getChess = diyGetter((id) => DATA.chess[id], priv, dd);
  const pieceRecord = (p) => diyRecordFor(DATA.chess[p.id], p.diy ?? priv.diy[T5A], dd, priv.customDiy);
  const rows = bondMembers({ bondId: 'skillfulShip', members: [] }, priv, [], getChess, () => null, pieceRecord, 'official');
  assert.ok(rows.some((r) => r.diy && r.id === T5A && r.onBoard), 'the 灵巧 member row is present');
  assert.equal(rows.find((r) => r.id === T5A)?.rec?.garrisonIds?.[0], 'garrison_902_a', 'and its custom 特质 travels with the row');
});

test('renderInfo keeps a battle UnitInfo diy.custom (the battle detail card)', () => {
  const info = renderInfo({ id: 7, uid: 7, kind: 'op', side: 'ally', defId: T5A,
    diy: { charId: 'char_4231_clemnt', skillIndex: 0, custom: true } });
  assert.deepEqual(info.diy, { charId: 'char_4231_clemnt', skillIndex: 0, uniEquipId: null, custom: true });
});
