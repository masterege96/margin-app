import { header, jobTable, metric } from '../components.js';
import { esc, isoDay, pct, shortDate, usd } from '../format.js';
import { icon } from '../icons.js';
import { KINDS, isLowMargin, jobTotals, summarize } from '../margins.js';
import { hasSample, state } from '../state.js';

export function periodJobs() {
  const days = state.period === '7d' ? 7 : state.period === '30d' ? 30 : null;
  if (!days) return state.jobs;
  const cutoff = Date.now() - days * 86400000;
  return state.jobs.filter((j) => new Date(`${j.date}T23:59:59`).getTime() >= cutoff);
}

function chartMarkup(jobs) {
  const bins = [];
  const now = new Date();
  now.setHours(12, 0, 0, 0);
  for (let w = 5; w >= 0; w--) {
    const start = new Date(now);
    start.setDate(start.getDate() - 7 * w - 6);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    end.setHours(23, 59, 59, 999);
    bins.push({ start, end, r: 0, c: 0, label: shortDate(isoDay(start)) });
  }
  for (const j of jobs) {
    const d = new Date(`${j.date}T12:00:00`);
    const b = bins.find((x) => d >= x.start && d <= x.end);
    if (b) {
      const t = jobTotals(j, state.costs);
      b.r += t.revenue;
      b.c += t.actual;
    }
  }
  const max = Math.max(1, ...bins.map((b) => Math.max(b.r, b.c)));
  return `<div class="bars-chart" role="img" aria-label="Billed revenue versus confirmed direct costs by week">${bins
    .map(
      (b) =>
        `<div class="bar-slot"><div class="bar-pair"><div class="bar revenue" style="height:${Math.max(1, (b.r / max) * 100)}%" title="Revenue ${usd(b.r)}"></div><div class="bar cost" style="height:${Math.max(1, (b.c / max) * 100)}%" title="Confirmed costs ${usd(b.c)}"></div></div><div class="bar-label">${b.label}</div></div>`,
    )
    .join('')}</div>`;
}

function donutMarkup(jobs) {
  const ids = new Set(jobs.map((j) => j.id));
  const amounts = Object.fromEntries(Object.keys(KINDS).map((k) => [k, 0]));
  for (const c of state.costs) {
    if (c.phase === 'confirmed' && ids.has(c.job_id)) amounts[c.kind] = (amounts[c.kind] || 0) + c.amount_micro;
  }
  const total = Object.values(amounts).reduce((a, b) => a + b, 0);
  let angle = 0;
  const pieces = [];
  for (const [k, meta] of Object.entries(KINDS)) {
    if (amounts[k] <= 0) continue;
    const end = angle + (100 * amounts[k]) / total;
    pieces.push(`${meta.color} ${angle}% ${end}%`);
    angle = end;
  }
  const gradient = pieces.length ? `conic-gradient(${pieces.join(',')})` : '#e9f1f0';
  const rows = Object.entries(KINDS)
    .filter(([k]) => amounts[k] > 0)
    .map(
      ([k, meta]) =>
        `<div class="donut-row"><span><i style="background:${meta.color}"></i>${meta.label}</span><b>${Math.round((100 * amounts[k]) / total)}%</b></div>`,
    )
    .join('');
  return `<div class="donut-flex"><div class="donut" style="background:${gradient}"><div class="donut-hole"><small>Confirmed</small><b>${usd(total)}</b></div></div><div class="donut-key">${rows || '<span class="nothing">No confirmed costs yet</span>'}</div></div>`;
}

function riskMarkup(jobs) {
  const rank = (t) => (t.margin < 0 ? -2 : isLowMargin(t) ? -1 : 0);
  const items = jobs
    .map((j) => ({ j, t: jobTotals(j, state.costs) }))
    .filter(({ t }) => t.revenue > 0 && (isLowMargin(t) || t.hasEstimate))
    .sort((a, b) => rank(a.t) - rank(b.t))
    .slice(0, 3);
  if (!items.length) {
    return `<div class="risk-safe">${icon('check-circle', 24)}<div>No jobs below 20% margin<br>or awaiting cost confirmation.</div></div>`;
  }
  return items
    .map(({ j, t }) => {
      const why =
        t.margin < 0
          ? `Negative contribution: ${usd(t.contribution)}`
          : isLowMargin(t)
            ? `Only ${pct(t.margin)} confirmed margin`
            : `${usd(t.estimated)} still estimated`;
      return `<div class="risk-row"><div class="risk-bullet">${icon('alert-triangle', 14)}</div><div class="risk-text"><strong>${esc(j.title)}</strong><small>${why}</small></div><button class="risk-link" data-action="view-job" data-id="${esc(j.id)}" aria-label="Inspect">${icon('chevron-right', 14)}</button></div>`;
    })
    .join('');
}

export function overviewPage() {
  const jobs = periodJobs();
  const s = summarize(jobs, state.costs);
  const opt = (v, label) => `<option value="${v}" ${state.period === v ? 'selected' : ''}>${label}</option>`;
  const selector = `<select class="select" id="periodFilter" aria-label="Period">${opt('all', 'All time')}${opt('30d', 'Last 30 days')}${opt('7d', 'Last 7 days')}</select>`;
  const intro = !state.jobs.length
    ? '<b>Your workspace is empty.</b> Add a job, or load sample data from Workspace & data to look around first.'
    : hasSample()
      ? '<b>This workspace includes fictional sample jobs.</b> Remove them from Workspace & data before the pilot.'
      : '<b>Live workspace.</b>';
  return (
    header('Financial clarity / Job level', 'Know what every AI job actually earns.', 'One source of truth for revenue, model usage, retries, and direct labor.', selector) +
    `<section class="hero-banner"><div class="hero-main"><div class="hero-label">EVERY CALL. EVERY RETRY. EVERY DOLLAR.</div><h2 class="hero-title">The revenue is visible. Now make the costs visible.</h2><p class="hero-desc">Link every direct cost to its job. Spot margin leakage before another client run turns into a loss.</p></div><div class="hero-right"><span>Contribution margin</span><b>${pct(s.margin)}</b><small>${s.count} tracked jobs</small></div></section>` +
    `<div class="intro-strip"><div class="info-symbol">${icon('circle-help', 16)}</div><p>${intro} Confirmed costs reduce contribution. Estimates are shown separately until reconciled; overhead and taxes are excluded.</p></div>` +
    `<div class="metrics-grid">${metric('Billed revenue', usd(s.revenue), `${s.count} jobs tracked`, 'coins')}${metric('Confirmed direct costs', usd(s.actual), `${usd(s.estimated)} unconfirmed estimate`, 'activity')}${metric('Contribution', usd(s.contribution), 'Revenue minus confirmed direct costs', 'trending-up', s.contribution < 0 ? 'text-negative' : '')}${metric('Contribution margin', pct(s.margin), `<span class="${s.atRisk ? 'negative' : 'positive'}">${s.atRisk} job${s.atRisk === 1 ? '' : 's'} below 20% margin</span>`, 'briefcase', s.margin != null && s.margin < 0 ? 'text-negative' : 'text-green')}</div>` +
    `<div class="bar-section"><section class="panel"><div class="panel-header"><div><h3 class="panel-title">Revenue vs. confirmed costs</h3><p class="panel-desc">Job-date cohorts · last 6 weeks</p></div><div class="legend"><span><i class="green"></i> Revenue</span><span><i class="dark"></i> Direct cost</span></div></div>${chartMarkup(jobs)}</section><section class="panel"><div class="panel-header"><div><h3 class="panel-title">Where the cost goes</h3><p class="panel-desc">Breakdown of confirmed direct expenses</p></div></div>${donutMarkup(jobs)}</section></div>` +
    `<div class="bottom-grid"><section class="panel table-panel"><div class="table-head"><div><h3 class="panel-title">Recent jobs</h3><p class="panel-desc">Financial health, by client deliverable</p></div><button type="button" class="text-action" data-nav="jobs">View all jobs ${icon('arrow-right', 13)}</button></div>${jobTable(jobs.slice(0, 6), true)}</section><section class="health-card"><div class="health-header"><div><h3 class="panel-title">Needs your attention</h3><p class="panel-desc">Losses, thin margins, unreconciled costs</p></div><span class="health-icon">${icon('alert-triangle', 17)}</span></div>${riskMarkup(jobs)}</section></div>`
  );
}
