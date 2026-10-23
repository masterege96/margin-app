import { header, jobTable, metric } from '../components.js';
import { esc, usd } from '../format.js';
import { icon } from '../icons.js';
import { isLowMargin, jobTotals, summarize } from '../margins.js';
import { state } from '../state.js';

export function jobsPage() {
  const term = state.searchTerm.toLowerCase();
  let jobs = state.jobs.filter((j) => {
    if (term && !`${j.title} ${j.client_code} ${j.id}`.toLowerCase().includes(term)) return false;
    if (state.jobFilter === 'risk') return isLowMargin(jobTotals(j, state.costs));
    if (state.jobFilter === 'pending') return jobTotals(j, state.costs).hasEstimate;
    if (state.jobFilter === 'completed') return j.status === 'completed';
    return true;
  });
  if (state.sortJobs === 'margin-asc') {
    const m = (j) => jobTotals(j, state.costs).margin ?? Infinity;
    jobs = jobs.slice().sort((a, b) => m(a) - m(b));
  } else if (state.sortJobs === 'revenue-desc') {
    jobs = jobs.slice().sort((a, b) => b.revenue_micro - a.revenue_micro);
  } else {
    jobs = jobs.slice().sort((a, b) => b.date.localeCompare(a.date));
  }
  const stats = summarize(state.jobs, state.costs);
  const opt = (cur, v, label) => `<option value="${v}" ${cur === v ? 'selected' : ''}>${label}</option>`;
  return (
    header('Revenue allocation', 'Jobs', 'Every customer delivery linked to its invoice and direct execution costs.', `<button type="button" class="button button-accent" data-action="new-job">${icon('plus', 15)} Add a job</button>`) +
    `<div class="metrics-grid">${metric('Tracked jobs', stats.count, 'All current records', 'layers')}${metric('Total billed', usd(stats.revenue), 'Invoice amount, not cash received', 'coins')}${metric('Negative / low margin', stats.atRisk, 'Jobs under 20% contribution margin', 'alert-triangle')}${metric('Pending estimates', usd(stats.estimated), 'Not included in confirmed costs', 'clock')}</div>` +
    `<div class="filters-row"><div class="search-box">${icon('search', 16)}<input id="searchInput" autocomplete="off" type="search" placeholder="Search jobs or clients" value="${esc(state.searchTerm)}" aria-label="Search jobs"></div><div class="filters-right"><select class="select" id="jobStatusFilter" aria-label="Job view">${opt(state.jobFilter, 'all', 'All jobs')}${opt(state.jobFilter, 'completed', 'Completed')}${opt(state.jobFilter, 'risk', 'Low margin')}${opt(state.jobFilter, 'pending', 'Pending estimates')}</select><select class="select" id="jobsSort" aria-label="Sort jobs">${opt(state.sortJobs, 'newest', 'Newest first')}${opt(state.sortJobs, 'margin-asc', 'Lowest margin')}${opt(state.sortJobs, 'revenue-desc', 'Highest revenue')}</select></div></div>` +
    `<section class="panel full-table-panel"><div class="table-head"><div><h3 class="panel-title">Job profitability</h3><p class="panel-desc">Click any row to review its full cost ledger</p></div><span class="table-count">${jobs.length} of ${state.jobs.length} jobs</span></div>${jobTable(jobs)}</section>`
  );
}
