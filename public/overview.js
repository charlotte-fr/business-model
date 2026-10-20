(function () {
  'use strict';
  const M = window.Model;
  const $ = s => document.querySelector(s);
  let dashboards = [];
  const notice = (t) => { const n = $('#notice'); n.textContent = t; n.classList.toggle('show', !!t); };
  async function api(url, opts = {}) {
    const r = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...opts });
    if (r.status === 401) { location.href = '/login'; throw new Error('unauthorized'); }
    if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(j.error || r.statusText); }
    return r.json();
  }
  const when = iso => { const d = new Date(iso); const diff = (Date.now() - d) / 1000; if (diff < 60) return 'just now'; if (diff < 3600) return Math.round(diff / 60) + ' min ago'; if (diff < 86400) return Math.round(diff / 3600) + ' h ago'; return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }); };

  function spark(R) {
    const W = 260, H = 48, vals = R.monthly.map(p => p.c); const max = Math.max(...vals, 0), min = Math.min(...vals, 0), span = (max - min) || 1;
    const x = i => (W * i) / (vals.length - 1), y = c => 2 + (H - 4) * (max - c) / span;
    let d = ''; vals.forEach((c, i) => { d += (i ? 'L' : 'M') + x(i).toFixed(1) + ',' + y(c).toFixed(1); });
    const z = y(0);
    return `<svg class="spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" width="100%" height="48" aria-hidden="true"><line x1="0" x2="${W}" y1="${z}" y2="${z}" stroke="var(--line)" stroke-dasharray="3 4"/><path d="${d}L${W},${z}L0,${z}Z" fill="var(--mint)" opacity=".25"/><path d="${d}" fill="none" stroke="${R.low.c < 0 ? 'var(--bad)' : 'var(--brand-2)'}" stroke-width="2"/></svg>`;
  }
  function card(d) {
    const S = M.normalize(JSON.parse(JSON.stringify(d.state))); const R = M.compute(S); const L = R.N - 1;
    const vd = M.verdict(R, S);
    return `<article class="dcard${d.archived ? ' archived' : ''}" data-dnd="dashboards" data-id="${d.id}">
      <div class="row"><div style="display:flex;gap:6px;align-items:center;min-width:0">${DnD.handle()}<span class="badge">${M.esc(d.route || 'Model')}</span></div>
        <div class="btns"><button class="btn sm" data-act="dup" type="button">Duplicate</button><button class="btn sm" data-act="rename" type="button">Rename</button>${d.archived ? `<button class="btn sm" data-act="unarchive" type="button">Restore</button><button class="btn sm danger" data-act="delete" type="button">Delete</button>` : `<button class="btn sm" data-act="archive" type="button">Archive</button>`}</div></div>
      <h2><a href="/d/${d.id}">${M.esc(d.name)}</a></h2>
      <p class="desc">${M.esc(d.description || '')}</p>
      <p class="desc" style="color:var(--ink);font-weight:700">${M.esc(vd.h)}</p>
      ${spark(R)}
      <div class="mini">
        <div>Revenue ${R.Y[L]}<b>${M.eur(R.revenue[L])}</b></div>
        <div>Lowest cash<b class="${R.low.c < 0 ? 'bad' : ''}">${M.eur(R.low.c)}</b></div>
        <div>Break-even<b class="${R.be ? '' : 'bad'}">${R.be || 'Not yet'}</b></div>
        <div>Extra funding needed<b class="${R.fundingGap > 0 ? 'bad' : ''}">${R.fundingGap > 0 ? M.eur(M.roundUp(R.fundingGap)) : 'None'}</b></div>
      </div>
      <div class="when">Edited ${when(d.updatedAt)}</div>
    </article>`;
  }
  function render() {
    const live = dashboards.filter(d => !d.archived), arch = dashboards.filter(d => d.archived);
    $('#grid').innerHTML = live.length ? live.map(card).join('') : `<div class="empty">No dashboards yet. Create one above.</div>`;
    $('#archH').style.display = arch.length ? '' : 'none';
    $('#archGrid').innerHTML = arch.map(card).join('');
  }
  async function load() { try { dashboards = (await api('/api/dashboards')).dashboards; render(); notice(''); } catch (e) { notice('Could not load dashboards: ' + e.message); } }

  document.addEventListener('click', async e => {
    const b = e.target.closest('[data-act]'); if (!b) return;
    const el = b.closest('.dcard'); const id = el.dataset.id; const d = dashboards.find(x => x.id === id);
    try {
      if (b.dataset.act === 'dup') { const r = await api('/api/dashboards', { method: 'POST', body: JSON.stringify({ copyOf: id, name: d.name + ' (copy)', route: d.route, description: d.description }) }); location.href = '/d/' + r.dashboard.id; }
      if (b.dataset.act === 'rename') { const name = prompt('Dashboard name', d.name); if (name === null) return; const route = prompt('Short label (e.g. B2B, D2C, Combined)', d.route || ''); if (route === null) return; await api('/api/dashboards/' + id, { method: 'PATCH', body: JSON.stringify({ name, route }) }); load(); }
      if (b.dataset.act === 'archive') { await api('/api/dashboards/' + id, { method: 'PATCH', body: JSON.stringify({ archived: true }) }); load(); }
      if (b.dataset.act === 'unarchive') { await api('/api/dashboards/' + id, { method: 'PATCH', body: JSON.stringify({ archived: false }) }); load(); }
      if (b.dataset.act === 'delete') { if (!confirm(`Delete "${d.name}" and all its history? This cannot be undone.`)) return; await api('/api/dashboards/' + id, { method: 'DELETE' }); load(); }
    } catch (err) { notice(err.message); }
  });
  $('#newBlank').addEventListener('click', async () => {
    const name = prompt('Name for the new dashboard', 'New model'); if (!name) return;
    try { const r = await api('/api/dashboards', { method: 'POST', body: JSON.stringify({ name, route: 'Model', description: '', state: M.blank() }) }); location.href = '/d/' + r.dashboard.id; } catch (err) { notice(err.message); }
  });
  $('#toggleArch').addEventListener('click', () => { const g = $('#archGrid'); const show = g.style.display === 'none'; g.style.display = show ? '' : 'none'; $('#toggleArch').textContent = show ? 'Hide' : 'Show'; });
  $('#logout').addEventListener('click', async () => { await fetch('/logout', { method: 'POST' }); location.href = '/login'; });
  DnD.attach(document.body, async (list, id, targetId, after) => {
    const live = dashboards.filter(d => !d.archived).map(d => d.id); const arch = dashboards.filter(d => d.archived).map(d => d.id);
    const inLive = live.includes(id); const ids = DnD.move(inLive ? live : arch, id, targetId, after);
    const order = inLive ? ids.concat(arch) : live.concat(ids);
    dashboards.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id)); render();
    try { await api('/api/dashboards/reorder', { method: 'POST', body: JSON.stringify({ ids: order }) }); } catch (err) { notice(err.message); }
  });
  // theme
  const tb = $('#theme');
  const setLabel = () => { const dark = document.documentElement.dataset.theme === 'dark' || (!document.documentElement.dataset.theme && matchMedia('(prefers-color-scheme: dark)').matches); tb.textContent = dark ? 'Light mode' : 'Dark mode'; };
  tb.addEventListener('click', () => { const dark = tb.textContent === 'Dark mode'; document.documentElement.dataset.theme = dark ? 'dark' : 'light'; try { localStorage.setItem('axite-theme', document.documentElement.dataset.theme); } catch (e) {} setLabel(); render(); });
  setLabel();
  load();
})();
