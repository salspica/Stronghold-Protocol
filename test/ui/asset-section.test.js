// 设置 → 素材下载 (fork, 2026-10-16): 在线下载 streams the whole pack, then 导入本地包 picks a folder / zip by hand.
// The per-file download queue (assetDownload.js) is kept, with its own tests here, but has no button.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createAssetDownload, selectAssetTier } from '../../public/js/assetDownload.js';

const source = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const json = (value) => new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json' } });
const URLS = ['/assets/char/a.png', '/assets/skins/x/b.png', '/assets/spine/c.skel', '/media/voice/cn/a/1', '/media/voice/jp/a/1',
  '/media/voice/en/a/1', '/media/voice/kr/a/1', '/media/voice/native/a/1', '/media/sfx/player/hit', '/media/bgm/m_x_loop'];

test('对局素材 leaves out skins and the dubs the player does not hear; 全部素材 is the upstream list', () => {
  assert.equal(selectAssetTier(URLS, { tier: 'all' }), URLS);
  assert.equal(selectAssetTier(URLS), URLS);
  assert.deepEqual(selectAssetTier(URLS, { tier: 'match', voice: 'cn' }),
    ['/assets/char/a.png', '/assets/spine/c.skel', '/media/voice/cn/a/1', '/media/sfx/player/hit', '/media/bgm/m_x_loop']);
  assert.deepEqual(selectAssetTier(URLS, { tier: 'match', voice: 'jp', native: true }).filter((u) => u.includes('/voice/')),
    ['/media/voice/cn/a/1', '/media/voice/jp/a/1', '/media/voice/native/a/1']);
  assert.deepEqual(selectAssetTier(['/assets/~0123456789abcdef/skins/x/b.png', '/media/~0123456789abcdef/voice/kr/a/1',
    '/assets/~0123456789abcdef/char/a.png'], { tier: 'match', voice: 'cn' }), ['/assets/~0123456789abcdef/char/a.png']);
});

test('a tier is chosen at start; files done in one tier count in the other and are not fetched again', async () => {
  const fetched = [];
  const manifest = Object.fromEntries(URLS.filter((u) => u.startsWith('/assets/')).map((u) => [u, u]));
  manifest.audio = { cn: '/assets/audio/voice/cn/a/1.mp3', jp: '/assets/audio/voice/jp/a/1.mp3' };
  const queue = createAssetDownload({ concurrency: 1, lookupImported: async () => new Set(), fetch: async (url) => {
    if (url === '/data/assets.json') return json(manifest);
    if (url.startsWith('/data/')) return new Response('', { status: 404 });
    fetched.push(url);
    return new Response('asset', { headers: { 'content-type': 'application/octet-stream' } });
  } });
  await queue.start({ tier: 'match', voice: 'cn' });
  assert.deepEqual([queue.get().phase, queue.get().total, queue.get().done], ['complete', 3, 3]);
  assert.ok(!fetched.some((u) => u.includes('/skins/') || u.includes('/voice/jp/')));
  fetched.length = 0;
  // a completed check starts over (upstream: it revalidates), so a new choice after completion lists again
  await queue.start({ tier: 'all' });
  assert.deepEqual([queue.get().phase, queue.get().total, queue.get().done], ['complete', 5, 5]);
});

test('settings mount 素材下载 with 在线下载 above the local asset pack option; no slow-load hint', () => {
  const settings = source('../../public/js/ui/settings.js'), main = source('../../public/js/main.js'), section = source('../../public/js/ui/assetSection.js');
  assert.match(settings, /<\$\{AssetSection\} \/>/);
  assert.match(main, /registerImportedAssetWorker/);
  assert.doesNotMatch(main, /installAssetHints/);
  assert.match(section, /AssetImportButton/, 'a local folder / zip can be read instead of downloading');
  assert.match(section, /AssetPackDownloadButton/, 'the pack can be downloaded online instead of picked by hand');
  assert.ok(section.lastIndexOf('AssetPackDownloadButton') < section.lastIndexOf('AssetImportButton'), '在线下载 sits above 导入本地包');
  assert.match(section, /set-assets__local/);
  assert.doesNotMatch(section, /asset-start|asset-pause/);
  // a finished import turns both buttons off, and hover says why (assetCache.js marker; assetPack.js writes it)
  assert.match(section, /importedInFull/);
  assert.match(section, /imported=\$\{done\}/);
  assert.match(source('../../public/js/ui/assetPackDownloadButton.js'), /已成功导入，无需再次导入/);
  assert.match(source('../../public/js/ui/assetImport.js'), /已成功导入，无需再次导入/);
  assert.match(source('../../public/js/ui/assetImport.js'), /disabled=\$\{importedAll\}/);
  assert.equal((source('../../public/js/ui/assetImport.js').match(/assetImport\.cancel\(\)/g) || []).length, 2,
    'one cancel in the dialog close, one on 取消导入; none on unmount');
  // the import that follows an online download reports itself on the button, because that dialog is never opened
  assert.match(source('../../public/js/ui/assetPackDownloadButton.js'),
    /value=\$\{imported\.done\} max=\$\{imported\.total \|\| 1\}/, '在线下载 shows the import progress, not only a line of text');
  assert.match(source('../../public/css/screens/game.css'), /\.set-assets \{[^}]*border-top/);
  assert.match(source('../../public/css/screens/game.css'), /\.set-assets__local \{[^}]*border-top/);
});
