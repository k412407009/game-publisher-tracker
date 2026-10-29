import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataPath = path.join(root, 'data', 'google-play-watchlist.json');
const [payload, td] = await Promise.all([
  fs.readFile(dataPath, 'utf8').then(JSON.parse),
  fs.readFile(path.join(root, 'data', 'td-series.json'), 'utf8').then(JSON.parse)
]);

const byId = new Map(td.items.filter(item => item.googlePlayId).map(item => [item.googlePlayId, item]));
let matched = 0;
let sensorMatched = 0;
payload.apps = payload.apps.map(app => {
  const item = byId.get(app.appId);
  if (!item) return app;
  matched += 1;
  const sensor = item.sensorTower;
  if (sensor) sensorMatched += 1;
  return {
    ...app,
    tags: [...new Set(['塔防', ...(app.tags || [])])],
    bilibiliTdEvidence: {
      issue: item.issue,
      bvid: item.bvid,
      videoDate: item.videoDate,
      videoUrl: item.videoUrl,
      collectionUrl: td.meta.sourceCollection
    },
    tdSensorTower: sensor || null,
    ...(sensor ? {
      revenueCumulativeWorldwideUsd: sensor.revenueWorldwideUsd,
      downloadsCumulativeWorldwide: sensor.downloadsWorldwide,
      sensorTowerCumulativeStart: sensor.start,
      sensorTowerCumulativeEnd: sensor.end,
      sensorTowerCumulativeStatus: 'matched-td-batch'
    } : {})
  };
});

payload.meta.tdResearch = {
  ...td.meta,
  matchedInGooglePlayWatchlist: matched,
  sensorTowerMatchedInGooglePlayWatchlist: sensorMatched
};

const json = `${JSON.stringify(payload, null, 2)}\n`;
await fs.writeFile(dataPath, json);
await fs.writeFile(path.join(root, 'data', 'google-play-watchlist.js'), `window.GAME_WATCHLIST = ${json.trim()};\n`);
console.log(`塔防专项并表：${matched}/${byId.size} 个 Google Play 精确包名匹配，Sensor Tower ${sensorMatched}`);
