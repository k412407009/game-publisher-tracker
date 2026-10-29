import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataPath = path.join(root, 'data', 'google-play-watchlist.json');
const exposurePath = path.join(root, 'data', 'exposure-events.json');
const payload = JSON.parse(await fs.readFile(dataPath, 'utf8'));
const registry = JSON.parse(await fs.readFile(exposurePath, 'utf8'));
const registryById = new Map((registry.apps || []).map(item => [item.appId, item]));

function parseDate(value) {
  const ts = Date.parse(`${value || ''}T00:00:00Z`);
  return Number.isFinite(ts) ? ts : 0;
}

for (const app of payload.apps) {
  const configured = registryById.get(app.appId);
  const events = (configured?.events || []).map(event => ({
    ...event,
    ts: parseDate(event.date),
    endTs: event.endDate ? parseDate(event.endDate) : null
  })).filter(event => event.ts).sort((a, b) => a.ts - b.ts);
  const orderingEvents = events.filter(event => event.countsTowardOrdering !== false);
  const earliestExposure = orderingEvents[0] || null;
  const storeTs = Number(app.releasedTs || 0);
  const exposureWins = earliestExposure && (!storeTs || earliestExposure.ts < storeTs);

  app.exposureEvents = events;
  app.earliestExposure = earliestExposure;
  app.firstPublicTs = exposureWins ? earliestExposure.ts : storeTs;
  app.firstPublicKind = exposureWins ? 'exposure' : (storeTs ? 'store' : (earliestExposure ? 'exposure' : 'unknown'));
  if (!app.firstPublicTs && earliestExposure) app.firstPublicTs = earliestExposure.ts;
}

const unresolvedIds = [...registryById.keys()].filter(appId => !payload.apps.some(app => app.appId === appId));
payload.meta.exposureRegistry = {
  updatedAt: registry.meta?.updatedAt || new Date().toISOString(),
  methodology: registry.meta?.methodology || '',
  deepseekReview: registry.meta?.deepseekReview || null,
  appsWithEvidence: payload.apps.filter(app => app.exposureEvents?.length).length,
  orderingAffected: payload.apps.filter(app => app.firstPublicKind === 'exposure').length,
  unresolvedIds
};

const json = `${JSON.stringify(payload, null, 2)}\n`;
await fs.writeFile(dataPath, json);
await fs.writeFile(path.join(root, 'data', 'google-play-watchlist.js'), `window.GAME_WATCHLIST = ${json.trim()};\n`);
console.log(`曝光资料已应用：${payload.meta.exposureRegistry.appsWithEvidence} 款有证据，${payload.meta.exposureRegistry.orderingAffected} 款改变排序时间`);
