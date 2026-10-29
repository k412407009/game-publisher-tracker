import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const accounts = JSON.parse(await fs.readFile(path.join(root, 'accounts.json'), 'utf8'));
const payload = JSON.parse(await fs.readFile(path.join(root, 'data', 'google-play-watchlist.json'), 'utf8'));
const exposureRegistry = JSON.parse(await fs.readFile(path.join(root, 'data', 'exposure-events.json'), 'utf8'));
const issues = [];

const accountNames = new Set(accounts.map(item => item.account));
const appIds = new Set();
for (const app of payload.apps) {
  if (!app.appId || !app.title || !app.account) issues.push(`产品缺少必要字段：${JSON.stringify({ appId: app.appId, title: app.title, account: app.account })}`);
  if (appIds.has(app.appId)) issues.push(`产品包名重复：${app.appId}`);
  appIds.add(app.appId);
  if (!accountNames.has(app.account)) issues.push(`产品引用未知账号：${app.appId} -> ${app.account}`);
}

for (const account of accounts) {
  if (!account.company || !account.account || !account.devId || !account.urlType) issues.push(`账号配置缺少必要字段：${account.account || '(未命名)'}`);
  if (!Array.isArray(account.sources) || !account.sources.length) issues.push(`账号没有来源：${account.account}`);
  for (const source of account.sources || []) {
    if (!/^https?:\/\//.test(source.url || '')) issues.push(`账号来源不是 HTTP(S)：${account.account}`);
  }
}
for (const account of payload.accounts) {
  const actual = payload.apps.filter(app => app.account === account.account).length;
  if (account.appCount !== actual) issues.push(`账号产品数不一致：${account.account} (${account.appCount}/${actual})`);
}

for (const item of exposureRegistry.apps || []) {
  if (!appIds.has(item.appId)) issues.push(`曝光证据引用未知产品：${item.appId}`);
  for (const event of item.events || []) {
    if (!event.date || !event.type || !event.typeLabel || !event.title || !event.sourceUrl) {
      issues.push(`曝光证据缺少必要字段：${item.appId}`);
    }
    if (!/^https?:\/\//.test(event.sourceUrl || '')) issues.push(`曝光证据来源不是 HTTP(S)：${item.appId}`);
    if (!Number.isFinite(Date.parse(`${event.date}T00:00:00Z`))) issues.push(`曝光证据日期无效：${item.appId} -> ${event.date}`);
  }
}

for (const app of payload.apps) {
  if (!Object.hasOwn(app, 'firstPublicTs')) issues.push(`产品未应用公开时间口径：${app.appId}`);
  if (app.firstPublicKind === 'exposure' && !app.earliestExposure) issues.push(`曝光排序缺少证据：${app.appId}`);
}

for (const name of ['Homa', 'Snap Brain Games', 'LoadComplete', 'TREEPLLA']) {
  if (!accountNames.has(name)) issues.push(`首批线索账号未纳入：${name}`);
}

const summary = {
  generatedAt: payload.meta.generatedAt,
  accountsConfigured: accounts.length,
  accountsInPayload: payload.accounts.length,
  products: payload.apps.length,
  sensorTowerCumulativeMatched: payload.apps.filter(app => Number.isFinite(app.revenueCumulativeWorldwideUsd)).length,
  exposureEvidenceApps: payload.apps.filter(app => app.exposureEvents?.length).length,
  exposureOrderingAffected: payload.apps.filter(app => app.firstPublicKind === 'exposure').length,
  issues
};

console.log(JSON.stringify(summary, null, 2));
if (issues.length) process.exitCode = 1;
