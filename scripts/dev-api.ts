// Local runner for the Netlify functions (same code; /api/<file name> like the Netlify redirect) so the app can be
// developed and tested without the Netlify CLI. Production uses Netlify's own runtime.
import http from 'node:http';
import { readdirSync, existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = path.resolve(import.meta.dirname, '..');
for (const file of ['.env', '.env.local']) {
  const p = path.join(root, file);
  if (!existsSync(p)) continue;
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

type Fn = (req: Request, context: { ip: string }) => Promise<Response>;
const routes = new Map<string, Fn>();
const dir = path.join(root, 'netlify/functions');
for (const file of readdirSync(dir).filter((f) => f.endsWith('.ts'))) {
  const mod = await import(pathToFileURL(path.join(dir, file)).href);
  if (typeof mod.default === 'function') routes.set(`/api/${file.replace(/\.ts$/, '')}`, mod.default);
}

const port = Number(process.env.API_PORT ?? 8788);
http
  .createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', `http://${req.headers.host}`);
    const fn = routes.get(url.pathname);
    if (!fn) {
      res.writeHead(404, { 'content-type': 'application/json' });
      return res.end(JSON.stringify({ error: { code: 'NOT_FOUND', message: 'Not found.' } }));
    }
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') headers.set(k, v);
    const request = new Request(url, {
      method: req.method, headers,
      body: ['GET', 'HEAD'].includes(req.method ?? 'GET') ? undefined : Buffer.concat(chunks),
    });
    const ip = (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim() ?? req.socket.remoteAddress ?? 'unknown';
    const response = await fn(request, { ip });
    res.writeHead(response.status, Object.fromEntries(response.headers));
    res.end(Buffer.from(await response.arrayBuffer()));
  })
  .listen(port, '127.0.0.1', () => console.log(`api listening on http://127.0.0.1:${port} → ${[...routes.keys()].join(', ')}`));
