import { describe, expect, it } from 'vitest';
import seed from '../../data/demo_seed.json';
import { isLowMargin, isReconciled, jobTotals, marginPct, summarize } from '../src/margins.js';

const job = (id) => seed.jobs.find((j) => j.id === id);

describe('jobTotals', () => {
  it('matches the hand-checked numbers for demo job 106', () => {
    const t = jobTotals(job('demo-106'), seed.costs);
    expect(t).toMatchObject({
      revenue: 300_000_000,
      actual: 328_200_000,
      estimated: 25_000_000,
      contribution: -28_200_000,
      projected: -53_200_000,
      margin: -9.4,
      hasEstimate: true,
      retries: 1,
    });
    expect(isLowMargin(t)).toBe(true);
  });

  it('gives no margin for a job without revenue', () => {
    const t = jobTotals({ id: 'x', revenue_micro: 0 }, [{ job_id: 'x', phase: 'confirmed', amount_micro: 5 }]);
    expect(t.margin).toBeNull();
    expect(isLowMargin(t)).toBe(false);
  });
});

describe('summarize', () => {
  it('adds up the whole sample workspace', () => {
    const s = summarize(seed.jobs, seed.costs);
    const revenue = seed.jobs.reduce((a, j) => a + j.revenue_micro, 0);
    const confirmed = seed.costs.filter((c) => c.phase === 'confirmed').reduce((a, c) => a + c.amount_micro, 0);
    expect(s.revenue).toBe(revenue);
    expect(s.actual).toBe(confirmed);
    expect(s.contribution).toBe(revenue - confirmed);
    expect(s.margin).toBe(marginPct(revenue, revenue - confirmed));
    expect(s.count).toBe(13);
  });
});

describe('isReconciled', () => {
  it('counts only completed real jobs with no open estimates', () => {
    const costs = [{ job_id: 'a', phase: 'estimated', amount_micro: 1 }];
    expect(isReconciled({ id: 'a', status: 'completed', is_sample: false }, costs)).toBe(false);
    expect(isReconciled({ id: 'b', status: 'completed', is_sample: false }, costs)).toBe(true);
    expect(isReconciled({ id: 'b', status: 'completed', is_sample: true }, costs)).toBe(false);
    expect(isReconciled({ id: 'b', status: 'review', is_sample: false }, costs)).toBe(false);
  });
});
