import { badgeStatus } from './components.js';
import { esc, localDate, microToInput, parseUsdToMicro, pct, shortDate, timeCostMicro, today, usd } from './format.js';
import { icon } from './icons.js';
import { KINDS, TIME_KINDS, jobTotals } from './margins.js';
import { costsForJob, state } from './state.js';
import { InputError, byId, formInput, modalFooter, modalHead, openModal, toast } from './ui.js';

const statusOptions = (cur) =>
  [
    ['in_progress', 'In progress'],
    ['review', 'Needs review'],
    ['completed', 'Completed'],
  ]
    .map(([v, l]) => `<option value="${v}" ${cur === v ? 'selected' : ''}>${l}</option>`)
    .join('');

// ---- Job form ---------------------------------------------------------------

export function openJobForm(jobId = null) {
  const j = state.jobs.find((x) => x.id === jobId);
  const clientList = state.clients.map((c) => `<option value="${esc(c.code)}"></option>`).join('');
  openModal(`${modalHead(j ? 'Edit job' : 'Create a new job', 'Link each customer deliverable to one job.')}
 <form id="jobForm" data-edit-id="${j ? esc(j.id) : ''}" novalidate><div class="modal-body"><div class="form-grid">
 <div class="form-field full required"><label for="f-client_code">Client code</label><input id="f-client_code" name="client_code" list="clientCodes" placeholder="e.g. CLIENT-042" value="${esc(j?.client_code || '')}" required autocomplete="off"><datalist id="clientCodes">${clientList}</datalist><span class="form-help">Pick an existing client or type a new code to create one.</span></div>
 ${formInput('title', 'Job name', j?.title || '', 'text', 'e.g. Weekly research report', 'full required')}
 ${formInput('revenue_usd', 'Billed revenue (USD)', j ? microToInput(j.revenue_micro) : '', 'text', '0.00', 'required')}
 <div class="form-field"><label for="f-status">Status</label><select id="f-status" name="status">${statusOptions(j?.status || 'in_progress')}</select></div>
 ${formInput('date', 'Job date', j?.date || today(), 'date', '', 'required')}
 ${formInput('invoice_ref', 'Invoice reference (optional)', j?.invoice_ref || '', 'text', 'e.g. INV-2026-118')}
 <div class="form-field full"><label for="f-notes">Notes (optional)</label><textarea id="f-notes" name="notes" placeholder="Customer order reference / scope">${esc(j?.notes || '')}</textarea></div>
 <div class="form-field full"><span class="form-help">Revenue is the invoice amount, not cash collected. Add model usage, retries and people costs after creating the job.</span></div>
 </div></div>${modalFooter(j ? 'Save changes' : 'Create job')}</form>`);
}

export function readJobForm(form) {
  const fd = new FormData(form);
  const revenue = parseUsdToMicro(fd.get('revenue_usd'));
  if (!String(fd.get('client_code') || '').trim()) throw new InputError('Client code is required.');
  if (!String(fd.get('title') || '').trim()) throw new InputError('Job name is required.');
  if (revenue == null) throw new InputError('Revenue must be a non-negative amount like 1200 or 99.50.');
  if (!fd.get('date')) throw new InputError('Job date is required.');
  return {
    client_code: String(fd.get('client_code')).trim(),
    title: String(fd.get('title')),
    revenue_micro: revenue,
    status: fd.get('status'),
    date: fd.get('date'),
    invoice_ref: String(fd.get('invoice_ref') || '').trim(),
    notes: String(fd.get('notes') || ''),
  };
}

// ---- New cost form ----------------------------------------------------------

function retryOptions(jobId) {
  return (
    '<option value="">Select a prior AI entry</option>' +
    costsForJob(jobId)
      .filter((c) => c.kind === 'ai')
      .map((c) => `<option value="${esc(c.id)}">${esc(c.label)} (${usd(c.amount_micro, true)})</option>`)
      .join('')
  );
}

export function openCostForm(jobId = null) {
  if (!state.jobs.length) {
    toast('Create a job first.', true);
    openJobForm();
    return;
  }
  const selected = jobId && state.jobs.some((j) => j.id === jobId) ? jobId : state.jobs[0].id;
  const jobOpts = state.jobs
    .map((j) => `<option value="${esc(j.id)}" ${j.id === selected ? 'selected' : ''}>${esc(j.client_code)} · ${esc(j.title)}</option>`)
    .join('');
  const kindOpts = Object.entries(KINDS)
    .map(([k, m]) => `<option value="${k}">${m.label}</option>`)
    .join('');
  openModal(`${modalHead('Add direct cost', 'Assign a model call, API, telephony, people or rework cost to a job.')}
 <form id="costForm" novalidate><div class="modal-body"><div class="form-grid">
 <div class="form-field full"><label for="f-job">Assigned job</label><select id="f-job" name="job_id" required>${jobOpts}</select></div>
 <div class="form-field"><label for="f-kind">Cost type</label><select name="kind" id="f-kind">${kindOpts}</select></div>
 <div class="form-field"><label for="f-phase">Verification status</label><select name="phase" id="f-phase"><option value="confirmed">Confirmed actual</option><option value="estimated">Estimated only</option></select></div>
 ${formInput('label', 'Description', '', 'text', 'e.g. Research retries', 'full required')}
 <div class="form-field" id="moneyField"><label for="f-amount">Cost amount (USD)</label><div class="input-prefix"><span>$</span><input id="f-amount" name="amount_usd" type="text" inputmode="decimal" placeholder="0.00"></div></div>
 <div class="form-field" id="providerField"><label for="f-provider">Provider (optional)</label><input id="f-provider" name="provider" placeholder="OpenAI"></div>
 <div class="form-field" id="modelField"><label for="f-model">Model (optional)</label><input id="f-model" name="model" placeholder="e.g. model ID"></div>
 <div class="form-field" id="minutesField" hidden><label for="f-minutes">Time spent (minutes)</label><input type="text" inputmode="numeric" id="f-minutes" name="minutes" placeholder="90"></div>
 <div class="form-field" id="rateField" hidden><label for="f-hourly">Hourly rate (USD)</label><input type="text" inputmode="decimal" id="f-hourly" name="hourly_rate_usd" placeholder="40"></div>
 ${formInput('date', 'Date', today(), 'date', '', 'required')}
 ${formInput('invoice_ref', 'Bill or timesheet reference (optional)', '', 'text', 'e.g. OpenAI invoice Oct 2026')}
 <div class="form-field full" id="retryToggleField"><label class="check-row"><input type="checkbox" id="retryToggle"> This expense is a retry of an earlier AI call</label></div>
 <div class="form-field full" id="retryField" hidden><label for="f-retry">Original AI cost</label><select id="f-retry" name="retry_of">${retryOptions(selected)}</select><span class="form-help">Retries stay on the same job and are counted separately.</span></div>
 <div class="form-field full"><label for="f-costnotes">Notes (optional)</label><textarea name="notes" id="f-costnotes" placeholder="Rates, or rerun explanation"></textarea></div>
 </div></div>${modalFooter('Save cost')}</form>`);
  updateCostFormFields();
}

export function updateCostFormFields() {
  if (!byId('costForm')) return;
  const kind = byId('f-kind').value;
  const timed = TIME_KINDS.includes(kind);
  byId('moneyField').hidden = timed;
  byId('minutesField').hidden = !timed;
  byId('rateField').hidden = !timed;
  byId('providerField').hidden = !['ai', 'api', 'telephony'].includes(kind);
  byId('modelField').hidden = kind !== 'ai';
  byId('retryToggleField').hidden = kind !== 'ai';
  byId('retryField').hidden = !(kind === 'ai' && byId('retryToggle').checked);
}

export function updateRetryOptions() {
  byId('f-retry').innerHTML = retryOptions(byId('f-job').value);
}

export function readCostForm(form) {
  const fd = new FormData(form);
  const kind = fd.get('kind');
  const label = String(fd.get('label') || '').trim();
  if (!label) throw new InputError('Description is required.');
  if (!fd.get('date')) throw new InputError('Date is required.');
  const out = {
    job_id: fd.get('job_id'),
    kind,
    phase: fd.get('phase'),
    label,
    provider: ['ai', 'api', 'telephony'].includes(kind) ? String(fd.get('provider') || '').trim() : '',
    model: kind === 'ai' ? String(fd.get('model') || '').trim() : '',
    invoice_ref: String(fd.get('invoice_ref') || '').trim(),
    notes: String(fd.get('notes') || ''),
    date: fd.get('date'),
  };
  if (TIME_KINDS.includes(kind)) {
    const minutes = String(fd.get('minutes') || '').trim();
    const rate = parseUsdToMicro(fd.get('hourly_rate_usd'));
    if (!/^\d{1,6}$/.test(minutes)) throw new InputError('Time spent must be a whole number of minutes.');
    if (rate == null) throw new InputError('Hourly rate must be a non-negative amount like 40 or 37.50.');
    out.minutes = Number(minutes);
    out.hourly_rate_micro = rate;
    out.amount_micro = timeCostMicro(out.minutes, rate);
  } else {
    const amount = parseUsdToMicro(fd.get('amount_usd'));
    if (amount == null) throw new InputError('Cost must be a non-negative amount like 12.40 or 0.0035.');
    out.amount_micro = amount;
  }
  if (kind === 'ai' && byId('retryToggle')?.checked) {
    out.retry_of = fd.get('retry_of');
    if (!out.retry_of) throw new InputError('Select the original AI cost this retry belongs to.');
  }
  return out;
}

// ---- Edit / reconcile cost --------------------------------------------------

export function openEditCost(id) {
  const c = state.costs.find((x) => x.id === id);
  if (!c) return;
  const timed = c.minutes != null;
  openModal(`${modalHead(c.phase === 'estimated' ? 'Reconcile cost estimate' : 'Edit direct cost', 'Confirm an actual amount only after checking the bill or timesheet.')}
 <form id="editCostForm" data-id="${esc(c.id)}" novalidate><div class="modal-body"><div class="form-grid">
 ${formInput('label', 'Cost description', c.label, 'text', '', 'full required')}
 ${formInput('amount_usd', 'Cost amount (USD)', microToInput(c.amount_micro), 'text', '', 'required')}
 <div class="form-field"><label for="f-phase">Status</label><select name="phase" id="f-phase"><option value="estimated" ${c.phase === 'estimated' ? 'selected' : ''}>Estimated</option><option value="confirmed" ${c.phase === 'confirmed' ? 'selected' : ''}>Confirmed actual</option></select></div>
 ${formInput('invoice_ref', 'Bill or timesheet reference', c.invoice_ref || '', 'text', 'e.g. OpenAI invoice Oct 2026', 'full')}
 <div class="form-field full"><label for="f-notes">Reconciliation notes</label><textarea name="notes" id="f-notes" placeholder="What you checked this against">${esc(c.notes || '')}</textarea></div>
 </div><p class="fineprint">Source: ${esc(c.source)}${c.event_ref ? ` · Request ref: ${esc(c.event_ref)}` : ''}${timed ? ` · Logged as ${c.minutes} min at ${usd(c.hourly_rate_micro)}/h` : ''}. Every change is kept in the audit log.</p>
 ${c.phase === 'estimated' ? '<div class="reconcile-explainer">Changing to Confirmed moves the amount from pending estimates into actual direct costs. Verify the dollar amount first.</div>' : ''}
 </div><div class="modal-actions" style="justify-content:space-between"><button type="button" class="button button-danger" data-action="delete-cost" data-id="${esc(c.id)}">${icon('trash', 14)} Delete</button><div style="display:flex;gap:8px"><button type="button" class="button button-ghost" data-action="close-modal">Cancel</button><button type="submit" class="button button-accent">Save cost</button></div></div></form>`);
}

export function readEditCostForm(form) {
  const fd = new FormData(form);
  const label = String(fd.get('label') || '').trim();
  const amount = parseUsdToMicro(fd.get('amount_usd'));
  if (!label) throw new InputError('Description is required.');
  if (amount == null) throw new InputError('Cost must be a non-negative amount like 12.40 or 0.0035.');
  return {
    label,
    amount_micro: amount,
    phase: fd.get('phase'),
    invoice_ref: String(fd.get('invoice_ref') || '').trim(),
    notes: String(fd.get('notes') || ''),
  };
}

// ---- Job drawer -------------------------------------------------------------

export function openJobDetails(id) {
  const j = state.jobs.find((x) => x.id === id);
  if (!j) {
    toast('Job not found', true);
    return;
  }
  const t = jobTotals(j, state.costs);
  const cs = costsForJob(j.id)
    .slice()
    .sort((a, b) => b.occurred_at.localeCompare(a.occurred_at));
  const ledger = cs
    .map((c) => {
      const ic = c.retry_of ? 'rotate' : TIME_KINDS.includes(c.kind) ? 'clock' : 'receipt';
      return `<div class="cost-line"><div class="cost-line-icon">${icon(ic, 15)}</div><div class="cost-line-text"><b>${esc(c.label)}</b><small>${esc(KINDS[c.kind]?.label || c.kind)}${c.model ? ` · ${esc(c.model)}` : ''}${c.retry_of ? ' · Retry' : ''} · ${shortDate(c.occurred_at)}</small></div><div class="cost-line-amount"><strong>${usd(c.amount_micro, true)}</strong><small>${c.phase === 'confirmed' ? 'Confirmed' : 'Estimated'}</small></div><button class="edit-mini" data-action="edit-cost" data-id="${esc(c.id)}" aria-label="Edit cost">${icon('edit')}</button></div>`;
    })
    .join('');
  openModal(
    `<div class="drawer-header-block"><div class="drawer-top-row"><span class="eyebrow"><i class="eyebrow-dot"></i>JOB FINANCIALS${j.is_sample ? ' · SAMPLE' : ''}</span><button class="close-btn" data-action="close-modal" aria-label="Close">${icon('x')}</button></div><div class="drawer-job-title">${esc(j.title)}</div><div class="drawer-top-row"><span class="drawer-job-code">${esc(j.client_code)} &nbsp;·&nbsp; ${localDate(j.date)}${j.invoice_ref ? ` &nbsp;·&nbsp; ${esc(j.invoice_ref)}` : ''}</span>${badgeStatus(j.status)}</div></div><div class="drawer-content"><div class="drawer-actions"><div class="drawer-actions-left"><button class="button button-ghost compact" data-action="edit-job" data-id="${esc(j.id)}">${icon('edit', 14)} Edit job</button><button class="button button-dark compact" data-action="new-cost" data-id="${esc(j.id)}">${icon('plus', 14)} Add cost</button></div><button class="button button-danger compact" data-action="delete-job" data-id="${esc(j.id)}" title="Delete this job">${icon('trash', 14)}</button></div><div class="drawer-stats"><div class="drawer-stat"><div class="k">Billed revenue</div><div class="v">${usd(t.revenue)}</div></div><div class="drawer-stat"><div class="k">Confirmed direct costs</div><div class="v">${usd(t.actual)}</div></div><div class="drawer-stat"><div class="k">Contribution · ${pct(t.margin)}</div><div class="v ${t.contribution < 0 ? 'negative' : ''}">${usd(t.contribution)}</div></div><div class="drawer-stat"><div class="k">Pending estimates</div><div class="v">${usd(t.estimated)}</div></div></div><div class="drawer-headline">Execution ledger <span class="label-mini" style="display:inline;font-weight:700">${cs.length} entries</span></div>${ledger || '<div class="empty" style="padding:25px 0">No costs yet. Add model calls or other direct expenses.</div>'}<div class="drawer-note">${t.hasEstimate ? `Projected contribution after pending estimates: <b>${usd(t.projected)}</b>. Not final until costs are reconciled.` : 'Contribution uses confirmed direct costs only.'}<br>Fixed operating overhead, refunds, and taxes are not included.</div><div class="drawer-headline">Job status</div><select class="detail-select" id="jobDetailStatus" data-id="${esc(j.id)}">${statusOptions(j.status)}</select></div>`,
    true,
  );
}
