// 设置 → 素材下载 (fork, 2026-10-16). 在线下载 (ui/assetPackDownloadButton.js) streams the whole pack into the browser
// and imports it; 导入本地包 (ui/assetImport.js, assetPack.js) reads a folder / zip picked by hand. Both land in the
// browser's Cache Storage, so anything that still reads the old queue (assetDownload.js) skips them. Once a run
// completed, both buttons stay off (marker in the cache, assetCache.js importedInFull) until the player clears it.
import { useEffect, useState } from '../../vendor/hooks.module.js';
import { html, MicroLabel } from './components.js';
import { AssetImportButton } from './assetImport.js';
import { AssetPackDownloadButton } from './assetPackDownloadButton.js';
import { assetImport } from '../assetPack.js';
import { importedInFull } from '../assetCache.js';
import { t } from '../../../shared/i18n.js';

/** The settings section. */
export function AssetSection() {
  const [done, setDone] = useState(false);
  useEffect(() => {
    let stop = false;
    // An earlier session's marker, plus any run that finishes while this panel is open (the state alone could be a
    // leftover "complete" from before 清除已导入的素材, so only a publish counts here).
    importedInFull().then((full) => { if (!stop && full) setDone(true); }).catch(() => {});
    const off = assetImport.subscribe((state) => {
      if (state.phase === 'complete' && state.accepted > 0) setDone(true);
    });
    return () => { stop = true; off(); };
  }, []);
  return html`<section class="set-assets" aria-labelledby="set-assets-title" data-testid="asset-section">
    <div class="set-keys__head">
      <span class="set-row__label" id="set-assets-title">${t('素材下载')}<${MicroLabel}>ASSETS<//></span>
    </div>
    <div class="set-assets__local" data-testid="asset-local">
      <${AssetPackDownloadButton} imported=${done} />
      <${AssetImportButton} imported=${done} onClear=${() => setDone(false)} />
    </div>
  </section>`;
}
