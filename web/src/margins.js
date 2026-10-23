// Margin math, matching the public.job_margins view in Supabase:
// contribution = billed revenue − confirmed direct costs; estimates are kept separate.

export const LOW_MARGIN_PCT = 20;

export const KINDS = {
  ai: { label: 'AI models', color: '#30bc9d' },
  api: { label: 'External API', color: '#377283' },
  telephony: { label: 'Telephony', color: '#5b8fd6' },
  developer: { label: 'Developer hours', color: '#c9824a' },
  review: { label: 'Review time', color: '#e9b86d' },
  contractor: { label: 'Contractors', color: '#9885cb' },
  rework: { label: 'Rework', color: '#d9636c' },
  other: { label: 'Other', color: '#b3c1c7' },
};

/** Cost kinds recorded as minutes × hourly rate. */
export const TIME_KINDS = ['developer', 'review'];

export function marginPct(revenue, contribution) {
  if (!(revenue > 0)) return null;
  return Math.round((10000 * contribution) / revenue) / 100;
}

export function jobTotals(job, costs) {
  let actual = 0;
  let estimated = 0;
  let retries = 0;
  for (const c of costs) {
    if (c.job_id !== job.id) continue;
    if (c.phase === 'confirmed') actual += Number(c.amount_micro);
    else estimated += Number(c.amount_micro);
    if (c.retry_of) retries += 1;
  }
  const revenue = Number(job.revenue_micro) || 0;
  const contribution = revenue - actual;
  return {
    revenue,
    actual,
    estimated,
    contribution,
    projected: contribution - estimated,
    margin: marginPct(revenue, contribution),
    hasEstimate: estimated > 0,
    retries,
  };
}

export function isLowMargin(t) {
  return t.margin != null && t.margin < LOW_MARGIN_PCT;
}

/** A real job counts toward pilot readiness once it is completed with no open estimates. */
export function isReconciled(job, costs) {
  return !job.is_sample && job.status === 'completed' && !jobTotals(job, costs).hasEstimate;
}

export function summarize(jobs, costs) {
  const out = { revenue: 0, actual: 0, estimated: 0, contribution: 0, atRisk: 0, margin: null, count: jobs.length };
  for (const j of jobs) {
    const t = jobTotals(j, costs);
    out.revenue += t.revenue;
    out.actual += t.actual;
    out.estimated += t.estimated;
    out.contribution += t.contribution;
    if (isLowMargin(t)) out.atRisk += 1;
  }
  out.margin = marginPct(out.revenue, out.contribution);
  return out;
}
