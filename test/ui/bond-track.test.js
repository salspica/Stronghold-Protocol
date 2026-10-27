// 盟约追踪 (ui/trackBonds.js, ui/shopBar.js): a prep-phase multi-select of bonds; every shop / merge-reward operator card
// carrying one shows a 追踪 ribbon and a mint highlight. Client-only: nothing is sent to the server.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (p) => readFileSync(path.join(ROOT, p), 'utf8');

globalThis.fetch = async (url) => {
  const name = String(url).split('/').pop();
  try {
    const body = readFileSync(path.join(ROOT, 'data', name), 'utf8');
    return { ok: true, status: 200, json: async () => JSON.parse(body) };
  } catch {
    return { ok: false, status: 404, json: async () => ({}) };
  }
};

const { trackableBonds, hasTrackedBond } = await import('../../public/js/ui/trackBonds.js');
const { ChessCard, RewardCards } = await import('../../public/js/ui/shopBar.js');
const { modeOffBonds } = await import('../../public/js/ui/gameLogic.js');
const { data, getMode } = await import('../../public/js/data.js');

await data.loadAll('chess', 'bonds', 'assets', 'config');

function* walk(v) {
  if (Array.isArray(v)) { for (const x of v) yield* walk(x); return; }
  if (!v || typeof v !== 'object') return;
  yield v;
  if (typeof v.type === 'function' && !v.props?.children) return;
  yield* walk(v.props?.children);
}
const hasClass = (v, c) => typeof v?.props?.class === 'string' && v.props.class.split(/\s+/).includes(c);
const textOf = (v) => [...walk(v)].flatMap((n) => (Array.isArray(n.props?.children) ? n.props.children : [n.props?.children])).filter((x) => typeof x === 'string' || typeof x === 'number').join('');
const all = (v, c) => [...walk(v)].filter((n) => hasClass(n, c));

const CHESS = 'chess_char_1_17_a'; // 深靛: 奥术 / 精准
const PRIV = { funds: 9, hand: [], board: [], temp: [], alive: true, ready: false, shop: {}, loadout: {}, ops: {} };
const slot = { kind: 'chess', id: CHESS, price: 1, basePrice: 1 };
const card = (trackedBonds, offBonds = null) => ChessCard({ slot, idx: 0, priv: PRIV, onBuy() {}, onDetail() {}, offBonds, trackedBonds });

test('trackableBonds: every bond, in the official identifier order; hasTrackedBond matches any carried bond', () => {
  const list = trackableBonds(data.list('bonds'));
  assert.ok(list.length >= 20);
  assert.deepEqual(list.map((b) => b.bondId), [...list].sort((a, b) => (Number(a.identifier) || 0) - (Number(b.identifier) || 0)).map((b) => b.bondId));
  assert.ok(list.every((b) => typeof b.bondId === 'string'));
  assert.equal(hasTrackedBond(['arcaneShip', 'preciShip'], new Set(['preciShip'])), true);
  assert.equal(hasTrackedBond(['arcaneShip'], new Set(['yanShip'])), false);
  assert.equal(hasTrackedBond(null, new Set(['yanShip'])), false);
  assert.equal(hasTrackedBond(['arcaneShip'], null), false);
});

test('an operator card carrying a tracked bond: mint card, 追踪 ribbon and a marked bond chip', () => {
  const hit = card(new Set(['arcaneShip']));
  assert.ok(hasClass(hit, 'is-tracked'));
  assert.equal(all(hit, 'scard__trackring').length, 1, 'a drawn ring survives a merge card gold border');
  assert.equal(textOf(all(hit, 'scard__track')[0]), '追踪');
  assert.ok(hasClass(all(hit, 'scard__bond').find((v) => v.props?.title === undefined && textOf(v).includes('奥术')), 'is-tracked'));
  const miss = card(new Set(['yanShip']));
  assert.ok(!hasClass(miss, 'is-tracked'));
  assert.equal(all(miss, 'scard__track').length, 0);
  assert.ok(!hasClass(miss, 'is-tracked'));
  // no selection = the plain card (every existing test / call site passes no set)
  assert.ok(!hasClass(card(null), 'is-tracked'));
});

test('a tracked bond the mode disables still marks the card, while its chip keeps 本局禁用', () => {
  const off = modeOffBonds(getMode('mode_single_funny'));
  const hit = card(new Set(['arcaneShip']), off);
  assert.ok(hasClass(hit, 'is-tracked'));
  const arcane = all(hit, 'scard__bond').find((v) => hasClass(v, 'is-off'));
  assert.ok(arcane, 'the chip is still struck through');
  assert.ok(hasClass(arcane, 'is-tracked'), 'and carries the tracking colour');
});

test('reward operator cards use the same highlight (merge reward / 定向投放)', () => {
  const offer = { source: 'merge', slots: [{ kind: 'chess', id: CHESS, price: 0, sold: false }] };
  const tree = RewardCards({ offer, priv: PRIV, editable: true, onPick() {}, onDetail() {}, onLater() {}, armed: null,
    onTap() {}, trackedBonds: new Set(['arcaneShip']) });
  const cards = [...walk(tree)].filter((v) => v.type === ChessCard);
  assert.equal(cards.length, 1);
  assert.equal(cards[0].props.slot.id, CHESS);
  assert.equal(cards[0].props.trackedBonds.has('arcaneShip'), true);
  const plain = RewardCards({ offer, priv: PRIV, editable: true, onPick() {}, onDetail() {}, onLater() {}, armed: null,
    onTap() {}, trackedBonds: new Set(['yanShip']) });
  assert.equal([...walk(plain)].filter((v) => v.type === ChessCard)[0].props.trackedBonds.has('arcaneShip'), false);
});

test('wiring: the shop bar draws the prep button above 剩余可放置角色 and passes the set to both card paths', () => {
  const shop = read('public/js/ui/shopBar.js');
  assert.match(shop, /track \? html`<button[\s\S]*?shopbar__track[\s\S]*?t\('盟约追踪'\)[\s\S]*?<\/button>` : null}\s*\n\s*<span class="shopbar__remain"/);
  assert.match(shop, /<\$\{RewardCards\}[\s\S]*?trackedBonds=\$\{trackedBonds\}/);
  assert.match(shop, /<\$\{ChessCard\}[\s\S]*?trackedBonds=\$\{trackedBonds\}/);
  const game = read('public/js/screens/game.js');
  assert.match(game, /const \[trackedBonds, setTrackedBonds\] = useState\(\(\) => new Set\(\)\)/);
  assert.match(game, /const toggleTrackedBond = useCallback/);
  assert.match(game, /<\$\{ShopBar\}[\s\S]*?trackedBonds=\$\{trackedBonds\}/);
  assert.match(game, /track=\$\{phase === PHASE\.PREP && !spectator \? \{ count: trackedBonds\.size, onOpen: \(\) => setTrackOpen\(true\) \} : null\}/);
  assert.match(game, /<\$\{BondTrackPicker\} open=\$\{trackOpen\}/);
  const picker = read('public/js/ui/trackBonds.js');
  assert.match(picker, /aria-pressed=\$\{sel \? 'true' : 'false'\}/);
  assert.match(picker, /data-bond=\$\{b\.bondId\}/);
  assert.match(picker, /onToggle\(b\.bondId\)/);
});

test('all four language packs translate the new strings', () => {
  for (const lang of ['en', 'ja', 'ko', 'zh-TW']) {
    const pack = JSON.parse(read(`public/i18n/${lang}.json`));
    for (const key of ['盟约追踪', '追踪', '清空追踪', '盟约追踪（已追踪 {n} 个）']) assert.ok(pack[key], `${lang} ${key}`);
  }
});
