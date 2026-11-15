import {createServer} from 'node:http';
import {createReadStream} from 'node:fs';
import {stat} from 'node:fs/promises';
import {extname, resolve, sep} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = resolve(fileURLToPath(new URL('../dist', import.meta.url)));
const types = {'.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp'};

export function createAppServer() {
  return createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
      const file = resolve(root, `.${pathname === '/' ? '/index.html' : pathname}`);
      if (!file.startsWith(root + sep) || !['GET', 'HEAD'].includes(request.method)) {
        response.writeHead(403).end('Forbidden');
        return;
      }
      const metadata = await stat(file);
      if (!metadata.isFile()) throw new Error('File not found');
      response.writeHead(200, {'content-type': types[extname(file)] ?? 'application/octet-stream', 'content-length': metadata.size,
        'cache-control': 'no-cache'});
      if (request.method === 'HEAD') response.end();
      else createReadStream(file).pipe(response);
    } catch {
      response.writeHead(404).end('File not found');
    }
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.argv[2] ?? 4173);
  createAppServer().listen(port, '127.0.0.1', () => console.log(`ARES Navigator: http://127.0.0.1:${port}`));
}
