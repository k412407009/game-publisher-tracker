import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const repo = path.join(root, 'dist/public-repo');
const site = path.join(root, 'dist/site');
// 固定输出目录；不跟随符号链接，也不读取本机环境文件或原始研究资料。
for (const out of [repo, site]) {
  const stat = await fs.lstat(out).catch(() => null);
  if (stat?.isSymbolicLink()) throw new Error('输出目录不能是符号链接');
  await fs.rm(out, { recursive: true, force: true });
  await fs.mkdir(out, { recursive: true });
}
const webFiles = [
  'index.html', 'accounts.json', 'unresolved.json',
  'assets/watchlist.css', 'assets/watchlist.js',
  'data/google-play-watchlist.json', 'data/google-play-watchlist.js',
  'data/td-series.json', 'data/td-series.js', 'data/exposure-events.json',
  'data/exposure-review-candidates.json', 'data/sensortower-revenue.json',
  'reports/last-update.json', 'reports/last-update.md',
  'reports/product-facts.md', 'reports/crawl-gap-random-dice-2.md'
];
async function copy(relative, destination) {
  const from = path.join(root, relative);
  if ((await fs.lstat(from)).isSymbolicLink()) throw new Error(`不发布符号链接：${relative}`);
  const to = path.join(destination, relative);
  await fs.mkdir(path.dirname(to), { recursive: true });
  await fs.copyFile(from, to);
}
const icons = await fs.readdir(path.join(root, 'assets/icons/td'));
for (const file of icons.filter(name => /^[\w.-]+\.png$/.test(name))) webFiles.push(`assets/icons/td/${file}`);
for (const file of webFiles) for (const out of [repo, site]) await copy(file, out);
const scriptFiles = (await fs.readdir(path.join(root, 'scripts'))).filter(file => file.endsWith('.mjs'));
for (const file of ['package.json', 'package-lock.json', 'AGENTS.md', 'docs/public-README.md', ...scriptFiles.map(file => `scripts/${file}`)]) await copy(file, repo);
await fs.copyFile(path.join(root, 'docs/public-README.md'), path.join(repo, 'README.md'));
await fs.writeFile(path.join(repo, '.gitignore'), 'node_modules/\n.env\n.env.*\ndist/\n.public-release/\ndata/raw/\ntmp/\noutput/\nreports/*.png\nreports/*.tmp\n*.log\n.DS_Store\n**/.runplatform.json\n');
await fs.writeFile(path.join(site, '.nojekyll'), '');
await fs.writeFile(path.join(repo, '.nojekyll'), '');
await fs.writeFile(path.join(root, 'dist/public-manifest.json'), JSON.stringify({ generatedAt: new Date().toISOString(), webFiles, sourceScripts: scriptFiles, excluded: ['data/raw', 'private research reports', 'local environment files', 'old git history', 'tmp', 'output'] }, null, 2));
console.log(`公开源码：${repo}\n静态网站：${site}`);
