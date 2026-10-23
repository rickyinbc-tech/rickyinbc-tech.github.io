import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../_site');
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.avif': 'image/avif', '.svg': 'image/svg+xml', '.json': 'application/json', '.xml': 'application/xml' };
const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, 'http://localhost');
    let target = path.resolve(root, `.${decodeURIComponent(url.pathname)}`);
    if (!target.startsWith(`${root}${path.sep}`) && target !== root) throw new Error('Outside preview');
    if ((await stat(target)).isDirectory()) target = path.join(target, 'index.html');
    const bytes = await readFile(target);
    response.writeHead(200, { 'Content-Type': types[path.extname(target)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    response.end(bytes);
  } catch {
    response.writeHead(404, { 'Content-Type': 'text/plain' }); response.end('Not found');
  }
});
server.listen(Number(process.env.PORT || 4173), '127.0.0.1', () => console.log(`Photography preview: http://127.0.0.1:${server.address().port}`));
