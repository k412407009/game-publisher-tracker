import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const config = JSON.parse(await fs.readFile(path.join(root, 'accounts.json'), 'utf8'));
const dataPath = path.join(root, 'data', 'google-play-watchlist.json');
const payload = JSON.parse(await fs.readFile(dataPath, 'utf8'));
const byKey = new Map(config.map(account => [`${account.company}\u0000${account.account}`, account]));
let updated = 0;

for (const account of payload.accounts) {
  const source = byKey.get(`${account.company}\u0000${account.account}`);
  if (!source) continue;
  account.sources = source.sources;
  account.note = source.note || '';
  account.relationship = source.relationship;
  account.relationshipLabel = source.relationshipLabel;
  updated += 1;
}

const json = `${JSON.stringify(payload, null, 2)}\n`;
await fs.writeFile(dataPath, json);
await fs.writeFile(path.join(root, 'data', 'google-play-watchlist.js'), `window.GAME_WATCHLIST = ${json.trim()};\n`);
console.log(`已同步 ${updated}/${payload.accounts.length} 个账号的来源与关系标签`);
