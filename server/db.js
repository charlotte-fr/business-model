'use strict';
const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
const path = require('node:path');

const DATA_DIR = process.env.DATA_DIR || process.env.RAILWAY_VOLUME_MOUNT_PATH || path.join(__dirname, '..', 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });
const DB_PATH = path.join(DATA_DIR, 'dashboards.db');

const db = new DatabaseSync(DB_PATH);
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;
  CREATE TABLE IF NOT EXISTS dashboards (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    route TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT '',
    state TEXT NOT NULL,
    rev INTEGER NOT NULL DEFAULT 1,
    position INTEGER NOT NULL DEFAULT 0,
    archived INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS snapshots (
    id TEXT PRIMARY KEY,
    dashboard_id TEXT NOT NULL REFERENCES dashboards(id) ON DELETE CASCADE,
    label TEXT NOT NULL DEFAULT '',
    kind TEXT NOT NULL DEFAULT 'auto',
    state TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS snapshots_dash ON snapshots(dashboard_id, created_at);
  CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
`);

const now = () => new Date().toISOString();
const uid = (p = '') => p + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

const q = {
  list: db.prepare(`SELECT id, name, route, description, state, rev, position, archived, created_at, updated_at FROM dashboards ORDER BY archived, position, created_at`),
  get: db.prepare(`SELECT * FROM dashboards WHERE id = ?`),
  insert: db.prepare(`INSERT INTO dashboards (id, name, route, description, state, rev, position, archived, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, ?, 0, ?, ?)`),
  update: db.prepare(`UPDATE dashboards SET name = ?, route = ?, description = ?, state = ?, rev = rev + 1, updated_at = ? WHERE id = ? AND rev = ?`),
  updateMeta: db.prepare(`UPDATE dashboards SET name = ?, route = ?, description = ?, updated_at = ? WHERE id = ?`),
  setArchived: db.prepare(`UPDATE dashboards SET archived = ?, updated_at = ? WHERE id = ?`),
  setPosition: db.prepare(`UPDATE dashboards SET position = ? WHERE id = ?`),
  del: db.prepare(`DELETE FROM dashboards WHERE id = ?`),
  maxPos: db.prepare(`SELECT COALESCE(MAX(position), -1) AS m FROM dashboards`),
  snapList: db.prepare(`SELECT id, label, kind, created_at, length(state) AS size FROM snapshots WHERE dashboard_id = ? ORDER BY created_at DESC LIMIT 200`),
  snapGet: db.prepare(`SELECT * FROM snapshots WHERE id = ? AND dashboard_id = ?`),
  snapLast: db.prepare(`SELECT created_at FROM snapshots WHERE dashboard_id = ? AND kind = 'auto' ORDER BY created_at DESC LIMIT 1`),
  snapInsert: db.prepare(`INSERT INTO snapshots (id, dashboard_id, label, kind, state, created_at) VALUES (?, ?, ?, ?, ?, ?)`),
  snapPrune: db.prepare(`DELETE FROM snapshots WHERE dashboard_id = ? AND kind = 'auto' AND id NOT IN (SELECT id FROM snapshots WHERE dashboard_id = ? AND kind = 'auto' ORDER BY created_at DESC LIMIT 150)`),
  snapDel: db.prepare(`DELETE FROM snapshots WHERE id = ? AND dashboard_id = ?`),
  metaGet: db.prepare(`SELECT value FROM meta WHERE key = ?`),
  metaSet: db.prepare(`INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`),
};

function rowToDash(r, withState = true) {
  const o = { id: r.id, name: r.name, route: r.route, description: r.description, rev: r.rev, position: r.position, archived: !!r.archived, createdAt: r.created_at, updatedAt: r.updated_at };
  if (withState) o.state = JSON.parse(r.state);
  return o;
}

module.exports = {
  DB_PATH,
  uid,
  listDashboards() { return q.list.all().map(r => rowToDash(r, true)); },
  getDashboard(id) { const r = q.get.get(id); return r ? rowToDash(r) : null; },
  createDashboard({ name, route = '', description = '', state }) {
    const id = uid('d');
    const t = now();
    const pos = q.maxPos.get().m + 1;
    q.insert.run(id, name, route, description, JSON.stringify(state), pos, t, t);
    q.snapInsert.run(uid('s'), id, 'Starting numbers', 'origin', JSON.stringify(state), t);
    return this.getDashboard(id);
  },
  // Optimistic concurrency: returns null when rev does not match.
  saveDashboard(id, { name, route, description, state, rev }) {
    const cur = q.get.get(id);
    if (!cur) return { error: 'not_found' };
    if (rev !== undefined && rev !== cur.rev) return { error: 'conflict', current: rowToDash(cur) };
    const t = now();
    // auto snapshot: at most one every 20 minutes
    const last = q.snapLast.get(id);
    if (!last || (Date.now() - Date.parse(last.created_at)) > 20 * 60 * 1000) {
      q.snapInsert.run(uid('s'), id, '', 'auto', cur.state, t);
      q.snapPrune.run(id, id);
    }
    q.update.run(name ?? cur.name, route ?? cur.route, description ?? cur.description, JSON.stringify(state), t, id, cur.rev);
    return { dashboard: this.getDashboard(id) };
  },
  updateMeta(id, { name, route, description }) {
    const cur = q.get.get(id); if (!cur) return null;
    q.updateMeta.run(name ?? cur.name, route ?? cur.route, description ?? cur.description, now(), id);
    return this.getDashboard(id);
  },
  setArchived(id, v) { q.setArchived.run(v ? 1 : 0, now(), id); return this.getDashboard(id); },
  reorder(ids) { ids.forEach((id, i) => q.setPosition.run(i, id)); },
  deleteDashboard(id) { q.del.run(id); },
  listSnapshots(id) { return q.snapList.all(id).map(r => ({ id: r.id, label: r.label, kind: r.kind, createdAt: r.created_at, size: r.size })); },
  getSnapshot(dashId, snapId) { const r = q.snapGet.get(snapId, dashId); return r ? { id: r.id, label: r.label, kind: r.kind, createdAt: r.created_at, state: JSON.parse(r.state) } : null; },
  createSnapshot(dashId, label, kind = 'manual') {
    const cur = q.get.get(dashId); if (!cur) return null;
    const id = uid('s'); q.snapInsert.run(id, dashId, label || '', kind, cur.state, now());
    return { id };
  },
  deleteSnapshot(dashId, snapId) { q.snapDel.run(snapId, dashId); },
  metaGet(k) { const r = q.metaGet.get(k); return r ? r.value : null; },
  metaSet(k, v) { q.metaSet.run(k, String(v)); },
};
