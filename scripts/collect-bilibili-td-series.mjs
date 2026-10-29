import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import gplay from 'google-play-scraper';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cutoff = '2026-02-24';
const sourceCollection = 'https://space.bilibili.com/327997045/channel/collectiondetail?sid=5497336';
const sourceEntry = 'https://www.bilibili.com/video/BV1778y6eEPB/';

// B 站合集页面在 2026-08-24 可见的 2026 年条目。保留候选全量，再按
// pubdate 过滤，避免用期号猜测日期（合集内有重复 173 期）。
const bvids = `
BV15P6mB4Eqb BV15P6mB4EaD BV1VTzrBTExw BV1mkFbzjE9h BV1UkFbzjE6j BV122FbzCEwF
BV1paZLBfEuJ BV1kaZLBfEp1 BV1cdf3BDEXx BV1CRf3BHETZ BV1ARf3BHEnr BV17pf3BVEWo
BV1iQADzhEVR BV1jDADzwE39 BV11TPYzhEZf BV1XxwxzEEqi BV167APzME15 BV17HAPzvEXu
BV1EHAPzvEeF BV17HAPzvESX BV1fHAPzvEtp BV13mXGBWEQi BV15zXGBfEd3 BV1fJD5BYEZs
BV1EJD5BeEUU BV1dsD5BFE26 BV1M5DCB8EGY BV1t5DCB8E6t BV1LLdEBnEZL BV1iVdEBQEiy
BV17odnBcECD BV1LMoRBREev BV1LMoRBRExR BV1qToRBxEN1 BV1c9RjBXEsj BV1rXRjBWE2e
BV1j3RdBREqX BV1RjRdBnEEa BV1d5RdBQEN7 BV1s2Lg61Ess BV1pSLg6CEbj BV1jxGq6PEd1
BV1jxGq6PErr BV1i4Gq6YEWB BV1ViVV6AESd BV1ViVV6AEUo BV1WB7D6cE8J BV1WB7D6cEur
BV1Wi7D6aEqh BV1otjn6aEfr BV1q4jn6AED2 BV1vhjn68EnH BV1dE7n6aEGp BV1dE7n6aEjS
BV1vE7n6aEmj BV1etTf6CEck BV1ZcNs6jEtK BV1ZcNs6jEG8 BV1jPNs6LEAG BV1jPNs6LEBS
BV1AdKF64ESM BV1t63K68EKN BV1NFGg6TE7m BV1bUu36rE9m BV19mgg6jEKC BV1Y4g36SEDs
BV13Qgg6yEbF BV1hQgg6yEMf BV1778y6eEN2 BV1778y6eEPB
`.trim().split(/\s+/);

const googlePlayOverrides = new Map(Object.entries({
  'Endless Puncher': 'com.fubugames.endlesspuncher',
  'Blast Survivor': 'com.OsOs.LastSurvivor',
  'Space Minions: Defense': 'com.TeamSparta.SpaceMinions',
  'Final Warship': 'com.zdjhz.finalwarship.gp',
  'BagMaster Isekai-Bag Battle': 'com.DoorTeam.BagMaster',
  'Nightfall Spire: Tower Defense': 'com.goldendragon.nfs',
  'Hell Rush: Evil Defender': 'com.emoo.hellrush',
  'BattleShip Go: Monster Wave': 'com.TeamSparta.battleshipgo'
}));

// 已登录 Sensor Tower：Android / Worldwide / monthly，2026-02-01~2026-08-22。
// 缺失保持 null，不把 0 当成未知。
const sensorTower = new Map([
  ['com.bailing.lark.roll.dev', ['Dicero!', 1574295, 3021981]],
  ['com.xiaomo.lastextract', ['Last Extract', 338220, 86727]],
  ['com.oopsie.croco.challenge.leisure.battle.game', ['Oopsie Croco', 270309, 198729]],
  ['com.feelingtouch.rush', ['Zombie World War: Storm', 166519, 354172]],
  ['net.pixelrabbit.jh2', ["Don't Exfil Late", 157531, 24504]],
  ['com.yeaplay.gp.slimeup', ['Slime Up!', 70806, 7994]],
  ['com.cookapps.bouncedefense', ['Bounce Defense : Pinball Hero', 42412, 14810]],
  ['com.RastleksGames.EpicIdleJourney', ['Epic Idle Journey: RPG Battle', 41427, 7935]],
  ['com.cialspeed.idlespace', ['Idle Space Fleet', 27053, 66670]],
  ['com.ondi.fortias.defense', ['Pixel Defenders: Merge TD Game', 23995, 11272]],
  ['com.superbox.aos.magicSquad', ['Wizzy Animals : Defense', 19489, 3552]],
  ['com.superrabbitgames.globalminicrafts', ['행성파괴 냥냐냥: 머지 서바이버', 11925, 18636]],
  ['com.tree.dontfry', ["Don't Fry! Lucky Defense", 9627, 3399]],
  ['com.payge.idledefenders', ['Idle Defenders: Military TD', 4579, 120]],
  ['com.defense.tower.gears.merge', ['Gears Tower Defense: Merge TD', 4338, 2224]],
  ['com.kadka.battle.forge', ['Battle Forge', 2113, 28]],
  ['com.dice.board.defense', ['Dice Mage TD', 502, 0]],
  ['com.ketchapp.wheelofblade', ['Knife Wheels', 92, 0]],
  ['com.studio501.diceheroes', ['Dice & Heroes', 72, 0]],
  ['com.games.egg.vs.fruits', ['Egg vs Fruits', 0, 0]],
  ['com.rockbite.doodlefight', ['Doodle Fight', 0, 0]],
  ['com.tsyatsya.dragonsrush', ["Dragon's Rush", 0, 0]],
  ['com.hypermonkgames.SpinnerEscape', ['Spinner Escape', 0, 0]]
]);

function decode(value = '') {
  return value.replace(/&amp;/g, '&').replace(/&#39;/g, "'").trim();
}

async function pool(items, worker, limit = 5) {
  const output = new Array(items.length);
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      output[index] = await worker(items[index]);
    }
  }));
  return output;
}

async function fetchVideo(bvid) {
  const response = await fetch(`https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`, {
    headers: { accept: 'application/json', 'user-agent': 'Mozilla/5.0' },
    signal: AbortSignal.timeout(20000)
  });
  const body = await response.json();
  if (!response.ok || body.code !== 0) throw new Error(`${bvid}: ${body.message || response.status}`);
  return body.data;
}

async function appStoreDetail(id) {
  const response = await fetch(`https://itunes.apple.com/lookup?id=${id}&country=us`, { signal: AbortSignal.timeout(20000) });
  const body = await response.json();
  return body.results?.[0] || null;
}

async function googlePlayDetail(appId) {
  try {
    return await gplay.app({ appId, country: 'us', lang: 'en', requestOptions: { timeout: 15000 } });
  } catch (error) {
    return { appId, status: 'unavailable-us', error: error.message };
  }
}

console.log(`读取 B 站合集候选 ${bvids.length} 条…`);
const videos = await pool(bvids, fetchVideo);
const items = videos.map(video => {
  const description = decode(video.desc || '');
  const lines = description.split(/\r?\n/).map(decode).filter(Boolean);
  const game = lines.find(line => !/^https?:\/\//.test(line)) || video.title;
  const describedUrl = lines.find(line => /^https?:\/\//.test(line)) || '';
  const gpMatch = describedUrl.match(/play\.google\.com\/store\/apps\/details\?id=([^&]+)/);
  const iosMatch = describedUrl.match(/apps\.apple\.com\/[^/]+\/app\/[^/]+\/id(\d+)/);
  const googlePlayId = gpMatch ? decodeURIComponent(gpMatch[1]) : (googlePlayOverrides.get(game) || null);
  const appStoreId = iosMatch ? iosMatch[1] : null;
  const videoDate = new Date(video.pubdate * 1000).toISOString().slice(0, 10);
  const issue = Number(video.title.match(/创意合集\s*(\d+)/)?.[1] || 0);
  return {
    issue,
    bvid: video.bvid,
    videoTitle: video.title,
    videoDate,
    videoUrl: `https://www.bilibili.com/video/${video.bvid}/`,
    game,
    describedUrl: describedUrl || null,
    platform: googlePlayId ? 'Google Play' : (appStoreId ? 'App Store' : (/iOS/i.test(video.title) ? 'App Store' : 'Store 待补')),
    googlePlayId,
    appStoreId
  };
}).filter(item => item.videoDate >= cutoff).sort((a, b) => a.videoDate.localeCompare(b.videoDate) || a.issue - b.issue);

console.log(`截止 ${cutoff} 后 ${items.length} 条；补商店与厂商信息…`);
const enriched = await pool(items, async item => {
  let store = null;
  if (item.googlePlayId) {
    const detail = await googlePlayDetail(item.googlePlayId);
    store = detail.status === 'unavailable-us' ? detail : {
      status: 'visible-us',
      title: detail.title,
      developer: detail.developer,
      developerId: detail.developerId,
      url: detail.url,
      icon: detail.icon,
      summary: detail.summary,
      genre: detail.genre,
      released: detail.released,
      minInstalls: Number(detail.minInstalls || 0),
      installs: detail.installs || '',
      ratings: Number(detail.ratings || 0),
      reviews: Number(detail.reviews || 0),
      score: Number(detail.score || 0)
    };
  } else if (item.appStoreId) {
    const detail = await appStoreDetail(item.appStoreId);
    store = detail ? {
      status: 'visible-us',
      title: detail.trackName,
      developer: detail.sellerName,
      bundleId: detail.bundleId,
      url: detail.trackViewUrl,
      icon: detail.artworkUrl512 || detail.artworkUrl100,
      genre: detail.primaryGenreName,
      released: detail.releaseDate,
      ratings: Number(detail.userRatingCount || 0),
      score: Number(detail.averageUserRating || 0)
    } : { status: 'unavailable-us' };
  }
  const sensor = item.googlePlayId ? sensorTower.get(item.googlePlayId) : null;
  return {
    ...item,
    store,
    sensorTower: sensor ? {
      name: sensor[0],
      downloadsWorldwide: sensor[1],
      revenueWorldwideUsd: sensor[2],
      start: '2026-02-01',
      end: '2026-08-22',
      granularity: 'monthly',
      source: 'Sensor Tower logged-in App Analysis export view'
    } : null
  };
}, 4);

const payload = {
  meta: {
    generatedAt: new Date().toISOString(),
    cutoff,
    sourceCollection,
    sourceEntry,
    uploader: '每日海外小游戏',
    uploaderId: 327997045,
    collectionId: 5497336,
    totalVideos: enriched.length,
    googlePlayExact: enriched.filter(item => item.googlePlayId).length,
    appStoreExact: enriched.filter(item => item.appStoreId).length,
    storePending: enriched.filter(item => !item.googlePlayId && !item.appStoreId).length,
    sensorTowerMatched: enriched.filter(item => item.sensorTower).length,
    methodology: '仅纳入指定 B 站订阅合集在截止日之后发布的视频。游戏名和商店链接优先取视频简介；早期无链接条目只对完全同名的 Google Play 结果做精确补齐。Sensor Tower 按 Android 包名精确匹配，缺失不记为 0。'
  },
  items: enriched
};

await fs.mkdir(path.join(root, 'data', 'raw'), { recursive: true });
await fs.writeFile(path.join(root, 'data', 'td-series.json'), `${JSON.stringify(payload, null, 2)}\n`);
await fs.writeFile(path.join(root, 'data', 'td-series.js'), `window.TD_WATCHLIST = ${JSON.stringify(payload, null, 2)};\n`);
const markdownEscape = value => String(value ?? '—').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
const topSensor = enriched.filter(item => item.sensorTower)
  .sort((a, b) => b.sensorTower.revenueWorldwideUsd - a.sensorTower.revenueWorldwideUsd);
const report = `# B 站塔防／Roguelike+塔防合集近半年调研

- 更新时间：${payload.meta.generatedAt}
- 严格截止日：${cutoff}
- 指定合集：[【会员】- 肉鸽与塔防类游戏合集](${sourceCollection})
- 视频／游戏：${enriched.length}
- Google Play 精确包名：${payload.meta.googlePlayExact}
- App Store 精确 ID：${payload.meta.appStoreExact}
- 商店待补：${payload.meta.storePending}
- Sensor Tower 精确匹配：${payload.meta.sensorTowerMatched}

## 数据表现优先级

Sensor Tower 口径：Android，Worldwide，monthly，2026-02-01 至 2026-08-22。数值为估算，不含广告收入。

| # | 产品 | 发行方 | 下载估算 | 净收入估算 |
| ---: | --- | --- | ---: | ---: |
${topSensor.map((item, index) => `| ${index + 1} | ${markdownEscape(item.store?.title || item.game)} | ${markdownEscape(item.store?.developer)} | ${item.sensorTower.downloadsWorldwide.toLocaleString('en-US')} | $${item.sensorTower.revenueWorldwideUsd.toLocaleString('en-US')} |`).join('\n')}

## 全部 58 款产品

| 视频日期 | 期号 | 产品 | 平台 | 发行方 | 商店状态 | GP 安装下限 | ST 下载 | ST 净收入 | 证据 |
| --- | ---: | --- | --- | --- | --- | ---: | ---: | ---: | --- |
${[...enriched].sort((a, b) => b.videoDate.localeCompare(a.videoDate) || b.issue - a.issue).map(item => {
  const storeStatus = item.store?.status === 'visible-us' ? '美国区可见' : (item.googlePlayId || item.appStoreId ? '美国区不可见' : '待补');
  const storeLink = item.store?.url || item.describedUrl;
  return `| ${item.videoDate} | ${item.issue} | ${markdownEscape(item.store?.title || item.game)} | ${item.platform} | ${markdownEscape(item.store?.developer)} | ${storeStatus} | ${item.store?.minInstalls?.toLocaleString('en-US') || '—'} | ${item.sensorTower?.downloadsWorldwide?.toLocaleString('en-US') || '—'} | ${Number.isFinite(item.sensorTower?.revenueWorldwideUsd) ? `$${item.sensorTower.revenueWorldwideUsd.toLocaleString('en-US')}` : '—'} | [B站](${item.videoUrl})${storeLink ? ` / [商店](${storeLink})` : ''} |`;
}).join('\n')}

## 缺口

- ${enriched.filter(item => !item.googlePlayId && !item.appStoreId).length} 款原视频未给商店链接，且没有可靠的完全同名匹配：${enriched.filter(item => !item.googlePlayId && !item.appStoreId).map(item => item.game).join('、')}。
- ${enriched.filter(item => (item.googlePlayId || item.appStoreId) && item.store?.status !== 'visible-us').length} 款有精确 ID 但当前美国区不可读；这不等于全球下架。
- Sensor Tower 未匹配的产品保持缺失，不以 0 替代。

## 方法

${payload.meta.methodology}
`;
await fs.mkdir(path.join(root, 'reports'), { recursive: true });
await fs.writeFile(path.join(root, 'reports', 'td-series-latest.md'), report);
console.log(`完成：${enriched.length} 条，Google Play 精确 ${payload.meta.googlePlayExact}，App Store 精确 ${payload.meta.appStoreExact}，Sensor Tower ${payload.meta.sensorTowerMatched}`);
