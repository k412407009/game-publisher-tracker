import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const payload = JSON.parse(await fs.readFile(path.join(root, 'data', 'google-play-watchlist.json'), 'utf8'));
const localDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' });

function contributionSet(field, targetShare) {
  const ranked = payload.apps
    .filter(app => Number.isFinite(app[field]) && app[field] > 0)
    .sort((a, b) => b[field] - a[field]);
  const total = ranked.reduce((sum, app) => sum + app[field], 0);
  let cumulative = 0;
  const ids = new Set();
  for (const app of ranked) {
    if (total && cumulative / total >= targetShare) break;
    ids.add(app.appId);
    cumulative += app[field];
  }
  return { ids, count: ids.size, coveredShare: total ? cumulative / total : 0 };
}

const revenue50 = contributionSet('revenueCumulativeWorldwideUsd', 0.5);
const revenue70 = contributionSet('revenueCumulativeWorldwideUsd', 0.7);
const downloads50 = contributionSet('downloadsCumulativeWorldwide', 0.5);
const downloads70 = contributionSet('downloadsCumulativeWorldwide', 0.7);
const forcedIds = new Set(['com.loadcomplete.minitales', 'com.percent.aos.randomdice2']);

const candidates = payload.apps.filter(app => {
  const aboveThreshold = Number(app.minInstalls || 0) >= 10000;
  const top70 = revenue70.ids.has(app.appId) || downloads70.ids.has(app.appId);
  return forcedIds.has(app.appId) || (aboveThreshold && top70);
}).map(app => {
  const top50 = revenue50.ids.has(app.appId) || downloads50.ids.has(app.appId);
  const forced = forcedIds.has(app.appId);
  return {
    appId: app.appId,
    title: app.title,
    developer: app.developer,
    account: app.account,
    companyZh: app.companyZh,
    url: app.url,
    minInstalls: app.minInstalls,
    revenueCumulativeWorldwideUsd: app.revenueCumulativeWorldwideUsd,
    downloadsCumulativeWorldwide: app.downloadsCumulativeWorldwide,
    currentFirstPublicDate: app.firstPublicTs ? localDate.format(new Date(app.firstPublicTs)) : null,
    currentFirstPublicKind: app.firstPublicKind,
    priority: forced ? 'named-example' : (top50 ? 'top-50-core' : 'top-70'),
    selectionReasons: [
      forced && '用户点名复核',
      Number(app.minInstalls || 0) >= 10000 && 'Google Play 下载量下限≥1万',
      revenue50.ids.has(app.appId) && '累计营收贡献前50%',
      revenue70.ids.has(app.appId) && !revenue50.ids.has(app.appId) && '累计营收贡献50%～70%',
      downloads50.ids.has(app.appId) && '累计下载贡献前50%',
      downloads70.ids.has(app.appId) && !downloads50.ids.has(app.appId) && '累计下载贡献50%～70%'
    ].filter(Boolean)
  };
}).sort((a, b) => {
  const rank = { 'named-example': 0, 'top-50-core': 1, 'top-70': 2 };
  return rank[a.priority] - rank[b.priority]
    || Number(b.revenueCumulativeWorldwideUsd || 0) - Number(a.revenueCumulativeWorldwideUsd || 0)
    || Number(b.downloadsCumulativeWorldwide || 0) - Number(a.downloadsCumulativeWorldwide || 0);
});

const output = {
  meta: {
    generatedAt: new Date().toISOString(),
    totalProducts: payload.apps.length,
    policy: '用户点名产品，或 Google Play 下载量下限≥1万且位于累计营收/累计下载贡献前70%的产品。前50%标为核心优先级。',
    thresholdOnlyWouldSelect: payload.apps.filter(app => Number(app.minInstalls || 0) >= 10000).length,
    selected: candidates.length,
    top50Core: candidates.filter(item => item.priority === 'top-50-core').length,
    top70Secondary: candidates.filter(item => item.priority === 'top-70').length,
    namedExamples: candidates.filter(item => item.priority === 'named-example').length,
    coverage: {
      revenue50: revenue50.coveredShare,
      revenue70: revenue70.coveredShare,
      downloads50: downloads50.coveredShare,
      downloads70: downloads70.coveredShare
    }
  },
  candidates
};

await fs.writeFile(path.join(root, 'data', 'exposure-review-candidates.json'), `${JSON.stringify(output, null, 2)}\n`);
console.log(`已选出 ${candidates.length} 款：点名 ${output.meta.namedExamples}，前50%核心 ${output.meta.top50Core}，前70%第二层 ${output.meta.top70Secondary}`);
