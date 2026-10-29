import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import gplay from 'google-play-scraper';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataPath = path.join(root, 'data', 'google-play-watchlist.json');
const payload = JSON.parse(await fs.readFile(dataPath, 'utf8'));
const markets = [...new Set((process.env.GP_RELEASE_MARKETS || 'us,ca,mx,br,gb,de,fr,tr,sa,ae,in,id,jp,kr,au,ph,th,vn,tw,sg,my')
  .split(',').map(value => value.trim().toLowerCase()).filter(Boolean))];
const lang = process.env.GP_LANG || 'en';
const concurrency = Math.max(1, Number(process.env.GP_RELEASE_CONCURRENCY || 8));
const marketConcurrency = Math.max(1, Number(process.env.GP_RELEASE_MARKET_CONCURRENCY || 1));
const batchSize = Math.max(1, Number(process.env.GP_RELEASE_BATCH_SIZE || 16));
// 全量地区扫描的失败请求不做库内重试：下轮会针对未检查市场重试，避免少数
// 限流响应把整轮扫描拖住数十分钟。
const requestOptions = {
  timeout: Number(process.env.GP_REQUEST_TIMEOUT_MS || 8000),
  retry: { limit: 0 }
};
const forceRecheck = process.env.GP_RELEASE_RECHECK === '1';
const requestedAppIds = new Set((process.env.GP_RELEASE_APP_IDS || '').split(',').map(value => value.trim()).filter(Boolean));

async function pool(items, worker, limit) {
  const output = new Array(items.length);
  let cursor = 0;
  async function run() {
    while (cursor < items.length) {
      const index = cursor++;
      output[index] = await worker(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
  return output;
}

function parseReleased(value) {
  const ts = Date.parse(value || '');
  return Number.isFinite(ts) ? ts : 0;
}

function applyEarliestRelease(app) {
  const orderedEvidence = [...(app.releaseDateEvidence || [])]
    .filter(item => item.market && item.released && Number(item.releasedTs))
    .sort((a, b) => a.releasedTs - b.releasedTs || markets.indexOf(a.market) - markets.indexOf(b.market));
  const earliest = orderedEvidence[0];
  const tiedMarkets = earliest
    ? orderedEvidence.filter(item => item.releasedTs === earliest.releasedTs).map(item => item.market)
    : [];
  app.releaseDateEvidence = orderedEvidence;
  app.released = earliest?.released || '';
  app.releasedTs = earliest?.releasedTs || 0;
  app.releaseMarket = earliest?.market || '';
  // 表格只显示一个对应地区；完整的同日最早地区保留在 earliestTiedMarkets 供审计。
  app.releaseMarkets = earliest ? [earliest.market] : [];
  app.earliestTiedMarkets = tiedMarkets;
}

const targets = payload.apps.filter(app =>
  (!requestedAppIds.size || requestedAppIds.has(app.appId)) &&
  (forceRecheck || !markets.every(market => (app.releaseDateCheckedMarkets || []).includes(market)))
);
console.log(`发布日期扫描：${targets.length}/${payload.apps.length} 款，${markets.length} 个市场，总请求并发 ${concurrency * marketConcurrency}`);
let completed = 0;

async function persist() {
  payload.meta.releaseDateMarkets = markets;
  payload.meta.releaseDateMethodology = '对每款产品分别读取多个主流 Google Play 市场的公开首次上线日期，取其中最早的可观测日期；releaseMarket 为该最早日期对应市场。未公开日期、地区不可见或请求失败不推断日期，并会在后续更新重试。';
  payload.meta.releaseDateRefreshedAt = new Date().toISOString();
  payload.meta.releaseDateObservedCount = payload.apps.filter(app => app.releaseDateStatus === 'observed').length;
  payload.meta.releaseDateUnavailableCount = payload.apps.filter(app => app.releaseDateStatus === 'unavailable').length;
  payload.meta.releaseDatePendingCount = payload.apps.length - payload.meta.releaseDateObservedCount - payload.meta.releaseDateUnavailableCount;
  const json = `${JSON.stringify(payload, null, 2)}\n`;
  await fs.writeFile(dataPath, json);
  await fs.writeFile(path.join(root, 'data', 'google-play-watchlist.js'), `window.GAME_WATCHLIST = ${json.trim()};\n`);
}

async function scanApp(app) {
  const checked = new Set(forceRecheck ? [] : (app.releaseDateCheckedMarkets || []));
  const unavailableMarkets = new Set(forceRecheck ? [] : (app.releaseDateUnavailableMarkets || []));
  const evidence = new Map((forceRecheck ? [] : (app.releaseDateEvidence || []))
    .filter(item => item.market && item.released && Number(item.releasedTs))
    .map(item => [item.market, item]));
  const missingMarkets = forceRecheck ? markets : markets.filter(market => !checked.has(market));

  await pool(missingMarkets, async market => {
    try {
      const detail = await gplay.app({ appId: app.appId, country: market, lang, requestOptions });
      const releasedTs = parseReleased(detail.released);
      if (releasedTs) evidence.set(market, { market, released: detail.released, releasedTs });
    } catch (error) {
      if (error?.status === 404 || /App not found \(404\)/.test(error?.message || '')) {
        // 404 是确定的地区不可见结论，属于已复核；只有网络或限流异常才留待重试。
        checked.add(market);
        unavailableMarkets.add(market);
      }
      return;
    }
    checked.add(market);
  }, marketConcurrency);

  app.releaseDateEvidence = [...evidence.values()];
  app.releaseDateCheckedMarkets = [...checked].sort();
  app.releaseDateUnavailableMarkets = [...unavailableMarkets].sort();
  app.releaseDateCheckedAt = new Date().toISOString();
  app.releaseDateStatus = evidence.size ? 'observed' : (markets.every(market => checked.has(market)) ? 'unavailable' : 'pending');
  applyEarliestRelease(app);
  completed += 1;
  if (completed % 25 === 0 || completed === targets.length) console.log(`发布日期进度：${completed}/${targets.length}`);
}

for (let start = 0; start < targets.length; start += batchSize) {
  const batch = targets.slice(start, start + batchSize);
  await pool(batch, scanApp, concurrency);
  await persist();
  console.log(`发布日期已落盘：${Math.min(start + batch.length, targets.length)}/${targets.length}`);
}
// 口径或展示规则调整时，即使没有网络目标，也会重新规范已有证据的最早值。
payload.apps.forEach(applyEarliestRelease);
await persist();
console.log(`完成：已观测最早上线日期 ${payload.meta.releaseDateObservedCount}/${payload.apps.length} 款`);
