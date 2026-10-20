'use strict';
// Starting numbers for the four dashboards. Internal plan, real cash position (October 2026).
// Everything here is editable in the app; this file only matters on first start.

const YEARS = { start: 2027, count: 5 };

function plans() {
  return [
    { id: 'p1', name: 'NeuroJournal subscription (RUO / wellness)', price: 19, unit: 'month', cost: 7, delay: 0, note: 'Sold to academic researchers under Research Use Only and to healthy or wellness users. €16 a month if billed yearly. Billed through the Axite webstore, no app store commission.' },
    { id: 'p2', name: 'Certified app (Class IIa)', price: 19, unit: 'month', cost: 7, delay: 0, note: 'For people with epilepsy and caregivers. Only sellable after Class IIa certification, targeted 2029.' },
    { id: 'p3', name: 'Research study', price: 15000, unit: 'once', cost: 15000, delay: 1, note: 'Work package inside a research grant, €12K to €18K. Close to cost-neutral: a validation and publication channel more than a profit line.' },
    { id: 'p4', name: 'Clinic, per monitored patient', price: 25, unit: 'month', cost: 7, delay: 2, note: 'Working figure inside a €15 to €40 band. Not set until after MDR certification. Clinics pay slowly: two months assumed.' },
    { id: 'p5', name: 'Pharma pilot', price: 45000, unit: 'once', cost: 15000, delay: 1, note: '€15K setup at signature plus €750 per participant for 40 participants. Price not yet validated with sponsors; no sponsor interviews held.' },
  ];
}

const SEG = {
  researchers: { id: 'c1', name: 'Academic researchers', plan: 'p1', per: 1, perLabel: 'subscriptions each', from: 2027, vol: [15, 40, 60, 60, 60], volLabel: 'Average paying users', market: 0, marketLabel: '', note: '' },
  wellness: { id: 'c1', name: 'Researchers & wellness users', plan: 'p1', per: 1, perLabel: 'subscriptions each', from: 2027, vol: [20, 50, 80, 80, 80], volLabel: 'Average paying users', market: 116430, marketLabel: 'reachable headset owners', note: 'Wearables funnel: Muse, BrainCo, Emotiv, OpenBCI, BrainBit and Neurosity owners still using their headset.' },
  patients: { id: 'c2', name: 'Patients & caregivers', plan: 'p2', per: 1, perLabel: 'subscriptions each', from: 2029, vol: [0, 0, 100, 500, 1500], volLabel: 'Average paying users', market: 0, marketLabel: '', note: 'Cannot start before Class IIa certification. Caregivers are a target group in their own right.' },
  research: { id: 'c3', name: 'Research organisations', plan: 'p3', per: 1, perLabel: 'studies each per year', from: 2027, vol: [5, 6, 6, 4, 4], volLabel: 'Organisations buying', market: 0, marketLabel: '', note: '' },
  clinics: { id: 'c4', name: 'Epilepsy clinics', plan: 'p4', per: 250, perLabel: 'monitored patients each', from: 2029, vol: [0, 0, 3, 12, 30], volLabel: 'Paying centres', market: 390, marketLabel: 'specialist centres (US + EU)', note: 'After MDR certification. SEIN, Swiss Epilepsy Centre and NYU Langone all said they would join a structured pilot.' },
  pharma: { id: 'c5', name: 'Pharma sponsors', plan: 'p5', per: 1, perLabel: 'pilots each per year', from: 2027, vol: [0, 1, 2, 2, 3], volLabel: 'Sponsors', market: 26, marketLabel: 'industry epilepsy trials started in 2025', note: 'Demos only so far, no signed pilots. One closed sale every five weeks is the steady-state target.' },
};
const seg = (k, over = {}) => ({ ...SEG[k], vol: [...SEG[k].vol], ...over });

function costs(route) {
  const sales = route === 'd2c' ? [2000, 5000, 15000, 25000, 35000] : route === 'b2b' ? [2000, 3000, 5000, 6000, 8000] : [2000, 4000, 10000, 15000, 20000];
  const growth = route === 'b2b' ? [0, 0, 1, 3, 4] : [0, 0, 2, 4, 6];
  return [
    { id: 'k1', name: 'Current team', category: 'Team', type: 'fte', values: [4.5, 4.5, 4.5, 4.5, 4.5], salary: 5000, note: 'Founders on management fee, three on payroll, three freelancers: about 4.5 FTE and €22K a month today. Fully loaded monthly cost per FTE.' },
    { id: 'k2', name: 'Business development hire', category: 'Team', type: 'fte', values: [0.5, 1, 1, 1, 1], salary: 7000, note: 'Pharma, CRO and partnership sales. Planned hire, mid-2027.' },
    { id: 'k3', name: 'Regulatory affairs hire', category: 'Team', type: 'fte', values: [0.5, 1, 1, 1, 1], salary: 6500, note: 'Owns the technical file and QMS alongside Qserve.' },
    { id: 'k4', name: 'Growth team after certification', category: 'Team', type: 'fte', values: growth, salary: 5500, note: 'Support, onboarding and clinical success once patients and clinics come on board.' },
    { id: 'k5', name: 'Tools, cloud & office', category: 'Tools, cloud & office', type: 'month', values: [3000, 3500, 4000, 5000, 6000], salary: 0, note: 'Software, cloud outside the per-user cost to serve, office and travel.' },
    { id: 'k6', name: 'MDR certification', category: 'Regulatory & certification', type: 'once', values: [50000, 120000, 80000, 0, 0], salary: 0, note: 'Estimate for Qserve consultancy, Kiwa notified body fees, clinical evaluation and the ISO 13485 audit. Not quoted yet: replace with real quotes.' },
    { id: 'k7', name: 'QMS & post-market surveillance', category: 'Regulatory & certification', type: 'year', values: [0, 0, 30000, 35000, 40000], salary: 0, note: 'Annual surveillance audits, vigilance and PMS once certified.' },
    { id: 'k8', name: 'Sales & marketing', category: 'Sales & marketing', type: 'month', values: sales, salary: 0, note: 'Congresses (EEC, AES), posters, DTRRE membership, paid acquisition for subscriptions. Customer acquisition cost was unmodelled before.' },
    { id: 'k9', name: 'Payment processing & support', category: 'Other', type: 'pct', values: [5, 5, 5, 5, 5], salary: 0, note: 'Webstore payment fees and support labour, both missing from the €7 cost to serve.' },
    { id: 'k10', name: 'Insurance & legal', category: 'Other', type: 'year', values: [8000, 10000, 15000, 15000, 15000], salary: 0, note: 'Cyber and data-liability insurance (needed before the Leiden joint-controllership agreement), contracts, IP housekeeping.' },
  ];
}

function funding() {
  return [
    { id: 'f1', name: 'UNIIQ tranche 2', type: 'equity', amount: 120000, year: 2027, month: 1, note: 'Releases on Milestone III sign-off, 1 January 2027. Slips if the milestone slips.' },
    { id: 'f2', name: 'Seed round', type: 'equity', amount: 1750000, year: 2027, month: 3, note: 'Target €1.5M to €2M in Q1 2027; midpoint used. Must fund the company to certification in 2029 plus the certification itself.' },
    { id: 'f3', name: 'UNIIQ tranche 3', type: 'equity', amount: 110000, year: 2027, month: 7, note: 'Milestone and date not yet set. July 2027 is an assumption.' },
  ];
}

function base(route, segments) {
  return {
    schema: 2,
    years: { ...YEARS },
    opening: { cash: 0, note: '€71K in the bank in August 2026 minus five months of €25K to €30K burn leaves roughly nothing on 1 January 2027. Overwrite with the real balance.' },
    settings: { taxRate: 25.8, lossCarry: true, notes: '' },
    plans: plans(),
    segments,
    costs: costs(route),
    funding: funding(),
    layout: { blocks: ['kpis', 'revenue', 'mix', 'costs', 'pl', 'insights'] },
  };
}

// US route, from the October 2026 US market research. Same shape as an export file.
const USA = require('./usa-seed.json');

function seedDashboards() {
  return [
    {
      name: 'Research & pharma route',
      route: 'B2B',
      description: 'Academic researchers and research organisations first, pharma sponsors as they sign, epilepsy clinics after MDR certification. No consumer marketing.',
      state: base('b2b', [seg('researchers'), seg('research'), seg('pharma'), seg('clinics')]),
    },
    {
      name: 'Direct to consumer route',
      route: 'D2C',
      description: 'Subscriptions only. Researchers and wellness users under Research Use Only until certification, patients and caregivers from 2029. Marketing-led.',
      state: base('d2c', [seg('wellness'), seg('patients')]),
    },
    {
      name: 'Combined',
      route: 'Combined',
      description: 'All customer types together, as in the October 2026 model. Research and pharma pay the bills while certification opens patients and clinics.',
      state: base('all', [seg('wellness'), seg('patients'), seg('research'), seg('clinics'), seg('pharma')]),
    },
    { name: USA.name, route: USA.route, description: USA.description, state: USA.state },
  ];
}

module.exports = { seedDashboards };
