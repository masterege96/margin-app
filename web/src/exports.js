import { microToExact, safeCsvCell, today } from './format.js';
import { jobTotals } from './margins.js';
import { state } from './state.js';

function saveFile(filename, type, contents) {
  const url = URL.createObjectURL(new Blob([contents], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export function jobsCsv() {
  const head = ['job_id', 'client_code', 'title', 'status', 'date', 'invoice_ref', 'is_sample', 'billed_usd', 'confirmed_direct_cost_usd', 'estimated_cost_usd', 'contribution_usd', 'margin_pct'];
  const rows = state.jobs.map((j) => {
    const t = jobTotals(j, state.costs);
    return [j.id, j.client_code, j.title, j.status, j.date, j.invoice_ref, j.is_sample, microToExact(t.revenue), microToExact(t.actual), microToExact(t.estimated), microToExact(t.contribution), t.margin == null ? '' : t.margin.toFixed(2)];
  });
  return toCsv(head, rows);
}

export function costsCsv() {
  const head = ['cost_id', 'job_id', 'date', 'kind', 'phase', 'amount_usd', 'label', 'source', 'provider', 'model', 'minutes', 'hourly_rate_usd', 'event_ref', 'retry_of', 'invoice_ref', 'notes'];
  const rows = state.costs.map((c) => [c.id, c.job_id, c.occurred_at, c.kind, c.phase, microToExact(c.amount_micro), c.label, c.source, c.provider, c.model, c.minutes ?? '', c.hourly_rate_micro == null ? '' : microToExact(c.hourly_rate_micro), c.event_ref || '', c.retry_of || '', c.invoice_ref || '', c.notes || '']);
  return toCsv(head, rows);
}

function toCsv(head, rows) {
  return `﻿${[head, ...rows].map((r) => r.map(safeCsvCell).join(',')).join('\r\n')}`;
}

export function downloadCsv(which) {
  saveFile(`jobmargin_${which}_${today()}.csv`, 'text/csv;charset=utf-8', which === 'jobs' ? jobsCsv() : costsCsv());
}

export function downloadBackup() {
  const payload = { exported_at: new Date().toISOString(), workspace: state.workspace, clients: state.clients, jobs: state.jobs, costs: state.costs };
  saveFile(`jobmargin_backup_${today()}.json`, 'application/json;charset=utf-8', JSON.stringify(payload, null, 2));
}
