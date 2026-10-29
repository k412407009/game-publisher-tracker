import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import gplay from 'google-play-scraper';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const accounts = JSON.parse(await fs.readFile(path.join(root, 'accounts.json'), 'utf8'));
const unresolved = JSON.parse(await fs.readFile(path.join(root, 'unresolved.json'), 'utf8'));
const dataPath = path.join(root, 'data', 'google-play-watchlist.json');
let previousPayload = null;
try {
  previousPayload = JSON.parse(await fs.readFile(dataPath, 'utf8'));
} catch {
  // 首次运行没有旧数据时，从空底稿开始。
}
const country = process.env.GP_COUNTRY || 'us';
const lang = process.env.GP_LANG || 'en';
const concurrency = Math.max(1, Number(process.env.GP_CONCURRENCY || 5));
// 发现范围不以单一美国区为限。这里覆盖各主要 Google Play 市场；可通过环境变量
// 按逗号覆盖，方便对特定区域做复查。详情字段仍优先读取 GP_COUNTRY（默认 US），
// 避免把不同商店的下载量区间混在同一列里。
const discoveryCountries = [...new Set((process.env.GP_DISCOVERY_COUNTRIES || 'us,ca,mx,br,gb,de,fr,tr,sa,ae,in,id,jp,kr,au')
  .split(',').map(value => value.trim().toLowerCase()).filter(Boolean))];
const discoveryConcurrency = Math.max(1, Number(process.env.GP_DISCOVERY_CONCURRENCY || 4));
const requestOptions = { timeout: Number(process.env.GP_REQUEST_TIMEOUT_MS || 15000), retry: { limit: 1 } };
let tdSeries = null;
try {
  tdSeries = JSON.parse(await fs.readFile(path.join(root, 'data', 'td-series.json'), 'utf8'));
} catch {
  // 塔防专项是可选增强；常规更新不依赖它存在。
}
const tdAppIds = new Set((tdSeries?.items || []).map(item => item.googlePlayId).filter(Boolean));

function developerUrl(account) {
  return `https://play.google.com/store/apps/${account.urlType}?id=${encodeURIComponent(account.devId)}`;
}

function appUrl(appId) {
  return `https://play.google.com/store/apps/details?id=${appId}`;
}

function parseInstalls(value) {
  return Number(String(value || '0').replace(/[^0-9]/g, '')) || 0;
}

function normalizeName(value) {
  return String(value || '').normalize('NFKC').toLowerCase().replace(/[^a-z0-9%]+/g, '');
}

function errorMessage(error) {
  return error?.message || (error ? String(error) : 'Google Play 请求未返回可用错误信息');
}

function classify(app) {
  const text = `${app.title || ''} ${app.summary || ''} ${app.genre || ''}`.toLowerCase();
  const rules = [
    ['塔防', /tower|defen[cs]e|\btd\b|guard|legion|turret|fortress|stronghold/],
    ['中轻度RPG', /\brpg\b|hero|adventure|surviv|rogue|dungeon|fantasy|quest|warrior|hunter|idle/],
    ['格斗／战斗', /fight|fighter|battle|brawl|boxing|punch|kick|clash|combat|arena/],
    ['卡牌／融合', /card|deck|dice|merge|fusion|combine|backpack|\bbag\b|synth/],
    ['模拟经营', /tycoon|factory|hotel|restaurant|market|shop|manager|business|farm|city/],
    ['休闲／益智', /puzzle|sort|match|tile|color|block|jam|io\b|casual/]
  ];
  const tags = rules.filter(([, rx]) => rx.test(text)).map(([label]) => label);
  if (tdAppIds.has(app.appId) && !tags.includes('塔防')) tags.unshift('塔防');
  return tags.length ? tags : ['其他'];
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

const accountResults = [];
const appSeeds = [];

for (const account of accounts) {
  process.stdout.write(`账号：${account.account} ... `);
  try {
    const marketResults = await pool(discoveryCountries, async market => {
      const developerResult = await Promise.allSettled([
        gplay.developer({ devId: account.devId, country: market, lang, num: 250, requestOptions })
      ]);
      return { market, developerResult: developerResult[0] };
    }, discoveryConcurrency);
    // 同名搜索仅作补充。Google Play 搜索页并不保证收录一个开发者的全量产品，
    // 因而不能作为唯一发现来源。
    const searchResult = await Promise.allSettled([
      gplay.search({ term: account.account, country, lang, num: 250, requestOptions })
    ]);
    const targetName = normalizeName(account.account);
    const discovered = marketResults.flatMap(({ market, developerResult }) =>
      developerResult.status === 'fulfilled'
        ? developerResult.value.map(seed => ({ seed, market, source: 'developer' }))
        : []
    );
    const searched = searchResult[0].status === 'fulfilled'
      ? searchResult[0].value.filter(item => normalizeName(item.developer) === targetName)
      : [];
    discovered.push(...searched.map(seed => ({ seed, market: country, source: 'search' })));
    discovered.push(...(account.knownAppIds || []).map(appId => ({
      seed: { appId, title: appId }, market: null, source: 'knownAppIds'
    })));
    // 开发者索引会漏列已上架产品：对已跟踪包名持续直连复核。
    discovered.push(...(previousPayload?.apps || []).filter(app => app.account === account.account)
      .map(seed => ({ seed, market: seed.detailMarket || country, source: 'previousListing' })));
    const unique = new Map();
    for (const item of discovered) {
      if (!item.seed.appId) continue;
      const current = unique.get(item.seed.appId) || { ...item, markets: new Set(), sources: new Set() };
      if (item.market) current.markets.add(item.market);
      current.sources.add(item.source);
      unique.set(item.seed.appId, current);
    }
    const anyDeveloperSuccess = marketResults.some(item => item.developerResult.status === 'fulfilled');
    if (!unique.size && !anyDeveloperSuccess && searchResult[0].status === 'rejected') throw searchResult[0].reason;
    accountResults.push({
      ...account,
      developerUrl: developerUrl(account),
      appCount: unique.size,
      crawlStatus: anyDeveloperSuccess ? 'ok' : 'partial',
      ...(anyDeveloperSuccess ? {} : { crawlError: '多个发现市场均未返回可用开发者列表' })
    });
    unique.forEach(item => appSeeds.push({ account, ...item }));
    console.log(`${unique.size} 款（${discoveryCountries.length} 区联合发现）`);
  } catch (error) {
    const previousApps = (previousPayload?.apps || []).filter(app => app.account === account.account);
    accountResults.push({
      ...account,
      developerUrl: developerUrl(account),
      appCount: previousApps.length,
      crawlStatus: previousApps.length ? 'stale' : 'error',
      crawlError: errorMessage(error)
    });
    previousApps.forEach(seed => appSeeds.push({ account, seed }));
    console.log(`失败：${error.message}${previousApps.length ? `；沿用并复查旧清单 ${previousApps.length} 款` : ''}`);
  }
}

const discoveryRank = item => item.sources?.has('developer') ? 2 : item.sources?.has('search') ? 1 : 0;
const uniqueSeeds = [...new Map(appSeeds.sort((a, b) => discoveryRank(a) - discoveryRank(b)).map(item => [item.seed.appId, item])).values()];
console.log(`准备抓取 ${uniqueSeeds.length} 款产品详情，并发 ${concurrency}`);
let finished = 0;
let apps = (await pool(uniqueSeeds, async ({ account, seed, markets = new Set(), sources = new Set() }) => {
  try {
    let detail;
    let detailCountry = country;
    let lastError;
    // 对跨区发现的产品，US 详情不可读时依次回退到实际发现它的地区。
    for (const market of [...new Set([country, ...markets])]) {
      try {
        detail = await gplay.app({ appId: seed.appId, country: market, lang, requestOptions });
        detailCountry = market;
        break;
      } catch (error) {
        lastError = error;
      }
    }
    if (!detail) throw lastError || new Error('未能读取应用详情');
    finished += 1;
    if (finished % 25 === 0 || finished === uniqueSeeds.length) console.log(`详情进度：${finished}/${uniqueSeeds.length}`);
    return {
      company: account.company,
      companyZh: account.companyZh,
      country: account.country,
      account: account.account,
      relationship: account.relationship,
      relationshipLabel: account.relationshipLabel,
      priority: account.priority,
      title: detail.title,
      appId: detail.appId,
      url: appUrl(detail.appId),
      icon: detail.icon,
      summary: detail.summary || '',
      description: detail.description ? detail.description.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').slice(0, 400) : '',
      genre: detail.genre || '',
      genreId: detail.genreId || '',
      // 该字段会在 refresh-release-dates.mjs 中按多个市场复核，并取最早值。
      released: detail.released || '',
      releasedTs: detail.released ? Date.parse(detail.released) || 0 : 0,
      updatedTs: Number(detail.updated || 0),
      installs: detail.installs || seed.installs || '',
      minInstalls: parseInstalls(detail.installs || seed.installs),
      realInstalls: Number(detail.realInstalls || 0),
      ratings: Number(detail.ratings || 0),
      reviews: Number(detail.reviews || 0),
      score: Number(detail.score || 0),
      price: Number(detail.price || 0),
      // google-play-scraper 对部分免费 + 内购产品会返回 free:false、price:0；
      // 以实际价格是否大于零作为可复核口径，避免误标为付费产品。
      free: !(Number(detail.price) > 0),
      developerWebsite: detail.developerWebsite || '',
      developerEmail: detail.developerEmail || '',
      observedDeveloper: detail.developer || '',
      lastVerifiedAt: new Date().toISOString(),
      discoveryMarkets: [...markets].sort(),
      discoverySources: [...sources].sort(),
      detailMarket: detailCountry,
      tags: classify(detail),
      status: 'ok'
    };
  } catch (error) {
    finished += 1;
    const previous = previousPayload?.apps?.find(app => app.appId === seed.appId);
    if (previous) return {
      ...previous,
      status: 'stale',
      checkedAt: new Date().toISOString(),
      error: errorMessage(error)
    };
    return {
      company: account.company,
      companyZh: account.companyZh,
      country: account.country,
      account: account.account,
      relationship: account.relationship,
      relationshipLabel: account.relationshipLabel,
      priority: account.priority,
      title: seed.title,
      appId: seed.appId,
      url: appUrl(seed.appId),
      icon: seed.icon,
      summary: seed.summary || '',
      genre: seed.genre || '',
      released: '',
      releasedTs: 0,
      updatedTs: 0,
      installs: seed.installs || '',
      minInstalls: parseInstalls(seed.installs),
      ratings: Number(seed.ratings || 0),
      reviews: 0,
      score: Number(seed.score || 0),
      discoveryMarkets: [...markets].sort(),
      discoverySources: [...sources].sort(),
      detailMarket: '',
      tags: classify(seed),
      status: 'partial',
      error: error.message
    };
  }
}, concurrency)).filter(Boolean);

// Google Play 刷新不应抹掉已导入的 Sensor Tower 字段。
const previousById = new Map((previousPayload?.apps || []).map(app => [app.appId, app]));
apps = apps.map(app => {
  const previous = previousById.get(app.appId) || {};
  const enrichment = Object.fromEntries(Object.entries(previous).filter(([key]) =>
    /^(revenue|downloads|sensorTower|releaseDate|releaseMarket|exposure|earliestExposure|firstPublic|bilibili|td)/.test(key) ||
    ['released', 'releasedTs'].includes(key)
  ));
  return { ...app, ...enrichment };
});

const verifiedCount = apps.filter(app => app.status === 'ok').length;
if (previousPayload?.apps?.length && verifiedCount < previousPayload.apps.length * 0.5) {
  throw new Error(`仅成功复核 ${verifiedCount} 款，低于旧库一半；本次不覆盖旧数据，请检查网络后重试。`);
}
for (const account of accountResults) {
  account.appCount = apps.filter(app => app.account === account.account).length;
}

apps.sort((a, b) => b.releasedTs - a.releasedTs || b.ratings - a.ratings);
const now = new Date();
const baseCaveat = `Google Play 不公开精确下载量；评分数与文字评论数是两个不同字段。产品发现覆盖 ${discoveryCountries.map(value => value.toUpperCase()).join('、')} 等 ${discoveryCountries.length} 个主要市场并取并集；这不是对全部国家／地区 100% 可见性的保证。详情指标优先以 ${country.toUpperCase()} 为统一基线，若该区不可读则回退到实际发现地区。已知包名会直连复查，以补 Google Play 开发者页或搜索索引漏列。`;
const sensorTowerCaveat = previousPayload?.meta?.sensorTowerCumulative?.methodology || previousPayload?.meta?.sensorTower?.methodology || '';
const payload = {
  meta: {
    ...(previousPayload?.meta || {}),
    generatedAt: now.toISOString(),
    verifiedCount,
    staleCount: apps.filter(app => app.status !== 'ok').length,
    country,
    lang,
    discoveryCountries,
    source: 'Google Play public listings',
    methodology: '在多个主要市场枚举开发者账号页，合并同名开发者精确搜索和已知包名直连复查，再逐个读取公开商店详情；下载量为详情基线市场中 Google Play 显示的区间下限。首次上线日期由独立多市场扫描取最早可观测值。',
    caveat: [baseCaveat, sensorTowerCaveat].filter(Boolean).join(' ')
  },
  accounts: accountResults,
  unresolved,
  apps
};

if (payload.meta.sensorTowerCumulative) {
  const matchedRevenue = apps.filter(app => Number.isFinite(app.revenueCumulativeWorldwideUsd));
  payload.meta.sensorTowerCumulative = {
    ...payload.meta.sensorTowerCumulative,
    matchedCount: matchedRevenue.length,
    unavailableCount: apps.length - matchedRevenue.length,
    totalRevenueUsd: Number(matchedRevenue.reduce((sum, app) => sum + app.revenueCumulativeWorldwideUsd, 0).toFixed(2)),
    carriedForwardAt: now.toISOString(),
    coverageNote: 'Google Play 刷新后按当前在架产品重算覆盖数；新增产品需通过新的 Sensor Tower 导出补数。'
  };
}

const json = `${JSON.stringify(payload, null, 2)}\n`;
await fs.writeFile(dataPath, json);
await fs.writeFile(path.join(root, 'data', 'google-play-watchlist.js'), `window.GAME_WATCHLIST = ${json.trim()};\n`);
if (payload.meta.sensorTowerCumulative) {
  const revenueApps = apps.map(app => ({
    appId: app.appId,
    title: app.title,
    account: app.account,
    revenueCumulativeWorldwideUsd: app.revenueCumulativeWorldwideUsd ?? null,
    downloadsCumulativeWorldwide: app.downloadsCumulativeWorldwide ?? null,
    sensorTowerCumulativeStart: app.sensorTowerCumulativeStart ?? null,
    sensorTowerCumulativeEnd: app.sensorTowerCumulativeEnd ?? null,
    sensorTowerCumulativeStatus: app.sensorTowerCumulativeStatus ?? 'unavailable'
  })).sort((a, b) => (b.revenueCumulativeWorldwideUsd ?? -1) - (a.revenueCumulativeWorldwideUsd ?? -1));
  await fs.writeFile(path.join(root, 'data', 'sensortower-revenue.json'), `${JSON.stringify({ meta: payload.meta.sensorTowerCumulative, apps: revenueApps }, null, 2)}\n`);
}

const previousIds = new Set((previousPayload?.apps || []).map(app => app.appId));
const currentIds = new Set(apps.map(app => app.appId));
const added = apps.filter(app => !previousIds.has(app.appId));
const removed = (previousPayload?.apps || []).filter(app => !currentIds.has(app.appId));
const failedAccounts = accountResults.filter(account => account.crawlStatus !== 'ok');
const report = {
  generatedAt: now.toISOString(),
  market: country.toUpperCase(),
  language: lang,
  accounts: accountResults.length,
  products: apps.length,
  added: added.map(app => ({ appId: app.appId, title: app.title, account: app.account })),
  removed: removed.map(app => ({ appId: app.appId, title: app.title, account: app.account })),
  failedAccounts: failedAccounts.map(account => ({ account: account.account, error: account.crawlError || '部分市场发现请求失败' }))
};
await fs.mkdir(path.join(root, 'reports'), { recursive: true });
await fs.writeFile(path.join(root, 'reports', 'last-update.json'), `${JSON.stringify(report, null, 2)}\n`);
await fs.writeFile(path.join(root, 'reports', 'last-update.md'), `# 最近一次更新\n\n- 时间：${report.generatedAt}\n- 发现市场：Google Play ${discoveryCountries.map(value => value.toUpperCase()).join('、')}（详情基线：${country.toUpperCase()} / ${lang}）\n- 账号：${report.accounts}\n- 在架产品：${report.products}\n- 新增：${report.added.length}\n- 当前发现范围不再可见／移除：${report.removed.length}\n- 抓取失败账号：${report.failedAccounts.length}\n\n## 新增产品\n\n${report.added.length ? report.added.map(app => `- ${app.title}（${app.account}，${app.appId}）`).join('\n') : '- 无'}\n\n## 当前发现范围不再可见／移除\n\n${report.removed.length ? report.removed.map(app => `- ${app.title}（${app.account}，${app.appId}）`).join('\n') : '- 无'}\n\n## 抓取失败\n\n${report.failedAccounts.length ? report.failedAccounts.map(account => `- ${account.account}：${account.error}`).join('\n') : '- 无'}\n`);
console.log(`完成：${apps.length} 款产品，${accountResults.length} 个账号；新增 ${added.length}，本区不可见／移除 ${removed.length}`);
