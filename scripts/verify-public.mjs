import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../dist/', import.meta.url));
const findings = [];
let files = 0;
const patterns = [
  /(?:^|[\s"'])gh[pousr]_[A-Za-z0-9]{24,}/m,
  /(?:^|[\s"'])sk-[A-Za-z0-9_-]{24,}/m,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /\/Users\/[A-Za-z0-9_-]+\//,
  /(?:garena\.com|ingarena\.net)/i
];
async function scan(folder) {
  for (const entry of await fs.readdir(folder, { withFileTypes: true })) {
    const full = path.join(folder, entry.name);
    if (entry.isSymbolicLink()) { findings.push(`${full}: symbolic link`); continue; }
    if (entry.isDirectory()) { await scan(full); continue; }
    files++;
    if (entry.name.startsWith('.env') || full.includes('/data/raw/')) findings.push(`${full}: excluded file`);
    if (/\.(?:json|js|mjs|html|md|css|yml|yaml)$/.test(entry.name) && entry.name !== 'verify-public.mjs') {
      const body = await fs.readFile(full, 'utf8');
      if (patterns.some(pattern => pattern.test(body))) findings.push(`${full}: sensitive-pattern match (value withheld)`);
    }
  }
}
for (const name of ['public-repo', 'site']) await scan(path.join(root, name));
console.log(JSON.stringify({ files, findings }, null, 2));
if (findings.length) process.exitCode = 1;
