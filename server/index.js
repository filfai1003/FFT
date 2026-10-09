// The small server next to Supabase: it runs the database migrations at start and serves the two
// Edge Functions (`off`, `delete-account`) that Kong exposes at /functions/v1/<name>.
import { Buffer } from 'node:buffer';
import http from 'node:http';
import { migrate } from './migrate.js';

const handlers = {};
let loading = '';
// The functions are written for Deno; this is the little of Deno they use.
globalThis.Deno = {
  env: { get: (key) => process.env[key] },
  serve: (handler) => {
    handlers[loading] = handler;
  },
};
for (const name of ['off', 'delete-account']) {
  loading = name;
  await import(`./fn/${name}/index.ts`);
}

http
  .createServer(async (req, res) => {
    const path = new URL(req.url, 'http://x').pathname.replace(/\/+$/, '');
    if (path === '/health') return void res.writeHead(200).end('ok');
    const handler = handlers[path.split('/').pop() ?? ''];
    if (!handler) return void res.writeHead(404).end('not found');
    try {
      const chunks = [];
      for await (const c of req) chunks.push(c);
      const hasBody = !['GET', 'HEAD'].includes(req.method);
      const request = new Request(`http://localhost${req.url}`, {
        method: req.method,
        headers: req.headers,
        body: hasBody ? Buffer.concat(chunks) : undefined,
      });
      const response = await handler(request);
      res.writeHead(response.status, Object.fromEntries(response.headers));
      res.end(Buffer.from(await response.arrayBuffer()));
    } catch (e) {
      console.error(e);
      res.writeHead(500).end('error');
    }
  })
  .listen(Number(process.env.PORT ?? 3000), '::', () => console.log('functions listening'));

migrate('./migrations').catch((e) => {
  console.error(e);
  process.exit(1);
});
