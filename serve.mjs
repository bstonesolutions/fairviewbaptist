// Tiny static preview server for the Fairview Baptist Temple site.
// Run from anywhere:  node serve.mjs   (then open http://localhost:4332)
// This is a local dev convenience only. For production, deploy the folder to any
// static host (Netlify, Vercel, Cloudflare Pages, GitHub Pages); no server needed.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 4332;
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.webp': 'image/webp',
  '.json': 'application/json',
};

http.createServer((req, res) => {
  let urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
  // Serve index.html for directory requests, such as the site root.
  if (urlPath.endsWith('/')) urlPath += 'index.html';
  // Clean URLs, matching vercel.json ("/visit" -> visit.html). Fall back to a
  // directory index for extensionless paths that match a real folder.
  else if (!path.extname(urlPath)) {
    const asHtml = urlPath + '.html';
    if (fs.existsSync(path.join(ROOT, asHtml))) urlPath = asHtml;
    else urlPath += '/index.html';
  }
  const filePath = path.normalize(path.join(ROOT, urlPath));
  if (!filePath.startsWith(ROOT)) { res.writeHead(403); res.end('Forbidden'); return; }
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end('<h1>404</h1><p>' + urlPath + ' not found</p>');
      return;
    }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream' });
    res.end(data);
  });
}).listen(PORT, () => console.log('Fairview Baptist Temple preview on http://localhost:' + PORT));
