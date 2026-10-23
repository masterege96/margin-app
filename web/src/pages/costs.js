import { emptyState, header, metric } from '../components.js';
import { esc, shortDate, usd } from '../format.js';
import { icon } from '../icons.js';
import { KINDS } from '../margins.js';
import { state } from '../state.js';

const SOURCE_LABEL = { openai_usage: 'SDK usage', demo: 'Sample', import: 'Import', manual: 'Manual' };

export function costsPage() {
  let cs = state.costs.filter(
    (c) => state.costFilter === 'all' || (state.costFilter === 'estimated' ? c.phase === 'estimated' : c.kind === state.costFilter),
  );
  cs = cs.slice().sort((a, b) => b.occurred_at.localeCompare(a.occurred_at) || b.created_at.localeCompare(a.created_at));
  const actual = state.costs.filter((c) => c.phase === 'confirmed').reduce((a, c) => a + c.amount_micro, 0);
  const est = state.costs.filter((c) => c.phase === 'estimated').reduce((a, c) => a + c.amount_micro, 0);
  const jobsById = new Map(state.jobs.map((j) => [j.id, j]));
  const rows = cs
    .map((c) => {
      const j = jobsById.get(c.job_id);
      return `<tr><td><div class="job-name">${esc(c.label)}</div><div class="job-meta">${shortDate(c.occurred_at)}${c.retry_of ? ' · ↻ Retry' : ''}</div></td><td><div class="job-name">${esc(j ? j.title : 'Unknown job')}</div><div class="job-meta">${esc(j?.client_code || '')}</div></td><td><span class="cost-category ${esc(c.kind)}"><i></i>${esc(KINDS[c.kind]?.label || c.kind)}</span></td><td class="money-cell">${usd(c.amount_micro, true)}</td><td><span class="phase-pill ${esc(c.phase)}">${c.phase === 'confirmed' ? 'Confirmed' : 'Estimated'}</span></td><td><span class="small-tag">${esc(SOURCE_LABEL[c.source] || c.source)}</span></td><td><button class="table-open" data-action="edit-cost" data-id="${esc(c.id)}" type="button" title="Edit or reconcile">${icon('edit', 15)}</button></td></tr>`;
    })
    .join('');
  const opt = (v, label) => `<option value="${v}" ${state.costFilter === v ? 'selected' : ''}>${label}</option>`;
  const kindOptions = Object.entries(KINDS).map(([k, m]) => opt(k, m.label)).join('');
  return (
    header('Execution cost visibility', 'Cost ledger', 'No hidden retries. Every AI call, third-party API, and hour of work tied to a job.', `<button type="button" class="button button-accent" data-action="new-cost">${icon('plus', 15)} Add a cost</button>`) +
    `<div class="metrics-grid">${metric('Confirmed direct costs', usd(actual), 'Included in contribution', 'check-circle')}${metric('Unconfirmed estimates', usd(est), 'Not counted as actual costs', 'clock')}${metric('Ledger entries', state.costs.length, 'Individual cost and retry records', 'receipt')}${metric('Tracked retries', state.costs.filter((c) => c.retry_of).length, 'Linked to their original call', 'rotate')}</div>` +
    `<div class="filters-row"><div class="reconcile-explainer" style="margin:0;flex:1">${icon('circle-help', 14)} &nbsp; Mark an estimate confirmed only after checking it against the provider bill or timesheet.</div><div class="filters-right"><select class="select" id="costTypeFilter" aria-label="Cost type">${opt('all', 'All expenses')}${kindOptions}${opt('estimated', 'Estimated only')}</select><button class="button button-ghost" type="button" data-action="export-costs">${icon('download', 14)} Export</button></div></div>` +
    `<section class="panel full-table-panel"><div class="table-head"><div><h3 class="panel-title">Recorded direct expenses</h3><p class="panel-desc">Confirmed and estimated are deliberately separate</p></div><span class="table-count">${cs.length} entries</span></div>${cs.length ? `<div class="table-scroller"><table class="cost-table"><thead><tr><th>Expense</th><th>Assigned job</th><th>Type</th><th>Amount</th><th>Verification</th><th>Source</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>` : emptyState('No expenses yet', 'Add a model, API, telephony or people cost to a job.')}</section>`
  );
}
