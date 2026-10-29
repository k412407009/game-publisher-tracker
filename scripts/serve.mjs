import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(process.env.SITE_DIR || '.');
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.md': 'text/plain; charset=utf-8' };
const server = http.createServer(async (req, res) => {
  try {
    const requested = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const file = path.resolve(root, `.${requested.endsWith('/') ? `${requested}index.html` : requested}`);
    if (!file.startsWith(`${root}${path.sep}`)) { res.writeHead(403).end(); return; }
    const data = await fs.readFile(file);
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(data);
  } catch { res.writeHead(404).end('Not found'); }
});
server.listen(Number(process.env.PORT || 4173), '127.0.0.1', () => console.log(`预览：http://127.0.0.1:${server.address().port}`));
