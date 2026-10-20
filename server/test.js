'use strict';
// Quick checks of the model engine and the HTTP API. Run: npm test
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs'); const os = require('node:os'); const path = require('node:path');
const M = require('../public/model.js');
const { seedDashboards } = require('./seeds');

// ---- engine ----
for (const d of seedDashboards()) {
  const R = M.compute(d.state);
  assert.equal(R.N, 5); assert.equal(R.revenue.length, 5); assert.equal(R.monthly.length, 60);
  assert.ok(R.revenue.every(x => x >= 0)); assert.ok(M.insights(R, d.state).length >= 3);
  assert.ok(M.verdict(R, d.state).h.length > 5);
}
// legacy v1 state (the original single-page file) upgrades cleanly
const legacy = M.normalize({ plans: [{ id: 'p1', name: 'Sub', price: 19, unit: 'month', cost: 7 }], segments: [{ id: 'c1', name: 'Users', plan: 'p1', per: 1, from: 2027, vol: [10, 20, 30, 40, 50] }], costs: { opex: [30000, 30000, 30000, 30000, 30000], cert: [0, 0, 0, 0, 0], funding: [1200000, 0, 0, 0, 0], opening: 0 } });
assert.equal(legacy.costs.length, 2); assert.equal(legacy.funding.length, 1); assert.equal(legacy.funding[0].amount, 1200000);
const RL = M.compute(legacy); assert.equal(Math.round(RL.revenue[0]), 10 * 19 * 12);
// payment delay shifts cash, not revenue
const s2 = M.blank(2027); s2.plans[0].delay = 3; s2.segments.push({ id: 'c', name: 'A', plan: s2.plans[0].id, per: 1, from: 2027, vol: [100, 100, 100, 100, 100] }); s2.costs = []; s2.opening.cash = 0;
const R2 = M.compute(s2); assert.equal(Math.round(R2.revenue[0]), 100 * 19 * 12); assert.ok(R2.cashEnd[0] < R2.gp[0]); assert.ok(R2.receivablesEnd > 0);
// tax with loss carry-forward: no tax while cumulative losses remain
const s3 = M.blank(2027); s3.segments.push({ id: 'c', name: 'A', plan: s3.plans[0].id, per: 1, from: 2027, vol: [0, 0, 0, 2000, 2000] }); s3.costs = [{ id: 'k', name: 'x', category: 'Other', type: 'year', values: [100000, 100000, 100000, 0, 0], salary: 0 }];
const R3 = M.compute(s3); assert.equal(R3.tax[0], 0); assert.equal(R3.tax[1], 0); assert.ok(R3.tax[4] > 0);
// years resize
const s4 = M.blank(2027); s4.years.count = 7; M.normalize(s4); assert.equal(s4.costs[0].values.length, 7);
console.log('engine ok');

// ---- api ----
(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'axite-test-')); const port = 3900 + Math.floor(Math.random() * 100);
  const srv = spawn(process.execPath, ['--no-warnings=ExperimentalWarning', path.join(__dirname, 'server.js')], { env: { ...process.env, PORT: String(port), DATA_DIR: dir, APP_PASSWORD: 'secret-pass', SESSION_SECRET: 'test-secret', NODE_ENV: 'test' }, stdio: ['ignore', 'pipe', 'inherit'] });
  await new Promise(r => srv.stdout.on('data', d => { if (String(d).includes('listening')) r(); }));
  const base = `http://localhost:${port}`; let cookie = '';
  const f = (p, o = {}) => fetch(base + p, { ...o, headers: { 'Content-Type': 'application/json', cookie, ...(o.headers || {}) }, redirect: 'manual' });
  try {
    assert.equal((await f('/')).status, 302);
    assert.equal((await f('/api/dashboards')).status, 401);
    assert.equal((await f('/login', { method: 'POST', body: JSON.stringify({ password: 'nope' }) })).status, 401);
    const li = await f('/login', { method: 'POST', body: JSON.stringify({ password: 'secret-pass' }) }); assert.equal(li.status, 200);
    cookie = li.headers.get('set-cookie').split(';')[0]; assert.ok(cookie.startsWith('sid='));
    assert.equal((await f('/')).status, 200);
    const list = await (await f('/api/dashboards')).json(); assert.equal(list.dashboards.length, seedDashboards().length);
    const d = list.dashboards[0];
    // save with correct rev, then stale rev -> conflict
    const st = M.normalize(d.state); st.opening.cash = 12345;
    const ok = await f(`/api/dashboards/${d.id}`, { method: 'PUT', body: JSON.stringify({ state: st, rev: d.rev }) }); assert.equal(ok.status, 200);
    const stale = await f(`/api/dashboards/${d.id}`, { method: 'PUT', body: JSON.stringify({ state: st, rev: d.rev }) }); assert.equal(stale.status, 409);
    const got = await (await f(`/api/dashboards/${d.id}`)).json(); assert.equal(got.dashboard.state.opening.cash, 12345); assert.equal(got.dashboard.rev, d.rev + 1);
    // invalid state rejected
    assert.equal((await f(`/api/dashboards/${d.id}`, { method: 'PUT', body: JSON.stringify({ state: { nope: 1 } }) })).status, 400);
    // snapshots: origin + auto exist; restore origin brings cash back to 0
    const snaps = (await (await f(`/api/dashboards/${d.id}/snapshots`)).json()).snapshots; assert.ok(snaps.some(s => s.kind === 'origin')); assert.ok(snaps.some(s => s.kind === 'auto'));
    const origin = snaps.find(s => s.kind === 'origin');
    const rs = await (await f(`/api/dashboards/${d.id}/snapshots/${origin.id}/restore`, { method: 'POST' })).json(); assert.equal(rs.dashboard.state.opening.cash, 0);
    // duplicate, archive, reorder, delete
    const dup = await (await f('/api/dashboards', { method: 'POST', body: JSON.stringify({ copyOf: d.id, name: 'Copy' }) })).json(); assert.equal(dup.dashboard.name, 'Copy');
    assert.equal((await f(`/api/dashboards/${dup.dashboard.id}`, { method: 'PATCH', body: JSON.stringify({ archived: true }) })).status, 200);
    assert.equal((await f('/api/dashboards/reorder', { method: 'POST', body: JSON.stringify({ ids: [dup.dashboard.id, d.id] }) })).status, 200);
    assert.equal((await f(`/api/dashboards/${dup.dashboard.id}`, { method: 'DELETE' })).status, 200);
    assert.equal((await f(`/api/dashboards/${dup.dashboard.id}`)).status, 404);
    // logout kills the session
    await f('/logout', { method: 'POST' }); cookie = ''; assert.equal((await f('/api/dashboards')).status, 401);
    console.log('api ok');
  } finally { srv.kill(); fs.rmSync(dir, { recursive: true, force: true }); }
})().catch(e => { console.error(e); process.exit(1); });
