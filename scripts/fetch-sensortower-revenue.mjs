import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const dataPath = path.join(root, 'data', 'google-play-watchlist.json');
const outputPath = path.join(root, 'data', 'sensortower-revenue.json');
const concurrency = Math.max(1, Number(process.env.ST_CONCURRENCY || 8));
const country = String(process.env.ST_COUNTRY || 'US').toUpperCase();
const payload = JSON.parse(await fs.readFile(dataPath, 'utf8'));

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

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

async function fetchApp(app, attempt = 1) {
  const url = `https://app.sensortower.com/api/android/apps/${encodeURIComponent(app.appId)}?country=${country}`;
  try {
    const response = await fetch(url, {
      headers: {
        accept: 'application/json',
        'user-agent': 'Mozilla/5.0 (compatible; CreativeWatchlist/1.0; research dashboard)'
      },
      signal: AbortSignal.timeout(30000)
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    const revenue = data.worldwide_last_month_revenue;
    const downloads = data.worldwide_last_month_downloads;
    return {
      appId: app.appId,
      title: app.title,
      sourceUrl: `https://app.sensortower.com/overview/${encodeURIComponent(app.appId)}?country=${country}`,
      revenueWorldwideLastMonthUsd: revenue?.currency === 'USD' && revenue?.unit === 'cent'
        ? Number(revenue.value || 0) / 100
        : null,
      downloadsWorldwideLastMonth: Number.isFinite(Number(downloads?.value))
        ? Number(downloads.value)
        : null,
      currency: revenue?.currency || 'USD',
      status: 'ok'
    };
  } catch (error) {
    if (attempt < 3) {
      await sleep(500 * attempt);
      return fetchApp(app, attempt + 1);
    }
    return {
      appId: app.appId,
      title: app.title,
      sourceUrl: `https://app.sensortower.com/overview/${encodeURIComponent(app.appId)}?country=${country}`,
      revenueWorldwideLastMonthUsd: null,
      downloadsWorldwideLastMonth: null,
      currency: 'USD',
      status: 'error',
      error: error.message
    };
  }
}

console.log(`准备读取 ${payload.apps.length} 款产品的 Sensor Tower 上月估算，并发 ${concurrency}`);
let finished = 0;
const estimates = await pool(payload.apps, async app => {
  const result = await fetchApp(app);
  finished += 1;
  if (finished % 25 === 0 || finished === payload.apps.length) {
    console.log(`Sensor Tower 进度：${finished}/${payload.apps.length}`);
  }
  return result;
}, concurrency);

const byId = new Map(estimates.map(item => [item.appId, item]));
payload.apps = payload.apps.map(app => {
  const estimate = byId.get(app.appId);
  return {
    ...app,
    revenueWorldwideLastMonthUsd: estimate?.revenueWorldwideLastMonthUsd ?? null,
    downloadsWorldwideLastMonth: estimate?.downloadsWorldwideLastMonth ?? null,
    sensorTowerUrl: estimate?.sourceUrl || '',
    sensorTowerStatus: estimate?.status || 'missing'
  };
});

const fetchedAt = new Date().toISOString();
const successCount = estimates.filter(item => item.status === 'ok').length;
const revenueCount = estimates.filter(item => item.status === 'ok' && item.revenueWorldwideLastMonthUsd !== null).length;
payload.meta.sensorTower = {
  fetchedAt,
  source: 'Sensor Tower public App Overview',
  metric: 'Worldwide · Last Month',
  currency: 'USD',
  countryContext: country,
  successCount,
  revenueCount,
  methodology: '按 Google Play 包名读取 Sensor Tower App Overview 的全球上月下载量与营收估算。营收仅覆盖应用商店内购与付费下载估算，不代表广告变现或厂商财务流水。'
};

const revenuePayload = {
  meta: payload.meta.sensorTower,
  apps: estimates.sort((a, b) => (b.revenueWorldwideLastMonthUsd ?? -1) - (a.revenueWorldwideLastMonthUsd ?? -1))
};
const json = `${JSON.stringify(payload, null, 2)}\n`;
await fs.writeFile(dataPath, json);
await fs.writeFile(path.join(root, 'data', 'google-play-watchlist.js'), `window.GAME_WATCHLIST = ${json.trim()};\n`);
await fs.writeFile(outputPath, `${JSON.stringify(revenuePayload, null, 2)}\n`);

console.log(`完成：${successCount}/${estimates.length} 款读取成功，${revenueCount} 款获得营收字段`);
