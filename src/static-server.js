import { createServer, request as httpRequest } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIST = join(__dirname, '..', 'dist');
const API_TARGET = 'http://localhost:3000';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png':  'image/png',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon',
};

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');

  // Proxy /api/* to backend
  if (url.pathname.startsWith('/api/')) {
    const targetUrl = new URL(url.pathname + url.search, API_TARGET);
    const proxyReq = httpRequest(targetUrl, {
      method: req.method,
      headers: { ...req.headers, host: targetUrl.host },
    }, (proxyRes) => {
      res.writeHead(proxyRes.statusCode, proxyRes.headers);
      proxyRes.pipe(res);
    });
    proxyReq.on('error', () => {
      res.writeHead(502);
      res.end('Backend unavailable');
    });
    req.pipe(proxyReq);
    return;
  }

  // Static files from dist/
  let filePath = join(DIST, url.pathname === '/' ? 'index.html' : url.pathname);
  try {
    const content = await readFile(filePath);
    const ext = extname(filePath);
    res.writeHead(200, { 'content-type': MIME[ext] || 'application/octet-stream' });
    res.end(content);
  } catch {
    try {
      const html = await readFile(join(DIST, 'index.html'));
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(html);
    } catch {
      res.writeHead(404);
      res.end('Not found');
    }
  }
});

const port = Number(process.env.STATIC_PORT ?? 5174);
server.listen(port, () => {
  console.log(`Admin panel (static + proxy) → http://localhost:${port}`);
  console.log(`API proxied to → ${API_TARGET}`);
});
