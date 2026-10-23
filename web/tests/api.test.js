import { beforeEach, describe, expect, it } from 'vitest';
import seed from '../../data/demo_seed.json';
import { createApi } from '../src/api.js';
import { jobTotals } from '../src/margins.js';
import { createFakeSupabase } from './fake-supabase.js';

let sb;
let api;
let ws;

const jobInput = (over = {}) => ({
  client_code: 'CLIENT-042',
  title: 'Weekly research report',
  revenue_micro: 1_000_000_000,
  status: 'in_progress',
  date: '2026-10-20',
  ...over,
});

beforeEach(async () => {
  sb = createFakeSupabase({ user: { id: 'u1', email: 'owner@agency.test' } });
  api = createApi(sb);
  ws = await api.createWorkspace('Northwind AI');
});

describe('workspaces', () => {
  it('creates and lists the workspace', async () => {
    expect(ws).toMatchObject({ name: 'Northwind AI', currency: 'USD' });
    expect(await api.listWorkspaces()).toHaveLength(1);
  });
});

describe('jobs', () => {
  it('creates a client on first use and reuses it after', async () => {
    await api.createJob(ws.id, jobInput());
    await api.createJob(ws.id, jobInput({ title: 'Second job' }));
    const s = await api.loadState(ws.id);
    expect(s.clients).toHaveLength(1);
    expect(s.jobs.map((j) => j.client_code)).toEqual(['CLIENT-042', 'CLIENT-042']);
    expect(s.jobs[0]).toMatchObject({ date: '2026-10-20', is_sample: false });
  });

  it('updates status and moves a job to another client', async () => {
    const { id } = await api.createJob(ws.id, jobInput());
    await api.updateJob(ws.id, id, { status: 'completed', client_code: 'CLIENT-007' });
    const s = await api.loadState(ws.id);
    expect(s.jobs[0]).toMatchObject({ status: 'completed', client_code: 'CLIENT-007' });
  });

  it('surfaces database errors as messages', async () => {
    await expect(api.createJob(ws.id, jobInput({ status: 'shipped' }))).rejects.toThrow(/status/);
    await expect(api.createJob(ws.id, jobInput({ client_code: '  ' }))).rejects.toThrow(/Client code/);
  });

  it('deletes a job together with its costs', async () => {
    const { id } = await api.createJob(ws.id, jobInput());
    await api.createCost(ws.id, { job_id: id, kind: 'api', phase: 'confirmed', amount_micro: 5, label: 'x', date: '2026-10-20' });
    await api.deleteJob(id);
    const s = await api.loadState(ws.id);
    expect(s.jobs).toHaveLength(0);
    expect(s.costs).toHaveLength(0);
  });
});

describe('costs', () => {
  it('records time-based, retry and estimated costs and computes the margin', async () => {
    const { id: job } = await api.createJob(ws.id, jobInput({ revenue_micro: 300_000_000 }));
    const { id: orig } = await api.createCost(ws.id, { job_id: job, kind: 'ai', phase: 'confirmed', amount_micro: 201_100_000, label: 'Research calls', date: '2026-10-20' });
    await api.createCost(ws.id, { job_id: job, kind: 'ai', phase: 'confirmed', amount_micro: 74_600_000, label: 'Retry', retry_of: orig, date: '2026-10-20' });
    await api.createCost(ws.id, { job_id: job, kind: 'review', phase: 'confirmed', amount_micro: 52_500_000, minutes: 90, hourly_rate_micro: 35_000_000, label: 'QA', date: '2026-10-20' });
    const { id: est } = await api.createCost(ws.id, { job_id: job, kind: 'ai', phase: 'estimated', amount_micro: 25_000_000, label: 'Rerun', date: '2026-10-20' });

    let s = await api.loadState(ws.id);
    expect(jobTotals(s.jobs[0], s.costs)).toMatchObject({ contribution: -28_200_000, estimated: 25_000_000, margin: -9.4, retries: 1 });

    await api.updateCost(est, { label: 'Rerun', amount_micro: 24_000_000, phase: 'confirmed', invoice_ref: 'INV-1', notes: 'checked' });
    s = await api.loadState(ws.id);
    expect(jobTotals(s.jobs[0], s.costs)).toMatchObject({ actual: 352_200_000, estimated: 0 });
  });

  it('rejects a retry that is not an AI cost', async () => {
    const { id: job } = await api.createJob(ws.id, jobInput());
    const { id: orig } = await api.createCost(ws.id, { job_id: job, kind: 'ai', phase: 'confirmed', amount_micro: 1, label: 'a', date: '2026-10-20' });
    await expect(
      api.createCost(ws.id, { job_id: job, kind: 'api', phase: 'confirmed', amount_micro: 1, label: 'b', retry_of: orig, date: '2026-10-20' }),
    ).rejects.toThrow(/retr/);
  });
});

describe('sample data', () => {
  it('loads all sample jobs and costs with retries linked', async () => {
    expect(await api.loadSample(ws.id, seed)).toBe(13);
    const s = await api.loadState(ws.id);
    expect(s.jobs).toHaveLength(13);
    expect(s.costs).toHaveLength(seed.costs.length);
    expect(s.jobs.every((j) => j.is_sample)).toBe(true);
    const retry = s.costs.find((c) => c.label === 'Retry after failed run');
    expect(s.costs.find((c) => c.id === retry.retry_of).label).toBe('Original research calls');
    const job106 = s.jobs.find((j) => j.title === 'Deep research and synthesis');
    expect(jobTotals(job106, s.costs).margin).toBe(-9.4);
  });

  it('clears samples but keeps real jobs and the clients they use', async () => {
    await api.loadSample(ws.id, seed);
    await api.createJob(ws.id, jobInput({ client_code: 'CLIENT-014', title: 'Real job' })); // shares a sample client
    expect(await api.clearSample(ws.id)).toBe(13);
    const s = await api.loadState(ws.id);
    expect(s.jobs.map((j) => j.title)).toEqual(['Real job']);
    expect(s.clients.map((c) => c.code)).toEqual(['CLIENT-014']);
    expect(s.costs).toHaveLength(0);
  });
});
