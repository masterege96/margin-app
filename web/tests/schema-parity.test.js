// Runs the real migrations in an in-memory Postgres and checks two things the rest of the
// tests rely on: the fake client's column lists match the schema, and the app's margin math
// matches the database's own job_margins view for every sample job.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { beforeAll, describe, expect, it } from 'vitest';
import seed from '../../data/demo_seed.json';
import { jobTotals } from '../src/margins.js';
import { COLUMNS } from './fake-supabase.js';

const supabaseDir = join(import.meta.dirname, '..', '..', 'supabase');
let db;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(readFileSync(join(supabaseDir, 'tests', 'stub_supabase.sql'), 'utf8'));
  const dir = join(supabaseDir, 'migrations');
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.sql')).sort()) {
    await db.exec(readFileSync(join(dir, f), 'utf8'));
  }
}, 60_000);

describe('schema parity', () => {
  it.each(Object.keys(COLUMNS))('fake columns for %s match the migrations', async (table) => {
    const { rows } = await db.query(
      `select column_name from information_schema.columns where table_schema = 'public' and table_name = $1`,
      [table],
    );
    expect(rows.map((r) => r.column_name).sort()).toEqual([...COLUMNS[table]].sort());
  });
});

describe('margin parity with the job_margins view', () => {
  it('agrees on every sample job', async () => {
    const q = (sql, params) => db.query(sql, params).then((r) => r.rows);
    const [ws] = await q(`insert into public.workspaces (name) values ('Parity') returning id`);
    const clientIds = {};
    for (const code of new Set(seed.jobs.map((j) => j.client_code))) {
      const [c] = await q(`insert into public.clients (workspace_id, code) values ($1, $2) returning id`, [ws.id, code]);
      clientIds[code] = c.id;
    }
    const jobIds = {};
    for (const j of seed.jobs) {
      const [row] = await q(
        `insert into public.jobs (workspace_id, client_id, title, revenue_micro, status, job_date, is_sample)
         values ($1, $2, $3, $4, $5, $6, true) returning id`,
        [ws.id, clientIds[j.client_code], j.title, j.revenue_micro, j.status, j.date],
      );
      jobIds[j.id] = row.id;
    }
    const costIds = {};
    for (const c of [...seed.costs.filter((x) => !x.retry_of), ...seed.costs.filter((x) => x.retry_of)]) {
      const [row] = await q(
        `insert into public.cost_entries (workspace_id, job_id, kind, phase, amount_micro, label, source, retry_of, occurred_on)
         values ($1, $2, $3, $4, $5, $6, 'demo', $7, $8) returning id`,
        [ws.id, jobIds[c.job_id], c.kind, c.phase, c.amount_micro, c.label, c.retry_of ? costIds[c.retry_of] : null, c.occurred_at],
      );
      costIds[c.id] = row.id;
    }

    const view = await q(`select * from public.job_margins`);
    expect(view).toHaveLength(seed.jobs.length);
    for (const j of seed.jobs) {
      const v = view.find((r) => r.job_id === jobIds[j.id]);
      const t = jobTotals(j, seed.costs);
      expect(Number(v.confirmed_cost_micro), j.id).toBe(t.actual);
      expect(Number(v.estimated_cost_micro), j.id).toBe(t.estimated);
      expect(Number(v.contribution_micro), j.id).toBe(t.contribution);
      expect(Number(v.projected_contribution_micro), j.id).toBe(t.projected);
      expect(Number(v.margin_pct), j.id).toBe(t.margin);
      expect(Number(v.retry_count), j.id).toBe(t.retries);
    }
  });
});
