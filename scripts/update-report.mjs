import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const root = new URL('../', import.meta.url);
const data = JSON.parse(await fs.readFile(new URL('data/google-play-watchlist.json', root), 'utf8'));
const reportFile = new URL('reports/last-update.json', root);
const report = JSON.parse(await fs.readFile(reportFile, 'utf8'));
report.verifiedProducts = data.apps.filter(app => app.status === 'ok').length;
report.staleProducts = data.apps.filter(app => app.status !== 'ok').map(app => ({ appId: app.appId, title: app.title, account: app.account }));
report.sensorTowerMatched = data.apps.filter(app => Number.isFinite(app.revenueCumulativeWorldwideUsd)).length;
report.sensorTowerMissing = data.apps.length - report.sensorTowerMatched;
const list = items => items.length ? items.map(app => `- ${app.title}（${app.account}，${app.appId}）`).join('\n') : '- 无';
const body = `# 最近一次更新

- 时间：${new Date(report.generatedAt).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false })}（Asia/Shanghai）
- 发现市场：${data.meta.discoveryCountries.join('、').toUpperCase()}；详情基线 US / en
- 账号：${data.accounts.length}
- 跟踪产品：${data.apps.length}
- 本轮详情复核成功：${report.verifiedProducts}
- 详情待复核（保留旧资料）：${report.staleProducts.length}
- 新增：${report.added.length}
- 本轮未保留：${report.removed.length}
- 账号索引待复核：${report.failedAccounts.length}
- Sensor Tower 累计营收：${report.sensorTowerMatched} 款已有值，${report.sensorTowerMissing} 款待补；本轮仅保留历史值，未刷新营收区间。

## 新增产品

${list(report.added)}

## 详情待复核

${list(report.staleProducts)}

## 本轮未保留

${list(report.removed)}

## 账号索引待复核

${report.failedAccounts.map(account => `- ${account.account}：${account.error}`).join('\n') || '- 无'}

索引异常、当前美国区不可见和全球下架不是同一结论；保留旧资料的产品在网页中有标记。
`;
await fs.writeFile(reportFile, `${JSON.stringify(report, null, 2)}\n`);
await fs.writeFile(new URL('reports/last-update.md', root), body);
console.log(`更新摘要已生成：${fileURLToPath(reportFile)}`);
