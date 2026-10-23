-- JobMargin core schema: workspaces, members, clients, jobs, cost entries, ingest keys.
-- Money is stored as integer micro-dollars (1 USD = 1,000,000). USD only in v1.
-- Every business row carries workspace_id; row-level security limits access to workspace members.

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Workspaces and membership ------------------------------------------------

create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 120),
  currency text not null default 'USD' check (currency = 'USD'),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.workspace_members (
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'admin', 'member')),
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);
create index workspace_members_user_idx on public.workspace_members (user_id);

-- Security-definer helpers so policies can check membership without recursing into RLS.
create or replace function private.is_member(ws uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.workspace_members m
    where m.workspace_id = ws and m.user_id = (select auth.uid())
  );
$$;

create or replace function private.has_role(ws uuid, roles text[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.workspace_members m
    where m.workspace_id = ws and m.user_id = (select auth.uid()) and m.role = any (roles)
  );
$$;

revoke all on function private.is_member(uuid) from public;
revoke all on function private.has_role(uuid, text[]) from public;
grant execute on function private.is_member(uuid) to authenticated;
grant execute on function private.has_role(uuid, text[]) to authenticated;

-- The user who creates a workspace becomes its owner.
create or replace function private.add_workspace_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.created_by is not null then
    insert into public.workspace_members (workspace_id, user_id, role)
    values (new.id, new.created_by, 'owner');
  end if;
  return new;
end;
$$;

create trigger workspaces_add_owner
  after insert on public.workspaces
  for each row execute function private.add_workspace_owner();

-- Clients and jobs ---------------------------------------------------------

create table public.clients (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  code text not null check (char_length(code) between 1 and 64),
  name text not null default '' check (char_length(name) <= 200),
  notes text not null default '' check (char_length(notes) <= 4000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, code),
  unique (id, workspace_id)
);

create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  client_id uuid not null,
  title text not null check (char_length(title) between 1 and 200),
  revenue_micro bigint not null default 0 check (revenue_micro >= 0),
  status text not null default 'in_progress' check (status in ('in_progress', 'review', 'completed')),
  job_date date not null default current_date,
  invoice_ref text not null default '' check (char_length(invoice_ref) <= 200),
  notes text not null default '' check (char_length(notes) <= 4000),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, workspace_id),
  -- a job's client must belong to the same workspace
  foreign key (client_id, workspace_id) references public.clients (id, workspace_id) on delete restrict
);
create index jobs_workspace_date_idx on public.jobs (workspace_id, job_date desc);
create index jobs_client_idx on public.jobs (client_id, workspace_id);

-- Cost ledger --------------------------------------------------------------

create table public.cost_entries (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  job_id uuid not null,
  kind text not null check (kind in ('ai', 'api', 'telephony', 'developer', 'review', 'contractor', 'rework', 'other')),
  phase text not null default 'confirmed' check (phase in ('estimated', 'confirmed')),
  amount_micro bigint not null check (amount_micro >= 0),
  label text not null check (char_length(label) between 1 and 200),
  source text not null default 'manual' check (source in ('manual', 'import', 'openai_usage', 'demo')),
  event_ref text check (char_length(event_ref) <= 200),
  provider text not null default '' check (char_length(provider) <= 80),
  model text not null default '' check (char_length(model) <= 120),
  input_tokens bigint check (input_tokens >= 0),
  output_tokens bigint check (output_tokens >= 0),
  minutes integer check (minutes >= 0),
  hourly_rate_micro bigint check (hourly_rate_micro >= 0),
  retry_of uuid,
  invoice_ref text not null default '' check (char_length(invoice_ref) <= 200),
  notes text not null default '' check (char_length(notes) <= 4000),
  occurred_on date not null default current_date,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, job_id),
  -- the cost's job must belong to the same workspace
  foreign key (job_id, workspace_id) references public.jobs (id, workspace_id) on delete cascade,
  -- a retry must point at an earlier cost on the same job
  foreign key (retry_of, job_id) references public.cost_entries (id, job_id) on delete set null (retry_of),
  check (retry_of is null or retry_of <> id),
  check (retry_of is null or kind = 'ai'),
  -- time-based costs record both minutes and rate, or neither
  check ((minutes is null) = (hourly_rate_micro is null))
);
-- provider request IDs are ingested once per workspace (idempotent usage events)
create unique index cost_entries_event_ref_uidx on public.cost_entries (workspace_id, event_ref) where event_ref is not null;
create index cost_entries_job_idx on public.cost_entries (job_id, workspace_id);
create index cost_entries_workspace_date_idx on public.cost_entries (workspace_id, occurred_on desc);
create index cost_entries_retry_idx on public.cost_entries (retry_of, job_id) where retry_of is not null;

-- Ingestion API keys (only a SHA-256 hash of the key is stored) ------------

create table public.ingest_keys (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  key_prefix text not null check (char_length(key_prefix) between 6 and 16),
  key_hash text not null unique check (key_hash ~ '^[0-9a-f]{64}$'),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);
create index ingest_keys_workspace_idx on public.ingest_keys (workspace_id);

-- updated_at maintenance
create trigger workspaces_updated_at before update on public.workspaces for each row execute function private.set_updated_at();
create trigger clients_updated_at before update on public.clients for each row execute function private.set_updated_at();
create trigger jobs_updated_at before update on public.jobs for each row execute function private.set_updated_at();
create trigger cost_entries_updated_at before update on public.cost_entries for each row execute function private.set_updated_at();

-- Row-level security -------------------------------------------------------

alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.clients enable row level security;
alter table public.jobs enable row level security;
alter table public.cost_entries enable row level security;
alter table public.ingest_keys enable row level security;

create policy workspaces_select on public.workspaces for select to authenticated
  using (private.is_member(id) or created_by = (select auth.uid()));
create policy workspaces_insert on public.workspaces for insert to authenticated
  with check (created_by = (select auth.uid()));
create policy workspaces_update on public.workspaces for update to authenticated
  using (private.has_role(id, array['owner', 'admin']))
  with check (private.has_role(id, array['owner', 'admin']));
create policy workspaces_delete on public.workspaces for delete to authenticated
  using (private.has_role(id, array['owner']));

-- Owners are created only by the workspace trigger; admins manage everyone else.
create policy members_select on public.workspace_members for select to authenticated
  using (private.is_member(workspace_id));
create policy members_insert on public.workspace_members for insert to authenticated
  with check (private.has_role(workspace_id, array['owner', 'admin']) and role <> 'owner');
create policy members_update on public.workspace_members for update to authenticated
  using (private.has_role(workspace_id, array['owner', 'admin']) and role <> 'owner')
  with check (private.has_role(workspace_id, array['owner', 'admin']) and role <> 'owner');
create policy members_delete on public.workspace_members for delete to authenticated
  using (private.has_role(workspace_id, array['owner', 'admin']) and role <> 'owner');

create policy clients_member_access on public.clients for all to authenticated
  using (private.is_member(workspace_id)) with check (private.is_member(workspace_id));
create policy jobs_member_access on public.jobs for all to authenticated
  using (private.is_member(workspace_id)) with check (private.is_member(workspace_id));
create policy cost_entries_member_access on public.cost_entries for all to authenticated
  using (private.is_member(workspace_id)) with check (private.is_member(workspace_id));
create policy ingest_keys_admin_access on public.ingest_keys for all to authenticated
  using (private.has_role(workspace_id, array['owner', 'admin']))
  with check (private.has_role(workspace_id, array['owner', 'admin']));

-- Signed-out visitors get nothing.
revoke all on public.workspaces, public.workspace_members, public.clients, public.jobs,
  public.cost_entries, public.ingest_keys from anon;
