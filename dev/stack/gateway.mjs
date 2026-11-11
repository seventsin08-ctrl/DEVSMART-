// Minimal API gateway for the local stack: mimics the Supabase URL layout
// (/auth/v1, /rest/v1, /storage/v1) in front of GoTrue, PostgREST and Storage.
import http from 'node:http';

const routes = {
  '/auth/v1': { port: Number(process.env.AUTH_PORT ?? 54331) },
  '/rest/v1': { port: Number(process.env.REST_PORT ?? 54332) },
  '/storage/v1': { port: Number(process.env.STORAGE_PORT ?? 54333) },
};
const port = Number(process.env.GATEWAY_PORT ?? 54321);

http
  .createServer((req, res) => {
    const origin = req.headers.origin ?? '*';
    const cors = {
      'access-control-allow-origin': origin,
      'access-control-allow-credentials': 'true',
      'access-control-allow-headers': req.headers['access-control-request-headers'] ?? '*',
      'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS,HEAD',
      'access-control-expose-headers': 'content-range, x-total-count',
    };
    if (req.method === 'OPTIONS') {
      res.writeHead(204, cors);
      return res.end();
    }
    const prefix = Object.keys(routes).find((p) => req.url.startsWith(p));
    if (!prefix) {
      res.writeHead(404, cors);
      return res.end('not found');
    }
    const headers = { ...req.headers, host: `127.0.0.1:${routes[prefix].port}` };
    // PostgREST / Storage authenticate with the Authorization header; fall back to the apikey.
    if (!headers.authorization && headers.apikey) headers.authorization = `Bearer ${headers.apikey}`;
    const upstream = http.request(
      { host: '127.0.0.1', port: routes[prefix].port, method: req.method, path: req.url.slice(prefix.length) || '/', headers },
      (up) => {
        const h = { ...up.headers };
        for (const k of Object.keys(h)) if (k.startsWith('access-control-')) delete h[k];
        res.writeHead(up.statusCode ?? 502, { ...h, ...cors });
        up.pipe(res);
      },
    );
    upstream.on('error', (e) => {
      res.writeHead(502, cors);
      res.end(String(e));
    });
    req.pipe(upstream);
  })
  .listen(port, '127.0.0.1', () => console.log(`gateway listening on http://127.0.0.1:${port}`));
