import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const candidatePath = path.join(root, 'data', 'exposure-review-candidates.json');
const outputPath = path.join(root, 'data', 'raw', 'deepseek-exposure-review.json');
const envCandidates = [
  process.env.DEEPSEEK_ENV_FILE,
  path.join(root, '.env')
].filter(Boolean);

function parseEnv(raw) {
  return Object.fromEntries(raw.split(/\r?\n/)
    .map(line => line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/))
    .filter(Boolean)
    .map(match => [match[1], match[2].replace(/^(['"])(.*)\1$/, '$2')]));
}

async function loadSecrets() {
  const merged = { ...process.env };
  for (const file of envCandidates) {
    try { Object.assign(merged, parseEnv(await fs.readFile(file, 'utf8'))); } catch {}
  }
  const deepseekKey = merged.DEEPSEEK_API_KEY?.trim();
  const tavilyKey = (merged.TAVILY_API_KEY || merged.Tavily_API_KEY)?.trim();
  if (!deepseekKey) throw new Error('DEEPSEEK_API_KEY 未配置');
  if (!tavilyKey) throw new Error('TAVILY_API_KEY 未配置');
  return {
    deepseekKey,
    tavilyKey,
    deepseekBase: (merged.DEEPSEEK_BASE_URL || 'https://api.deepseek.com/v1').replace(/\/$/, ''),
    deepseekModel: merged.DEEPSEEK_MODEL || 'deepseek-v4-flash'
  };
}

async function requestJson(url, init, attempts = 3) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, { ...init, signal: AbortSignal.timeout(90000) });
      const body = await response.json().catch(() => ({}));
      if (response.ok) return body;
      lastError = new Error(`${response.status} ${body.error?.message || body.detail || 'request failed'}`);
      if (response.status < 500 && response.status !== 429) break;
    } catch (error) { lastError = error; }
    await new Promise(resolve => setTimeout(resolve, attempt * 1500));
  }
  throw lastError;
}

async function tavilySearch(query, key) {
  const body = await requestJson('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({ query, topic: 'general', search_depth: 'advanced', max_results: 8, include_answer: false })
  });
  return (body.results || []).map(result => ({
    title: result.title || '',
    url: result.url || '',
    publishedDate: result.published_date || null,
    content: String(result.content || '').slice(0, 1800),
    score: result.score || 0
  }));
}

function parseModelJson(content) {
  const clean = String(content || '').replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  return JSON.parse(clean);
}

async function reviewCandidate(candidate, secrets) {
  const queries = [
    `"${candidate.title}" "${candidate.appId}" first release test beta early access soft launch`,
    `"${candidate.title}" "${candidate.developer || candidate.account}" mobile game announced launched release date`
  ];
  const batches = await Promise.all(queries.map(query => tavilySearch(query, secrets.tavilyKey)));
  const sources = [...new Map(batches.flat().filter(item => item.url).map(item => [item.url, item])).values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, 8)
    .map((item, index) => ({ sourceId: index + 1, ...item }));

  const prompt = `你是手游产品考据员。仅根据下面给定的公开网页搜索摘要，复核这款游戏最早公开出现时间。

产品：${candidate.title}
包名：${candidate.appId}
开发者：${candidate.developer || candidate.account}
当前已知最早公开：${candidate.currentFirstPublicDate || '未知'}

严格规则：
1. 只认可能与产品名、包名或开发者交叉确认的媒体报道、官宣、封测/软启动、预注册、商店上架、第三方版本记录。
2. 不得使用搜索摘要中没有的知识，不得猜测日期。页面更新日期不等于游戏测试日期。
3. 如果来源只给出月份，datePrecision=month，date 写该月1日；只给出年份则用1月1日且 datePrecision=year。
4. sourceUrl 必须严格选自给定来源 URL；证据不足时 earliestEvent=null。
5. 我们需要的是“最早可核验公开出现”，不是模型自己认为可能更早的时间。

输出严格 JSON：
{
  "appId": "...",
  "earliestEvent": null 或 {
    "date": "YYYY-MM-DD",
    "endDate": null 或 "YYYY-MM-DD",
    "datePrecision": "day|week|month|year",
    "type": "media_exposure|soft_launch|beta_test|pre_registration|store_release|third_party_build",
    "typeLabel": "简短中文",
    "title": "事实性标题",
    "summary": "不超过60字的中文证据说明",
    "sourceLabel": "来源站点",
    "sourceUrl": "必须来自下方URL",
    "confidence": "high|medium|low"
  },
  "assessment": "不超过80字的中文结论"
}

来源摘要：
${JSON.stringify(sources, null, 2)}`;

  const response = await requestJson(`${secrets.deepseekBase}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${secrets.deepseekKey}` },
    body: JSON.stringify({
      model: secrets.deepseekModel,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0,
      response_format: { type: 'json_object' },
      max_tokens: 4000
    })
  });
  const parsed = parseModelJson(response.choices?.[0]?.message?.content);
  if (parsed.appId !== candidate.appId) throw new Error(`appId 不匹配：${parsed.appId}`);
  if (parsed.earliestEvent && !sources.some(source => source.url === parsed.earliestEvent.sourceUrl)) {
    throw new Error('模型返回了未提供的来源 URL');
  }
  const eventDate = parsed.earliestEvent?.date ? Date.parse(`${parsed.earliestEvent.date}T00:00:00Z`) : 0;
  const currentDate = candidate.currentFirstPublicDate ? Date.parse(`${candidate.currentFirstPublicDate}T00:00:00Z`) : 0;
  return {
    ...candidate,
    queries,
    sources,
    provider: 'DeepSeek',
    model: response.model || secrets.deepseekModel,
    reviewedAt: new Date().toISOString(),
    earliestEvent: parsed.earliestEvent || null,
    assessment: parsed.assessment || '',
    earlierThanCurrent: Boolean(eventDate && (!currentDate || eventDate < currentDate))
  };
}

const secrets = await loadSecrets();
const selection = JSON.parse(await fs.readFile(candidatePath, 'utf8'));
let output;
try { output = JSON.parse(await fs.readFile(outputPath, 'utf8')); }
catch { output = { meta: {}, results: [] }; }
// 失败记录不视为完成，再次运行时自动重试。
output.results = output.results.filter(item => !item.error);
const completed = new Set(output.results.map(item => item.appId));

output.meta = {
  generatedAt: output.meta.generatedAt || new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  provider: 'DeepSeek',
  model: secrets.deepseekModel,
  retrieval: 'Tavily advanced search; DeepSeek labels only supplied snippets',
  selectionPolicy: selection.meta.policy,
  selected: selection.candidates.length
};

for (const [index, candidate] of selection.candidates.entries()) {
  if (completed.has(candidate.appId)) {
    console.log(`[${index + 1}/${selection.candidates.length}] 跳过已复核 ${candidate.title}`);
    continue;
  }
  try {
    const result = await reviewCandidate(candidate, secrets);
    output.results.push(result);
    console.log(`[${index + 1}/${selection.candidates.length}] ${candidate.title}: ${result.earliestEvent?.date || '无更早证据'}${result.earlierThanCurrent ? ' ← 更早' : ''}`);
  } catch (error) {
    output.results.push({ ...candidate, provider: 'DeepSeek', model: secrets.deepseekModel, reviewedAt: new Date().toISOString(), error: error.message, earliestEvent: null, earlierThanCurrent: false });
    console.log(`[${index + 1}/${selection.candidates.length}] ${candidate.title}: 失败 ${error.message}`);
  }
  output.meta.updatedAt = new Date().toISOString();
  output.meta.completed = output.results.length;
  output.meta.earlierFound = output.results.filter(item => item.earlierThanCurrent).length;
  await fs.writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`);
}

console.log(`复核完成：${output.results.length}/${selection.candidates.length}，候选更早时间 ${output.results.filter(item => item.earlierThanCurrent).length} 款`);
