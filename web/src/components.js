import { esc, pct, shortDate, usd } from './format.js';
import { icon } from './icons.js';
import { jobTotals } from './margins.js';
import { state } from './state.js';

export function statusLabel(s) {
  return s === 'completed' ? 'Completed' : s === 'review' ? 'Needs review' : 'In progress';
}

export function badgeStatus(s) {
  return `<span class="status-pill ${esc(s)}">${statusLabel(s)}</span>`;
}

export function percentageBadge(n) {
  if (n == null) return '<span class="percent-pill">—</span>';
  const cls = n < 0 ? 'neg' : n < 20 ? 'warn' : '';
  return `<span class="percent-pill ${cls}">${n < 0 ? '↓' : '↗'} ${pct(n)}</span>`;
}

export function emptyState(title, desc) {
  return `<div class="empty"><div class="empty-icon">${icon('layers', 25)}</div><strong>${esc(title)}</strong>${esc(desc)}</div>`;
}

export function header(eyebrow, title, desc, right = '') {
  return `<div class="page-head"><div><div class="eyebrow"><i class="eyebrow-dot"></i>${esc(eyebrow)}</div><h1 class="page-title">${esc(title)}</h1><p class="page-subtitle">${esc(desc)}</p></div>${right ? `<div class="page-head-right">${right}</div>` : ''}</div>`;
}

export function metric(label, value, foot, ic, cls = '') {
  return `<section class="metric-card"><div class="metric-top"><span class="metric-label">${esc(label)}</span><span class="metric-icon">${icon(ic, 15)}</span></div><div class="metric-value ${cls}">${value}</div><div class="metric-foot">${foot}</div></section>`;
}

export function jobTable(jobs, compact = false) {
  if (!jobs.length) return emptyState('No matching jobs', 'Add your first job or try a different filter.');
  const heads = compact
    ? '<th>Job</th><th>Revenue</th><th>Direct cost</th><th>Margin</th><th>Status</th><th></th>'
    : '<th>Job / client</th><th>Billed revenue</th><th>Confirmed costs</th><th>Contribution</th><th>Margin</th><th>Status</th><th></th>';
  const rows = jobs
    .map((j) => {
      const t = jobTotals(j, state.costs);
      const meta = `${esc(j.client_code)} · ${shortDate(j.date)}${j.is_sample ? ' · Sample' : ''}${t.hasEstimate ? ' · ⏳ Pending estimates' : ''}`;
      const name = `<div class="job-name">${esc(j.title)}</div><div class="job-meta">${meta}</div>`;
      const cell = compact
        ? name
        : `<div class="job-cell-flex"><span class="detail-monograms">${esc(String(j.client_code).substring(0, 2))}</span><div>${name}</div></div>`;
      return `<tr class="row-link" data-action="view-job" data-id="${esc(j.id)}"><td class="job-cell">${cell}</td><td class="money-cell">${usd(t.revenue)}</td><td>${usd(t.actual)}</td>${compact ? '' : `<td class="money-cell ${t.contribution < 0 ? 'neg' : ''}">${usd(t.contribution)}</td>`}<td>${percentageBadge(t.margin)}</td><td>${badgeStatus(j.status)}</td><td><button class="table-open" type="button" data-action="view-job" data-id="${esc(j.id)}" aria-label="Open job">${icon('chevron-right', 15)}</button></td></tr>`;
    })
    .join('');
  return `<div class="table-scroller"><table class="jobs-table"><thead><tr>${heads}</tr></thead><tbody>${rows}</tbody></table></div>`;
}
