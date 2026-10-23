// In-memory stand-in for the slice of supabase-js the app uses, for tests and `vite --mode fake`.
// It enforces the real schema's columns, checks and foreign keys (see supabase/migrations), so a
// wrong column name or an invalid row fails here the way it would against Postgres.
// tests/schema-parity.test.js checks COLUMNS against the migrations.

export const COLUMNS = {
  workspaces: ['id', 'name', 'currency', 'created_by', 'created_at', 'updated_at'],
  clients: ['id', 'workspace_id', 'code', 'name', 'notes', 'created_at', 'updated_at'],
  jobs: ['id', 'workspace_id', 'client_id', 'title', 'revenue_micro', 'status', 'job_date', 'invoice_ref', 'notes', 'created_by', 'created_at', 'updated_at', 'is_sample'],
  cost_entries: [
    'id', 'workspace_id', 'job_id', 'kind', 'phase', 'amount_micro', 'label', 'source', 'event_ref', 'provider', 'model',
    'input_tokens', 'output_tokens', 'minutes', 'hourly_rate_micro', 'retry_of', 'invoice_ref', 'notes', 'occurred_on',
    'created_by', 'created_at', 'updated_at',
  ],
};

const KINDS = ['ai', 'api', 'telephony', 'developer', 'review', 'contractor', 'rework', 'other'];
const today = () => new Date().toISOString().slice(0, 10);
let seq = 0;
const uuid = () => `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`;
const fail = (message, code = '23514') => ({ message, code });

function defaults(table, user) {
  const now = new Date(Date.now() + seq).toISOString();
  const base = { id: uuid(), created_at: now, updated_at: now };
  switch (table) {
    case 'workspaces': return { ...base, currency: 'USD', created_by: user };
    case 'clients': return { ...base, name: '', notes: '' };
    case 'jobs': return { ...base, revenue_micro: 0, status: 'in_progress', job_date: today(), invoice_ref: '', notes: '', created_by: user, is_sample: false };
    case 'cost_entries': return { ...base, phase: 'confirmed', source: 'manual', event_ref: null, provider: '', model: '', input_tokens: null, output_tokens: null, minutes: null, hourly_rate_micro: null, retry_of: null, invoice_ref: '', notes: '', occurred_on: today(), created_by: user };
    default: return base;
  }
}

const REQUIRED = {
  workspaces: ['name'],
  clients: ['workspace_id', 'code'],
  jobs: ['workspace_id', 'client_id', 'title'],
  cost_entries: ['workspace_id', 'job_id', 'kind', 'amount_micro', 'label'],
};

function validate(db, table, row) {
  for (const col of REQUIRED[table] || []) {
    if (row[col] == null || row[col] === '') return fail(`null value in column "${col}" of relation "${table}"`, '23502');
  }
  const find = (t, id) => db[t].find((r) => r.id === id);
  if (table === 'workspaces' && row.currency !== 'USD') return fail('currency must be USD');
  if (table === 'clients' && db.clients.some((c) => c.id !== row.id && c.workspace_id === row.workspace_id && c.code === row.code)) {
    return fail('duplicate key value violates unique constraint "clients_workspace_id_code_key"', '23505');
  }
  if (table === 'jobs') {
    if (!Number.isSafeInteger(row.revenue_micro) || row.revenue_micro < 0) return fail('jobs_revenue_micro_check');
    if (!['in_progress', 'review', 'completed'].includes(row.status)) return fail('jobs_status_check');
    if (typeof row.is_sample !== 'boolean') return fail('is_sample must be boolean', '22P02');
    const client = find('clients', row.client_id);
    if (!client || client.workspace_id !== row.workspace_id) return fail('jobs_client_id_workspace_id_fkey', '23503');
  }
  if (table === 'cost_entries') {
    if (!KINDS.includes(row.kind)) return fail('cost_entries_kind_check');
    if (!['estimated', 'confirmed'].includes(row.phase)) return fail('cost_entries_phase_check');
    if (!['manual', 'import', 'openai_usage', 'demo'].includes(row.source)) return fail('cost_entries_source_check');
    if (!Number.isSafeInteger(row.amount_micro) || row.amount_micro < 0) return fail('cost_entries_amount_micro_check');
    if ((row.minutes == null) !== (row.hourly_rate_micro == null)) return fail('minutes and hourly_rate_micro must be set together');
    const job = find('jobs', row.job_id);
    if (!job || job.workspace_id !== row.workspace_id) return fail('cost_entries_job_id_workspace_id_fkey', '23503');
    if (row.retry_of) {
      const orig = find('cost_entries', row.retry_of);
      if (row.kind !== 'ai') return fail('retries must be ai costs');
      if (!orig || orig.job_id !== row.job_id) return fail('cost_entries_retry_of_job_id_fkey', '23503');
    }
    if (row.event_ref && db.cost_entries.some((c) => c.id !== row.id && c.workspace_id === row.workspace_id && c.event_ref === row.event_ref)) {
      return fail('duplicate key value violates unique constraint "cost_entries_event_ref_uidx"', '23505');
    }
  }
  return null;
}

class Query {
  constructor(sb, table) {
    if (!COLUMNS[table]) throw new Error(`relation "${table}" does not exist`);
    Object.assign(this, { sb, table, op: 'select', filters: [], orders: [], cols: null, payload: null, returning: false, mode: 'many' });
  }

  checkCols(cols) {
    const bad = cols.filter((c) => !COLUMNS[this.table].includes(c));
    if (bad.length) this.err = fail(`column ${this.table}.${bad[0]} does not exist`, '42703');
  }

  select(cols = '*') {
    const list = cols === '*' ? null : cols.split(',').map((c) => c.trim());
    if (list) this.checkCols(list);
    if (this.op === 'select') this.cols = list;
    else (this.returning = true), (this.cols = list);
    return this;
  }

  insert(rows) {
    this.op = 'insert';
    this.payload = Array.isArray(rows) ? rows : [rows];
    this.payload.forEach((r) => this.checkCols(Object.keys(r)));
    return this;
  }

  update(patch) {
    this.op = 'update';
    this.payload = patch;
    this.checkCols(Object.keys(patch));
    return this;
  }

  delete() {
    this.op = 'delete';
    return this;
  }

  eq(col, val) {
    this.checkCols([col]);
    this.filters.push((r) => r[col] === val);
    return this;
  }

  in(col, vals) {
    this.checkCols([col]);
    this.filters.push((r) => vals.includes(r[col]));
    return this;
  }

  order(col, { ascending = true } = {}) {
    this.checkCols([col]);
    this.orders.push([col, ascending]);
    return this;
  }

  single() {
    this.mode = 'single';
    return this;
  }

  maybeSingle() {
    this.mode = 'maybe';
    return this;
  }

  project(rows) {
    const out = rows.map((r) => (this.cols ? Object.fromEntries(this.cols.map((c) => [c, r[c]])) : { ...r }));
    if (this.mode === 'many') return { data: out, error: null };
    if (out.length > 1 || (this.mode === 'single' && out.length === 0)) {
      return { data: null, error: fail('JSON object requested, multiple (or no) rows returned', 'PGRST116') };
    }
    return { data: out[0] ?? null, error: null };
  }

  run() {
    if (this.err) return { data: null, error: this.err };
    if (!this.sb._user) return { data: null, error: fail('permission denied (not signed in)', '42501') };
    const db = this.sb._db;
    const rows = db[this.table];
    const match = rows.filter((r) => this.filters.every((f) => f(r)));

    if (this.op === 'select') {
      const sorted = [...match].sort((a, b) => {
        for (const [col, asc] of this.orders) {
          if (a[col] < b[col]) return asc ? -1 : 1;
          if (a[col] > b[col]) return asc ? 1 : -1;
        }
        return 0;
      });
      return this.project(sorted);
    }

    if (this.op === 'insert') {
      const created = [];
      for (const r of this.payload) {
        const row = { ...defaults(this.table, this.sb._user.id), ...r };
        const e = validate(db, this.table, row);
        if (e) return { data: null, error: e };
        rows.push(row);
        created.push(row);
      }
      return this.returning ? this.project(created) : { data: null, error: null };
    }

    if (this.op === 'update') {
      const updated = [];
      for (const r of match) {
        const next = { ...r, ...this.payload, updated_at: new Date().toISOString() };
        const e = validate(db, this.table, next);
        if (e) return { data: null, error: e };
        Object.assign(r, next);
        updated.push(r);
      }
      return this.returning ? this.project(updated) : { data: null, error: null };
    }

    // delete, with the schema's referential actions
    const ids = new Set(match.map((r) => r.id));
    if (this.table === 'clients' && db.jobs.some((j) => ids.has(j.client_id))) {
      return { data: null, error: fail('update or delete on table "clients" violates foreign key constraint', '23503') };
    }
    if (this.table === 'jobs') db.cost_entries = db.cost_entries.filter((c) => !ids.has(c.job_id));
    if (this.table === 'cost_entries') db.cost_entries.forEach((c) => ids.has(c.retry_of) && (c.retry_of = null));
    db[this.table] = db[this.table].filter((r) => !ids.has(r.id));
    return { data: null, error: null };
  }

  then(resolve, reject) {
    return Promise.resolve()
      .then(() => this.run())
      .then(resolve, reject);
  }
}

export function createFakeSupabase({ user = null } = {}) {
  const listeners = new Set();
  const emit = (event) => listeners.forEach((fn) => fn(event, sb._user ? { user: sb._user } : null));
  const sb = {
    _db: { workspaces: [], clients: [], jobs: [], cost_entries: [] },
    _user: user,
    from: (table) => new Query(sb, table),
    auth: {
      async getSession() {
        return { data: { session: sb._user ? { user: sb._user } : null }, error: null };
      },
      onAuthStateChange(fn) {
        listeners.add(fn);
        return { data: { subscription: { unsubscribe: () => listeners.delete(fn) } } };
      },
      async signInWithPassword({ email }) {
        sb._user = { id: '11111111-1111-4111-8111-111111111111', email };
        emit('SIGNED_IN');
        return { data: { session: { user: sb._user } }, error: null };
      },
      async signUp({ email }) {
        sb._user = { id: '11111111-1111-4111-8111-111111111111', email };
        emit('SIGNED_IN');
        return { data: { session: { user: sb._user } }, error: null };
      },
      async signOut() {
        sb._user = null;
        emit('SIGNED_OUT');
        return { error: null };
      },
    },
  };
  return sb;
}

// Used by `vite --mode fake` in place of src/supabase.js.
export const supabase = createFakeSupabase();
