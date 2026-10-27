// 设置 → 素材下载 → 在线下载: streams the host's public asset-pack zip into OPFS and imports it.
// The bytes come from the external signed CDN; this server only resolves the URL (GET /asset-pack.zip).
import { useEffect, useState } from '../../vendor/hooks.module.js';
import { html, Button, ProgressBar } from './components.js';
import { assetImport } from '../assetPack.js';
import { assetPackDownload, readAssetPackConfig } from '../assetPackDownload.js';
import { t } from '../../../shared/i18n.js';

function errorText(code) {
  if (code === 'opfs') return t('浏览器不支持 OPFS，无法流式下载素材包。');
  if (code === 'quota') return t('浏览器存储空间不足，无法下载素材包。');
  if (code === 'config') return t('无法读取素材包下载地址。');
  if (code === 'http') return t('素材包下载失败，请稍后重试。');
  if (code === 'size') return t('素材包大小不符，请重试。');
  if (code === 'stream') return t('素材包下载中断，请重试。');
  return t('素材包下载失败，请重试。');
}

const mb = (bytes) => (Number(bytes) / 1048576).toFixed(1);

export function AssetPackDownloadButton({ imported: importedAll = false }) {
  const [config, setConfig] = useState(null);
  const [pack, setPack] = useState(() => assetPackDownload.get());
  const [imported, setImported] = useState(() => assetImport.get());
  useEffect(() => {
    const off = assetPackDownload.subscribe(setPack);
    setPack(assetPackDownload.get());
    // Closing settings must not abort a running download; the singleton keeps its state for the next mount.
    return () => { off(); };
  }, []);
  useEffect(() => {
    const off = assetImport.subscribe(setImported);
    setImported(assetImport.get());
    return () => { off(); };
  }, []);
  useEffect(() => {
    let stop = false;
    readAssetPackConfig().then((value) => { if (!stop) setConfig(value); }).catch(() => {});
    return () => { stop = true; };
  }, []);
  if (!config) return null;

  const packBusy = ['checking', 'downloading', 'importing'].includes(pack.phase);
  const importBusy = ['reading', 'importing'].includes(imported.phase);
  // A finished import (this session or an earlier one) keeps the button off; hover explains why. The section owns the
  // flag, so 清除已导入的素材 turns it back on without this component remembering "done".
  const done = importedAll;
  const blocked = done || packBusy || importBusy;
  const start = () => {
    if (blocked) return;
    void assetPackDownload.start(config, {
      importPack: (file) => assetImport.start({ type: 'zip', data: file }),
    }).catch(() => {});
  };

  return html`<div class="title-assets__item">
    <div class="title-assets__done" title=${done ? t('已成功导入，无需再次导入') : undefined}>
      <${Button} variant="secondary" block=${true} size="sm" data-testid="asset-pack-download"
        disabled=${blocked} onClick=${start}>${t('在线下载')}<//>
    </div>
    <small>${t('下载完整素材包到浏览器缓存，不占服务器流量。')}</small>
    ${pack.phase === 'checking' ? html`<p role="status" data-testid="asset-pack-status">${t('正在检查浏览器存储…')}</p>` : null}
    ${pack.phase === 'downloading' ? html`
      <p role="status" data-testid="asset-pack-status">${t('正在下载素材包…')}</p>
      <${ProgressBar} value=${pack.bytes} max=${pack.total || 1} label=${t('已下载 {done} / {total} MB', { done: mb(pack.bytes), total: pack.total ? mb(pack.total) : '?' })} />
      <${Button} size="sm" data-testid="asset-pack-download-cancel" onClick=${() => assetPackDownload.cancel()}>${t('取消下载')}<//>
    ` : null}
    ${pack.phase === 'importing' ? html`
      <p role="status" data-testid="asset-pack-status">${t('素材包下载完成，正在导入…')}</p>
      <${ProgressBar} value=${imported.done} max=${imported.total || 1}
        label=${t('已完成 {done} / {total} 个文件', { done: imported.done, total: imported.total })} />
    ` : null}
    ${pack.phase === 'done' ? html`<p role="status" data-testid="asset-pack-status">${t('素材包下载并导入完成')}</p>` : null}
    ${pack.phase === 'cancelled' ? html`<p role="status" data-testid="asset-pack-status">${t('素材包下载已取消')}</p>` : null}
    ${pack.phase === 'error' ? html`<p role="status" data-testid="asset-pack-status" class="asset-import__reason">${errorText(pack.error)}</p>` : null}
  </div>`;
}
