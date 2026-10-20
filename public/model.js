/* Shared business-model engine: compute, formatting and the sentences that explain the numbers.
   Works in the browser (window.Model) and in Node (module.exports) so the server can test it. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(); else root.Model = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const UNITS = { month: 'per month', year: 'per year', once: 'one-off' };
  const COST_TYPES = { month: '€ per month', year: '€ per year', once: '€ one-off', pct: '% of revenue', fte: 'FTE × salary' };
  const CATEGORIES = ['Team', 'Regulatory & certification', 'Sales & marketing', 'Tools, cloud & office', 'Other'];
  const FUND_TYPES = { equity: 'Investment', grant: 'Grant or subsidy', loan: 'Loan', other: 'Other' };

  const v = x => { const n = typeof x === 'number' ? x : parseFloat(x); return isFinite(n) ? n : 0; };
  const eur = n => { const a = Math.abs(n); let s; if (a >= 1e6) s = '€' + (a / 1e6).toFixed(a >= 1e7 ? 1 : 2) + 'M'; else if (a >= 1e4) s = '€' + Math.round(a / 1e3) + 'K'; else s = '€' + Math.round(a).toLocaleString('en-GB'); return (n < 0 ? '−' : '') + s; };
  const eurFull = n => (n < 0 ? '−' : '') + '€' + Math.round(Math.abs(n)).toLocaleString('en-GB');
  const num = n => Math.round(n).toLocaleString('en-GB');
  const num1 = n => (Math.round(n * 10) / 10).toLocaleString('en-GB');
  const pct = n => isFinite(n) ? Math.round(n * 100) + '%' : '—';
  const monthName = (y, j) => MONTHS[j] + ' ' + y;
  const uid = p => p + Math.random().toString(36).slice(2, 8);
  const esc = t => String(t == null ? '' : t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const sum = a => a.reduce((t, x) => t + x, 0);

  function years(S) { const n = Math.max(1, Math.min(15, Math.round(v(S.years && S.years.count) || 5))); const s = Math.round(v(S.years && S.years.start) || 2027); return Array.from({ length: n }, (_, i) => s + i); }

  function fit(arr, n, fill = 0) { const a = Array.isArray(arr) ? arr.slice(0, n).map(v) : []; while (a.length < n) a.push(fill); return a; }

  /** Bring any saved state up to the current schema and make every array the right length. Mutates and returns S. */
  const ALL_BLOCKS = ['kpis', 'revenue', 'mix', 'costs', 'pl', 'insights'];
  /** Block order for the results page. Unknown keys are dropped, missing ones appended, and "What the numbers say" always sits at the bottom. */
  function layoutOrder(blocks) {
    const have = (blocks || []).filter(b => ALL_BLOCKS.includes(b) && b !== 'insights');
    return have.concat(ALL_BLOCKS.filter(b => b !== 'insights' && !have.includes(b)), ['insights']);
  }

  function normalize(S) {
    S.schema = 2;
    S.years = S.years || { start: 2027, count: 5 };
    S.years.start = Math.round(v(S.years.start) || 2027); S.years.count = Math.max(1, Math.min(15, Math.round(v(S.years.count) || 5)));
    const Y = years(S), n = Y.length;
    S.opening = S.opening || { cash: 0, note: '' }; S.opening.cash = v(S.opening.cash);
    S.settings = Object.assign({ taxRate: 25.8, lossCarry: true, notes: '' }, S.settings || {});
    S.plans = (S.plans || []).map(p => ({ id: p.id || uid('p'), name: p.name || 'Plan', price: v(p.price), unit: UNITS[p.unit] ? p.unit : 'month', cost: v(p.cost), delay: Math.max(0, Math.min(12, Math.round(v(p.delay)))), note: p.note || '' }));
    S.segments = (S.segments || []).map(s => ({ id: s.id || uid('c'), name: s.name || 'Customer type', plan: s.plan || '', per: v(s.per) || 1, perLabel: s.perLabel || 'units each', from: Math.round(v(s.from)) || Y[0], vol: fit(s.vol, n), volLabel: s.volLabel || 'Customers', market: v(s.market), marketLabel: s.marketLabel || '', note: s.note || '' }));
    // legacy v1 costs object -> cost lines
    if (S.costs && !Array.isArray(S.costs)) {
      const c = S.costs; S.costs = [
        { id: uid('k'), name: 'Operating costs', category: 'Team', type: 'month', values: fit(c.opex, n), salary: 0, note: '' },
        { id: uid('k'), name: 'Certification', category: 'Regulatory & certification', type: 'once', values: fit(c.cert, n), salary: 0, note: '' }];
      S.funding = (c.funding || []).map((a, k) => ({ id: uid('f'), name: 'Funding ' + Y[k], type: 'equity', amount: v(a), year: Y[k], month: 1, note: '' })).filter(f => f.amount);
      S.opening.cash = v(c.opening);
    }
    S.costs = (S.costs || []).map(c => ({ id: c.id || uid('k'), name: c.name || 'Cost', category: CATEGORIES.includes(c.category) ? c.category : 'Other', type: COST_TYPES[c.type] ? c.type : 'month', values: fit(c.values, n), salary: v(c.salary), note: c.note || '' }));
    S.funding = (S.funding || []).map(f => ({ id: f.id || uid('f'), name: f.name || 'Funding', type: FUND_TYPES[f.type] ? f.type : 'equity', amount: v(f.amount), year: Math.round(v(f.year)) || Y[0], month: Math.max(1, Math.min(12, Math.round(v(f.month)) || 1)), note: f.note || '' }));
    S.layout = { blocks: layoutOrder((S.layout && S.layout.blocks) || []) };
    return S;
  }

  function blank(start = new Date().getFullYear() + 1) {
    return normalize({ years: { start, count: 5 }, opening: { cash: 0, note: '' }, settings: { taxRate: 25.8, lossCarry: true, notes: '' }, plans: [{ id: uid('p'), name: 'Subscription', price: 19, unit: 'month', cost: 7, delay: 0, note: '' }], segments: [], costs: [{ id: uid('k'), name: 'Team', category: 'Team', type: 'fte', values: [1, 1, 1, 1, 1], salary: 5000, note: '' }], funding: [], layout: {} });
  }

  /** Annual cost of one cost line in year k, given that year's revenue. */
  function costAnnual(c, k, revenue) {
    const x = v(c.values[k]);
    switch (c.type) { case 'month': return x * 12; case 'year': return x; case 'once': return x; case 'pct': return revenue * x / 100; case 'fte': return x * v(c.salary) * 12; default: return x; }
  }

  function compute(S) {
    normalize(S);
    const Y = years(S), N = Y.length, M = N * 12;
    const planOf = id => S.plans.find(p => p.id === id);
    const segs = S.segments.map((s, i) => {
      const p = planOf(s.plan); const f = p ? (p.unit === 'month' ? 12 : 1) : 0;
      const rev = Y.map((y, k) => (!p || y < s.from) ? 0 : v(s.vol[k]) * v(s.per) * v(p.price) * f);
      const cost = Y.map((y, k) => (!p || y < s.from) ? 0 : v(s.vol[k]) * v(s.per) * v(p.cost) * f);
      return { s, p, i, rev, cost, total: sum(rev) };
    });
    const revenue = Y.map((_, k) => sum(segs.map(x => x.rev[k])));
    const direct = Y.map((_, k) => sum(segs.map(x => x.cost[k])));
    const gp = Y.map((_, k) => revenue[k] - direct[k]);
    const costLines = S.costs.map((c, i) => ({ c, i, annual: Y.map((_, k) => costAnnual(c, k, revenue[k])) }));
    costLines.forEach(l => l.total = sum(l.annual));
    const opex = Y.map((_, k) => sum(costLines.map(l => l.annual[k])));
    const byCat = CATEGORIES.map(cat => ({ cat, annual: Y.map((_, k) => sum(costLines.filter(l => l.c.category === cat).map(l => l.annual[k]))) })).filter(x => sum(x.annual) > 0);
    const ebt = Y.map((_, k) => gp[k] - opex[k]);
    // corporate tax with loss carry-forward
    const rate = Math.max(0, Math.min(60, v(S.settings.taxRate))) / 100; let carry = 0; const tax = [];
    Y.forEach((_, k) => { let taxable = ebt[k]; if (S.settings.lossCarry) { if (taxable < 0) { carry += -taxable; taxable = 0; } else { const used = Math.min(carry, taxable); carry -= used; taxable -= used; } } else taxable = Math.max(0, taxable); tax.push(taxable * rate); });
    const net = Y.map((_, k) => ebt[k] - tax[k]);
    const fund = Y.map(y => sum(S.funding.filter(f => f.year === y).map(f => f.amount)));
    const fundTotal = sum(fund);
    // monthly cash path. Receipts are shifted by the plan's payment delay; everything else is spread evenly.
    const receipts = new Array(M).fill(0); let receivablesEnd = 0;
    segs.forEach(x => { const d = x.p ? x.p.delay : 0; x.rev.forEach((r, k) => { for (let j = 0; j < 12; j++) { const idx = k * 12 + j + d; if (idx < M) receipts[idx] += r / 12; else receivablesEnd += r / 12; } }); });
    const fundM = new Array(M).fill(0); const fundingOutside = [];
    S.funding.forEach(f => { const idx = (f.year - Y[0]) * 12 + (f.month - 1); if (idx >= 0 && idx < M) fundM[idx] += f.amount; else fundingOutside.push(f); });
    const monthly = []; let m = v(S.opening.cash); let outAt = null; let backAt = null;
    for (let k = 0; k < N; k++) for (let j = 0; j < 12; j++) {
      const idx = k * 12 + j; m += fundM[idx] + receipts[idx] - direct[k] / 12 - opex[k] / 12 - tax[k] / 12;
      monthly.push({ y: Y[k], j, idx, c: m, fund: fundM[idx] });
      if (m < 0 && !outAt) outAt = { y: Y[k], j, idx };
      if (outAt && !backAt && m >= 0 && idx > outAt.idx) backAt = { y: Y[k], j, idx };
    }
    let low = monthly[0]; monthly.forEach(p => { if (p.c < low.c) low = p; });
    const cashStart = Y.map((_, k) => k === 0 ? v(S.opening.cash) : monthly[k * 12 - 1].c);
    const cashEnd = Y.map((_, k) => monthly[k * 12 + 11].c);
    const beIdx = Y.findIndex((y, k) => ebt[k] >= 0 && revenue[k] > 0); const be = beIdx >= 0 ? Y[beIdx] : null;
    const fundingGap = Math.max(0, -low.c);
    const fte = Y.map((_, k) => sum(S.costs.filter(c => c.type === 'fte').map(c => v(c.values[k]))));
    const cumLoss = -sum(ebt.filter(x => x < 0));
    return { Y, N, segs, revenue, direct, gp, costLines, byCat, opex, ebt, tax, net, fund, fundTotal, monthly, outAt, backAt, low, cashStart, cashEnd, be, beIdx, fundingGap, receivablesEnd, fundingOutside, fte, cumLoss, taxRate: rate };
  }

  /* ---------- sentences that react to the numbers ---------- */
  function verdict(R, S) {
    const L = R.N - 1, last = R.Y[L], first = R.Y[0];
    const raised = R.fundTotal;
    if (R.outAt) {
      const mo = R.outAt.idx + 1;
      const h = `Cash runs out in ${monthName(R.outAt.y, R.outAt.j)}.`;
      let s = `That is ${mo} month${mo === 1 ? '' : 's'} from January ${first} with ${eur(raised)} raised. The plan needs about ${eur(roundUp(R.fundingGap))} more to stay above zero`;
      s += R.be ? `. It breaks even in ${R.be}${R.beIdx * 12 > R.outAt.idx ? ', after the cash is gone' : ''}.` : ' and no year breaks even.';
      if (R.backAt) s += ` Cash is positive again from ${monthName(R.backAt.y, R.backAt.j)}.`;
      return { h, s };
    }
    const h = `Cash lasts through ${last}.`;
    let s = `Lowest point ${eur(R.low.c)} in ${monthName(R.low.y, R.low.j)}. ${R.be ? `Break-even from ${R.be}.` : 'No year breaks even yet.'} ${last} revenue ${eur(R.revenue[L])}`;
    s += R.revenue[L] > 0 ? ` at ${pct(R.gp[L] / R.revenue[L])} gross margin.` : '.';
    return { h, s };
  }
  const roundUp = x => x <= 0 ? 0 : Math.ceil(x / 10000) * 10000;

  function kpis(R) {
    const L = R.N - 1, last = R.Y[L];
    const gm = R.revenue[L] ? R.gp[L] / R.revenue[L] : NaN;
    const list = [
      { v: eur(R.revenue[L]), l: `Revenue ${last}` },
      { v: pct(gm), l: `Gross margin ${last}`, bad: isFinite(gm) && gm < 0.5 },
      { v: eur(R.low.c), l: `Lowest cash, ${monthName(R.low.y, R.low.j)}`, bad: R.low.c < 0 },
      { v: R.be ? String(R.be) : 'Not yet', l: 'Break-even year', bad: !R.be },
      { v: R.fundingGap > 0 ? eur(roundUp(R.fundingGap)) : 'None', l: 'Extra funding needed', bad: R.fundingGap > 0 },
      { v: eur(R.fundTotal), l: 'Funding in plan' },
      { v: eur(R.opex[L]), l: `Operating costs ${last}` },
      { v: R.fte[L] > 0 ? num1(R.fte[L]) + ' FTE' : '—', l: `Team size ${last}` },
    ];
    return list;
  }

  /** CFO observations. Each has a tone: 'bad', 'warn' or 'ok'. */
  function insights(R, S) {
    const out = []; const L = R.N - 1, last = R.Y[L], first = R.Y[0];
    const add = (tone, text) => out.push({ tone, text });
    // runway and gap
    if (R.outAt) {
      const monthsToLow = R.low.idx + 1;
      add('bad', `Cash goes negative in ${monthName(R.outAt.y, R.outAt.j)} and bottoms out at ${eur(R.low.c)} in ${monthName(R.low.y, R.low.j)}. Closing that needs ${eur(roundUp(R.fundingGap))} more funding, or costs about ${eur(R.fundingGap / monthsToLow)} a month lower from the start.`);
    } else if (R.low.c < 150000) {
      add('warn', `The lowest cash point is ${eur(R.low.c)} in ${monthName(R.low.y, R.low.j)}: less than six months of today's burn. One slipped funding round and the plan is under water.`);
    } else add('ok', `Cash never drops below ${eur(R.low.c)} (${monthName(R.low.y, R.low.j)}). The funding covers the plan with a buffer.`);
    // burn in year one
    const burn1 = -(R.ebt[0]) / 12;
    if (burn1 > 0) add(burn1 > 35000 ? 'warn' : 'ok', `Net burn in ${first} is ${eur(burn1)} a month${burn1 > 35000 ? ', above the €25K to €30K the company spends today. Make sure the hires behind that are deliberate.' : ', close to today\'s spend.'}`);
    // cost vs revenue growth
    if (R.revenue[0] > 0 && R.opex[0] > 0) {
      const rg = R.revenue[L] / R.revenue[0], cg = R.opex[L] / R.opex[0];
      if (rg > 3 && cg < 1.3) add('warn', `Revenue grows ${num1(rg)}× between ${first} and ${last} while operating costs grow ${num1(cg)}×. Flat costs under fast growth is the classic spreadsheet error: support, sales and infrastructure scale with customers.`);
      else if (cg > rg && R.ebt[L] < 0) add('warn', `Operating costs grow faster (${num1(cg)}×) than revenue (${num1(rg)}×) over the plan, and ${last} still makes a loss. The cost ramp is ahead of the revenue it should produce.`);
      else add('ok', `Revenue grows ${num1(rg)}× and operating costs ${num1(cg)}× from ${first} to ${last}.`);
    }
    // concentration
    const tot = R.revenue[L];
    if (tot > 0) {
      const top = R.segs.slice().sort((a, b) => b.rev[L] - a.rev[L])[0];
      const share = top.rev[L] / tot;
      if (share > 0.6) add('warn', `${top.s.name} is ${pct(share)} of ${last} revenue. The plan stands or falls with one customer type${top.s.from > first ? `, and that one only starts in ${top.s.from}` : ''}.`);
      const once = sum(R.segs.filter(x => x.p && x.p.unit === 'once').map(x => x.rev[L])) / tot;
      if (once > 0.4) add('warn', `${pct(once)} of ${last} revenue is project work sold one-off (studies and pilots). It must be re-sold every year and does not compound like subscriptions.`);
      const gm = R.gp[L] / tot;
      if (gm < 0.5) add('warn', `Gross margin in ${last} is ${pct(gm)}. For software that is low: check which plans sell at close to cost.`);
    } else add('bad', `No revenue in ${last}. Every customer type is either empty or starts after the horizon.`);
    // certification
    const regTotal = sum(R.costLines.filter(l => l.c.category === 'Regulatory & certification').map(l => l.total));
    const gated = R.segs.filter(x => x.s.from > first).map(x => x.s.name);
    if (regTotal === 0 && gated.length) add('bad', `No regulatory or certification cost is in the plan, yet ${gated.join(' and ')} only start later and depend on it. Add the Qserve, Kiwa and clinical evaluation costs.`);
    else if (regTotal > 0) add('ok', `Regulatory and certification spend totals ${eur(regTotal)} over the plan${gated.length ? `, ahead of ${gated.join(' and ')} starting` : ''}.`);
    // team and productivity
    if (R.fte[L] > 0) {
      const rpf = R.revenue[L] / R.fte[L];
      add(rpf < 100000 ? 'warn' : 'ok', `Team goes from ${num1(R.fte[0])} to ${num1(R.fte[L])} FTE. Revenue per FTE in ${last} is ${eur(rpf)}${rpf < 100000 ? ', below the €100K to €150K a software company needs to be self-funding' : ''}.`);
    }
    // funding use
    if (R.fundTotal > 0) {
      const endCash = R.cashEnd[L];
      if (R.cumLoss > R.fundTotal) add('bad', `Cumulative losses before tax are ${eur(R.cumLoss)} against ${eur(R.fundTotal)} raised. The funding does not cover the plan.`);
      else add('ok', `Of the ${eur(R.fundTotal)} raised, ${eur(Math.max(0, endCash))} is still in the bank at the end of ${last}${R.be ? ` and the business funds itself from ${R.be}` : ''}.`);
    } else add('bad', 'No funding is in the plan. Add the UNIIQ tranches and the seed round on the Funding tab.');
    // market share
    R.segs.forEach(x => { const mk = v(x.s.market); const cust = R.Y[L] < x.s.from ? 0 : v(x.s.vol[L]); if (mk > 0 && cust / mk > 0.1) add('warn', `${x.s.name} reaches ${pct(cust / mk)} of ${num(mk)} ${x.s.marketLabel || 'in the market'} by ${last}. Above 10% share in five years is ambitious for a first product.`); });
    // tax
    const ti = R.tax.findIndex(t => t > 0);
    if (ti >= 0) add('ok', `Corporate tax starts in ${R.Y[ti]} at ${num1(R.taxRate * 100)}%${S.settings.lossCarry ? ' after carried-forward losses are used up' : ''}: ${eur(R.tax[ti])} that year.`);
    // receivables
    if (R.receivablesEnd > 10000) add('ok', `${eur(R.receivablesEnd)} invoiced in ${last} is collected only after the horizon because of payment terms. Accounting profit is ahead of cash.`);
    if (R.fundingOutside.length) add('warn', `${R.fundingOutside.map(f => f.name).join(', ')} ${R.fundingOutside.length > 1 ? 'fall' : 'falls'} outside ${first} to ${last} and ${R.fundingOutside.length > 1 ? 'are' : 'is'} ignored in the cash line.`);
    return out;
  }

  function segmentMeta(x, R) {
    const L = R.N - 1, last = R.Y[L];
    if (!x.p) return 'No plan selected, so this customer type earns nothing.';
    let t = `${x.p.name}: €${num(x.p.price)} ${UNITS[x.p.unit]}${v(x.s.per) !== 1 ? ` × ${num(v(x.s.per))} ${x.s.perLabel}` : ''}.`;
    if (x.rev[L] > 0) { t += ` ${last} revenue ${eur(x.rev[L])}`; if (R.revenue[L] > 0) t += ` (${pct(x.rev[L] / R.revenue[L])} of total)`; t += '.'; } else t += ` No revenue in ${last}.`;
    const mk = v(x.s.market), cust = last < x.s.from ? 0 : v(x.s.vol[L]);
    if (mk > 0 && cust > 0) t += ` Reaches ${cust / mk < 0.001 ? 'under 0.1%' : pct(cust / mk)} of ${num(mk)} ${x.s.marketLabel}.`;
    return t;
  }
  function planMeta(p, S) {
    const used = S.segments.filter(s => s.plan === p.id).map(s => s.name);
    const m = v(p.price) > 0 ? (v(p.price) - v(p.cost)) / v(p.price) : NaN;
    let t = `Gross margin ${pct(m)}`;
    if (v(p.price) > 0 && p.unit === 'month') t += `, €${num(v(p.price) * 12)} a year per unit`;
    t += p.delay ? `. Paid ${p.delay} month${p.delay > 1 ? 's' : ''} after invoicing.` : '. Paid on invoicing.';
    t += ` Used by ${used.length ? used.join(', ') : 'nobody yet'}.`;
    return t;
  }
  function costMeta(l, R) {
    const L = R.N - 1, last = R.Y[L], first = R.Y[0]; const c = l.c;
    let t;
    if (c.type === 'fte') t = `${num1(v(c.values[L]))} FTE × €${num(v(c.salary))} a month = ${eur(l.annual[L])} in ${last}`;
    else if (c.type === 'pct') t = `${num1(v(c.values[L]))}% of revenue = ${eur(l.annual[L])} in ${last}`;
    else t = l.annual[0] === l.annual[L] ? `${eur(l.annual[L])} a year` : `${eur(l.annual[0])} in ${first}, ${eur(l.annual[L])} in ${last}`;
    t += `. ${eur(l.total)} over the plan`;
    const share = R.opex[L] > 0 ? l.annual[L] / R.opex[L] : 0;
    if (share > 0) t += `, ${pct(share)} of ${last} costs`;
    return t + '.';
  }
  function fundingMeta(f, R) {
    const idx = (f.year - R.Y[0]) * 12 + f.month - 1;
    if (idx < 0 || idx >= R.N * 12) return `Outside the plan years, ignored.`;
    const before = idx === 0 ? R.monthly[0].c - R.monthly[0].fund : R.monthly[idx - 1].c;
    const after = R.monthly[idx].c;
    return `${FUND_TYPES[f.type]}, lands ${monthName(f.year, f.month - 1)}. Cash before ${eur(before)}, after ${eur(after)}${before < 0 ? '. Arrives after the cash has already run out' : ''}.`;
  }
  function blockSubtitles(R, S) {
    const L = R.N - 1, last = R.Y[L], first = R.Y[0];
    const big = R.byCat.slice().sort((a, b) => b.annual[L] - a.annual[L])[0];
    return {
      revenue: `Per year, stacked. ${eur(R.revenue[0])} in ${first} to ${eur(R.revenue[L])} in ${last} across ${R.segs.length} customer type${R.segs.length === 1 ? '' : 's'}. Hover or tap a bar for the split.`,
      mix: `Share of revenue and gross profit per customer type in ${last}.`,
      costs: R.opex[L] > 0 ? `${eur(sum(R.opex))} over the plan. ${big ? `${big.cat} is the biggest block at ${pct(big.annual[L] / R.opex[L])} of ${last} costs.` : ''}` : 'No operating costs yet.',
      pl: `Euros per year. Revenue and costs when earned or incurred; the cash lines shift receipts by each plan's payment terms and land funding in the month you chose. Tax ${num1(R.taxRate * 100)}%${S.settings.lossCarry ? ' with loss carry-forward' : ''}.`,
      insights: 'Read before you believe the headline. These sentences change with every number you edit.',
    };
  }
  function footer(R, S) {
    const L = R.N - 1;
    const f = S.funding.length ? S.funding.map(x => `${x.name} ${eur(x.amount)} in ${monthName(x.year, x.month - 1)}`).join(', ') : 'no funding';
    return `Plan years ${R.Y[0]} to ${R.Y[L]}. Opening cash ${eur(v(S.opening.cash))}. Funding: ${f}. ${S.plans.length} plans, ${S.segments.length} customer types, ${S.costs.length} cost lines. Prices are working figures until certification. Every change is saved on the server, so anyone with the password sees the same numbers.`;
  }

  return { MONTHS, UNITS, COST_TYPES, CATEGORIES, FUND_TYPES, v, eur, eurFull, num, num1, pct, uid, esc, sum, years, normalize, layoutOrder, blank, compute, verdict, kpis, insights, segmentMeta, planMeta, costMeta, fundingMeta, blockSubtitles, footer, monthName, roundUp };
});
