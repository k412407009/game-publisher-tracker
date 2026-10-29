import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataPath = path.join(root, 'data', 'google-play-watchlist.json');
const sourceFiles = [
  'sensortower-cumulative-part-1.csv',
  'sensortower-cumulative-part-2.csv'
];

const renamed = new Map(Object.entries({
  'Shikaku - Brain Workout': 'Cortex Shikaku',
  'Arcane Maze - Defense Puzzle': 'Arrow Defense: Puzzle Escape',
  'Dicero': 'Dicero!',
  'Snacky Dash: Food Maze Puzzle': 'Gobble Dash: Juiced Up!',
  'Marble Sort! - Color Puzzle': 'Marble Sort!',
  'Castle Busters': 'Castle Clashers!',
  'Cell Survivor': 'セルサバイバー - シューティングゲーム',
  'Hotel Manager: Idle Tycoon': 'Hotel Manager',
  'Snipers Duel': 'No Cover Clash: Snipers Duel',
  'Bulldozer Master: Crush & Mine': 'Bulldozer Master',
  'Spin Squad!': '운빨돌격대',
  'Coffee Sort - Block Jam Puzzle': 'Coffee Sort - Puzzle Games',
  'Jewels Uncharted:Match3 Puzzle': '쥬얼스 언차티드: 매치-3 퍼즐',
  'Penguin GO!': 'Penguin GO! - Collab',
  'Sand Jam': 'Sand Jam!',
  'Pull Pull Pull Heroes -TD Game': 'Pull Pull Pull Heroes',
  'Office Life: Idle Tycoon Games': 'Office Life!',
  'Backpack Rush: Bag Merge': 'Backpack Rush',
  'Bottle Jam!': 'Bottle Jam',
  'HexaCoin Harmony - Merge tiles': 'HexaCoin Harmony - Merge Tiles',
  'Era of Conquest': '文明与征服-攻城策略对战 重启全面战争时代',
  'Final Survivor': 'Final Survivor: Zombie Warfare',
  'Dolls Stack: Match & Merge!': 'Dolls Stack: Match & Stack!',
  'Drop Merge : Number Puzzle': 'Drop Merge® : Number Puzzle',
  '헌터W': 'Dragon Hunters2: Fantasy World',
  'Survivor.io': 'Survivor!.io',
  'Block Jam: 3D Color Puzzle': 'Block Jam - 3D Block Puzzle',
  'Cube Master 3D®:Matching Game': 'Cube Master 3D:Matching Game',
  'Tile Master 3D®-Matching Games': 'Tile Master 3D - Triple Match',
  'SPOOKIZ PANG: Bubble Shooting': 'SPOOKIZ PANG',
  'Candy N Cookie : Match3': 'Candy N Cookie',
  'BeReal. Your friends for real.': 'BeReal: Photos & Friends Daily',
  'Candy Friends Forest : Match-3': '캔디 팝 포레스트 매치 - 3',
  'Random Dice Defense : PvP TD': '랜덤 다이스 디펜스 : PVP 타워 디펜스',
  'Drop The Number® : Merge Game': 'Drop The Number : Merge Game'
}));

function parseTsv(buffer) {
  const text = buffer.toString('utf16le').replace(/^\uFEFF/, '');
  return text.split(/\r?\n/).map(line => line.split('\t').map(value =>
    value.replace(/^"|"$/g, '').replace(/""/g, '"')
  )).filter(row => /^\d{4}-\d{2}-\d{2}$/.test(row[2] || ''));
}

const payload = JSON.parse(await fs.readFile(dataPath, 'utf8'));
const rows = [];
for (const file of sourceFiles) {
  const raw = await fs.readFile(path.join(root, 'data', 'raw', file));
  rows.push(...parseTsv(raw));
}

const uniqueRows = new Map();
for (const row of rows) {
  const [name, unifiedId, month, downloads, revenue] = row;
  uniqueRows.set(`${unifiedId}\t${month}\t${downloads}\t${revenue}`, {
    name,
    unifiedId,
    month,
    downloads: Number(downloads) || 0,
    revenue: Number(revenue) || 0
  });
}

const byName = new Map();
for (const row of uniqueRows.values()) {
  if (!byName.has(row.name)) byName.set(row.name, []);
  byName.get(row.name).push(row);
}

const imported = [];
payload.apps = payload.apps.map(app => {
  const sensorTowerName = byName.has(app.title) ? app.title : renamed.get(app.title);
  const appRows = sensorTowerName ? (byName.get(sensorTowerName) || []) : [];
  const dates = appRows.map(row => row.month).sort();
  const result = {
    appId: app.appId,
    title: app.title,
    sensorTowerName: sensorTowerName || null,
    revenueCumulativeWorldwideUsd: appRows.length
      ? Number(appRows.reduce((sum, row) => sum + row.revenue, 0).toFixed(2))
      : null,
    downloadsCumulativeWorldwide: appRows.length
      ? appRows.reduce((sum, row) => sum + row.downloads, 0)
      : null,
    sensorTowerCumulativeStart: dates[0] || null,
    sensorTowerCumulativeEnd: dates.at(-1) || null,
    sensorTowerCumulativeStatus: appRows.length ? 'matched' : 'unavailable'
  };
  imported.push(result);
  return { ...app, ...result };
});

const matched = imported.filter(app => app.sensorTowerCumulativeStatus === 'matched');
const fetchedAt = new Date().toISOString();
payload.meta.sensorTowerCumulative = {
  fetchedAt,
  platform: 'Google Play',
  countries: 'Worldwide / all available Sensor Tower countries',
  currency: 'USD',
  requestedRange: 'All Time',
  exportRangeStart: '2012-01-01',
  exportRangeEnd: '2026-08-16',
  granularity: 'month',
  sourceFiles,
  matchedCount: matched.length,
  unavailableCount: imported.length - matched.length,
  totalRevenueUsd: Number(matched.reduce((sum, app) => sum + app.revenueCumulativeWorldwideUsd, 0).toFixed(2)),
  methodology: 'Sensor Tower Google Play 全球收入估算，按应用可用的全部历史月度数据求和。这是应用商店收入估算，不包含广告收入，不等于净利润或发行商财报。缺失表示导出中无历史收入行，不代表零收入。'
};
payload.meta.caveat = `${payload.meta.caveat} ${payload.meta.sensorTowerCumulative.methodology}`;

const json = `${JSON.stringify(payload, null, 2)}\n`;
await fs.writeFile(dataPath, json);
await fs.writeFile(path.join(root, 'data', 'google-play-watchlist.js'), `window.GAME_WATCHLIST = ${json.trim()};\n`);
await fs.writeFile(path.join(root, 'data', 'sensortower-revenue.json'), `${JSON.stringify({
  meta: payload.meta.sensorTowerCumulative,
  apps: imported.sort((a, b) => (b.revenueCumulativeWorldwideUsd ?? -1) - (a.revenueCumulativeWorldwideUsd ?? -1))
}, null, 2)}\n`);

console.log(`Sensor Tower 累计营收：${matched.length}/${imported.length} 匹配，${imported.length - matched.length} 无历史行`);
