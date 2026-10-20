(function () {
  'use strict';
  const M = window.Model;
  const { v, eur, eurFull, num, num1, pct, esc, uid } = M;
  const $ = s => document.querySelector(s);
  const COLORS = ['--s1', '--s2', '--s3', '--s4', '--s5', '--s6', '--s7', '--s8'];
  const col = i => getComputedStyle(document.documentElement).getPropertyValue(COLORS[i % COLORS.length]).trim();
  const id = location.pathname.split('/').pop();

  let D = null, S = null, R = null, rev = 0, tab = 'customers';
  let dirty = false, saving = false, saveTimer = null, retryDelay = 2000;
  const notice = t => { const n = $('#notice'); n.textContent = t; n.classList.toggle('show', !!t); };
  const status = (t, err) => { const s = $('#status'); s.textContent = t; s.classList.toggle('err', !!err); };
  async function api(url, opts = {}) {
    const r = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...opts });
    if (r.status === 401) { location.href = '/login'; throw new Error('unauthorized'); }
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { const e = new Error(j.error || r.statusText); e.status = r.status; e.body = j; throw e; }
    return j;
  }

  /* ---------- load & save ---------- */
  async function load() {
    try {
      const r = await api('/api/dashboards/' + id);
      D = r.dashboard; S = M.normalize(D.state); rev = D.rev;
      document.title = D.name + ' · Axite';
      $('#dashName').value = D.name; $('#dashRoute').textContent = D.route || 'Model';
      renderAll(); status('Saved');
    } catch (e) { status('Could not load', true); notice('Could not load this dashboard: ' + e.message); }
  }
  function markDirty() { dirty = true; status('Editing…'); clearTimeout(saveTimer); saveTimer = setTimeout(save, 700); }
  async function save() {
    if (saving || !dirty) return; saving = true; dirty = false; status('Saving…');
    try {
      const r = await api('/api/dashboards/' + id, { method: 'PUT', body: JSON.stringify({ state: S, rev, name: $('#dashName').value.trim() || D.name, description: D.description }) });
      rev = r.dashboard.rev; D.name = r.dashboard.name; document.title = D.name + ' · Axite'; retryDelay = 2000;
      status('Saved ' + new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }));
      if (dirty) setTimeout(save, 50);
    } catch (e) {
      if (e.status === 409 && e.body.dashboard) {
        notice('This dashboard was changed from another browser. Their version has been loaded; your last edit was not saved.');
        D = e.body.dashboard; S = M.normalize(D.state); rev = D.rev; renderAll(); status('Reloaded');
      } else { dirty = true; status('Not saved, retrying', true); setTimeout(save, retryDelay); retryDelay = Math.min(retryDelay * 2, 30000); }
    } finally { saving = false; }
  }
  addEventListener('beforeunload', e => { if (dirty || saving) { e.preventDefault(); e.returnValue = ''; } });

  /* ---------- render ---------- */
  function renderAll() { render(); renderPane(); }
  function render() {
    R = M.compute(S);
    const vd = M.verdict(R, S);
    $('#headline').textContent = vd.h; $('#subline').textContent = vd.s;
    drawCash();
    const subs = M.blockSubtitles(R, S);
    const block = (key, title, body) => `<section class="block" data-dnd="blocks" data-id="${key}"><h2>${DnD.handle('arrows', 'Block')}${esc(title)}</h2>${subs[key] ? `<p class="sub">${esc(subs[key])}</p>` : ''}${body}</section>`;
    const L = R.N - 1;
    const parts = {
      kpis: () => `<section class="block" style="padding:0;border:none;background:none" data-dnd="blocks" data-id="kpis"><div class="kpis">${M.kpis(R).map((x, i) => `<div class="kpi">${i === 0 ? '<span style="float:right;margin:-4px -6px 0 0">' + DnD.handle('arrows', 'Block') + '</span>' : ''}<div class="v${x.bad ? ' bad' : ''}">${esc(x.v)}</div><div class="l">${esc(x.l)}</div></div>`).join('')}</div></section>`,
      insights: () => block('insights', 'What the numbers say', `<ul class="insights">${M.insights(R, S).map(i => `<li class="${i.tone}">${esc(i.text)}</li>`).join('')}</ul>`),
      revenue: () => block('revenue', 'Revenue by customer type', `<div class="chart" id="revChart"></div><div class="legend" id="revLegend"></div>`),
      mix: () => block('mix', `Product mix in ${R.Y[L]}`, mixTable()),
      costs: () => block('costs', 'Operating costs by category', `<div class="chart" id="costChart"></div><div class="legend" id="costLegend"></div>${costTable()}`),
      pl: () => block('pl', 'Profit and cash', `<div class="scroll"><table>${plTable()}</table></div>`),
    };
    $('#blocks').innerHTML = S.layout.blocks.map(k => parts[k] ? parts[k]() : '').join('');
    drawRev(); drawCosts();
    $('#footer').textContent = M.footer(R, S);
  }

  function tipFor(box) { let t = box.querySelector('.tip'); if (!t) { t = document.createElement('div'); t.className = 'tip'; box.appendChild(t); } return t; }
  function placeTip(box, t, x, y) { const w = box.clientWidth; t.style.opacity = 1; const tw = t.offsetWidth; const lx = Math.min(Math.max(x - tw / 2, 0), w - tw); t.style.left = lx + 'px'; t.style.top = Math.max(y - t.offsetHeight - 10, 0) + 'px'; }

  function drawCash() {
    const box = $('#cashChart'); const W = Math.max(box.clientWidth, 280), H = 150, pl = 8, pr = 8, pt = 14, pb = 24;
    const vals = R.monthly.map(p => p.c); const max = Math.max(...vals, 0), min = Math.min(...vals, 0); const span = (max - min) || 1;
    const x = i => pl + (W - pl - pr) * i / Math.max(vals.length - 1, 1); const y = c => pt + (H - pt - pb) * (max - c) / span;
    let d = ''; vals.forEach((c, i) => { d += (i ? 'L' : 'M') + x(i).toFixed(1) + ',' + y(c).toFixed(1); });
    const zero = y(0);
    let s = `<svg width="100%" viewBox="0 0 ${W} ${H}" role="img" aria-label="Cash balance per month">`;
    s += `<line x1="${pl}" x2="${W - pr}" y1="${zero}" y2="${zero}" stroke="#ffffff55" stroke-dasharray="3 4"/><text x="${W - pr}" y="${zero - 5}" text-anchor="end" font-size="11" fill="#CFEBDD">€0</text>`;
    R.Y.forEach((yr, k) => { const xx = x(k * 12); s += `<line x1="${xx}" x2="${xx}" y1="${pt}" y2="${H - pb}" stroke="#ffffff1f"/><text x="${xx + 4}" y="${H - 7}" font-size="11" fill="#CFEBDD">${yr}</text>`; });
    s += `<path d="${d}L${x(vals.length - 1)},${zero}L${x(0)},${zero}Z" fill="#8BDB9F33"/><path d="${d}" fill="none" stroke="#8BDB9F" stroke-width="2.5" stroke-linejoin="round"/>`;
    R.monthly.forEach((p, i) => { if (p.fund > 0) s += `<circle cx="${x(i)}" cy="${y(p.c)}" r="3.5" fill="#fff" opacity=".9"><title>${esc(eur(p.fund))} funding</title></circle>`; });
    if (R.outAt) s += `<circle cx="${x(R.outAt.idx)}" cy="${y(vals[R.outAt.idx])}" r="5" fill="#F2A08F" stroke="#fff" stroke-width="1.5"/>`;
    s += '</svg>'; box.innerHTML = s;
    const t = tipFor(box), svg = box.querySelector('svg');
    const move = e => { const r = svg.getBoundingClientRect(); const px = (e.clientX - r.left) * W / r.width; let i = Math.round((px - pl) / (W - pl - pr) * (vals.length - 1)); i = Math.max(0, Math.min(vals.length - 1, i)); const p = R.monthly[i]; t.textContent = `${M.monthName(p.y, p.j)}: ${eurFull(p.c)}${p.fund ? ' · funding ' + eur(p.fund) : ''}`; placeTip(box, t, x(i) * r.width / W, y(p.c) * r.height / H); };
    svg.addEventListener('pointermove', move); svg.addEventListener('pointerdown', move); svg.addEventListener('pointerleave', () => t.style.opacity = 0);
  }
  function niceMax(m) { const p = Math.pow(10, Math.floor(Math.log10(m))); const f = m / p; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p; }
  function stacked(boxId, legendId, series, totals, label) {
    const box = document.getElementById(boxId); if (!box) return;
    const W = Math.max(box.clientWidth, 280), H = 230, pl = 52, pr = 6, pt = 10, pb = 26;
    const nice = niceMax(Math.max(...totals, 1)); const bw = (W - pl - pr) / R.N; const y = c => pt + (H - pt - pb) * (1 - c / nice);
    let s = `<svg width="100%" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(label)}">`;
    for (let g = 0; g <= 4; g++) { const val = nice * g / 4, yy = y(val); s += `<line x1="${pl}" x2="${W - pr}" y1="${yy}" y2="${yy}" stroke="var(--line)"/><text x="${pl - 6}" y="${yy + 4}" text-anchor="end" font-size="11" fill="var(--muted)">${eur(val)}</text>`; }
    R.Y.forEach((yr, k) => {
      let base = 0; const bx = pl + bw * k + bw * 0.18, ww = bw * 0.64;
      series.forEach(sg => { const val = sg.vals[k]; if (val <= 0) return; const y1 = y(base + val), y0 = y(base); s += `<rect x="${bx}" y="${y1}" width="${ww}" height="${Math.max(y0 - y1, 0.5)}" fill="${sg.color}"/>`; base += val; });
      s += `<text x="${bx + ww / 2}" y="${H - 8}" text-anchor="middle" font-size="12" fill="var(--muted)">${yr}</text>`;
      if (totals[k] > 0) s += `<text x="${bx + ww / 2}" y="${y(totals[k]) - 5}" text-anchor="middle" font-size="11" font-weight="700" fill="var(--ink)">${eur(totals[k])}</text>`;
      s += `<rect x="${pl + bw * k}" y="${pt}" width="${bw}" height="${H - pt - pb}" fill="transparent" data-k="${k}"/>`;
    });
    s += '</svg>'; box.innerHTML = s;
    const t = tipFor(box), svg = box.querySelector('svg');
    svg.querySelectorAll('rect[data-k]').forEach(r => { const show = () => { const k = +r.dataset.k; t.textContent = ''; const b = document.createElement('b'); b.textContent = R.Y[k] + ' · ' + eur(totals[k]); t.appendChild(b); const lines = series.filter(sg => sg.vals[k] > 0).map(sg => `${sg.name}: ${eur(sg.vals[k])}`); (lines.length ? lines : ['Nothing']).forEach(l => { t.appendChild(document.createElement('br')); t.appendChild(document.createTextNode(l)); }); const sr = svg.getBoundingClientRect(); placeTip(box, t, (pl + bw * k + bw / 2) * sr.width / W, y(totals[k]) * sr.height / H); }; r.addEventListener('pointerenter', show); r.addEventListener('pointerdown', show); r.addEventListener('pointerleave', () => t.style.opacity = 0); });
    const lg = document.getElementById(legendId); if (lg) lg.innerHTML = series.map(sg => `<span><i style="background:${sg.color}"></i>${esc(sg.name)}</span>`).join('');
  }
  const drawRev = () => stacked('revChart', 'revLegend', R.segs.map(sg => ({ name: sg.s.name, vals: sg.rev, color: col(sg.i) })), R.revenue, 'Revenue by customer type per year');
  const drawCosts = () => stacked('costChart', 'costLegend', R.byCat.map((c, i) => ({ name: c.cat, vals: c.annual, color: col(M.CATEGORIES.indexOf(c.cat) + 3) })), R.opex, 'Operating costs by category per year');

  const grip = () => DnD.handle('grip');           // table rows: drag dots
  const arrows = () => DnD.handle('arrows');       // cards: up/down buttons
  function mixTable() {
    const L = R.N - 1, tot = R.revenue[L], gtot = R.gp[L];
    let h = `<div class="mixrow" aria-hidden="true">${R.segs.map(sg => tot > 0 && sg.rev[L] > 0 ? `<div style="width:${sg.rev[L] / tot * 100}%;background:${col(sg.i)}"></div>` : '').join('')}</div>`;
    h += `<div class="scroll"><table><thead><tr><th>Customer type</th><th>Customers</th><th>Revenue</th><th>Share</th><th>Gross profit</th><th>Margin</th><th>Market reached</th></tr></thead><tbody>`;
    R.segs.forEach(sg => { const r = sg.rev[L], g = r - sg.cost[L], cust = R.Y[L] < sg.s.from ? 0 : v(sg.s.vol[L]); const mk = v(sg.s.market);
      h += `<tr data-dnd="segments" data-id="${sg.s.id}"><td>${grip()}<i style="display:inline-block;width:9px;height:9px;border-radius:3px;background:${col(sg.i)};margin-right:6px"></i>${esc(sg.s.name)}</td><td>${num(cust)}</td><td>${eur(r)}</td><td>${tot > 0 ? pct(r / tot) : '—'}</td><td class="${g < 0 ? 'neg' : ''}">${eur(g)}</td><td>${r > 0 ? pct(g / r) : '—'}</td><td>${mk > 0 ? (cust / mk < 0.001 && cust > 0 ? '<0.1%' : (Math.round(cust / mk * 1000) / 10) + '%') + ' of ' + num(mk) : '—'}</td></tr>`; });
    h += `<tr class="total"><td>Total</td><td></td><td>${eur(tot)}</td><td>${tot > 0 ? '100%' : '—'}</td><td>${eur(gtot)}</td><td>${tot > 0 ? pct(gtot / tot) : '—'}</td><td></td></tr></tbody></table></div>`;
    return h;
  }
  function costTable() {
    let h = `<div class="scroll" style="margin-top:10px"><table><thead><tr><th>Cost line</th><th>Type</th>${R.Y.map(y => `<th>${y}</th>`).join('')}<th>Total</th></tr></thead><tbody>`;
    R.costLines.forEach(l => { h += `<tr data-dnd="costs" data-id="${l.c.id}"><td>${grip()}${esc(l.c.name)} <span class="hint" style="display:inline">· ${esc(l.c.category)}</span></td><td>${esc(M.COST_TYPES[l.c.type])}</td>${l.annual.map(x => `<td>${eurFull(x)}</td>`).join('')}<td><b>${eurFull(l.total)}</b></td></tr>`; });
    h += `<tr class="total"><td>Total operating costs</td><td></td>${R.opex.map(x => `<td>${eurFull(x)}</td>`).join('')}<td>${eurFull(M.sum(R.opex))}</td></tr></tbody></table></div>`;
    return h;
  }
  function plTable() {
    const row = (l, a, cls = '', attrs = '') => `<tr class="${cls}" ${attrs}><td>${attrs ? grip() : ''}${esc(l)}</td>${a.map(x => `<td class="${x < 0 ? 'neg' : ''}">${eurFull(x)}</td>`).join('')}</tr>`;
    const sec = t => `<tr class="sec"><td colspan="${R.N + 1}">${t}</td></tr>`;
    let h = `<thead><tr><th></th>${R.Y.map(y => `<th>${y}</th>`).join('')}</tr></thead><tbody>`;
    h += sec('Revenue'); R.segs.forEach(sg => h += row(sg.s.name, sg.rev, '', `data-dnd="segments" data-id="${sg.s.id}"`));
    h += row('Total revenue', R.revenue, 'total'); h += row('Direct costs', R.direct.map(x => -x)); h += row('Gross profit', R.gp, 'total');
    h += sec('Operating costs'); R.costLines.forEach(l => h += row(l.c.name, l.annual.map(x => -x), '', `data-dnd="costs" data-id="${l.c.id}"`));
    h += row('Total operating costs', R.opex.map(x => -x), 'total'); h += row('Result before tax', R.ebt, 'total'); h += row(`Corporate tax (${num1(R.taxRate * 100)}%)`, R.tax.map(x => -x)); h += row('Net result', R.net, 'total');
    h += sec('Cash'); h += row('Cash at start', R.cashStart);
    S.funding.forEach(f => { const a = R.Y.map(y => y === f.year ? f.amount : 0); if (M.sum(a) > 0) h += row(`${f.name} (${M.MONTHS[f.month - 1]})`, a, 'sub'); });
    h += row('Cash at end', R.cashEnd, 'total');
    return h + '</tbody>';
  }

  /* ---------- inputs ---------- */
  const field = (label, value, attrs) => `<label class="f">${esc(label)}<input ${attrs} value="${esc(value)}"></label>`;
  const numAttr = (k, extra = '') => `type="number" step="any" inputmode="decimal" data-k="${k}" ${extra}`;
  const yearOpts = (sel) => { const ys = M.years(S); if (!ys.includes(sel)) ys.unshift(sel); return ys.map(y => `<option value="${y}"${y === sel ? ' selected' : ''}>${y}</option>`).join(''); };
  const sel = (label, k, opts, cur) => `<label class="f">${esc(label)}<select data-k="${k}">${Object.entries(opts).map(([val, t]) => `<option value="${esc(val)}"${String(val) === String(cur) ? ' selected' : ''}>${esc(t)}</option>`).join('')}</select></label>`;
  const noteField = (note) => `<label class="f mt">Notes<textarea data-k="note" rows="2" placeholder="Why these numbers: source, assumption, open question">${esc(note || '')}</textarea></label>`;
  const yearInputs = (vals, k, disabledFn) => `<div class="years">${M.years(S).map((y, i) => field(String(y), vals[i], `type="number" step="any" inputmode="decimal" data-k="${k}" data-i="${i}"${disabledFn && disabledFn(y) ? ' disabled' : ''}`)).join('')}</div>`;

  function renderPane() {
    const pane = $('#pane'); let h = '';
    if (tab === 'customers') {
      R.segs.forEach(x => { const s = x.s;
        h += `<div class="card${x.p ? '' : ' off'}" data-dnd="segments" data-id="${s.id}" data-list="segments"><div class="card-h">${arrows()}<span class="sw" style="background:${col(x.i)}"></span><input class="name" data-k="name" value="${esc(s.name)}" aria-label="Customer type name"><button class="x" data-del type="button" aria-label="Remove">×</button></div>`;
        h += `<div class="grid2">${sel('Plan', 'plan', Object.assign(Object.fromEntries(S.plans.map(p => [p.id, p.name])), { '': 'No plan' }), s.plan)}<label class="f">Starts in<select data-k="from">${yearOpts(s.from)}</select></label></div>`;
        h += `<div class="grid2 mt">${field('Units per customer', s.per, numAttr('per', 'min="0"'))}${field('Unit is', s.perLabel, 'type="text" data-k="perLabel"')}</div>`;
        h += `<div class="grid2 mt">${field('Volume label', s.volLabel, 'type="text" data-k="volLabel"')}<span></span></div><p class="hint">${esc(s.volLabel || 'Customers')} per year (average)</p>${yearInputs(s.vol, 'vol', y => y < s.from)}`;
        h += `<div class="grid2 mt">${field('Market size (optional)', s.market || '', numAttr('market', 'min="0"'))}${field('Market is', s.marketLabel || '', 'type="text" data-k="marketLabel"')}</div>`;
        h += noteField(s.note) + `<p class="meta">${esc(M.segmentMeta(x, R))}</p></div>`; });
      h += `<button class="add" data-add="segments" type="button">Add customer type</button>`;
    } else if (tab === 'plans') {
      S.plans.forEach(p => {
        h += `<div class="card" data-dnd="plans" data-id="${p.id}" data-list="plans"><div class="card-h">${arrows()}<input class="name" data-k="name" value="${esc(p.name)}" aria-label="Plan name"><button class="x" data-del type="button" aria-label="Remove">×</button></div>`;
        h += `<div class="grid3">${field('Price (€)', p.price, numAttr('price', 'min="0"'))}${sel('Billed', 'unit', M.UNITS, p.unit)}${field('Cost to deliver (€)', p.cost, numAttr('cost', 'min="0"'))}</div>`;
        h += `<div class="grid2 mt">${sel('Customer pays', 'delay', { 0: 'on invoicing', 1: '1 month later', 2: '2 months later', 3: '3 months later', 6: '6 months later' }, p.delay)}<span></span></div>`;
        h += noteField(p.note) + `<p class="meta">${esc(M.planMeta(p, S))}</p></div>`; });
      h += `<button class="add" data-add="plans" type="button">Add plan</button>`;
    } else if (tab === 'costs') {
      R.costLines.forEach(l => { const c = l.c;
        h += `<div class="card" data-dnd="costs" data-id="${c.id}" data-list="costs"><div class="card-h">${arrows()}<input class="name" data-k="name" value="${esc(c.name)}" aria-label="Cost name"><button class="x" data-del type="button" aria-label="Remove">×</button></div>`;
        h += `<div class="grid2">${sel('Category', 'category', Object.fromEntries(M.CATEGORIES.map(x => [x, x])), c.category)}${sel('Type', 'type', M.COST_TYPES, c.type)}</div>`;
        if (c.type === 'fte') h += `<div class="grid2 mt">${field('Monthly cost per FTE (€, fully loaded)', c.salary, numAttr('salary', 'min="0"'))}<span></span></div>`;
        const lbl = { month: '€ per month, per year', year: '€ per year', once: '€ one-off, per year', pct: '% of revenue, per year', fte: 'FTE per year' }[c.type];
        h += `<p class="hint">${lbl}</p>${yearInputs(c.values, 'values')}`;
        h += noteField(c.note) + `<p class="meta">${esc(M.costMeta(l, R))}</p></div>`; });
      h += `<button class="add" data-add="costs" type="button">Add cost line</button>`;
    } else if (tab === 'funding') {
      h += `<div class="card" data-static="opening">${field(`Cash on 1 January ${M.years(S)[0]} (€)`, S.opening.cash, numAttr('opening.cash'))}<label class="f mt">Notes<textarea data-k="opening.note" rows="2">${esc(S.opening.note || '')}</textarea></label></div>`;
      S.funding.forEach(f => {
        h += `<div class="card" data-dnd="funding" data-id="${f.id}" data-list="funding"><div class="card-h">${arrows()}<input class="name" data-k="name" value="${esc(f.name)}" aria-label="Funding name"><button class="x" data-del type="button" aria-label="Remove">×</button></div>`;
        h += `<div class="grid3">${field('Amount (€)', f.amount, numAttr('amount', 'min="0"'))}<label class="f">Year<select data-k="year">${yearOpts(f.year)}</select></label>${sel('Month', 'month', Object.fromEntries(M.MONTHS.map((m, i) => [i + 1, m])), f.month)}</div>`;
        h += `<div class="grid2 mt">${sel('Type', 'type', M.FUND_TYPES, f.type)}<span></span></div>`;
        h += noteField(f.note) + `<p class="meta">${esc(M.fundingMeta(f, R))}</p></div>`; });
      h += `<button class="add" data-add="funding" type="button">Add funding</button>`;
      h += `<div class="card mt" data-static="tax"><div class="card-h"><strong>Corporate tax</strong></div><div class="grid2">${field('Rate (%)', S.settings.taxRate, numAttr('settings.taxRate', 'min="0" max="60"'))}<span></span></div><label class="chk"><input type="checkbox" data-k="settings.lossCarry"${S.settings.lossCarry ? ' checked' : ''}> Carry losses forward before paying tax</label><p class="hint">Dutch rate 25.8% above €200K profit, 19% below. Tax is paid in the year it is due.</p></div>`;
    } else {
      const ys = M.years(S);
      h += `<div class="card" data-static="years"><div class="card-h"><strong>Plan years</strong></div><div class="grid2">${field('First year', S.years.start, `type="number" step="1" min="2000" max="2100" data-k="years.start" data-rerender`)}${field('Number of years', S.years.count, `type="number" step="1" min="1" max="15" data-k="years.count" data-rerender`)}</div><p class="hint">Currently ${ys[0]} to ${ys[ys.length - 1]}. Adding years extends every table with zeros; removing years drops the last ones.</p></div>`;
      h += `<div class="card" data-static="desc"><label class="f">Description (shown on the overview)<textarea data-k="description" rows="3">${esc(D.description || '')}</textarea></label></div>`;
      h += `<div class="card" data-static="notes"><label class="f">Your notes<textarea data-k="settings.notes" rows="6" placeholder="Assumptions, sources, things to check. Saved with the dashboard.">${esc(S.settings.notes || '')}</textarea></label></div>`;
      h += `<div class="card" data-static="dup"><div class="card-h"><strong>Scenarios</strong></div><p class="hint" style="margin-bottom:8px">Duplicate this dashboard to try a different story without losing this one.</p><button class="btn" id="dup" type="button">Duplicate this dashboard</button></div>`;
    }
    pane.innerHTML = h;
  }

  /** Update the explanatory texts inside the cards without rebuilding the pane (keeps focus while typing). */
  function refreshMetas() {
    const pane = $('#pane');
    pane.querySelectorAll('.card[data-list]').forEach(card => {
      const list = card.dataset.list, cid = card.dataset.id; const meta = card.querySelector('.meta'); if (!meta) return;
      if (list === 'segments') { const x = R.segs.find(x => x.s.id === cid); if (x) { meta.textContent = M.segmentMeta(x, R); card.classList.toggle('off', !x.p); } }
      else if (list === 'plans') { const p = S.plans.find(p => p.id === cid); if (p) meta.textContent = M.planMeta(p, S); }
      else if (list === 'costs') { const l = R.costLines.find(l => l.c.id === cid); if (l) meta.textContent = M.costMeta(l, R); }
      else if (list === 'funding') { const f = S.funding.find(f => f.id === cid); if (f) meta.textContent = M.fundingMeta(f, R); }
    });
  }

  const INT_KEYS = new Set(['from', 'year', 'month', 'delay']);
  const NUM_KEYS = new Set(['per', 'market', 'price', 'cost', 'salary', 'amount']);
  function setPath(obj, path, val) { const ks = path.split('.'); let o = obj; for (let i = 0; i < ks.length - 1; i++) o = o[ks[i]]; o[ks[ks.length - 1]] = val; }
  function applyInput(el) {
    const card = el.closest('.card'); const k = el.dataset.k; if (!k) return;
    if (card && card.dataset.list) {
      const item = S[card.dataset.list].find(x => x.id === card.dataset.id); if (!item) return;
      if (el.dataset.i !== undefined) item[k][+el.dataset.i] = v(el.value);
      else if (INT_KEYS.has(k)) item[k] = Math.round(v(el.value));
      else if (NUM_KEYS.has(k)) item[k] = v(el.value);
      else item[k] = el.value;
    } else if (k === 'description') { D.description = el.value; }
    else if (el.type === 'checkbox') setPath(S, k, el.checked);
    else if (k.startsWith('years.')) setPath(S, k, Math.round(v(el.value)));
    else if (k === 'opening.note' || k === 'settings.notes') setPath(S, k, el.value);
    else setPath(S, k, v(el.value));
  }
  const pane = $('#pane');
  pane.addEventListener('input', e => {
    const el = e.target; if (el.tagName === 'SELECT' || el.type === 'checkbox') return;
    if (el.dataset.k === 'years.count' || el.dataset.k === 'years.start') return; // handled on change
    applyInput(el); render(); refreshMetas(); markDirty();
  });
  pane.addEventListener('change', e => {
    const el = e.target;
    if (el.tagName === 'SELECT' || el.type === 'checkbox' || el.dataset.rerender !== undefined) {
      applyInput(el); M.normalize(S); render(); renderPane(); markDirty();
    }
  });
  pane.addEventListener('click', e => {
    const del = e.target.closest('[data-del]');
    if (del) {
      const card = del.closest('.card'); const list = card.dataset.list; const item = S[list].find(x => x.id === card.dataset.id);
      let msg = `Remove ${item.name}?`;
      if (list === 'plans') { const used = S.segments.filter(s => s.plan === item.id).length; if (used) msg += ` ${used} customer type(s) will have no plan.`; }
      if (!confirm(msg)) return;
      S[list] = S[list].filter(x => x.id !== item.id);
      if (list === 'plans') S.segments.forEach(s => { if (s.plan === item.id) s.plan = ''; });
      render(); renderPane(); markDirty(); return;
    }
    const add = e.target.closest('[data-add]');
    if (add) {
      const n = M.years(S).length, y0 = M.years(S)[0];
      const list = add.dataset.add;
      if (list === 'segments') S.segments.push({ id: uid('c'), name: 'New customer type', plan: S.plans[0] ? S.plans[0].id : '', per: 1, perLabel: 'units each', from: y0, vol: new Array(n).fill(0), volLabel: 'Customers', market: 0, marketLabel: '', note: '' });
      if (list === 'plans') S.plans.push({ id: uid('p'), name: 'New plan', price: 0, unit: 'month', cost: 0, delay: 0, note: '' });
      if (list === 'costs') S.costs.push({ id: uid('k'), name: 'New cost', category: 'Other', type: 'month', values: new Array(n).fill(0), salary: 0, note: '' });
      if (list === 'funding') S.funding.push({ id: uid('f'), name: 'New funding', type: 'equity', amount: 0, year: y0, month: 1, note: '' });
      render(); renderPane(); markDirty();
      const cards = pane.querySelectorAll('.card[data-list]'); const last = cards[cards.length - 1]; if (last) { last.scrollIntoView({ block: 'nearest' }); const nm = last.querySelector('input.name'); if (nm) nm.select(); }
      return;
    }
    if (e.target.id === 'dup') duplicate();
  });
  document.querySelectorAll('.tab').forEach(b => b.addEventListener('click', () => { tab = b.dataset.tab; document.querySelectorAll('.tab').forEach(x => x.setAttribute('aria-selected', x === b)); renderPane(); $('.inputs').scrollTop = 0; }));

  /* ---------- drag and drop ---------- */
  DnD.attach(document.body, (list, idA, idB, after) => {
    if (list === 'blocks') S.layout.blocks = DnD.move(S.layout.blocks, idA, idB, after);
    else if (S[list]) S[list] = DnD.move(S[list], idA, idB, after);
    else return;
    render(); renderPane(); markDirty();
  });

  /* ---------- header actions ---------- */
  $('#dashName').addEventListener('input', () => { markDirty(); });
  async function duplicate() {
    const name = prompt('Name for the copy', D.name + ' (copy)'); if (!name) return;
    try { await save(); const r = await api('/api/dashboards', { method: 'POST', body: JSON.stringify({ copyOf: id, name, route: D.route, description: D.description }) }); location.href = '/d/' + r.dashboard.id; } catch (e) { notice(e.message); }
  }
  $('#export').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify({ name: D.name, route: D.route, description: D.description, exportedAt: new Date().toISOString(), state: S }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = D.name.replace(/[^\w\-]+/g, '-').toLowerCase() + '.json'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });
  $('#import').addEventListener('click', () => $('#importFile').click());
  $('#importFile').addEventListener('change', async e => {
    const f = e.target.files[0]; e.target.value = ''; if (!f) return;
    try {
      const o = JSON.parse(await f.text()); const st = o.state || o;
      if (!st.plans || !st.segments) throw new Error('This file is not a business model export.');
      if (!confirm(`Replace all numbers in "${D.name}" with the imported file? The current numbers are kept in the version history.`)) return;
      await api(`/api/dashboards/${id}/snapshots`, { method: 'POST', body: JSON.stringify({ label: 'Before import' }) });
      S = M.normalize(st); renderAll(); markDirty();
    } catch (err) { notice('Import failed: ' + err.message); }
  });

  /* ---------- history ---------- */
  const drawer = $('#drawer');
  async function openHistory() {
    drawer.classList.add('open');
    try {
      const r = await api(`/api/dashboards/${id}/snapshots`);
      $('#snapList').innerHTML = r.snapshots.length ? r.snapshots.map(s => `<div class="snap" data-snap="${s.id}"><div class="when"><b>${esc(s.label || (s.kind === 'auto' ? 'Automatic' : s.kind === 'origin' ? 'Starting numbers' : 'Saved version'))}</b><small>${new Date(s.createdAt).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</small></div><button class="btn sm" data-restore type="button">Restore</button>${s.kind !== 'origin' ? '<button class="x" data-delsnap type="button" aria-label="Delete version">×</button>' : ''}</div>`).join('') : '<p class="hint">No versions yet.</p>';
    } catch (e) { $('#snapList').innerHTML = `<p class="hint">Could not load history: ${esc(e.message)}</p>`; }
  }
  $('#history').addEventListener('click', openHistory);
  $('#closeDrawer').addEventListener('click', () => drawer.classList.remove('open'));
  drawer.addEventListener('click', e => { if (e.target === drawer) drawer.classList.remove('open'); });
  $('#snapSave').addEventListener('click', async () => { await save(); try { await api(`/api/dashboards/${id}/snapshots`, { method: 'POST', body: JSON.stringify({ label: $('#snapLabel').value.trim() }) }); $('#snapLabel').value = ''; openHistory(); } catch (e) { notice(e.message); } });
  async function restore(snapId, label) {
    if (!confirm(`Restore ${label}? The current numbers are saved as a version first.`)) return;
    try { await save(); const r = await api(`/api/dashboards/${id}/snapshots/${snapId}/restore`, { method: 'POST' }); D = r.dashboard; S = M.normalize(D.state); rev = D.rev; renderAll(); drawer.classList.remove('open'); status('Restored'); } catch (e) { notice('Restore failed: ' + e.message); }
  }
  $('#snapList').addEventListener('click', async e => {
    const row = e.target.closest('[data-snap]'); if (!row) return;
    if (e.target.closest('[data-restore]')) restore(row.dataset.snap, 'this version');
    if (e.target.closest('[data-delsnap]')) { await api(`/api/dashboards/${id}/snapshots/${row.dataset.snap}`, { method: 'DELETE' }); openHistory(); }
  });
  $('#reset').addEventListener('click', async () => {
    try { const r = await api(`/api/dashboards/${id}/snapshots`); const o = r.snapshots.find(s => s.kind === 'origin'); if (!o) return notice('No starting numbers are stored for this dashboard.'); restore(o.id, 'the starting numbers'); } catch (e) { notice(e.message); }
  });

  /* ---------- theme & resize ---------- */
  const tb = $('#theme');
  const setLabel = () => { const dark = document.documentElement.dataset.theme === 'dark' || (!document.documentElement.dataset.theme && matchMedia('(prefers-color-scheme: dark)').matches); tb.textContent = dark ? 'Light mode' : 'Dark mode'; };
  tb.addEventListener('click', () => { const dark = tb.textContent === 'Dark mode'; document.documentElement.dataset.theme = dark ? 'dark' : 'light'; try { localStorage.setItem('axite-theme', document.documentElement.dataset.theme); } catch (e) {} setLabel(); if (S) renderAll(); });
  setLabel();
  let rt; addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { if (S) { render(); } }, 120); });
  load();
})();
