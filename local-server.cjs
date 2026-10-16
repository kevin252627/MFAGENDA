const http = require('http');
const fs = require('fs');
const path = require('path');
const proxyTarget = { hostname: '127.0.0.1', port: 3000 };

const root = path.join(__dirname, 'dist');
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml' };

http.createServer((req, res) => {
  if ((req.url || '/').startsWith('/api')) {
    const proxyReq = http.request({ ...proxyTarget, path: req.url, method: req.method, headers: req.headers }, proxyRes => {
      res.writeHead(proxyRes.statusCode || 502, proxyRes.headers);
      proxyRes.pipe(res);
    });
    proxyReq.on('error', () => {
      if (!res.headersSent) res.writeHead(503, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: 'Servidor de autenticação indisponível. Inicie o backend na porta 3000.' }));
    });
    req.pipe(proxyReq);
    return;
  }
  const requested = decodeURIComponent((req.url || '/').split('?')[0]);
  const file = path.resolve(root, requested === '/' ? 'index.html' : `.${requested}`);
  if (!file.startsWith(root) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    res.writeHead(404); res.end('Arquivo não encontrado'); return;
  }
  res.writeHead(200, { 'Content-Type': mime[path.extname(file).toLowerCase()] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
}).listen(4173, '127.0.0.1', () => console.log('MFAGENDA disponível em http://localhost:4173'));
