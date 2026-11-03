// Eenvoudige lokale server om de pagina te bekijken.
// Gebruik: node tools/serve.js  →  http://localhost:8080/?mock
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.env.PORT) || 8080;
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.jpg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml'
};

http.createServer((req, res) => {
  const pad = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const bestand = path.join(ROOT, pad.endsWith('/') ? pad + 'index.html' : pad);
  if (!bestand.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
  fs.readFile(bestand, (err, data) => {
    if (err) { res.writeHead(404); return res.end('Niet gevonden'); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(bestand)] || 'application/octet-stream' });
    res.end(data);
  });
}).listen(PORT, () => console.log(`Winterfair draait op http://localhost:${PORT}/?mock`));
