'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const db = require('./db');
const { seedDashboards } = require('./seeds');

const PORT = Number(process.env.PORT || 3000);
const APP_PASSWORD = process.env.APP_PASSWORD || '';
const SESSION_SECRET = process.env.SESSION_SECRET || '';
const SESSION_DAYS = Number(process.env.SESSION_DAYS || 30);
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const PROD = process.env.NODE_ENV === 'production';

if (!APP_PASSWORD) { console.error('APP_PASSWORD is not set. Refusing to start without a password.'); process.exit(1); }
if (!SESSION_SECRET) { console.error('SESSION_SECRET is not set. Set a long random string.'); process.exit(1); }
if (APP_PASSWORD.length < 8) console.warn('Warning: APP_PASSWORD is shorter than 8 characters.');

// ---------- seed starting dashboards ----------
// Each seed is created once, the first time a server with it starts. Existing dashboards are never touched,
// and a seed the user deleted does not come back.
{
  const legacy = db.metaGet('seeded'); // servers seeded before per-seed keys existed hold the first three
  const seeds = seedDashboards();
  let added = 0;
  seeds.forEach((d, i) => {
    const key = 'seeded:' + d.name;
    if (db.metaGet(key)) return;
    if (legacy && i < 3) { db.metaSet(key, legacy); return; }
    db.createDashboard(d); db.metaSet(key, new Date().toISOString()); added++;
  });
  if (!legacy) db.metaSet('seeded', new Date().toISOString());
  if (added) console.log(`Seeded ${added} starting dashboard${added === 1 ? '' : 's'}.`);
}

// ---------- auth helpers ----------
const b64 = s => Buffer.from(s).toString('base64url');
const sign = s => crypto.createHmac('sha256', SESSION_SECRET).update(s).digest('base64url');
function makeToken() { const exp = Date.now() + SESSION_DAYS * 86400e3; const body = b64(JSON.stringify({ exp, n: crypto.randomBytes(8).toString('hex') })); return body + '.' + sign(body); }
function validToken(t) {
  if (!t || typeof t !== 'string') return false;
  const i = t.lastIndexOf('.'); if (i < 0) return false;
  const body = t.slice(0, i), sig = t.slice(i + 1);
  const good = sign(body);
  if (sig.length !== good.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(good))) return false;
  try { const o = JSON.parse(Buffer.from(body, 'base64url').toString()); return o.exp > Date.now(); } catch { return false; }
}
function passwordOk(p) {
  const a = crypto.createHash('sha256').update(String(p || '')).digest();
  const b = crypto.createHash('sha256').update(APP_PASSWORD).digest();
  return crypto.timingSafeEqual(a, b);
}
function cookies(req) { const o = {}; (req.headers.cookie || '').split(';').forEach(p => { const i = p.indexOf('='); if (i > 0) o[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim()); }); return o; }
const attempts = new Map(); // ip -> {n, until}
function ipOf(req) { return (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress || '?'; }
function throttled(ip) { const a = attempts.get(ip); return a && a.until > Date.now(); }
function failed(ip) { const a = attempts.get(ip) || { n: 0, until: 0 }; a.n++; if (a.n >= 5) { a.until = Date.now() + 15 * 60e3; a.n = 0; } attempts.set(ip, a); }

// ---------- http helpers ----------
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json' };
function send(res, code, body, headers = {}) {
  const h = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin', 'X-Frame-Options': 'DENY', ...headers };
  res.writeHead(code, h); res.end(body);
}
const json = (res, code, obj) => send(res, code, JSON.stringify(obj), { 'Content-Type': 'application/json; charset=utf-8' });
function file(res, rel, code = 200) {
  const p = path.join(PUBLIC_DIR, rel);
  if (!p.startsWith(PUBLIC_DIR)) return send(res, 404, 'Not found');
  fs.readFile(p, (err, data) => {
    if (err) return send(res, 404, 'Not found');
    const ext = path.extname(p);
    const cache = ext === '.html' ? 'no-store' : 'public, max-age=300';
    send(res, code, data, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': cache });
  });
}
function readBody(req, limit = 4 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', c => { size += c.length; if (size > limit) { reject(new Error('too_large')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => { try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : {}); } catch { reject(new Error('bad_json')); } });
    req.on('error', reject);
  });
}
function validState(s) {
  return s && typeof s === 'object' && Array.isArray(s.plans) && Array.isArray(s.segments) && Array.isArray(s.costs) && Array.isArray(s.funding) && s.years && typeof s.years.start === 'number';
}
const cookieOpts = () => `Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}${PROD ? '; Secure' : ''}`;

// ---------- router ----------
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const p = url.pathname;
  const method = req.method;
  try {
    if (p === '/healthz') return send(res, 200, 'ok');
    if (p === '/favicon.ico') return file(res, 'icon.svg');
    // public assets
    if (p.startsWith('/static/')) return file(res, p.slice('/static/'.length));

    const authed = validToken(cookies(req).sid);

    if (p === '/login') {
      if (method === 'GET') return authed ? send(res, 302, '', { Location: '/' }) : file(res, 'login.html');
      if (method === 'POST') {
        const ip = ipOf(req);
        if (throttled(ip)) return json(res, 429, { error: 'Too many attempts. Try again in 15 minutes.' });
        const body = await readBody(req, 4096);
        if (passwordOk(body.password)) { attempts.delete(ip); return send(res, 200, JSON.stringify({ ok: true }), { 'Content-Type': 'application/json', 'Set-Cookie': `sid=${makeToken()}; ${cookieOpts()}` }); }
        failed(ip); return json(res, 401, { error: 'Wrong password.' });
      }
    }
    if (p === '/logout' && method === 'POST') return send(res, 200, '{"ok":true}', { 'Content-Type': 'application/json', 'Set-Cookie': `sid=; Path=/; HttpOnly; Max-Age=0` });

    if (!authed) {
      if (p.startsWith('/api/')) return json(res, 401, { error: 'unauthorized' });
      return send(res, 302, '', { Location: '/login' });
    }

    // ---- pages ----
    if (p === '/' && method === 'GET') return file(res, 'index.html');
    if (/^\/d\/[A-Za-z0-9]+$/.test(p) && method === 'GET') return file(res, 'dashboard.html');

    // ---- api ----
    if (p === '/api/dashboards' && method === 'GET') return json(res, 200, { dashboards: db.listDashboards() });
    if (p === '/api/dashboards' && method === 'POST') {
      const b = await readBody(req);
      let state = b.state;
      if (b.copyOf) { const src = db.getDashboard(b.copyOf); if (!src) return json(res, 404, { error: 'not_found' }); state = src.state; }
      if (!validState(state)) return json(res, 400, { error: 'invalid_state' });
      const d = db.createDashboard({ name: String(b.name || 'New dashboard').slice(0, 120), route: String(b.route || '').slice(0, 60), description: String(b.description || '').slice(0, 2000), state });
      return json(res, 201, { dashboard: d });
    }
    if (p === '/api/dashboards/reorder' && method === 'POST') { const b = await readBody(req); if (!Array.isArray(b.ids)) return json(res, 400, { error: 'ids' }); db.reorder(b.ids.map(String)); return json(res, 200, { ok: true }); }

    let m = p.match(/^\/api\/dashboards\/([A-Za-z0-9]+)$/);
    if (m) {
      const id = m[1];
      if (method === 'GET') { const d = db.getDashboard(id); return d ? json(res, 200, { dashboard: d }) : json(res, 404, { error: 'not_found' }); }
      if (method === 'PUT') {
        const b = await readBody(req);
        if (!validState(b.state)) return json(res, 400, { error: 'invalid_state' });
        const r = db.saveDashboard(id, { name: b.name !== undefined ? String(b.name).slice(0, 120) : undefined, route: b.route !== undefined ? String(b.route).slice(0, 60) : undefined, description: b.description !== undefined ? String(b.description).slice(0, 2000) : undefined, state: b.state, rev: typeof b.rev === 'number' ? b.rev : undefined });
        if (r.error === 'not_found') return json(res, 404, r);
        if (r.error === 'conflict') return json(res, 409, { error: 'conflict', dashboard: r.current });
        return json(res, 200, r);
      }
      if (method === 'PATCH') {
        const b = await readBody(req);
        if (b.archived !== undefined) db.setArchived(id, !!b.archived);
        const d = db.updateMeta(id, { name: b.name !== undefined ? String(b.name).slice(0, 120) : undefined, route: b.route !== undefined ? String(b.route).slice(0, 60) : undefined, description: b.description !== undefined ? String(b.description).slice(0, 2000) : undefined });
        return d ? json(res, 200, { dashboard: d }) : json(res, 404, { error: 'not_found' });
      }
      if (method === 'DELETE') { db.deleteDashboard(id); return json(res, 200, { ok: true }); }
    }
    m = p.match(/^\/api\/dashboards\/([A-Za-z0-9]+)\/snapshots$/);
    if (m) {
      if (method === 'GET') return json(res, 200, { snapshots: db.listSnapshots(m[1]) });
      if (method === 'POST') { const b = await readBody(req, 4096); const s = db.createSnapshot(m[1], String(b.label || '').slice(0, 120)); return s ? json(res, 201, s) : json(res, 404, { error: 'not_found' }); }
    }
    m = p.match(/^\/api\/dashboards\/([A-Za-z0-9]+)\/snapshots\/([A-Za-z0-9]+)$/);
    if (m) {
      if (method === 'GET') { const s = db.getSnapshot(m[1], m[2]); return s ? json(res, 200, { snapshot: s }) : json(res, 404, { error: 'not_found' }); }
      if (method === 'DELETE') { db.deleteSnapshot(m[1], m[2]); return json(res, 200, { ok: true }); }
    }
    m = p.match(/^\/api\/dashboards\/([A-Za-z0-9]+)\/snapshots\/([A-Za-z0-9]+)\/restore$/);
    if (m && method === 'POST') {
      const s = db.getSnapshot(m[1], m[2]); if (!s) return json(res, 404, { error: 'not_found' });
      db.createSnapshot(m[1], 'Before restore', 'manual');
      const cur = db.getDashboard(m[1]);
      const r = db.saveDashboard(m[1], { state: s.state, rev: cur.rev });
      return json(res, 200, r);
    }
    if (p.startsWith('/api/')) return json(res, 404, { error: 'not_found' });
    return send(res, 404, 'Not found');
  } catch (e) {
    if (e.message === 'too_large') return json(res, 413, { error: 'too_large' });
    if (e.message === 'bad_json') return json(res, 400, { error: 'bad_json' });
    console.error(e);
    return json(res, 500, { error: 'server_error' });
  }
});

server.listen(PORT, () => console.log(`Axite business models listening on :${PORT} (db: ${db.DB_PATH})`));
