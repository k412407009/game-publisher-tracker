import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const registryPath = path.join(root, 'data', 'exposure-events.json');
const reviewPath = path.join(root, 'data', 'raw', 'deepseek-exposure-review.json');
const selectionPath = path.join(root, 'data', 'exposure-review-candidates.json');
const registry = JSON.parse(await fs.readFile(registryPath, 'utf8'));
const review = JSON.parse(await fs.readFile(reviewPath, 'utf8'));
const selection = JSON.parse(await fs.readFile(selectionPath, 'utf8'));

function year(value) { return String(value || '').slice(0, 4); }

const rejected = [];
const accepted = [];
for (const result of review.results || []) {
  const event = result.earliestEvent;
  if (!result.earlierThanCurrent || !event) continue;
  let reason = '';
  if (!['high', 'medium'].includes(event.confidence)) reason = '可信度不足';
  else if (!result.sources?.some(source => source.url === event.sourceUrl)) reason = '来源 URL 不在 Tavily 检索结果中';
  else if (event.datePrecision === 'year' && year(event.date) === year(result.currentFirstPublicDate)) reason = '只精确到年，不能证明早于同年已知日期';
  if (reason) { rejected.push({ appId: result.appId, title: result.title, reason }); continue; }

  let appEntry = registry.apps.find(item => item.appId === result.appId);
  if (!appEntry) {
    appEntry = { appId: result.appId, events: [] };
    registry.apps.push(appEntry);
  }
  const duplicate = appEntry.events.some(existing => existing.date === event.date && existing.sourceUrl === event.sourceUrl);
  if (!duplicate) {
    appEntry.events.push({
      ...event,
      countsTowardOrdering: true,
      retrievalChannel: 'Tavily + DeepSeek',
      reviewedBy: `DeepSeek ${result.model || review.meta?.model || ''}`.trim(),
      reviewedAt: result.reviewedAt,
      reviewNote: '模型仅对 Tavily 返回的公开网页摘要做结构化标注；来源 URL 经程序限定必须来自检索结果。'
    });
  }
  accepted.push({ appId: result.appId, title: result.title, date: event.date, sourceUrl: event.sourceUrl, duplicate });
}

for (const item of registry.apps) item.events.sort((a, b) => String(a.date).localeCompare(String(b.date)));
registry.apps.sort((a, b) => a.appId.localeCompare(b.appId));
registry.meta.updatedAt = new Date().toISOString().slice(0, 10);
registry.meta.deepseekReview = {
  reviewedAt: review.meta?.updatedAt,
  provider: review.meta?.provider || 'DeepSeek',
  model: review.meta?.model,
  retrieval: review.meta?.retrieval,
  selected: selection.meta?.selected,
  completed: review.results?.length || 0,
  earlierCandidates: review.results?.filter(item => item.earlierThanCurrent).length || 0,
  accepted: accepted.length,
  rejected
};

await fs.writeFile(registryPath, `${JSON.stringify(registry, null, 2)}\n`);
console.log(`DeepSeek 候选归档：接受 ${accepted.length}，拒绝 ${rejected.length}`);
for (const item of rejected) console.log(`- 拒绝 ${item.title}: ${item.reason}`);
