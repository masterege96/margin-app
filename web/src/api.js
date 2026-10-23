// Data layer: every read and write to Supabase goes through here.
// Row-level security in the database limits each call to the signed-in user's workspaces;
// the workspace_id filters below just keep queries scoped to the workspace on screen.

const JOB_COLS = 'id,workspace_id,client_id,title,revenue_micro,status,job_date,invoice_ref,notes,is_sample,created_at,updated_at';
const COST_COLS =
  'id,workspace_id,job_id,kind,phase,amount_micro,label,source,event_ref,provider,model,input_tokens,output_tokens,minutes,hourly_rate_micro,retry_of,invoice_ref,notes,occurred_on,created_at,updated_at';

function must({ data, error }) {
  if (error) throw new Error(error.message || 'Database request failed');
  return data;
}

function toJob(row, clientsById) {
  return {
    id: row.id,
    client_id: row.client_id,
    client_code: clientsById.get(row.client_id)?.code ?? '—',
    title: row.title,
    revenue_micro: Number(row.revenue_micro),
    status: row.status,
    date: row.job_date,
    invoice_ref: row.invoice_ref,
    notes: row.notes,
    is_sample: row.is_sample,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function toCost(row) {
  return { ...row, amount_micro: Number(row.amount_micro), occurred_at: row.occurred_on };
}

export function createApi(sb) {
  async function clientIdFor(workspaceId, code) {
    const clean = String(code || '').trim();
    if (!clean) throw new Error('Client code is required.');
    const existing = must(
      await sb.from('clients').select('id').eq('workspace_id', workspaceId).eq('code', clean).maybeSingle(),
    );
    if (existing) return existing.id;
    return must(await sb.from('clients').insert({ workspace_id: workspaceId, code: clean }).select('id').single()).id;
  }

  return {
    async listWorkspaces() {
      return must(await sb.from('workspaces').select('id,name,currency').order('created_at'));
    },

    async createWorkspace(name) {
      return must(await sb.from('workspaces').insert({ name: name.trim() }).select('id,name,currency').single());
    },

    async loadState(workspaceId) {
      const [clients, jobs, costs] = await Promise.all([
        sb.from('clients').select('id,code,name').eq('workspace_id', workspaceId).order('code'),
        sb.from('jobs').select(JOB_COLS).eq('workspace_id', workspaceId).order('job_date', { ascending: false }),
        sb.from('cost_entries').select(COST_COLS).eq('workspace_id', workspaceId).order('occurred_on', { ascending: false }),
      ]).then((rs) => rs.map(must));
      const clientsById = new Map(clients.map((c) => [c.id, c]));
      return { clients, jobs: jobs.map((j) => toJob(j, clientsById)), costs: costs.map(toCost) };
    },

    async createJob(workspaceId, input) {
      const client_id = await clientIdFor(workspaceId, input.client_code);
      return must(
        await sb
          .from('jobs')
          .insert({
            workspace_id: workspaceId,
            client_id,
            title: input.title.trim(),
            revenue_micro: input.revenue_micro,
            status: input.status,
            job_date: input.date,
            invoice_ref: input.invoice_ref || '',
            notes: input.notes || '',
          })
          .select('id')
          .single(),
      );
    },

    async updateJob(workspaceId, id, input) {
      const patch = {};
      if (input.client_code !== undefined) patch.client_id = await clientIdFor(workspaceId, input.client_code);
      if (input.title !== undefined) patch.title = input.title.trim();
      if (input.revenue_micro !== undefined) patch.revenue_micro = input.revenue_micro;
      if (input.status !== undefined) patch.status = input.status;
      if (input.date !== undefined) patch.job_date = input.date;
      if (input.invoice_ref !== undefined) patch.invoice_ref = input.invoice_ref;
      if (input.notes !== undefined) patch.notes = input.notes;
      return must(await sb.from('jobs').update(patch).eq('id', id).select('id').single());
    },

    async deleteJob(id) {
      must(await sb.from('jobs').delete().eq('id', id));
    },

    async createCost(workspaceId, input) {
      return must(
        await sb
          .from('cost_entries')
          .insert({
            workspace_id: workspaceId,
            job_id: input.job_id,
            kind: input.kind,
            phase: input.phase,
            amount_micro: input.amount_micro,
            label: input.label.trim(),
            source: 'manual',
            provider: input.provider || '',
            model: input.model || '',
            minutes: input.minutes ?? null,
            hourly_rate_micro: input.hourly_rate_micro ?? null,
            retry_of: input.retry_of || null,
            invoice_ref: input.invoice_ref || '',
            notes: input.notes || '',
            occurred_on: input.date,
          })
          .select('id')
          .single(),
      );
    },

    async updateCost(id, input) {
      const patch = {
        label: input.label.trim(),
        amount_micro: input.amount_micro,
        phase: input.phase,
        invoice_ref: input.invoice_ref || '',
        notes: input.notes || '',
      };
      return must(await sb.from('cost_entries').update(patch).eq('id', id).select('id').single());
    },

    async deleteCost(id) {
      must(await sb.from('cost_entries').delete().eq('id', id));
    },

    /** Copy the fictional demo jobs into this workspace, flagged is_sample. Returns the job count. */
    async loadSample(workspaceId, seed) {
      const codes = [...new Set(seed.jobs.map((j) => j.client_code))];
      const clientIds = {};
      for (const code of codes) clientIds[code] = await clientIdFor(workspaceId, code);

      const jobIds = {};
      for (const j of seed.jobs) {
        const row = must(
          await sb
            .from('jobs')
            .insert({
              workspace_id: workspaceId,
              client_id: clientIds[j.client_code],
              title: j.title,
              revenue_micro: j.revenue_micro,
              status: j.status,
              job_date: j.date,
              notes: 'Fictional sample record',
              is_sample: true,
            })
            .select('id')
            .single(),
        );
        jobIds[j.id] = row.id;
      }

      // Originals first so retries can point at them.
      const costIds = {};
      const ordered = [...seed.costs.filter((c) => !c.retry_of), ...seed.costs.filter((c) => c.retry_of)];
      for (const c of ordered) {
        const row = must(
          await sb
            .from('cost_entries')
            .insert({
              workspace_id: workspaceId,
              job_id: jobIds[c.job_id],
              kind: c.kind,
              phase: c.phase,
              amount_micro: c.amount_micro,
              label: c.label,
              source: 'demo',
              provider: c.kind === 'ai' ? 'OpenAI' : '',
              retry_of: c.retry_of ? costIds[c.retry_of] : null,
              notes: 'Fictional sample cost',
              occurred_on: c.occurred_at,
            })
            .select('id')
            .single(),
        );
        costIds[c.id] = row.id;
      }
      return seed.jobs.length;
    },

    /** Delete sample jobs (their costs cascade) and any client left with no jobs. */
    async clearSample(workspaceId) {
      const sampleJobs = must(await sb.from('jobs').select('id,client_id').eq('workspace_id', workspaceId).eq('is_sample', true));
      if (!sampleJobs.length) return 0;
      must(await sb.from('jobs').delete().in('id', sampleJobs.map((j) => j.id)));
      const remaining = must(await sb.from('jobs').select('client_id').eq('workspace_id', workspaceId));
      const inUse = new Set(remaining.map((j) => j.client_id));
      const orphaned = [...new Set(sampleJobs.map((j) => j.client_id))].filter((id) => !inUse.has(id));
      if (orphaned.length) must(await sb.from('clients').delete().in('id', orphaned));
      return sampleJobs.length;
    },
  };
}
