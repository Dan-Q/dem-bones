import http from 'node:http';
import https from 'node:https';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import QRCode from 'qrcode';

const PORT = Number(process.env.PORT) || 7080;
const PUBLIC_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'public');
const PUBLIC_URL = process.env.PUBLIC_URL || '';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'text/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.svg':  'image/svg+xml',
  '.png':  'image/png',
  '.mp3':  'audio/mpeg',
};

async function handleRequest(req, res) {
  const url = new URL(req.url, 'http://localhost');

  if (url.pathname === '/qr') {
    const text = url.searchParams.get('text') || '';
    const svg = await QRCode.toString(text, { type: 'svg', margin: 1 });
    res.writeHead(200, { 'Content-Type': MIME['.svg'] });
    res.end(svg);
    return;
  }

  const filePath = path.join(PUBLIC_DIR, url.pathname === '/' ? 'index.html' : url.pathname);
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403).end();
    return;
  }
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404).end('Not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream' });
    res.end(data);
  });
}

const server = http.createServer(handleRequest);

// rooms: key -> { desktops: Set<WebSocket>, mobiles: Set<WebSocket> }
const rooms = new Map();

function room(key) {
  if (!rooms.has(key)) rooms.set(key, { desktops: new Set(), mobiles: new Set() });
  return rooms.get(key);
}

function send(ws, msg) {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
}

function notifyDesktops(key) {
  const r = rooms.get(key);
  if (!r) return;
  for (const d of r.desktops) send(d, { type: 'status', mobiles: r.mobiles.size });
}

const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', (ws) => {
  let key = null;
  let role = null;

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }

    if (msg.type === 'join' && !key && typeof msg.key === 'string' && /^[A-Za-z0-9]{4,64}$/.test(msg.key)) {
      if (msg.role !== 'desktop' && msg.role !== 'mobile') return;
      key = msg.key;
      role = msg.role;
      room(key)[role === 'desktop' ? 'desktops' : 'mobiles'].add(ws);
      notifyDesktops(key);
      return;
    }

    // Relay orientation updates and button presses from a phone to desktop
    if (role === 'mobile' && ['tilt', 'calibrated', 'strings', 'bgcolor'].includes(msg.type)) {
      for (const d of room(key).desktops) send(d, msg);
    }
  });

  ws.on('close', () => {
    if (!key) return;
    const r = rooms.get(key);
    r[role === 'desktop' ? 'desktops' : 'mobiles'].delete(ws);
    if (r.desktops.size === 0 && r.mobiles.size === 0) rooms.delete(key);
    else notifyDesktops(key);
  });
});

// Only accept local connections: in production Caddy proxies to us from the same machine.
server.listen(PORT, '127.0.0.1', () => {
  console.log(`Running at http://localhost:${PORT}`);
});
